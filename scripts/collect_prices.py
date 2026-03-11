"""
collect_prices.py  ─  주가·수급 수집
──────────────────────────────────────────────────────────────────────────────
역할:
  - Yahoo Finance에서 주가 수집  →  data/raw/prices_YYYYMMDD_HHMMSS.json
  - DART API에서 수급 추정       →  data/raw/supply_YYYYMMDD_HHMMSS.json
  - 가공 후 공개용 파일 생성     →  data/public/prices.json
                                     data/public/supply.json
                                     data/public/index.json

원칙:
  - raw/ 는 수집한 원본 그대로 저장 (절대 수정하지 않음)
  - 수집 실패 시 기존 public 데이터를 유지 (덮어쓰지 않음)
  - 모든 동작은 로그에 기록
──────────────────────────────────────────────────────────────────────────────
"""

import os
import time
from datetime import datetime, timezone, timedelta

import requests

from utils import (
    get_logger, load_stocks,
    save_raw, save_public,
    load_public_json,
    write_run_summary,
    KST,
)

log = get_logger("collect_prices")

DART_KEY = os.environ.get("DART_API_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


# ════════════════════════════════════════════════════════════════════════════
# 1. Yahoo Finance  ─  주가 수집
# ════════════════════════════════════════════════════════════════════════════

def fetch_yahoo_price(code: str) -> dict | None:
    """
    Yahoo Finance API로 단일 종목 주가를 조회한다.
    실패 시 None 반환 (호출부에서 fallback 처리).
    """
    ticker = f"{code}.KS"
    url    = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    try:
        res  = requests.get(url, params={"interval": "1d", "range": "2d"},
                            headers=HEADERS, timeout=10)
        res.raise_for_status()
        data   = res.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return None

        meta   = result[0].get("meta", {})
        quote  = result[0].get("indicators", {}).get("quote", [{}])[0]
        price  = meta.get("regularMarketPrice")
        prev   = meta.get("chartPreviousClose") or meta.get("previousClose")

        if not price:
            return None

        chg    = round((price - prev) / prev * 100, 2) if prev else 0.0
        opens  = quote.get("open", [])
        highs  = quote.get("high", [])
        lows   = quote.get("low",  [])
        vols   = quote.get("volume", [])

        return {
            "price":  round(price),
            "chg":    chg,
            "open":   round(_last_valid(opens))  if _last_valid(opens)  else None,
            "high":   round(_last_valid(highs))  if _last_valid(highs)  else None,
            "low":    round(_last_valid(lows))   if _last_valid(lows)   else None,
            "vol":    int(_last_valid(vols))     if _last_valid(vols)   else None,
            "prev":   round(prev)                if prev                else None,
            "source": "yahoo_finance",
        }
    except Exception as e:
        log.warning(f"Yahoo 조회 실패 [{code}]: {e}")
        return None


def _last_valid(lst: list):
    for v in reversed(lst or []):
        if v is not None:
            return v
    return None


# ════════════════════════════════════════════════════════════════════════════
# 2. DART API  ─  수급 추정
# ════════════════════════════════════════════════════════════════════════════

def fetch_dart_supply(code: str, corp_code: str) -> dict | None:
    """
    DART 주요주주 변동 공시로 외인 방향을 추정한다.
    DART_API_KEY가 없으면 None 반환.
    """
    if not DART_KEY or not corp_code:
        return None
    try:
        res  = requests.get(
            "https://opendart.fss.or.kr/api/majorstock.json",
            params={"crtfc_key": DART_KEY, "corp_code": corp_code},
            timeout=10
        )
        data = res.json()
        if data.get("status") != "000":
            return None
        items = data.get("list") or []
        if not items:
            return None
        hold_ratio = float(items[0].get("stkqy_irds", 0) or 0)
        return {
            "foreign":     int(hold_ratio * 1e8) if hold_ratio > 0 else -int(abs(hold_ratio) * 1e8),
            "institution": 0,
            "individual":  0,
            "source":      "dart_estimate",
        }
    except Exception as e:
        log.warning(f"DART 수급 조회 실패 [{code}]: {e}")
        return None


# ════════════════════════════════════════════════════════════════════════════
# 3. KOSPI / KOSDAQ 지수 수집
# ════════════════════════════════════════════════════════════════════════════

def fetch_indices() -> dict:
    """KOSPI·KOSDAQ 지수를 수집해 딕셔너리로 반환한다"""
    indices = [
        {"symbol": "^KS11", "name": "KOSPI"},
        {"symbol": "^KQ11", "name": "KOSDAQ"},
    ]
    result = {}
    for idx in indices:
        try:
            res  = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{idx['symbol']}",
                params={"interval": "1d", "range": "2d"},
                headers=HEADERS, timeout=10
            )
            meta       = res.json()["chart"]["result"][0]["meta"]
            price      = meta.get("regularMarketPrice", 0)
            prev_close = meta.get("chartPreviousClose", price)
            chg        = round((price - prev_close) / prev_close * 100, 2) if prev_close else 0
            result[idx["name"]] = {
                "price": round(price, 2),
                "chg":   chg,
            }
            log.info(f"지수 {idx['name']}: {price:,.2f} ({chg:+.2f}%)")
        except Exception as e:
            log.warning(f"지수 수집 실패 [{idx['name']}]: {e}")
        time.sleep(0.2)
    return result


# ════════════════════════════════════════════════════════════════════════════
# 4. 메인 실행
# ════════════════════════════════════════════════════════════════════════════

def main():
    now = datetime.now(KST)
    log.info("=" * 60)
    log.info(f"주가·수급 수집 시작: {now.strftime('%Y-%m-%d %H:%M KST')}")
    log.info("=" * 60)

    stocks = load_stocks()

    # 기존 public 데이터 로드 (수집 실패 종목의 fallback용)
    existing_prices = {s["code"]: s for s in load_public_json("prices.json", [])}
    existing_supply = {s["code"]: s for s in load_public_json("supply.json", [])}

    # ── 수집 ────────────────────────────────────────────────────────────────
    raw_prices = []   # 원본 수집 결과
    raw_supply = []

    ok_prices = 0
    ok_supply = 0

    for stock in stocks:
        code      = stock["code"]
        corp_code = stock.get("dart_corp_code", "")
        log.info(f"▶ {stock['name']} ({code})")

        # 주가
        price_data = fetch_yahoo_price(code)
        if price_data:
            raw_prices.append({
                "code":       code,
                "name":       stock["name"],
                "sector":     stock["sector"],
                "collectedAt": now.isoformat(),
                **price_data,
            })
            ok_prices += 1
            log.info(f"  주가: {price_data['price']:,}원 ({price_data['chg']:+.2f}%)")
        else:
            log.warning(f"  주가 수집 실패 → fallback 사용")

        # 수급
        supply_data = fetch_dart_supply(code, corp_code)
        if supply_data:
            raw_supply.append({
                "code":        code,
                "collectedAt": now.isoformat(),
                **supply_data,
            })
            ok_supply += 1
            log.info(f"  수급: DART 추정 완료")
        else:
            log.debug(f"  수급: fallback 사용")

        time.sleep(0.3)

    # ── 원본 저장 (raw/) ────────────────────────────────────────────────────
    # 원본은 타임스탬프 파일명으로 저장 → 절대 덮어쓰지 않음
    if raw_prices:
        save_raw("prices.json", raw_prices, log)
        log.info(f"원본 주가 저장 완료: {ok_prices}종목")
    if raw_supply:
        save_raw("supply.json", raw_supply, log)
        log.info(f"원본 수급 저장 완료: {ok_supply}종목")

    # ── 공개 데이터 생성 (public/) ──────────────────────────────────────────
    # 수집 데이터 + 기존 fallback 병합 → public에 저장
    raw_prices_map = {s["code"]: s for s in raw_prices}
    raw_supply_map = {s["code"]: s for s in raw_supply}

    public_prices = []
    public_supply = []

    for stock in stocks:
        code = stock["code"]

        # 주가: 새 데이터 우선, 없으면 기존 데이터, 둘 다 없으면 빈 항목
        if code in raw_prices_map:
            public_prices.append(raw_prices_map[code])
        elif code in existing_prices:
            existing_prices[code]["source"] = "cache"
            public_prices.append(existing_prices[code])
        else:
            public_prices.append({
                "code": code, "name": stock["name"],
                "sector": stock["sector"], "price": None,
                "chg": None, "source": "unavailable",
            })

        # 수급: 같은 방식
        if code in raw_supply_map:
            public_supply.append(raw_supply_map[code])
        elif code in existing_supply:
            existing_supply[code]["source"] = "cache"
            public_supply.append(existing_supply[code])
        else:
            public_supply.append({
                "code": code, "foreign": 0,
                "institution": 0, "individual": 0,
                "source": "unavailable",
            })

    # 저장 전 기존 파일 자동 백업됨 (save_public 내부)
    prices_saved = save_public("prices.json", public_prices, log)
    supply_saved = save_public("supply.json", public_supply, log)

    # 지수 수집 및 저장
    indices = fetch_indices()
    if indices:
        save_public("index.json", {
            "updatedAt": now.isoformat(),
            "indices":   indices,
        }, log)

    # ── 실행 요약 기록 ──────────────────────────────────────────────────────
    stats = {
        "total_stocks":   len(stocks),
        "prices_fetched": ok_prices,
        "supply_fetched": ok_supply,
        "prices_saved":   prices_saved,
        "supply_saved":   supply_saved,
    }
    write_run_summary("collect_prices", stats, log)

    log.info("=" * 60)
    log.info(f"완료: 주가 {ok_prices}/{len(stocks)}, 수급 {ok_supply}/{len(stocks)}")
    log.info("=" * 60)


if __name__ == "__main__":
    main()

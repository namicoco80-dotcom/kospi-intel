"""
update_prices.py
주가 + 수급 데이터 수집
→ data/prices.json, data/supply.json 생성

소스 우선순위:
  1. Yahoo Finance (무료, 안정적, 한국 종목 지원)
  2. DART API (재무 데이터 보조)
"""

import os, json, time, re
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

DART_KEY = os.environ.get("DART_API_KEY", "")
KST      = timezone(timedelta(hours=9))
NOW_KST  = datetime.now(KST)
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

STOCKS = [
    {"code": "005930", "name": "삼성전자",       "sector": "반도체"},
    {"code": "000660", "name": "SK하이닉스",      "sector": "반도체"},
    {"code": "035420", "name": "NAVER",           "sector": "IT"},
    {"code": "035720", "name": "카카오",           "sector": "IT"},
    {"code": "051910", "name": "LG화학",           "sector": "화학"},
    {"code": "006400", "name": "삼성SDI",          "sector": "2차전지"},
    {"code": "207940", "name": "삼성바이오로직스", "sector": "바이오"},
    {"code": "068270", "name": "셀트리온",         "sector": "바이오"},
    {"code": "005380", "name": "현대차",           "sector": "자동차"},
    {"code": "000270", "name": "기아",             "sector": "자동차"},
    {"code": "003550", "name": "LG",              "sector": "지주"},
    {"code": "055550", "name": "신한지주",         "sector": "금융"},
    {"code": "105560", "name": "KB금융",           "sector": "금융"},
    {"code": "012330", "name": "현대모비스",       "sector": "자동차"},
    {"code": "028260", "name": "삼성물산",         "sector": "지주"},
    {"code": "066570", "name": "LG전자",           "sector": "전자"},
    {"code": "096770", "name": "SK이노베이션",     "sector": "에너지"},
    {"code": "034730", "name": "SK",              "sector": "지주"},
    {"code": "017670", "name": "SK텔레콤",         "sector": "통신"},
    {"code": "030200", "name": "KT",              "sector": "통신"},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


# ════════════════════════════════════════════════
# 1. Yahoo Finance로 주가 수집
# ════════════════════════════════════════════════

def fetch_yahoo_price(code: str) -> dict | None:
    """Yahoo Finance API로 주가 조회 (한국 종목: {code}.KS)"""
    ticker = f"{code}.KS"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {
        "interval": "1d",
        "range":    "2d",   # 오늘 + 전날 (등락률 계산용)
    }
    try:
        res = requests.get(url, params=params, headers=HEADERS, timeout=10)
        data = res.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return None
        meta = result[0].get("meta", {})
        quote = result[0].get("indicators", {}).get("quote", [{}])[0]

        price      = meta.get("regularMarketPrice")
        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
        opens      = quote.get("open", [])
        highs      = quote.get("high", [])
        lows       = quote.get("low", [])
        volumes    = quote.get("volume", [])

        if not price:
            return None

        chg = round((price - prev_close) / prev_close * 100, 2) if prev_close else 0.0
        open_  = _last_valid(opens)
        high   = _last_valid(highs)
        low    = _last_valid(lows)
        volume = _last_valid(volumes)

        return {
            "price":  round(price),
            "chg":    chg,
            "open":   round(open_)   if open_   else None,
            "high":   round(high)    if high    else None,
            "low":    round(low)     if low     else None,
            "vol":    int(volume)    if volume  else None,
            "prev":   round(prev_close) if prev_close else None,
            "source": "yahoo",
        }
    except Exception as e:
        print(f"  [Yahoo 오류] {code}: {e}")
        return None


def _last_valid(lst: list):
    """리스트에서 마지막 유효한(None 아닌) 값"""
    for v in reversed(lst or []):
        if v is not None:
            return v
    return None


# ════════════════════════════════════════════════
# 2. DART API로 수급 근사치 수집
#    (실제 수급은 한국거래소 유료 API가 필요하므로
#     DART 대주주 변동 공시로 외인/기관 방향만 추정)
# ════════════════════════════════════════════════

def fetch_dart_supply(code: str, corp_code: str) -> dict:
    """DART 주요주주 변동 공시로 외인/기관 방향 추정"""
    if not DART_KEY or not corp_code:
        return {}
    url = "https://opendart.fss.or.kr/api/majorstock.json"
    params = {
        "crtfc_key": DART_KEY,
        "corp_code":  corp_code,
    }
    try:
        res  = requests.get(url, params=params, timeout=10)
        data = res.json()
        if data.get("status") != "000":
            return {}
        items = data.get("list") or []
        if not items:
            return {}
        # 최신 공시 기준 외인 보유율로 방향만 추정
        latest = items[0]
        hold_ratio = float(latest.get("stkqy_irds", 0) or 0)
        return {
            "foreign":     int(hold_ratio * 1e8) if hold_ratio > 0 else -int(abs(hold_ratio) * 1e8),
            "institution": 0,  # DART에서 기관 수급은 별도 API 필요
            "individual":  0,
            "source":      "dart_estimate",
        }
    except:
        return {}


DART_CORP_MAP = {
    "005930": "00126380", "000660": "00164779", "035420": "00261443",
    "035720": "00401731", "051910": "00118804", "006400": "00126362",
    "207940": "01247720", "068270": "00108675", "005380": "00164742",
    "000270": "00120030", "003550": "00108449", "055550": "00110361",
    "105560": "00104205", "012330": "00164788", "028260": "00126464",
    "066570": "00401089", "096770": "00631518", "034730": "00617460",
    "017670": "00173262", "030200": "00210695",
}


# ════════════════════════════════════════════════
# 3. 기존 데이터 로드 (fallback용)
# ════════════════════════════════════════════════

def load_existing(filename: str) -> dict:
    path = DATA_DIR / filename
    if path.exists():
        try:
            items = json.loads(path.read_text(encoding="utf-8"))
            return {item["code"]: item for item in items}
        except:
            pass
    return {}


# ════════════════════════════════════════════════
# 4. 메인 실행
# ════════════════════════════════════════════════

def main():
    print(f"\n{'='*50}")
    print(f"주가 수집 시작: {NOW_KST.strftime('%Y-%m-%d %H:%M KST')}")
    print(f"{'='*50}")

    existing_prices = load_existing("prices.json")
    existing_supply = load_existing("supply.json")

    prices_out = []
    supply_out = []

    for stock in STOCKS:
        code = stock["code"]
        print(f"\n▶ {stock['name']} ({code})")

        # ── 주가 ──────────────────────────────
        price_data = fetch_yahoo_price(code)
        if price_data:
            entry = {
                "code":      code,
                "name":      stock["name"],
                "sector":    stock["sector"],
                **price_data,
                "updatedAt": NOW_KST.isoformat(),
            }
            print(f"  주가: {price_data['price']:,}원 ({price_data['chg']:+.2f}%)")
        else:
            # fallback: 기존 데이터 유지
            entry = existing_prices.get(code, {
                "code": code, "name": stock["name"], "sector": stock["sector"],
                "price": None, "chg": None, "source": "cache",
            })
            print(f"  주가: 수집 실패 → 캐시 사용")
        prices_out.append(entry)

        # ── 수급 ──────────────────────────────
        corp_code   = DART_CORP_MAP.get(code, "")
        supply_data = fetch_dart_supply(code, corp_code)
        if supply_data:
            sup_entry = {"code": code, **supply_data, "updatedAt": NOW_KST.isoformat()}
            print(f"  수급: DART 추정 완료")
        else:
            sup_entry = existing_supply.get(code, {
                "code": code, "foreign": 0, "institution": 0, "individual": 0, "source": "cache",
            })
            print(f"  수급: 캐시 사용")
        supply_out.append(sup_entry)

        time.sleep(0.3)  # 요청 간격

    # ── 저장 ──────────────────────────────────
    (DATA_DIR / "prices.json").write_text(
        json.dumps(prices_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (DATA_DIR / "supply.json").write_text(
        json.dumps(supply_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # KOSPI 지수도 수집
    fetch_index()

    print(f"\n{'='*50}")
    print(f"✅ 주가/수급 수집 완료: {len(prices_out)}종목")
    print(f"{'='*50}\n")


def fetch_index():
    """KOSPI / KOSDAQ 지수 수집"""
    indices = [
        {"symbol": "^KS11", "name": "KOSPI"},
        {"symbol": "^KQ11", "name": "KOSDAQ"},
    ]
    result = {}
    for idx in indices:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{idx['symbol']}"
        try:
            res  = requests.get(url, params={"interval":"1d","range":"2d"}, headers=HEADERS, timeout=10)
            data = res.json()
            meta = data["chart"]["result"][0]["meta"]
            price      = meta.get("regularMarketPrice", 0)
            prev_close = meta.get("chartPreviousClose", price)
            chg        = round((price - prev_close) / prev_close * 100, 2) if prev_close else 0
            result[idx["name"]] = {"price": round(price, 2), "chg": chg}
            print(f"  {idx['name']}: {price:,.2f} ({chg:+.2f}%)")
        except Exception as e:
            print(f"  {idx['name']} 지수 오류: {e}")
        time.sleep(0.2)

    (DATA_DIR / "index.json").write_text(
        json.dumps({"updatedAt": NOW_KST.isoformat(), "indices": result}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


if __name__ == "__main__":
    main()

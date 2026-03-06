#!/usr/bin/env python3
"""
KOSPI 주가 + 수급 자동 수집기
실행: python3 scripts/update_prices.py
외부 라이브러리 불필요 - Python 표준 라이브러리만 사용
생성 파일: prices.json, supply.json
"""

import json, logging, sys, time, urllib.request, urllib.error
from datetime import datetime
from pathlib import Path

# ── 경로 ──
BASE_DIR     = Path(__file__).resolve().parent.parent
PRICES_FILE  = BASE_DIR / "prices.json"
SUPPLY_FILE  = BASE_DIR / "supply.json"
LOG_DIR      = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

# ── 로그 (파일 + 콘솔) ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_DIR / "update.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("updater")

# ── 종목 ──
STOCKS = {
    "005930": "삼성전자",    "000660": "SK하이닉스",   "035420": "NAVER",
    "005380": "현대차",      "068270": "셀트리온",     "051910": "LG화학",
    "006400": "삼성SDI",     "105560": "KB금융",       "034020": "두산에너빌리티",
    "000270": "기아",        "035720": "카카오",       "207940": "삼성바이오로직스",
    "329180": "HD현대중공업","012450": "한화에어로스페이스",
    "247540": "에코프로비엠","042700": "한미반도체",
}
KOSDAQ = {"035720", "247540", "042700", "068270"}


# ════════════════════════════════════════
#  공통 유틸
# ════════════════════════════════════════
def _get(url, timeout=8):
    """HTTP GET → JSON. 실패 시 None."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; KOSPI-Bot/1.0)",
            "Referer":    "https://finance.naver.com",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.debug(f"HTTP 실패: {url[:60]}… {e}")
        return None


def _get_html(url, timeout=8):
    """HTTP GET → HTML 문자열. 실패 시 None."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer":    "https://finance.naver.com",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        log.debug(f"HTML 실패: {url[:60]}… {e}")
        return None


def _vol(v):
    v = int(v or 0)
    return f"{v/1e6:.1f}M" if v > 1e6 else f"{v/1e3:.0f}K" if v > 1e3 else str(v)


def _atomic_save(path: Path, data: dict):
    """JSON을 임시 파일 경유로 원자적 저장"""
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(path)
        return True
    except Exception as e:
        log.error(f"❌ 저장 실패 ({path.name}): {e}")
        tmp.unlink(missing_ok=True)
        return False


# ════════════════════════════════════════
#  주가 수집
# ════════════════════════════════════════
def _entry(price, prev, high, low, open_, vol, src):
    chg = round((price - prev) / prev * 10000) / 100 if prev else 0
    return {
        "price": price, "chg": chg, "basePrice": prev or price,
        "high": str(high), "low": str(low), "open": str(open_),
        "vol": _vol(vol), "dataSource": src,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
    }


def fetch_naver(code):
    d = _get(f"https://polling.finance.naver.com/api/realtime/domestic/stock/{code}")
    if not d: return None
    q = (d.get("datas") or d.get("data") or [None])[0]
    if not q: return None
    def n(*keys):
        for k in keys:
            v = q.get(k)
            if v is not None:
                try: return int(str(v).replace(",", ""))
                except: pass
        return 0
    price = n("closePrice", "cp", "nv", "sv")
    if not price: return None
    return _entry(price, n("prevClosePrice", "pcv", "rf", "pv"),
                  n("highPrice", "hp") or price, n("lowPrice", "lp") or price,
                  n("openPrice", "op") or price, n("accTradeVolume", "aq", "tv"), "live")


def fetch_yahoo(code):
    sfx = ".KQ" if code in KOSDAQ else ".KS"
    d = _get(f"https://query1.finance.yahoo.com/v8/finance/chart/{code}{sfx}?interval=1d&range=1d", 10)
    if not d: return None
    meta = ((d.get("chart") or {}).get("result") or [{}])[0].get("meta", {})
    price = round(meta.get("regularMarketPrice") or 0)
    if not price: return None
    prev = round(meta.get("previousClose") or meta.get("chartPreviousClose") or 0)
    return _entry(price, prev,
                  round(meta.get("regularMarketDayHigh") or price),
                  round(meta.get("regularMarketDayLow")  or price),
                  round(meta.get("regularMarketOpen")    or price),
                  int(meta.get("regularMarketVolume") or 0), "live")


# ════════════════════════════════════════
#  수급 수집  ← 신규 추가
# ════════════════════════════════════════
def fetch_supply_naver(code):
    """
    네이버 금융 investor API로 당일 외국인/기관/개인 순매수 수집.
    단위: 주(株)  — UI에서 억원 표기 시 price × qty / 1e8 로 환산 가능.
    반환: {"foreign": int, "inst": int, "retail": int,
           "f5": ["+",…], "i5": ["+",…], "updatedAt": str}
    """
    # ── 당일 수급 ──
    url_today = (
        f"https://api.finance.naver.com/service/itemSummary.nhn"
        f"?itemcode={code}"
    )
    d = _get(url_today)
    foreign = inst = retail = 0
    if d:
        try:
            foreign = int(d.get("foreignBuyCount",  0) or 0) - int(d.get("foreignSellCount", 0) or 0)
            inst    = int(d.get("institutionBuyCount", 0) or 0) - int(d.get("institutionSellCount", 0) or 0)
        except Exception:
            pass

    # ── 5일 방향 (naver 투자자별 거래 페이지 파싱) ──
    f5 = ["+", "+", "+", "+", "+"]
    i5 = ["+", "+", "+", "+", "+"]
    try:
        html = _get_html(
            f"https://finance.naver.com/item/frgn.naver?code={code}",
            timeout=6
        )
        if html:
            import re
            # 외국인 5일 순매수 수집 (foreignBuy 컬럼)
            vals = re.findall(r'class="num"[^>]*>([\-\+]?[\d,]+)</td>', html)
            # 첫 5개 값으로 방향만 추출
            parsed = []
            for v in vals[:10]:
                try:
                    n = int(v.replace(",", ""))
                    parsed.append("+" if n >= 0 else "−")
                except:
                    pass
            if len(parsed) >= 5:
                f5 = parsed[:5]
    except Exception:
        pass

    retail = -(foreign + inst)  # 개인 = 전체 - 외국인 - 기관

    return {
        "foreign": foreign,
        "inst":    inst,
        "retail":  retail,
        "f5":      f5,
        "i5":      i5,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "dataSource": "live",
    }


def fetch_supply_html_fallback(code):
    """
    네이버 금융 HTML에서 외국인/기관 순매수를 직접 파싱하는 폴백.
    itemSummary API 실패 시 사용.
    """
    import re
    html = _get_html(f"https://finance.naver.com/item/main.naver?code={code}")
    if not html:
        return None

    foreign = inst = 0
    try:
        # 외국인 순매수 패턴
        m = re.search(r'외국인[^<]*<[^>]+>([+-]?[\d,]+)', html)
        if m: foreign = int(m.group(1).replace(",", ""))
        # 기관 순매수 패턴
        m = re.search(r'기관[^<]*<[^>]+>([+-]?[\d,]+)', html)
        if m: inst = int(m.group(1).replace(",", ""))
    except Exception:
        pass

    retail = -(foreign + inst)
    return {
        "foreign": foreign, "inst": inst, "retail": retail,
        "f5": ["+"] * 5, "i5": ["+"] * 5,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "dataSource": "html_parsed",
    }


def update_supply(old_supply: dict) -> dict:
    """모든 종목 수급 데이터 수집 및 반환"""
    log.info("=" * 50)
    log.info("수급 데이터 업데이트 시작")
    log.info("=" * 50)

    new_supply = {}
    ok = fail = 0

    for code, name in STOCKS.items():
        log.info(f"  [{code}] {name} 수급")

        r = fetch_supply_naver(code)

        # API 실패 시 HTML 파싱 폴백
        if not r or (r["foreign"] == 0 and r["inst"] == 0):
            r = fetch_supply_html_fallback(code)
            if r:
                log.info(f"    ⚠️  HTML 폴백 사용")

        if r:
            log.info(
                f"    ✅ 외국인 {r['foreign']:+,}  기관 {r['inst']:+,}  "
                f"개인 {r['retail']:+,}  출처: {r['dataSource']}"
            )
            new_supply[code] = r
            ok += 1
        else:
            # 캐시 유지
            if code in old_supply:
                new_supply[code] = {**old_supply[code], "dataSource": "cached"}
                log.warning(f"    ⚠️  수급 실패 → 캐시 유지")
            else:
                log.error(f"    ❌ 수급 실패 & 캐시 없음 — 기본값 사용")
                new_supply[code] = {
                    "foreign": 0, "inst": 0, "retail": 0,
                    "f5": ["−", "−", "−", "−", "−"],
                    "i5": ["−", "−", "−", "−", "−"],
                    "updatedAt": datetime.now().isoformat(timespec="seconds"),
                    "dataSource": "default",
                }
            fail += 1

        time.sleep(0.4)  # API 차단 방지

    log.info(f"\n수급 완료: ✅ {ok}종목 / ❌ {fail}종목 실패")
    return new_supply


# ════════════════════════════════════════
#  주가 수집 메인
# ════════════════════════════════════════
def update_prices():
    log.info("=" * 50)
    log.info("주가 업데이트 시작")
    log.info("=" * 50)

    old = {}
    if PRICES_FILE.exists():
        try:
            old = json.loads(PRICES_FILE.read_text("utf-8"))
            log.info(f"기존 {len(old)}종목 로드")
        except: pass

    new, ok, fail = {}, 0, []

    for code, name in STOCKS.items():
        log.info(f"  [{code}] {name}")
        r = fetch_naver(code)
        if r: log.info(f"    ✅ 네이버 {r['price']:,}원 {r['chg']:+.2f}%")

        if not r:
            r = fetch_yahoo(code)
            if r: log.info(f"    ✅ Yahoo  {r['price']:,}원 {r['chg']:+.2f}%")

        if not r:
            if code in old:
                r = {**old[code], "dataSource": "cached"}
                log.warning("    ⚠️  실패 → 기존 캐시 유지")
            else:
                fail.append(code)
                log.error("    ❌ 실패 & 캐시 없음")
                continue

        new[code] = r
        ok += 1
        time.sleep(0.3)

    if _atomic_save(PRICES_FILE, new):
        log.info(f"\n✅ prices.json 저장 ({ok}종목)")

    if fail: log.warning(f"주가 실패: {', '.join(fail)}")
    return ok, len(fail)


# ════════════════════════════════════════
#  진입점
# ════════════════════════════════════════
if __name__ == "__main__":
    try:
        # 1. 주가 수집
        price_ok, price_fail = update_prices()

        # 2. 수급 수집 (기존 데이터 로드 후 갱신)
        old_supply = {}
        if SUPPLY_FILE.exists():
            try:
                old_supply = json.loads(SUPPLY_FILE.read_text("utf-8"))
            except: pass

        new_supply = update_supply(old_supply)
        if _atomic_save(SUPPLY_FILE, new_supply):
            log.info(f"✅ supply.json 저장 ({len(new_supply)}종목)")

        # 종료 코드: 주가만 실패 시 1, 정상 0
        sys.exit(0 if price_fail == 0 else 1)

    except Exception as e:
        log.critical(f"치명적 오류: {e}", exc_info=True)
        sys.exit(2)

#!/usr/bin/env python3
"""
KOSPI 주가 + 수급 자동 수집기 (46종목 전체)
실행: python3 scripts/update_prices.py
외부 라이브러리 불필요 - Python 표준 라이브러리만 사용
"""

import json, logging, sys, time, urllib.request, urllib.error
from datetime import datetime
from pathlib import Path

BASE_DIR    = Path(__file__).resolve().parent.parent
PRICES_FILE = BASE_DIR / "prices.json"
SUPPLY_FILE = BASE_DIR / "supply.json"
LOG_DIR     = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

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

# ── 46종목 전체 ──
STOCKS = {
    "005930": "삼성전자",       "000660": "SK하이닉스",      "373220": "LG에너지솔루션",
    "207940": "삼성바이오로직스","005380": "현대차",           "000270": "기아",
    "005490": "POSCO홀딩스",    "068270": "셀트리온",         "105560": "KB금융",
    "055550": "신한지주",       "086790": "하나금융지주",     "316140": "우리금융지주",
    "138040": "메리츠금융지주", "000810": "삼성화재",         "012330": "현대모비스",
    "047810": "한국항공우주",   "064350": "현대로템",         "010140": "삼성중공업",
    "042660": "한화오션",       "267250": "HD현대",           "009830": "한화솔루션",
    "086520": "에코프로",       "096770": "SK이노베이션",     "017670": "SK텔레콤",
    "030200": "KT",             "128940": "한미약품",         "000100": "유한양행",
    "326030": "SK바이오팜",     "097950": "CJ제일제당",       "271560": "오리온",
    "004170": "신세계",         "139480": "이마트",           "032640": "LG유플러스",
    "004020": "현대제철",       "010950": "S-Oil",            "036570": "엔씨소프트",
    "251270": "넷마블",         "051910": "LG화학",           "006400": "삼성SDI",
    "035720": "카카오",         "035420": "NAVER",            "028260": "삼성물산",
    "066570": "LG전자",         "034020": "두산에너빌리티",   "012450": "한화에어로스페이스",
    "010130": "고려아연",
}
KOSDAQ = {"086520", "068270", "326030", "251270", "128940"}

def _get(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; KOSPI-Bot/1.0)",
            "Referer": "https://finance.naver.com",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.debug(f"HTTP 실패: {url[:60]}… {e}")
        return None

def _get_html(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://finance.naver.com",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        log.debug(f"HTML 실패: {url[:60]}… {e}")
        return None

def _vol(v):
    v = int(v or 0)
    return f"{v/1e6:.1f}M" if v > 1e6 else f"{v/1e3:.0f}K" if v > 1e3 else str(v)

def _atomic_save(path, data):
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(path)
        return True
    except Exception as e:
        log.error(f"❌ 저장 실패 ({path.name}): {e}")
        tmp.unlink(missing_ok=True)
        return False

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
                  round(meta.get("regularMarketDayLow") or price),
                  round(meta.get("regularMarketOpen") or price),
                  int(meta.get("regularMarketVolume") or 0), "live")

def fetch_supply_naver(code):
    d = _get(f"https://api.finance.naver.com/service/itemSummary.nhn?itemcode={code}")
    foreign = inst = 0
    if d:
        try:
            foreign = int(d.get("foreignBuyCount", 0) or 0) - int(d.get("foreignSellCount", 0) or 0)
            inst    = int(d.get("institutionBuyCount", 0) or 0) - int(d.get("institutionSellCount", 0) or 0)
        except: pass
    retail = -(foreign + inst)
    return {
        "foreign": foreign, "inst": inst, "retail": retail,
        "f5": ["+"] * 5, "i5": ["+"] * 5,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "dataSource": "live",
    }

def update_prices():
    log.info("=" * 50)
    log.info(f"주가 업데이트 시작 ({len(STOCKS)}종목)")
    log.info("=" * 50)
    old = {}
    if PRICES_FILE.exists():
        try: old = json.loads(PRICES_FILE.read_text("utf-8"))
        except: pass
    new, ok, fail = {}, 0, []
    for code, name in STOCKS.items():
        log.info(f"  [{code}] {name}")
        r = fetch_naver(code)
        if r: log.info(f"    ✅ 네이버 {r['price']:,}원 {r['chg']:+.2f}%")
        if not r:
            r = fetch_yahoo(code)
            if r: log.info(f"    ✅ Yahoo {r['price']:,}원 {r['chg']:+.2f}%")
        if not r:
            if code in old:
                r = {**old[code], "dataSource": "cached"}
                log.warning("    ⚠️ 캐시 유지")
            else:
                fail.append(code); log.error("    ❌ 실패"); continue
        new[code] = r; ok += 1
        time.sleep(0.3)
    if _atomic_save(PRICES_FILE, new):
        log.info(f"✅ prices.json 저장 ({ok}종목)")
    return ok, len(fail)

def update_supply():
    log.info("=" * 50)
    log.info("수급 업데이트 시작")
    log.info("=" * 50)
    old = {}
    if SUPPLY_FILE.exists():
        try: old = json.loads(SUPPLY_FILE.read_text("utf-8"))
        except: pass
    new, ok = {}, 0
    for code, name in STOCKS.items():
        r = fetch_supply_naver(code)
        if r and (r["foreign"] != 0 or r["inst"] != 0):
            new[code] = r; ok += 1
        elif code in old:
            new[code] = {**old[code], "dataSource": "cached"}
        else:
            new[code] = {"foreign": 0, "inst": 0, "retail": 0,
                         "f5": ["+"] * 5, "i5": ["+"] * 5,
                         "updatedAt": datetime.now().isoformat(timespec="seconds"),
                         "dataSource": "default"}
        time.sleep(0.3)
    if _atomic_save(SUPPLY_FILE, new):
        log.info(f"✅ supply.json 저장 ({ok}종목)")

if __name__ == "__main__":
    try:
        update_prices()
        update_supply()
        sys.exit(0)
    except Exception as e:
        log.critical(f"치명적 오류: {e}", exc_info=True)
        sys.exit(2)

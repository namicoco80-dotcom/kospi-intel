#!/usr/bin/env python3
"""
KOSPI 주가 + 수급 + 퀀트 지표 자동 수집기 (46종목)
수집 데이터:
  - 현재가, 등락률, 고가/저가/시가/거래량
  - 52주 고가/저가 (진짜 데이터)
  - 20일 종가 히스토리 (MACD/RSI 계산용)
  - 외국인/기관 당일 수급
실행: python3 scripts/update_prices.py
"""

import json, logging, sys, time, urllib.request, urllib.error, re
from datetime import datetime
from pathlib import Path

BASE_DIR     = Path(__file__).resolve().parent.parent
PRICES_FILE  = BASE_DIR / "prices.json"
SUPPLY_FILE  = BASE_DIR / "supply.json"
QUANT_FILE   = BASE_DIR / "quant.json"
LOG_DIR      = BASE_DIR / "logs"
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

# ── 헬퍼 ──
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

def _get_html(url, timeout=10):
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
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
        return True
    except Exception as e:
        log.error(f"저장 실패 {path}: {e}")
        return False

def _to_int(s):
    try: return int(str(s).replace(",", "").replace(" ", ""))
    except: return 0

# ── 1. 현재가 수집 ──
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

# ── 2. 52주 고가/저가 + 20일 히스토리 (Yahoo Finance) ──
def fetch_history_yahoo(code):
    """
    20일 종가 + 52주 고가/저가 수집
    → MACD, RSI, 모멘텀(12개월) 계산용
    """
    sfx = ".KQ" if code in KOSDAQ else ".KS"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{code}{sfx}?interval=1d&range=1y"
    d = _get(url, timeout=15)
    if not d: return None

    try:
        result = ((d.get("chart") or {}).get("result") or [None])[0]
        if not result: return None
        closes   = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        closes   = [round(c) for c in closes if c]
        if len(closes) < 5: return None

        high52w  = max(closes)
        low52w   = min(closes)
        closes20 = closes[-20:]
        closes_3m = closes[-63:]
        closes_12m = closes

        mom12m = round((closes[-1] - closes[0]) / closes[0] * 100, 2) if len(closes) > 1 else 0
        mom3m  = round((closes[-1] - closes_3m[0]) / closes_3m[0] * 100, 2) if closes_3m else 0

        return {
            "high52w": high52w,
            "low52w":  low52w,
            "closes20": closes20,
            "mom12m":  mom12m,
            "mom3m":   mom3m,
        }
    except Exception as e:
        log.debug(f"히스토리 파싱 실패 {code}: {e}")
        return None

# ── 3. MACD / RSI 실제 계산 ──
def calc_ema(prices, period):
    if len(prices) < period: return None
    k = 2 / (period + 1)
    ema = sum(prices[:period]) / period
    for p in prices[period:]:
        ema = p * k + ema * (1 - k)
    return round(ema, 2)

def calc_macd(closes):
    if len(closes) < 26: return None, None, None
    ema12 = calc_ema(closes, 12)
    ema26 = calc_ema(closes, 26)
    if ema12 is None or ema26 is None: return None, None, None
    macd = round(ema12 - ema26, 2)

    macds = []
    for i in range(9, len(closes)+1):
        e12 = calc_ema(closes[:i], 12)
        e26 = calc_ema(closes[:i], 26)
        if e12 and e26: macds.append(e12 - e26)

    signal = round(calc_ema(macds, 9), 2) if len(macds) >= 9 else macd
    hist   = round(macd - signal, 2)
    return macd, signal, hist

def calc_rsi(closes, period=14):
    if len(closes) < period + 1: return None
    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains  = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period-1) + gains[i]) / period
        avg_loss = (avg_loss * (period-1) + losses[i]) / period

    if avg_loss == 0: return 100.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 2)
  # ── 4. 수급 수집 ──
def fetch_supply_naver(code):
    d = _get(f"https://api.finance.naver.com/service/itemSummary.nhn?itemcode={code}")
    foreign = inst = 0
    if d:
        try:
            foreign = _to_int(d.get("foreignBuyCount", 0)) - _to_int(d.get("foreignSellCount", 0))
            inst    = _to_int(d.get("institutionBuyCount", 0)) - _to_int(d.get("institutionSellCount", 0))
        except:
            pass
    retail = -(foreign + inst)
    return {
        "foreign": foreign,
        "inst": inst,
        "retail": retail,
        "f5": ["+"] * 5,
        "i5": ["+"] * 5,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "dataSource": "live" if (foreign != 0 or inst != 0) else "default",
    }


# ── 5. 퀀트 점수 계산 (서버사이드) ──
def calc_quant_score(code, price_data, hist_data, supply_data):
    """
    5가지 검증 전략으로 서버사이드 퀀트 점수 계산
    모멘텀25 + 52주신고가20 + 외국인수급20 + 가치20 + 기술(MACD+RSI)15
    """
    scores = {}
    details = {}

    cur = price_data.get("price", 0)
    chg = price_data.get("chg", 0)

    # ── 1. 모멘텀 (25점) ──
    mom12 = hist_data.get("mom12m") if hist_data else None
    if mom12 is not None:
        s = (
            25 if mom12 > 30 else
            22 if mom12 > 15 else
            18 if mom12 > 5 else
            14 if mom12 > 0 else
            10 if mom12 > -10 else
            5  if mom12 > -20 else
            2
        )
        scores["momentum"] = s
        details["momentum"] = {
            "val": f"{mom12:+.1f}%",
            "label": "강한상승" if mom12 > 15 else "상승" if mom12 > 0 else "하락",
            "real": True
        }
    else:
        s = (
            18 if chg > 3 else
            15 if chg > 1 else
            12 if chg > 0 else
            8  if chg > -1 else
            5  if chg > -3 else
            2
        )
        scores["momentum"] = s
        details["momentum"] = {
            "val": f"{chg:+.1f}%",
            "label": "당일기준",
            "real": False
        }

    # ── 2. 52주 신고가 (20점) ──
    high52w = hist_data.get("high52w") if hist_data else None
    low52w  = hist_data.get("low52w")  if hist_data else None

    if high52w and low52w and cur and high52w > low52w:

        pos = round((cur - low52w) / (high52w - low52w) * 100)

        near_high = cur >= high52w * 0.95
        breakout  = cur >= high52w * 0.99

        s = (
            20 if breakout else
            17 if near_high else
            14 if pos >= 70 else
            9  if pos >= 50 else
            5  if pos >= 30 else
            2
        )

        scores["high52"] = s
        details["high52"] = {
            "val": f"{pos}%",
            "high52w": high52w,
            "low52w": low52w,
            "label": "신고가돌파" if breakout else "신고가근접" if near_high else f"고가권{pos}%",
            "breakout": breakout,
            "near": near_high,
            "real": True
        }

    else:

        try:
            hi = int(str(price_data.get("high", "0")).replace(",", ""))
            lo = int(str(price_data.get("low", "0")).replace(",", ""))

            pos = round((cur - lo) / (hi - lo) * 100) if hi > lo else 50

        except:
            pos = 50

        s = 14 if pos >= 70 else 9 if pos >= 50 else 5

        scores["high52"] = s
        details["high52"] = {
            "val": f"당일{pos}%",
            "label": "52주데이터없음",
            "real": False
        }

    # ── 3. 외국인 수급 (20점) ──
    f = supply_data.get("foreign", 0) if supply_data else 0
    inst = supply_data.get("inst", 0) if supply_data else 0

    if f > 0 and inst > 0:
        s = 20
        lbl = "쌍끌이매수"

    elif f > 0:
        s = 15
        lbl = "외인매수"

    elif inst > 0:
        s = 12
        lbl = "기관매수"

    elif f < 0 and inst < 0:
        s = 0
        lbl = "쌍매도"

    elif f < 0:
        s = 5
        lbl = "외인매도"

    else:
        s = 10
        lbl = "중립"

    scores["supply"] = s
    details["supply"] = {
        "val": f"외인{f:+,} 기관{inst:+,}",
        "label": lbl,
        "foreign": f,
        "inst": inst,
        "real": True
    }
  # ── 4. 가치 (20점) ──
    # 실제 PBR/ROE 없으므로 기본 중립값
    scores["value"] = 12
    details["value"] = {
        "val": "PBR/ROE 데이터없음",
        "label": "미수집",
        "real": False
    }

    # ── 5. 기술적 지표 (15점) ──
    closes20 = hist_data.get("closes20") if hist_data else None

    if closes20 and len(closes20) >= 14:

        rsi = calc_rsi(closes20)
        macd, signal, hist_macd = calc_macd(closes20)

        rsi_signal = (
            "과매수" if (rsi or 0) > 70 else
            "과매도" if (rsi or 0) < 30 else
            "중립"
        )

        golden_cross = (
            macd is not None and
            signal is not None and
            macd > signal
        )

        macd_signal = (
            "골든크로스"
            if golden_cross
            else "데드크로스"
            if (macd is not None and signal is not None and macd < signal)
            else "중립"
        )

        if golden_cross and (rsi or 0) > 50:
            s = 15
            lbl = "강한매수"

        elif golden_cross or (rsi or 0) > 55:
            s = 12
            lbl = "매수신호"

        elif (rsi or 0) < 30:
            s = 11
            lbl = "과매도반등"

        elif (rsi or 0) > 70:
            s = 5
            lbl = "과열주의"

        else:
            s = 8
            lbl = "중립"

        scores["technical"] = s

        details["technical"] = {
            "rsi": rsi,
            "macd": macd,
            "signal": signal,
            "macd_hist": hist_macd,
            "rsi_signal": rsi_signal,
            "macd_signal": macd_signal,
            "val": f"RSI{rsi} MACD{macd_signal}",
            "label": lbl,
            "real": True
        }

    else:

        scores["technical"] = 8

        details["technical"] = {
            "val": "MACD/RSI 계산불가",
            "label": "데이터부족",
            "real": False
        }

    # ── 총점 계산 ──
    total = sum(scores.values())

    grade = (
        "A" if total >= 80 else
        "B" if total >= 60 else
        "C" if total >= 40 else
        "D"
    )

    # ── 자동 매수 조건 ──
    cond1 = details["high52"].get("near", False) or details["high52"].get("breakout", False)

    cond2 = f > 0

    cond3 = (
        details["technical"].get("macd_signal") == "골든크로스"
        or
        (details["technical"].get("rsi") or 0) >= 50
    )

    cond_mom = (
        (hist_data.get("mom12m", 0) if hist_data else chg) > 0
    )

    auto_buy = cond1 and cond2 and cond3 and cond_mom

    return {
        "code": code,
        "total": total,
        "grade": grade,
        "scores": scores,
        "details": details,
        "autoBuy": auto_buy,
        "conds": {
            "high52near": cond1,
            "foreignBuy": cond2,
            "macdRsi": cond3,
            "momentum": cond_mom
        },
        "updatedAt": datetime.now().isoformat(timespec="seconds")
    }


# ── 메인 실행 ──

def update_prices():

    log.info("=" * 50)
    log.info(f"주가 업데이트 시작 ({len(STOCKS)}종목)")
    log.info("=" * 50)

    old = {}

    if PRICES_FILE.exists():
        try:
            old = json.loads(PRICES_FILE.read_text("utf-8"))
        except:
            pass

    new = {}
    ok = 0
    fail = []

    for code, name in STOCKS.items():

        log.info(f"  [{code}] {name}")

        r = fetch_naver(code)

        if r:
            log.info(f"    ✅ 네이버 {r['price']:,}원 {r['chg']:+.2f}%")

        if not r:

            r = fetch_yahoo(code)

            if r:
                log.info(f"    ✅ Yahoo {r['price']:,}원 {r['chg']:+.2f}%")

        if not r:

            if code in old:

                r = {**old[code], "dataSource": "cached"}

                log.warning("    ⚠️ 캐시 유지")

            else:

                fail.append(code)

                log.error("    ❌ 실패")

                continue

        new[code] = r
        ok += 1

        time.sleep(0.3)

    if _atomic_save(PRICES_FILE, new):

        log.info(f"✅ prices.json 저장 ({ok}종목)")

    return new, ok, fail


def update_supply():

    log.info("=" * 50)
    log.info("수급 업데이트 시작")
    log.info("=" * 50)

    old = {}

    if SUPPLY_FILE.exists():
        try:
            old = json.loads(SUPPLY_FILE.read_text("utf-8"))
        except:
            pass

    new = {}
    ok = 0

    for code, name in STOCKS.items():

        r = fetch_supply_naver(code)

        if r and (r["foreign"] != 0 or r["inst"] != 0):

            new[code] = r
            ok += 1

        elif code in old:

            new[code] = {**old[code], "dataSource": "cached"}

        else:

            new[code] = {
                "foreign": 0,
                "inst": 0,
                "retail": 0,
                "f5": ["+"] * 5,
                "i5": ["+"] * 5,
                "updatedAt": datetime.now().isoformat(timespec="seconds"),
                "dataSource": "default"
            }

        time.sleep(0.3)

    if _atomic_save(SUPPLY_FILE, new):

        log.info(f"✅ supply.json 저장 ({ok}종목)")

    return new


def update_quant(prices, supply):

    log.info("=" * 50)
    log.info("퀀트 지표 업데이트 시작 (52주+MACD+RSI)")
    log.info("=" * 50)

    old = {}

    if QUANT_FILE.exists():
        try:
            old = json.loads(QUANT_FILE.read_text("utf-8"))
        except:
            pass

    new = {}
    ok = 0
    fail = []

    for code, name in STOCKS.items():

        log.info(f"  [{code}] {name} 히스토리 수집")

        hist = fetch_history_yahoo(code)

        if hist:

            log.info(
                f"    ✅ 52주고가:{hist['high52w']:,} "
                f"저가:{hist['low52w']:,} "
                f"모멘텀12M:{hist['mom12m']:+.1f}% "
                f"RSI계산가능:{len(hist['closes20'])}일치"
            )

        else:

            log.warning("    ⚠️ 히스토리 수집 실패 — 캐시 사용")

            if code in old:

                cached = old[code]

                hist = {
                    "high52w": cached.get("details", {}).get("high52", {}).get("high52w"),
                    "low52w": cached.get("details", {}).get("high52", {}).get("low52w"),
                    "closes20": [],
                    "mom12m": 0,
                    "mom3m": 0
                }

        price_data = prices.get(code, {})
        supply_data = supply.get(code, {})

        if not price_data:

            fail.append(code)
            continue

        quant = calc_quant_score(code, price_data, hist, supply_data)

        new[code] = quant

        ok += 1

        g = quant["grade"]
        t = quant["total"]

        ab = "🚀매수신호" if quant["autoBuy"] else ""

        log.info(f"    📊 퀀트:{t}점({g}등급) {ab}")

        time.sleep(0.5)

    if _atomic_save(QUANT_FILE, new):

        log.info(f"✅ quant.json 저장 ({ok}종목, 실패:{len(fail)})")

    return ok


if __name__ == "__main__":

    try:

        prices, ok_p, fail_p = update_prices()

        supply = update_supply()

        if "--quant" in sys.argv or "--full" in sys.argv:

            update_quant(prices, supply)

        else:

            log.info("💡 퀀트 지표는 --quant 옵션으로 실행 (1일 1회 권장)")

        sys.exit(0)

    except Exception as e:

        log.critical(f"치명적 오류: {e}", exc_info=True)

        sys.exit(2)

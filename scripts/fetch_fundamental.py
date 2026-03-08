#!/usr/bin/env python3
"""
KRX OpenAPI로 PBR / ROE / 외국인 5일 수급 수집
생성 파일: fundamental.json, supply5.json
실행: python3 scripts/fetch_fundamental.py
"""

import json, logging, sys, time, urllib.request, urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR  = Path(__file__).resolve().parent.parent
FUND_FILE = BASE_DIR / "fundamental.json"   # PBR, ROE, EPS, PER
SUP5_FILE = BASE_DIR / "supply5.json"       # 외국인 5일 순매수
LOG_DIR   = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "fundamental.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("fundamental")

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

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "http://data.krx.co.kr",
    "Content-Type": "application/x-www-form-urlencoded",
}

def _post(url, data_dict, timeout=15):
    try:
        data = urllib.parse.urlencode(data_dict).encode()
        req  = urllib.request.Request(url, data=data, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.debug(f"POST 실패: {url[:50]} {e}")
        return None

def _get(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://finance.naver.com",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.debug(f"GET 실패: {url[:50]} {e}")
        return None

def _atomic_save(path, data):
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
        return True
    except Exception as e:
        log.error(f"저장 실패 {path}: {e}")
        return False

def _biz_days(n=5):
    """최근 n 영업일 날짜 리스트 (YYYYMMDD)"""
    days = []
    d = datetime.now()
    while len(days) < n:
        d -= timedelta(days=1)
        if d.weekday() < 5:  # 월~금
            days.append(d.strftime("%Y%m%d"))
    return days

# ── 1. KRX PBR / ROE / PER / EPS ──
def fetch_krx_fundamental():
    """
    KRX 주가이익비율 API
    http://data.krx.co.kr → 주식 → 종목시세 → PER/PBR/배당수익률
    """
    today     = datetime.now().strftime("%Y%m%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")

    result = {}
    for date in [today, yesterday]:
        log.info(f"KRX PBR/ROE 수집 시도: {date}")
        resp = _post(
            "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
            {
                "bld":        "dbms/MDC/STAT/standard/MDCSTAT03901",
                "mktId":      "STK",       # KOSPI
                "strtDd":     date,
                "endDd":      date,
                "share":      "1",
                "money":      "1",
                "csvxls_isNo":"false",
            }
        )
        if not resp:
            # KOSDAQ도 시도
            resp = _post(
                "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
                {
                    "bld":        "dbms/MDC/STAT/standard/MDCSTAT03901",
                    "mktId":      "KSQ",   # KOSDAQ
                    "strtDd":     date,
                    "endDd":      date,
                    "share":      "1",
                    "money":      "1",
                    "csvxls_isNo":"false",
                }
            )

        items = (resp or {}).get("output", [])
        if items:
            log.info(f"  ✅ {len(items)}개 종목 수신")
            for item in items:
                code = item.get("ISU_SRT_CD", "").zfill(6)
                if code not in STOCKS:
                    continue
                def _f(k):
                    v = item.get(k, "")
                    try: return float(str(v).replace(",",""))
                    except: return None

                result[code] = {
                    "per":   _f("PER"),
                    "pbr":   _f("PBR"),
                    "eps":   _f("EPS"),
                    "bps":   _f("BPS"),
                    "dvYld": _f("DVD_YLD"),  # 배당수익률
                    "date":  date,
                    "updatedAt": datetime.now().isoformat(timespec="seconds"),
                }
            break  # 성공하면 루프 탈출

    # KOSDAQ 종목 추가 수집
    for date in [today, yesterday]:
        resp = _post(
            "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
            {
                "bld":        "dbms/MDC/STAT/standard/MDCSTAT03901",
                "mktId":      "KSQ",
                "strtDd":     date,
                "endDd":      date,
                "share":      "1",
                "money":      "1",
                "csvxls_isNo":"false",
            }
        )
        items = (resp or {}).get("output", [])
        if items:
            for item in items:
                code = item.get("ISU_SRT_CD", "").zfill(6)
                if code not in STOCKS or code in result:
                    continue
                def _f(k):
                    v = item.get(k, "")
                    try: return float(str(v).replace(",",""))
                    except: return None
                result[code] = {
                    "per":   _f("PER"),
                    "pbr":   _f("PBR"),
                    "eps":   _f("EPS"),
                    "bps":   _f("BPS"),
                    "dvYld": _f("DVD_YLD"),
                    "date":  date,
                    "updatedAt": datetime.now().isoformat(timespec="seconds"),
                }
            break

    # 폴백: 네이버 개별 종목 (KRX 실패 시)
    missing = [c for c in STOCKS if c not in result]
    if missing:
        log.info(f"네이버 폴백 수집: {len(missing)}개")
        for code in missing[:10]:  # 부하 방지: 10개만
            d = _get(f"https://api.finance.naver.com/service/itemSummary.nhn?itemcode={code}")
            if d:
                def _nf(k):
                    v = d.get(k)
                    try: return float(str(v).replace(",",""))
                    except: return None
                result[code] = {
                    "per":   _nf("per"),
                    "pbr":   _nf("pbr"),
                    "eps":   _nf("eps"),
                    "bps":   _nf("bps"),
                    "dvYld": None,
                    "date":  today,
                    "updatedAt": datetime.now().isoformat(timespec="seconds"),
                    "source": "naver",
                }
            time.sleep(0.3)

    log.info(f"PBR/ROE 수집 완료: {len(result)}개")
    return result

# ── 2. 외국인 5일 연속 순매수 ──
def fetch_supply_5days():
    """
    KRX 투자자별 거래실적 (5일)
    → 외국인 5일 연속 순매수 여부 + 방향 배열
    """
    days   = _biz_days(5)
    result = {code: {"f5":[],"i5":[],"f5sum":0,"i5sum":0} for code in STOCKS}

    for date in days:
        log.info(f"수급 5일 수집: {date}")
        resp = _post(
            "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
            {
                "bld":        "dbms/MDC/STAT/standard/MDCSTAT02203",
                "mktId":      "STK",
                "strtDd":     date,
                "endDd":      date,
                "invstTpCd":  "4000",   # 외국인
                "share":      "1",
                "money":      "1",
                "csvxls_isNo":"false",
            }
        )
        items = (resp or {}).get("output", [])
        if not items:
            log.warning(f"  ⚠️ {date} 수급 데이터 없음")
            # 빈 날은 '-' 채움
            for code in STOCKS:
                result[code]["f5"].insert(0, "-")
            continue

        # 당일 외국인 순매수
        day_map = {}
        for item in items:
            code = item.get("ISU_SRT_CD","").zfill(6)
            if code not in STOCKS: continue
            try:
                buy  = int(str(item.get("ASK_TRDVOL","0")).replace(",",""))
                sell = int(str(item.get("BID_TRDVOL","0")).replace(",",""))
                net  = buy - sell
                day_map[code] = net
            except: pass

        for code in STOCKS:
            net = day_map.get(code, 0)
            result[code]["f5"].insert(0, "+" if net > 0 else "-" if net < 0 else "0")
            result[code]["f5sum"] += net

        log.info(f"  ✅ {len(day_map)}개 종목")
        time.sleep(0.5)

    # 5일 연속 순매수 여부 계산
    for code in STOCKS:
        f5 = result[code]["f5"][:5]
        result[code]["f5"] = f5
        result[code]["consecutive_buy"]  = all(d == "+" for d in f5)
        result[code]["consecutive_sell"] = all(d == "-" for d in f5)
        result[code]["buy_days"]  = f5.count("+")
        result[code]["sell_days"] = f5.count("-")
        result[code]["updatedAt"] = datetime.now().isoformat(timespec="seconds")

    return result

# ── 메인 ──
if __name__ == "__main__":
    try:
        log.info("=" * 50)
        log.info("펀더멘털 + 5일수급 수집 시작")
        log.info("=" * 50)

        fund = fetch_krx_fundamental()
        if _atomic_save(FUND_FILE, fund):
            log.info(f"✅ fundamental.json 저장 ({len(fund)}개)")

        sup5 = fetch_supply_5days()
        if _atomic_save(SUP5_FILE, sup5):
            log.info(f"✅ supply5.json 저장 ({len(sup5)}개)")

        # 샘플 출력
        for code in ["005930", "000660", "005380"]:
            f = fund.get(code, {})
            s = sup5.get(code, {})
            log.info(f"  {STOCKS[code]}: PBR={f.get('pbr')} PER={f.get('per')} "
                     f"외인5일={s.get('f5')} 연속매수={s.get('consecutive_buy')}")

        sys.exit(0)
    except Exception as e:
        log.critical(f"치명적 오류: {e}", exc_info=True)
        sys.exit(2)

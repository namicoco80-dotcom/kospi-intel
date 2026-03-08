#!/usr/bin/env python3
"""
KOSPI 뉴스 + Gemini AI 분석 자동화 (46종목)
- 네이버 RSS로 뉴스 수집
- Gemini API로 AI 분석 (무료, 사용자 키 불필요)
- analysis.json 생성 → 앱에서 바로 읽기
"""

import json, logging, sys, time, re, html as html_mod, os
import urllib.request, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_DIR      = Path(__file__).resolve().parent.parent
NEWS_FILE     = BASE_DIR / "news.json"
ANALYSIS_FILE = BASE_DIR / "analysis.json"
LOG_DIR       = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_DIR / "news.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("news")
KST = timezone(timedelta(hours=9))

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# ── 46종목 전체 메타 ──
STOCK_META = {
    "005930": {"name": "삼성전자",        "sector": "반도체",  "themes": ["반도체", "AI"]},
    "000660": {"name": "SK하이닉스",      "sector": "반도체",  "themes": ["반도체", "HBM", "AI"]},
    "373220": {"name": "LG에너지솔루션",  "sector": "2차전지", "themes": ["2차전지", "배터리"]},
    "207940": {"name": "삼성바이오로직스","sector": "바이오",  "themes": ["바이오", "CMO"]},
    "005380": {"name": "현대차",          "sector": "자동차",  "themes": ["자동차", "EV"]},
    "000270": {"name": "기아",            "sector": "자동차",  "themes": ["자동차", "EV"]},
    "005490": {"name": "POSCO홀딩스",     "sector": "철강",    "themes": ["철강", "2차전지소재"]},
    "068270": {"name": "셀트리온",        "sector": "바이오",  "themes": ["바이오", "바이오시밀러"]},
    "105560": {"name": "KB금융",          "sector": "금융",    "themes": ["금융", "은행"]},
    "055550": {"name": "신한지주",        "sector": "금융",    "themes": ["금융", "은행"]},
    "086790": {"name": "하나금융지주",    "sector": "금융",    "themes": ["금융", "은행"]},
    "316140": {"name": "우리금융지주",    "sector": "금융",    "themes": ["금융", "은행"]},
    "138040": {"name": "메리츠금융지주",  "sector": "금융",    "themes": ["금융", "보험"]},
    "000810": {"name": "삼성화재",        "sector": "금융",    "themes": ["금융", "보험"]},
    "012330": {"name": "현대모비스",      "sector": "자동차",  "themes": ["자동차", "부품"]},
    "047810": {"name": "한국항공우주",    "sector": "방산",    "themes": ["방산", "항공"]},
    "064350": {"name": "현대로템",        "sector": "방산",    "themes": ["방산", "K2전차"]},
    "010140": {"name": "삼성중공업",      "sector": "조선",    "themes": ["조선", "LNG"]},
    "042660": {"name": "한화오션",        "sector": "조선",    "themes": ["조선", "방산"]},
    "267250": {"name": "HD현대",          "sector": "조선",    "themes": ["조선", "지주"]},
    "009830": {"name": "한화솔루션",      "sector": "에너지",  "themes": ["태양광", "화학"]},
    "086520": {"name": "에코프로",        "sector": "2차전지", "themes": ["2차전지", "양극재"]},
    "096770": {"name": "SK이노베이션",    "sector": "에너지",  "themes": ["에너지", "배터리"]},
    "017670": {"name": "SK텔레콤",        "sector": "통신",    "themes": ["통신", "AI"]},
    "030200": {"name": "KT",              "sector": "통신",    "themes": ["통신", "AI"]},
    "128940": {"name": "한미약품",        "sector": "바이오",  "themes": ["바이오", "신약"]},
    "000100": {"name": "유한양행",        "sector": "바이오",  "themes": ["바이오", "신약"]},
    "326030": {"name": "SK바이오팜",      "sector": "바이오",  "themes": ["바이오", "신약"]},
    "097950": {"name": "CJ제일제당",      "sector": "식품",    "themes": ["식품", "바이오"]},
    "271560": {"name": "오리온",          "sector": "식품",    "themes": ["식품", "중국소비"]},
    "004170": {"name": "신세계",          "sector": "유통",    "themes": ["유통", "리테일"]},
    "139480": {"name": "이마트",          "sector": "유통",    "themes": ["유통", "리테일"]},
    "032640": {"name": "LG유플러스",      "sector": "통신",    "themes": ["통신"]},
    "004020": {"name": "현대제철",        "sector": "철강",    "themes": ["철강"]},
    "010950": {"name": "S-Oil",           "sector": "에너지",  "themes": ["에너지", "정유"]},
    "036570": {"name": "엔씨소프트",      "sector": "게임",    "themes": ["게임", "AI"]},
    "251270": {"name": "넷마블",          "sector": "게임",    "themes": ["게임"]},
    "051910": {"name": "LG화학",          "sector": "2차전지", "themes": ["2차전지", "화학"]},
    "006400": {"name": "삼성SDI",         "sector": "2차전지", "themes": ["2차전지", "배터리"]},
    "035720": {"name": "카카오",          "sector": "IT",      "themes": ["AI", "IT플랫폼"]},
    "035420": {"name": "NAVER",           "sector": "IT",      "themes": ["AI", "IT플랫폼"]},
    "028260": {"name": "삼성물산",        "sector": "건설",    "themes": ["건설", "지주"]},
    "066570": {"name": "LG전자",          "sector": "전자",    "themes": ["전자", "가전"]},
    "034020": {"name": "두산에너빌리티",  "sector": "에너지",  "themes": ["원전", "SMR"]},
    "012450": {"name": "한화에어로스페이스","sector": "방산",  "themes": ["방산", "우주"]},
    "010130": {"name": "고려아연",        "sector": "소재",    "themes": ["소재", "2차전지"]},
}

KEYWORD_MAP = {}
for code, meta in STOCK_META.items():
    for kw in [meta["name"]] + meta["themes"]:
        if kw not in KEYWORD_MAP:
            KEYWORD_MAP[kw] = code

NAVER_RSS = {
    code: f"https://finance.naver.com/item/news.nhn?code={code}&mode=rss"
    for code in STOCK_META
}

SECTOR_RSS = [
    ("반도체", "https://rss.hankyung.com/board/it.xml"),
    ("바이오",  "https://rss.hankyung.com/board/medical.xml"),
    ("자동차",  "https://rss.hankyung.com/board/industrial.xml"),
    ("방산",   "https://rss.hankyung.com/board/politics.xml"),
]

def _get_html(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="ignore")
    except: return None

def classify_type(title, body):
    combined = title + " " + body
    if any(k in combined for k in ["공시","DART","IR","분기보고서","수주","MOU","계약"]): return "official"
    if any(k in combined for k in ["목표주가","리포트","증권","애널","매수","매도","투자의견"]): return "analyst"
    if any(k in combined for k in ["루머","찌라시","설","소문","전망","예상","관측"]): return "rumor"
    return "news"

def classify_sentiment(title, body):
    pos = ["상승","급등","호재","수주","성장","긍정","돌파","신고가","매수","확대","증가","기대","수익"]
    neg = ["하락","급락","악재","우려","부정","손실","감소","위기","매도","리스크","적자","하회"]
    combined = title + " " + body
    p = sum(1 for k in pos if k in combined)
    n = sum(1 for k in neg if k in combined)
    return "긍정" if p > n else "부정" if n > p else "중립"

def detect_code(title, body):
    combined = title + " " + body
    for kw in sorted(KEYWORD_MAP.keys(), key=len, reverse=True):
        if kw in combined:
            return KEYWORD_MAP[kw]
    return "005930"

def detect_themes(title, body, code):
    base = list(STOCK_META.get(code, {}).get("themes", []))
    extra = {"HBM":"HBM","반도체":"반도체","AI":"AI","SMR":"SMR","원전":"원전",
             "배터리":"2차전지","전기차":"EV","방산":"방산","바이오":"바이오"}
    combined = title + " " + body
    for kw, theme in extra.items():
        if kw in combined and theme not in base:
            base.append(theme)
    return base[:4]

def calc_impact(item_type, sources, sent):
    base = {"official":80,"news":65,"analyst":60,"rumor":50}.get(item_type, 55)
    return min(base + min(sources*3,15) + (8 if sent=="긍정" else 5 if sent=="부정" else 0), 99)

def fetch_rss(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
        root = ET.fromstring(raw)
        items = root.findall(".//item")
        result = []
        for item in items:
            title = (item.findtext("title") or "").strip()
            desc  = (item.findtext("description") or "").strip()
            link  = (item.findtext("link") or "").strip()
            pub   = (item.findtext("pubDate") or "").strip()
            title = html_mod.unescape(re.sub(r"<[^>]+>", "", title))
            desc  = html_mod.unescape(re.sub(r"<[^>]+>", "", desc))[:200]
            if title:
                result.append({"title": title, "body": desc, "link": link, "pubDate": pub})
        return result
    except Exception as e:
        log.debug(f"RSS 실패: {url[:60]}… {e}")
        return []

def parse_time(pub_date):
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(pub_date).astimezone(KST)
        return dt.strftime("%H:%M")
    except:
        return datetime.now(KST).strftime("%H:%M")

def build_news_item(raw, code, uid):
    title = raw["title"]
    body  = raw.get("body", "")
    item_type = classify_type(title, body)
    sent      = classify_sentiment(title, body)
    themes    = detect_themes(title, body, code)
    impact    = calc_impact(item_type, 3, sent)
    urgency   = 1 if impact >= 85 or item_type == "official" else 2 if impact >= 65 else 3
    return {
        "id": uid, "code": code,
        "time": parse_time(raw.get("pubDate", "")),
        "type": item_type, "title": title, "body": body,
        "link": raw.get("link", ""), "sources": 3, "speed": "중간",
        "sent": sent, "score": None, "verdict": None, "detail": None,
        "dartResult": None, "judgment": None, "spreadHistory": [1, 2],
        "urgency": urgency, "impactScore": impact, "themes": themes,
        "relStocks": [], "aiSummary": None, "aiKeywords": None,
        "priceReaction": None, "scoreBreakdown": None,
        "collectedAt": datetime.now(KST).isoformat(timespec="seconds"),
    }

# ── Gemini AI 분석 ──
def gemini_analyze(stocks_summary: list) -> dict:
    """종목별 버핏 스타일 AI 분석 - Gemini 무료 API 사용"""
    if not GEMINI_API_KEY:
        log.warning("⚠️ GEMINI_API_KEY 없음 - AI 분석 스킵")
        return {}

    results = {}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"

    for item in stocks_summary:
        code = item["code"]
        name = item["name"]
        news_titles = item.get("news", [])[:3]
        price_chg = item.get("chg", 0)

        prompt = f"""한국 주식 {name}({code}) 워런 버핏 스타일 투자 분석.
주가변동: {price_chg:+.1f}%
최근 뉴스: {'; '.join(news_titles) if news_titles else '없음'}

JSON만 응답(마크다운 없이):
{{"verdict":"강력보유|매수|분할매수|관망|일부매도|손절검토","confidence":65,"summary":"버핏관점 2문장","buffett_moat":"경제적 해자 평가 1문장","buffett_quote":"버핏스타일 명언","upProb":50,"flatProb":25,"dnProb":25,"stopLoss":"종가기준-8%","target":"종가기준+15%","d1":{{"signal":"관망","up":50,"dn":50}},"w1":{{"signal":"관망","up":55,"dn":45}},"m1":{{"signal":"매수","up":60,"dn":40}},"y1":{{"signal":"매수","up":65,"dn":35}},"detail":"투자 액션 플랜 2문장"}}"""

        body = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 500}
        }).encode("utf-8")

        try:
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read().decode("utf-8"))
            txt = data["candidates"][0]["content"]["parts"][0]["text"]
            txt = re.sub(r"```json|```", "", txt).strip()
            ana = json.loads(txt)
            ana["_generatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
            results[code] = ana
            log.info(f"  ✅ {name} AI 분석 완료: {ana.get('verdict','?')}")
        except Exception as e:
            log.warning(f"  ⚠️ {name} AI 분석 실패: {e}")

        time.sleep(1.5)  # Gemini 무료 티어 rate limit (분당 15회)

    return results

def fetch_all_news(old_ids):
    items = []
    uid_counter = int(datetime.now().timestamp() * 1000)
    seen_titles = set()

    for code, url in NAVER_RSS.items():
        raws = fetch_rss(url)
        added = 0
        for raw in raws[:5]:
            title = raw["title"]
            if title in seen_titles: continue
            seen_titles.add(title)
            item = build_news_item(raw, code, uid_counter)
            uid_counter += 1
            items.append(item)
            added += 1
        if added: log.info(f"  [{code}] {STOCK_META[code]['name']}: {added}건")
        time.sleep(0.2)

    for sector_name, url in SECTOR_RSS:
        raws = fetch_rss(url)
        for raw in raws[:3]:
            title = raw["title"]
            if title in seen_titles: continue
            seen_titles.add(title)
            code = detect_code(title, raw.get("body", ""))
            item = build_news_item(raw, code, uid_counter)
            uid_counter += 1
            items.append(item)
        time.sleep(0.2)

    return items

def update_news():
    log.info("=" * 50)
    log.info("뉴스 수집 시작")
    log.info("=" * 50)

    old_news = []
    old_ids  = set()
    if NEWS_FILE.exists():
        try:
            old_news = json.loads(NEWS_FILE.read_text("utf-8"))
            old_ids  = {n["id"] for n in old_news}
            log.info(f"기존 뉴스 {len(old_news)}건 로드")
        except: pass

    new_items = fetch_all_news(old_ids)
    log.info(f"신규 수집: {len(new_items)}건")

    today_str = datetime.now(KST).strftime("%Y-%m-%d")
    kept_old  = [n for n in old_news if n.get("collectedAt", "")[:10] == today_str]
    merged    = new_items + kept_old

    seen = set()
    deduped = []
    for n in merged:
        if n["title"] not in seen:
            seen.add(n["title"])
            deduped.append(n)
    deduped.sort(key=lambda x: x["urgency"])
    final = deduped[:80]

    tmp = NEWS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(final, ensure_ascii=False, indent=2), "utf-8")
    tmp.replace(NEWS_FILE)
    log.info(f"✅ news.json 저장 ({len(final)}건)")
    return final

def update_ai_analysis(news_items):
    """Gemini로 주요 종목 AI 분석 → analysis.json 저장"""
    if not GEMINI_API_KEY:
        log.info("⚠️ GEMINI_API_KEY 없음 - analysis.json 스킵")
        return

    log.info("=" * 50)
    log.info("Gemini AI 분석 시작")
    log.info("=" * 50)

    # 기존 분석 로드
    old_analysis = {}
    if ANALYSIS_FILE.exists():
        try: old_analysis = json.loads(ANALYSIS_FILE.read_text("utf-8"))
        except: pass

    # 뉴스 많은 상위 20종목만 분석 (rate limit 절약)
    from collections import Counter
    code_counts = Counter(n["code"] for n in news_items)
    top_codes = [code for code, _ in code_counts.most_common(20)]

    # 주가 데이터 로드
    prices = {}
    prices_file = BASE_DIR / "prices.json"
    if prices_file.exists():
        try: prices = json.loads(prices_file.read_text("utf-8"))
        except: pass

    stocks_summary = []
    for code in top_codes:
        meta = STOCK_META.get(code, {})
        news_titles = [n["title"] for n in news_items if n["code"] == code][:3]
        price_info  = prices.get(code, {})
        stocks_summary.append({
            "code": code,
            "name": meta.get("name", code),
            "news": news_titles,
            "chg":  price_info.get("chg", 0),
        })

    new_analysis = gemini_analyze(stocks_summary)

    # 기존 + 신규 병합
    merged = {**old_analysis, **new_analysis}
    merged["_updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")

    tmp = ANALYSIS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(merged, ensure_ascii=False, indent=2), "utf-8")
    tmp.replace(ANALYSIS_FILE)
    log.info(f"✅ analysis.json 저장 ({len(new_analysis)}종목 갱신)")

if __name__ == "__main__":
    try:
        news = update_news()
        update_ai_analysis(news)
        sys.exit(0)
    except Exception as e:
        log.critical(f"치명적 오류: {e}", exc_info=True)
        sys.exit(2)

#!/usr/bin/env python3
"""
KOSPI 뉴스 자동 수집기 (RSS 기반)
실행: python3 scripts/fetch_news.py
외부 라이브러리 불필요 - Python 표준 라이브러리만 사용
생성 파일: news.json
"""

import json, logging, sys, time, re, html as html_mod
import urllib.request, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_DIR   = Path(__file__).resolve().parent.parent
NEWS_FILE  = BASE_DIR / "news.json"
LOG_DIR    = BASE_DIR / "logs"
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

# ── 종목 코드 → 이름/섹터/테마 매핑 ──
STOCK_META = {
    "005930": {"name": "삼성전자",        "sector": "반도체",  "themes": ["반도체", "AI"]},
    "000660": {"name": "SK하이닉스",      "sector": "반도체",  "themes": ["반도체", "AI", "HBM"]},
    "035420": {"name": "NAVER",           "sector": "IT",      "themes": ["AI", "IT플랫폼"]},
    "005380": {"name": "현대차",          "sector": "자동차",  "themes": ["자동차", "EV"]},
    "068270": {"name": "셀트리온",        "sector": "바이오",  "themes": ["바이오", "바이오시밀러"]},
    "051910": {"name": "LG화학",          "sector": "2차전지", "themes": ["2차전지", "소재"]},
    "006400": {"name": "삼성SDI",         "sector": "2차전지", "themes": ["2차전지", "배터리"]},
    "105560": {"name": "KB금융",          "sector": "금융",    "themes": ["금융", "은행"]},
    "034020": {"name": "두산에너빌리티",   "sector": "에너지",  "themes": ["원전", "SMR"]},
    "000270": {"name": "기아",            "sector": "자동차",  "themes": ["자동차", "EV"]},
    "035720": {"name": "카카오",          "sector": "IT",      "themes": ["AI", "IT플랫폼"]},
    "207940": {"name": "삼성바이오로직스", "sector": "바이오",  "themes": ["바이오", "CMO"]},
    "329180": {"name": "HD현대중공업",    "sector": "방산",    "themes": ["방산", "조선"]},
    "012450": {"name": "한화에어로스페이스","sector": "방산",   "themes": ["방산", "우주"]},
    "247540": {"name": "에코프로비엠",    "sector": "2차전지", "themes": ["2차전지", "양극재"]},
    "042700": {"name": "한미반도체",      "sector": "반도체",  "themes": ["반도체", "AI"]},
}

# ── 종목 키워드 → 코드 매핑 (뉴스 제목에서 탐지용) ──
KEYWORD_MAP = {}
for code, meta in STOCK_META.items():
    for kw in [meta["name"]] + meta["themes"]:
        if kw not in KEYWORD_MAP:
            KEYWORD_MAP[kw] = code

# ── RSS 피드 목록 ──
# 네이버 금융 종목별 뉴스 RSS
NAVER_RSS = {
    code: f"https://finance.naver.com/item/news.nhn?code={code}&mode=rss"
    for code in STOCK_META
}

# 한국경제/연합뉴스 섹터별 RSS
SECTOR_RSS = [
    ("반도체", "https://rss.hankyung.com/board/it.xml"),
    ("바이오",  "https://rss.hankyung.com/board/medical.xml"),
    ("자동차",  "https://rss.hankyung.com/board/industrial.xml"),
    ("금융",   "https://rss.yonhapnews.co.kr/economy/banking-finance.xml"),
]

# ── 뉴스 타입 판별 ──
OFFICIAL_KW  = ["공시", "DART", "IR", "분기보고서", "주요사항", "자율공시", "계약", "수주", "MOU"]
ANALYST_KW   = ["목표주가", "리포트", "증권", "애널", "분석", "TP", "매수", "매도", "투자의견"]
RUMOR_KW     = ["루머", "찌라시", "설", "소문", "전망", "예상", "관측", "전해져"]

def classify_type(title: str, body: str) -> str:
    combined = title + " " + body
    if any(k in combined for k in OFFICIAL_KW):  return "official"
    if any(k in combined for k in ANALYST_KW):   return "analyst"
    if any(k in combined for k in RUMOR_KW):      return "rumor"
    return "news"

def classify_sentiment(title: str, body: str) -> str:
    pos = ["상승", "급등", "호재", "수주", "성장", "긍정", "돌파", "신고가", "매수", "확대", "증가", "기대"]
    neg = ["하락", "급락", "악재", "우려", "부정", "손실", "감소", "위기", "매도", "리스크", "적자"]
    combined = title + " " + body
    p = sum(1 for k in pos if k in combined)
    n = sum(1 for k in neg if k in combined)
    return "긍정" if p > n else "부정" if n > p else "중립"

def detect_code(title: str, body: str) -> str:
    """뉴스 제목/내용에서 종목 코드 탐지"""
    combined = title + " " + body
    # 긴 키워드 우선 매칭
    for kw in sorted(KEYWORD_MAP.keys(), key=len, reverse=True):
        if kw in combined:
            return KEYWORD_MAP[kw]
    return "005930"  # 기본값: 삼성전자

def detect_themes(title: str, body: str, code: str) -> list:
    """종목 기본 테마 + 뉴스 내용에서 추가 테마 탐지"""
    base = list(STOCK_META.get(code, {}).get("themes", []))
    extra_map = {
        "HBM": "HBM", "반도체": "반도체", "AI": "AI", "SMR": "SMR",
        "원전": "원전", "배터리": "2차전지", "전기차": "EV", "방산": "방산",
        "바이오": "바이오", "CMO": "CMO", "양극재": "양극재",
    }
    combined = title + " " + body
    for kw, theme in extra_map.items():
        if kw in combined and theme not in base:
            base.append(theme)
    return base[:4]

def calc_impact(item_type: str, sources: int, sent: str) -> int:
    base = {"official": 80, "news": 65, "analyst": 60, "rumor": 50}.get(item_type, 55)
    bonus = min(sources * 3, 15)
    sent_bonus = 8 if sent == "긍정" else 5 if sent == "부정" else 0
    return min(base + bonus + sent_bonus, 99)

def calc_urgency(impact: int, item_type: str) -> int:
    if impact >= 85 or item_type == "official": return 1
    if impact >= 65: return 2
    return 3


# ── RSS 파싱 ──
def fetch_rss(url: str, timeout=8):
    """RSS URL → 아이템 리스트"""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; KOSPI-News-Bot/1.0)",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
        root = ET.fromstring(raw)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        items = root.findall(".//item") or root.findall(".//atom:entry", ns)
        result = []
        for item in items:
            title = (item.findtext("title") or item.findtext("atom:title", namespaces=ns) or "").strip()
            desc  = (item.findtext("description") or item.findtext("atom:summary", namespaces=ns) or "").strip()
            link  = (item.findtext("link") or item.findtext("atom:link", namespaces=ns) or "").strip()
            pub   = (item.findtext("pubDate") or item.findtext("atom:published", namespaces=ns) or "").strip()

            # HTML 태그 및 엔티티 제거
            title = html_mod.unescape(re.sub(r"<[^>]+>", "", title))
            desc  = html_mod.unescape(re.sub(r"<[^>]+>", "", desc))[:200]

            if title:
                result.append({"title": title, "body": desc, "link": link, "pubDate": pub})
        return result
    except Exception as e:
        log.debug(f"RSS 실패: {url[:60]}… {e}")
        return []


def parse_time(pub_date: str) -> str:
    """pubDate → HH:MM (KST)"""
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(pub_date).astimezone(KST)
        return dt.strftime("%H:%M")
    except Exception:
        return datetime.now(KST).strftime("%H:%M")


def build_news_item(raw: dict, code: str, uid: int) -> dict:
    title = raw["title"]
    body  = raw.get("body", "")
    item_type = classify_type(title, body)
    sent      = classify_sentiment(title, body)
    themes    = detect_themes(title, body, code)
    impact    = calc_impact(item_type, 3, sent)
    urgency   = calc_urgency(impact, item_type)

    return {
        "id":     uid,
        "code":   code,
        "time":   parse_time(raw.get("pubDate", "")),
        "type":   item_type,
        "title":  title,
        "body":   body,
        "link":   raw.get("link", ""),
        "sources": 3,
        "speed":  "중간",
        "sent":   sent,
        "score":  None,
        "verdict": None,
        "detail": None,
        "dartResult": None,
        "judgment": None,
        "spreadHistory": [1, 2],
        "urgency":    urgency,
        "impactScore": impact,
        "themes":     themes,
        "relStocks":  [],
        "aiSummary":  None,
        "aiKeywords": None,
        "priceReaction": None,
        "scoreBreakdown": None,
        "collectedAt": datetime.now(KST).isoformat(timespec="seconds"),
    }


def fetch_all_news(old_ids: set) -> list:
    """모든 RSS 수집 → 뉴스 아이템 리스트"""
    items = []
    uid_counter = int(datetime.now().timestamp() * 1000)  # 밀리초 기반 고유 ID
    seen_titles = set()

    # 종목별 네이버 RSS
    for code, url in NAVER_RSS.items():
        log.info(f"  [{code}] {STOCK_META[code]['name']} 뉴스 수집")
        raws = fetch_rss(url)
        added = 0
        for raw in raws[:5]:  # 종목당 최대 5건
            title = raw["title"]
            if title in seen_titles:
                continue
            seen_titles.add(title)
            item = build_news_item(raw, code, uid_counter)
            uid_counter += 1
            items.append(item)
            added += 1
        log.info(f"    ✅ {added}건 수집")
        time.sleep(0.3)

    # 섹터별 RSS (추가 보완)
    for sector_name, url in SECTOR_RSS:
        log.info(f"  [{sector_name}] 섹터 RSS 수집")
        raws = fetch_rss(url)
        added = 0
        for raw in raws[:3]:
            title = raw["title"]
            if title in seen_titles:
                continue
            seen_titles.add(title)
            code = detect_code(title, raw.get("body", ""))
            item = build_news_item(raw, code, uid_counter)
            uid_counter += 1
            items.append(item)
            added += 1
        log.info(f"    ✅ {added}건 수집")
        time.sleep(0.3)

    return items


def update_news():
    log.info("=" * 50)
    log.info("뉴스 수집 시작")
    log.info("=" * 50)

    # 기존 뉴스 로드 (ID 중복 방지)
    old_news = []
    old_ids  = set()
    if NEWS_FILE.exists():
        try:
            old_news = json.loads(NEWS_FILE.read_text("utf-8"))
            old_ids  = {n["id"] for n in old_news}
            log.info(f"기존 뉴스 {len(old_news)}건 로드")
        except Exception:
            pass

    new_items = fetch_all_news(old_ids)
    log.info(f"\n신규 수집: {len(new_items)}건")

    # 기존 뉴스와 합치되, 오늘 날짜 기준 최근 50건만 유지
    today_str = datetime.now(KST).strftime("%Y-%m-%d")
    kept_old  = [n for n in old_news if n.get("collectedAt", "")[:10] == today_str]
    merged    = new_items + kept_old

    # 중복 제목 제거, urgency 정렬, 최대 80건
    seen = set()
    deduped = []
    for n in merged:
        if n["title"] not in seen:
            seen.add(n["title"])
            deduped.append(n)
    deduped.sort(key=lambda x: x["urgency"])
    final = deduped[:80]

    # 저장
    tmp = NEWS_FILE.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(final, ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(NEWS_FILE)
        log.info(f"✅ news.json 저장 ({len(final)}건)")
    except Exception as e:
        log.error(f"❌ news.json 저장 실패: {e}")
        tmp.unlink(missing_ok=True)
        return False

    return True


if __name__ == "__main__":
    try:
        ok = update_news()
        sys.exit(0 if ok else 1)
    except Exception as e:
        log.critical(f"치명적 오류: {e}", exc_info=True)
        sys.exit(2)

#!/usr/bin/env python3
"""
KOSPI 뉴스 자동 수집기 v2
- Yahoo Finance RSS (GitHub Actions에서 차단 없음)
- 외부 라이브러리 불필요
생성 파일: news.json
"""

import json, logging, sys, time, re, html as html_mod
import urllib.request, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_DIR  = Path(__file__).resolve().parent.parent
NEWS_FILE = BASE_DIR / "news.json"
LOG_DIR   = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "news.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("news")
KST = timezone(timedelta(hours=9))

# ── 종목 메타 ──
STOCK_META = {
    "005930": {"name": "삼성전자",         "sector": "반도체",  "themes": ["반도체", "AI"],       "yahoo": "005930.KS"},
    "000660": {"name": "SK하이닉스",       "sector": "반도체",  "themes": ["반도체", "HBM", "AI"], "yahoo": "000660.KS"},
    "035420": {"name": "NAVER",            "sector": "IT",      "themes": ["AI", "IT플랫폼"],      "yahoo": "035420.KS"},
    "005380": {"name": "현대차",           "sector": "자동차",  "themes": ["자동차", "EV"],        "yahoo": "005380.KS"},
    "068270": {"name": "셀트리온",         "sector": "바이오",  "themes": ["바이오"],              "yahoo": "068270.KQ"},
    "051910": {"name": "LG화학",           "sector": "2차전지", "themes": ["2차전지", "소재"],     "yahoo": "051910.KS"},
    "006400": {"name": "삼성SDI",          "sector": "2차전지", "themes": ["2차전지", "배터리"],   "yahoo": "006400.KS"},
    "105560": {"name": "KB금융",           "sector": "금융",    "themes": ["금융", "은행"],        "yahoo": "105560.KS"},
    "034020": {"name": "두산에너빌리티",    "sector": "에너지",  "themes": ["원전", "SMR"],         "yahoo": "034020.KS"},
    "000270": {"name": "기아",             "sector": "자동차",  "themes": ["자동차", "EV"],        "yahoo": "000270.KS"},
    "035720": {"name": "카카오",           "sector": "IT",      "themes": ["AI", "IT플랫폼"],      "yahoo": "035720.KQ"},
    "207940": {"name": "삼성바이오로직스",  "sector": "바이오",  "themes": ["바이오", "CMO"],       "yahoo": "207940.KS"},
    "329180": {"name": "HD현대중공업",     "sector": "방산",    "themes": ["방산", "조선"],        "yahoo": "329180.KS"},
    "012450": {"name": "한화에어로스페이스","sector": "방산",    "themes": ["방산", "우주"],        "yahoo": "012450.KS"},
    "247540": {"name": "에코프로비엠",     "sector": "2차전지", "themes": ["2차전지", "양극재"],   "yahoo": "247540.KQ"},
    "042700": {"name": "한미반도체",       "sector": "반도체",  "themes": ["반도체", "AI"],        "yahoo": "042700.KQ"},
}

# 키워드 → 코드 매핑
KEYWORD_MAP = {}
for code, meta in STOCK_META.items():
    for kw in [meta["name"]] + meta["themes"]:
        if kw not in KEYWORD_MAP:
            KEYWORD_MAP[kw] = code


def _get_rss(url, timeout=10):
    """RSS URL → 파싱된 아이템 리스트"""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; RSS-Reader/1.0)",
            "Accept": "application/rss+xml, application/xml, text/xml",
        })
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
            desc  = html_mod.unescape(re.sub(r"<[^>]+>", "", desc))[:300]
            if title:
                result.append({"title": title, "body": desc, "link": link, "pubDate": pub})
        return result
    except Exception as e:
        log.debug(f"RSS 실패: {url[:60]} — {e}")
        return []


def parse_time(pub_date):
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(pub_date).astimezone(KST)
        return dt.strftime("%H:%M")
    except Exception:
        return datetime.now(KST).strftime("%H:%M")


def classify_type(title, body):
    combined = title + body
    if any(k in combined for k in ["공시", "DART", "계약", "수주", "MOU", "분기보고서"]): return "official"
    if any(k in combined for k in ["목표주가", "리포트", "증권", "TP", "투자의견", "애널"]):   return "analyst"
    if any(k in combined for k in ["루머", "설", "소문", "전망", "관측"]):                    return "rumor"
    return "news"


def classify_sentiment(title, body):
    pos = ["상승", "급등", "호재", "수주", "성장", "긍정", "돌파", "신고가", "확대", "증가"]
    neg = ["하락", "급락", "악재", "우려", "손실", "감소", "위기", "적자", "리스크"]
    combined = title + body
    p = sum(1 for k in pos if k in combined)
    n = sum(1 for k in neg if k in combined)
    return "긍정" if p > n else "부정" if n > p else "중립"


def detect_code(title, body):
    combined = title + body
    for kw in sorted(KEYWORD_MAP.keys(), key=len, reverse=True):
        if kw in combined:
            return KEYWORD_MAP[kw]
    return "005930"


def build_item(raw, code, uid):
    title     = raw["title"]
    body      = raw.get("body", "")
    item_type = classify_type(title, body)
    sent      = classify_sentiment(title, body)
    meta      = STOCK_META.get(code, {})
    impact    = {"official": 82, "news": 65, "analyst": 60, "rumor": 50}.get(item_type, 55)
    urgency   = 1 if impact >= 82 else 2 if impact >= 65 else 3

    return {
        "id": uid, "code": code,
        "time": parse_time(raw.get("pubDate", "")),
        "type": item_type, "title": title, "body": body,
        "link": raw.get("link", ""),
        "sources": 3, "speed": "중간", "sent": sent,
        "score": None, "verdict": None, "detail": None,
        "dartResult": None, "judgment": None,
        "spreadHistory": [1, 2],
        "urgency": urgency, "impactScore": impact,
        "themes": meta.get("themes", [])[:3],
        "relStocks": [],
        "aiSummary": None, "aiKeywords": None,
        "priceReaction": None, "scoreBreakdown": None,
        "collectedAt": datetime.now(KST).isoformat(timespec="seconds"),
    }


def fetch_all():
    items     = []
    seen      = set()
    uid       = int(datetime.now().timestamp()) * 1000

    # ── Yahoo Finance RSS (종목별) ──
    for code, meta in STOCK_META.items():
        ticker = meta["yahoo"]
        url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
        log.info(f"  [{code}] {meta['name']} Yahoo RSS")
        raws = _get_rss(url)
        added = 0
        for raw in raws[:4]:
            if raw["title"] in seen: continue
            seen.add(raw["title"])
            items.append(build_item(raw, code, uid))
            uid += 1
            added += 1
        log.info(f"    {'✅' if added else '⚠️ '} {added}건")
        time.sleep(0.3)

    # ── Yahoo Finance 한국 증시 전체 RSS ──
    for url, label in [
        ("https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EKS11&region=US&lang=en-US", "KOSPI"),
        ("https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EKQ11&region=US&lang=en-US", "KOSDAQ"),
    ]:
        log.info(f"  [{label}] 지수 RSS")
        raws = _get_rss(url)
        added = 0
        for raw in raws[:5]:
            if raw["title"] in seen: continue
            seen.add(raw["title"])
            code = detect_code(raw["title"], raw.get("body", ""))
            items.append(build_item(raw, code, uid))
            uid += 1
            added += 1
        log.info(f"    {'✅' if added else '⚠️ '} {added}건")
        time.sleep(0.3)

    return items


def update_news():
    log.info("=" * 50)
    log.info("뉴스 수집 시작 (Yahoo Finance RSS)")
    log.info("=" * 50)

    # 기존 데이터 로드
    old_news = []
    if NEWS_FILE.exists():
        try:
            old_news = json.loads(NEWS_FILE.read_text("utf-8"))
            log.info(f"기존 {len(old_news)}건 로드")
        except Exception: pass

    new_items = fetch_all()
    log.info(f"\n신규 수집: {len(new_items)}건")

    # 오늘 날짜 기존 뉴스 유지 + 병합
    today = datetime.now(KST).strftime("%Y-%m-%d")
    kept  = [n for n in old_news if n.get("collectedAt", "")[:10] == today]
    merged = new_items + kept

    # 중복 제거 + urgency 정렬 + 최대 80건
    seen2, deduped = set(), []
    for n in merged:
        if n["title"] not in seen2:
            seen2.add(n["title"])
            deduped.append(n)
    deduped.sort(key=lambda x: x["urgency"])
    final = deduped[:80]

    tmp = NEWS_FILE.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(final, ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(NEWS_FILE)
        log.info(f"✅ news.json 저장 ({len(final)}건)")
        return True
    except Exception as e:
        log.error(f"❌ 저장 실패: {e}")
        tmp.unlink(missing_ok=True)
        return False


if __name__ == "__main__":
    try:
        ok = update_news()
        sys.exit(0 if ok else 1)
    except Exception as e:
        log.critical(f"치명적 오류: {e}", exc_info=True)
        sys.exit(2)

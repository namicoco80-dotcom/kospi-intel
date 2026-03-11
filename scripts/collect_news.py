"""
collect_news.py  ─  뉴스·공시 수집
──────────────────────────────────────────────────────────────────────────────
역할:
  - 구글 뉴스 RSS 수집  →  data/raw/news_YYYYMMDD_HHMMSS.json  (원본)
  - DART 공시 수집      →  data/raw/dart_YYYYMMDD_HHMMSS.json  (원본)
  - 중복 제거 + 병합    →  data/processed/news_merged.json
  - 프론트용 최종 출력  →  data/public/news.json

원칙:
  - raw/ 수집본은 절대 수정하지 않음
  - 병합·가공은 processed/ 에서만 수행
  - public/ 저장 전 기존 파일 자동 백업
  - GEMINI API 키가 없어도 뉴스 수집은 정상 동작
──────────────────────────────────────────────────────────────────────────────
"""

import hashlib
import os
import re
import time
from datetime import datetime, timezone, timedelta

import requests
import feedparser

from utils import (
    get_logger, load_stocks,
    save_raw, save_processed, save_public,
    load_public_json, load_processed_json,
    write_run_summary,
    KST,
)

log = get_logger("collect_news")

DART_KEY    = os.environ.get("DART_API_KEY", "")
GEMINI_KEY  = os.environ.get("GEMINI_API_KEY", "")
KEEP_DAYS   = 3      # 뉴스 보존 기간
MAX_NEWS    = 200    # 최대 보존 건수

# Gemini 초기화 (선택)
USE_GEMINI = False
GEMINI_MODEL = None
try:
    import google.generativeai as genai
    if GEMINI_KEY:
        genai.configure(api_key=GEMINI_KEY)
        GEMINI_MODEL = genai.GenerativeModel("gemini-2.0-flash-lite")
        USE_GEMINI = True
        log.info("Gemini AI 활성화됨")
except ImportError:
    log.info("google-generativeai 미설치 → AI 분석 비활성화")


# ── 분류 키워드 ──────────────────────────────────────────────────────────────
TYPE_KEYWORDS = {
    "official": ["공시","공고","결산","감사보고서","사업보고서","주요사항보고","합병","분할","유상증자","자사주"],
    "analyst":  ["목표주가","투자의견","리포트","분석","전망","매수","매도","중립","아웃퍼폼","증권"],
    "rumor":    ["루머","설","전해졌다","알려졌다","관계자에 따르면","소식통"],
}
THEME_KEYWORDS = {
    "반도체": ["반도체","HBM","D램","낸드","파운드리","TSMC","엔비디아"],
    "AI":     ["AI","인공지능","LLM","GPT","ChatGPT","생성형"],
    "2차전지": ["배터리","전기차","리튬","음극재","양극재","LFP","NCM"],
    "바이오":  ["바이오","신약","임상","FDA","허가","치료제"],
    "자동차":  ["자동차","전기차","수소차","완성차","자율주행"],
    "IT":     ["플랫폼","클라우드","앱","서비스","구독"],
    "규제":   ["규제","과징금","법원","소송","조사","제재"],
}


# ════════════════════════════════════════════════════════════════════════════
# 1. 구글 뉴스 RSS 수집
# ════════════════════════════════════════════════════════════════════════════

def fetch_google_news(stock: dict) -> list[dict]:
    """구글 뉴스 RSS에서 종목 관련 뉴스를 수집한다"""
    query = f"{stock['name']} 주식"
    url   = (
        f"https://news.google.com/rss/search"
        f"?q={requests.utils.quote(query)}&hl=ko&gl=KR&ceid=KR:ko"
    )
    items = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:5]:
            title = entry.get("title", "").strip()
            title = re.sub(r"\s*-\s*[^-]+$", "", title).strip()
            if not title:
                continue

            pub_dt = entry.get("published_parsed")
            if pub_dt:
                dt  = datetime(*pub_dt[:6], tzinfo=timezone.utc).astimezone(KST)
                ts  = dt.strftime("%H:%M")
                cat = dt.isoformat()
            else:
                ts  = "--:--"
                cat = datetime.now(KST).isoformat()

            news_type = _classify_type(title)
            themes    = _extract_themes(title + " " + stock["name"])
            impact    = _estimate_impact(title, news_type, themes)

            items.append({
                "id":          "g_" + hashlib.md5(title.encode()).hexdigest()[:8],
                "title":       title,
                "body":        "",
                "url":         entry.get("link", ""),
                "code":        stock["code"],
                "stockName":   stock["name"],
                "sector":      stock["sector"],
                "type":        news_type,
                "sent":        "중립",
                "sources":     1,
                "speed":       "보통",
                "urgency":     2 if impact >= 70 else 3,
                "impactScore": impact,
                "themes":      themes,
                "relStocks":   [],
                "time":        ts,
                "collectedAt": cat,
                "source":      "google_rss",
            })
    except Exception as e:
        log.warning(f"구글 RSS 수집 실패 [{stock['name']}]: {e}")
    return items


# ════════════════════════════════════════════════════════════════════════════
# 2. DART 공시 수집
# ════════════════════════════════════════════════════════════════════════════

def fetch_dart_disclosures(stock: dict) -> list[dict]:
    """DART API로 당일 공시를 수집한다"""
    if not DART_KEY:
        return []
    corp_code = stock.get("dart_corp_code", "")
    if not corp_code:
        return []

    today = datetime.now(KST).strftime("%Y%m%d")
    items = []
    try:
        res  = requests.get(
            "https://opendart.fss.or.kr/api/list.json",
            params={
                "crtfc_key":  DART_KEY,
                "corp_code":  corp_code,
                "bgn_de":     today,
                "end_de":     today,
                "page_count": 10,
            },
            timeout=10,
        )
        data = res.json()
        if data.get("status") != "000":
            return []

        for d in (data.get("list") or []):
            title  = d.get("report_nm", "").strip()
            rcp_no = d.get("rcept_no", "")
            if not title or not rcp_no:
                continue

            themes = _extract_themes(title)
            impact = min(_estimate_impact(title, "official", themes) + 10, 100)

            items.append({
                "id":          "d_" + hashlib.md5(rcp_no.encode()).hexdigest()[:8],
                "title":       f"[공시] {title}",
                "body":        f"{stock['name']} 공시: {title}",
                "url":         f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcp_no}",
                "code":        stock["code"],
                "stockName":   stock["name"],
                "sector":      stock["sector"],
                "type":        "official",
                "sent":        "중립",
                "sources":     4,
                "speed":       "빠름",
                "urgency":     1 if impact >= 70 else 2,
                "impactScore": impact,
                "themes":      themes,
                "relStocks":   [],
                "time":        datetime.now(KST).strftime("%H:%M"),
                "collectedAt": datetime.now(KST).isoformat(),
                "source":      "dart_api",
                "rcp_no":      rcp_no,
            })
    except Exception as e:
        log.warning(f"DART 공시 수집 실패 [{stock['name']}]: {e}")
    return items


# ════════════════════════════════════════════════════════════════════════════
# 3. 분류 헬퍼
# ════════════════════════════════════════════════════════════════════════════

def _classify_type(title: str) -> str:
    for t, kws in TYPE_KEYWORDS.items():
        if any(kw in title for kw in kws):
            return t
    return "news"

def _extract_themes(text: str) -> list[str]:
    return [theme for theme, kws in THEME_KEYWORDS.items() if any(kw in text for kw in kws)]

def _estimate_impact(title: str, news_type: str, themes: list) -> int:
    score  = 40
    score += {"official": 20, "analyst": 15, "rumor": 5, "news": 10}.get(news_type, 10)
    score += len(themes) * 5
    HIGH = ["급등","급락","어닝","서프라이즈","쇼크","합병","인수","제재","허가","첫","역대"]
    MED  = ["실적","목표주가","계약","투자","수주","출시","확대"]
    score += sum(10 for kw in HIGH if kw in title)
    score += sum(5  for kw in MED  if kw in title)
    return min(score, 100)


# ════════════════════════════════════════════════════════════════════════════
# 4. Gemini AI 분석 (선택)
# ════════════════════════════════════════════════════════════════════════════

def gemini_analyze(item: dict) -> dict:
    """Gemini로 투자판단·팩트체크·AI요약 생성. 실패해도 빈 dict 반환."""
    if not USE_GEMINI:
        return {}
    prompt = f"""다음 한국 주식 뉴스를 분석해줘. JSON만 응답. 다른 텍스트 없이.

종목: {item['stockName']} ({item['code']})
제목: {item['title']}
유형: {item['type']}

JSON 형식:
{{
  "verdict": "매수|관망|매도",
  "confidence": 0-100,
  "summary": "1-2문장 핵심요약",
  "short": "매수|관망|매도",
  "mid": "매수|관망|매도",
  "long": "매수|관망|매도",
  "factors": ["긍정/부정 요인 1", "요인 2"],
  "stopLoss": "손절가 기준 또는 null",
  "targetReturn": "목표수익 또는 null",
  "factScore": 0-100,
  "factVerdict": "confirmed|partial|unverified",
  "riskLevel": "높음|중간|낮음",
  "keywords": ["키워드1", "키워드2", "키워드3"]
}}"""
    try:
        resp   = GEMINI_MODEL.generate_content(prompt)
        text   = re.sub(r"```json|```", "", resp.text.strip()).strip()
        parsed = __import__("json").loads(text)
        return {
            "judgment": {
                "verdict":      parsed.get("verdict", "관망"),
                "confidence":   parsed.get("confidence", 50),
                "summary":      parsed.get("summary", ""),
                "short":        parsed.get("short", "관망"),
                "mid":          parsed.get("mid", "관망"),
                "long":         parsed.get("long", "관망"),
                "factors":      parsed.get("factors", []),
                "stopLoss":     parsed.get("stopLoss"),
                "targetReturn": parsed.get("targetReturn"),
            },
            "score":      parsed.get("factScore"),
            "verdict":    parsed.get("factVerdict"),
            "detail": {
                "key_points": parsed.get("summary", ""),
                "risk_level": parsed.get("riskLevel", "중간"),
            },
            "aiSummary":  parsed.get("summary", ""),
            "aiKeywords": parsed.get("keywords", []),
        }
    except Exception as e:
        log.warning(f"Gemini 분석 실패 [{item.get('id')}]: {e}")
        return {}


# ════════════════════════════════════════════════════════════════════════════
# 5. 메인 실행
# ════════════════════════════════════════════════════════════════════════════

def main():
    now = datetime.now(KST)
    log.info("=" * 60)
    log.info(f"뉴스·공시 수집 시작: {now.strftime('%Y-%m-%d %H:%M KST')}")
    log.info("=" * 60)

    stocks = load_stocks()

    # ── Step 1: 수집 ────────────────────────────────────────────────────────
    raw_google = []
    raw_dart   = []

    for stock in stocks:
        log.info(f"▶ {stock['name']} ({stock['code']})")

        google_items = fetch_google_news(stock)
        raw_google.extend(google_items)
        log.info(f"  구글RSS: {len(google_items)}건")

        dart_items = fetch_dart_disclosures(stock)
        raw_dart.extend(dart_items)
        log.info(f"  DART공시: {len(dart_items)}건")

        time.sleep(0.5)

    # ── Step 2: 원본 저장 (raw/) ─────────────────────────────────────────────
    # 타임스탬프 파일명 → 절대 덮어쓰지 않음
    if raw_google:
        save_raw("news_google.json", raw_google, log)
    if raw_dart:
        save_raw("news_dart.json", raw_dart, log)

    log.info(f"원본 저장 완료: 구글 {len(raw_google)}건, DART {len(raw_dart)}건")

    # ── Step 3: 중복 제거 및 병합 (processed/) ──────────────────────────────
    # 기존 processed 데이터 로드
    existing_merged = load_processed_json("news_merged.json", [])

    # 3일 이상 오래된 항목 제거
    cutoff = now - __import__("datetime").timedelta(days=KEEP_DAYS)
    existing_merged = [
        n for n in existing_merged
        if _parse_dt(n.get("collectedAt")) > cutoff
    ]

    existing_ids = {n["id"] for n in existing_merged}

    new_items = []
    for item in raw_google + raw_dart:
        if item["id"] not in existing_ids:
            new_items.append(item)
            existing_ids.add(item["id"])

    log.info(f"신규 항목: {len(new_items)}건 (기존 {len(existing_merged)}건)")

    # ── Step 4: Gemini AI 분석 (신규·고임팩트 항목만) ──────────────────────
    ai_count = 0
    if USE_GEMINI:
        targets = sorted(
            [n for n in new_items if n["impactScore"] >= 60],
            key=lambda x: x["impactScore"], reverse=True
        )[:20]   # 최대 20건만 분석 (API 한도 보호)

        for item in targets:
            log.info(f"  AI 분석: {item['title'][:40]}...")
            result = gemini_analyze(item)
            if result:
                item.update(result)
                ai_count += 1
            time.sleep(1.5)   # 레이트 리밋 보호

    # ── Step 5: 병합 후 processed/ 저장 ────────────────────────────────────
    merged = new_items + existing_merged
    merged.sort(key=lambda x: x.get("impactScore", 0), reverse=True)
    merged = merged[:MAX_NEWS]

    save_processed("news_merged.json", merged, log)
    log.info(f"병합 저장 완료: {len(merged)}건")

    # ── Step 6: 공개 데이터 저장 (public/) ──────────────────────────────────
    # processed 데이터를 그대로 public에 복사
    # (향후 필드 필터링·포맷 변환이 필요하면 이 단계에서 처리)
    save_public("news.json", merged, log)
    log.info(f"공개 데이터 저장 완료: {len(merged)}건")

    # ── 실행 요약 기록 ──────────────────────────────────────────────────────
    stats = {
        "google_fetched": len(raw_google),
        "dart_fetched":   len(raw_dart),
        "new_items":      len(new_items),
        "ai_analyzed":    ai_count,
        "total_public":   len(merged),
    }
    write_run_summary("collect_news", stats, log)

    log.info("=" * 60)
    log.info(f"완료: 신규 {len(new_items)}건, 전체 {len(merged)}건, AI {ai_count}건")
    log.info("=" * 60)


def _parse_dt(s: str):
    """ISO 문자열을 datetime으로 파싱. 실패 시 과거 날짜 반환."""
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=KST)
        return dt
    except Exception:
        return datetime(2000, 1, 1, tzinfo=KST)


if __name__ == "__main__":
    main()

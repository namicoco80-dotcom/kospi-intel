"""
fetch_news.py
구글 뉴스 RSS + DART 공시 API 수집
→ data/news.json, data/analysis.json 생성
"""

import os, json, time, hashlib, re
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
import feedparser

# ── 선택: Gemini AI 분석 ──────────────────────────────
try:
    import google.generativeai as genai
    GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
    if GEMINI_KEY:
        genai.configure(api_key=GEMINI_KEY)
        GEMINI_MODEL = genai.GenerativeModel("gemini-2.0-flash-lite")
        USE_GEMINI = True
    else:
        USE_GEMINI = False
except ImportError:
    USE_GEMINI = False

# ── 상수 ─────────────────────────────────────────────
DART_KEY   = os.environ.get("DART_API_KEY", "")
KST        = timezone(timedelta(hours=9))
NOW_KST    = datetime.now(KST)
TODAY_STR  = NOW_KST.strftime("%Y%m%d")
DATA_DIR   = Path("data")
DATA_DIR.mkdir(exist_ok=True)

# 보존 기간: 3일치
KEEP_DAYS = 3

# ── 감시 종목 목록 ────────────────────────────────────
STOCKS = [
    {"code": "005930", "name": "삼성전자",        "sector": "반도체"},
    {"code": "000660", "name": "SK하이닉스",       "sector": "반도체"},
    {"code": "035420", "name": "NAVER",            "sector": "IT"},
    {"code": "035720", "name": "카카오",            "sector": "IT"},
    {"code": "051910", "name": "LG화학",            "sector": "화학"},
    {"code": "006400", "name": "삼성SDI",           "sector": "2차전지"},
    {"code": "207940", "name": "삼성바이오로직스",  "sector": "바이오"},
    {"code": "068270", "name": "셀트리온",          "sector": "바이오"},
    {"code": "005380", "name": "현대차",            "sector": "자동차"},
    {"code": "000270", "name": "기아",              "sector": "자동차"},
    {"code": "003550", "name": "LG",               "sector": "지주"},
    {"code": "055550", "name": "신한지주",          "sector": "금융"},
    {"code": "105560", "name": "KB금융",            "sector": "금융"},
    {"code": "012330", "name": "현대모비스",        "sector": "자동차"},
    {"code": "028260", "name": "삼성물산",          "sector": "지주"},
    {"code": "066570", "name": "LG전자",            "sector": "전자"},
    {"code": "096770", "name": "SK이노베이션",      "sector": "에너지"},
    {"code": "034730", "name": "SK",               "sector": "지주"},
    {"code": "017670", "name": "SK텔레콤",          "sector": "통신"},
    {"code": "030200", "name": "KT",               "sector": "통신"},
]

# 뉴스 유형 키워드 분류
TYPE_KEYWORDS = {
    "official": ["공시", "공고", "결산", "감사보고서", "사업보고서", "주요사항보고", "합병", "분할", "유상증자", "자사주"],
    "analyst":  ["목표주가", "투자의견", "리포트", "분석", "전망", "매수", "매도", "중립", "아웃퍼폼", "증권"],
    "rumor":    ["루머", "설", "전해졌다", "알려졌다", "관계자에 따르면", "소식통"],
}

THEME_KEYWORDS = {
    "반도체": ["반도체", "HBM", "D램", "낸드", "파운드리", "TSMC", "엔비디아"],
    "AI":     ["AI", "인공지능", "LLM", "GPT", "ChatGPT", "생성형"],
    "2차전지": ["배터리", "전기차", "리튬", "음극재", "양극재", "LFP", "NCM"],
    "바이오":  ["바이오", "신약", "임상", "FDA", "허가", "치료제"],
    "자동차":  ["자동차", "전기차", "수소차", "완성차", "자율주행"],
    "IT":     ["플랫폼", "클라우드", "앱", "서비스", "구독"],
    "규제":   ["규제", "과징금", "법원", "소송", "조사", "제재"],
}


# ════════════════════════════════════════════════════
# 1. 구글 뉴스 RSS 수집
# ════════════════════════════════════════════════════

def fetch_google_news(stock: dict) -> list:
    """종목명으로 구글 뉴스 RSS 검색"""
    query = f"{stock['name']} 주식"
    url = (
        f"https://news.google.com/rss/search"
        f"?q={requests.utils.quote(query)}"
        f"&hl=ko&gl=KR&ceid=KR:ko"
    )
    items = []
    try:
        feed = feedparser.parse(url)
        for i, entry in enumerate(feed.entries[:5]):  # 종목당 최대 5건
            title = entry.get("title", "").strip()
            # 구글 뉴스 제목 형식: "뉴스제목 - 언론사" → 언론사 제거
            title = re.sub(r"\s*-\s*[^-]+$", "", title).strip()

            pub_dt = entry.get("published_parsed")
            if pub_dt:
                dt = datetime(*pub_dt[:6], tzinfo=timezone.utc).astimezone(KST)
                time_str = dt.strftime("%H:%M")
                collected_at = dt.isoformat()
            else:
                time_str = "--:--"
                collected_at = NOW_KST.isoformat()

            # 중복 방지용 ID (제목 해시)
            news_id = "g_" + hashlib.md5(title.encode()).hexdigest()[:8]

            news_type = classify_type(title, "")
            themes    = extract_themes(title + " " + stock["name"])
            impact    = estimate_impact(title, news_type, themes)

            items.append({
                "id":          news_id,
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
                "time":        time_str,
                "collectedAt": collected_at,
                "source":      "google",
            })
    except Exception as e:
        print(f"  [Google RSS 오류] {stock['name']}: {e}")
    return items


# ════════════════════════════════════════════════════
# 2. DART 공시 수집
# ════════════════════════════════════════════════════

def fetch_dart_disclosures(stock: dict) -> list:
    """DART API로 당일 공시 수집"""
    if not DART_KEY:
        return []
    url = "https://opendart.fss.or.kr/api/list.json"
    params = {
        "crtfc_key": DART_KEY,
        "corp_code":  get_dart_corp_code(stock["code"]),
        "bgn_de":     TODAY_STR,
        "end_de":     TODAY_STR,
        "page_count": 10,
    }
    items = []
    try:
        res = requests.get(url, params=params, timeout=10)
        data = res.json()
        if data.get("status") != "000":
            return []
        for d in (data.get("list") or []):
            title = d.get("report_nm", "").strip()
            if not title:
                continue
            rcp_dt = d.get("rcept_dt", TODAY_STR)  # "20240315"
            rcp_no = d.get("rcept_no", "")
            dart_url = f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcp_no}"

            news_id = "d_" + hashlib.md5(rcp_no.encode()).hexdigest()[:8]
            themes  = extract_themes(title)
            impact  = estimate_impact(title, "official", themes) + 10  # 공시는 기본 +10

            items.append({
                "id":          news_id,
                "title":       f"[공시] {title}",
                "body":        f"{stock['name']} 공시: {title}",
                "url":         dart_url,
                "code":        stock["code"],
                "stockName":   stock["name"],
                "sector":      stock["sector"],
                "type":        "official",
                "sent":        "중립",
                "sources":     4,  # 공시 = 높은 출처 점수
                "speed":       "빠름",
                "urgency":     1 if impact >= 70 else 2,
                "impactScore": min(impact, 100),
                "themes":      themes,
                "relStocks":   [],
                "time":        NOW_KST.strftime("%H:%M"),
                "collectedAt": NOW_KST.isoformat(),
                "source":      "dart",
                "rcp_no":      rcp_no,
            })
    except Exception as e:
        print(f"  [DART 오류] {stock['name']}: {e}")
    return items


# DART 기업코드 맵 (종목코드 → DART corp_code)
# 실제 운영 시 전체 기업코드는 DART API의 corp_code.zip으로 관리
DART_CORP_MAP = {
    "005930": "00126380",  # 삼성전자
    "000660": "00164779",  # SK하이닉스
    "035420": "00261443",  # NAVER
    "035720": "00401731",  # 카카오
    "051910": "00118804",  # LG화학
    "006400": "00126362",  # 삼성SDI
    "207940": "01247720",  # 삼성바이오로직스
    "068270": "00108675",  # 셀트리온
    "005380": "00164742",  # 현대차
    "000270": "00120030",  # 기아
    "003550": "00108449",  # LG
    "055550": "00110361",  # 신한지주
    "105560": "00104205",  # KB금융
    "012330": "00164788",  # 현대모비스
    "028260": "00126464",  # 삼성물산
    "066570": "00401089",  # LG전자
    "096770": "00631518",  # SK이노베이션
    "034730": "00617460",  # SK
    "017670": "00173262",  # SK텔레콤
    "030200": "00210695",  # KT
}

def get_dart_corp_code(stock_code: str) -> str:
    return DART_CORP_MAP.get(stock_code, "")


# ════════════════════════════════════════════════════
# 3. 분류 헬퍼
# ════════════════════════════════════════════════════

def classify_type(title: str, body: str) -> str:
    text = title + " " + body
    for t, kws in TYPE_KEYWORDS.items():
        if any(kw in text for kw in kws):
            return t
    return "news"

def extract_themes(text: str) -> list:
    return [theme for theme, kws in THEME_KEYWORDS.items() if any(kw in text for kw in kws)]

def estimate_impact(title: str, news_type: str, themes: list) -> int:
    score = 40
    # 유형 가중치
    score += {"official": 20, "analyst": 15, "rumor": 5, "news": 10}.get(news_type, 10)
    # 테마 가중치
    score += len(themes) * 5
    # 키워드 가중치
    HIGH = ["급등", "급락", "어닝", "서프라이즈", "쇼크", "합병", "인수", "제재", "허가", "첫", "역대"]
    MED  = ["실적", "목표주가", "계약", "투자", "수주", "출시", "확대"]
    score += sum(10 for kw in HIGH if kw in title)
    score += sum(5  for kw in MED  if kw in title)
    return min(score, 100)


# ════════════════════════════════════════════════════
# 4. Gemini AI 분석
# ════════════════════════════════════════════════════

def gemini_analyze(news_item: dict) -> dict:
    """Gemini로 투자판단·팩트체크·AI요약 생성"""
    if not USE_GEMINI:
        return {}
    prompt = f"""다음 한국 주식 뉴스를 분석해줘. JSON만 응답. 다른 텍스트 없이.

종목: {news_item['stockName']} ({news_item['code']})
제목: {news_item['title']}
유형: {news_item['type']}

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
        resp = GEMINI_MODEL.generate_content(prompt)
        text = resp.text.strip()
        text = re.sub(r"```json|```", "", text).strip()
        parsed = json.loads(text)
        return {
            "judgment": {
                "verdict":       parsed.get("verdict", "관망"),
                "confidence":    parsed.get("confidence", 50),
                "summary":       parsed.get("summary", ""),
                "short":         parsed.get("short", "관망"),
                "mid":           parsed.get("mid", "관망"),
                "long":          parsed.get("long", "관망"),
                "factors":       parsed.get("factors", []),
                "stopLoss":      parsed.get("stopLoss"),
                "targetReturn":  parsed.get("targetReturn"),
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
        print(f"    [Gemini 오류] {e}")
        return {}


# ════════════════════════════════════════════════════
# 5. 메인 실행
# ════════════════════════════════════════════════════

def main():
    print(f"\n{'='*50}")
    print(f"KOSPI INTEL 뉴스 수집 시작: {NOW_KST.strftime('%Y-%m-%d %H:%M KST')}")
    print(f"{'='*50}")

    # 기존 뉴스 로드 (3일치 보존)
    news_path = DATA_DIR / "news.json"
    existing = []
    if news_path.exists():
        try:
            existing = json.loads(news_path.read_text(encoding="utf-8"))
        except:
            existing = []

    # 3일치만 유지
    cutoff = NOW_KST - timedelta(days=KEEP_DAYS)
    existing = [
        n for n in existing
        if datetime.fromisoformat(n.get("collectedAt", NOW_KST.isoformat())) > cutoff
    ]
    existing_ids = {n["id"] for n in existing}

    new_items = []

    # 기존 analysis.json 로드
    analysis_path = DATA_DIR / "analysis.json"
    analysis = {}
    if analysis_path.exists():
        try:
            analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
        except:
            analysis = {}

    for stock in STOCKS:
        print(f"\n▶ {stock['name']} ({stock['code']})")

        # ① 구글 뉴스 RSS
        google_items = fetch_google_news(stock)
        added_google = 0
        for item in google_items:
            if item["id"] not in existing_ids:
                new_items.append(item)
                existing_ids.add(item["id"])
                added_google += 1
        print(f"  구글RSS: {added_google}건 신규")

        # ② DART 공시
        dart_items = fetch_dart_disclosures(stock)
        added_dart = 0
        for item in dart_items:
            if item["id"] not in existing_ids:
                new_items.append(item)
                existing_ids.add(item["id"])
                added_dart += 1
        print(f"  DART공시: {added_dart}건 신규")

        # ③ Gemini AI 분석 (impactScore 높은 신규 뉴스 우선)
        if USE_GEMINI:
            high_impact = [
                n for n in new_items
                if n["code"] == stock["code"] and n["id"] not in analysis and n["impactScore"] >= 60
            ]
            for item in high_impact[:2]:  # 종목당 최대 2건 분석
                print(f"    AI 분석: {item['title'][:30]}...")
                result = gemini_analyze(item)
                if result:
                    analysis[item["id"]] = result
                    item.update(result)
                time.sleep(1)  # API 레이트 리밋

        time.sleep(0.5)  # 구글 RSS 요청 간격

    # 전체 뉴스 = 기존 + 신규, impactScore 내림차순 정렬
    all_news = new_items + existing
    all_news.sort(key=lambda x: (x.get("impactScore", 0)), reverse=True)
    all_news = all_news[:200]  # 최대 200건

    # 저장
    news_path.write_text(
        json.dumps(all_news, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    analysis_path.write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"\n{'='*50}")
    print(f"✅ 완료!")
    print(f"   신규 뉴스: {len(new_items)}건")
    print(f"   전체 보존: {len(all_news)}건")
    print(f"   AI 분석:   {len(analysis)}건")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()

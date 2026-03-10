#!/usr/bin/env python3
"""
KOSPI 뉴스 수집 - Worker RSS 프록시 방식으로 전환됨
이 스크립트는 Gemini AI 분석만 담당
뉴스 수집은 Cloudflare Worker가 직접 RSS fetch
"""

import json, logging, sys, os
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_DIR      = Path(__file__).resolve().parent.parent
ANALYSIS_FILE = BASE_DIR / "analysis.json"
PRICES_FILE   = BASE_DIR / "prices.json"
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

def gemini_market_summary():
    """Gemini로 오늘 시장 요약 생성"""
    if not GEMINI_API_KEY:
        log.info("⚠️ GEMINI_API_KEY 없음 - 스킵")
        return {}

    import urllib.request, json as json_mod

    # 주가 데이터 로드
    prices = {}
    if PRICES_FILE.exists():
        try: prices = json.loads(PRICES_FILE.read_text("utf-8"))
        except: pass

    if not prices:
        log.info("⚠️ prices.json 없음 - 스킵")
        return {}

    # 상위 10종목 요약
    top = list(prices.items())[:10]
    summary = ", ".join([f"{v.get('name','?')} {v.get('chg',0):+.1f}%" for k,v in top])

    prompt = f"""오늘 한국 주식시장 상위 종목 현황: {summary}
    
다음 JSON 형식으로만 응답:
{{"verdict":"상승/하락/보합","summary":"2줄 요약","point":"오늘의 핵심 포인트"}}"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        req = urllib.request.Request(
            url,
            data=json_mod.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json_mod.loads(r.read())
        text = res["candidates"][0]["content"]["parts"][0]["text"]
        text = text.replace("```json","").replace("```","").strip()
        return json_mod.loads(text)
    except Exception as e:
        log.error(f"Gemini 실패: {e}")
        return {}

if __name__ == "__main__":
    log.info("=" * 50)
    log.info("Gemini 시장 요약 시작")
    log.info("=" * 50)

    result = gemini_market_summary()

    if result:
        old = {}
        if ANALYSIS_FILE.exists():
            try: old = json.loads(ANALYSIS_FILE.read_text("utf-8"))
            except: pass
        old["_market"] = result
        old["_updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
        ANALYSIS_FILE.write_text(json.dumps(old, ensure_ascii=False, indent=2), "utf-8")
        log.info(f"✅ analysis.json 저장 - {result.get('verdict','?')}")
    else:
        log.info("⚠️ 분석 결과 없음")

    sys.exit(0)

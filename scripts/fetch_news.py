#!/usr/bin/env python3

import json
import logging
import time
import re
import html
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

NEWS_FILE = BASE_DIR / "news.json"
ANALYSIS_FILE = BASE_DIR / "analysis.json"

KST = timezone(timedelta(hours=9))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

log = logging.getLogger("news")

# -------------------------------
# RSS 목록 (안정 RSS)
# -------------------------------

RSS_FEEDS = [

("GoogleKOSPI",
"https://news.google.com/rss/search?q=KOSPI&hl=ko&gl=KR&ceid=KR:ko"),

("GoogleKoreaStock",
"https://news.google.com/rss/search?q=Korean+stock&hl=ko&gl=KR&ceid=KR:ko"),

("매일경제",
"https://www.mk.co.kr/rss/50200011/"),

("연합뉴스경제",
"https://www.yna.co.kr/rss/economy.xml"),

("Investing",
"https://kr.investing.com/rss/news.rss"),

]

# -------------------------------
# 종목 키워드
# -------------------------------

KEYWORDS = {

"삼성전자":"005930",
"samsung":"005930",

"sk하이닉스":"000660",
"hynix":"000660",

"lg에너지솔루션":"373220",

"현대차":"005380",
"기아":"000270",

"naver":"035420",
"네이버":"035420",

"카카오":"035720",
"kakao":"035720",

"셀트리온":"068270",

}

# -------------------------------
# RSS 수집
# -------------------------------

def fetch_rss(url):

    try:

        req = urllib.request.Request(
            url,
            headers={"User-Agent":"Mozilla/5.0"}
        )

        with urllib.request.urlopen(req, timeout=10) as r:

            raw = r.read()

        root = ET.fromstring(raw)

        items = root.findall(".//item")

        result = []

        for item in items:

            title = item.findtext("title","")
            desc = item.findtext("description","")
            link = item.findtext("link","")

            title = html.unescape(re.sub("<[^>]+>","",title))
            desc = html.unescape(re.sub("<[^>]+>","",desc))

            if title:

                result.append({

                    "title":title.strip(),
                    "body":desc.strip()[:200],
                    "link":link

                })

        return result

    except Exception as e:

        log.warning(f"RSS 실패 {url} {e}")

        return []

# -------------------------------
# 종목 탐지
# -------------------------------

def detect_code(text):

    text = text.lower()

    for kw,code in KEYWORDS.items():

        if kw in text:

            return code

    return "market"

# -------------------------------
# 뉴스 생성
# -------------------------------

def build_news(raw, uid):

    text = raw["title"] + " " + raw["body"]

    code = detect_code(text)

    return {

        "id": uid,

        "code": code,

        "title": raw["title"],

        "body": raw["body"],

        "link": raw["link"],

        "time": datetime.now(KST).strftime("%H:%M"),

        "collectedAt": datetime.now(KST).isoformat()

    }

# -------------------------------
# 뉴스 수집
# -------------------------------

def update_news():

    log.info("="*50)
    log.info("뉴스 수집 시작")
    log.info("="*50)

    news = []
    seen = set()

    uid = int(time.time()*1000)

    for name,url in RSS_FEEDS:

        raws = fetch_rss(url)

        log.info(f"{name} {len(raws)}건")

        for raw in raws:

            title = raw["title"]

            if title in seen:

                continue

            seen.add(title)

            news.append(build_news(raw,uid))

            uid += 1

        time.sleep(0.5)

    news = news[:80]

    NEWS_FILE.write_text(
        json.dumps(news,ensure_ascii=False,indent=2),
        "utf-8"
    )

    log.info(f"news.json 저장 {len(news)}건")

    return news

# -------------------------------
# 간단 AI 분석 (더미)
# -------------------------------

def update_analysis(news):

    codes = {}

    for n in news:

        code = n["code"]

        if code == "market":

            continue

        codes.setdefault(code,0)

        codes[code]+=1

    result = {}

    for code,count in codes.items():

        if count >= 3:

            verdict="매수"

        elif count >=2:

            verdict="관망"

        else:

            verdict="중립"

        result[code] = {

            "verdict": verdict,

            "confidence": min(60 + count*5, 90)

        }

    ANALYSIS_FILE.write_text(
        json.dumps(result,ensure_ascii=False,indent=2),
        "utf-8"
    )

    log.info(f"analysis.json 저장 {len(result)}종목")

# -------------------------------

if __name__ == "__main__":

    news = update_news()

    update_analysis(news)

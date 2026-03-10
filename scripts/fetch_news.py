#!/usr/bin/env python3
"""
KOSPI 뉴스 + Gemini AI 분석 자동화 (안정 버전)

- RSS 뉴스 수집
- 종목 매칭
- 뉴스 분석
- Gemini AI 분석
- news.json / analysis.json 생성
"""

import json
import logging
import sys
import time
import re
import html as html_mod
import os
import urllib.request
import xml.etree.ElementTree as ET

from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import Counter

BASE_DIR = Path(__file__).resolve().parent.parent

NEWS_FILE = BASE_DIR / "news.json"
ANALYSIS_FILE = BASE_DIR / "analysis.json"

LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

log = logging.getLogger("news")

KST = timezone(timedelta(hours=9))

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# ------------------------------------------------
# 종목 메타
# ------------------------------------------------

STOCK_META = {
"005930":{"name":"삼성전자","themes":["반도체","AI"]},
"000660":{"name":"SK하이닉스","themes":["반도체","HBM","AI"]},
"373220":{"name":"LG에너지솔루션","themes":["2차전지"]},
"207940":{"name":"삼성바이오로직스","themes":["바이오"]},
"005380":{"name":"현대차","themes":["자동차","EV"]},
"000270":{"name":"기아","themes":["자동차","EV"]},
"068270":{"name":"셀트리온","themes":["바이오"]},
"105560":{"name":"KB금융","themes":["금융"]},
"055550":{"name":"신한지주","themes":["금융"]},
"035420":{"name":"NAVER","themes":["AI","IT"]},
"035720":{"name":"카카오","themes":["AI","IT"]},
}

# ------------------------------------------------
# 키워드 맵 생성
# ------------------------------------------------

KEYWORD_MAP = {}

for code,meta in STOCK_META.items():
    for kw in [meta["name"]]+meta["themes"]:
        KEYWORD_MAP[kw]=code

# ------------------------------------------------
# RSS 목록
# ------------------------------------------------

RSS_FEEDS = [

("GoogleKOSPI",
"https://news.google.com/rss/search?q=KOSPI&hl=ko&gl=KR&ceid=KR:ko"),

("매일경제",
"https://www.mk.co.kr/rss/50200011/"),

("한국경제",
"https://www.hankyung.com/feed/finance"),

("연합뉴스경제",
"https://www.yna.co.kr/rss/economy.xml"),

("Investing",
"https://kr.investing.com/rss/news.rss"),
]

# ------------------------------------------------
# RSS fetch
# ------------------------------------------------

def fetch_rss(url):

    try:

        req=urllib.request.Request(
        url,
        headers={"User-Agent":"Mozilla/5.0"}
        )

        with urllib.request.urlopen(req,timeout=10) as r:
            raw=r.read()

        root=ET.fromstring(raw)

        items=root.findall(".//item")

        result=[]

        for item in items:

            title=item.findtext("title","").strip()
            desc=item.findtext("description","").strip()
            link=item.findtext("link","").strip()
            pub=item.findtext("pubDate","")

            title=html_mod.unescape(re.sub("<[^>]+>","",title))
            desc=html_mod.unescape(re.sub("<[^>]+>","",desc))

            if title:

                result.append({
                "title":title,
                "body":desc[:200],
                "link":link,
                "pubDate":pub
                })

        return result

    except Exception as e:

        log.warning(f"RSS 실패 {url} {e}")

        return []

# ------------------------------------------------
# 종목 매칭
# ------------------------------------------------

def detect_code(title,body):

    text=title+" "+body

    for kw in sorted(KEYWORD_MAP.keys(),key=len,reverse=True):

        if kw in text:
            return KEYWORD_MAP[kw]

    return None

# ------------------------------------------------
# 뉴스 타입
# ------------------------------------------------

def classify_type(text):

    if any(x in text for x in ["공시","수주","계약","MOU"]):
        return "official"

    if any(x in text for x in ["리포트","목표주가","증권"]):
        return "analyst"

    return "news"

# ------------------------------------------------
# 감성 분석
# ------------------------------------------------

def classify_sentiment(text):

    pos=["상승","급등","호재","수주","성장","증가"]
    neg=["하락","급락","악재","감소","손실"]

    p=sum(1 for k in pos if k in text)
    n=sum(1 for k in neg if k in text)

    if p>n:
        return "긍정"

    if n>p:
        return "부정"

    return "중립"

# ------------------------------------------------
# 뉴스 생성
# ------------------------------------------------

def build_news(raw,code,uid):

    text=raw["title"]+" "+raw["body"]

    return {

    "id":uid,
    "code":code,
    "title":raw["title"],
    "body":raw["body"],
    "link":raw["link"],
    "time":datetime.now(KST).strftime("%H:%M"),
    "type":classify_type(text),
    "sent":classify_sentiment(text),
    "impactScore":60,
    "collectedAt":datetime.now(KST).isoformat()
    }

# ------------------------------------------------
# 뉴스 수집
# ------------------------------------------------

def update_news():

    log.info("뉴스 수집 시작")

    items=[]
    seen=set()

    uid=int(time.time()*1000)

    for name,url in RSS_FEEDS:

        raws=fetch_rss(url)

        log.info(f"{name} {len(raws)}건")

        for raw in raws:

            title=raw["title"]

            if title in seen:
                continue

            seen.add(title)

            code=detect_code(title,raw["body"])

            if code is None:
                continue

            items.append(build_news(raw,code,uid))

            uid+=1

        time.sleep(0.3)

    items=items[:80]

    NEWS_FILE.write_text(
        json.dumps(items,ensure_ascii=False,indent=2),
        "utf-8"
    )

    log.info(f"news.json 저장 {len(items)}")

    return items

# ------------------------------------------------
# Gemini 분석
# ------------------------------------------------

def gemini_analyze(stocks):

    if not GEMINI_API_KEY:
        log.warning("GEMINI 키 없음")
        return {}

    results={}

    url=f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"

    for s in stocks:

        prompt=f"""
한국 주식 {s['name']} 투자 분석.
최근 뉴스: {';'.join(s['news'])}

JSON만 출력
{{"verdict":"매수|관망|매도","summary":"2문장"}}
"""

        body=json.dumps({
        "contents":[{"parts":[{"text":prompt}]}]
        }).encode()

        try:

            req=urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type":"application/json"},
            method="POST"
            )

            with urllib.request.urlopen(req,timeout=15) as r:

                data=json.loads(r.read().decode())

            txt=data["candidates"][0]["content"]["parts"][0]["text"]

            txt=re.sub("```json|```","",txt)

            results[s["code"]]=json.loads(txt)

        except Exception as e:

            log.warning(f"Gemini 실패 {e}")

        time.sleep(4)

    return results

# ------------------------------------------------
# AI 분석 실행
# ------------------------------------------------

def update_ai(news):

    counter=Counter(n["code"] for n in news)

    top_codes=[c for c,_ in counter.most_common(10)]

    stocks=[]

    for code in top_codes:

        meta=STOCK_META.get(code)

        if not meta:
            continue

        titles=[n["title"] for n in news if n["code"]==code][:3]

        stocks.append({
        "code":code,
        "name":meta["name"],
        "news":titles
        })

    results=gemini_analyze(stocks)

    ANALYSIS_FILE.write_text(
        json.dumps(results,ensure_ascii=False,indent=2),
        "utf-8"
    )

# ------------------------------------------------

if __name__=="__main__":

    news=update_news()

    update_ai(news)

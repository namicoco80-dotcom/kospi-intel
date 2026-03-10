import requests
import json
import os
from datetime import datetime
import feedparser

DATA_DIR = "data"
NEWS_FILE = f"{DATA_DIR}/news.json"

RSS_URL = "https://news.google.com/rss/search?q=KOSPI&hl=ko&gl=KR&ceid=KR:ko"

os.makedirs(DATA_DIR, exist_ok=True)


def load_existing():
    if os.path.exists(NEWS_FILE):
        with open(NEWS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_news(news):
    with open(NEWS_FILE, "w", encoding="utf-8") as f:
        json.dump(news, f, ensure_ascii=False, indent=2)


def collect_news():
    print("뉴스 수집 시작")

    existing = load_existing()
    existing_titles = {n["title"] for n in existing}

    feed = feedparser.parse(RSS_URL)

    new_items = []

    for entry in feed.entries:

        title = entry.title
        link = entry.link
        published = entry.published

        if title in existing_titles:
            continue

        item = {
            "title": title,
            "link": link,
            "published": published,
            "time": datetime.now().strftime("%Y-%m-%d %H:%M")
        }

        new_items.append(item)

    all_news = new_items + existing
    all_news = all_news[:200]

    save_news(all_news)

    print(f"신규 뉴스 {len(new_items)}건")
    print("news.json 저장 완료")


if __name__ == "__main__":
    collect_news()

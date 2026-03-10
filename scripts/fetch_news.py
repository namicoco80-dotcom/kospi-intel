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
    code: f"https://finance.naver.com/item/news_news.naver?code={code}&rss=true&isRss=true"
    for code in STOCK_META
}
# 폴백 URL (구버전)
NAVER_RSS_FALLBACK = {
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
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Referer": "https://finance.naver.com/",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
        root = 

async function initApp() {
  loadLocalState();
  applyTheme();
  renderTabBar();
  await loadGitHubData();
  render();
  startAutoRefresh();
}

function loadLocalState() {
  try {
    S.watchlist = JSON.parse(localStorage.getItem('ki_watchlist')||'[]');
    S.portfolio = JSON.parse(localStorage.getItem('ki_portfolio')||'[]');
    S.keywords = JSON.parse(localStorage.getItem('ki_keywords')||'[]');
    S.alertSettings = JSON.parse(localStorage.getItem('ki_alertSettings')||'{"surge":true,"newIssue":true,"keyword":true}');
    S.dartKey = localStorage.getItem('ki_dartKey')||'';
    S._cfWorkerUrl = localStorage.getItem('ki_cfWorkerUrl')||CF_WORKER_URL;
    S._theme = localStorage.getItem('ki_theme')||'light';
    NEWS = JSON.parse(localStorage.getItem('ki_newsCache')||'[]');
    const ac = JSON.parse(localStorage.getItem('ki_analysisCache')||'{}');
    NEWS.forEach(n=>{ const c=ac[String(n.id)]; if(c) Object.assign(n,c); });
  } catch(e){}
}

function saveLocalState() {
  try {
    localStorage.setItem('ki_watchlist',JSON.stringify(S.watchlist));
    localStorage.setItem('ki_portfolio',JSON.stringify(S.portfolio));
    localStorage.setItem('ki_keywords',JSON.stringify(S.keywords));
    localStorage.setItem('ki_alertSettings',JSON.stringify(S.alertSettings));
    localStorage.setItem('ki_dartKey',S.dartKey);
    localStorage.setItem('ki_cfWorkerUrl',S._cfWorkerUrl);
    localStorage.setItem('ki_theme',S._theme);
  } catch(e){}
}

/* ══════════════════════════════════════
   GitHub data/ 폴더에서 JSON 직접 fetch
   ══════════════════════════════════════ */
async function loadGitHubData() {
  const ts = '?t=' + Date.now(); // 캐시 방지

  try {
    // 1. news.json 로드
    const newsRes = await fetch(BASE_URL + 'data/public/news.json' + ts);
    if (newsRes.ok) {
      const rawNews = await newsRes.json();
      if (Array.isArray(rawNews) && rawNews.length > 0) {
        const ac = JSON.parse(localStorage.getItem('ki_analysisCache')||'{}');
        NEWS = rawNews.map((n, i) => {
          const norm = normalizeNewsItem(n, i);
          const cached = ac[String(norm.id)];
          if (cached) Object.assign(norm, cached);
          return norm;
        });
        NEWS.sort((a, b) => (b.impactScore||0) - (a.impactScore||0));
        try { localStorage.setItem('ki_newsCache', JSON.stringify(NEWS.slice(0,50))); } catch(e) {}
        console.log('✅ news.json 로드:', NEWS.length + '건');
      }
    }
  } catch(e) { console.warn('news.json 로드 실패:', e); }

  try {
    // 2. prices.json 로드
    const pricesRes = await fetch(BASE_URL + 'data/public/prices.json' + ts);
    if (pricesRes.ok) {
      const rawPrices = await pricesRes.json();
      PRICES = {};
      STOCKS_LIST = [];
      if (Array.isArray(rawPrices) && rawPrices.length > 0) {
        rawPrices.forEach(s => {
          PRICES[s.code] = s;
          STOCKS_LIST.push(s);
        });
        console.log('✅ prices.json 로드:', STOCKS_LIST.length + '종목');
      }
    }
  } catch(e) { console.warn('prices.json 로드 실패:', e); }

  try {
    // 3. supply.json 로드
    const supplyRes = await fetch(BASE_URL + 'data/public/supply.json' + ts);
    if (supplyRes.ok) {
      const rawSupply = await supplyRes.json();
      SUPPLY = {};
      if (Array.isArray(rawSupply) && rawSupply.length > 0) {
        rawSupply.forEach(s => { SUPPLY[s.code] = s; });
        console.log('✅ supply.json 로드:', rawSupply.length + '종목');
      }
    }
  } catch(e) { console.warn('supply.json 로드 실패:', e); }

  // 4. STOCKS_LIST 비어있으면 기본 목록 사용
  if (STOCKS_LIST.length === 0) {
    STOCKS_LIST = DEFAULT_STOCKS.map(s => ({...s, price: null, chg: null}));
    DEFAULT_STOCKS.forEach(s => { if (!PRICES[s.code]) PRICES[s.code] = {...s, price: null, chg: null}; });
  }

  // 5. 기본 포트/관심종목
  if (!S.portfolio.length) S.portfolio = [
    {"code":"005930","name":"삼성전자","buyPrice":68000,"qty":10,"sector":"반도체"},
    {"code":"000660","name":"SK하이닉스","buyPrice":145000,"qty":5,"sector":"반도체"},
    {"code":"035420","name":"NAVER","buyPrice":180000,"qty":3,"sector":"IT"}
  ];
  if (!S.watchlist.length) S.watchlist = ["005930","000660","035420","051910","006400"];

  // 6. 퀀트 점수
  STOCKS_LIST.forEach(s => {
    if (!QUANT[s.code]) QUANT[s.code] = {
      total: Math.floor(Math.random()*40+45),
      momentum: Math.floor(Math.random()*100),
      supply: Math.floor(Math.random()*100),
      value: Math.floor(Math.random()*100),
      tech: Math.floor(Math.random()*100)
    };
  });

  S._priceUpdatedAt = new Date();
  updateThemeStats();
}

async function fetchAllData() {
  await loadGitHubData();
}

function normalizeNewsItem(n, i) {
  return {
    id: n.id ?? i ?? Math.random(),
    title: n.title || '제목 없음',
    body: n.body || '',
    code: n.code || '000000',
    stockName: n.stockName || '',
    type: n.type || 'news',
    sent: n.sent || '중립',
    sources: n.sources ?? 1,
    speed: n.speed || '보통',
    urgency: n.urgency ?? 3,
    impactScore: n.impactScore ?? Math.floor(Math.random()*60+20),
    themes: n.themes || [],
    relStocks: n.relStocks || [],
    spreadHistory: n.spreadHistory || [],
    time: n.time || '--:--',
    collectedAt: n.collectedAt || new Date().toISOString(),
    url: n.url || '',
    score: n.score ?? null,
    verdict: n.verdict ?? null,
    detail: n.detail ?? null,
    judgment: n.judgment ?? null,
    aiSummary: n.aiSummary ?? null,
    aiKeywords: n.aiKeywords ?? [],
    dartResult: n.dartResult ?? null
  };
}

function updateThemeStats() {
  THEMES_DATA.forEach(theme => {
    const rel = NEWS.filter(n => theme.codes.includes(n.code) || theme.codes.some(c => (n.relStocks||[]).some(r => r.code === c)));
    theme.news = rel.length;
    theme.avgImpact = rel.length ? Math.round(rel.reduce((a,b) => a + (b.impactScore||0), 0) / rel.length) : 0;
  });
}

function getWorkerUrl() { return S._cfWorkerUrl || CF_WORKER_URL; }

/* ──
function toggleTheme() { S._theme = S._theme === 'light' ? 'dark' : 'light'; applyTheme(); saveLocalState(); }
function applyTheme() { document.documentElement.setAttribute('data-theme', S._theme); }

let _refreshTimer = null;
function startAutoRefresh() {
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    if (S.autoRefresh) fetchAllData().then(() => { if (['my','feed','sk'].includes(S.tab)) render(); });
  }, 5 * 60 * 1000);
}

function fmt(n) { if(n==null) return '--'; return Math.abs(n)>=100000000?(n/100000000).toFixed(1)+'억':Math.abs(n)>=10000?(n/10000).toFixed(0)+'만':n.toLocaleString('ko-KR'); }
function fmtPrice(p) { if(p==null) return '--'; return p.toLocaleString('ko-KR')+'원'; }
function fmtChg(c) { if(c==null) return '--'; return (c>=0?'+':'')+c.toFixed(2)+'%'; }
function chgClass(c) { if(c==null) return 'num-neutral'; return c>0?'num-rise':c<0?'num-fall':'num-neutral'; }
function gradeOf(n) { const s=n.sources??1,t=n.type||'news'; if(t==='official'||s>=4) return 'A'; if(s>=2||t==='analyst') return 'B'; return 'C'; }
function stockName(code) { const s=PRICES[code]||STOCKS_LIST.find(s=>s.code===code)||DEFAULT_STOCKS.find(s=>s.code===code); return s?s.name:code; }
function stockLogo(code) { const n=stockName(code); return n?n.charAt(0):'?'; }
function fmtUpdated() {
  if (!S._priceUpdatedAt) return '';
  const d = S._priceUpdatedAt;
  return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+' 기준';
}

function showToast(msg) {
  const c = document.getElementById('toast-container'); if (!c) return;
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 2800);
}

function toggleWatchlist(code) {
  const i = S.watchlist.indexOf(code);
  if (i >= 0) { S.watchlist.splice(i,1); showToast('관심종목에서 제거했습니다.'); }
  else { S.watchlist.push(code); showToast('관심종목에 추가했습니다.'); }
  saveLocalState(); render();
}

function goFeedByCode(code) { S.tab = 'feed'; S.q = code; render(); }
function goFeedBySector(s) { S.tab = 'feed'; S.sector = s; S.q = ''; render(); }
function goFeedByTheme(t) { S.tab = 'feed'; S.themeFilter = t; render(); }

/* ══════
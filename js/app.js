/* ==================================================
   KOSPI INTEL - app.js
================================================== */


function bindInputs() {
  const si = document.getElementById('si');
  if(si) { si.addEventListener('input',e=>{S.q=e.target.value;reCards();}); if(S.q){si.focus();si.setSelectionRange(si.value.length,si.value.length);} }
  const dk = document.getElementById('dki');
  if(dk) dk.addEventListener('input',e=>{S.dartInp=e.target.value;});
}

/* ══ ACTIONS ══ */

function setTab(t){
  S.tab=t; S.themeFilter=null; render();
  if(t === 'board') setTimeout(() => renderBoardTab(), 100);
  if(t === 'port') {
    const ls = lsLoadPrices();
    if(Object.keys(ls).length) { applyLsPrices(ls); refreshPortfolioDom(); }
    fetchAllPrices().then(() => refreshPortfolioDom()).catch(() => {});
  }
  // 자산 탭 진입 시 ETF 현재가 자동 갱신
  if(t === 'asset') {
    setTimeout(() => refreshETFPrices(), 300);
  }
  if(t === 'my') {
    setTimeout(() => { refreshETFPrices(); fetchAllPrices().then(()=>render()).catch(()=>{}); }, 300);
  }
}

function setSec(s){S.sector=s;render()}

function setTF(t){S.tf=t;render()}

function setTheme(t){S.themeFilter=S.themeFilter===t?null:t;S.tab='feed';render()}

function setGrade(g){S.gradeFilter=g;reCards()}

function tog(id) {
  const item = NEWS.find(n => n.id === id);
  if (!item) return;
  showCardModal(item);
}

function togSK(c){S.sk=S.sk===c?null:c;S.tab='feed';render()}

function goCard(id){S.tab='feed';S.exp=id;render()}


function crawl(){
  if(S.crawling)return; S.crawling=true; render();
  setTimeout(()=>{
    autoFetchNews();
    S.crawling=false; render();
  }, 1800);
}

/* 알림 설정 */

function toggleAlert(key, val) {
  S.alertSettings[key] = val;
  safeSetLS('alertSettings', S.alertSettings);
  notify(`${val?'✅':'⏸'} ${key} ${val?'활성화':'비활성화'}`, 'info');
}

function addKw() {
  const v = (S.newKw || document.getElementById('kw-inp')?.value || '').trim();
  if(!v || S.keywords.includes(v)) return;
  S.keywords.push(v); S.newKw = '';
  safeSetLS('alertKeywords', S.keywords);
  notify(`🔑 키워드 [${v}] 추가`, 'ok'); render();
}

function removeKw(kw) {
  S.keywords = S.keywords.filter(k=>k!==kw);
  safeSetLS('alertKeywords', S.keywords);
  render();
}

function _init() {
  // 구버전 캐시 자동 삭제 (undefined 방지)
  try {
    const pa = JSON.parse(localStorage.getItem('portAnalysis') || '{}');
    const needsClear = Object.values(pa).some(a => !a.verdict || a.verdict === 'undefined');
    if (needsClear) {
      localStorage.removeItem('portAnalysis');
      console.log('[Cache] 구버전 분석 캐시 삭제');
    }
  } catch(e) { localStorage.removeItem('portAnalysis'); }
  // 기존 감성 히스토리 캐시 sent 값 교정 (구버전 호환)
  try {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('mem_sent_'));
    allKeys.forEach(key => {
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const fixed = arr.map(h => ({
          ...h,
          // sent 값 정규화
          sent: h.sent === 'pos' || h.sent === 'positive' ? '긍정' :
                h.sent === 'neg' || h.sent === 'negative' ? '부정' :
                h.sent === 'neutral' || !h.sent ? '중립' : h.sent,
          // impactScore 통일
          impactScore: h.impactScore || h.impact || 50,
          impact: h.impactScore || h.impact || 50,
        }));
        localStorage.setItem(key, JSON.stringify(fixed));
      } catch(e) {}
    });
    if (allKeys.length > 0) console.log('[Cache] 감성 히스토리 교정 완료:', allKeys.length, '개');
  } catch(e) {}

  // 백그라운드 데이터 로드
  fetchQuantData();
  fetchFundamentalData();
  // 먼저 render 실행 (즉각 화면 표시)
  try { render(); } catch(e) {
    console.error('[KOSPI] render 초기 오류:', e);
    HEALTH.log('render', 'render 초기 오류', e.message);
    var app = document.getElementById('app');
    if(app) app.innerHTML = '<div style="color:#F2EBD9;padding:60px 20px;text-align:center"><div style="font-size:48px;margin-bottom:16px">⚠️</div><div style="font-size:16px;font-weight:700;margin-bottom:8px">초기화 오류</div><div style="font-size:12px;color:#8A7D68;margin-bottom:24px;font-family:monospace">' + e.message + '</div><button onclick="location.reload()" style="background:#E8921E;border:none;border-radius:12px;padding:12px 24px;color:#fff;font-size:14px;font-weight:700;cursor:pointer">새로고침</button></div>';
  }
  try { startAutoRefresh(); } catch(e) { console.error('[KOSPI] autoRefresh 오류:', e); }
}
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}

// ── 카드 상세 모달 (하단 시트) ──

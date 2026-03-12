function rPortfolio() {
  const total = calcPortTotal(), pnl = calcPortPnl(), pct = total.cost>0?((pnl/total.cost)*100).toFixed(2):'0.00';
  return `<div class="fade-in">
    <div class="section-header"><span class="section-title">내 포트폴리오</span><button class="btn btn-sm btn-outline" onclick="showAddPortModal()">+ 추가</button></div>
    <div class="port-summary">
      <div style="font-size:.86rem;font-weight:700;color:var(--text-muted)">평가 현황</div>
      <div class="port-summary-grid">
        <div class="port-stat"><div class="port-stat-label">총 평가금액</div><div class="port-stat-val">${fmtPrice(total.eval)}</div></div>
        <div class="port-stat"><div class="port-stat-label">평가손익</div><div class="port-stat-val ${chgClass(pnl)}">${pnl>=0?'+':''}${pnl.toLocaleString('ko-KR')}원</div></div>
        <div class="port-stat"><div class="port-stat-label">투자원금</div><div class="port-stat-val">${fmtPrice(total.cost)}</div></div>
        <div class="port-stat"><div class="port-stat-label">수익률</div><div class="port-stat-val ${chgClass(parseFloat(pct))}">${pnl>=0?'+':''}${pct}%</div></div>
      </div>
    </div>
    <div class="card" style="margin:0 16px 12px;border-radius:var(--r-lg);">
      ${S.portfolio.length===0?'<div class="empty-state" style="padding:40px;"><p>보유 종목이 없습니다</p></div>':S.portfolio.map(p=>portItemHTML(p,total.eval)).join('')}
    </div>
    <div class="section-header"><span class="section-title">퀀트 점수</span></div>
    <div class="card" style="margin:0 16px 16px;border-radius:var(--r-lg);padding:14px 16px;">
      ${S.portfolio.map(p => { const q=QUANT[p.code]||{total:50}; const c=q.total>=70?'var(--rise)':q.total>=40?'var(--gold)':'var(--fall)'; return `<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:.86rem;font-weight:600;">${stockName(p.code)}</span><span style="font-size:.71rem;color:var(--text-muted);">${p.code}</span></div><div class="quant-score"><div class="quant-bar-wrap"><div class="quant-bar" style="width:${q.total}%;background:${c};"></div></div><div class="quant-val" style="color:${c};">${q.total}</div></div></div>`; }).join('')||'<div class="empty-state" style="padding:24px;"><p>종목 없음</p></div>'}
    </div>
  </div>`;
}

function portItemHTML(p, totalEval) {
  const cur = PRICES[p.code]?.price || p.buyPrice, ev = cur*p.qty, pnl = (cur-p.buyPrice)*p.qty;
  const pct = ((cur-p.buyPrice)/p.buyPrice*100).toFixed(2), wt = totalEval>0?(ev/totalEval*100).toFixed(1):'0.0';
  return `<div class="port-item">
    <div class="stock-logo">${stockLogo(p.code)}</div>
    <div class="port-item-info">
      <div class="port-item-name">${p.name||stockName(p.code)}</div>
      <div class="port-item-detail">${p.qty}주 · 평균 ${p.buyPrice.toLocaleString('ko-KR')}원</div>
      <div class="port-item-bar-wrap"><div class="port-item-bar" style="width:${wt}%;background:${pnl>=0?'var(--rise)':'var(--fall)'};"></div></div>
      <div style="font-size:.64rem;color:var(--text-muted);margin-top:2px;">비중 ${wt}%</div>
    </div>
    <div class="port-item-right">
      <div class="port-item-val">${fmtPrice(ev)}</div>
      <div class="port-item-pnl ${chgClass(pnl)}">${pnl>=0?'+':''}${pnl.toLocaleString('ko-KR')}원</div>
      <div class="port-item-pnl ${chgClass(parseFloat(pct))}">(${parseFloat(pct)>=0?'+':''}${pct}%)</div>
    </div>
  </div>`;
}

function showAddPortModal() {
  const html = `<div class="modal-backdrop show" id="port-backdrop" onclick="closePortModal()"></div><div class="bottom-sheet show" id="port-modal"><div class="sheet-handle"></div><div class="sheet-body" style="padding:20px;"><div style="font-size:1rem;font-weight:700;margin-bottom:16px;">종목 추가</div><div class="form-row"><div class="form-field"><label class="form-label">종목코드</label><input class="form-input" id="port-code" placeholder="005930" maxlength="6"></div><div class="form-field"><label class="form-label">종목명</label><input class="form-input" id="port-name" placeholder="삼성전자"></div></div><div class="form-row"><div class="form-field"><label class="form-label">매수가 (원)</label><input class="form-input" id="port-price" type="number" placeholder="68000"></div><div class="form-field"><label class="form-label">수량 (주)</label><input class="form-input" id="port-qty" type="number" placeholder="10"></div></div><button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="addPortItem()">추가하기</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
function closePortModal() { document.getElementById('port-backdrop')?.remove(); document.getElementById('port-modal')?.remove(); }
function addPortItem() {
  const code = document.getElementById('port-code')?.value.trim(), name = document.getElementById('port-name')?.value.trim();
  const price = parseFloat(document.getElementById('port-price')?.value), qty = parseInt(document.getElementById('port-qty')?.value);
  if (!code||!price||!qty) { showToast('모든 항목을 입력하세요'); return; }
  S.portfolio.push({code, name:name||code, buyPrice:price, qty}); saveLocalState(); closePortModal(); render(); showToast('포트폴리오에 추가했습니다.');
}

/* ══════ 매매기록 탭 ══════ */
function rTradelog() {
  let hist = []; try { hist = JSON.parse(localStorage.getItem('ki_tradeHistory')||'[]'); } catch(e) {}
  return `<div class="fade-in">
    <div class="trade-form-card">
      <div class="trade-form-title">매매 기록 추가</div>
      <div class="trade-type-toggle">
        <button class="trade-type-btn ${S._tradeType==='buy'?'active-buy':''}" onclick="S._tradeType='buy';render()">매수</button>
        <button class="trade-type-btn ${S._tradeType==='sell'?'active-sell':''}" onclick="S._tradeType='sell';render()">매도</button>
      </div>
      <div style="height:10px;"></div>
      <div class="form-row"><div class="form-field"><label class="form-label">종목코드</label><input class="form-input" id="tr-code" placeholder="005930" maxlength="6"></div><div class="form-field"><label class="form-label">종목명</label><input class="form-input" id="tr-name" placeholder="삼성전자"></div></div>
      <div class="form-row"><div class="form-field"><label class="form-label">가격 (원)</label><input class="form-input" id="tr-price" type="number" placeholder="68000"></div><div class="form-field"><label class="form-label">수량</label><input class="form-input" id="tr-qty" type="number" placeholder="10"></div></div>
      <div class="form-row"><div class="form-field"><label class="form-label">날짜</label><input class="form-input" id="tr-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div></div>
      <button class="btn btn-primary" style="width:100%;margin-top:4px;" onclick="addTradeRecord()">기록 추가</button>
    </div>
    <div class="section-header"><span class="section-title">거래 내역</span><span style="font-size:.71rem;color:var(--text-muted);">${hist.length}건</span></div>
    <div class="card" style="margin:0 16px 16px;border-radius:var(--r-lg);">
      ${hist.length===0?'<div class="empty-state" style="padding:40px;"><p>매매 기록이 없습니다</p></div>':hist.slice().reverse().map(t=>{ const iB=t.type==='buy', amt=t.price*t.qty, dc=iB?'var(--rise)':'var(--fall)'; return `<div class="trade-record"><div class="trade-type-dot" style="background:${dc};"></div><div class="trade-info"><div class="trade-name">${t.name||t.code} <span style="font-size:.71rem;color:${dc};font-weight:700;">${iB?'매수':'매도'}</span></div><div class="trade-detail">${t.date} · ${t.qty}주 · ${t.price.toLocaleString('ko-KR')}원</div></div><div class="trade-right"><div class="trade-amount ${iB?'num-rise':'num-fall'}">${iB?'-':'+'}${amt.toLocaleString('ko-KR')}원</div><button style="font-size:.64rem;color:var(--text-muted);margin-top:4px;" onclick="deleteTrade('${t.id}')">삭제</button></div></div>`; }).join('')}
    </div>
  </div>`;
}

function addTradeRecord() {
  const code = document.getElementById('tr-code')?.value.trim(), name = document.getElementById('tr-name')?.value.trim();
  const price = parseFloat(document.getElementById('tr-price')?.value), qty = parseInt(document.getElementById('tr-qty')?.value);
  const date = document.getElementById('tr-date')?.value;
  if (!code||!price||!qty) { showToast('종목코드/가격/수량은 필수입니다'); return; }
  try { const h = JSON.parse(localStorage.getItem('ki_tradeHistory')||'[]'); h.push({id:'t'+Date.now(),code,name:name||code,type:S._tradeType,price,qty,date:date||''}); localStorage.setItem('ki_tradeHistory',JSON.stringify(h)); } catch(e) {}
  showToast('매매 기록이 추가됐습니다.'); render();
}

function deleteTrade(id) {
  try { const h = JSON.parse(localStorage.getItem('ki_tradeHistory')||'[]'); localStorage.setItem('ki_tradeHistory',JSON.stringify(h.filter(t=>t.id!==id))); } catch(e) {}
  render();
}

/* ══════ 테마 탭 ══════ */
function rHeatmap() {
  const sectors = [
    {name:'반도체',heat:90},{name:'AI',heat:85},{name:'2차전지',heat:60},
    {name:'바이오',heat:45},{name:'자동차',heat:55},{name:'IT',heat:70},
    {name:'화학',heat:35},{name:'금융',heat:40},{name:'규제',heat:75}
  ].map(s => ({...s, count:NEWS.filter(n=>(n.themes||[]).includes(s.name)).length}));

  return `<div class="fade-in">
    <div class="section-header"><span class="section-title">섹터 히트맵</span><span style="font-size:.71rem;color:var(--text-muted);">뉴스 열기 기반</span></div>
    <div class="heatmap-grid">
      ${sectors.map(s => { const x=s.heat/100, r=Math.round(220*x), b=Math.round(60+150*(1-x)), bg=`rgba(${r},${Math.round(60*(1-x))},${b},.85)`; return `<div class="heatmap-cell" style="background:${bg};color:#fff;" onclick="goFeedBySector('${s.name}')"><div class="heatmap-sector">${s.name}</div><div class="heatmap-count">뉴스 ${s.count}건</div><div style="font-size:.71rem;font-weight:700;margin-top:4px;">🔥${s.heat}</div></div>`; }).join('')}
    </div>
    <div class="section-header"><span class="section-title">테마별 현황</span></div>
    ${THEMES_DATA.map(t => `<div class="theme-card" onclick="goFeedByTheme('${t.name}')"><div class="theme-header"><div class="theme-name">${t.icon} ${t.name}</div><div class="theme-count">뉴스 ${t.news}건</div></div><div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;"><div class="quant-bar-wrap" style="flex:1;"><div class="quant-bar" style="width:${t.avgImpact}%;"></div></div><div style="font-family:var(--font-mono);font-size:.86rem;font-weight:700;" class="${t.avgImpact>=70?'num-rise':t.avgImpact>=40?'num-neutral':'num-fall'}">${t.avgImpact||'--'}</div></div><div class="theme-stocks">${t.codes.map(c=>`<span class="theme-stock-tag">${stockName(c)||c}</span>`).join('')}</div></div>`).join('')}
    <div style="height:8px;"></div>
  </div>`;
}

/* ══════ 종목 탭 ══════ */
function rStocks() {
  return `<div class="fade-in">
    <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input placeholder="종목명 또는 코드 검색" id="sk-search" value="${S.q}" oninput="S.q=this.value;renderSkList()"></div>
    <div class="chip-scroll">${SECTORS.map(s=>`<button class="chip${S.sector===s?' active':''}" onclick="S.sector='${s}';renderSkList()">${s}</button>`).join('')}</div>
    <div class="stocks-table">
      <div class="stocks-thead"><div class="stocks-th">종목</div><div class="stocks-th">현재가</div><div class="stocks-th">등락률</div><div class="stocks-th">Q</div></div>
      <div id="sk-list">${renderSkListHTML()}</div>
    </div>
  </div>`;
}

function renderSkListHTML() {
  let list = S.sector==='전체' ? STOCKS_LIST : STOCKS_LIST.filter(s=>s.sector===S.sector);
  const q = S.q.toLowerCase();
  if (q) list = list.filter(s => s.name.includes(S.q)||s.code.includes(S.q));
  if (!list.length) return '<div class="empty-state" style="padding:40px;"><p>검색 결과 없음</p></div>';
  return list.map(s => { const q2=QUANT[s.code]||{}, qs=q2.total||'--', qc=typeof qs==='number'?(qs>=70?'var(--rise)':qs>=40?'var(--gold)':'var(--fall)'):'var(--text-muted)'; return `<div class="stocks-row" onclick="showChartModal('${s.code}')"><div><div class="stocks-name">${S.watchlist.includes(s.code)?'<span style="color:var(--gold)">★</span> ':''}${s.name}</div><div class="stocks-code">${s.code}</div></div><div class="stocks-price">${s.price!=null?s.price.toLocaleString('ko-KR'):'--'}</div><div class="stocks-chg ${chgClass(s.chg)}">${fmtChg(s.chg)}</div><div class="stocks-quant" style="color:${qc};">${qs}</div></div>`; }).join('');
}

function renderSkList() { const el = document.getElementById('sk-list'); if (el) el.innerHTML = renderSkListHTML(); }

/* ══════
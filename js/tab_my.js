내종목 탭 ══════ */
function rMyStocks() {
  const pt = calcPortTotal(), pnl = calcPortPnl();
  const pct = pt.cost > 0 ? ((pnl/pt.cost)*100).toFixed(2) : '0.00';
  const qm = [{l:'주식홈\n바로가기',i:'📊',t:'sk'},{l:'포트\n분석',i:'💼',t:'port'},{l:'뉴스\n피드',i:'📰',t:'feed'},{l:'매매\n기록',i:'📝',t:'trade'},{l:'테마\n지도',i:'🗺️',t:'hm'},{l:'AI\n설정',i:'⚙️',t:'alert'}];
  const ws = S.watchlist.map(code => ({code, name:stockName(code), price:PRICES[code]?.price, chg:PRICES[code]?.chg, sup:SUPPLY[code]||{}, quant:(QUANT[code]||{}).total}));
  return `<div class="fade-in">
    <div class="asset-summary-card">
      <div class="asset-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 총 투자자산</div>
      <div class="asset-total">${fmtPrice(pt.eval)}</div>
      <div class="asset-pnl ${pnl>=0?'num-rise':'num-fall'}">${pnl>=0?'+':''}${pnl.toLocaleString('ko-KR')}원 (${pnl>=0?'+':''}${pct}%)</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <span style="font-size:.71rem;color:var(--text-muted);">${fmtUpdated()}</span>
        ${NEWS.length>0?`<span class="data-badge">📡 뉴스 ${NEWS.length}건</span>`:''}
      </div>
      <div class="asset-actions">
        <button class="asset-action-btn" onclick="switchTab('port')">자산 전체보기</button>
        <button class="asset-action-btn" onclick="switchTab('trade')">거래신청현황</button>
      </div>
    </div>
    <div class="quick-menu">${qm.map(m=>`<button class="quick-item" onclick="switchTab('${m.t}')"><div class="quick-icon">${m.i}</div><span class="quick-label">${m.l}</span></button>`).join('')}</div>
    <div class="section-header"><span class="section-title">관심종목</span><button class="section-link" onclick="switchTab('sk')">종목 추가 ›</button></div>
    <div class="card" style="margin:0 16px 12px;border-radius:var(--r-lg);">
      <div class="stock-list">${ws.length===0?'<div class="empty-state" style="padding:32px;"><p>관심종목을 추가하세요</p></div>':ws.map(s=>stockItemHTML(s)).join('')}</div>
    </div>
    <div class="section-header"><span class="section-title">주요 이슈</span><button class="section-link" onclick="switchTab('feed')">전체보기 ›</button></div>
    ${NEWS.slice(0,3).map(n=>miniNewsCard(n)).join('')||'<div class="empty-state"><p>뉴스 없음</p></div>'}
    <div style="height:8px;"></div>
  </div>`;
}

function stockItemHTML(s) {
  const sup = s.sup || {};
  const fD = (sup.foreign||0)>0?'▲':'▼', iD = (sup.institution||0)>0?'▲':'▼';
  const fC = (sup.foreign||0)>0?'var(--rise)':'var(--fall)', iC = (sup.institution||0)>0?'var(--rise)':'var(--fall)';
  return `<div class="stock-item" onclick="showChartModal('${s.code}')">
    <div class="stock-logo">${stockLogo(s.code)}</div>
    <div class="stock-info">
      <div class="stock-name">${s.name||s.code}</div>
      <div class="stock-code">${s.code}</div>
      <div class="stock-supply">
        <span class="supply-dot" style="background:${fC}20;color:${fC}">외${fD}</span>
        <span class="supply-dot" style="background:${iC}20;color:${iC}">기${iD}</span>
        ${s.quant!=null?`<span class="supply-dot" style="background:var(--accent-light);color:var(--accent)">Q${s.quant}</span>`:''}
      </div>
    </div>
    <div class="stock-price-wrap">
      <div class="stock-price">${s.price!=null?s.price.toLocaleString('ko-KR'):'--'}</div>
      <div class="stock-chg ${chgClass(s.chg)}">${fmtChg(s.chg)}</div>
    </div>
  </div>`;
}

function miniNewsCard(n) {
  const src = SRC[n.type]||SRC.news;
  return `<div style="margin:0 16px 6px;padding:12px 14px;background:var(--surface);border-radius:var(--r-md);border:1px solid var(--border);cursor:pointer;" onclick="S.tab='feed';render();setTimeout(()=>showCardModal(NEWS.find(x=>String(x.id)==='${String(n.id)}')),100)">
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
      <span style="font-size:.64rem;font-weight:700;padding:2px 7px;border-radius:4px;background:${src.bg};color:${src.color}">${src.label}</span>
      <span style="font-size:.71rem;color:var(--text-muted);margin-left:auto;">${n.time}</span>
    </div>
    <div style="font-size:.86rem;font-weight:600;line-height:1.4;color:var(--text-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${n.title}</div>
    ${n.url?`<div style="font-size:.71rem;color:var(--accent);margin-top:4px;" onclick="event.stopPropagation();window.open('${n.url}','_blank')">원문 보기 →</div>`:''}
  </div>`;
}

function calcPortTotal() {
  let cost=0, ev=0;
  S.portfolio.forEach(p => { const cur = PRICES[p.code]?.price || p.buyPrice; cost += p.buyPrice*p.qty; ev += cur*p.qty; });
  return {cost, eval: ev||cost};
}
function calcPortPnl() { const {cost, eval:ev} = calcPortTotal(); return ev - cost; }

/* ══════
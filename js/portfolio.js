/* ==================================================
   KOSPI INTEL - portfolio.js
================================================== */


function refreshPortfolioDom() {
  try {
    if (S.tab !== 'port' || !S.portfolio.length) return;

    /* 전체 요약 재계산 */
    let totalVal = 0, totalCost = 0;
    S.portfolio.forEach(p => {
      const pr = PRICE_BASE[p.code];
      if (!pr || pr.price === null || pr.price === undefined) return;
      totalVal  += pr.price * p.qty;
      totalCost += p.buyPrice * p.qty;
    });
    const totalPnl    = totalVal - totalCost;
    const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(2) : '0.00';
    const isGain      = totalPnl >= 0;
    const sign        = isGain ? '+' : '';
    const pnlColor    = isGain ? 'var(--teal)' : 'var(--rose)';

    /* 요약 행 갱신 */
    const rows = document.querySelectorAll('.port-sum-row');
    if (rows.length >= 3) {
      const valEl  = rows[0].querySelector('.port-sum-val');
      const costEl = rows[1].querySelector('.port-sum-val');
      const pnlEl  = rows[2].querySelector('.port-sum-val');
      if (valEl)  valEl.textContent  = totalVal.toLocaleString('ko-KR') + '원';
      if (costEl) costEl.textContent = totalCost.toLocaleString('ko-KR') + '원';
      if (pnlEl) {
        pnlEl.textContent = sign + totalPnlPct + '% (' +
          sign + Math.round(totalPnl).toLocaleString('ko-KR') + '원)';
        pnlEl.style.color = pnlColor;
      }
    }

    /* 종목별 카드 갱신 */
    S.portfolio.forEach(p => {
      const pr   = PRICE_BASE[p.code];
      const card = document.querySelector(`.port-card[data-port-code="${p.code}"]`);
      if (!card) return;

      const svEls = card.querySelectorAll('.port-sv');

      if (!pr || pr.price === null || pr.price === undefined) {
        /* 가격 없음 표시 */
        if (svEls[1]) { svEls[1].textContent = '—'; svEls[1].style.color = 'var(--ink3)'; }
        if (svEls[2]) svEls[2].textContent = '—';
        return;
      }

      const pnl    = (pr.price - p.buyPrice) * p.qty;
      const pnlPct = ((pr.price - p.buyPrice) / p.buyPrice * 100).toFixed(2);
      const isPos  = pnl >= 0;
      const sg     = isPos ? '+' : '';

      /* 현재가 */
      if (svEls[1]) {
        svEls[1].textContent = pr.price.toLocaleString('ko-KR');
        svEls[1].style.color = isPos ? 'var(--teal)' : 'var(--rose)';
      }
      /* 평가액 */
      if (svEls[2]) svEls[2].textContent = (pr.price * p.qty).toLocaleString('ko-KR');

      /* 수익률 */
      const pnlEl = card.querySelector('.port-pnl');
      if (pnlEl) {
        pnlEl.textContent = sg + pnlPct + '%';
        pnlEl.className   = 'port-pnl ' + (isPos ? 'pos' : 'neg');
      }
      /* 손익금액 */
      const pnlAmtEl = pnlEl?.nextElementSibling;
      if (pnlAmtEl) {
        pnlAmtEl.textContent = sg + Math.round(pnl).toLocaleString('ko-KR') + '원';
      }

      /* [data-price-code] 인라인 가격 태그 */
      const priceRow = card.querySelector('[data-price-code]');
      if (priceRow) {
        const vEl = priceRow.querySelector('.price-val');
        const cEl = priceRow.querySelector('.price-chg');
        const sEl = priceRow.querySelector('.price-source-tag');
        if (vEl) vEl.textContent = pr.price.toLocaleString('ko-KR') + '원';
        if (cEl) {
          cEl.textContent = (pr.chg >= 0 ? '+' : '') + (pr.chg ?? 0) + '%';
          cEl.className   = 'price-chg ' + (pr.chg > 0 ? 'up' : pr.chg < 0 ? 'dn' : 'flat');
        }
        if (sEl) {
          const labels = { live:'LIVE', json:'JSON', cached:'저장', cached_old:'구저장', manual:'수동' };
          sEl.textContent = labels[pr.dataSource] ?? 'SIM';
          sEl.className   = 'price-source-tag ' + (pr.dataSource === 'live' || pr.dataSource === 'json' ? 'live' : 'sim');
        }
      }
    });

  } catch(err) {
    console.warn('[PriceEngine] refreshPortfolioDom 오류:', err);
    if (S.tab === 'port') try { render(); } catch(_) {}
  }
}

/* ──────────────────────────────────────────
   🎛️  모달: 수동 입력 / 자동 조회
────────────────────────────────────────── */

function calcPortfolioIntelligence() {
  const port = S.portfolio;
  if (!port.length) return null;

  const items = port.map(p => {
    const pr  = PRICE_BASE[p.code];
    const st  = gs(p.code);
    const hasP = pr && pr.price !== null && pr.price !== undefined;
    const cur = hasP ? pr.price : p.buyPrice;
    const val = cur * p.qty;
    const cost = p.buyPrice * p.qty;
    const pnlPct = hasP ? (pr.price - p.buyPrice) / p.buyPrice * 100 : 0;
    const sup = SUPPLY_BASE[p.code];
    const news = NEWS.filter(n => n.code === p.code).slice(0, 5);
    const sentiment = news.reduce((s, n) => s + (n.sent==='긍정'?1:n.sent==='부정'?-1:0), 0);
    return { code:p.code, name:st?.name, sector:st?.sector, val, cost, pnlPct, sup, sentiment, hasP };
  }).filter(it => it.val > 0);

  if (!items.length) return null;

  const totalVal  = items.reduce((s, i) => s + i.val, 0);
  const totalCost = items.reduce((s, i) => s + i.cost, 0);

  // 섹터 집중도
  const sectorMap = {};
  items.forEach(it => { sectorMap[it.sector] = (sectorMap[it.sector]||0) + it.val; });
  const sectorList = Object.entries(sectorMap)
    .map(([s,v]) => ({ sector:s, pct:Math.round(v/totalVal*100) }))
    .sort((a,b) => b.pct - a.pct);
  const topSector = sectorList[0];
  const isConcentrated = topSector && topSector.pct >= 50;

  // 트렌드 점수
  const avgPnl   = items.reduce((s,i) => s+i.pnlPct, 0) / items.length;
  const avgSenti = items.reduce((s,i) => s+i.sentiment, 0) / items.length;
  const avgFlow  = items.filter(i=>i.sup).reduce((s,i)=>s+(i.sup.foreign+i.sup.inst),0) / (items.filter(i=>i.sup).length||1);
  let trendScore = 0;
  trendScore += avgPnl > 5 ? 3 : avgPnl > 0 ? 1 : avgPnl > -5 ? -1 : -3;
  trendScore += avgSenti > 1 ? 2 : avgSenti > 0 ? 1 : avgSenti < -1 ? -2 : -1;
  trendScore += avgFlow > 0 ? 2 : avgFlow < 0 ? -2 : 0;
  const trend      = trendScore >= 3 ? '상승 우세' : trendScore >= 1 ? '중립 우세' : trendScore >= -1 ? '혼조세' : '하락 우세';
  const trendColor = trendScore >= 3 ? '#E53935' : trendScore >= 1 ? '#2E7D32' : trendScore >= -1 ? '#E65100' : '#1565C0';
  const trendIcon  = trendScore >= 3 ? '📈' : trendScore >= 1 ? '↗️' : trendScore >= -1 ? '↔️' : '📉';

  // 리스크
  const maxDrawdown = Math.min(...items.map(i => i.pnlPct));
  const volatility  = items.reduce((s,i) => s+Math.abs(i.pnlPct), 0) / items.length;
  const riskScore   = (isConcentrated?30:0) + (volatility>15?30:volatility>7?15:0) + (maxDrawdown<-15?30:maxDrawdown<-7?15:0);
  const risk        = riskScore >= 50 ? '높음' : riskScore >= 25 ? '보통' : '낮음';
  const riskColor   = riskScore >= 50 ? '#E53935' : riskScore >= 25 ? '#E65100' : '#2E7D32';

  // 추천 액션
  const actions = [];
  if (isConcentrated) actions.push(`${topSector.sector} 섹터 집중도 ${topSector.pct}% — 분산 투자 권장`);
  if (maxDrawdown < -10) actions.push(`최대 손실 ${maxDrawdown.toFixed(1)}% — 손절 기준 재검토`);
  if (avgFlow < -50) actions.push('외국인·기관 전반 매도세 — 비중 축소 고려');
  if (avgFlow > 50 && trendScore >= 2) actions.push('수급 양호 & 상승세 — 현 포지션 유지');
  if (items.length < 3) actions.push('종목 수 부족 — 3~7종목 분산 보유 권장');
  if (!actions.length) actions.push('현재 포트폴리오 균형 양호 — 현 포지션 유지');

  const summary = `보유 ${items.length}종목 포트폴리오는 ${trend} 흐름${isConcentrated?`, ${topSector.sector} 집중(${topSector.pct}%)`:''}${risk==='높음'?'이며 리스크가 높습니다.':risk==='보통'?'이며 리스크는 보통 수준입니다.':'이며 안정적입니다.'}`;

  return { items, totalVal, sectorList, topSector, isConcentrated, trend, trendColor, trendIcon, trendScore, risk, riskColor, actions, summary, avgFlow };
}


function portIntelHTML(intel) {
  if (!intel) return '';
  const { sectorList, trend, trendColor, trendIcon, risk, riskColor, actions, summary, avgFlow } = intel;

  const sectorBars = sectorList.map(s => `
    <div style="margin-bottom:7px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11px;color:#0F1D3A;font-weight:700">${s.sector}</span>
        <span style="font-family:var(--mono);font-size:11px;color:#4A5A7A">${s.pct}%</span>
      </div>
      <div style="height:6px;background:#EEF1F8;border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${s.pct}%;background:${s.pct>=50?'#E53935':s.pct>=30?'#E65100':'#1565C0'};border-radius:3px"></div>
      </div>
    </div>`).join('');

  return `
  <div style="background:#FFFFFF;border:1px solid #E2E8F4;border-radius:18px;padding:16px;margin-bottom:14px;box-shadow:0 2px 12px rgba(21,101,192,0.07)">
    <div style="font-size:13px;font-weight:800;color:#0F1D3A;margin-bottom:12px">🧠 포트폴리오 종합 분석</div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:#F4F6FA;border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:18px;margin-bottom:3px">${trendIcon}</div>
        <div style="font-size:11px;font-weight:800;color:${trendColor}">${trend}</div>
        <div style="font-size:9px;color:#94A3B8;margin-top:2px">포트 트렌드</div>
      </div>
      <div style="background:#F4F6FA;border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:18px;margin-bottom:3px">${risk==='높음'?'⚠️':risk==='보통'?'⚡':'✅'}</div>
        <div style="font-size:11px;font-weight:800;color:${riskColor}">${risk}</div>
        <div style="font-size:9px;color:#94A3B8;margin-top:2px">리스크</div>
      </div>
      <div style="background:#F4F6FA;border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:18px;margin-bottom:3px">${avgFlow>=0?'🟢':'🔴'}</div>
        <div style="font-size:11px;font-weight:800;color:${avgFlow>=0?'#E53935':'#1565C0'}">${avgFlow>=0?'매수':'매도'}세</div>
        <div style="font-size:9px;color:#94A3B8;margin-top:2px">수급 방향</div>
      </div>
    </div>

    <div style="background:#F0F4FF;border:1px solid #C7D4F0;border-radius:12px;padding:11px 13px;margin-bottom:12px;font-size:12px;color:#0F1D3A;line-height:1.6">
      📋 ${summary}
    </div>

    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:8px">섹터 비중</div>
      ${sectorBars}
    </div>

    <div style="background:#F4F6FA;border-radius:12px;padding:12px">
      <div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:8px">💡 추천 액션</div>
      ${actions.map(a=>`
        <div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:6px">
          <span style="color:#1565C0;font-size:11px;margin-top:1px;flex-shrink:0">▶</span>
          <span style="font-size:12px;color:#0F1D3A;line-height:1.5">${a}</span>
        </div>`).join('')}
    </div>
  </div>`;
}
/* ── 포트폴리오 탭 ── */

function removePortfolio(code) {
  S.portfolio = S.portfolio.filter(p=>p.code!==code);
  delete S.portAnalysis[code];
  safeSetLS('portfolio', S.portfolio);
  notify('🗑 종목 삭제', 'info'); render();
}

/* ── AI 개인 투자 분석 결과 HTML ── */

function addPortfolio() {
  const code = S.portInp.code || document.getElementById('port-code')?.value;
  const buyPrice = Number(S.portInp.buyPrice || document.getElementById('port-price')?.value);
  const qty = Number(S.portInp.qty || document.getElementById('port-qty')?.value);
  if(!code || !buyPrice || !qty) { notify('⚠️ 모든 항목을 입력해주세요', 'warn'); return; }
  const existing = S.portfolio.findIndex(p=>p.code===code);
  if(existing>=0) { S.portfolio[existing] = {code, buyPrice, qty}; }
  else { S.portfolio.push({code, buyPrice, qty}); }
  S.portInp = {code:'', buyPrice:'', qty:''};
  safeSetLS('portfolio', S.portfolio);
  const s = gs(code);
  notify(`💼 ${s?.name} 포트폴리오 추가`, 'ok'); render();
}

function addWL() {
  const v = S.newWl || document.getElementById('wl-sel')?.value;
  if(!v || S.watchlist.includes(v)) return;
  S.watchlist.push(v); S.newWl = '';
  safeSetLS('watchlist', S.watchlist);
  const s = gs(v);
  notify(`⭐ ${s?.name} 관심 종목 추가`, 'ok'); render();
}

function removeWL(code) {
  S.watchlist = S.watchlist.filter(c=>c!==code);
  safeSetLS('watchlist', S.watchlist);
  render();
}

/* CF Worker URL 저장/테스트 */

function toggleWL(code) {
  if(S.watchlist.includes(code)) {
    S.watchlist = S.watchlist.filter(c=>c!==code);
    notify(`☆ 관심 종목 해제`, 'info');
  } else {
    S.watchlist.push(code);
    notify(`⭐ 관심 종목 추가`, 'ok');
  }
  safeSetLS('watchlist', S.watchlist);
  reCards();
}


function getMyStockList() {
  // 포트폴리오 + 관심종목 + ETF 전부 합치기
  const portStocks = (safeLS('portfolio', []) || []).map(p => p.code).filter(Boolean);
  const watchlist  = S.watchlist || [];
  const etfCodes   = (safeLS('assetPortfolio', []) || []).filter(p=>p.assetType==='etf').map(p=>p.id);
  const all = [...new Set([...portStocks, ...watchlist, ...etfCodes])];
  return all;
}


function rMyStocks() {
  const myCodes  = getMyStockList();
  const portItems = safeLS('portfolio', []) || [];
  const assetPort = safeLS('assetPortfolio', []) || [];

  // 총 평가 계산
  let totalInvest = 0, totalCur = 0;
  portItems.forEach(p => {
    const pr  = PRICE_BASE[p.code];
    const cur = pr?.price || p.avgPrice || p.buyPrice || 0;
    const avg = p.avgPrice || p.buyPrice || 0;
    if (cur && avg) { totalInvest += avg * (p.qty||1); totalCur += cur * (p.qty||1); }
  });
  const totalPnl    = totalCur - totalInvest;
  const totalPnlPct = totalInvest > 0 ? (totalPnl/totalInvest*100) : 0;
  const isTotalPlus = totalPnl >= 0;

  // 신호 계산 + 정렬
  const signalItems = myCodes.map(code => {
    const stock  = gs(code) || (ETF_LIST||[]).find(e=>e.code===code);
    const name   = stock?.name || code;
    const pr     = PRICE_BASE[code];
    const sig    = calcSignal(code);
    const portP  = portItems.find(p=>p.code===code);
    const assetP = assetPort.find(p=>p.id===code);
    return { code, name, pr, sig, portP, assetP };
  }).sort((a,b) => Math.abs(b.sig.score) - Math.abs(a.sig.score));

  // 긴급 종목 (autoBuy 또는 score 극단)
  const urgentBuy  = signalItems.filter(i => i.sig.autoBuy || i.sig.score >= 65);
  const urgentSell = signalItems.filter(i => i.sig.score <= 35 && i.sig.grade === 'D');

  return `<div style="padding:12px 14px 100px">

  <!-- AI 분석 3버튼 -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
    <button onclick="runPortfolioAI()"
      style="background:linear-gradient(135deg,#1565C0,#0D47A1);color:#fff;border:none;
      border-radius:14px;padding:12px 4px;font-size:11px;font-weight:800;cursor:pointer;
      touch-action:manipulation;line-height:1.6">
      ${S._portAILoading?'⟳':'📊'}<br>포트폴리오<br>종합분석
    </button>
    <button onclick="runTop5AI()"
      style="background:linear-gradient(135deg,#C62828,#B71C1C);color:#fff;border:none;
      border-radius:14px;padding:12px 4px;font-size:11px;font-weight:800;cursor:pointer;
      touch-action:manipulation;line-height:1.6">
      ${S._top5Loading?'⟳':'🔥'}<br>지금 사야할<br>TOP5
    </button>
    <button onclick="showMyTimingPicker()"
      style="background:linear-gradient(135deg,#E65100,#BF360C);color:#fff;border:none;
      border-radius:14px;padding:12px 4px;font-size:11px;font-weight:800;cursor:pointer;
      touch-action:manipulation;line-height:1.6">
      ⏱<br>종목 매수<br>타이밍
    </button>
  </div>

  <!-- 포트폴리오 요약 -->
  ${portItems.length > 0 ? `
  <div style="background:linear-gradient(135deg,#0F1D3A 0%,#1565C0 100%);
    border-radius:20px;padding:18px;margin-bottom:14px;color:#fff;position:relative;overflow:hidden">
    <div style="position:absolute;right:-10px;top:-10px;width:100px;height:100px;
      background:rgba(255,255,255,0.06);border-radius:50%"></div>
    <div style="font-size:11px;font-weight:700;opacity:.7;margin-bottom:2px">💼 내 포트폴리오</div>
    <div style="font-size:28px;font-weight:900;letter-spacing:-1px">
      ${Math.round(totalCur).toLocaleString()}원
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
      <span style="font-size:12px;opacity:.7">원금 ${Math.round(totalInvest).toLocaleString()}원</span>
      <span style="font-size:14px;font-weight:900;
        background:${isTotalPlus?'rgba(255,80,80,0.3)':'rgba(80,160,255,0.3)'};
        border-radius:20px;padding:3px 12px">
        ${isTotalPlus?'▲':'▼'} ${Math.abs(totalPnlPct).toFixed(2)}%
        &nbsp;${isTotalPlus?'+':''}${Math.round(totalPnl).toLocaleString()}원
      </span>
    </div>
  </div>` : ''}

  <!-- 긴급 행동 섹션 -->
  ${urgentBuy.length > 0 || urgentSell.length > 0 ? `
  <div style="margin-bottom:14px">
    <div style="font-size:12px;font-weight:900;color:#C62828;margin-bottom:8px">🚨 지금 행동 필요</div>
    ${[...urgentBuy.slice(0,2), ...urgentSell.slice(0,2)].map(item => `
    <div onclick="showMyStockDetail('${item.code}')"
      style="background:${item.sig.action.bg};border:2px solid ${item.sig.action.color}40;
      border-radius:14px;padding:12px 14px;margin-bottom:6px;cursor:pointer;
      display:flex;align-items:center;justify-content:space-between;touch-action:manipulation">
      <div>
        <div style="font-size:13px;font-weight:800;color:#0F1D3A">${item.name}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px">
          ${item.pr?.price ? item.pr.price.toLocaleString()+'원' : '—'}
          ${item.pr?.chg != null ? `<span style="color:${item.pr.chg>=0?'#E53935':'#1565C0'};font-weight:700">
            ${item.pr.chg>=0?'+':''}${item.pr.chg?.toFixed(2)}%</span>` : ''}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:900;color:${item.sig.action.color}">
          ${item.sig.action.emoji} ${item.sig.action.label}
        </div>
        <div style="font-size:11px;color:#94A3B8;margin-top:2px">퀀트 ${item.sig.score}점 · ${item.sig.grade}등급</div>
      </div>
    </div>`).join('')}
  </div>` : `
  <div style="background:#E8F5E9;border-radius:14px;padding:12px 14px;margin-bottom:14px;
    display:flex;align-items:center;gap:10px">
    <span style="font-size:20px">✅</span>
    <div style="font-size:13px;font-weight:700;color:#2E7D32">현재 긴급 신호 없음 — 홀딩 유지</div>
  </div>`}

  <!-- 전체 종목 -->
  <div style="font-size:12px;font-weight:900;color:#4A5A7A;margin-bottom:8px">
    📋 내 종목 전체 (${myCodes.length}개)
  </div>

  ${myCodes.length === 0 ? `
  <div style="text-align:center;padding:40px 20px;background:#F4F6FA;border-radius:16px">
    <div style="font-size:40px;margin-bottom:10px">📭</div>
    <div style="font-size:14px;font-weight:700;color:#4A5A7A;margin-bottom:6px">아직 종목이 없어요</div>
    <div style="font-size:12px;color:#94A3B8">포트폴리오 탭에서 종목을 추가하거나<br>뉴스 피드에서 ⭐ 관심종목 등록하세요</div>
  </div>` : signalItems.map(item => {
    const portP  = item.portP;
    const pnl    = portP && item.pr?.price ? (item.pr.price - (portP.avgPrice||portP.buyPrice||0)) * (portP.qty||1) : null;
    const pnlPct = portP && item.pr?.price && (portP.avgPrice||portP.buyPrice) ?
      ((item.pr.price - (portP.avgPrice||portP.buyPrice)) / (portP.avgPrice||portP.buyPrice) * 100) : null;

    return `
    <div onclick="showMyStockDetail('${item.code}')"
      style="background:#fff;border:1.5px solid ${item.sig.autoBuy?'#FFCDD2':'#E2E8F4'};
      border-radius:16px;padding:14px;margin-bottom:8px;cursor:pointer;touch-action:manipulation;
      box-shadow:0 2px 8px rgba(0,0,0,0.04)">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:14px;font-weight:800;color:#0F1D3A">${item.name}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:2px">${item.code}
            ${item.pr?.price ? ' · '+item.pr.price.toLocaleString()+'원' : ''}
            ${item.pr?.chg != null ? `<span style="color:${item.pr.chg>=0?'#E53935':'#1565C0'};font-weight:700">
              ${item.pr.chg>=0?'+':''}${item.pr.chg?.toFixed(2)}%</span>` : ''}
          </div>
        </div>
        <div style="background:${item.sig.action.bg};border-radius:20px;padding:5px 12px;flex-shrink:0">
          <div style="font-size:12px;font-weight:900;color:${item.sig.action.color}">
            ${item.sig.action.emoji} ${item.sig.action.label}
          </div>
          <div style="font-size:10px;text-align:center;color:#94A3B8">${item.sig.score}점·${item.sig.grade}</div>
        </div>
      </div>

      <!-- 신호 4개 -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px">
        ${item.sig.signals.map(s => `
        <div style="background:${s.real===false?'#FAFAFA':s.good?'#FFF0F0':s.bad?'#E8F4FF':'#F4F6FA'};
          border-radius:8px;padding:5px 4px;text-align:center;${s.real===false?'opacity:0.55':''}">
          <div style="font-size:9px;font-weight:800;
            color:${s.real===false?'#CBD5E0':s.good?'#E53935':s.bad?'#1565C0':'#94A3B8'}">${s.label}</div>
          <div style="font-size:10px;font-weight:700;
            color:${s.real===false?'#CBD5E0':s.good?'#C62828':s.bad?'#1565C0':'#4A5A7A'};
            margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${s.real===false?'없음':s.val}</div>
        </div>`).join('')}
      </div>

      <!-- 보유 수익 + 타이밍 버튼 -->
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding-top:8px;border-top:1px solid #F0F4FA">
        ${pnl !== null ? `
        <div>
          <div style="font-size:11px;color:#94A3B8">${portP.qty}주 · 평균 ${(portP.avgPrice||portP.buyPrice||0).toLocaleString()}원</div>
          <div style="font-size:13px;font-weight:800;color:${pnl>=0?'#E53935':'#1565C0'}">
            ${pnl>=0?'+':''}${Math.round(pnl).toLocaleString()}원 (${pnlPct>=0?'+':''}${pnlPct?.toFixed(2)}%)
          </div>
        </div>` : '<div></div>'}
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:9px;background:${item.sig.dataSource==='quant.json'?'#E8F5E9':'#FFF3E0'};
            color:${item.sig.dataSource==='quant.json'?'#2E7D32':'#E65100'};
            border-radius:4px;padding:2px 5px;font-weight:700">
            ${item.sig.dataSource==='quant.json'?'실데이터':'폴백'}
          </span>
          <button data-timing-code="${item.code}"
            onclick="event.stopPropagation();runBuyTiming(this.dataset.timingCode)"
            style="background:#EEF4FF;border:1px solid #C7D4F0;border-radius:10px;
            padding:6px 10px;font-size:11px;font-weight:700;color:#1565C0;
            cursor:pointer;touch-action:manipulation">⏱ 타이밍</button>
        </div>
      </div>
    </div>`;
  }).join('')}
  </div>`;
}



function calcSignal(code) {
  // ── quant.json 실제 데이터 우선, 없으면 폴백 ──
  const qd  = QUANT_DATA[code];   // 서버사이드 퀀트 데이터
  const pr  = PRICE_BASE[code];
  const sup = (window.SUPPLY_DATA || {})[code];

  // ── quant.json 있으면 그대로 사용 ──
  if (qd && qd.total != null) {
    const { total, grade, scores, details, autoBuy, conds } = qd;
    const gradeColor = {A:'#C62828',B:'#E65100',C:'#1565C0',D:'#4A5A7A'}[grade];
    const gradeBg    = {A:'#FFEBEE',B:'#FFF3E0',C:'#E3F2FD',D:'#F4F6FA'}[grade];
    const gradeLabel = {A:'강한보유',B:'보유',C:'관찰',D:'비중축소'}[grade];

    // 실제 데이터 여부 표시
    const real = (k) => details[k]?.real ? '' : ' ⚠️';

    const signals = [
      { label:'모멘텀', val: details.momentum?.val || '—',
        good: scores.momentum>=18, bad: scores.momentum<8,
        icon: scores.momentum>=18 ? '📈▲' : '📈▼',
        score: scores.momentum, max: 25, real: details.momentum?.real },
      { label:'52주', val: details.high52?.label || '—',
        good: scores.high52>=14, bad: scores.high52<=5,
        icon: scores.high52>=14 ? '🏔▲' : '🏔▼',
        score: scores.high52, max: 20, real: details.high52?.real },
      { label:'수급', val: details.supply?.label || '—',
        good: scores.supply>=15, bad: scores.supply<=5,
        icon: scores.supply>=15 ? '💰▲' : '💰▼',
        score: scores.supply, max: 20, real: details.supply?.real },
      { label:'기술', val: details.technical?.label || '—',
        good: scores.technical>=12, bad: scores.technical<=5,
        icon: scores.technical>=12 ? '📊▲' : '📊▼',
        score: scores.technical, max: 15, real: details.technical?.real },
    ];

    const action = {
      label: autoBuy ? '매수신호' : gradeLabel,
      color: autoBuy ? '#C62828' : gradeColor,
      bg:    autoBuy ? '#FFEBEE' : gradeBg,
      emoji: autoBuy ? '🚀' : {A:'💎',B:'✅',C:'👀',D:'⚠️'}[grade],
    };
    return { score:total, grade, gradeLabel, gradeColor, gradeBg, scores, details,
             signals, action, autoBuy, conds, dataSource:'quant.json' };
  }

  // ── 폴백: 가진 데이터로만 정직하게 계산 ──
  const chg = pr?.chg || 0;
  let scores = {}, details = {};

  // 모멘텀: 당일 등락률만 (12개월 데이터 없음)
  const ms = chg>3?18:chg>1?14:chg>0?11:chg>-1?8:chg>-3?5:2;
  scores.momentum = ms;
  details.momentum = {val:`${chg>=0?'+':''}${chg.toFixed(1)}%`, label:'당일기준⚠️', real:false};

  // 52주: 당일 고저가 위치만 (52주 데이터 없음)
  let pos = 50;
  if (pr?.high && pr?.low && pr?.price) {
    const hi = parseFloat(String(pr.high).replace(/,/g,''));
    const lo = parseFloat(String(pr.low).replace(/,/g,''));
    if (hi > lo) pos = Math.round((pr.price - lo) / (hi - lo) * 100);
  }
  scores.high52 = pos>=70?12:pos>=50?9:pos>=30?6:3;
  details.high52 = {val:`당일${pos}%`, label:'52주데이터없음⚠️', real:false};

  // 수급: 당일 + 5일 연속 데이터
  const f = sup?.foreign || 0, inst = sup?.inst || 0;
  const s5 = SUPPLY5_DATA[code];
  const consec = s5?.consecutive_buy;
  const buyDays = s5?.buy_days || 0;
  let ss, slbl;
  if      (consec)          { ss=20; slbl='5일연속매수'; }
  else if (f>0&&inst>0)     { ss=20; slbl='쌍끌이매수'; }
  else if (buyDays>=3)      { ss=17; slbl=`${buyDays}일매수`; }
  else if (f>0)             { ss=15; slbl='외인매수'; }
  else if (inst>0)          { ss=12; slbl='기관매수'; }
  else if (f<0&&inst<0)     { ss=0;  slbl='쌍매도'; }
  else if (f<0)             { ss=5;  slbl='외인매도'; }
  else                      { ss=10; slbl='중립'; }
  scores.supply = ss;
  details.supply = {val:slbl, label:slbl, real:!!sup, buyDays, consecutive:consec};

  // 가치: FUND_DATA 실제 PBR 우선, 없으면 폴백
  const fdFb = FUND_DATA[code];
  if (fdFb && fdFb.pbr != null) {
    const pbr = fdFb.pbr, per = fdFb.per;
    const pbrS = pbr<=0.7?20 : pbr<=1?17 : pbr<=1.5?14 : pbr<=2?11 : pbr<=3?7 : 4;
    const perA = !per?0 : per<=10?2 : per<=20?1 : per<=30?0 : -2;
    scores.value = Math.min(20, Math.max(0, pbrS + perA));
    details.value = {val:`PBR${pbr} PER${per||'?'}`,
      label: pbr<=1?'저평가':pbr<=2?'적정':'고평가', pbr, per, real:true};
  } else {
    scores.value = 10;
    details.value = {val:'PBR없음⚠️', label:'미수집', real:false};
  }

  // 기술: 당일 시가대비만 (MACD/RSI 없음)
  let ts=8, tl='중립';
  if (pr?.price && pr?.open) {
    const op = parseFloat(String(pr.open).replace(/,/g,''));
    const ic = op>0 ? (pr.price-op)/op*100 : 0;
    if (ic>2&&pos>60){ts=13;tl='상승추세';}
    else if (ic>0)   {ts=10;tl='소폭상승';}
    else if (ic<-2)  {ts=4; tl='하락';}
  }
  scores.technical = ts;
  details.technical = {val:'MACD/RSI없음⚠️', label:tl+'(당일만)', real:false};

  const total = scores.momentum + scores.high52 + scores.supply + scores.value + scores.technical;
  const grade = total>=80?'A':total>=60?'B':total>=40?'C':'D';
  const gradeColor = {A:'#C62828',B:'#E65100',C:'#1565C0',D:'#4A5A7A'}[grade];
  const gradeBg    = {A:'#FFEBEE',B:'#FFF3E0',C:'#E3F2FD',D:'#F4F6FA'}[grade];
  const gradeLabel = {A:'강한보유',B:'보유',C:'관찰',D:'비중축소'}[grade];

  // 폴백에서는 3조건 모두 실제 확인 불가 → autoBuy 없음
  const autoBuy = false;
  const conds = {high52near:false, foreignBuy:f>0, macdRsi:false, momentum:chg>0};

  const signals = [
    {label:'모멘텀', val:details.momentum.val, good:ms>=14, bad:ms<8, icon:ms>=14?'📈▲':'📈▼', score:ms, max:25, real:false},
    {label:'52주',   val:details.high52.val,   good:false,  bad:false, icon:'🏔?', score:scores.high52, max:20, real:false},
    {label:'수급',   val:details.supply.val,   good:ss>=15, bad:ss<=5, icon:ss>=15?'💰▲':'💰▼', score:ss, max:20, real:!!sup},
    {label:'기술',   val:details.technical.label, good:ts>=12, bad:ts<=5, icon:ts>=12?'📊▲':'📊▼', score:ts, max:15, real:false},
  ];

  const action = {label:gradeLabel, color:gradeColor, bg:gradeBg,
    emoji:{A:'💎',B:'✅',C:'👀',D:'⚠️'}[grade]};

  return { score:total, grade, gradeLabel, gradeColor, gradeBg, scores, details,
           signals, action, autoBuy, conds, dataSource:'fallback' };
}



function showMyStockDetail(code) {
  const stock = gs(code) || ETF_LIST?.find(e=>e.code===code);
  const name  = stock?.name || code;
  const pr    = PRICE_BASE[code];
  const sig   = calcSignal(code);
  const ana   = (S.portAnalysis || {})[code];
  const news  = NEWS.filter(n => n.code === code).slice(0, 5);
  const sup   = (window.SUPPLY_DATA || {})[code];

  const root = document.createElement('div');
  root.id = 'my-stock-modal';
  root.innerHTML = `
  <div onclick="document.getElementById('my-stock-modal').remove();document.body.style.overflow=''"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:8000"></div>
  <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;
    border-radius:24px 24px 0 0;z-index:8001;max-height:88vh;overflow-y:auto;
    padding:0 0 40px;animation:slideUp .25s ease">

    <!-- 핸들 -->
    <div style="text-align:center;padding:12px 0 4px">
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;display:inline-block"></div>
    </div>

    <!-- 헤더 -->
    <div style="padding:14px 18px 16px;border-bottom:1px solid #F0F4FA">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:18px;font-weight:900;color:#0F1D3A">${name}</div>
          <div style="font-size:12px;color:#94A3B8;margin-top:2px">${code}
            ${pr?.price ? '· ' + pr.price.toLocaleString() + '원' : ''}
            ${pr?.chg != null ? `<span style="color:${pr.chg>=0?'#E53935':'#1565C0'};font-weight:700">
              ${pr.chg>=0?'+':''}${pr.chg.toFixed(2)}%</span>` : ''}
          </div>
        </div>
        <div>
          <div style="background:${sig.action.bg};border-radius:20px;padding:8px 16px;text-align:center">
            <div style="font-size:16px;font-weight:900;color:${sig.action.color}">
              ${sig.action.emoji} ${sig.action.label}
            </div>
          </div>
          <button onclick="document.getElementById('my-stock-modal').remove();document.body.style.overflow=''"
            style="display:block;margin:8px auto 0;background:none;border:none;color:#94A3B8;
            font-size:20px;cursor:pointer">✕</button>
        </div>
      </div>
    </div>

    <div style="padding:16px 18px">

      <!-- 신호 4가지 상세 -->
      <div style="font-size:11px;font-weight:800;color:#94A3B8;margin-bottom:8px">📊 매매 신호 분석</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
        ${sig.signals.map(s => `
        <div style="background:${s.good?'#FFF5F5':s.bad?'#EFF6FF':'#F8F9FA'};
          border:1.5px solid ${s.good?'#FFCDD2':s.bad?'#BBDEFB':'#E2E8F4'};
          border-radius:12px;padding:12px">
          <div style="font-size:11px;font-weight:800;
            color:${s.good?'#C62828':s.bad?'#1565C0':'#64748B'};margin-bottom:4px">${s.label}</div>
          <div style="font-size:14px;font-weight:900;
            color:${s.good?'#E53935':s.bad?'#1565C0':'#0F1D3A'}">${s.icon} ${s.val}</div>
        </div>`).join('')}
      </div>

      <!-- AI 분석 요약 -->
      ${ana ? `
      <div style="background:#EEF4FF;border-radius:12px;padding:13px;margin-bottom:12px">
        <div style="font-size:10px;font-weight:800;color:#1565C0;margin-bottom:6px">🤖 AI 버핏 분석</div>
        <div style="font-size:13px;font-weight:700;color:#0F1D3A;margin-bottom:4px">${ana.verdict}</div>
        <div style="font-size:12px;color:#4A5A7A;line-height:1.6">${ana.summary||''}</div>
        ${ana.buffett_quote ? `<div style="font-size:11px;color:#1565C0;font-style:italic;margin-top:6px">"${ana.buffett_quote}"</div>` : ''}
      </div>` : `
      <button onclick="showMyStockDetail.ana=true;runPortAnalysis('${code}');
        setTimeout(()=>{document.getElementById('my-stock-modal')?.remove();document.body.style.overflow='';showMyStockDetail('${code}')},3000)"
        style="width:100%;background:#EEF4FF;border:none;border-radius:12px;padding:13px;
        font-size:13px;font-weight:700;color:#1565C0;margin-bottom:12px;cursor:pointer;
        touch-action:manipulation">🤖 AI 버핏 스타일 분석 받기</button>`}

      <!-- 수급 -->
      ${sup ? `
      <div style="background:#F8F9FA;border-radius:12px;padding:13px;margin-bottom:12px">
        <div style="font-size:10px;font-weight:800;color:#4A5A7A;margin-bottom:8px">💰 오늘 수급</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center">
          ${[['외국인',sup.foreign,'#E53935'],['기관',sup.inst,'#1565C0'],['개인',sup.retail,'#2E7D32']].map(([label,val,color])=>`
          <div style="background:#fff;border-radius:8px;padding:8px">
            <div style="font-size:10px;color:#94A3B8;margin-bottom:2px">${label}</div>
            <div style="font-size:12px;font-weight:800;color:${val>0?'#E53935':val<0?color:'#94A3B8'}">
              ${val>0?'+':''}${val?.toLocaleString()}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- 관련 뉴스 -->
      ${news.length > 0 ? `
      <div style="font-size:11px;font-weight:800;color:#94A3B8;margin-bottom:8px">📰 관련 뉴스</div>
      ${news.map(n => `
      <div style="padding:10px 0;border-bottom:1px solid #F4F6FA;cursor:pointer"
        onclick="closeMyStockModal();showCardModal(n)"
        data-nid="${n.id}">
        <div style="font-size:12px;font-weight:700;color:#0F1D3A;line-height:1.5">${n.title}</div>
        <div style="font-size:10px;color:${n.sent==='긍정'?'#E53935':n.sent==='부정'?'#1565C0':'#94A3B8'};margin-top:3px">
          ${n.sent} · ${n.time}
        </div>
      </div>`).join('')}` : ''}

    </div>
  </div>`;
  document.getElementById('my-stock-modal')?.remove();
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
}


function closeMyStockModal() {
  document.getElementById('my-stock-modal')?.remove();
  document.body.style.overflow = '';
}


function showMyTimingPicker() {
  const myCodes = getMyStockList();
  if (myCodes.length === 0) {
    notify('⚠️ 내종목 탭에 종목을 먼저 추가하세요', 'warn'); return;
  }
  const el = document.createElement('div');
  el.id = 'timing-picker';
  el.innerHTML = `
  <div onclick="document.getElementById('timing-picker').remove();document.body.style.overflow=''"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000"></div>
  <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:24px 24px 0 0;
    z-index:9001;max-height:70vh;overflow-y:auto;padding:0 0 40px;animation:slideUp .25s ease">
    <div style="text-align:center;padding:12px 0 4px">
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;display:inline-block"></div>
    </div>
    <div style="padding:14px 18px 10px;border-bottom:1px solid #F0F4FA">
      <div style="font-size:15px;font-weight:900;color:#0F1D3A">⏱ 타이밍 분석할 종목 선택</div>
    </div>
    <div style="padding:12px 18px">
      ${myCodes.map(code => {
        const stock = gs(code) || ETF_LIST?.find(e=>e.code===code);
        const name = stock?.name || code;
        const pr = PRICE_BASE[code];
        return `<div onclick="document.getElementById('timing-picker').remove();document.body.style.overflow='';runBuyTiming('${code}')"
          style="display:flex;justify-content:space-between;align-items:center;
          padding:12px 0;border-bottom:1px solid #F4F6FA;cursor:pointer;touch-action:manipulation">
          <div>
            <div style="font-size:13px;font-weight:700;color:#0F1D3A">${name}</div>
            <div style="font-size:11px;color:#94A3B8">${code}</div>
          </div>
          <div style="text-align:right">
            ${pr?.price ? `<div style="font-size:13px;font-weight:700">${pr.price.toLocaleString()}원</div>` : ''}
            ${pr?.chg != null ? `<div style="font-size:11px;color:${pr.chg>=0?'#E53935':'#1565C0'};font-weight:700">${pr.chg>=0?'+':''}${pr.chg?.toFixed(2)}%</div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
  document.getElementById('timing-picker')?.remove();
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
}


// ══════════════════════════════════════════
// 📊 3가지 AI 분석 엔진
// ══════════════════════════════════════════

// ── 1. 포트폴리오 종합 분석 ──

function getTrades() { return safeLS('tradeHistory', []); }

function saveTrades(trades) {
  try { localStorage.setItem('tradeHistory', JSON.stringify(trades)); } catch(e) {}
}

// 매매기록 추가

function addTrade(e) {
  e?.preventDefault?.();
  const v = id => document.getElementById(id)?.value;
  const code     = (v('tr-code')||'').trim().toUpperCase();
  const name     = (v('tr-name')||code).trim();
  const buyPrice = parseFloat(v('tr-buy')||0);
  const sellPrice= parseFloat(v('tr-sell')||0);
  const qty      = parseInt(v('tr-qty')||1);
  const strategy = v('tr-strategy')||'단기';
  const reason   = v('tr-reason')||'';
  const buyDate  = v('tr-buydate')||'';
  const sellDate = v('tr-selldate')||'';

  if (!code || !buyPrice || !sellPrice) {
    notify('⚠️ 종목코드, 매수가, 매도가는 필수입니다', 'warn'); return;
  }

  const pnlPct  = ((sellPrice - buyPrice) / buyPrice * 100);
  const pnlAmt  = (sellPrice - buyPrice) * qty;
  const holding = buyDate && sellDate ?
    Math.round((new Date(sellDate) - new Date(buyDate)) / 86400000) : null;

  const trade = {
    id: Date.now(),
    code, name, buyPrice, sellPrice, qty,
    strategy, reason, buyDate, sellDate,
    pnlPct: Math.round(pnlPct*100)/100,
    pnlAmt: Math.round(pnlAmt),
    holdingDays: holding,
    createdAt: new Date().toISOString()
  };

  const trades = getTrades();
  trades.unshift(trade);
  saveTrades(trades);
  notify(`✅ ${name} 매매기록 추가됨 (${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}%)`, 'ok');
  render();
}

// 매매기록 삭제

function deleteTrade(id) {
  const trades = getTrades().filter(t => t.id !== id);
  saveTrades(trades);
  render();
}

// 핵심 성과 지표 계산

function calcTradeMetrics(trades) {
  if (!trades.length) return null;
  const wins   = trades.filter(t => t.pnlPct > 0);
  const losses = trades.filter(t => t.pnlPct <= 0);
  const winRate= Math.round(wins.length / trades.length * 100);
  const avgWin = wins.length ? wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length : 0;
  const avgLoss= losses.length ? Math.abs(losses.reduce((s,t)=>s+t.pnlPct,0)/losses.length) : 0;
  const rrRatio= avgLoss > 0 ? Math.round(avgWin/avgLoss*100)/100 : 0;
  const totalPnl = trades.reduce((s,t)=>s+t.pnlAmt,0);
  const grossProfit = wins.reduce((s,t)=>s+t.pnlAmt,0);
  const grossLoss   = Math.abs(losses.reduce((s,t)=>s+t.pnlAmt,0));
  const profitFactor= grossLoss > 0 ? Math.round(grossProfit/grossLoss*100)/100 : 0;

  // 최대 낙폭 (누적)
  let peak=0, cum=0, maxDD=0;
  trades.slice().reverse().forEach(t => {
    cum += t.pnlAmt;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  });

  // 전략별
  const strategies = {};
  trades.forEach(t => {
    if (!strategies[t.strategy]) strategies[t.strategy] = {trades:[],wins:0};
    strategies[t.strategy].trades.push(t);
    if (t.pnlPct > 0) strategies[t.strategy].wins++;
  });

  return { winRate, avgWin:Math.round(avgWin*100)/100, avgLoss:Math.round(avgLoss*100)/100,
           rrRatio, totalPnl, profitFactor, maxDD:Math.round(maxDD),
           total:trades.length, winCount:wins.length, lossCount:losses.length,
           strategies };
}

// 매매기록 탭 렌더

function rTradelog() {
  const trades  = getTrades();
  const metrics = calcTradeMetrics(trades);
  const today   = new Date().toISOString().slice(0,10);

  return `<div style="padding:12px 14px 100px">

  <!-- AI 분석 4버튼 -->
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px">
    <button onclick="runTradeAnalysis()"
      style="background:linear-gradient(135deg,#1565C0,#0D47A1);color:#fff;border:none;
      border-radius:14px;padding:13px 8px;font-size:11px;font-weight:800;cursor:pointer;
      touch-action:manipulation;line-height:1.5">
      📊 매매 성과 분석<br><span style="font-size:10px;opacity:.8">승률·손익비·약점</span>
    </button>
    <button onclick="runStrategyEval()"
      style="background:linear-gradient(135deg,#6A1B9A,#4A148C);color:#fff;border:none;
      border-radius:14px;padding:13px 8px;font-size:11px;font-weight:800;cursor:pointer;
      touch-action:manipulation;line-height:1.5">
      🤖 전략 자동 평가<br><span style="font-size:10px;opacity:.8">통계적 유효성</span>
    </button>
    <button onclick="runPortfolioImprove()"
      style="background:linear-gradient(135deg,#2E7D32,#1B5E20);color:#fff;border:none;
      border-radius:14px;padding:13px 8px;font-size:11px;font-weight:800;cursor:pointer;
      touch-action:manipulation;line-height:1.5">
      💼 포트폴리오 개선<br><span style="font-size:10px;opacity:.8">배분·리밸런싱</span>
    </button>
    <button onclick="runRiskMonitor()"
      style="background:linear-gradient(135deg,#C62828,#B71C1C);color:#fff;border:none;
      border-radius:14px;padding:13px 8px;font-size:11px;font-weight:800;cursor:pointer;
      touch-action:manipulation;line-height:1.5">
      🚨 리스크 감시<br><span style="font-size:10px;opacity:.8">위험 감지·보호조치</span>
    </button>
  </div>

  <!-- 성과 요약 카드 -->
  ${metrics ? `
  <div style="background:linear-gradient(135deg,#0F1D3A,#1565C0);border-radius:20px;
    padding:16px;margin-bottom:14px;color:#fff">
    <div style="font-size:11px;opacity:.7;margin-bottom:8px">📊 전체 성과 요약 (${metrics.total}건)</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
      ${[
        ['승률', metrics.winRate+'%', metrics.winRate>=60?'#FF8A80':metrics.winRate>=50?'#FFD180':'#80D8FF'],
        ['손익비', metrics.rrRatio+'x', metrics.rrRatio>=2?'#FF8A80':metrics.rrRatio>=1?'#FFD180':'#80D8FF'],
        ['수익팩터', metrics.profitFactor+'x', metrics.profitFactor>=1.5?'#FF8A80':'#FFD180'],
        ['총손익', (metrics.totalPnl>=0?'+':'')+metrics.totalPnl.toLocaleString()+'원', metrics.totalPnl>=0?'#FF8A80':'#80D8FF'],
        ['평균수익', '+'+metrics.avgWin+'%', '#FF8A80'],
        ['평균손실', '-'+metrics.avgLoss+'%', '#80D8FF'],
      ].map(([label,val,color])=>`
      <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:8px 4px">
        <div style="font-size:10px;opacity:.7;margin-bottom:2px">${label}</div>
        <div style="font-size:13px;font-weight:900;color:${color}">${val}</div>
      </div>`).join('')}
    </div>
    ${metrics.maxDD > 0 ? `
    <div style="margin-top:10px;padding:8px;background:rgba(255,80,80,0.2);border-radius:8px;
      font-size:11px;text-align:center">
      ⚠️ 최대 낙폭: ${metrics.maxDD.toLocaleString()}원
    </div>` : ''}
  </div>` : `
  <div style="background:#F4F6FA;border-radius:16px;padding:20px;text-align:center;margin-bottom:14px">
    <div style="font-size:32px;margin-bottom:8px">📭</div>
    <div style="font-size:13px;font-weight:700;color:#4A5A7A">아직 매매기록이 없어요</div>
    <div style="font-size:12px;color:#94A3B8;margin-top:4px">아래에서 거래를 추가하면 AI가 분석해 드려요</div>
  </div>`}

  <!-- 전략별 성과 -->
  ${metrics && Object.keys(metrics.strategies).length > 0 ? `
  <div style="margin-bottom:14px">
    <div style="font-size:12px;font-weight:900;color:#4A5A7A;margin-bottom:8px">전략별 성과</div>
    ${Object.entries(metrics.strategies).map(([strat, data]) => {
      const wr = Math.round(data.wins/data.trades.length*100);
      const avg = Math.round(data.trades.reduce((s,t)=>s+t.pnlPct,0)/data.trades.length*100)/100;
      const color = wr>=60?'#2E7D32':wr>=50?'#E65100':'#C62828';
      return `
      <div style="background:#fff;border:1.5px solid #E2E8F4;border-radius:12px;
        padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-size:13px;font-weight:800;color:#0F1D3A">${strat}</span>
          <span style="font-size:11px;color:#94A3B8;margin-left:6px">${data.trades.length}건</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:900;color:${color}">승률 ${wr}%</div>
          <div style="font-size:11px;color:${avg>=0?'#E53935':'#1565C0'}">평균 ${avg>=0?'+':''}${avg}%</div>
        </div>
      </div>`;
    }).join('')}
  </div>` : ''}

  <!-- 거래 입력 폼 -->
  <div style="background:#fff;border:1.5px solid #E2E8F4;border-radius:16px;padding:16px;margin-bottom:14px">
    <div style="font-size:13px;font-weight:900;color:#0F1D3A;margin-bottom:12px">➕ 거래 추가</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div>
        <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">종목코드 *</div>
        <input id="tr-code" type="text" placeholder="005930"
          style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
          font-size:13px;box-sizing:border-box;outline:none">
      </div>
      <div>
        <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">종목명</div>
        <input id="tr-name" type="text" placeholder="삼성전자"
          style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
          font-size:13px;box-sizing:border-box;outline:none">
      </div>
      <div>
        <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">매수가 * (원)</div>
        <input id="tr-buy" type="number" placeholder="75000"
          style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
          font-size:13px;box-sizing:border-box;outline:none">
      </div>
      <div>
        <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">매도가 * (원)</div>
        <input id="tr-sell" type="number" placeholder="82000"
          style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
          font-size:13px;box-sizing:border-box;outline:none">
      </div>
      <div>
        <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">수량 (주)</div>
        <input id="tr-qty" type="number" placeholder="10" value="1"
          style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
          font-size:13px;box-sizing:border-box;outline:none">
      </div>
      <div>
        <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">전략</div>
        <select id="tr-strategy"
          style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
          font-size:13px;box-sizing:border-box;outline:none;background:#fff">
          <option>단기</option><option>중기</option><option>장기</option>
          <option>스윙</option><option>모멘텀</option><option>가치</option>
        </select>
      </div>
      <div>
        <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">매수일</div>
        <input id="tr-buydate" type="date" value="${today}"
          style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
          font-size:13px;box-sizing:border-box;outline:none">
      </div>
      <div>
        <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">매도일</div>
        <input id="tr-selldate" type="date" value="${today}"
          style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
          font-size:13px;box-sizing:border-box;outline:none">
      </div>
    </div>
    <div style="margin-bottom:8px">
      <div style="font-size:10px;color:#94A3B8;margin-bottom:3px">진입 이유</div>
      <input id="tr-reason" type="text" placeholder="예: 52주신고가 돌파, 외국인 연속매수, 모멘텀..."
        style="width:100%;border:1.5px solid #E2E8F4;border-radius:8px;padding:8px 10px;
        font-size:13px;box-sizing:border-box;outline:none">
    </div>
    <button onclick="addTrade()"
      style="width:100%;background:#1565C0;color:#fff;border:none;border-radius:12px;
      padding:13px;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation">
      ✅ 거래 추가
    </button>
  </div>

  <!-- 거래 리스트 -->
  ${trades.length > 0 ? `
  <div style="font-size:12px;font-weight:900;color:#4A5A7A;margin-bottom:8px">
    📋 거래 내역 (${trades.length}건)
  </div>
  ${trades.slice(0, 30).map(t => `
  <div style="background:#fff;border:1.5px solid ${t.pnlPct>0?'#FFCDD2':'#BBDEFB'};
    border-radius:14px;padding:12px 14px;margin-bottom:6px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
      <div>
        <span style="font-size:13px;font-weight:800;color:#0F1D3A">${t.name}</span>
        <span style="font-size:11px;color:#94A3B8;margin-left:6px">${t.code}</span>
        <span style="font-size:10px;background:${
          t.strategy==='단기'?'#EEF4FF':t.strategy==='중기'?'#FFF3E0':'#E8F5E9'};
          color:${t.strategy==='단기'?'#1565C0':t.strategy==='중기'?'#E65100':'#2E7D32'};
          border-radius:4px;padding:2px 6px;margin-left:4px;font-weight:700">${t.strategy}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="font-size:16px;font-weight:900;color:${t.pnlPct>0?'#E53935':'#1565C0'}">
          ${t.pnlPct>0?'+':''}${t.pnlPct}%
        </div>
        <button data-del-id="${t.id}" onclick="deleteTrade(+this.dataset.delId)"
          style="background:#F4F6FA;border:none;border-radius:8px;padding:5px 10px;
          font-size:12px;color:#94A3B8;cursor:pointer;touch-action:manipulation">✕</button>
      </div>
    </div>
    <div style="display:flex;gap:12px;font-size:11px;color:#64748B">
      <span>매수 ${t.buyPrice.toLocaleString()}원</span>
      <span>→</span>
      <span>매도 ${t.sellPrice.toLocaleString()}원</span>
      <span style="color:${t.pnlPct>0?'#E53935':'#1565C0'};font-weight:700">
        ${t.pnlAmt>0?'+':''}${t.pnlAmt.toLocaleString()}원
      </span>
      ${t.holdingDays!=null?`<span>${t.holdingDays}일 보유</span>`:''}
    </div>
    ${t.reason ? `<div style="font-size:11px;color:#94A3B8;margin-top:4px">📌 ${t.reason}</div>` : ''}
  </div>`).join('')}` : ''}
  </div>`;
}


// ── AI 분석 1: 매매 성과 분석 ──

async function showETFAnalysis(code) {
  const etf = ETF_LIST.find(e=>e.code===code);
  if (!etf) return;
  notify(`🤖 ${etf.name} 분석 중...`, 'info');
  const prompt = `ETF 분석. JSON만 응답(설명없이):
ETF명: ${etf.name}
지역/유형: ${etf.region} ${etf.category}
설명: ${etf.desc}
운용보수: ${etf.expense}%
{"verdict":"적극추천","summary":"버핏관점 2문장","moat":"분산강점 1문장","quote":"버핏의 실제 명언 또는 그의 투자 철학을 담은 1문장 (한국어)","action":"매수/보유/관망 + 이유"}`;
  try {
    const res = await aiApiFetch({model:'claude-sonnet-4-20250514',max_tokens:600,system:'JSON만 응답. 마크다운 없이.',messages:[{role:'user',content:prompt}]});
    const data = await res.json();
    console.log('[ETF분석] 응답:', data);
    const rawTxt = data.content?.map(c=>c.text||'').join('') || '';
    const txt = rawTxt.replace(/```json|```/g,'').trim();
    console.log('[ETF분석] 파싱할 텍스트:', txt.slice(0,200));
    let ana = {};
    try { ana = JSON.parse(txt); } catch(pe) {
      // JSON 파싱 실패 시 텍스트에서 직접 추출
      ana = {
        verdict: '추천',
        summary: txt.slice(0, 150) || `${etf.name} 분석 완료`,
        moat: '분산투자로 개별 종목 리스크 최소화',
        quote: '훌륭한 기업을 적정한 가격에 사는 것이 낫다.',
        action: '장기 보유 권장'
      };
    }
    showETFModal(etf, ana);
  } catch(e) {
    console.error('[ETF분석] 오류:', e);
    showETFModal(etf, {
      verdict:'추천',
      summary:`${etf.name}은 ${etf.region} ${etf.category} ETF입니다. 운용보수 ${etf.expense}%로 ${etf.desc}.`,
      moat:'분산투자로 개별 종목 리스크 최소화',
      quote: getBuffettQuote('hold') + ' — 버핏',
      action:'장기 적립식 보유 권장'
    });
  }
}


function showETFModal(etf, ana) {
  // 기존 모달 제거
  document.getElementById('etf-modal')?.remove();
  const vColor = {'적극추천':'#1565C0','추천':'#2E7D32','보통':'#E65100','비추천':'#B71C1C'}[ana.verdict]||'#1565C0';
  const modal = document.createElement('div');
  modal.id = 'etf-modal';
  modal.innerHTML = `
  <div onclick="document.getElementById('etf-modal').remove()" style="
    position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;
    display:flex;align-items:flex-end;justify-content:center">
    <div onclick="event.stopPropagation()" style="
      background:#FFFFFF;border-radius:20px 20px 0 0;padding:20px 18px 40px;
      width:100%;max-width:500px;max-height:80vh;overflow-y:auto;
      box-shadow:0 -4px 30px rgba(0,0,0,0.15)">
      <!-- 핸들 -->
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;margin:0 auto 16px"></div>
      <!-- 헤더 -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-size:16px;font-weight:800;color:#0F1D3A">${etf.name}</div>
          <div style="font-size:12px;color:#94A3B8;margin-top:2px">${etf.region} · ${etf.category} · 보수 ${etf.expense}%</div>
        </div>
        <span style="padding:5px 12px;border-radius:20px;font-size:12px;font-weight:800;background:${vColor}20;color:${vColor}">${ana.verdict||'분석중'}</span>
      </div>
      <!-- 요약 -->
      <div style="background:#F4F6FA;border-radius:12px;padding:12px 14px;margin-bottom:10px;font-size:13px;color:#0F1D3A;line-height:1.6">${ana.summary||''}</div>
      <!-- 해자 -->
      ${ana.moat?`<div style="display:flex;gap:8px;align-items:flex-start;padding:10px 12px;background:#EEF4FF;border-radius:12px;margin-bottom:10px">
        <span style="font-size:16px">🏰</span>
        <div><div style="font-size:10px;font-weight:800;color:#1565C0;margin-bottom:2px">분산투자 강점</div>
        <div style="font-size:12px;color:#0F1D3A;line-height:1.5">${ana.moat}</div></div>
      </div>`:''}
      <!-- 버핏 명언 -->
      <div style="padding:10px 14px;background:#F0F4FF;border-left:3px solid #1565C0;border-radius:0 12px 12px 0;margin-bottom:10px">
        <div style="font-size:10px;font-weight:800;color:#1565C0;margin-bottom:3px">💬 버핏이라면</div>
        <div style="font-size:12px;color:#0F1D3A;font-style:italic;line-height:1.6">"${ana.quote || getBuffettQuote(
          ana.verdict==='적극추천'||ana.verdict==='매수' ? 'buy' :
          ana.verdict==='주의'||ana.verdict==='관망' ? 'caution' :
          ana.verdict==='매도' ? 'sell' : 'hold'
        )}"</div>
      </div>
      <!-- 액션 -->
      ${ana.action?`<div style="background:#1565C0;border-radius:12px;padding:12px 14px;text-align:center">
        <div style="font-size:12px;font-weight:800;color:#fff">${ana.action}</div>
      </div>`:''}
      <!-- 닫기 -->
      <button onclick="document.getElementById('etf-modal').remove()" style="
        width:100%;margin-top:12px;background:#F4F6FA;border:none;border-radius:12px;
        padding:12px;font-size:13px;font-weight:700;color:#4A5A7A">닫기</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}


async function runOverseasAnalysis(ticker) {
  const stock = OVERSEAS_LIST.find(o=>o.ticker===ticker);
  notify(`🤖 ${stock?.name||ticker} 버핏 분석 중...`, 'info');
  const prompt = `워런 버핏 관점에서 ${stock?.name||ticker}(${ticker})를 분석해주세요.
섹터: ${stock?.sector} / 설명: ${stock?.desc}
버핏의 해자·내재가치·장기전망 기준으로 평가하고 매수/보유/관망 판단을 한국어 3문장으로 답해주세요.`;
  try {
    const res = await aiApiFetch({model:'claude-sonnet-4-20250514',max_tokens:300,messages:[{role:'user',content:prompt}]});
    const data = await res.json();
    const txt = data.content?.map(c=>c.text||'').join('');
    notify(`💬 ${stock?.name}: ${txt.slice(0,100)}`, 'ok');
  } catch(e) { notify('⚠️ 분석 실패','info'); }
}


async function runPensionAnalysis(accId) {
  const pension = safeLS('pensionAccounts',[]);
  const acc = pension.find(a=>a.id===accId);
  if (!acc) return;
  const total = acc.items.reduce((s,i)=>s+i.value,0);
  const breakdown = acc.items.map(i=>`${i.name}:${total>0?Math.round(i.value/total*100):0}%`).join(', ');
  notify(`🤖 ${acc.name} 연금 배분 분석 중...`,'info');
  const prompt = `워런 버핏 + 장기 연금 전문가 관점에서 아래 포트폴리오를 분석해주세요.
계좌: ${acc.name}
현재 배분: ${breakdown}
총 자산: ${total.toLocaleString()}원

1. 현재 배분의 문제점
2. 버핏 권장 배분 (주식90%:채권10% 원칙 기반)
3. 리밸런싱 제안
한국어로 간결하게 3~4문장 답해주세요.`;
  try {
    const res = await aiApiFetch({model:'claude-sonnet-4-20250514',max_tokens:400,messages:[{role:'user',content:prompt}]});
    const data = await res.json();
    const txt = data.content?.map(c=>c.text||'').join('');
    notify(`💬 ${acc.name}: ${txt.slice(0,100)}...`,'ok');
  } catch(e) { notify('⚠️ 분석 실패','info'); }
}


async function runCommodityAnalysis(id) {
  const com = COMMODITY_LIST.find(c=>c.id===id);
  if (!com) return;
  notify(`🤖 ${com.name} 분석 중...`,'info');
  const prompt = `워런 버핏 관점에서 ${com.name}(${com.category}) 투자를 평가해주세요.
버핏은 금 투자에 부정적이지만 현재 거시경제 상황도 고려해서, 지금 시점에 이 자산이 포트폴리오에 필요한지 한국어 3문장으로 답해주세요.`;
  try {
    const res = await aiApiFetch({model:'claude-sonnet-4-20250514',max_tokens:300,messages:[{role:'user',content:prompt}]});
    const data = await res.json();
    const txt = data.content?.map(c=>c.text||'').join('');
    notify(`💬 ${com.name}: ${txt.slice(0,100)}`,'ok');
  } catch(e) { notify('⚠️ 분석 실패','info'); }
}

/* ── 알림 설정 탭 ── */

function removeAsset(id) {
  let port = safeLS('assetPortfolio', []);
  port = port.filter(p => p.id !== id);
  safeSetLS('assetPortfolio', port);
  notify('✅ 삭제됐어요', 'ok');
  render();
}


function addAsset(type) {
  let id, name, buyPrice, qty;
  if (type === 'etf') {
    id = document.getElementById('etf-sel')?.value;
    buyPrice = Number(document.getElementById('etf-price')?.value);
    qty = Number(document.getElementById('etf-qty')?.value);
    const etf = ETF_LIST.find(e=>e.code===id);
    name = etf?.name || id;
  } else if (type === 'overseas') {
    id = document.getElementById('ov-sel')?.value;
    buyPrice = Number(document.getElementById('ov-price')?.value);
    qty = Number(document.getElementById('ov-qty')?.value);
    const ov = OVERSEAS_LIST.find(o=>o.ticker===id);
    name = ov?.name || id;
  }
  if (!id || !buyPrice || !qty) { notify('⚠️ 모든 항목을 입력해주세요','info'); return; }
  const port = safeLS('assetPortfolio', []);
  const existing = port.findIndex(p=>p.id===id&&p.assetType===type);
  if (existing >= 0) port[existing] = {assetType:type, id, name, buyPrice, qty};
  else port.push({assetType:type, id, name, buyPrice, qty, addedAt:Date.now()});
  safeSetLS('assetPortfolio', port);
  notify(`✅ ${name} 추가됨`, 'ok');
  render();
}


function addPensionAccount() {
  const accName = prompt('계좌 이름을 입력하세요 (예: 연금저축·IRP)');
  if (!accName) return;
  const pension = safeLS('pensionAccounts', []);
  pension.push({
    id: Date.now().toString(),
    name: accName,
    items: [
      {name:'국내주식ETF', type:'주식', value:0},
      {name:'해외주식ETF', type:'주식', value:0},
      {name:'채권ETF', type:'채권', value:0},
      {name:'현금', type:'현금', value:0},
    ]
  });
  safeSetLS('pensionAccounts', pension);
  render();
}

/* ── AI 분석 함수들 ── */

function rRebalanceAdvice(myETF) {
  if (myETF.length < 2) return '';
  const total = myETF.reduce((s,p) => s + (PRICE_BASE[p.id]?.price||p.buyPrice)*p.qty, 0);
  const domestic = myETF.filter(p=>ETF_LIST.find(e=>e.code===p.id)?.region==='국내')
    .reduce((s,p)=>s+(PRICE_BASE[p.id]?.price||p.buyPrice)*p.qty,0);
  const domPct = total > 0 ? Math.round(domestic/total*100) : 0;
  const needRebal = domPct > 60 || domPct < 20;
  if (!needRebal) return '';
  return `<div style="margin-top:10px;padding:9px 12px;background:rgba(230,81,0,0.07);border:1px solid rgba(230,81,0,0.25);border-radius:10px;font-size:12px;color:#E65100;font-weight:700">
    🔄 리밸런싱 권장: 국내 비중 ${domPct}% ${domPct>60?'— 해외 ETF 추가 고려':'— 국내 ETF 추가 고려'}
  </div>`;
}

/* ── 자산 추가 함수 ── */

// ── ETF 현재가 수집 (네이버 polling API) ──

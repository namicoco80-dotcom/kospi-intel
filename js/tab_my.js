function rMyStocks() {
  const pt = calcPortTotal(), pnl = calcPortPnl();
  const pct = pt.cost > 0 ? ((pnl/pt.cost)*100).toFixed(2) : '0.00';
  const qm = [{l:'주식홈\n바로가기',i:'📊',t:'sk'},{l:'포트\n분석',i:'💼',t:'port'},{l:'뉴스\n피드',i:'📰',t:'feed'},{l:'매매\n기록',i:'📝',t:'trade'},{l:'테마\n지도',i:'🗺️',t:'hm'},{l:'AI\n설정',i:'⚙️',t:'alert'}];
  const ws = S.watchlist.map(code => ({code, name:stockName(code), price:PRICES[code]?.price, chg:PRICES[code]?.chg, sup:SUPPLY[code]||{}, quant:(QUANT[code]||{}).total}));
  return `<div class="fade-in">
    <div class="asset-summary-card">
      <div class="asset-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 총 투자자산</div>
      <div class="asset-total">${fmtPrice(pt.eval)}</div>
      <div class="asset-pnl">${pnl>=0?'+':''}${pnl.toLocaleString('ko-KR')}원 (${pnl>=0?'+':''}${pct}%)</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <span style="font-size:.71rem;color:rgba(255,255,255,.6);">${fmtUpdated()}</span>
        ${NEWS.length>0?`<span class="data-badge">📡 뉴스 ${NEWS.length}건</span>`:''}
      </div>
      <div class="asset-actions">
        <button class="asset-action-btn" onclick="switchTab('port')">자산 전체보기</button>
        <button class="asset-action-btn" onclick="runPortDiagnosis()">🤖 AI 포트 진단</button>
      </div>
    </div>

    <!-- AI 포트 진단 결과 영역 -->
    <div id="port-diagnosis" style="display:none;margin:0 20px 4px;"></div>

    <div class="quick-menu">${qm.map(m=>`<button class="quick-item" onclick="switchTab('${m.t}')"><div class="quick-icon">${m.i}</div><span class="quick-label">${m.l}</span></button>`).join('')}</div>
    <div class="section-header"><span class="section-title">관심종목</span><button class="section-link" onclick="switchTab('sk')">종목 추가 ›</button></div>
    <div class="card" style="margin:0 20px 12px;border-radius:var(--r-lg);">
      <div class="stock-list">${ws.length===0?'<div class="empty-state" style="padding:32px;"><p>관심종목을 추가하세요</p></div>':ws.map(s=>stockItemHTML(s)).join('')}</div>
    </div>
    <div class="section-header"><span class="section-title">주요 이슈</span><button class="section-link" onclick="switchTab('feed')">전체보기 ›</button></div>
    ${NEWS.slice(0,3).map(n=>miniNewsCard(n)).join('')||'<div class="empty-state"><p>뉴스 없음</p></div>'}
    <div style="height:8px;"></div>
  </div>`;
}

async function runPortDiagnosis() {
  const el = document.getElementById('port-diagnosis');
  if (!el) return;

  // 이미 결과 있으면 토글
  if (el.dataset.loaded === '1') {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
    return;
  }

  el.style.display = 'block';
  el.innerHTML = `<div style="background:var(--surface);border-radius:var(--r-lg);border:1px solid var(--border);padding:20px;text-align:center;">
    <div class="spinner" style="margin:0 auto 10px;"></div>
    <div style="font-size:.86rem;color:var(--text-muted);">AI가 포트폴리오를 분석 중...</div>
  </div>`;

  // 포트폴리오 데이터 구성
  const portData = S.portfolio.map(p => {
    const cur = PRICES[p.code]?.price || p.buyPrice;
    const pnl = ((cur - p.buyPrice) / p.buyPrice * 100).toFixed(1);
    return `${p.name}(${p.code}): ${p.qty}주, 평단 ${p.buyPrice.toLocaleString()}원, 현재 ${cur.toLocaleString()}원, 손익 ${pnl}%`;
  }).join('\n');

  const recentNews = NEWS.slice(0, 8).map(n =>
    `[${n.stockName||n.code}] ${n.title} (충격도:${n.impactScore})`
  ).join('\n');

  const prompt = `당신은 한국 주식 전문 투자 어드바이저입니다. 개인투자자의 포트폴리오를 분석해 실질적인 투자 조언을 해주세요.

[현재 포트폴리오]
${portData || '데이터 없음'}

[최근 관련 뉴스]
${recentNews || '뉴스 없음'}

다음 형식으로 JSON만 반환하세요 (다른 텍스트 없이):
{
  "overall": "전체 포지션 한줄 진단 (20자 이내)",
  "score": 75,
  "verdict": "매수추가|홀드|일부매도|전량매도 중 하나",
  "verdict_reason": "판단 근거 (30자 이내)",
  "risks": ["리스크1", "리스크2"],
  "actions": [
    {"code": "005930", "name": "삼성전자", "action": "홀드|매수추가|일부매도", "reason": "이유 20자 이내"}
  ],
  "summary": "종합 조언 2-3문장"
}`;

  try {
    const res = await fetch(getWorkerUrl(), {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [{role:'user', content: prompt}]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g,'').trim();
    const d = JSON.parse(clean);

    const verdictColor = {
      '매수추가':'var(--rise)', '홀드':'var(--gold)',
      '일부매도':'var(--fall)', '전량매도':'var(--fall)'
    }[d.verdict] || 'var(--neutral)';

    const scoreColor = d.score>=70?'var(--rise)':d.score>=40?'var(--gold)':'var(--fall)';

    el.dataset.loaded = '1';
    el.innerHTML = `<div style="background:var(--surface);border-radius:var(--r-lg);border:1px solid var(--border);overflow:hidden;box-shadow:var(--shadow-sm);">
      <!-- 헤더 -->
      <div style="padding:14px 16px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:.86rem;font-weight:800;color:var(--text-primary);">🤖 AI 포트 진단</div>
        <button onclick="document.getElementById('port-diagnosis').style.display='none'" style="font-size:.79rem;color:var(--text-muted);padding:2px 8px;border:1px solid var(--border);border-radius:var(--r-full);">닫기</button>
      </div>
      <!-- 전체 점수 & 판단 -->
      <div style="padding:16px;display:flex;align-items:center;gap:16px;">
        <div style="width:64px;height:64px;border-radius:50%;background:${scoreColor}18;border:2px solid ${scoreColor};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">
          <div style="font-family:var(--font-mono);font-size:1.29rem;font-weight:800;color:${scoreColor};">${d.score}</div>
          <div style="font-size:.57rem;color:var(--text-muted);font-weight:600;">점수</div>
        </div>
        <div>
          <div style="font-size:.79rem;color:var(--text-muted);margin-bottom:2px;">${d.overall}</div>
          <div style="font-size:1.14rem;font-weight:800;color:${verdictColor};">${d.verdict}</div>
          <div style="font-size:.71rem;color:var(--text-secondary);margin-top:2px;">${d.verdict_reason}</div>
        </div>
      </div>
      <!-- 리스크 -->
      ${d.risks?.length ? `<div style="padding:0 16px 12px;display:flex;gap:6px;flex-wrap:wrap;">
        ${d.risks.map(r=>`<span style="font-size:.71rem;padding:3px 10px;background:var(--rise-bg);color:var(--rise);border-radius:var(--r-full);font-weight:600;">⚠ ${r}</span>`).join('')}
      </div>` : ''}
      <!-- 종목별 액션 -->
      ${d.actions?.length ? `<div style="border-top:1px solid var(--border);">
        ${d.actions.map(a => {
          const ac = a.action==='매수추가'?'var(--rise)':a.action==='홀드'?'var(--gold)':'var(--fall)';
          return `<div style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--border);">
            <div style="width:36px;height:36px;border-radius:12px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.86rem;color:var(--accent);flex-shrink:0;">${(a.name||a.code).charAt(0)}</div>
            <div style="flex:1;">
              <div style="font-size:.86rem;font-weight:700;">${a.name||a.code}</div>
              <div style="font-size:.71rem;color:var(--text-muted);margin-top:1px;">${a.reason}</div>
            </div>
            <div style="font-size:.79rem;font-weight:800;color:${ac};padding:4px 10px;background:${ac}18;border-radius:var(--r-full);">${a.action}</div>
          </div>`;
        }).join('')}
      </div>` : ''}
      <!-- 종합 조언 -->
      <div style="padding:14px 16px;background:var(--accent-light);border-top:1px solid var(--border);">
        <div style="font-size:.71rem;font-weight:700;color:var(--accent);margin-bottom:4px;">💡 종합 조언</div>
        <div style="font-size:.82rem;color:var(--text-secondary);line-height:1.6;">${d.summary}</div>
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="background:var(--surface);border-radius:var(--r-lg);border:1px solid var(--border);padding:16px;text-align:center;">
      <div style="font-size:.86rem;color:var(--text-muted);">분석 실패. Worker URL을 설정에서 확인해주세요.</div>
    </div>`;
  }
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
  return `<div style="margin:0 20px 6px;padding:12px 14px;background:var(--surface);border-radius:var(--r-md);border:1px solid var(--border);cursor:pointer;" onclick="S.tab='feed';render();setTimeout(()=>showCardModal(NEWS.find(x=>String(x.id)==='${String(n.id)}')),100)">
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

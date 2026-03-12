뉴스 탭 ══════ */
function rFeed() {
  return `<div class="fade-in">
    <div class="search-bar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input placeholder="종목코드·키워드 검색" value="${S.q}" id="feed-search" oninput="S.q=this.value;reCards()">
      ${S.q?`<button onclick="S.q='';document.getElementById('feed-search').value='';reCards()" style="color:var(--text-muted);font-size:1.1rem;">×</button>`:''}
    </div>
    <div class="news-filter-row">
      ${['전체','공시','뉴스','리포트','루머'].map((f,i) => { const v=['전체','official','news','analyst','rumor'][i]; return `<button class="chip${S.tf===v?' active':''}" onclick="S.tf='${v}';reCards()">${f}</button>`; }).join('')}
      <div style="width:1px;background:var(--border);margin:0 2px;"></div>
      ${['all','A','B','C'].map(g => `<button class="chip${S.gradeFilter===g?' active':''}" onclick="S.gradeFilter='${g}';reCards()">${g==='all'?'전체등급':g+'등급'}</button>`).join('')}
    </div>
    <div id="feed-cards">${feedCardsHTML()}</div>
  </div>`;
}

function reCards() { const el = document.getElementById('feed-cards'); if (el) el.innerHTML = feedCardsHTML(); }

function filteredNews() {
  return NEWS.filter(n => {
    if (S.tf !== '전체' && n.type !== S.tf) return false;
    if (S.gradeFilter !== 'all' && gradeOf(n) !== S.gradeFilter) return false;
    if (S.themeFilter && !(n.themes||[]).some(t => t.includes(S.themeFilter)||S.themeFilter.includes(t))) return false;
    if (S.q) { const q = S.q.toLowerCase(); if (!n.title.toLowerCase().includes(q) && !n.code.includes(S.q) && !(n.body||'').toLowerCase().includes(q)) return false; }
    return true;
  });
}

function feedCardsHTML() {
  const list = filteredNews();
  if (!list.length) return `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H4a2 2 0 00-2 2v16a2 2 0 002 2z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg><p>조건에 맞는 뉴스가 없습니다<br>필터를 변경해 보세요</p></div>`;
  return list.map(n => cardHTML(n)).join('');
}

function cardHTML(item) {
  const src = SRC[item.type]||SRC['news'];
  const grade = gradeOf(item);
  const gClass = {A:'grade-a',B:'grade-b',C:'grade-c'}[grade];
  const sid = String(item.id);
  return `<div class="news-card${item.urgency===1?' urgent':''}" onclick="showCardModal(NEWS.find(n=>String(n.id)==='${sid}'))">
    <div class="news-card-header">
      <span class="news-type-badge type-${item.type||'news'}">${src.label}</span>
      <span class="grade-badge ${gClass}">${grade}</span>
      ${item.sent?`<span class="tag ${item.sent==='긍정'?'tag-rise':item.sent==='부정'?'tag-fall':'tag-neutral'}" style="font-size:.64rem;">${item.sent}</span>`:''}
      <span class="news-time">${item.time}</span>
    </div>
    <div class="news-card-body">
      <div class="news-title">${item.title}</div>
      ${item.body?`<div class="news-body-preview">${item.body}</div>`:''}
      ${item.themes?.length?`<div class="news-themes">${item.themes.map(t=>`<span class="news-theme-tag">${t}</span>`).join('')}</div>`:''}
    </div>
    <div class="impact-bar-wrap">
      <span style="font-size:.64rem;color:var(--text-muted);">Impact</span>
      <div class="impact-bar-bg"><div class="impact-bar-fill" style="width:${item.impactScore||0}%;"></div></div>
      <div class="impact-score">${item.impactScore||0}</div>
    </div>
    ${item.aiSummary?`<div class="ai-preview"><div class="ai-icon">🤖</div><div class="ai-text">${item.aiSummary}</div></div>`:''}
    <div class="news-card-footer">
      <span class="news-stock-badge">${item.code!=='000000'?(item.stockName||item.code):item.stockName||'시장전반'}</span>
      <button class="news-detail-btn" onclick="event.stopPropagation();showCardModal(NEWS.find(n=>String(n.id)==='${sid}'))">자세히 보기 →</button>
    </div>
  </div>`;
}

/* ══════ 상세 모달 ══════ */
function showCardModal(item) {
  if (!item) return;
  const p = PRICES[item.code]||{}, sup = SUPPLY[item.code]||{};
  const grade = gradeOf(item), src = SRC[item.type]||SRC['news'], id = String(item.id);
  const bd = document.createElement('div'); bd.className = 'modal-backdrop'; bd.id = 'card-backdrop'; bd.onclick = closeCardModal; document.body.appendChild(bd);
  const sh = document.createElement('div'); sh.className = 'bottom-sheet'; sh.id = 'card-sheet';
  sh.innerHTML = `<div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-stock-row">
        <div class="sheet-stock-logo">${stockLogo(item.code)}</div>
        <div><div style="font-size:.86rem;font-weight:700;">${stockName(item.code)}</div><div style="font-size:.71rem;color:var(--text-muted);font-family:var(--font-mono);">${item.code}</div></div>
        <button style="margin-left:auto;padding:6px;color:var(--text-muted);font-size:1.2rem;" onclick="closeCardModal()">×</button>
      </div>
      <div class="sheet-title">${item.title}</div>
      <div class="sheet-meta" style="margin-top:8px;">
        <span class="news-type-badge type-${item.type}">${src.label}</span>
        <span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>
        ${(item.themes||[]).map(t=>`<span class="news-theme-tag">${t}</span>`).join('')}
        <span class="news-time">${item.time}</span>
      </div>
    </div>
    <div class="sheet-body">
      ${item.body?`<p style="font-size:.86rem;color:var(--text-secondary);line-height:1.6;margin-bottom:16px;">${item.body}</p>`:''}
      ${item.url?`<a href="${item.url}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;font-size:.79rem;color:var(--accent);font-weight:600;margin-bottom:14px;">원문 보기 →</a>`:''}
      ${p.price?`<div class="sheet-price-row">
        <div class="sheet-price-item"><div class="sheet-price-label">현재가</div><div class="sheet-price-val ${chgClass(p.chg)}">${p.price.toLocaleString('ko-KR')}</div></div>
        <div class="sheet-price-item"><div class="sheet-price-label">등락률</div><div class="sheet-price-val ${chgClass(p.chg)}">${fmtChg(p.chg)}</div></div>
        <div class="sheet-price-item"><div class="sheet-price-label">외국인</div><div class="sheet-price-val ${(sup.foreign||0)>0?'num-rise':'num-fall'}">${(sup.foreign||0)>0?'순매수':'순매도'}</div></div>
        <div class="sheet-price-item"><div class="sheet-price-label">기관</div><div class="sheet-price-val ${(sup.institution||0)>0?'num-rise':'num-fall'}">${(sup.institution||0)>0?'순매수':'순매도'}</div></div>
      </div>`:''}
      <div class="ai-btn-group">
        <button class="ai-action-btn" id="btn-fc-${id}" onclick="rfc('${id}')"><span class="ai-btn-icon">🔍</span><span>팩트체크</span></button>
        <button class="ai-action-btn" id="btn-jd-${id}" onclick="runJudge('${id}')"><span class="ai-btn-icon">⚖️</span><span>투자판단</span></button>
        <button class="ai-action-btn" id="btn-ai-${id}" onclick="runAISummary('${id}')"><span class="ai-btn-icon">🤖</span><span>AI요약</span></button>
      </div>
      <div id="modal-results-${id}">${renderModalResults(item)}</div>
      <div style="margin-top:12px;">
        <button class="btn ${S.watchlist.includes(item.code)?'btn-outline':'btn-primary'}" style="width:100%;" onclick="toggleWatchlist('${item.code}')">
          ${S.watchlist.includes(item.code)?'★ 관심종목에서 제거':'☆ 관심종목 추가'}
        </button>
      </div>
    </div>`;
  document.body.appendChild(sh);
  requestAnimationFrame(() => { bd.classList.add('show'); sh.classList.add('show'); });
}

function renderModalResults(item) {
  let html = ''; const id = String(item.id);
  if (item.aiSummary) html += `<div class="ai-result-block"><div class="ai-result-header"><span>🤖</span><div class="ai-result-title">AI 뉴스 요약</div></div><div style="font-size:.86rem;color:var(--text-secondary);line-height:1.6;">${item.aiSummary}</div>${item.aiKeywords?.length?`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">${item.aiKeywords.map(k=>`<span class="news-theme-tag">${k}</span>`).join('')}</div>`:''}</div>`;
  if (item.score != null) {
    const sc = item.score>=70?'var(--rise)':item.score>=40?'var(--gold)':'var(--fall)';
    const vl = {confirmed:'✅ 사실 확인',partial:'⚠️ 부분 확인',unverified:'❓ 미검증',false:'❌ 허위'}[item.verdict]||item.verdict;
    html += `<div class="ai-result-block"><div class="ai-result-header"><span>🔍</span><div class="ai-result-title">팩트체크</div><span class="tag tag-blue" style="margin-left:auto;">${vl}</span></div><div class="fact-meter"><div class="fact-score-circle" style="background:${sc}20;color:${sc};border:2px solid ${sc};">${item.score}</div><div class="fact-text">${item.detail?.key_points||'분석 완료'}</div></div>${item.detail?.risk_level?`<div style="font-size:.79rem;color:var(--text-muted);">리스크: ${item.detail.risk_level}</div>`:''}</div>`;
  }
  if (item.judgment) {
    const j = item.judgment, sc_ = (v) => v==='매수'?'signal-buy':v==='매도'?'signal-sell':'signal-hold';
    html += `<div class="ai-result-block"><div class="ai-result-header"><span>⚖️</span><div class="ai-result-title">투자판단</div>${j.verdict?`<span class="tag tag-gold" style="margin-left:auto;">${j.verdict}</span>`:''}</div><div class="judge-signals"><div class="judge-signal ${sc_(j.short||'관망')}"><div class="judge-signal-period">단기</div><div class="judge-signal-val">${j.short||'관망'}</div></div><div class="judge-signal ${sc_(j.mid||'관망')}"><div class="judge-signal-period">중기</div><div class="judge-signal-val">${j.mid||'관망'}</div></div><div class="judge-signal ${sc_(j.long||'관망')}"><div class="judge-signal-period">장기</div><div class="judge-signal-val">${j.long||'관망'}</div></div></div>${j.summary?`<div style="font-size:.79rem;color:var(--text-secondary);line-height:1.5;margin-bottom:8px;">${j.summary}</div>`:''}<div style="display:flex;gap:12px;">${j.stopLoss?`<div><div style="font-size:.64rem;color:var(--text-muted);">손절가</div><div style="font-size:.86rem;font-weight:700;color:var(--fall);">${j.stopLoss}</div></div>`:''} ${j.targetReturn?`<div><div style="font-size:.64rem;color:var(--text-muted);">목표수익</div><div style="font-size:.86rem;font-weight:700;color:var(--rise);">${j.targetReturn}</div></div>`:''}</div>${j.factors?.length?`<div style="margin-top:8px;">${j.factors.slice(0,3).map(f=>`<div style="font-size:.79rem;color:var(--text-secondary);margin-bottom:3px;">• ${f}</div>`).join('')}</div>`:''}</div>`;
  }
  return html;
}

function refreshCardModal(id) {
  const sid = String(id), item = NEWS.find(n => String(n.id) === sid); if (!item) return;
  const el = document.getElementById(`modal-results-${sid}`); if (el) el.innerHTML = renderModalResults(item);
}

function closeCardModal() {
  const bd = document.getElementById('card-backdrop'), sh = document.getElementById('card-sheet');
  bd?.classList.remove('show'); sh?.classList.remove('show');
  setTimeout(() => { bd?.remove(); sh?.remove(); }, 350);
}

/* ══════
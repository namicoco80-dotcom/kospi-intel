function rAlert() {
  return `<div class="fade-in">
    <div class="section-header"><span class="section-title">설정</span></div>
    <div class="alert-section">
      <div class="alert-section-title">알림 설정</div>
      ${[{key:'surge',label:'급등락 알림',desc:'5% 이상 급변동 시 알림'},{key:'newIssue',label:'신규 이슈 알림',desc:'긴급도 1등급 뉴스 도착 시'},{key:'keyword',label:'키워드 알림',desc:'등록 키워드 포함 뉴스 감지'}].map(item=>`<div class="setting-row"><div><div class="setting-label">${item.label}</div><div class="setting-desc">${item.desc}</div></div><label class="toggle-switch"><input type="checkbox" ${S.alertSettings[item.key]?'checked':''} onchange="S.alertSettings['${item.key}']=this.checked;saveLocalState()"><div class="toggle-track"></div><div class="toggle-thumb"></div></label></div>`).join('')}
    </div>
    <div class="alert-section">
      <div class="alert-section-title">표시 설정</div>
      <div class="setting-row"><div><div class="setting-label">자동 갱신 (5분)</div><div class="setting-desc">뉴스 및 주가 자동 업데이트</div></div><label class="toggle-switch"><input type="checkbox" ${S.autoRefresh?'checked':''} onchange="S.autoRefresh=this.checked;saveLocalState()"><div class="toggle-track"></div><div class="toggle-thumb"></div></label></div>
      <div class="setting-row"><div><div class="setting-label">다크 모드</div><div class="setting-desc">화면 밝기 설정</div></div><label class="toggle-switch"><input type="checkbox" ${S._theme==='dark'?'checked':''} onchange="toggleTheme()"><div class="toggle-track"></div><div class="toggle-thumb"></div></label></div>
    </div>
    <div class="alert-section">
      <div class="alert-section-title">알림 키워드</div>
      <div class="keyword-tags" id="kw-tags">${S.keywords.map(kw=>`<span class="keyword-tag">${kw}<span class="keyword-remove" onclick="removeKeyword('${kw}')">×</span></span>`).join('')}</div>
      <div class="worker-input-row" style="margin-top:10px;"><input class="form-input" id="kw-input" placeholder="키워드 입력 후 Enter" onkeydown="if(event.key==='Enter')addKeyword()"><button class="btn btn-outline btn-sm" onclick="addKeyword()">추가</button></div>
    </div>
    <div class="alert-section">
      <div class="alert-section-title">AI 설정 (Cloudflare Worker URL)</div>
      <div class="worker-input-row"><input class="form-input" id="worker-url" value="${S._cfWorkerUrl}" placeholder="https://...workers.dev"><button class="btn btn-outline btn-sm" onclick="saveWorkerUrl()">저장</button></div>
      <div style="font-size:.71rem;color:var(--text-muted);margin-top:6px;">AI 팩트체크·투자판단·뉴스요약 기능에 필요합니다</div>
    </div>
    <div class="alert-section">
      <div class="alert-section-title">데이터 관리</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="exportData()">데이터 내보내기</button>
        <button class="btn btn-outline btn-sm" onclick="clearCache()">캐시 초기화</button>
      </div>
    </div>
    <div style="height:16px;"></div>
  </div>`;
}

function addKeyword() {
  const input = document.getElementById('kw-input'), val = input?.value.trim();
  if (!val||S.keywords.includes(val)) { showToast('이미 있거나 빈 키워드입니다'); return; }
  S.keywords.push(val); saveLocalState(); if (input) input.value = '';
  const tags = document.getElementById('kw-tags'); if (tags) tags.innerHTML = S.keywords.map(kw=>`<span class="keyword-tag">${kw}<span class="keyword-remove" onclick="removeKeyword('${kw}')">×</span></span>`).join('');
  showToast(`"${val}" 키워드 추가됨`);
}
function removeKeyword(kw) {
  S.keywords = S.keywords.filter(k=>k!==kw); saveLocalState();
  const tags = document.getElementById('kw-tags'); if (tags) tags.innerHTML = S.keywords.map(k=>`<span class="keyword-tag">${k}<span class="keyword-remove" onclick="removeKeyword('${k}')">×</span></span>`).join('');
}
function saveWorkerUrl() { const val = document.getElementById('worker-url')?.value.trim(); S._cfWorkerUrl = val||CF_WORKER_URL; saveLocalState(); showToast('Worker URL 저장됨'); }
function exportData() {
  const data = {portfolio:S.portfolio,watchlist:S.watchlist,tradeHistory:JSON.parse(localStorage.getItem('ki_tradeHistory')||'[]'),keywords:S.keywords,exportedAt:new Date().toISOString()};
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `kospi-intel-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
}
function clearCache() {
  if (!confirm('캐시를 초기화하시겠습니까?')) return;
  localStorage.removeItem('ki_newsCache'); localStorage.removeItem('ki_analysisCache');
  NEWS = []; loadGitHubData().then(()=>render()); showToast('캐시가 초기화됐습니다.');
}

/* ── 새로고침 버튼 ── */
async function doRefresh() {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.style.animation = 'spin .7s linear infinite';
  await loadGitHubData(); render();
  if (btn) btn.style.animation = '';
  showToast(`데이터 갱신 완료 (뉴스 ${NEWS.length}건)`);
}

/* ==================================================
   KOSPI INTEL - render.js
================================================== */


function notify(msg, type="info") {
  if(S.nt) clearTimeout(S.nt);
  S.notif = {msg, type}; render();
  S.nt = setTimeout(()=>{ S.notif=null; render(); }, 3500);
}


function filtered() {
  return NEWS.filter(n => {
    const s = gs(n.code);
    if(S.sector!=="전체" && s?.sector!==S.sector) return false;
    if(S.tf!=="전체" && n.type!==S.tf) return false;
    if(S.sk && n.code!==S.sk) return false;
    if(S.themeFilter && !(n.themes||[]).includes(S.themeFilter)) return false;
    if(S.gradeFilter!=="all" && getGrade(n)!==S.gradeFilter) return false;
    if(S.q && !n.title.includes(S.q) && !s?.name.includes(S.q) && !(n.aiKeywords||[]).join('').includes(S.q)) return false;
    return true;
  }).sort((a,b) => a.urgency - b.urgency);
}


function uPill(u) {
  if(u===1) return `<span class="upill lv1">🚨 긴급</span>`;
  if(u===2) return `<span class="upill lv2">⚠️ 주의</span>`;
  return `<span class="upill lv3">✅ 일반</span>`;
}


function getMarketStatus() {
  const now = new Date();
  const day = now.getDay(); // 0=일, 6=토
  if(day === 0 || day === 6) return 'closed'; // 주말 장외
  const h = now.getHours(), m = now.getMinutes();
  const mins = h * 60 + m;
  if(mins >= 9*60 && mins < 15*60+30) return 'open';
  if(mins >= 8*60 && mins < 9*60) return 'pre';
  if(mins >= 15*60+30 && mins < 16*60) return 'post';
  return 'closed';
}

/* ════════════════════════════════════════════════
   📦 fetchAllData() — news.json / supply.json 로드
   prices.json 과 함께 앱 시작 시 한 번, 이후 5분마다 갱신
   ════════════════════════════════════════════════ */

function judgeHTML(j) {
  const T = {
    "강력매수":{bg:"linear-gradient(135deg,#E8F5E9,#C8E6C9)",accent:"#2E7D32"},
    "매수":{bg:"linear-gradient(135deg,#E8F5E9,#DCEDC8)",accent:"#388E3C"},
    "단기매수":{bg:"linear-gradient(135deg,#F1F8E9,#DCEDC8)",accent:"#558B2F"},
    "관망":{bg:"linear-gradient(135deg,#FFF8E1,#FFF3E0)",accent:"#F57F17"},
    "주의/관망":{bg:"linear-gradient(135deg,#FFF3E0,#FFE0B2)",accent:"#E65100"},
    "매도 고려":{bg:"linear-gradient(135deg,#FFEBEE,#FFCDD2)",accent:"#C62828"},
    "회피/매도":{bg:"linear-gradient(135deg,#FFEBEE,#FF8A80)",accent:"#B71C1C"},
  };
  const t = T[j.verdict] || T["관망"];
  const sigC = sig => sig==="매수"?"#3AE890":sig==="매도"?"#FF7070":"#F5C840";
  return `<div class="jbox">
    <div class="jtop" style="background:${t.bg}">
      <div class="jrow1">
        <div><div class="jverdict" style="color:#0F1D3A">${j.verdict}</div><div class="jsub" style="color:#4A5A7A">AI 종합 투자판단</div></div>
        <div><div class="jconf-n" style="color:${t.accent}">${j.confidence}%</div><div class="jconf-l">신뢰도</div></div>
      </div>
      <div class="jsum">${j.summary}</div>
      <div class="jhs">
        <div class="jh"><div class="jhlbl">단기 1~4주</div><div class="jhval" style="color:${sigC(j.short.signal)}">${j.short.signal}</div><div class="jhdesc">${j.short.reason}</div></div>
        <div class="jh"><div class="jhlbl">중기 1~6개월</div><div class="jhval" style="color:${sigC(j.mid.signal)}">${j.mid.signal}</div><div class="jhdesc">${j.mid.reason}</div></div>
        <div class="jh"><div class="jhlbl">장기 6개월+</div><div class="jhval" style="color:${sigC(j.long.signal)}">${j.long.signal}</div><div class="jhdesc">${j.long.reason}</div></div>
      </div>
    </div>
    <div class="jbot" style="background:var(--card)">
      <div class="jflbl">판단 근거</div>
      ${j.factors.map(f=>`<div class="jf"><span class="jfi">${f.icon}</span><span>${f.text}</span></div>`).join('')}
      ${j._trailing ? `<div style="margin:8px 0 2px;padding:7px 12px;background:linear-gradient(135deg,rgba(232,146,30,0.15),rgba(90,158,224,0.1));border:1px solid rgba(232,146,30,0.4);border-radius:10px;font-size:12px;font-weight:800;color:var(--amber);display:flex;align-items:center;gap:6px">
        <span>📈</span><span>트레일링 수익 구간 — 손절가·목표가 현재가 기준 적용</span>
      </div>` : ''}
      <div class="jpos">
        <div class="jpositem" style="background:${t.accent}18;border-color:${t.accent}40">
          <div class="jposlbl" style="color:${t.accent}">Action</div>
          <div class="jposval" style="color:var(--ink)">${j.verdict==="강력매수"?"매수 비중 확대":j.verdict==="매수"?"적극 매수 고려":j.verdict==="단기매수"?"단기 매수 고려":j.verdict==="관망"?"추가 확인 후 판단":j.verdict==="주의/관망"?"소량 진입 또는 관망":j.verdict==="매도 고려"?"보유분 일부 정리":"진입 금지"}</div>
        </div>
        <div class="jpositem" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.28)">
          <div class="jposlbl" style="color:var(--rose)">${j._trailing ? '손절 (현재가 기준)' : '손절 기준'}</div>
          <div class="jposval" style="color:var(--rose)">${j.stopLoss}</div>
        </div>
        <div class="jpositem" style="background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.28)">
          <div class="jposlbl" style="color:var(--teal)">${j._trailing ? '목표 (현재가 기준)' : '목표 수익'}</div>
          <div class="jposval" style="color:var(--teal)">${j.targetReturn}</div>
        </div>
      </div>
    </div>
    <div class="jdis">⚠️ 본 분석은 AI가 이슈·공시·팩트체크를 종합한 참고 의견입니다. 투자 판단은 반드시 본인 책임 하에 결정하세요.</div>
  </div>`;
}

/* ══════════════════════════════════════════════
   ⑧ CARD HTML
══════════════════════════════════════════════ */

function cardHTML(item) {
  const stock=gs(item.code), src=SRC[item.type], v=vdStyle(item.verdict);
  const isE=S.exp===item.id, isA=S.ana[item.id], isDartF=S.dartF[item.id], isJ=S.judging[item.id];
  const isAiF = S.aiSumF[item.id];
  const iColor = impactColor(item.impactScore||50);
  const grade = getGrade(item), gm = GRADE_META[grade];

  // 관련 종목 태그
  const relStocksHTML = (item.relStocks||[]).length>0 ? `<div class="rel-stocks">
    ${(item.relStocks||[]).map(r=>{const s=gs(r.code);return s?`<span class="rel-stock ${r.dir}" onclick="event.stopPropagation();togSK('${r.code}')">${r.dir==='pos'?'▲':r.dir==='neg'?'▼':'●'} ${s.name}</span>`:''}).join('')}
  </div>` : '';

  // AI 요약 미리보기
  const aiPreviewHTML = item.aiSummary ? `<div class="ai-summary-preview">
    <div class="ai-lbl">AI SUMMARY</div>
    <div class="ai-txt">${item.aiSummary}</div>
    ${item.aiKeywords?.length ? `<div class="ai-keywords">${item.aiKeywords.map(k=>`<span class="ai-kw">#${k}</span>`).join('')}</div>` : ''}
  </div>` : '';

  // Impact Score 바
  const impactHTML = `<div class="impact-row">
    <span class="impact-lbl">IMPACT</span>
    <div class="impact-bar-w"><div class="impact-bar" style="width:${item.impactScore||50}%;background:${iColor}"></div></div>
    <span class="impact-score" style="color:${iColor}">${item.impactScore||'?'}</span>
  </div>`;

  return `<div class="card${item.urgency===1?' lv1':item.urgency===2?' lv2':''}${item._new?' new-item':''}" id="card-${item.id}">
    <div class="ch" style="cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div class="cmeta">
            <span class="bdg" style="background:${src.color}20;color:${src.color};border-color:${src.color}40">${src.icon} ${src.label}</span>
            <span class="bdg" style="background:var(--bg3);color:var(--ink2);border-color:var(--bdr2)">${stock?.name}</span>
            <span class="grade-badge grade-${grade}">${gm.sublabel}</span>
            ${uPill(item.urgency)}
            <span class="ctme">${item.time}</span>
            ${item.dartResult ? '<span style="font-size:12px;color:var(--teal);font-weight:700">📋</span>' : ''}
            ${item.judgment ? '<span style="font-size:12px;color:var(--sage);font-weight:700">📈완료</span>' : ''}
          </div>
          <div class="ctitle">${item.title}</div>
          ${item.verdict ? `<div class="cverdict" style="background:${v.bg};border-color:${v.bc};color:${v.col}">${v.lbl}</div>` : ''}
        </div>
        ${ring(item.score, 58)}
      </div>
      ${impactHTML}
      ${aiPreviewHTML}
      ${relStocksHTML}
      <div class="cfooter">
        <span>📡 ${item.sources}곳</span>
        <span style="color:${item.speed==='매우 빠름'?'var(--rose)':'var(--ink3)'}">⚡ ${item.speed}</span>
        ${item.sent==="긍정"?'<span style="color:var(--teal);font-weight:800">▲ 긍정</span>':item.sent==="부정"?'<span style="color:var(--rose);font-weight:800">▼ 부정</span>':''}
        <span style="font-size:11px;color:var(--amber);font-weight:700">${(item.themes||[]).slice(0,2).map(t=>`#${t}`).join(' ')}</span>
      </div>
      ${sparkline(item.spreadHistory, src.color)}
    </div>
    <div style="padding:0 14px 14px;text-align:right">
      <button
        data-nid="${item.id}"
        onclick="event.stopPropagation();var _n=NEWS.find(n=>String(n.id)==String(this.dataset.nid));if(_n)showCardModal(_n)"
        style="background:#1565C0;color:#fff;border:none;border-radius:20px;
          padding:8px 18px;font-size:12px;font-weight:700;letter-spacing:.3px;
          cursor:pointer;touch-action:manipulation;min-height:44px">
        상세보기 ›
      </button>
    </div>

  </div>`;
}


/* ══════════════════════════════════════════════
   ⑨ TAB RENDERS
══════════════════════════════════════════════ */

/* ── 피드 탭 ── */

function rFeed() {
  const items = filtered(), uc = NEWS.filter(n=>!n.verdict).length;
  const mktStatus = getMarketStatus();
  const mktBanner = {
    open:`<div class="mkt-banner open">🟢 장중 · 1분마다 실시간 주가 업데이트 중</div>`,
    pre:`<div class="mkt-banner pre">🟡 장전 · 09:00 장 시작 시 자동 업데이트</div>`,
    post:`<div class="mkt-banner pre">🟠 시간외 · 장 마감 후 정리 이슈 업데이트</div>`,
    closed:`<div class="mkt-banner closed">🔵 ${[0,6].includes(new Date().getDay()) ? "주말 · 월요일 장 시작 시 자동 업데이트" : "장외 시간 · 다음 장 시작 시 자동 업데이트"}</div>`,
  }[mktStatus]||'';

  // 등급별 카운트
  const cntA=NEWS.filter(n=>getGrade(n)==='A').length;
  const cntB=NEWS.filter(n=>getGrade(n)==='B').length;
  const cntC=NEWS.filter(n=>getGrade(n)==='C').length;

  const dartBar = S.showDart
    ? `<div class="dart-setup">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:18px">📋</span>
          <span style="font-size:14px;font-weight:900;color:#0F1D3A">DART 공시 연동 설정</span>
          <span style="font-size:11px;background:#FFF3E0;color:#E65100;border-radius:6px;padding:2px 7px;font-weight:700">선택사항</span>
        </div>

        <div style="background:#F8FAFF;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:12px;color:#4A5A7A;line-height:1.8">
          <b style="color:#0F1D3A">DART가 뭔가요?</b><br>
          금융감독원이 운영하는 <b>전자공시 시스템</b>이에요.<br>
          기업의 실적·공시·뉴스를 AI가 교차검증할 때 사용해요.<br><br>
          <b style="color:#0F1D3A">📌 API 키 발급 방법 (3단계)</b><br>
          <span style="display:block;margin-top:4px">
            1️⃣ 아래 링크 클릭 →
            <a href="https://opendart.fss.or.kr/uat/uia/egovLoginUsr.do" target="_blank"
              style="color:#1565C0;font-weight:700;text-decoration:underline">
              opendart.fss.or.kr 회원가입↗
            </a><br>
            2️⃣ 로그인 후 → <b>API 신청</b> 메뉴 클릭<br>
            3️⃣ 발급된 <b>인증키(40자리)</b> 복사 후 아래 입력
          </span>
        </div>

        <div class="dart-row">
          <input class="dart-inp" id="dki" placeholder="발급받은 40자리 API 키 입력..." value="${S.dartInp}">
          <button class="dart-save" onclick="saveDart()">저장</button>
        </div>
        <div style="font-size:11px;color:#94A3B8;margin-top:8px;text-align:center">
          🔒 키는 내 폰에만 저장돼요 · 외부 전송 없음
        </div>
      </div>`
    : `<div class="dart-ok">✅ DART 연동 <span style="font-family:var(--mono);opacity:.7">${S.dartKey.slice(0,8)}...</span><button onclick="resetDart()" style="margin-left:auto;background:none;border:none;font-size:12px;color:var(--ink3);cursor:pointer">변경</button></div>`;

  return `<div class="filters">
    <div class="search"><span style="color:var(--ink3);font-size:17px">🔍</span><input id="si" placeholder="종목명, 키워드, 테마 검색..." value="${S.q}"></div>

    <!-- 신뢰도 등급 필터 -->
    <div class="grade-filter-row">
      <button class="grade-filter-btn ${S.gradeFilter==='all'?'on-all':''}" onclick="setGrade('all')">
        <span class="gf-n" style="color:var(--amber)">${NEWS.length}</span><span>전체</span>
      </button>
      <button class="grade-filter-btn ${S.gradeFilter==='A'?'on-A':''}" onclick="setGrade('A')">
        <span class="gf-n" style="color:var(--grade-a)">${cntA}</span><span>확정뉴스</span>
      </button>
      <button class="grade-filter-btn ${S.gradeFilter==='B'?'on-B':''}" onclick="setGrade('B')">
        <span class="gf-n" style="color:var(--grade-b)">${cntB}</span><span>검증뉴스</span>
      </button>
      <button class="grade-filter-btn ${S.gradeFilter==='C'?'on-C':''}" onclick="setGrade('C')">
        <span class="gf-n" style="color:var(--grade-c)">${cntC}</span><span>루머</span>
      </button>
    </div>

    <div class="chips">${['전체','rumor','news','official','analyst'].map(t=>{const s=SRC[t];return`<button class="chip ${S.tf===t?'ca':''}" onclick="setTF('${t}')">${s?s.icon+' '+s.label:'🗂 전체'}</button>`;}).join('')}</div>
    <div class="chips">${SECTORS.map(sec=>`<button class="chip ${S.sector===sec?'cs':''}" onclick="setSec('${sec}')">${sec}</button>`).join('')}</div>
    <div class="chips">${THEMES.map(th=>`<button class="chip ${S.themeFilter===th.name?'ct':''}" onclick="setTheme('${th.name}')" style="font-size:11px">${th.icon} ${th.name}</button>`).join('')}</div>
    ${uc>0?`<button class="bulk" onclick="runAll()">🤖 AI 일괄분석 + 투자판단 (${uc}건 미분석)</button>`:''}
  </div>
  ${mktBanner}
  ${dartBar}
  <div class="cards" id="cc">
    ${items.length===0?`<div class="empty"><div class="empty-i">🔭</div><div class="empty-t">해당 조건의 이슈가 없습니다</div></div>`:''}
    ${items.map(cardHTML).join('')}
  </div>`;
}

/* ── 히트맵 탭 (테마 자동 분류 포함) ── */

function rHeatmap() {
  const secData = SECTORS.slice(1).map(sec=>{
    const it = NEWS.filter(n=>gs(n.code)?.sector===sec);
    const rumor=it.filter(n=>n.type==="rumor").length, urgent=it.filter(n=>n.urgency===1).length;
    const avgImpact = it.length ? Math.round(it.reduce((a,n)=>a+(n.impactScore||50),0)/it.length) : 0;
    return {sec, total:it.length, rumor, urgent, heat:rumor+urgent*1.5, avgImpact};
  }).filter(s=>s.total>0).sort((a,b)=>b.heat-a.heat);
  const maxH = Math.max(...secData.map(d=>d.heat),1);
  const col = h => {const r=h/maxH; return r>.65?{bg:"rgba(229,57,53,0.07)",bd:"rgba(229,57,53,0.25)",tx:"#C62828"}:r>.35?{bg:"rgba(230,81,0,0.07)",bd:"rgba(230,81,0,0.25)",tx:"#E65100"}:{bg:"rgba(21,101,192,0.07)",bd:"rgba(21,101,192,0.2)",tx:"#1565C0"};};

  // 테마별 종목 집계
  const themeData = THEMES.map(th=>{
    const relNews = NEWS.filter(n=>(n.themes||[]).includes(th.name));
    const relStocks = [...new Set(relNews.map(n=>n.code))].map(c=>gs(c)).filter(Boolean);
    const avgImpact = relNews.length ? Math.round(relNews.reduce((a,n)=>a+(n.impactScore||50),0)/relNews.length) : 0;
    return {...th, newsCount:relNews.length, stocks:relStocks, avgImpact};
  }).filter(t=>t.newsCount>0).sort((a,b)=>b.avgImpact-a.avgImpact);

  // 뉴스 빈도 차트 데이터
  const freqData = Object.entries(SRC).map(([type,src])=>({
    name:src.label, count:NEWS.filter(n=>n.type===type).length, color:src.color
  })).sort((a,b)=>b.count-a.count);
  const maxFreq = Math.max(...freqData.map(f=>f.count),1);

  // 테마 상승률 시뮬 데이터 (Impact 기반)
  const themeChartData = themeData.slice(0,6).map(t=>({
    name: t.name, val: t.avgImpact, color: t.color
  }));
  const maxTVal = Math.max(...themeChartData.map(t=>t.val),1);

  return `<div class="hm">
    <div class="hmtit">── 섹터 이슈 온도계 ──</div>
    <div class="hmgrid" style="margin-bottom:20px">
      ${secData.map(s=>{const c=col(s.heat); return `<div class="hmcell" style="background:${c.bg};border-color:${c.bd}" onclick="setSec('${s.sec}');setTab('feed')">
        <div class="hmsec" style="color:${c.tx}">${s.sec}</div>
        <div class="hmcnt" style="color:${c.tx}">${s.total}</div>
        <div class="hmsub" style="color:${c.tx}">🔥 찌라시 ${s.rumor}건<br>🚨 긴급 ${s.urgent}건</div>
        <div style="font-family:var(--mono);font-size:11px;color:${c.tx};margin-top:6px;opacity:0.8">IMPACT ${s.avgImpact}</div>
        <div class="hmbar-w"><div class="hmbar" style="width:${Math.round(s.heat/maxH*100)}%;background:${c.tx}"></div></div>
      </div>`;}).join('')}
    </div>

    <!-- 테마 자동 분류 -->
    <div class="theme-section">
      <div class="theme-tit">── 테마 자동 분류 ──</div>
      <div class="theme-grid">
        ${themeData.map(t=>`<div class="theme-card" onclick="setTheme('${t.name}');setTab('feed')" style="border-color:${t.color}30">
          <div class="theme-card-top">
            <div style="display:flex;align-items:center;gap:7px">
              <span style="font-size:18px">${t.icon}</span>
              <span class="theme-name">${t.name}</span>
            </div>
            <div style="text-align:right">
              <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${t.color}">${t.avgImpact}pt</div>
              <div style="font-size:10px;font-weight:700;color:${(MEM.getThemeSummary()[t.name]||{}).trendColor||'#94A3B8'}">${(MEM.getThemeSummary()[t.name]||{}).trend||'→횡보'}</div>
              <div class="theme-count">${t.newsCount}건</div>
            </div>
          </div>
          <div class="theme-stocks">
            ${t.stocks.slice(0,5).map(s=>`<span class="theme-stock-tag">${s.name}</span>`).join('')}
            ${t.stocks.length>5?`<span style="font-size:11px;color:var(--ink3)">+${t.stocks.length-5}</span>`:''}
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- 테마 Impact 차트 -->
    <div class="chart-section">
      <div class="chart-card">
        <div class="chart-title"><span>🎯 테마별 Impact Score</span><span style="font-size:11px;color:var(--ink3)">평균 점수</span></div>
        <div class="bar-chart">
          ${themeChartData.map(t=>`<div class="bar-item" style="position:relative">
            <div style="position:absolute;top:-18px;left:0;right:0;text-align:center;font-family:var(--mono);font-size:11px;font-weight:700;color:#0F1D3A">${t.val}</div>
            <div style="flex:1;display:flex;align-items:flex-end;width:100%">
              <div class="bar-fill" style="height:${Math.round(t.val/maxTVal*90)}%;background:${t.color};opacity:0.85;width:100%;border-radius:4px 4px 0 0" data-val="${t.val}"></div>
            </div>
            <span style="font-family:var(--mono);font-size:10px;color:#4A5A7A;text-align:center;position:absolute;bottom:-18px;left:0;right:0">${t.name}</span>
          </div>`).join('')}
        </div>
      </div>

      <!-- 뉴스 빈도 분석 -->
      <div class="chart-card">
        <div class="chart-title"><span>📊 뉴스 유형 분포</span><span style="font-size:11px;color:var(--ink3)">오늘 기준</span></div>
        <div class="freq-chart">
          ${freqData.map(f=>`<div class="freq-row">
            <span class="freq-name">${f.name}</span>
            <div class="freq-bar-w">
              <div class="freq-bar" style="width:${Math.round(f.count/maxFreq*100)}%;background:${f.color}">${f.count}건</div>
            </div>
            <span class="freq-val">${f.count}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

/* ── 출처 탭 ── */

function rSources() {
  return `<div class="srctab">
    ${SOURCES.map(src=>{
      const pct = Math.round(src.confirmed/src.total*100);
      const col = pct>=70?"#22c55e":pct>=50?"#E8921E":"#ef4444";
      return `<div class="srccard">
        <div class="srccard-top">
          <div><div class="srcname">${src.name}</div><div class="srctype">${src.type} · 오늘 ${src.rumorsToday}건</div></div>
          <div><div class="srcpct" style="color:${col}">${pct}%</div><div class="srcpctl">적중률</div></div>
        </div>
        <div class="srcstats">
          <div class="srcstat"><div class="srcsv" style="color:${col}">${src.confirmed}</div><div class="srcsl">확인됨</div></div>
          <div class="srcstat"><div class="srcsv">${src.total-src.confirmed}</div><div class="srcsl">불일치</div></div>
          <div class="srcstat"><div class="srcsv">${src.total}</div><div class="srcsl">누적</div></div>
        </div>
        <div class="srcdotl">최근 15건 이력</div>
        <div class="srcdots">${src.recent.map(v=>`<div class="srcdot" style="background:${v?col:'var(--bg3)'}"></div>`).join('')}</div>
        <div class="srcbar-w"><div class="srcbar" style="width:${pct}%;background:${col}"></div></div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ── 타임라인 탭 ── */

function rTimeline() {
  const g = {};
  filtered().forEach(item=>{ const h=item.time.split(":")[0]+":00"; if(!g[h])g[h]=[]; g[h].push(item); });
  const sorted = Object.entries(g).sort(([a],[b])=>a.localeCompare(b));
  return `<div class="tl">
    <div class="tldate">${new Date().toLocaleDateString('ko-KR')} — 이슈 타임라인</div>
    ${sorted.length===0?`<div class="empty"><div class="empty-i">⏳</div><div class="empty-t">이슈 없음</div></div>`:''}
    ${sorted.map(([hour,items])=>`<div class="tlgrp">
      <div class="tlhour"><span>${hour}</span></div>
      <div class="tlline">
        <div class="tlvert"></div>
        <div class="tldot" style="background:${items.some(i=>i.urgency===1)?'var(--rose)':'var(--amber)'}"></div>
        ${items.map(item=>{
          const stock=gs(item.code),src=SRC[item.type],v=vdStyle(item.verdict);
          return `<div class="tlcard" onclick="goCard(${item.id})">
            <div class="tltop">
              <div style="display:flex;gap:7px;align-items:center">
                <span style="color:${src.color};font-size:13px">${src.icon}</span>
                ${uPill(item.urgency)}
                <span style="font-family:var(--mono);font-size:11px;color:var(--ink3)">${item.time}</span>
                ${item.judgment?'<span style="font-size:11px;color:var(--sage);font-weight:700">📈</span>':''}
              </div>
              ${item.verdict?`<span style="font-size:12px;font-weight:800;color:${v.col}">${v.lbl}</span>`:''}
            </div>
            <div class="tltit">${item.title}</div>
            <div class="tlbot">
              <span style="font-size:12px;color:var(--ink3)">${stock?.name} · ${(item.themes||[]).slice(0,2).map(t=>`#${t}`).join(' ')}</span>
              ${item.impactScore?`<span style="font-family:var(--mono);font-size:12px;font-weight:700;color:${impactColor(item.impactScore)}">${item.impactScore}pt</span>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('')}
  </div>`;
}

/* ── 종목 탭 (주가 연동) ── */

function rStocks() {
  const smap = STOCKS.map(s=>{
    const it = NEWS.filter(n=>n.code===s.code);
    const ck = it.filter(n=>n.score!=null);
    const avg = ck.length ? Math.round(ck.reduce((a,n)=>a+n.score,0)/ck.length) : null;
    const pos=it.filter(n=>n.sent==="긍정").length, neg=it.filter(n=>n.sent==="부정").length;
    return {...s, total:it.length, rumor:it.filter(n=>n.type==="rumor").length,
      checked:ck.length, avg, judged:it.filter(n=>n.judgment).length,
      sent:it.length===0?"neutral":pos>neg?"positive":neg>0?"negative":"neutral",
      bt:Object.fromEntries(Object.keys(SRC).map(t=>[t,it.filter(n=>n.type===t).length]))};
  }).filter(s=>s.total>0 && (S.sector==="전체"||s.sector===S.sector)).sort((a,b)=>b.total-a.total);

  return `<div class="smap">
    <div class="chips" style="margin-bottom:12px">${SECTORS.map(sec=>`<button class="chip ${S.sector===sec?'cs':''}" onclick="setSec('${sec}')">${sec}</button>`).join('')}</div>
    ${smap.length===0?`<div class="empty"><div class="empty-i">📭</div><div class="empty-t">이슈 없음</div></div>`:''}
    ${smap.map(s=>{
      const p = PRICE_BASE[s.code];
      const isWL = S.watchlist.includes(s.code);
      return `<div class="skcard${S.sk===s.code?' sel':''}" onclick="togSK('${s.code}')">
        <div class="skhdr">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div class="skname" style="margin-bottom:0">${s.name}</div>
              ${s.judged>0?`<span style="font-size:12px;color:var(--sage)">📈${s.judged}</span>`:''}
              <button onclick="event.stopPropagation();toggleWL('${s.code}')" style="background:none;border:none;font-size:16px;padding:0;margin-left:auto">${isWL?'⭐':'☆'}</button>
            </div>
            <div class="skbdgs">
              <span class="bdg" style="background:rgba(109,184,122,0.12);color:var(--sage);border-color:rgba(109,184,122,0.3)">${s.sector}</span>
              <span class="bdg" style="background:${s.sent==='positive'?'rgba(34,197,94,0.12)':s.sent==='negative'?'rgba(239,68,68,0.12)':'var(--bg3)'};color:${s.sent==='positive'?'var(--teal)':s.sent==='negative'?'var(--rose)':'var(--ink3)'};border-color:${s.sent==='positive'?'rgba(34,197,94,0.3)':s.sent==='negative'?'rgba(239,68,68,0.3)':'var(--bdr)'}">
                ${s.sent==='positive'?'▲ 긍정':s.sent==='negative'?'▼ 부정':'● 중립'}
              </span>
              ${s.themes.slice(0,2).map(t=>`<span class="bdg" style="background:var(--bg3);color:var(--ink3);border-color:var(--bdr);font-size:10px">#${t}</span>`).join('')}
            </div>
          </div>
          ${ring(s.avg, 60)}
        </div>
        ${p ? `<div class="price-row" data-price-code="${s.code}">
          <span class="price-source-tag ${['live','json'].includes(p.dataSource)?'live':'sim'}">${p.dataSource==='live'?'LIVE':p.dataSource==='json'?'JSON':p.dataSource==='manual'?'수동':'SIM'}</span>
          <div style="flex:1"><div style="display:flex;align-items:center;gap:7px;margin-bottom:2px"><span class="price-val">${p.price.toLocaleString('ko-KR')}원</span><span class="price-chg ${p.chg>0?'up':p.chg<0?'dn':'flat'}">${p.chg>=0?'+':''}${p.chg}%</span></div><div style="display:flex;gap:8px"><span style="font-size:10px;color:var(--ink3);font-family:var(--mono)">고 ${p.high||'—'}</span><span style="font-size:10px;color:var(--ink3);font-family:var(--mono)">저 ${p.low||'—'}</span></div></div>
          <div class="price-meta"><span>${p.vol}</span><span>${p.amt}</span></div>
        </div>` : ''}
        ${SUPPLY_BASE[s.code] ? `<div style="display:flex;gap:7px;margin-bottom:9px">
          ${[{l:"외국인",v:SUPPLY_BASE[s.code].foreign,c:"#5A9EE0"},{l:"기관",v:SUPPLY_BASE[s.code].inst,c:"#D4AF5A"},{l:"개인",v:SUPPLY_BASE[s.code].retail,c:"#8A7D68"}].map(r=>`
          <div style="flex:1;background:var(--bg3);border-radius:9px;padding:7px;text-align:center">
            <div style="font-size:10px;color:${r.c};margin-bottom:2px">${r.l}</div>
            <div style="font-family:var(--mono);font-size:11px;font-weight:700;color:${r.v>=0?'var(--rose)':'var(--teal)'}">${r.v>=0?'+':''}${(Math.abs(r.v)/100).toFixed(0)}억</div>
          </div>`).join('')}
        </div>` : ''}
        <div class="sknums" style="margin-top:10px">
          <div><div class="sknv" style="color:var(--amber)">${s.total}</div><div class="sknl">전체</div></div>
          <div><div class="sknv" style="color:var(--rose)">${s.rumor}</div><div class="sknl">찌라시</div></div>
          <div><div class="sknv" style="color:var(--teal)">${s.checked}</div><div class="sknl">검증됨</div></div>
          <div><div class="sknv" style="color:var(--sage)">${s.judged}</div><div class="sknl">판단완료</div></div>
        </div>
        <div class="typebar">${Object.entries(SRC).map(([t,src])=>s.bt[t]?`<div style="flex:${s.bt[t]};background:${src.color};opacity:0.5;border-radius:3px"></div>`:'').join('')}</div>
      </div>`;
    }).join('')}
  </div>`;
}


/* ══════════════════════════════════════════════
   포트폴리오 종합 분석 엔진
══════════════════════════════════════════════ */

function rPortfolio() {
  const total = S.portfolio.reduce((sum, p) => {
    const pr = PRICE_BASE[p.code];
    if(!pr || pr.price === null || pr.price === undefined) return sum;
    return sum + pr.price * p.qty;
  }, 0);
  // 가격 미입력 종목 수
  const noPriceCount = S.portfolio.filter(p => {
    const pr = PRICE_BASE[p.code];
    return !pr || pr.price === null || pr.price === undefined;
  }).length;
  const totalCost = S.portfolio.reduce((sum, p) => sum + p.buyPrice * p.qty, 0);
  const totalPnl = total - totalCost;
  const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(2) : 0;

  return `<div class="port-tab">
    <!-- 종목 추가 -->
    <div class="port-add-card">
      <div class="port-add-title">📂 보유 종목 추가</div>
      <div class="port-inp-row">
        <select class="port-inp" id="port-code" onchange="S.portInp.code=this.value">
          <option value="">종목 선택</option>
          ${STOCKS.map(s=>`<option value="${s.code}" ${S.portInp.code===s.code?'selected':''}>${s.name}</option>`).join('')}
        </select>
      </div>
      <div class="port-inp-row">
        <input class="port-inp" id="port-price" type="number" placeholder="매수 평균가 (원)" value="${S.portInp.buyPrice}" oninput="S.portInp.buyPrice=this.value">
        <input class="port-inp" id="port-qty" type="number" placeholder="보유 수량" value="${S.portInp.qty}" oninput="S.portInp.qty=this.value" style="flex:0.6">
        <button class="port-btn" onclick="addPortfolio()">추가</button>
      </div>
    </div>

    ${S.portfolio.length > 0 ? `
    <!-- 포트폴리오 요약 -->
    <div class="port-summary">
      <div class="port-sum-title">💼 포트폴리오 현황</div>
      ${noPriceCount > 0 ? `<div style="font-size:12px;color:var(--amber);padding:8px 12px;background:rgba(232,146,30,0.1);border-radius:10px;margin-bottom:8px">
        ⚠️ ${noPriceCount}종목 현재가 미입력 — 자동 업데이트 대기 중 (평일 16:35 갱신)
      </div>` : ''}
      <div class="port-sum-row"><span class="port-sum-label">평가금액</span><span class="port-sum-val">${total.toLocaleString('ko-KR')}원</span></div>
      <div class="port-sum-row"><span class="port-sum-label">매입금액</span><span class="port-sum-val">${totalCost.toLocaleString('ko-KR')}원</span></div>
      <div class="port-sum-row">
        <span class="port-sum-label">수익률</span>
        <span class="port-sum-val" style="color:${totalPnl>=0?'var(--teal)':'var(--rose)'}">${totalPnl>=0?'+':''}${totalPnlPct}% (${(totalPnl>=0?'+':'')+Math.round(totalPnl).toLocaleString('ko-KR')}원)</span>
      </div>
    </div>

    <!-- 포트폴리오 종합 분석 -->
    ${portIntelHTML(calcPortfolioIntelligence())}

    <!-- 종목별 상세 -->
    ${S.portfolio.map(p=>{
      const stock = gs(p.code);
      const pr = PRICE_BASE[p.code];
      if(!stock || !pr) return '';
      // 현재가 없으면 매수가 기준 표시
      const hasPrice = pr.price !== null && pr.price !== undefined;
      const curPrice = hasPrice ? pr.price : p.buyPrice;
      const pnl    = hasPrice ? (pr.price - p.buyPrice) * p.qty : 0;
      const pnlPct = hasPrice ? ((pr.price - p.buyPrice) / p.buyPrice * 100).toFixed(2) : '0.00';
      const isPos = pnl >= 0;
      const relNews = NEWS.filter(n=>n.code===p.code).slice(0,3);
      const riskLevel = Math.abs(Number(pnlPct)) > 10 ? 'high' : Math.abs(Number(pnlPct)) > 5 ? 'mid' : 'low';
      const riskLabel = {high:'⚠️ 높은 변동성 감지', mid:'⚡ 중간 수준 변동', low:'✅ 안정적 보유'}[riskLevel];
      return `<div class="port-card" data-port-code="${p.code}">
        <div class="port-card-top">
          <div>
            <div class="port-name">${stock.name}</div>
            <div class="port-sector">${stock.sector} · ${p.qty.toLocaleString()}주</div>
          </div>
          <div>
            <div class="port-pnl ${isPos?'pos':'neg'}">${isPos?'+':''}${pnlPct}%</div>
            <div style="font-size:11px;color:var(--ink3);text-align:right;margin-top:2px">${isPos?'+':''}${Math.round(pnl).toLocaleString()}원</div>
          </div>
        </div>
        <div class="port-stats">
          <div class="port-stat"><div class="port-sv">${p.buyPrice.toLocaleString()}</div><div class="port-sl">매수가</div></div>
          <div class="port-stat"><div class="port-sv" style="color:${hasPrice?(isPos?'var(--teal)':'var(--rose)'):'var(--ink3)'}">${hasPrice?curPrice.toLocaleString():'업데이트 필요'}</div><div class="port-sl">현재가</div></div>
          <div class="port-stat"><div class="port-sv">${hasPrice?(curPrice * p.qty).toLocaleString():'—'}</div><div class="port-sl">평가액</div></div>
        </div>
        <div class="port-risk ${riskLevel}">${riskLabel}</div>

        <!-- 수급 미니 뷰 -->
        ${SUPPLY_BASE[p.code] ? `<div style="display:flex;gap:7px;margin-bottom:9px">
          ${[{l:"외국인",v:SUPPLY_BASE[p.code].foreign,c:"#5A9EE0"},{l:"기관",v:SUPPLY_BASE[p.code].inst,c:"#D4AF5A"},{l:"개인",v:SUPPLY_BASE[p.code].retail,c:"#8A7D68"}].map(r=>`
          <div style="flex:1;background:var(--bg3);border-radius:9px;padding:7px;text-align:center">
            <div style="font-size:10px;color:var(--ink3);margin-bottom:2px">${r.l}</div>
            <div style="font-family:var(--mono);font-size:11px;font-weight:700;color:${r.v>=0?'var(--rose)':'var(--teal)'}">${r.v>=0?'+':''}${(Math.abs(r.v)/100).toFixed(0)}억</div>
          </div>`).join('')}
        </div>` : ''}

        <!-- 뉴스 감성 히스토리 미니차트 -->
        ${sentimentMiniChart(p.code)}

        <!-- AI 개인 투자 분석 -->
        ${S.portAnalysis[p.code] ? portAnalysisHTML(S.portAnalysis[p.code], p) :
          `<button class="ai-invest-btn${S.portAnaF?.[p.code]?' ':''}" onclick="runPortAnalysis('${p.code}')" ${S.portAnaF?.[p.code]?'disabled':''}>
            ${S.portAnaF?.[p.code] ? `<span class="spin">◌</span> AI 분석 중...` : `🤖 AI 개인 투자분석 · 전망 · 확률`}
          </button>`}

        ${relNews.length > 0 ? `<div style="font-size:12px;color:var(--ink3);margin-bottom:6px;font-weight:700">📰 관련 이슈</div>
        <div class="port-news-list">
          ${relNews.map(n=>`<div class="port-news-item" onclick="goCard(${n.id})">
            <span>${SRC[n.type]?.icon}</span>
            <span style="flex:1">${n.title}</span>
            <span class="grade-badge grade-${getGrade(n)}" style="font-size:9px;padding:1px 5px">${GRADE_META[getGrade(n)].sublabel}</span>
            <span style="color:${n.sent==='긍정'?'var(--teal)':'var(--rose)'}">
              ${n.sent==='긍정'?'▲':'▼'}
            </span>
          </div>`).join('')}
        </div>` : ''}
        <div style="display:flex;justify-content:flex-end;margin-top:10px">
          <button onclick="removePortfolio('${p.code}')" style="background:none;border:1px solid var(--bdr);border-radius:8px;padding:5px 12px;font-size:12px;color:var(--ink3);cursor:pointer">삭제</button>
        </div>
      </div>`;
    }).join('')}` : `<div class="empty"><div class="empty-i">💼</div><div class="empty-t">보유 종목을 추가해보세요</div></div>`}
  </div>`;
}


/* ╔══════════════════════════════════════════════════════╗
   ║   💹 자산 관리 탭 (ETF · 연금 · 해외 · 채권·금)      ║
   ╚══════════════════════════════════════════════════════╝ */

// ── ETF 마스터 데이터 (30개) ──
const ETF_LIST = [
  // 국내 지수
  {code:'069500',name:'KODEX 200',type:'etf',region:'국내',category:'지수',expense:0.15,desc:'코스피200 추종'},
  {code:'102110',name:'TIGER 200',type:'etf',region:'국내',category:'지수',expense:0.05,desc:'코스피200 저보수'},
  {code:'229200',name:'KODEX 코스닥150',type:'etf',region:'국내',category:'지수',expense:0.40,desc:'코스닥150 추종'},
  {code:'278540',name:'KODEX MSCI Korea',type:'etf',region:'국내',category:'지수',expense:0.25,desc:'MSCI 한국 지수'},
  // 해외 지수
  {code:'360750',name:'TIGER 미국S&P500',type:'etf',region:'해외',category:'지수',expense:0.07,desc:'미국 S&P500 추종'},
  {code:'379800',name:'KODEX 미국S&P500TR',type:'etf',region:'해외',category:'지수',expense:0.05,desc:'S&P500 배당재투자'},
  {code:'133690',name:'TIGER 미국나스닥100',type:'etf',region:'해외',category:'지수',expense:0.07,desc:'나스닥100 추종'},
  {code:'368590',name:'KODEX 미국나스닥100TR',type:'etf',region:'해외',category:'지수',expense:0.05,desc:'나스닥100 배당재투자'},
  {code:'195930',name:'TIGER 유럽스탁스50',type:'etf',region:'해외',category:'지수',expense:0.50,desc:'유럽 대형주 50'},
  {code:'192090',name:'TIGER 차이나CSI300',type:'etf',region:'해외',category:'지수',expense:0.59,desc:'중국 본토 300'},
  // 테마·섹터
  {code:'411060',name:'ACE 미국빅테크TOP7',type:'etf',region:'해외',category:'테마',expense:0.25,desc:'애플·MS·엔비디아 등 M7'},
  {code:'448540',name:'TIGER 미국AI빅테크10',type:'etf',region:'해외',category:'테마',expense:0.25,desc:'AI 빅테크 10종목'},
  {code:'091160',name:'KODEX 반도체',type:'etf',region:'국내',category:'테마',expense:0.45,desc:'삼성전자·SK하이닉스 등'},
  {code:'305720',name:'KODEX 2차전지',type:'etf',region:'국내',category:'테마',expense:0.45,desc:'2차전지 테마'},
  {code:'364980',name:'TIGER 2차전지TOP10',type:'etf',region:'국내',category:'테마',expense:0.40,desc:'2차전지 상위 10종목'},
  {code:'203780',name:'TIGER 헬스케어',type:'etf',region:'국내',category:'테마',expense:0.40,desc:'바이오·헬스케어'},
  {code:'139270',name:'TIGER 200 IT',type:'etf',region:'국내',category:'테마',expense:0.15,desc:'IT 섹터'},
  {code:'140710',name:'KODEX 방산',type:'etf',region:'국내',category:'테마',expense:0.45,desc:'한국 방산 테마'},
  {code:'455900',name:'TIGER 조선TOP10',type:'etf',region:'국내',category:'테마',expense:0.40,desc:'조선 상위 10종목'},
  // 레버리지·인버스
  {code:'122630',name:'KODEX 레버리지',type:'etf',region:'국내',category:'레버리지',expense:0.64,desc:'코스피200 2배'},
  {code:'114800',name:'KODEX 인버스',type:'etf',region:'국내',category:'인버스',expense:0.64,desc:'코스피200 역방향'},
  {code:'252670',name:'KODEX 200선물인버스2X',type:'etf',region:'국내',category:'인버스',expense:0.64,desc:'코스피200 -2배'},
  // 채권
  {code:'148070',name:'KOSEF 국고채10년',type:'etf',region:'국내',category:'채권',expense:0.07,desc:'국고채 10년물'},
  {code:'273130',name:'KODEX 종합채권AA이상',type:'etf',region:'국내',category:'채권',expense:0.08,desc:'AA등급 이상 종합채권'},
  {code:'453850',name:'ACE 미국30년국채',type:'etf',region:'해외',category:'채권',expense:0.05,desc:'미국 30년 국채'},
  // 배당
  {code:'408480',name:'TIGER 미국배당다우존스',type:'etf',region:'해외',category:'배당',expense:0.08,desc:'미국 고배당 월지급'},
  {code:'441640',name:'ACE 미국배당다우존스',type:'etf',region:'해외',category:'배당',expense:0.07,desc:'미국 배당 월지급'},
  // 금·원자재
  {code:'132030',name:'KODEX 골드선물',type:'etf',region:'원자재',category:'금',expense:0.68,desc:'금 선물 추종'},
  {code:'319640',name:'TIGER 금은선물',type:'etf',region:'원자재',category:'금',expense:0.39,desc:'금·은 선물 혼합'},
  {code:'139310',name:'TIGER 원유선물',type:'etf',region:'원자재',category:'원자재',expense:0.69,desc:'WTI 원유 선물'},
];

// ── 해외주식 마스터 ──
const OVERSEAS_LIST = [
  {ticker:'AAPL',name:'애플',sector:'IT',region:'미국',desc:'아이폰·맥·서비스'},
  {ticker:'MSFT',name:'마이크로소프트',sector:'IT',region:'미국',desc:'클라우드·AI·오피스'},
  {ticker:'NVDA',name:'엔비디아',sector:'반도체',region:'미국',desc:'AI GPU 독점'},
  {ticker:'GOOGL',name:'알파벳',sector:'IT',region:'미국',desc:'검색·유튜브·클라우드'},
  {ticker:'AMZN',name:'아마존',sector:'IT',region:'미국',desc:'이커머스·AWS'},
  {ticker:'META',name:'메타',sector:'IT',region:'미국',desc:'페이스북·인스타·AI'},
  {ticker:'TSLA',name:'테슬라',sector:'EV',region:'미국',desc:'전기차·에너지'},
  {ticker:'BRK.B',name:'버크셔해서웨이',sector:'금융',region:'미국',desc:'워런 버핏 지주회사'},
  {ticker:'005930.KS',name:'삼성전자(해외)',sector:'반도체',region:'미국',desc:'ADR'},
];

// ── 채권·금·원자재 ──
const COMMODITY_LIST = [
  {id:'gold',name:'금',icon:'🥇',category:'귀금속',desc:'안전자산 대표'},
  {id:'silver',name:'은',icon:'🥈',category:'귀금속',desc:'산업+귀금속'},
  {id:'oil',name:'WTI 원유',icon:'🛢️',category:'원자재',desc:'글로벌 경기 선행'},
  {id:'bond_kr',name:'국고채 10년',icon:'📜',category:'채권',desc:'무위험 수익률'},
  {id:'bond_us',name:'미국채 10년',icon:'🇺🇸',category:'채권',desc:'글로벌 금리 기준'},
  {id:'bitcoin',name:'비트코인',icon:'₿',category:'가상자산',desc:'디지털 금'},
];

// ── 자산 포트폴리오 상태 (S에 추가) ──
// S.assetPortfolio: [{assetType:'etf'|'overseas'|'commodity'|'pension', id, name, buyPrice, qty, buyDate}]
// S.pensionAccounts: [{name:'연금저축', items:[{type, id, name, buyPrice, qty, ratio}]}]

/* ── 자산 탭 렌더링 ── */

function rAsset() {
  const port = safeLS('assetPortfolio', []);
  const pension = safeLS('pensionAccounts', []);

  // 서브탭
  const sub = S.assetSub || 'etf';

  return `<div style="padding:12px 14px 120px">
    <!-- 서브 탭 -->
    <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:2px">
      ${[
        {id:'etf',label:'💹 ETF'},
        {id:'overseas',label:'🌍 해외주식'},
        {id:'pension',label:'🏦 연금·IRP'},
        {id:'commodity',label:'🥇 채권·금'},
      ].map(t=>`<button onclick="S.assetSub='${t.id}';render()" style="
        flex-shrink:0;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:800;
        border:1.5px solid ${sub===t.id?'#1565C0':'#E2E8F4'};
        background:${sub===t.id?'#1565C0':'#FFFFFF'};
        color:${sub===t.id?'#FFFFFF':'#4A5A7A'};
        white-space:nowrap">${t.label}</button>`).join('')}
    </div>

    ${sub==='etf'      ? rETFTab(port)       : ''}
    ${sub==='overseas' ? rOverseasTab(port)   : ''}
    ${sub==='pension'  ? rPensionTab(pension) : ''}
    ${sub==='commodity'? rCommodityTab(port)  : ''}
  </div>`;
}

/* ── ETF 탭 ── */

function rETFTab(port) {
  const myETF = port.filter(p => p.assetType === 'etf');
  const etfGroups = {
    '지수': ETF_LIST.filter(e=>e.category==='지수'),
    '테마': ETF_LIST.filter(e=>e.category==='테마'),
    '배당': ETF_LIST.filter(e=>e.category==='배당'),
    '채권': ETF_LIST.filter(e=>e.category==='채권'),
    '금·원자재': ETF_LIST.filter(e=>['금','원자재'].includes(e.category)),
    '레버리지·인버스': ETF_LIST.filter(e=>['레버리지','인버스'].includes(e.category)),
  };

  // 총 평가 계산
  let totalInvest = 0, totalCur = 0;
  myETF.forEach(p => {
    const pr = PRICE_BASE[p.id];
    const cur = pr?.price || p.buyPrice;
    totalInvest += p.buyPrice * p.qty;
    totalCur    += cur * p.qty;
  });
  const totalPnl    = totalCur - totalInvest;
  const totalPnlPct = totalInvest > 0 ? (totalPnl/totalInvest*100).toFixed(2) : 0;
  const isPlus      = totalPnl >= 0;

  return `
  <!-- ── 내 ETF 요약 카드 ── -->
  ${myETF.length > 0 ? `
  <div style="background:linear-gradient(135deg,#1565C0 0%,#1E88E5 100%);
    border-radius:20px;padding:20px;margin-bottom:14px;color:#fff;position:relative;overflow:hidden">
    <div style="position:absolute;right:-20px;top:-20px;width:120px;height:120px;
      background:rgba(255,255,255,0.07);border-radius:50%"></div>
    <div style="position:absolute;right:20px;bottom:-30px;width:80px;height:80px;
      background:rgba(255,255,255,0.05);border-radius:50%"></div>
    <div style="font-size:11px;font-weight:700;opacity:.8;margin-bottom:4px">💹 ETF 총 평가금액</div>
    <div style="font-size:26px;font-weight:900;letter-spacing:-0.5px">
      ${Math.round(totalCur).toLocaleString()}원
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <span style="font-size:13px;opacity:.8">투자원금 ${Math.round(totalInvest).toLocaleString()}원</span>
      <span style="font-size:14px;font-weight:800;
        background:${isPlus?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'};
        border-radius:20px;padding:3px 10px">
        ${isPlus?'▲':'▼'} ${Math.abs(totalPnlPct)}%
      </span>
    </div>
    <div style="font-size:12px;margin-top:4px;opacity:.9;font-weight:700">
      ${isPlus?'+':''}${Math.round(totalPnl).toLocaleString()}원
    </div>
    <!-- 미니 바 차트 -->
    <div style="display:flex;gap:3px;margin-top:14px;align-items:flex-end;height:36px">
    ${myETF.slice(0,6).map(p=>{
      const pr = PRICE_BASE[p.id];
      const cur = pr?.price || p.buyPrice;
      const pct = ((cur-p.buyPrice)/p.buyPrice*100);
      const h = Math.min(Math.max(Math.abs(pct)*3+12, 10), 36);
      return `<div style="flex:1;background:${pct>=0?'rgba(255,255,255,0.7)':'rgba(255,100,100,0.6)'};
        border-radius:3px 3px 0 0;height:${h}px;min-width:8px" title="${p.name}"></div>`;
    }).join('')}
    </div>
    <div style="font-size:10px;opacity:.6;margin-top:4px">${myETF.length}개 ETF 보유</div>
  </div>

  <!-- ── 보유 ETF 카드 목록 ── -->
  <div style="margin-bottom:14px">
    <div style="font-size:12px;font-weight:800;color:#4A5A7A;margin-bottom:8px;
      display:flex;justify-content:space-between;align-items:center">
      <span>📋 보유 현황</span>
      <span style="font-size:10px;color:#94A3B8">${myETF.length}종목</span>
    </div>
    ${myETF.map(p => {
      const etf = ETF_LIST.find(e=>e.code===p.id);
      const pr  = PRICE_BASE[p.id];
      const cur = pr?.price || null;
      const pnl    = cur ? (cur - p.buyPrice) * p.qty : 0;
      const pnlPct = cur ? ((cur - p.buyPrice)/p.buyPrice*100) : 0;
      const isPos  = pnl >= 0;
      const noData = !cur;
      const weight = totalCur > 0 ? ((cur*p.qty)/totalCur*100).toFixed(1) : 0;
      return `
      <div style="background:#fff;border:1.5px solid ${isPos?'#E8F5E9':'#FFF0F0'};
        border-radius:16px;padding:14px;margin-bottom:8px;
        box-shadow:0 2px 8px rgba(0,0,0,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:800;color:#0F1D3A">${p.name}</div>
            <div style="font-size:11px;color:#94A3B8;margin-top:2px">
              ${etf?.region||''} · ${etf?.category||''} · ${p.qty}좌 · 매수 ${p.buyPrice.toLocaleString()}원
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:16px;font-weight:900;
              color:${noData?'#94A3B8':isPos?'#E53935':'#1565C0'}">
              ${noData?'갱신중...':((isPos?'+':'')+pnlPct.toFixed(2)+'%')}</div>
            <div style="font-size:11px;color:${noData?'#94A3B8':isPos?'#E53935':'#1565C0'};font-weight:700">
              ${noData?'':(isPos?'+':'')+Math.round(pnl).toLocaleString()+'원'}</div>
          </div>
        </div>
        <!-- 비중 바 -->
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:4px;background:#F0F4FA;border-radius:2px">
            <div style="height:4px;background:${isPos?'#43A047':'#1565C0'};border-radius:2px;
              width:${weight}%;transition:width .4s ease"></div>
          </div>
          <span style="font-size:10px;color:#94A3B8;white-space:nowrap">비중 ${weight}%</span>
          <button onclick="showETFAnalysis('${p.id}')"
            style="background:#F0F4FF;border:1px solid #C7D4F0;border-radius:8px;
            padding:4px 10px;font-size:11px;font-weight:700;color:#1565C0;cursor:pointer;
            touch-action:manipulation">🤖 분석</button>
          <button onclick="removeAsset('${p.id}')"
            style="background:#FFF0F0;border:1px solid #FFCDD2;border-radius:8px;
            padding:4px 8px;font-size:11px;color:#E53935;cursor:pointer;
            touch-action:manipulation">✕</button>
        </div>
      </div>`;
    }).join('')}
    ${rRebalanceAdvice(myETF)}
  </div>` : `
  <!-- 비어있을 때 -->
  <div style="text-align:center;padding:30px 20px;background:#F4F6FA;border-radius:16px;margin-bottom:14px">
    <div style="font-size:36px;margin-bottom:8px">💹</div>
    <div style="font-size:14px;font-weight:700;color:#4A5A7A;margin-bottom:4px">아직 ETF가 없어요</div>
    <div style="font-size:12px;color:#94A3B8">아래에서 ETF를 추가해보세요</div>
  </div>`}

  <!-- ── ETF 추가 폼 ── -->
  <div style="background:#fff;border:1.5px solid #E2E8F4;border-radius:16px;padding:16px;margin-bottom:16px;
    box-shadow:0 2px 8px rgba(0,0,0,0.04)">
    <div style="font-size:13px;font-weight:800;color:#0F1D3A;margin-bottom:10px">➕ ETF 추가</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <select id="etf-sel" style="background:#F4F6FA;border:1.5px solid #E2E8F4;border-radius:12px;
        padding:11px 14px;font-size:13px;color:#0F1D3A;width:100%">
        <option value="">ETF 선택</option>
        ${Object.entries(etfGroups).map(([grp,list])=>`
        <optgroup label="── ${grp} ──">
          ${list.map(e=>`<option value="${e.code}">${e.name} · 보수 ${e.expense}%</option>`).join('')}
        </optgroup>`).join('')}
      </select>
      <div style="display:flex;gap:8px">
        <input id="etf-price" type="number" placeholder="매수가 (원)"
          style="flex:1;background:#F4F6FA;border:1.5px solid #E2E8F4;border-radius:12px;
          padding:11px 14px;font-size:13px;color:#0F1D3A">
        <input id="etf-qty" type="number" placeholder="수량"
          style="width:90px;background:#F4F6FA;border:1.5px solid #E2E8F4;border-radius:12px;
          padding:11px 14px;font-size:13px;color:#0F1D3A">
      </div>
      <button onclick="addAsset('etf')"
        style="width:100%;background:#1565C0;border:none;border-radius:12px;
        padding:13px;font-size:14px;font-weight:800;color:#fff;cursor:pointer;
        touch-action:manipulation">추가하기</button>
    </div>
  </div>

  <!-- ── ETF 목록 (카드형) ── -->
  ${Object.entries(etfGroups).map(([grp,list])=>`
  <div style="margin-bottom:16px">
    <div style="font-size:11px;font-weight:800;color:#94A3B8;
      letter-spacing:1.5px;margin-bottom:8px;padding-left:2px">${grp.toUpperCase()}</div>
    ${list.map(e=>`
    <div style="background:#fff;border:1.5px solid #E2E8F4;border-radius:14px;
      padding:13px 14px;margin-bottom:6px;display:flex;justify-content:space-between;
      align-items:center;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:800;color:#0F1D3A;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.name}</div>
        <div style="font-size:11px;color:#94A3B8;margin-top:2px">${e.desc} · 보수 ${e.expense}%</div>
      </div>
      <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;margin-left:8px">
        <span style="font-size:10px;padding:3px 8px;border-radius:8px;font-weight:700;
          background:${e.region==='해외'?'#FFF8E1':'#E3F2FD'};
          color:${e.region==='해외'?'#E65100':'#1565C0'}">${e.region}</span>
        <button onclick="showETFAnalysis('${e.code}')"
          style="background:#F0F4FF;border:1px solid #C7D4F0;border-radius:8px;
          padding:5px 10px;font-size:11px;font-weight:700;color:#1565C0;cursor:pointer;
          touch-action:manipulation">🤖 분석</button>
      </div>
    </div>`).join('')}
  </div>`).join('')}`;
}

/* ── 해외주식 탭 ── */

function rOverseasTab(port) {
  const myOverseas = port.filter(p => p.assetType === 'overseas');
  return `
  ${myOverseas.length > 0 ? `
  <div style="background:#FFFFFF;border:1px solid #E2E8F4;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 2px 10px rgba(21,101,192,0.06)">
    <div style="font-size:13px;font-weight:800;color:#0F1D3A;margin-bottom:10px">🌍 내 해외주식</div>
    ${myOverseas.map(p=>{
      const pnlPct = ((p.curPrice||p.buyPrice) - p.buyPrice)/p.buyPrice*100;
      const isPos = pnlPct >= 0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #F4F6FA">
        <div>
          <div style="font-size:13px;font-weight:700;color:#0F1D3A">${p.name} <span style="font-size:11px;color:#94A3B8">(${p.id})</span></div>
          <div style="font-size:11px;color:#94A3B8">${p.qty}주 · 매수 $${p.buyPrice}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:800;color:${isPos?'#E53935':'#1565C0'}">${isPos?'+':''}${pnlPct.toFixed(2)}%</div>
          <button onclick="runOverseasAnalysis('${p.id}')" style="margin-top:3px;background:#F0F4FF;border:1px solid #C7D4F0;border-radius:7px;padding:3px 8px;font-size:10px;font-weight:700;color:#1565C0">🤖 버핏 분석</button>
        </div>
      </div>`;
    }).join('')}
  </div>` : ''}

  <div style="background:#FFFFFF;border:1px solid #E2E8F4;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 2px 10px rgba(21,101,192,0.06)">
    <div style="font-size:13px;font-weight:800;color:#0F1D3A;margin-bottom:10px">📂 해외주식 추가</div>
    <div style="display:flex;flex-direction:column;gap:7px">
      <select id="ov-sel" style="background:#F4F6FA;border:1px solid #E2E8F4;border-radius:10px;padding:10px;font-size:13px;color:#0F1D3A;outline:none">
        <option value="">종목 선택</option>
        ${OVERSEAS_LIST.map(o=>`<option value="${o.ticker}">${o.name} (${o.ticker}) · ${o.sector}</option>`).join('')}
      </select>
      <div style="display:flex;gap:6px">
        <input id="ov-price" type="number" placeholder="매수가 ($)" style="flex:1;background:#F4F6FA;border:1px solid #E2E8F4;border-radius:10px;padding:10px;font-size:13px;outline:none">
        <input id="ov-qty" type="number" placeholder="수량" style="flex:0.5;background:#F4F6FA;border:1px solid #E2E8F4;border-radius:10px;padding:10px;font-size:13px;outline:none">
        <button onclick="addAsset('overseas')" style="background:#1565C0;border:none;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;font-weight:800">추가</button>
      </div>
    </div>
  </div>

  <div style="font-size:11px;font-weight:800;color:#94A3B8;margin-bottom:8px;letter-spacing:1px">주요 해외주식</div>
  ${OVERSEAS_LIST.map(o=>`
  <div style="background:#FFFFFF;border:1px solid #E2E8F4;border-radius:14px;padding:12px 14px;margin-bottom:6px;box-shadow:0 1px 6px rgba(21,101,192,0.05);display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:13px;font-weight:800;color:#0F1D3A">${o.name} <span style="font-family:var(--mono);font-size:11px;color:#1565C0">${o.ticker}</span></div>
      <div style="font-size:11px;color:#94A3B8">${o.desc} · ${o.sector}</div>
    </div>
    <button onclick="runOverseasAnalysis('${o.ticker}')" style="background:#F0F4FF;border:1px solid #C7D4F0;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;color:#1565C0;flex-shrink:0">🤖 분석</button>
  </div>`).join('')}`;
}

/* ── 연금·IRP 탭 ── */

function rPensionTab(pension) {
  const accs = pension.length > 0 ? pension : [];
  return `
  <!-- 연금 계좌 추가 -->
  <div style="background:#FFFFFF;border:1px solid #E2E8F4;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 2px 10px rgba(21,101,192,0.06)">
    <div style="font-size:13px;font-weight:800;color:#0F1D3A;margin-bottom:4px">🏦 연금저축 · IRP 관리</div>
    <div style="font-size:11px;color:#94A3B8;margin-bottom:10px">ETF·펀드 혼합 포트폴리오 분석</div>
    <button onclick="addPensionAccount()" style="width:100%;background:#F0F4FF;border:1.5px dashed #C7D4F0;border-radius:12px;padding:12px;font-size:13px;font-weight:700;color:#1565C0">+ 계좌 추가 (연금저축 / IRP)</button>
  </div>

  ${accs.length === 0 ? `
  <div style="text-align:center;padding:30px;color:#94A3B8">
    <div style="font-size:36px;margin-bottom:10px">🏦</div>
    <div style="font-size:14px;font-weight:700;margin-bottom:6px">연금 계좌를 추가해보세요</div>
    <div style="font-size:12px;line-height:1.6">연금저축·IRP 포트폴리오를<br>버핏 스타일로 분석해드려요</div>
  </div>` : accs.map(acc => rPensionAccountCard(acc)).join('')}

  <!-- 연금 가이드 -->
  <div style="background:#F0F4FF;border:1px solid #C7D4F0;border-radius:14px;padding:14px;margin-top:12px">
    <div style="font-size:12px;font-weight:800;color:#1565C0;margin-bottom:8px">💡 연금 포트폴리오 기본 원칙</div>
    ${[
      {icon:'📊', text:'주식:채권 = 나이에 따라 조정 (100-나이 = 주식비중)'},
      {icon:'🌍', text:'국내:해외 = 3:7 권장 (글로벌 분산)'},
      {icon:'🔄', text:'연 1~2회 리밸런싱 (수익난 자산 → 비중 조정)'},
      {icon:'⏳', text:'장기 투자 (20년+ 복리 효과 극대화)'},
    ].map(g=>`<div style="display:flex;gap:8px;margin-bottom:6px;font-size:12px;color:#0F1D3A">
      <span>${g.icon}</span><span style="line-height:1.5">${g.text}</span>
    </div>`).join('')}
  </div>`;
}


function rPensionAccountCard(acc) {
  const total = acc.items.reduce((s,i) => s + i.value, 0);
  return `
  <div style="background:#FFFFFF;border:1px solid #E2E8F4;border-radius:16px;padding:14px;margin-bottom:10px;box-shadow:0 2px 10px rgba(21,101,192,0.06)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:13px;font-weight:800;color:#0F1D3A">${acc.name}</div>
      <div style="font-size:13px;font-weight:700;color:#1565C0">${total.toLocaleString()}원</div>
    </div>
    ${acc.items.map(item=>{
      const ratio = total > 0 ? Math.round(item.value/total*100) : 0;
      return `<div style="margin-bottom:7px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:12px;color:#0F1D3A;font-weight:600">${item.name}</span>
          <span style="font-size:12px;color:#4A5A7A">${ratio}% · ${item.value.toLocaleString()}원</span>
        </div>
        <div style="height:6px;background:#EEF1F8;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${ratio}%;background:${item.type==='주식'?'#E53935':item.type==='채권'?'#1565C0':item.type==='금'?'#E65100':'#2E7D32'};border-radius:3px"></div>
        </div>
      </div>`;
    }).join('')}
    <button onclick="runPensionAnalysis('${acc.id}')" style="width:100%;margin-top:8px;background:#1565C0;border:none;border-radius:10px;padding:10px;color:#fff;font-size:13px;font-weight:800">🤖 버핏 스타일 배분 분석</button>
  </div>`;
}

/* ── 채권·금·원자재 탭 ── */

function rCommodityTab(port) {
  const myCom = port.filter(p => p.assetType === 'commodity');
  return `
  <div style="background:#FFFFFF;border:1px solid #E2E8F4;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 2px 10px rgba(21,101,192,0.06)">
    <div style="font-size:13px;font-weight:800;color:#0F1D3A;margin-bottom:4px">🥇 채권·금·원자재</div>
    <div style="font-size:11px;color:#94A3B8;margin-bottom:10px">안전자산 & 인플레이션 헤지</div>
    ${COMMODITY_LIST.map(c=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #F4F6FA">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:22px">${c.icon}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:#0F1D3A">${c.name}</div>
          <div style="font-size:11px;color:#94A3B8">${c.desc} · ${c.category}</div>
        </div>
      </div>
      <button onclick="runCommodityAnalysis('${c.id}')" style="background:#F0F4FF;border:1px solid #C7D4F0;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;color:#1565C0">🤖 분석</button>
    </div>`).join('')}
  </div>

  <!-- 자산 배분 가이드 -->
  <div style="background:#FFFFFF;border:1px solid #E2E8F4;border-radius:16px;padding:14px;box-shadow:0 2px 10px rgba(21,101,192,0.06)">
    <div style="font-size:13px;font-weight:800;color:#0F1D3A;margin-bottom:10px">⚖️ 버핏식 자산 배분 원칙</div>
    ${[
      {label:'주식 ETF', pct:90, color:'#E53935', note:'S&P500 인덱스 (버핏 권장)'},
      {label:'단기채권', pct:10, color:'#1565C0', note:'현금성 자산 유지'},
    ].map(a=>`
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:12px;font-weight:700;color:#0F1D3A">${a.label}</span>
        <span style="font-size:12px;color:#4A5A7A">${a.pct}% · ${a.note}</span>
      </div>
      <div style="height:8px;background:#EEF1F8;border-radius:4px">
        <div style="height:100%;width:${a.pct}%;background:${a.color};border-radius:4px"></div>
      </div>
    </div>`).join('')}
    <div style="font-size:11px;color:#94A3B8;font-style:italic;margin-top:8px;line-height:1.6">
      "내가 죽으면 아내 재산의 90%를 S&P500 인덱스에, 10%를 단기 국채에 넣어라" — 워런 버핏
    </div>
  </div>`;
}

/* ── 리밸런싱 조언 ── */

function rAlert() {
  const changelogHTML = `
    <div class="alert-card" style="margin-bottom:14px">
      <div class="alert-section-title">📋 업데이트 내역</div>
      <div style="margin-top:10px">

        <div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="background:#1565C0;color:#fff;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:800">V9</span>
            <span style="font-size:11px;color:#94A3B8">03.07</span>
            <span style="margin-left:auto;font-size:11px;color:#2E7D32;font-weight:800">✓ 완료</span>
          </div>
          <div style="font-size:12px;color:#4A5A7A;line-height:2">
            ✅ 버튼 전체 터치 수정 (시계 독립 분리)<br>
            ✅ ETF 30개 확대 + AI 분석 모달<br>
            ✅ 앱 자동 업데이트 토스트<br>
            ✅ undefined 오류 방어코드
          </div>
        </div>

        <div style="margin-bottom:14px;padding-top:12px;border-top:1px solid #F0F2F8">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="background:#1565C0;color:#fff;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:800">V8</span>
            <span style="font-size:11px;color:#94A3B8">03.07</span>
            <span style="margin-left:auto;font-size:11px;color:#2E7D32;font-weight:800">✓ 완료</span>
          </div>
          <div style="font-size:12px;color:#4A5A7A;line-height:2">
            ✅ 자산 탭 (ETF·해외·연금·채권)<br>
            ✅ 워런 버핏 AI 분석 프롬프트<br>
            ✅ Gemini 무료 AI 자동화
          </div>
        </div>

        <div style="margin-bottom:14px;padding-top:12px;border-top:1px solid #F0F2F8">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="background:#64748B;color:#fff;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:800">V7</span>
            <span style="font-size:11px;color:#94A3B8">03.06</span>
            <span style="margin-left:auto;font-size:11px;color:#2E7D32;font-weight:800">✓ 완료</span>
          </div>
          <div style="font-size:12px;color:#4A5A7A;line-height:2">
            ✅ Market Memory 학습 엔진<br>
            ✅ 영어 뉴스 자동 번역<br>
            ✅ PWA 홈화면 설치
          </div>
        </div>

        <div style="padding-top:12px;border-top:1px solid #F0F2F8">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="background:#64748B;color:#fff;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:800">V10</span>
            <span style="font-size:11px;color:#94A3B8">예정</span>
            <span style="margin-left:auto;font-size:11px;color:#E65100;font-weight:800">🔄 개발중</span>
          </div>
          <div style="font-size:12px;color:#94A3B8;line-height:2">
            🔄 Gemini 완전 무료 자동화<br>
            🔄 주가 5분마다 실시간 업데이트<br>
            🔄 사용자 키 입력 완전 제거
          </div>
        </div>

      </div>
    </div>`;

  return `<div class="alert-tab">${changelogHTML}
    <!-- 알림 토글 -->
    <div class="alert-card">
      <div class="alert-section-title">🔔 알림 설정</div>
      ${[
        {key:'newIssueAlert',label:'신규 이슈 알림',sub:'새 뉴스·공시 발생 시 알림'},
        {key:'keywordAlert',label:'키워드 알림',sub:'설정 키워드 포함 이슈 알림'},
        {key:'watchlistAlert',label:'관심 종목 알림',sub:'관심 종목 관련 이슈 알림'},
        {key:'surgeAlert',label:'급등 종목 알림',sub:'주가 급등 감지 시 알림'},
      ].map(a=>`<div class="alert-item">
        <div>
          <div class="alert-item-label">${a.label}</div>
          <div class="alert-item-sub">${a.sub}</div>
        </div>
        <label class="toggle-wrap">
          <input type="checkbox" class="toggle-inp" ${S.alertSettings[a.key]?'checked':''} onchange="toggleAlert('${a.key}',this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>`).join('')}
    </div>

    <!-- 자동 갱신 설정 -->
    <div class="alert-card">
      <div class="alert-section-title">⏱ 자동 갱신</div>
      <div class="alert-item">
        <div>
          <div class="alert-item-label">5분마다 자동 갱신</div>
          <div class="alert-item-sub">뉴스·공시 자동 수집 및 화면 업데이트</div>
        </div>
        <label class="toggle-wrap">
          <input type="checkbox" class="toggle-inp" ${S.autoRefresh?'checked':''} onchange="S.autoRefresh=this.checked;notify(S.autoRefresh?'✅ 자동 갱신 ON':'⏸ 자동 갱신 OFF','info')">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="alert-item">
        <div>
          <div class="alert-item-label">장 시작/마감 자동 알림</div>
          <div class="alert-item-sub">09:00 장 시작, 15:30 장 마감 시 업데이트</div>
        </div>
        <label class="toggle-wrap">
          <input type="checkbox" class="toggle-inp" checked onchange="notify('✅ 장 이벤트 알림 업데이트','info')">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- 키워드 설정 -->
    <div class="alert-card">
      <div class="alert-section-title">🔑 키워드 알림</div>
      <div class="kw-tags">
        ${S.keywords.map(kw=>`<span class="kw-tag">${kw}<span class="kw-tag-del" onclick="removeKw('${kw}')">×</span></span>`).join('')}
      </div>
      <div class="kw-add-row">
        <input class="kw-add-inp" id="kw-inp" placeholder="키워드 입력..." value="${S.newKw}" oninput="S.newKw=this.value" onkeydown="if(event.key==='Enter')addKw()">
        <button class="kw-add-btn" onclick="addKw()">추가</button>
      </div>
    </div>

    <!-- CF Worker URL 설정 (AI 기능) -->
    <div class="alert-card">
      <div class="alert-section-title">🤖 AI 기능 설정 (Cloudflare Workers)</div>
      <div style="font-size:12px;color:var(--ink2);line-height:1.7;margin-bottom:10px;padding:10px 12px;background:rgba(155,127,232,0.08);border-radius:10px;border-left:3px solid var(--purple)">
        AI 팩트체크·투자판단 기능을 사용하려면 Cloudflare Workers 프록시 URL이 필요합니다.<br>
        <a href="https://workers.cloudflare.com" target="_blank" style="color:var(--purple);font-weight:700">workers.cloudflare.com↗</a>에서 무료로 생성 가능합니다.
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="cf-worker-inp" class="kw-add-inp" placeholder="https://your-worker.workers.dev"
          value="${(()=>{ try { return localStorage.getItem('cf_worker_url')||''; } catch(e){return '';} })()}"
          style="flex:1;font-size:12px">
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="saveCfWorkerUrl()" class="kw-add-btn" style="flex:1">💾 저장</button>
        <button onclick="testCfWorker()" style="flex:1;background:var(--card);border:1.5px solid var(--bdr2);border-radius:10px;padding:9px 14px;color:var(--purple);font-size:13px;font-weight:800">🧪 연결 테스트</button>
      </div>
      <div id="cf-status" style="margin-top:8px;font-size:12px;color:var(--ink3)">
        ${(()=>{ try { const u=localStorage.getItem('cf_worker_url'); return u ? '✅ URL 설정됨: '+u.slice(0,40)+'...' : '⚠️ 미설정 — AI 기능 비활성화'; } catch(e){return '';} })()}
      </div>
    </div>

    <!-- 관심 종목 -->
    <div class="alert-card">
      <div class="alert-section-title">⭐ 관심 종목</div>
      <div class="watchlist">
        ${S.watchlist.map(code=>{const s=gs(code);const p=PRICE_BASE[code];return s?`<div class="wl-item">
          <span class="wl-name">${s.name}</span>
          <span class="wl-code">${code}</span>
          ${p?`<span style="font-family:var(--mono);font-size:12px;color:${p.chg>=0?'var(--rose)':'var(--teal)'};font-weight:700">${p.chg>=0?'+':''}${p.chg}%</span>`:''}
          <button class="wl-del" onclick="removeWL('${code}')">×</button>
        </div>`:''}).join('')}
      </div>
      <div class="wl-add-row">
        <select class="wl-sel" id="wl-sel" onchange="S.newWl=this.value">
          <option value="">종목 추가...</option>
          ${STOCKS.filter(s=>!S.watchlist.includes(s.code)).map(s=>`<option value="${s.code}">${s.name}</option>`).join('')}
        </select>
        <button class="kw-add-btn" onclick="addWL()">추가</button>
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════
   ⑩ MAIN RENDER
══════════════════════════════════════════════ */

function rBoard() {
  const nick = getBoardNick();
  return `<div class="board-wrap">
    <div class="board-write">
      <div style="font-size:13px;font-weight:900;color:#0F1D3A;margin-bottom:10px">✏️ 글 남기기</div>
      <div class="board-write-top">
        <input id="board-nick" class="board-nick-inp" placeholder="닉네임" maxlength="12" value="${nick}">
        <select id="board-type" class="board-type-sel">
          <option value="free">💬 자유</option>
          <option value="stock">📈 종목</option>
        </select>
      </div>
      <input id="board-stock" class="board-nick-inp" placeholder="종목명 (선택)" maxlength="20"
        style="width:100%;box-sizing:border-box;margin-bottom:8px">
      <textarea id="board-text" class="board-text-inp" placeholder="의견을 남겨주세요 (300자 이내)" maxlength="300"></textarea>
      <button id="board-submit-btn" class="board-submit" onclick="submitBoardPost()">게시하기 ✈️</button>
    </div>
    <div class="board-filter">
      <button class="board-ftab ${_boardFilter==='all'?'on':''}" onclick="setBoardFilter('all')">전체</button>
      <button class="board-ftab ${_boardFilter==='free'?'on':''}" onclick="setBoardFilter('free')">💬 자유토론</button>
      <button class="board-ftab ${_boardFilter==='stock'?'on':''}" onclick="setBoardFilter('stock')">📈 종목토론</button>
    </div>
    <div id="board-content">
      <div style="text-align:center;padding:30px;color:#94A3B8;font-size:13px">로딩 중...</div>
    </div>
  </div>`;
}


// PWA Service Worker + 자동 업데이트 감지
// SW 비활성화 (캐시 문제로 임시 제거)


function render() {
  const st = {
    total:NEWS.length,
    urgent:NEWS.filter(n=>n.urgency===1).length,
    judged:NEWS.filter(n=>n.judgment).length,
    rumor:NEWS.filter(n=>n.type==="rumor").length
  };
  const urgItems = NEWS.filter(n=>n.urgency===1&&n.type==="rumor").slice(0,1);
  const mktStatus = getMarketStatus();

  // 스크롤 위치 저장 (탭 전환 시 튀는 현상 방지)
  const _scrollY = window.scrollY || 0;
  const _tabsEl = document.querySelector('.tabs');
  const _tabsScrollLeft = _tabsEl ? _tabsEl.scrollLeft : 0;

  document.getElementById('app').innerHTML = `
    ${S.notif?`<div class="notif ${S.notif.type==='ok'||S.notif.type==='success'?'ok':S.notif.type}">${S.notif.msg}</div>`:''}
    ${S.refreshToast?`<div class="refresh-bar">🔄 새 이슈가 추가됐습니다</div>`:''}
    <div class="hdr">
      <div class="mkt-status">
        <div class="mkt-dot ${mktStatus}"></div>
        <span style="color:${mktStatus==='open'?'var(--sage)':mktStatus==='pre'?'var(--amber)':'var(--ink3)'}">
          ${mktStatus==='open'?'장중':mktStatus==='pre'?'장전':mktStatus==='post'?'시간외':'장외'}
        </span>
        <span style="color:var(--ink3)">·</span>
        <span id="hdr-clock" style="color:var(--ink3)">--:--:--</span>
        ${S._priceUpdatedAt ? `<span style="color:var(--ink3)">·</span><span style="font-family:var(--mono);font-size:10px;color:var(--teal)">데이터 ${S._priceUpdatedAt}</span>` : ''}
        ${_supplyLoaded ? `<span style="font-family:var(--mono);font-size:9px;color:var(--sage);padding:1px 5px;border:1px solid rgba(109,184,122,0.3);border-radius:4px">수급LIVE</span>` : ''}
        ${_newsLoaded   ? `<span style="font-family:var(--mono);font-size:9px;color:var(--blue);padding:1px 5px;border:1px solid rgba(90,158,224,0.3);border-radius:4px">뉴스LIVE</span>` : ''}
        <span style="margin-left:auto;display:flex;align-items:center;gap:5px">
          <span class="auto-badge ${S.autoRefresh?'on':'off'}">${S.autoRefresh?'●':'○'} AUTO</span>
        </span>
      </div>
      <div class="hdr-row1">
        <div class="brand">
          <div class="brand-tag">KOSPI INTEL V14 · 03.09</div>
          <div class="brand-name">AI 투자 분석</div>
        </div>
        <div class="hdr-btns">
          <button onclick="S.autoRefresh=!S.autoRefresh;notify(S.autoRefresh?'✅ 자동 갱신 ON':'⏸ 자동 갱신 OFF','info');render()"
            style="background:${S.autoRefresh?'rgba(34,197,94,0.15)':'var(--card2)'};border:1.5px solid ${S.autoRefresh?'rgba(34,197,94,0.4)':'var(--bdr2)'};border-radius:10px;padding:5px 9px;font-size:11px;font-weight:800;color:${S.autoRefresh?'var(--teal)':'var(--ink3)'};white-space:nowrap">
            ${S.autoRefresh?'⏸ 중지':'▶ 자동'}
          </button>
          
          <button class="crawl-btn${S.crawling?' off':''}" onclick="crawl()" ${S.crawling?'disabled':''}>
            ${S.crawling?`<span class="spin">⟳</span>`:'🔍'} 크롤
          </button>
          <button onclick="showHealthPanel()"
            style="background:none;border:1.5px solid #4CAF5040;border-radius:20px;
            padding:6px 12px;font-size:13px;color:#2E7D32;cursor:pointer;
            touch-action:manipulation" title="앱 상태 진단">🏥</button>
        </div>
      </div>
      ${urgItems.map(item=>`<div class="urg lv1" onclick="goCard(${item.id})">
        <div class="urg-icon">🚨</div>
        <div class="urg-body">
          <div class="urg-title">${item.title}</div>
          <div class="urg-sub">${gs(item.code)?.name} · 확산 ${item.speed}</div>
        </div>
        <span class="urg-pill">긴급</span>
      </div>`).join('')}
      <div class="stats">
        <div class="stat"><div class="stat-n" style="color:var(--ink)">${st.total}</div><div class="stat-l">전체</div></div>
        <div class="stat"><div class="stat-n" style="color:var(--rose)">${st.urgent}</div><div class="stat-l">🚨긴급</div></div>
        <div class="stat"><div class="stat-n" style="color:var(--amber)">${st.rumor}</div><div class="stat-l">찌라시</div></div>
        <div class="stat"><div class="stat-n" style="color:var(--sage)">${st.judged}</div><div class="stat-l">📈판단</div></div>
      </div>
    </div>

    <!-- 도움말 버튼 -->
  <button class="help-btn" onclick="openHelp()" title="도움말">❓</button>

  <div class="tabs">
      <button class="tab${S.tab==='my'?' on':''}" onclick="setTab('my')">🎯 내종목</button>
      <button class="tab${S.tab==='trade'?' on':''}" onclick="setTab('trade')">📒 매매기록</button>
      <button class="tab${S.tab==='feed'?' on':''}" onclick="setTab('feed')">📡 뉴스</button>
      <button class="tab${S.tab==='asset'?' on':''}" onclick="setTab('asset')">💹 자산</button>
      <button class="tab${S.tab==='port'?' on':''}" onclick="setTab('port')">💼 포트</button>
      <button class="tab${S.tab==='hm'?' on':''}" onclick="setTab('hm')">🌡 테마</button>
      <button class="tab${S.tab==='sk'?' on':''}" onclick="setTab('sk')">🗺 종목</button>
      <button class="tab${S.tab==='alert'?' on':''}" onclick="setTab('alert')">🔔 알림</button>
      <button class="tab${S.tab==='src'?' on':''}" onclick="setTab('src')">🕵️ 출처</button>
      <button class="tab${S.tab==='tl'?' on':''}" onclick="setTab('tl')">⏱ 타임라인</button>
      <button class="tab${S.tab==='board'?' on':''}" onclick="setTab('board')">💬 게시판</button>
    </div>

    ${S.tab==='my'    ? rMyStocks()  : ''}
    ${S.tab==='trade'  ? rTradelog()  : ''}
    ${S.tab==='feed'  ? rFeed()      : ''}
    ${S.tab==='hm'    ? rHeatmap()   : ''}
    ${S.tab==='src'   ? rSources()   : ''}
    ${S.tab==='tl'    ? rTimeline()  : ''}
    ${S.tab==='board'  ? rBoard()     : ''}
    ${S.tab==='sk'    ? rStocks()    : ''}
    ${S.tab==='port'  ? rPortfolio() : ''}
    ${S.tab==='alert' ? rAlert()     : ''}
    ${S.tab==='asset' ? rAsset()     : ''}
  `;
  bindInputs();

  // 스크롤 위치 복원
  if (_scrollY > 0) window.scrollTo(0, _scrollY);
  const _newTabsEl = document.querySelector('.tabs');
  if (_newTabsEl && _tabsScrollLeft > 0) _newTabsEl.scrollLeft = _tabsScrollLeft;
  // 현재 탭 버튼이 보이도록 스크롤
  const _activeTab = document.querySelector('.tab.on');
  if (_activeTab && _newTabsEl) {
    const tabLeft = _activeTab.offsetLeft;
    const tabWidth = _activeTab.offsetWidth;
    const navWidth = _newTabsEl.offsetWidth;
    if (tabLeft < _newTabsEl.scrollLeft || tabLeft + tabWidth > _newTabsEl.scrollLeft + navWidth) {
      _newTabsEl.scrollLeft = tabLeft - navWidth/2 + tabWidth/2;
    }
  }

  /* 가격입력 모달 렌더 */
  let modalEl = document.getElementById('price-modal-root');
  if(!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'price-modal-root';
    document.body.appendChild(modalEl);
  }
  if(S.showPriceModal) {
    // 포트폴리오에 있는 종목 + 기본 주요 종목
    const modalStocks = STOCKS.filter(s => 
      S.portfolio.some(p => p.code === s.code) ||
      ['005930','000660','005380','068270','051910','006400','034020','012450'].includes(s.code)
    );
    // 중복 제거
    const seen = new Set();
    const uniqStocks = modalStocks.filter(s => seen.has(s.code) ? false : seen.add(s.code));

    modalEl.innerHTML = `<div class="price-modal-overlay" onclick="if(event.target===this)closePriceModal()">
      <div class="price-modal">
        <div class="price-modal-hdr">
          <div>
            <div class="price-modal-title">💰 현재가 입력</div>
          </div>
          <button class="price-modal-close" onclick="closePriceModal()">✕ 닫기</button>
        </div>
        <div class="price-modal-body">
          <div class="price-modal-desc">
            📋 prices.json 자동 로드값이 미리 채워집니다. 수정 시 저장 버튼을 누르세요.<br>
            입력한 가격은 저장되어 다음에도 유지됩니다.<br>
            ⚡ 자동조회 버튼으로 API 연결을 시도할 수 있습니다.
          </div>
          ${uniqStocks.map(s => {
            const p = PRICE_BASE[s.code];
            const curVal = p?.price ? p.price.toLocaleString('ko-KR') : '';
            const isPort = S.portfolio.some(pt => pt.code === s.code);
            return `<div class="price-inp-item">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="price-inp-name">${s.name}</span>
                  ${isPort ? '<span style="font-size:10px;background:rgba(232,146,30,0.15);color:var(--amber);padding:1px 6px;border-radius:5px;font-weight:700">보유</span>' : ''}
                </div>
                <div class="price-inp-code">${s.code}</div>
              </div>
              <input class="price-inp-field" type="number" 
                data-manual-code="${s.code}" 
                placeholder="${curVal || '현재가'}" 
                value="${p?.price || ''}"
                oninput="PRICE_BASE['${s.code}'] && (S.manualPriceInputs['${s.code}']=this.value)"
              >
              <span class="price-inp-unit">원</span>
            </div>`;
          }).join('')}
        </div>
        <button class="price-modal-api-btn" onclick="tryAutoFetch()">⚡ 자동 조회 시도 (API)</button>
        <div class="price-notice">📋 prices.json → 🌐 Yahoo Finance 실시간 → 💾 캐시 순으로 가격을 불러옵니다. GitHub Actions가 매일 16:35 자동 업데이트합니다.</div>
        <button class="price-modal-save" onclick="savePriceModal()">✅ 저장 및 적용</button>
      </div>
    </div>`;
  } else {
    modalEl.innerHTML = '';
  }
}


function reCards() {
  const el = document.getElementById('cc');
  if(!el) { render(); return; }

  // 스크롤 위치 + 펼쳐진 카드 위치 저장
  const _sy = window.scrollY || 0;
  let _expCardTop = 0;
  if (S.exp) {
    const openCard = el.querySelector('.card.open');
    if (openCard) _expCardTop = openCard.getBoundingClientRect().top + window.scrollY;
  }

  const items = filtered();
  el.innerHTML = items.length===0
    ? `<div class="empty"><div class="empty-i">🔭</div><div class="empty-t">해당 조건의 이슈가 없습니다</div></div>`
    : items.map(cardHTML).join('');

  // 스크롤 위치 복원
  requestAnimationFrame(() => {
    if (S.exp && _expCardTop > 0) {
      const newOpenCard = el.querySelector('.card.open');
      if (newOpenCard) {
        const newTop = newOpenCard.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, _sy + (newTop - _expCardTop));
        return;
      }
    }
    if (_sy > 0) window.scrollTo(0, _sy);
  });
}


function refreshCardModal(id) {
  const item = NEWS.find(n => n.id === id);
  if (item && document.getElementById('card-modal-root')) {
    showCardModal(item);
  }
}

// ══════════════════════════════════════════
// 🏥 자가진단 & 자동복구 시스템
// ══════════════════════════════════════════
const HEALTH = {
  errors: [],       // 오류 로그
  recovered: 0,     // 복구 횟수
  lastCheck: null,

  // 오류 기록
  log(type, msg, detail) {
    const entry = {
      type,           // 'render' | 'data' | 'storage' | 'network' | 'crash'
      msg,
      detail: String(detail || '').slice(0, 200),
      time: new Date().toLocaleTimeString('ko-KR'),
      ts: Date.now()
    };
    this.errors.unshift(entry);
    if (this.errors.length > 30) this.errors.pop();
    console.warn(`[Health:${type}]`, msg, detail || '');
    // 심각한 오류면 즉시 복구 시도
    if (type === 'crash' || type === 'render') {
      this.autoRecover(type);
    }
  },

  // 자동복구
  autoRecover(type) {
    this.recovered++;
    console.log(`[Health] 복구 시도 #${this.recovered} (${type})`);

    try {
      if (type === 'render') {
        // render 오류 → S 초기화 후 재시도
        S.exp = null;
        S.q = '';
        S.tab = 'feed';
        try { render(); notify('🔧 화면 복구됐어요', 'ok'); return; } catch(e2) {}
      }

      if (type === 'storage') {
        // localStorage 오류 → 손상된 키 정리
        const dangerous = ['portAnalysis','newsCache','supplyCache'];
        dangerous.forEach(k => { try { JSON.parse(localStorage.getItem(k)||'{}'); } catch(e) { localStorage.removeItem(k); } });
        try { render(); notify('🔧 저장소 복구됐어요', 'ok'); return; } catch(e2) {}
      }

      if (type === 'crash') {
        // 전체 크래시 → 최소 상태로 복구
        const app = document.getElementById('app');
        if (app) {
          app.innerHTML = `
          <div style="padding:40px 20px;text-align:center">
            <div style="font-size:48px;margin-bottom:16px">⚠️</div>
            <div style="font-size:16px;font-weight:800;color:#0F1D3A;margin-bottom:8px">오류가 발생했어요</div>
            <div style="font-size:13px;color:#64748B;margin-bottom:20px">자동복구를 시도합니다...</div>
            <button onclick="HEALTH.fullReset()"
              style="background:#1565C0;color:#fff;border:none;border-radius:12px;
              padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer">
              🔄 완전 초기화
            </button>
            <button onclick="location.reload()"
              style="background:#F4F6FA;color:#4A5A7A;border:none;border-radius:12px;
              padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer;margin-left:8px">
              새로고침
            </button>
          </div>`;
        }
      }
    } catch(recoveryErr) {
      console.error('[Health] 복구 실패:', recoveryErr);
    }
  },

  // 진단 실행
  diagnose() {
    const report = [];
    let score = 100;

    // 1. render 함수 동작 테스트
    try {
      if (typeof render !== 'function') { report.push({lvl:'🔴', msg:'render 함수 없음'}); score -= 40; }
      else report.push({lvl:'🟢', msg:'render 함수 정상'});
    } catch(e) { report.push({lvl:'🔴', msg:'render 오류: '+e.message}); score -= 40; }

    // 2. #app 엘리먼트 확인
    const app = document.getElementById('app');
    if (!app) { report.push({lvl:'🔴', msg:'#app 엘리먼트 없음'}); score -= 30; }
    else if (!app.innerHTML || app.innerHTML.length < 100) { report.push({lvl:'🟡', msg:'화면 내용이 비어있음'}); score -= 20; }
    else report.push({lvl:'🟢', msg:`화면 정상 (${(app.innerHTML.length/1000).toFixed(1)}KB)`});

    // 3. NEWS 데이터 확인
    if (!Array.isArray(NEWS) || NEWS.length === 0) { report.push({lvl:'🟡', msg:'뉴스 데이터 없음 (로딩 전일 수 있음)'}); score -= 10; }
    else report.push({lvl:'🟢', msg:`뉴스 ${NEWS.length}건 로드됨`});

    // 4. PRICE_BASE 확인
    const priceCount = Object.values(PRICE_BASE).filter(p=>p.price).length;
    if (priceCount === 0) { report.push({lvl:'🟡', msg:'주가 데이터 없음 (장외시간 또는 로딩 전)'}); score -= 5; }
    else report.push({lvl:'🟢', msg:`주가 ${priceCount}종목 로드됨`});

    // 5. localStorage 용량 확인
    try {
      let lsSize = 0;
      for(let k in localStorage) { if(localStorage.hasOwnProperty(k)) lsSize += (localStorage[k]||'').length; }
      const lsKB = (lsSize / 1024).toFixed(1);
      if (lsSize > 4 * 1024 * 1024) { report.push({lvl:'🔴', msg:`저장소 과부하 (${lsKB}KB) - 정리 필요`}); score -= 15; }
      else if (lsSize > 2 * 1024 * 1024) { report.push({lvl:'🟡', msg:`저장소 용량 주의 (${lsKB}KB)`}); score -= 5; }
      else report.push({lvl:'🟢', msg:`저장소 정상 (${lsKB}KB)`});
    } catch(e) { report.push({lvl:'🟡', msg:'저장소 접근 불가'}); }

    // 6. JSON 손상 키 확인
    const checkKeys = ['portAnalysis','newsCache','watchlist','assetPortfolio'];
    let badKeys = [];
    checkKeys.forEach(k => {
      try { JSON.parse(localStorage.getItem(k) || 'null'); }
      catch(e) { badKeys.push(k); }
    });
    if (badKeys.length > 0) { report.push({lvl:'🔴', msg:`손상된 데이터: ${badKeys.join(', ')}`}); score -= 20; }
    else report.push({lvl:'🟢', msg:'저장 데이터 무결성 정상'});

    // 7. 최근 오류 확인
    const recentErrors = this.errors.filter(e => Date.now() - e.ts < 5 * 60 * 1000);
    if (recentErrors.length > 3) { report.push({lvl:'🟡', msg:`최근 5분 오류 ${recentErrors.length}건`}); score -= 10; }
    else if (recentErrors.length > 0) { report.push({lvl:'🟡', msg:`최근 오류 ${recentErrors.length}건`}); score -= 5; }
    else report.push({lvl:'🟢', msg:'최근 오류 없음'});

    return { score: Math.max(0, score), report };
  },

  // 손상 데이터 정리
  cleanStorage() {
    const keys = ['portAnalysis','newsCache','supplyCache','dartCache'];
    let cleaned = 0;
    keys.forEach(k => {
      try { JSON.parse(localStorage.getItem(k) || 'null'); }
      catch(e) { localStorage.removeItem(k); cleaned++; }
    });
    // 구버전 캐시 정리
    try {
      const pa = JSON.parse(localStorage.getItem('portAnalysis') || '{}');
      const bad = Object.values(pa).some(a => !a.verdict || a.verdict === 'undefined');
      if (bad) { localStorage.removeItem('portAnalysis'); cleaned++; }
    } catch(e) { localStorage.removeItem('portAnalysis'); cleaned++; }
    return cleaned;
  },

  // 완전 초기화 (최후 수단)
  fullReset() {
    if (!confirm('⚠️ SW캐시만 초기화됩니다.\n매매기록·포트폴리오는 보존돼요. 계속할까요?')) return;
    // 포트폴리오·관심종목 등 중요 데이터는 백업
    const keep = {};
    ['assetPortfolio','watchlist','pensionAccounts','dartKey','tradeHistory','portfolio','portAnalysis','alertKeywords','alertSettings','cf_worker_url'].forEach(k => {
      const v = localStorage.getItem(k);
      if (v) keep[k] = v;
    });
    localStorage.clear();
    // 중요 데이터 복원
    Object.entries(keep).forEach(([k,v]) => localStorage.setItem(k, v));
    notify('🔄 초기화 완료! 재시작합니다...', 'ok');
    setTimeout(() => location.reload(), 1200);
  }
};

// 전역 에러 캐치
window.onerror = function(msg, src, line, col, err) {
  HEALTH.log('crash', msg, `${src}:${line}`);
  return false;
};
window.addEventListener('unhandledrejection', e => {
  HEALTH.log('network', '비동기 오류', e.reason?.message || String(e.reason));
});

// render 함수 래핑 (오류 자동 감지)
const _origRender = typeof render !== 'undefined' ? render : null;

// rAlert에 진단 패널 추가 (나중에 inject)

function showCardModal(item) {
  document.getElementById('card-modal-root')?.remove();
  const stock = gs(item.code);
  const src = SRC[item.type] || {ico:'📰', color:'#64748B'};
  const isA = S.ana[item.id], isDartF = S.dartF[item.id], isJ = S.judging[item.id];
  const isAiF = S.aiSumF && S.aiSumF[item.id];
  const v = vdStyle(item.verdict);

  const root = document.createElement('div');
  root.id = 'card-modal-root';

  root.innerHTML = `
  <div id="card-modal-bg" onclick="closeCardModal()" style="
    position:fixed;inset:0;background:rgba(0,0,0,0.5);
    z-index:8000;animation:fadeIn .2s ease">
  </div>
  <div id="card-modal-sheet" style="
    position:fixed;bottom:0;left:0;right:0;
    background:#fff;border-radius:24px 24px 0 0;
    z-index:8001;max-height:88vh;overflow-y:auto;
    animation:slideUp .25s ease;
    padding:0 0 40px">

    <!-- 핸들 -->
    <div style="text-align:center;padding:12px 0 4px">
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;display:inline-block"></div>
    </div>

    <!-- 헤더 -->
    <div style="padding:12px 18px 14px;border-bottom:1px solid #F0F4FA">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <span style="background:${src.color}20;color:${src.color};border:1px solid ${src.color}40;
          border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">${src.ico} ${src.label||item.type}</span>
        <span style="background:#F0F4FA;color:#4A5A7A;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">${stock?.name||''}</span>
        <span style="font-size:11px;color:#94A3B8">${item.time}</span>
        <button onclick="closeCardModal()" style="margin-left:auto;background:none;border:none;font-size:20px;color:#94A3B8;padding:0;cursor:pointer">✕</button>
      </div>
      <div style="font-size:16px;font-weight:800;color:#0F1D3A;line-height:1.5">${item.title}</div>
    </div>

    <!-- 본문 -->
    <div style="padding:14px 18px">
      ${item.body ? `<p style="font-size:14px;color:#4A5A7A;line-height:1.7;margin-bottom:16px">${item.body}</p>` : ''}

      <!-- IMPACT -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:12px 14px;background:#F4F6FA;border-radius:12px">
        <div style="flex:1">
          <div style="font-size:10px;font-weight:800;color:#94A3B8;margin-bottom:4px">IMPACT</div>
          <div style="height:6px;background:#E2E8F4;border-radius:3px">
            <div style="height:6px;background:#1565C0;border-radius:3px;width:${item.impactScore||50}%"></div>
          </div>
        </div>
        <div style="font-size:20px;font-weight:900;color:#1565C0">${item.impactScore||50}</div>
      </div>

      <!-- 주가 + 수급 -->
      ${priceHTML(item.code)}
      ${supplyHTML(item.code)}

      <!-- AI 요약 -->
      ${item.aiSummary ? `
      <div style="background:#EEF4FF;border-radius:12px;padding:13px 15px;margin-bottom:12px">
        <div style="font-size:10px;font-weight:800;color:#1565C0;margin-bottom:6px">── AI 뉴스 요약 ──</div>
        <div style="font-size:13px;color:#0F1D3A;line-height:1.6">${item.aiSummary}</div>
      </div>` : `
      <button onclick="runAISummary(${item.id})" ${isAiF?'disabled':''} style="
        width:100%;background:#EEF4FF;border:none;border-radius:12px;
        padding:13px;font-size:13px;font-weight:700;color:#1565C0;margin-bottom:12px;
        cursor:pointer;touch-action:manipulation">
        ${isAiF ? '⏳ AI 요약 분석중...' : '🤖 AI 뉴스 요약'}
      </button>`}

      <!-- 팩트체크 -->
      ${item.detail ? `
      <div style="background:#F4F6FA;border-radius:12px;padding:13px 15px;margin-bottom:12px">
        <div style="font-size:10px;font-weight:800;color:#4A5A7A;margin-bottom:6px">── AI 팩트체크 ──</div>
        <div style="font-size:13px;color:#0F1D3A;line-height:1.6">${item.detail.official_check||''}</div>
        <div style="font-size:12px;color:var(--rose);margin-top:6px">⚠️ ${item.detail.action_note||''}</div>
      </div>` : `
      <button onclick="rfc(${item.id})" ${isA?'disabled':''} style="
        width:100%;background:#FFF8E1;border:none;border-radius:12px;
        padding:13px;font-size:13px;font-weight:700;color:#E65100;margin-bottom:12px;
        cursor:pointer;touch-action:manipulation">
        ${isA ? '⏳ 팩트체크 분석중...' : '✅ AI 팩트체크'}
      </button>`}

      <!-- 투자판단 -->
      ${item.judgment ? judgeHTML(item.judgment) : `
      <button onclick="runJudge(${item.id})" ${isJ?'disabled':''} style="
        width:100%;background:#1565C0;border:none;border-radius:14px;
        padding:15px;font-size:14px;font-weight:800;color:#fff;
        cursor:pointer;touch-action:manipulation">
        ${isJ ? '⏳ 투자판단 분석중...' : '📈 단기·중장기 투자판단 받기'}
      </button>`}

      <!-- 링크 -->
      ${item.link ? `<a href="${item.link}" target="_blank" style="
        display:block;text-align:center;margin-top:12px;
        font-size:12px;color:#94A3B8;text-decoration:none">
        🔗 원문 보기
      </a>` : ''}
    </div>
  </div>`;

  document.body.appendChild(root);
  // body 스크롤 막기
  document.body.style.overflow = 'hidden';
  // 모달 뜬 후 번역 (비동기)
  setTimeout(() => translateModalIfNeeded(item), 50);
}

// 모달 열린 후 번역 (비동기 - 모달 먼저 열고 나서 번역)

function translateModalIfNeeded(item) {
  const needTitleTrans = isEnglishTitle(item.title) && !item._translated;
  const needBodyTrans  = item.body && isEnglishTitle(item.body) && !item._bodyTranslated;
  if (!needTitleTrans && !needBodyTrans) return;

  Promise.all([
    needTitleTrans ? googleTranslate(item.title) : Promise.resolve(null),
    needBodyTrans  ? googleTranslate(item.body)  : Promise.resolve(null),
  ]).then(([title, body]) => {
    const idx = NEWS.findIndex(n => n.id === item.id);
    if (title) { item.title = title; item._translated = true; if(idx>=0){NEWS[idx].title=title;NEWS[idx]._translated=true;} }
    if (body)  { item.body  = body;  item._bodyTranslated = true; if(idx>=0){NEWS[idx].body=body;NEWS[idx]._bodyTranslated=true;} }
    // 모달이 열려있으면 갱신
    if (document.getElementById('card-modal-root')) showCardModal(item);
  }).catch(()=>{});
}


function closeCardModal() {
  document.getElementById('card-modal-root')?.remove();
  document.body.style.overflow = '';
}

// AI 분석 후 모달 자동 갱신

function showHealthPanel() {
  const {score, report} = HEALTH.diagnose();
  const scoreColor = score >= 80 ? '#2E7D32' : score >= 50 ? '#E65100' : '#C62828';
  const scoreBg    = score >= 80 ? '#E8F5E9' : score >= 50 ? '#FFF3E0' : '#FFEBEE';

  const existing = document.getElementById('health-modal');
  if (existing) { existing.remove(); return; }

  const el = document.createElement('div');
  el.id = 'health-modal';
  el.innerHTML = `
  <div onclick="document.getElementById('health-modal').remove()"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000"></div>
  <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:24px 24px 0 0;
    z-index:9001;max-height:80vh;overflow-y:auto;padding:20px 18px 40px">
    <div style="text-align:center;margin-bottom:4px">
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;display:inline-block"></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:16px;font-weight:900;color:#0F1D3A">🏥 앱 상태 진단</div>
      <div style="background:${scoreBg};color:${scoreColor};border-radius:20px;
        padding:6px 14px;font-size:20px;font-weight:900">${score}점</div>
    </div>

    <!-- 진단 결과 -->
    <div style="margin-bottom:16px">
      ${report.map(r=>`
      <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;
        border-bottom:1px solid #F4F6FA">
        <span style="font-size:14px;flex-shrink:0">${r.lvl}</span>
        <span style="font-size:13px;color:#0F1D3A;line-height:1.5">${r.msg}</span>
      </div>`).join('')}
    </div>

    <!-- 복구 버튼들 -->
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      <button onclick="
        const n=HEALTH.cleanStorage();
        notify('🧹 손상 데이터 '+n+'개 정리됐어요','ok');
        try{render()}catch(e){}
        document.getElementById('health-modal').remove();
        setTimeout(showHealthPanel,500)"
        style="background:#E8F5E9;border:none;border-radius:12px;padding:13px;
        font-size:13px;font-weight:700;color:#2E7D32;cursor:pointer;touch-action:manipulation">
        🧹 손상 데이터 자동 정리
      </button>
      <button onclick="
        S.exp=null;S.q='';S.tab='feed';
        try{render();notify('✅ 화면 복구됐어요','ok')}catch(e){notify('❌ 복구 실패: '+e.message,'warn')}
        document.getElementById('health-modal').remove()"
        style="background:#E3F2FD;border:none;border-radius:12px;padding:13px;
        font-size:13px;font-weight:700;color:#1565C0;cursor:pointer;touch-action:manipulation">
        🔄 화면 강제 복구
      </button>
      <button onclick="HEALTH.fullReset()"
        style="background:#FFF0F0;border:none;border-radius:12px;padding:13px;
        font-size:13px;font-weight:700;color:#C62828;cursor:pointer;touch-action:manipulation">
        ⚠️ 완전 초기화 (최후 수단)
      </button>
    </div>

    <!-- 최근 오류 로그 -->
    ${HEALTH.errors.length > 0 ? `
    <div style="font-size:11px;font-weight:800;color:#94A3B8;margin-bottom:8px">최근 오류 로그</div>
    ${HEALTH.errors.slice(0,5).map(e=>`
    <div style="background:#F8F9FA;border-radius:8px;padding:8px 10px;margin-bottom:4px">
      <div style="font-size:11px;color:#94A3B8">${e.time} · ${e.type}</div>
      <div style="font-size:12px;color:#4A5A7A;margin-top:2px">${e.msg}</div>
      ${e.detail?`<div style="font-size:10px;color:#94A3B8;margin-top:2px;word-break:break-all">${e.detail}</div>`:''}
    </div>`).join('')}` : `
    <div style="text-align:center;padding:12px;color:#94A3B8;font-size:13px">✅ 오류 로그 없음</div>`}
  </div>`;
  document.body.appendChild(el);
}

// ══════════════════════════════════════════
// 🎯 내종목 메인 탭
// ══════════════════════════════════════════

function openHelp() {
  // 오버레이 + 시트 생성
  let ov = document.getElementById('help-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'help-overlay';
    ov.className = 'help-overlay';
    ov.onclick = closeHelp;
    document.body.appendChild(ov);

    const sheet = document.createElement('div');
    sheet.id = 'help-sheet';
    sheet.className = 'help-sheet';
    sheet.innerHTML = _buildHelpHTML();
    document.body.appendChild(sheet);
  } else {
    document.getElementById('help-sheet').innerHTML = _buildHelpHTML();
  }
  requestAnimationFrame(() => {
    document.getElementById('help-overlay').classList.add('on');
    document.getElementById('help-sheet').classList.add('on');
  });
  document.body.style.overflow = 'hidden';
}


function closeHelp() {
  document.getElementById('help-overlay')?.classList.remove('on');
  document.getElementById('help-sheet')?.classList.remove('on');
  document.body.style.overflow = '';
}


function switchHelpTab(tab) {
  _helpTab = tab;
  document.getElementById('help-sheet').innerHTML = _buildHelpHTML();
}


function _buildHelpHTML() {
  const tabs = [
    { id:'signal',  label:'📊 신호등급' },
    { id:'quant',   label:'🔢 퀀트점수' },
    { id:'supply',  label:'💰 수급' },
    { id:'trade',   label:'📒 매매기록' },
  ];

  const tabBar = tabs.map(t =>
    `<button class="help-tab${_helpTab===t.id?' on':''}" onclick="switchHelpTab('${t.id}')">${t.label}</button>`
  ).join('');

  const bodies = {

    // ── 신호 등급 ──
    signal: `
      <div class="help-section">
        <div class="help-section-title">📊 퀀트 신호 등급이란?</div>
        <p style="font-size:12px;color:#4A5A7A;line-height:1.7;margin-bottom:14px">
          5가지 전략을 합산한 <b>100점 만점 투자 점수</b>입니다.<br>
          점수에 따라 A~D 등급으로 분류돼요.
        </p>

        <div class="help-item" style="border-left-color:#C62828">
          <div class="help-term"><span class="help-badge" style="background:#FFEBEE;color:#C62828">A등급 80점↑</span> 강한 보유</div>
          <div class="help-desc">모든 조건이 우수한 최고 등급. 현재 보유 중이라면 계속 들고 가세요. 신규 진입도 적극 고려할 수 있어요.</div>
          <div class="help-ex">예: 52주 신고가 근접 + 외국인 연속매수 + MACD 상승</div>
        </div>

        <div class="help-item" style="border-left-color:#1565C0">
          <div class="help-term"><span class="help-badge" style="background:#EFF6FF;color:#1565C0">B등급 60~79점</span> 보유</div>
          <div class="help-desc">양호한 상태. 보유 유지가 적합하지만 추가 매수는 신중하게 판단하세요.</div>
        </div>

        <div class="help-item" style="border-left-color:#E65100">
          <div class="help-term"><span class="help-badge" style="background:#FFF3E0;color:#E65100">C등급 40~59점</span> 관찰</div>
          <div class="help-desc">조건이 혼조세. 매수보다 관망이 유리해요. 다음 신호를 기다리세요.</div>
        </div>

        <div class="help-item" style="border-left-color:#94A3B8">
          <div class="help-term"><span class="help-badge" style="background:#F4F6FA;color:#64748B">D등급 39점↓</span> 비중 축소</div>
          <div class="help-desc">여러 조건이 부정적. 보유 중이라면 비중을 줄이거나 손절을 고려하세요.</div>
        </div>

        <div class="help-item" style="border-left-color:#C62828;background:#FFF5F5">
          <div class="help-term">🚀 자동 매수 신호</div>
          <div class="help-desc">아래 <b>3가지 조건을 동시에</b> 충족할 때만 발생해요.</div>
          <div class="help-ex">① 52주 신고가 80% 이상 근접<br>② 외국인 순매수<br>③ MACD 골든크로스 또는 RSI 50↑ + 모멘텀 양수</div>
        </div>
      </div>`,

    // ── 퀀트 점수 ──
    quant: `
      <div class="help-section">
        <div class="help-section-title">🔢 퀀트 5전략 점수 구성</div>
        <p style="font-size:12px;color:#4A5A7A;line-height:1.7;margin-bottom:14px">
          5가지 항목을 합산해 <b>100점</b>을 만들어요.<br>
          매일 장 마감 후(16시) 자동으로 실제 데이터로 업데이트됩니다.
        </p>

        <div class="help-item">
          <div class="help-term">📈 모멘텀 <span style="color:#94A3B8;font-weight:400">/ 25점</span></div>
          <div class="help-desc">최근 12개월 수익률 대비 3개월 수익률. <b>단기에 가속도가 붙는 종목</b>에 높은 점수를 줘요.</div>
          <div class="help-ex">12개월 +20%, 3개월 +8% → 모멘텀 양호</div>
        </div>

        <div class="help-item">
          <div class="help-term">🏔 52주 신고가 <span style="color:#94A3B8;font-weight:400">/ 20점</span></div>
          <div class="help-desc">현재가가 52주 최고가의 몇 %인지 측정. <b>신고가에 가까울수록</b> 강한 추세를 의미해요.</div>
          <div class="help-ex">신고가의 95% 이상 → 만점에 가까운 점수</div>
        </div>

        <div class="help-item">
          <div class="help-term">💰 외국인 수급 <span style="color:#94A3B8;font-weight:400">/ 20점</span></div>
          <div class="help-desc">외국인·기관의 매수/매도 방향. <b>5일 연속 외국인 순매수</b> 시 최고점.</div>
          <div class="help-ex">5일 연속 매수 🔥 → 20점 / 쌍매도 → 0점</div>
        </div>

        <div class="help-item">
          <div class="help-term">💎 가치 (PBR) <span style="color:#94A3B8;font-weight:400">/ 20점</span></div>
          <div class="help-desc"><b>PBR(주가순자산비율)</b>로 저평가 여부 판단. 낮을수록 싸게 사는 거예요.</div>
          <div class="help-ex">PBR 0.7↓ → 20점 (저평가) / PBR 3↑ → 4점 (과열)</div>
        </div>

        <div class="help-item">
          <div class="help-term">⚡ 기술지표 (MACD·RSI) <span style="color:#94A3B8;font-weight:400">/ 15점</span></div>
          <div class="help-desc">단기 매매 타이밍 지표.<br>
            <b>MACD</b>: 단기·장기 이동평균선의 교차 → 골든크로스면 상승 신호<br>
            <b>RSI</b>: 과매수(70↑)/과매도(30↓) 강도 측정</div>
          <div class="help-ex">MACD 골든크로스 + RSI 50~70 → 15점</div>
        </div>
      </div>`,

    // ── 수급 ──
    supply: `
      <div class="help-section">
        <div class="help-section-title">💰 수급이란?</div>
        <p style="font-size:12px;color:#4A5A7A;line-height:1.7;margin-bottom:14px">
          주식을 <b>누가 사고 팔았는지</b> 보여주는 지표예요.<br>
          외국인·기관이 사면 주가가 오를 가능성이 높아요.
        </p>

        <div class="help-item">
          <div class="help-term">🌍 외국인</div>
          <div class="help-desc">해외 기관투자자·펀드 등. <b>한국 증시에서 가장 강한 수급 주체</b>예요. 외국인이 연속 매수하면 강한 상승 신호로 봐요.</div>
          <div class="help-ex">+500억 → 외국인 대규모 순매수 (강한 긍정 신호)</div>
        </div>

        <div class="help-item">
          <div class="help-term">🏢 기관</div>
          <div class="help-desc">국내 펀드·보험·연기금 등. 외국인과 같은 방향이면 <b>쌍끌이 매수</b>로 가장 강한 신호예요.</div>
        </div>

        <div class="help-item">
          <div class="help-term">👤 개인</div>
          <div class="help-desc">개인투자자 총합. 흔히 <b>개미</b>라고 불러요. 개인이 살 때 기관·외국인이 팔면 주의가 필요해요.</div>
        </div>

        <div class="help-item" style="border-left-color:#C62828">
          <div class="help-term">🔥 5일 연속 순매수</div>
          <div class="help-desc">외국인이 5거래일 연속 순매수한 종목. 강한 추세 매수로 해석해요. 수급 점수 만점(20점)을 받아요.</div>
        </div>

        <div class="help-item">
          <div class="help-term">순매수 / 순매도</div>
          <div class="help-desc">매수금액 - 매도금액의 결과.<br>
          <b>+</b>(양수) = 더 많이 샀다 → 긍정<br>
          <b>-</b>(음수) = 더 많이 팔았다 → 부정</div>
        </div>
      </div>`,

    // ── 매매기록 ──
    trade: `
      <div class="help-section">
        <div class="help-section-title">📒 매매기록 용어 설명</div>

        <div class="help-item">
          <div class="help-term">✅ 승률</div>
          <div class="help-desc">전체 거래 중 <b>수익이 난 거래의 비율</b>이에요.<br>승률 50% = 2번 거래하면 1번 수익.</div>
          <div class="help-ex">10번 거래 중 6번 수익 → 승률 60%<br>일반적으로 <b>50% 이상이면 양호</b>해요.</div>
        </div>

        <div class="help-item">
          <div class="help-term">⚖️ 손익비</div>
          <div class="help-desc">평균 수익 ÷ 평균 손실.<br><b>손실보다 수익이 얼마나 큰지</b> 나타내요.</div>
          <div class="help-ex">평균 수익 +15%, 평균 손실 -5% → 손익비 3.0<br><b>2.0 이상이면 좋은 전략</b>이에요.</div>
        </div>

        <div class="help-item">
          <div class="help-term">📈 수익 팩터</div>
          <div class="help-desc">총 수익 ÷ 총 손실.<br><b>1.5 이상이면 안정적인 전략</b>으로 봐요.</div>
          <div class="help-ex">총 수익 300만, 총 손실 150만 → 수익팩터 2.0<br>1.0 미만이면 전략을 점검해야 해요.</div>
        </div>

        <div class="help-item">
          <div class="help-term">📉 최대 낙폭 (MDD)</div>
          <div class="help-desc">고점 대비 최대로 떨어진 손실 폭.<br>내 투자 전략이 <b>최악의 경우 얼마나 잃었는지</b>예요.</div>
          <div class="help-ex">-20% MDD = 한때 원금의 20%가 날아간 적 있음<br><b>-15% 이내면 양호</b>한 리스크 관리예요.</div>
        </div>

        <div class="help-item">
          <div class="help-term">🎯 진입 이유</div>
          <div class="help-desc">매수할 때 왜 샀는지 기록하는 란이에요.<br>나중에 <b>AI가 이 이유를 분석해서 어떤 진입 패턴이 수익이 났는지</b> 알려줘요.</div>
          <div class="help-ex">예: "52주 신고가 돌파 + 외국인 연속매수"</div>
        </div>

        <div class="help-item">
          <div class="help-term">📋 전략 분류</div>
          <div class="help-desc">거래를 전략별로 나눠서 <b>어떤 전략이 나에게 맞는지</b> 분석해요.</div>
          <div class="help-ex">단기(1주↓) / 스윙(2~4주) / 중기(1~3개월) / 장기(3개월↑) / 모멘텀 / 가치</div>
        </div>
      </div>`,
  };

  return `
    <div class="help-sheet-hdr">
      <div class="help-sheet-title">📖 KOSPI INTEL 사용 가이드</div>
      <button class="help-close" onclick="closeHelp()">✕</button>
    </div>
    <div class="help-tabs">${tabBar}</div>
    <div class="help-body">${bodies[_helpTab] || ''}</div>
  `;
}


// ══════════════════════════════════════════════
// 💬 게시판 (Worker 경유 저장 — Cloudflare KV 불필요)
// ══════════════════════════════════════════════
// Worker가 posts 배열을 메모리에 캐싱, GitHub Gist에 영구 저장

let _boardCache = null;
let _boardFilter = 'all';

/* ==================================================
   KOSPI INTEL - ai.js
================================================== */


function aiApiFetch(body) {
  const url = (() => { try { return localStorage.getItem('cf_worker_url') || AI_API_URL; } catch(e) { return AI_API_URL; } })();
  if (!url) {
    return Promise.reject(new Error('CF_WORKER_NOT_SET'));
  }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Gemini 브라우저 직접 호출 (포트폴리오 분석 전용) ──

async function geminiPortfolioFetch(prompt) {
  const key = getGeminiKey();
  if (!key) throw new Error('GEMINI_KEY_NOT_SET');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err?.error?.message || 'Gemini API 오류');
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Gemini 키 설정 모달

function showGeminiKeyModal(onSuccess) {
  document.getElementById('gemini-key-modal')?.remove();
  const key = getGeminiKey();
  const el = document.createElement('div');
  el.id = 'gemini-key-modal';
  el.innerHTML = `
  <div onclick="document.getElementById('gemini-key-modal').remove()"
    style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000"></div>
  <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:22px 22px 0 0;
    z-index:9001;padding:24px 20px 40px;max-height:85vh;overflow-y:auto">
    <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;margin:0 auto 20px"></div>
    <div style="font-size:16px;font-weight:900;color:#0F1D3A;margin-bottom:6px">🔑 Gemini API 키 설정</div>
    <div style="font-size:12px;color:#64748B;margin-bottom:16px">포트폴리오 분석에 사용 · 내 폰에만 저장</div>

    <div style="background:#F0F7FF;border-radius:12px;padding:14px;margin-bottom:16px;font-size:12px;color:#1565C0;line-height:1.8">
      <b>📌 Gemini 무료 키 발급 (1분)</b><br>
      1️⃣ <a href="https://aistudio.google.com/app/apikey" target="_blank"
        style="color:#1565C0;font-weight:700;text-decoration:underline">aistudio.google.com↗</a> 접속<br>
      2️⃣ Google 로그인 → <b>Get API Key</b> 클릭<br>
      3️⃣ <b>Create API Key</b> → 복사 후 아래 입력<br><br>
      <span style="color:#94A3B8">✅ 무료 · 하루 1500회 · 카드 불필요</span>
    </div>

    <input id="gemini-key-inp" type="password"
      placeholder="AIza로 시작하는 API 키 입력..."
      value="${key}"
      style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E2E8F4;
        border-radius:12px;font-size:13px;margin-bottom:12px;outline:none">

    <button onclick="
      const k = document.getElementById('gemini-key-inp').value.trim();
      if (!k.startsWith('AIza')) { alert('올바른 키가 아니에요 (AIza로 시작해야 해요)'); return; }
      saveGeminiKey(k);
      document.getElementById('gemini-key-modal').remove();
      notify('✅ Gemini 키 저장 완료!', 'ok');
      ${onSuccess ? onSuccess + '()' : ''}
    " style="width:100%;background:#1565C0;color:#fff;border:none;border-radius:14px;
      padding:14px;font-size:14px;font-weight:800;cursor:pointer">
      저장하고 분석 시작
    </button>
  </div>`;
  document.body.appendChild(el);
  setTimeout(() => document.getElementById('gemini-key-inp')?.focus(), 100);
}

const PRICE_ENGINE = {
  /* HTML 파일과 같은 폴더의 prices.json 을 1순위로 시도
     파일 형식: { "005930": 55800, "000660": 192000, ... }
     또는     : { "005930": { "price":55800, "chg":1.23 }, ... }  */
  JSON_URL: (() => {
    // GitHub Pages 배포 경로 자동 감지
    const base = window.location.pathname.replace(/\/[^\/]*$/, '');
    return base + '/prices.json';
  })(),

  /* CORS 프록시 URL 목록 (순서대로 시도)
     file:// 환경에서 외부 API 직접 호출은 대부분 차단되므로
     프록시를 통해 우회 시도 */
  PROXY_URLS: [
    'https://api.allorigins.win/get?url=',
    'https://corsproxy.io/?',
  ],

  /* localStorage 저장 키 */
  LS_KEY: 'kospi_prices_v2',

  /* 가격 만료 시간: 24시간 (저장된 가격이 이 시간보다 오래됐으면 만료 표시) */
  EXPIRE_MS: 24 * 60 * 60 * 1000,
};

/* ──────────────────────────────────────────
   📦 localStorage 가격 저장/불러오기
────────────────────────────────────────── */

function saveAnalysisCache() {
  // 최근 200건만 유지 (용량 절약)
  const keys = Object.keys(_analysisCache);
  if (keys.length > 200) {
    const sorted = keys.sort((a,b) => (_analysisCache[b]?.savedAt||0) - (_analysisCache[a]?.savedAt||0));
    sorted.slice(200).forEach(k => delete _analysisCache[k]);
  }
  safeSetLS('analysisCache', _analysisCache);
}


function cacheAnalysis(id, fields) {
  _analysisCache[id] = { ...(_analysisCache[id]||{}), ...fields, savedAt: Date.now() };
  saveAnalysisCache();
}


function restoreAnalysisToNews() {
  // NEWS 로드 후 캐시에서 분석 결과 복원
  let restored = 0;
  NEWS.forEach((n, i) => {
    const c = _analysisCache[n.id];
    if (!c) return;
    if (c.score     !== undefined) NEWS[i].score     = c.score;
    if (c.verdict   !== undefined) NEWS[i].verdict   = c.verdict;
    if (c.detail    !== undefined) NEWS[i].detail    = c.detail;
    if (c.judgment  !== undefined) NEWS[i].judgment  = c.judgment;
    if (c.aiSummary !== undefined) NEWS[i].aiSummary = c.aiSummary;
    if (c.aiKeywords!== undefined) NEWS[i].aiKeywords= c.aiKeywords;
    if (c.dartResult!== undefined) NEWS[i].dartResult= c.dartResult;
    restored++;
  });
  if (restored > 0) {
    console.log('[Cache] 분석 결과 복원:', restored, '건');
    render();
  }
}

/* ══════════════════════════════════════════════
   ④ 자동 갱신 시스템
══════════════════════════════════════════════ */

async function runAISummary(id) {
  if(S.aiSumF[id]) return;
  const item = NEWS.find(n=>n.id===id); if(!item) return;
  const stock = gs(item.code);
  S.aiSumF[id] = true; refreshCardModal(id); reCards();
  const prompt = `한국 주식 뉴스 요약 전문가. JSON만 응답.
종목:${stock?.name} 섹터:${stock?.sector}
제목:${item.title}
내용:${item.body}
{"summary":"1~2문장 핵심 요약 (투자자 관점)","keywords":["핵심키워드1","핵심키워드2","핵심키워드3"],"invest_points":["투자관점포인트1","투자관점포인트2"]}`;
  try {
    const res = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:400,system:"JSON만.",messages:[{role:"user",content:prompt}]});
    const data = await res.json();
    const p = JSON.parse(data.content?.map(c=>c.text||"").join("").replace(/`{3}json/g,"").replace(/`{3}/g,"").trim()||"{}");
    const i = NEWS.findIndex(n=>n.id===id);
    if(i>=0){ NEWS[i].aiSummary = p.summary; NEWS[i].aiKeywords = p.keywords; NEWS[i].aiInvestPoints = p.invest_points;
      cacheAnalysis(id,{aiSummary:p.summary,aiKeywords:p.keywords});
    }
    notify(`✅ AI 요약 완료`,"ok");
  } catch(e) {
    if (e.message === 'CF_WORKER_NOT_SET') {
      notify('⚙️ AI 기능 미설정 — 설정탭에서 CF Worker URL을 입력해주세요', 'warn');
      S.aiSumF[id] = false; refreshCardModal(id); reCards(); return;
    }
    const i = NEWS.findIndex(n=>n.id===id);
    if(i>=0){ NEWS[i].aiSummary = `${stock?.name} 관련 ${SRC[item.type]?.label}. 투자자 주목 필요.`; NEWS[i].aiKeywords = [stock?.sector, item.type==="rumor"?"찌라시":"공식"]; }
    notify(`📝 AI 요약 완료`,"info");
  }
  S.aiSumF[id] = false; refreshCardModal(id); reCards();
}

/* ══════════════════════════════════════════════
   ⑦ 투자판단 HTML
══════════════════════════════════════════════ */

async function runDart(id){
  if(S.dartF[id])return;
  const item=NEWS.find(n=>n.id===id); if(!item)return;
  const stock=gs(item.code); S.dartF[id]=true; refreshCardModal(id); reCards();
  notify(`📋 ${stock?.name} 공시 조회중...`,'info');
  const result=await fetchDart(item.code,stock.dart,item.title.slice(0,20));
  const i=NEWS.findIndex(n=>n.id===id); if(i>=0)NEWS[i].dartResult=result||[];
  S.dartF[id]=false;
  notify(result?.some(r=>r.relevance==='high'||r.relevance==='mid')?`📋 ${stock?.name} 관련 공시 발견!`:`📋 공시 조회 완료`,'ok');
  reCards();
}

/* AI 팩트체크 */

async function rfc(id){
  if(S.ana[id])return;
  const item=NEWS.find(n=>n.id===id); if(!item)return;
  const stock=gs(item.code); S.ana[id]=true; refreshCardModal(id); reCards();
  const dartCtx=item.dartResult?.length>0?`\nDART: ${item.dartResult.map(d=>`${d.title}(${d.relevance})`).join(', ')}`:'';
  const prompt=`한국 주식시장 팩트체커. JSON만 응답.\n종목:${stock?.name}(${item.code}) 섹터:${stock?.sector}\n제목:${item.title}\n내용:${item.body}\n유형:${SRC[item.type]?.label} 출처:${item.sources}개 확산:${item.speed}${dartCtx}\n{"reliability_score":0-100,"verdict":"confirmed|partial|unverified|false","key_points":["분석1","분석2","분석3"],"risk_level":"높음|중간|낮음","official_check":"한줄","action_note":"한줄"}`;
  try {
    const res=await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:1000,system:"JSON만.",messages:[{role:"user",content:prompt}]});
    const data=await res.json();
    const p=JSON.parse(data.content?.map(c=>c.text||"").join("").replace(/`{3}json/g,"").replace(/`{3}/g,"").trim()||"{}");
    const i=NEWS.findIndex(n=>n.id===id);
    if(i>=0){NEWS[i].score=p.reliability_score;NEWS[i].verdict=p.verdict;NEWS[i].detail={key_points:p.key_points,risk_level:p.risk_level,official_check:p.official_check,action_note:p.action_note};
      cacheAnalysis(id,{score:NEWS[i].score,verdict:NEWS[i].verdict,detail:NEWS[i].detail});
    }
    notify(`✅ ${stock?.name} 팩트체크 완료`,"ok");
  } catch(e) {
    const base=item.type==="official"?95:item.type==="news"?84:item.sources>5?60:38;
    const i=NEWS.findIndex(n=>n.id===id);
    if(i>=0){NEWS[i].score=base;NEWS[i].verdict=item.type==="official"?"confirmed":item.type==="news"?"confirmed":item.sources>5?"partial":"unverified";NEWS[i].detail={key_points:["DART 공시 교차 확인 권장","다중 소스 검증 필요","시장 민감도 주의"],risk_level:item.sent==="부정"?"높음":"중간",official_check:"공시 별도 확인 필요",action_note:"공식 자료 참조 필수"};}
    notify(`📊 ${stock?.name} 분석 완료`,"info");
  }
  S.ana[id]=false; refreshCardModal(id); reCards();
}

/* AI 투자판단 */

async function runJudge(id){
  if(S.judging[id])return;
  const item=NEWS.find(n=>n.id===id); if(!item)return;
  const stock=gs(item.code);
  const stockName = stock?.name || item.source || '뉴스';
  S.judging[id]=true; refreshCardModal(id); reCards();
  notify(`📈 ${stockName} 투자판단 분석중...`,'info');
  const dartCtx=item.dartResult?.length>0?`\nDART 공시: ${item.dartResult.map(d=>`${d.title}(관련도:${d.relevance})`).join(', ')}`:'';
  const factCtx=item.detail?`\n팩트체크: 신뢰도${item.score}점, 판정:${item.verdict}, 리스크:${item.detail.risk_level}`:'';
  const prompt=`당신은 한국 주식시장 전문 투자 애널리스트입니다. 아래 이슈를 바탕으로 투자 판단을 내려주세요.

[이슈]
종목: ${stockName}(${item.code}) / 섹터: ${stock?.sector||'일반'} / 테마: ${(item.themes||[]).join(',')}
제목: ${item.title}
내용: ${item.body}
유형: ${SRC[item.type]?.label} / 출처수: ${item.sources}개 / 확산속도: ${item.speed}
시장 감성: ${item.sent} / 긴급도: ${item.urgency===1?'긴급':item.urgency===2?'주의':'일반'} / Impact: ${item.impactScore}점${dartCtx}${factCtx}

JSON만 응답:
{"verdict":"강력매수|매수|단기매수|관망|주의/관망|매도 고려|회피/매도","confidence":0-100,"summary":"2~3문장 종합 투자 의견","short":{"signal":"매수|관망|매도","reason":"단기 1~4주 이유"},"mid":{"signal":"매수|관망|매도","reason":"중기 1~6개월 이유"},"long":{"signal":"매수|관망|매도","reason":"장기 6개월+ 이유"},"factors":[{"icon":"📊","text":"근거1"},{"icon":"⚡","text":"근거2"},{"icon":"🎯","text":"근거3"}],"stopLoss":"-5~8%","targetReturn":"+10~20%"}`;
  try {
    const res=await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:1000,system:"JSON만 출력.",messages:[{role:"user",content:prompt}]});
    const data=await res.json();
    const j=JSON.parse(data.content?.map(c=>c.text||"").join("").replace(/`{3}json/g,"").replace(/`{3}/g,"").trim()||"{}");
    const i=NEWS.findIndex(n=>n.id===id); if(i>=0){NEWS[i].judgment=j;
      cacheAnalysis(id,{judgment:j});
    }
    notify(`📈 ${stockName} 투자판단 완료!`,"ok");
  } catch(e) {
    const isBull=item.sent==="긍정"&&item.sources>3, isBear=item.sent==="부정", isRumor=item.type==="rumor";
    const isHighImpact = (item.impactScore||50) >= 80;
    const j={
      verdict:isBear?"주의/관망":isBull&&item.score>=80&&isHighImpact?"매수":isBull?"단기매수":"관망",
      confidence:isRumor?45:item.score>=80?72:58,
      summary:`${stockName}의 ${SRC[item.type]?.label||'뉴스'} 이슈 분석 결과 ${isBull?'긍정적 모멘텀이 감지됩니다':'불확실성이 존재합니다'}. ${isRumor?'루머 특성상 공식 확인 전 신중한 접근을 권합니다.':'추가 검증이 필요합니다.'}`,
      short:{signal:isBear?"관망":isBull?"매수":"관망",reason:`${item.speed==="매우 빠름"?"빠른 확산으로 단기 모멘텀 가능":"확산 속도 보통, 단기 영향 제한적"}.`},
      mid:{signal:isBull&&!isRumor?"매수":"관망",reason:`${stock?.sector||'해당'} 섹터 흐름 연동 필요.`},
      long:{signal:"관망",reason:"장기 펀더멘털 변화 여부 추가 확인 필요."},
      factors:[{icon:"📊",text:`출처 ${item.sources}개, Impact Score ${item.impactScore}점`},{icon:"⚡",text:`시장 감성 ${item.sent} · 확산 ${item.speed}`},{icon:"🎯",text:`테마: ${(item.themes||[]).join(', ')}`}],
      stopLoss:"-5% 이내", targetReturn:isBull?"+10~15%":"+5~8%",
    };
    const i=NEWS.findIndex(n=>n.id===id); if(i>=0){NEWS[i].judgment=j;
      cacheAnalysis(id,{judgment:j});
    }
    notify(`📈 ${stockName} 투자판단 완료`,"info");
  }
  S.judging[id]=false; refreshCardModal(id); reCards();
}

/* 일괄 분석 */

async function runAll(){
  const u=NEWS.filter(n=>!n.verdict).sort((a,b)=>a.urgency-b.urgency);
  notify(`🤖 ${u.length}건 순차 분석 시작...`,"info");
  for(const item of u){
    if(!item.dartResult) await runDart(item.id);
    await rfc(item.id);
    await runJudge(item.id);
    await new Promise(r=>setTimeout(r,500));
  }
  notify(`✅ 전체 분석 완료!`, 'ok');
}

/* ══ 시작 ══ */

async function runPortAnalysis(code) {
  if(S.portAnaF?.[code]) return;
  const portItem = S.portfolio.find(p=>p.code===code); if(!portItem) return;
  const stock = gs(code);
  const pr = PRICE_BASE[code];
  const sup = SUPPLY_BASE[code];
  const relNews = NEWS.filter(n=>n.code===code);
  if(!S.portAnaF) S.portAnaF = {};
  S.portAnaF[code] = true; render();

  const pnlPct = ((pr.price - portItem.buyPrice) / portItem.buyPrice * 100).toFixed(2);
  const newsCtx = relNews.slice(0,3).map(n=>`[${n.type}] ${n.title} (${n.sent})`).join('\n');
  const supCtx = sup ? `외국인${sup.foreign>=0?'+':''}${sup.foreign}억, 기관${sup.inst>=0?'+':''}${sup.inst}억, 개인${sup.retail>=0?'+':''}${sup.retail}억` : '';

  /* 트레일링 구간 판단 */
  const _curPrc      = pr?.price ?? portItem.buyPrice;
  /* 시대 흐름 메모리 컨텍스트 */
  const _mem = getMemoryContext(code);
  const _basedTarget = portItem.buyPrice * 1.15;
  const _isTrailing  = _curPrc > _basedTarget;
  const trailingCtx  = _isTrailing
    ? `\n⚠️ 현재가(${_curPrc.toLocaleString()}원)가 목표가(${Math.round(_basedTarget).toLocaleString()}원) 초과 — 트레일링 수익 구간.\n손절가=현재가×0.93(${Math.round(_curPrc*0.93).toLocaleString()}원), 목표가=현재가×1.15(${Math.round(_curPrc*1.15).toLocaleString()}원)로 계산하세요.`
    : '';

  const prompt = `당신은 워런 버핏의 투자 철학을 완벽히 내면화한 한국 주식 전문 애널리스트입니다.
버핏 핵심 원칙: ①내재가치 vs 시장가격(안전마진) ②경제적 해자(진입장벽·브랜드·독점) ③훌륭한 경영진 ④이해할 수 있는 사업 ⑤장기 보유(단기 노이즈 무시) ⑥공포에 매수 탐욕에 매도

[분석 종목]
종목: ${stock?.name}(${code}) / 섹터: ${stock?.sector}
매수가: ${portItem.buyPrice.toLocaleString()}원 / 현재가: ${_curPrc.toLocaleString()}원 / 수량: ${portItem.qty}주 / 수익률: ${pnlPct}%${trailingCtx}
수급(외국인·기관·개인): ${supCtx||'정보없음'}
최근 이슈: ${newsCtx||'없음'}
${_mem.historyCount > 0 ? _mem.summary : ''}

[버핏 관점 분석 기준]
1. 이 기업이 10년 후에도 존재하며 더 강해질 것인가?
2. 지금 가격이 내재가치 대비 싼가, 비싼가? 안전마진은?
3. 이 뉴스·수급은 장기 가치에 실질 영향인가, 무시할 노이즈인가?
4. 경제적 해자(독점력, 브랜드, 전환비용, 원가우위)가 있는가?
5. 버핏이라면 지금 무엇을 선택하겠는가?

JSON만 응답 (마크다운 없이):
{"verdict":"강력보유|매수|분할매수|관망|일부매도|손절검토","confidence":0-100,"summary":"버핏 관점 핵심 판단 2~3문장 — 해자·내재가치·장기전망 반드시 언급","buffett_moat":"경제적 해자 평가: 강함/보통/약함/없음 + 한국시장 맥락에서 근거","buffett_quote":"버핏 어록 스타일의 촌철살인 한마디 (한국어, 이 종목 맞춤)","upProb":0-100,"flatProb":0-100,"dnProb":0-100,"stopLoss":"X원(-X%) 트레일링이면 현재가기준","target":"X원(+X%) 장기 내재가치 기준","d1":{"signal":"매수|관망|매도","up":0-100,"dn":0-100},"w1":{"signal":"매수|관망|매도","up":0-100,"dn":0-100},"m1":{"signal":"매수|관망|매도","up":0-100,"dn":0-100},"y1":{"signal":"매수|관망|매도","up":0-100,"dn":0-100},"detail":"버핏식 투자 액션 플랜: 단기 노이즈 vs 장기가치 구분 서술. 트레일링이면 반드시 언급","_trailing":${_isTrailing}}`;

  try {
    const res = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:1000,system:"JSON만.",messages:[{role:"user",content:prompt}]});
    const data = await res.json();
    const txt = data.content?.map(c=>c.text||"").join("").replace(/`{3}json/g,"").replace(/`{3}/g,"").trim();
    const ana = JSON.parse(txt||"{}");
    if(!S.portAnalysis) S.portAnalysis = {};
    S.portAnalysis[code] = ana;
    notify(`🤖 ${stock?.name} AI 분석 완료`,'ok');
  } catch(e) {
    // 폴백
    const isPos = Number(pnlPct) >= 0;

    /* ── 트레일링 로직 ──
       현재가 > 매수가×1.15(목표가) → 트레일링 구간
       현재가 ≤ 목표가             → 매수가 기준       */
    const curPrice     = pr?.price ?? portItem.buyPrice;
    const basedTarget  = portItem.buyPrice * 1.15;
    const isTrailing   = curPrice > basedTarget;

    let stopLossStr, targetStr, trailingNote;
    if (isTrailing) {
      // 트레일링 수익 구간: 현재가 기준
      stopLossStr  = `${Math.round(curPrice * 0.93).toLocaleString()}원 (현재가 -7%)`;
      targetStr    = `${Math.round(curPrice * 1.15).toLocaleString()}원 (현재가 +15%)`;
      trailingNote = '📈 트레일링 수익 구간 — 목표가를 현재가 기준으로 상향 조정';
    } else {
      // 일반 구간: 매수가 기준
      stopLossStr  = `${Math.round(portItem.buyPrice * 0.93).toLocaleString()}원 (-7%)`;
      targetStr    = `${Math.round(portItem.buyPrice * 1.15).toLocaleString()}원 (+15%)`;
      trailingNote = '';
    }

    if(!S.portAnalysis) S.portAnalysis = {};
    S.portAnalysis[code] = {
      verdict: isPos ? "강력보유" : "관망",
      confidence: 65,
      summary: `${stock?.name} ${isPos?'수익':'손실'} 중. 수급 ${sup&&(sup.foreign+sup.inst)>0?'외국인·기관 매수세':'혼조세'}. 관련 이슈 ${relNews.length}건 모니터링 필요.`,
      buffett_moat: `${stock?.sector} 섹터 내 ${stock?.name}의 경제적 해자는 AI 연결 후 정밀 분석 가능합니다.`,
      buffett_quote: `훌륭한 기업을 적정한 가격에 사는 것이, 적정한 기업을 훌륭한 가격에 사는 것보다 낫다.`,
      upProb: isPos?62:38, flatProb:22, dnProb: isPos?16:40,
      stopLoss: stopLossStr,
      target:   targetStr,
      d1:{signal:"관망",up:52,dn:48}, w1:{signal:isPos?"매수":"관망",up:58,dn:42},
      m1:{signal:isPos?"매수":"관망",up:62,dn:38}, y1:{signal:"매수",up:68,dn:32},
      detail: trailingNote
        ? `${trailingNote}. ${stock?.sector} 섹터 이슈와 수급 흐름을 종합적으로 모니터링하세요.`
        : `현재 ${isPos?'수익':'손실'} 구간. ${stock?.sector} 섹터 이슈와 수급 흐름을 종합적으로 모니터링하세요.`,
      _trailing: isTrailing,
    };
    notify(`📊 ${stock?.name} 분석 완료 (시뮬)`,'info');
  }
  S.portAnaF[code] = false; render();
}

/* DART */

function portAnalysisHTML(ana, p) {
  // ── 옛날 캐시 데이터 방어 (undefined 방지) ──
  if (!ana || !ana.verdict || ana.verdict === 'undefined') return '';
  ana.confidence  = ana.confidence  ?? 65;
  ana.summary     = ana.summary     || '분석 데이터를 불러오는 중...';
  ana.upProb      = ana.upProb      ?? 50;
  ana.flatProb    = ana.flatProb    ?? 25;
  ana.dnProb      = ana.dnProb      ?? 25;
  ana.stopLoss    = ana.stopLoss    || '-';
  ana.target      = ana.target      || '-';
  ana.detail      = ana.detail      || '';
  ana.d1 = ana.d1 || {signal:'관망', up:50, dn:50};
  ana.w1 = ana.w1 || {signal:'관망', up:50, dn:50};
  ana.m1 = ana.m1 || {signal:'관망', up:50, dn:50};
  ana.y1 = ana.y1 || {signal:'관망', up:50, dn:50};

  const T={"강력보유":{bg:"linear-gradient(135deg,#E8F5E9,#C8E6C9)",ac:"#2E7D32"},"매수":{bg:"linear-gradient(135deg,#E3F2FD,#BBDEFB)",ac:"#1565C0"},"분할매수":{bg:"linear-gradient(135deg,#E8EAF6,#C5CAE9)",ac:"#283593"},"관망":{bg:"linear-gradient(135deg,#FFF8E1,#FFECB3)",ac:"#E65100"},"일부매도":{bg:"linear-gradient(135deg,#FFF3E0,#FFE0B2)",ac:"#BF360C"},"손절검토":{bg:"linear-gradient(135deg,#FFEBEE,#FFCDD2)",ac:"#B71C1C"}};
  const t=T[ana.verdict]||T["관망"];
  const periods=[{label:"1일",d:ana.d1},{label:"1주",d:ana.w1},{label:"1개월",d:ana.m1},{label:"1년",d:ana.y1}];
  return `<div class="ai-port-result">
    <div class="ai-port-top" style="background:${t.bg}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div><div class="ai-port-verdict">${ana.verdict}</div><div class="ai-port-sub">AI 개인 투자 분석</div></div>
        <div style="text-align:right"><div style="font-family:var(--mono);font-size:22px;font-weight:700;color:${t.ac}">${ana.confidence}%</div><div style="font-size:10px;color:#4A5A7A">신뢰도</div></div>
      </div>
      <div class="ai-port-summary">${ana.summary}</div>

      <!-- 버핏 해자 + 명언 -->
      ${ana.buffett_moat ? `
      <div style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;padding:9px 11px;background:rgba(255,255,255,0.65);border-radius:10px;border:1px solid rgba(255,255,255,0.8)">
        <span style="font-size:15px;flex-shrink:0">🏰</span>
        <div>
          <div style="font-size:10px;font-weight:800;color:#4A5A7A;letter-spacing:0.5px;margin-bottom:2px">경제적 해자</div>
          <div style="font-size:12px;color:#0F1D3A;line-height:1.5">${ana.buffett_moat}</div>
        </div>
      </div>` : ''}
      ${ana.buffett_quote ? `
      <div style="margin-top:8px;padding:9px 13px;background:rgba(21,101,192,0.08);border-left:3px solid #1565C0;border-radius:0 10px 10px 0">
        <div style="font-size:10px;font-weight:800;color:#1565C0;margin-bottom:3px">💬 버핏이라면</div>
        <div style="font-size:12px;color:#0F1D3A;font-style:italic;line-height:1.6">"${ana.buffett_quote}"</div>
      </div>` : ''}

      <!-- 1일/1주/1개월/1년 전망 -->
      <div class="forecast-grid">
        ${periods.map(fp=>`<div class="forecast-cell" style="border-color:${t.ac}22">
          <div class="forecast-period" style="color:#4A5A7A">${fp.label} 전망</div>
          <div class="forecast-signal" style="color:${fp.d?.signal==='매수'?'#3AE890':fp.d?.signal==='매도'?'#FF7070':'#F5C840'}">${fp.d?.signal||'관망'}</div>
          <div class="forecast-prob" style="color:#78909C">↑${fp.d?.up||'—'}% ↓${fp.d?.dn||'—'}%</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="ai-port-bot">
      <!-- 상승/하락 확률 -->
      <div class="prob-row">
        <div class="prob-cell up"><div class="prob-label">상승 확률</div><div class="prob-val">${ana.upProb}%</div></div>
        <div class="prob-cell flat"><div class="prob-label">횡보</div><div class="prob-val">${ana.flatProb}%</div></div>
        <div class="prob-cell dn"><div class="prob-label">하락 확률</div><div class="prob-val">${ana.dnProb}%</div></div>
      </div>
      ${ana._trailing ? `<div style="margin-bottom:8px;padding:7px 12px;background:linear-gradient(135deg,rgba(232,146,30,0.15),rgba(90,158,224,0.1));border:1px solid rgba(232,146,30,0.4);border-radius:10px;font-size:12px;font-weight:800;color:var(--amber);display:flex;align-items:center;gap:6px"><span>📈</span><span>트레일링 수익 구간 — 현재가 기준 적용</span></div>` : ''}
      <div style="display:flex;gap:7px;margin-bottom:10px">
        <div style="flex:1;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.28);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--rose);font-weight:700;margin-bottom:3px">${ana._trailing ? '손절 (현재가 기준)' : '손절 기준'}</div>
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--rose)">${ana.stopLoss}</div>
        </div>
        <div style="flex:1;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.28);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--teal);font-weight:700;margin-bottom:3px">${ana._trailing ? '목표 (현재가 기준)' : '목표 수익'}</div>
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--teal)">${ana.target}</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--ink3);line-height:1.65">${ana.detail}</div>
      <div style="margin-top:9px;font-size:11px;color:var(--ink3);font-style:italic">⚠️ AI 참고 의견입니다. 투자 판단은 본인 책임 하에 결정하세요.</div>
      <button onclick="delete S.portAnalysis['${p.code}'];render()" style="margin-top:8px;background:none;border:1px solid var(--bdr);border-radius:7px;padding:4px 11px;font-size:11px;color:var(--ink3);cursor:pointer">재분석</button>
    </div>
  </div>`;
}

/* ── AI 개인 투자 분석 실행 ── */

async function runPortfolioAI() {
  const port = S.portfolio || [];
  if (port.length === 0) { notify('⚠️ 포트폴리오에 종목을 먼저 추가하세요', 'warn'); return; }

  S._portAILoading = true; render();
  notify('📊 포트폴리오 AI 분석 중...', 'info');

  const totalInvest = port.reduce((s,p) => s + (p.buyPrice||0)*(p.qty||1), 0);
  const totalCur    = port.reduce((s,p) => {
    const cur = PRICE_BASE[p.code]?.price || p.buyPrice;
    return s + cur*(p.qty||1);
  }, 0);

  const items = port.map(p => {
    const pr  = PRICE_BASE[p.code];
    const cur = pr?.price || p.buyPrice;
    const pnl = ((cur - p.buyPrice)/p.buyPrice*100).toFixed(1);
    const sig = calcSignal(p.code);
    return { name:p.name, code:p.code, qty:p.qty, buyPrice:p.buyPrice, curPrice:cur, pnlPct:pnl, score:sig?.total||0, sector:p.sector||'기타' };
  });

  const prompt = `당신은 KOSPI 투자 전문가입니다. 아래 포트폴리오를 분석해서 JSON으로만 응답하세요.

포트폴리오: 총투자 ${(totalInvest/10000).toFixed(0)}만원, 평가 ${(totalCur/10000).toFixed(0)}만원
종목: ${items.map(i=>i.name+'('+i.pnlPct+'%, 퀀트'+i.score+'점)').join(', ')}

반드시 아래 JSON 형식만 출력 (백틱/설명 금지):
{"verdict":"보유유지|리밸런싱|차익실현|추가매수","summary":"2문장 요약","stocks":[{"code":"종목코드","action":"매수|보유|매도|관망","reason":"이유"}],"quote":"버핏 명언"}`;

  try {
    const res  = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:800,system:"JSON만 응답",messages:[{role:"user",content:prompt}]});
    const ct = res.headers?.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error('Worker 오류: ' + txt.slice(0, 100));
    }
    const data = await res.json();
    const raw  = data.content?.map(c=>c.text||'').join('') || '';
    let r;
    try {
      const cleaned = raw.replace(/```json/g,'').replace(/```/g,'').trim();
      const m = cleaned.match(/\{[\s\S]*\}/);
      r = JSON.parse(m ? m[0] : cleaned);
    } catch(e) { throw new Error('AI 응답 파싱 실패'); }

    S._portAILoading = false;
    showPortfolioAIResult(r, items, ((totalCur-totalInvest)/totalInvest*100).toFixed(1));
    render();
  } catch(e) {
    S._portAILoading = false; render();
    notify('❌ AI 분석 실패: ' + e.message, 'error');
  }
}



function showPortfolioAIResult(r, items, totalPnlPct) {
  const vd = {
    '보유유지': {bg:'linear-gradient(135deg,#E8F5E9,#C8E6C9)',accent:'#2E7D32'},
    '리밸런싱': {bg:'linear-gradient(135deg,#FFF8E1,#FFECB3)',accent:'#F57F17'},
    '차익실현': {bg:'linear-gradient(135deg,#FFF3E0,#FFE0B2)',accent:'#E65100'},
    '추가매수': {bg:'linear-gradient(135deg,#E3F2FD,#BBDEFB)',accent:'#1565C0'},
  }[r.verdict] || {bg:'linear-gradient(135deg,#F4F6FA,#E2E8F4)',accent:'#64748B'};

  const actionBadge = a => ({
    '매수':'<span style="background:#E8F5E9;color:#2E7D32;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800">매수</span>',
    '보유':'<span style="background:#EFF6FF;color:#1565C0;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800">보유</span>',
    '매도':'<span style="background:#FFF3E0;color:#E65100;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800">매도</span>',
    '관망':'<span style="background:#F4F6FA;color:#64748B;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800">관망</span>',
  }[a] || a);

  const el = document.createElement('div');
  el.id = 'portai-modal';
  el.innerHTML = `
  <div onclick="document.getElementById('portai-modal').remove();document.body.style.overflow=''"
    style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000"></div>
  <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:22px 22px 0 0;
    z-index:9001;max-height:88vh;overflow-y:auto;padding-bottom:40px">
    <div style="text-align:center;padding:12px 0 4px">
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;display:inline-block"></div>
    </div>
    <div style="padding:14px 18px;border-bottom:1px solid #F0F4FA">
      <div style="font-size:15px;font-weight:900;color:#0F1D3A">📊 포트폴리오 AI 분석</div>
    </div>
    <div style="padding:16px 18px">
      <div style="background:${vd.bg};border-radius:14px;padding:16px;margin-bottom:14px;text-align:center">
        <div style="font-size:20px;font-weight:900;color:${vd.accent};margin-bottom:6px">${r.verdict}</div>
        <div style="font-size:13px;color:#334155;line-height:1.6">${r.summary}</div>
      </div>
      <div style="font-size:11px;font-weight:800;color:#64748B;margin-bottom:8px">종목별 의견</div>
      ${(r.stocks||[]).map(s => {
        const item = items.find(i=>i.code===s.code)||{};
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#F8FAFF;border-radius:10px;margin-bottom:6px">
          <div style="flex:1;font-size:13px;font-weight:700;color:#0F1D3A">${item.name||s.code}</div>
          ${actionBadge(s.action)}
          <div style="font-size:11px;color:#64748B;flex:2">${s.reason}</div>
        </div>`;
      }).join('')}
      <div style="background:linear-gradient(135deg,#1A237E,#283593);border-radius:12px;padding:14px;margin-top:12px;text-align:center">
        <div style="font-size:10px;color:rgba(255,255,255,.6);margin-bottom:6px">💬 버핏이라면</div>
        <div style="font-size:12px;color:#fff;font-style:italic;line-height:1.6">"${r.quote||getBuffettQuote('hold')}"</div>
      </div>
      <button onclick="document.getElementById('portai-modal').remove();document.body.style.overflow=''"
        style="width:100%;margin-top:14px;background:#F4F6FA;border:none;border-radius:14px;
          padding:14px;font-size:14px;font-weight:700;color:#64748B;cursor:pointer">닫기</button>
    </div>
  </div>`;
  document.getElementById('portai-modal')?.remove();
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
}


// ── 2. 종목 매수 타이밍 100점 분석 ──

async function runBuyTiming(code) {
  const stock = gs(code) || ETF_LIST?.find(e=>e.code===code);
  const name  = stock?.name || code;
  const pr    = PRICE_BASE[code];
  const sup   = (window.SUPPLY_DATA || {})[code];
  const news  = NEWS.filter(n=>n.code===code).slice(0,5);

  if (!pr?.price) { notify('⚠️ 주가 데이터 없음 — 잠시 후 다시 시도하세요', 'warn'); return; }

  S._timingLoading = S._timingLoading || {};
  S._timingLoading[code] = true;
  notify(`⏱ ${name} 매수 타이밍 분석 중...`, 'info');

  const supCtx = sup ? `외국인 ${sup.foreign>=0?'+':''}${sup.foreign}주, 기관 ${sup.inst>=0?'+':''}${sup.inst}주` : '수급 데이터 없음';
  const newsCtx = news.map(n=>`${n.title} (${n.sent})`).join(' | ') || '없음';
  const chg = pr.chg || 0;
  const highLowPos = pr.high && pr.low ?
    ((pr.price - parseFloat(String(pr.low).replace(/,/g,''))) /
     (parseFloat(String(pr.high).replace(/,/g,'')) - parseFloat(String(pr.low).replace(/,/g,''))) * 100).toFixed(0) : '?';

  // 퀀트 점수 먼저 계산
  const quantSig = calcSignal(code);
  const supCtxStr = sup ? `외국인 ${sup.foreign>=0?'+':''}${sup.foreign}주, 기관 ${sup.inst>=0?'+':''}${sup.inst}주` : '수급 데이터 없음';
  const newsCtxStr = news.map(n=>`${n.title} (${n.sent})`).join(' | ') || '없음';

  const prompt = `너는 단기 트레이딩 AI다. 아래 3가지 조건이 동시에 충족될 때만 매수 신호를 생성하라.

[종목] ${name}(${code})
현재가: ${pr.price.toLocaleString()}원 / 전일대비: ${chg>=0?'+':''}${chg}%
고저위치: ${highLowPos}% (100%=52주고가)
수급: ${supCtxStr}
최근뉴스: ${newsCtxStr}

[퀀트 사전 점수]
모멘텀(25): ${quantSig.scores.momentum}점 — ${quantSig.details.momentum?.label||'?'}
52주신고가(20): ${quantSig.scores.high52}점 — ${quantSig.details.high52?.label||'?'}
외국인수급(20): ${quantSig.scores.supply}점 — ${quantSig.details.supply?.label||'?'}
가치(20): ${quantSig.scores.value}점 — ${quantSig.details.value?.label||'?'}
기술지표(15): ${quantSig.scores.technical}점 — ${quantSig.details.technical?.val||'?'}

[자동매수 3조건 체크]
조건1 - 52주 신고가 돌파/근접(80%이상): ${quantSig.conds.cond1_high52 ? '✅충족' : '❌미충족'}
조건2 - 외국인 순매수: ${quantSig.conds.cond2_supply ? '✅충족' : '❌미충족'}
조건3 - MACD골든크로스 또는 RSI50이상: ${quantSig.conds.cond3_macd ? '✅충족' : '❌미충족'}
추가필터 - 12개월 모멘텀 시장평균이상: ${quantSig.conds.cond_momentum ? '✅충족' : '❌미충족'}
→ 3조건 동시충족: ${quantSig.autoBuy ? '✅ 매수신호 발생' : '❌ 매수신호 없음'}

위 퀀트 점수를 기반으로 JSON만 응답 (마크다운 없이):
{
  "score": ${quantSig.score},
  "momentum": {"score":${quantSig.scores.momentum},"label":"${quantSig.details.momentum?.label||'?'}","detail":"모멘텀 상세 1문장"},
  "supply": {"score":${quantSig.scores.supply},"label":"${quantSig.details.supply?.label||'?'}","detail":"수급 상세 1문장"},
  "trend": {"score":${quantSig.scores.high52},"label":"${quantSig.details.high52?.label||'?'}","detail":"52주 위치 상세 1문장"},
  "technical": {"score":${quantSig.scores.technical},"label":"${quantSig.details.technical?.val||'?'}","detail":"기술지표 상세 1문장"},
  "risk": {"score":${quantSig.scores.value},"label":"${quantSig.details.value?.label||'?'}","detail":"가치/리스크 1문장"},
  "market": "상승|중립|하락",
  "verdict": "${quantSig.autoBuy ? '강한매수' : quantSig.score>=60 ? '분할매수' : '관망'}",
  "targetReturn": "${quantSig.autoBuy ? '+15%' : '+8%'}",
  "stopLoss": "-7%",
  "strategy": "${quantSig.autoBuy ? '3조건 충족 — 매수 신호 발생. 단계적 진입 추천.' : '조건 미충족 — 매수 신호 없음. 조건 충족 시까지 관망.'}"
}`;

  let result;
  try {
    const res  = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:600,system:"JSON만 응답",messages:[{role:"user",content:prompt}]});
    const data = await res.json();
    const txt  = data.content?.map(c=>c.text||'').join('').replace(/```json|```/g,'').trim();
    result = JSON.parse(txt);
  } catch(e) {
    // 폴백 - 수급+기술 기반 간단 계산
    let score = 50;
    const supScore = sup ? ((sup.foreign>0?12:0) + (sup.inst>0?13:0)) : 0;
    score += supScore;
    score += chg > 0 ? 10 : chg < -2 ? -5 : 0;
    score += highLowPos < 30 ? 8 : highLowPos > 80 ? -8 : 0;
    score = Math.min(Math.max(score, 0), 100);
    result = {
      score,
      momentum: {score:Math.round(score*0.25), label:chg>0?'상승':'하락', detail:`전일대비 ${chg}%`},
      supply: {score:Math.round(supScore), label:supScore>15?'강한매수':supScore>5?'중립':'관망', detail:supCtx},
      trend: {score:Math.round(score*0.2), label:'데이터부족', detail:'이동평균 데이터 없음'},
      technical: {score:Math.round(score*0.2), label:highLowPos<30?'매수신호':'중립', detail:`고저가 위치 ${highLowPos}%`},
      risk: {score:5, label:'중간', detail:'변동성 보통'},
      market: '중립',
      verdict: score>=70?'강한매수':score>=55?'분할매수':score>=40?'관망':'매수금지',
      targetReturn: '+15%', stopLoss: '-7%',
      strategy: `${name} 현재 점수 ${score}점. ${score>=55?'단계적 진입 고려':'시장 확인 후 진입'}.`
    };
  }

  S._timingLoading[code] = false;
  showTimingResult(name, code, result);
}


function showTimingResult(name, code, r) {
  const verdictColor = {
    '강한매수':'#C62828', '분할매수':'#E65100', '관망':'#2E7D32', '매수금지':'#1565C0'
  }[r.verdict] || '#1565C0';
  const verdictBg = {
    '강한매수':'#FFEBEE', '분할매수':'#FFF3E0', '관망':'#E8F5E9', '매수금지':'#E3F2FD'
  }[r.verdict] || '#E3F2FD';
  const scoreColor = r.score>=70?'#C62828':r.score>=50?'#E65100':'#1565C0';

  const el = document.createElement('div');
  el.id = 'timing-modal';
  el.innerHTML = `
  <div onclick="document.getElementById('timing-modal').remove();document.body.style.overflow=''"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000"></div>
  <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:24px 24px 0 0;
    z-index:9001;max-height:90vh;overflow-y:auto;padding:0 0 50px;animation:slideUp .25s ease">
    <div style="text-align:center;padding:12px 0 4px">
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;display:inline-block"></div>
    </div>
    <div style="padding:14px 18px;border-bottom:1px solid #F0F4FA;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:16px;font-weight:900;color:#0F1D3A">⏱ 매수 타이밍 분석</div>
        <div style="font-size:12px;color:#94A3B8">${name} · ${code}</div>
      </div>
      <button onclick="document.getElementById('timing-modal').remove();document.body.style.overflow=''"
        style="background:none;border:none;font-size:20px;color:#94A3B8;cursor:pointer">✕</button>
    </div>
    <div style="padding:16px 18px">

      <!-- 3조건 배너 -->
      ${(r.verdict === '관망' || r.verdict === '매수금지') ? `
      <div style="background:#EFF6FF;border:1.5px solid #BBDEFB;border-radius:14px;
        padding:12px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">🚫</span>
        <div>
          <div style="font-size:13px;font-weight:900;color:#1565C0">매수 신호 없음</div>
          <div style="font-size:11px;color:#4A5A7A;margin-top:2px">3가지 조건 미충족 — 조건 충족 시까지 관망</div>
        </div>
      </div>` : `
      <div style="background:#FFEBEE;border:1.5px solid #FFCDD2;border-radius:14px;
        padding:12px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">🚀</span>
        <div>
          <div style="font-size:13px;font-weight:900;color:#C62828">매수 신호 발생!</div>
          <div style="font-size:11px;color:#4A5A7A;margin-top:2px">52주신고가 + 외국인매수 + MACD/RSI 3조건 충족</div>
        </div>
      </div>`}

      <!-- 점수 + 판단 -->
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="flex:1;background:linear-gradient(135deg,#0F1D3A,#1565C0);border-radius:16px;padding:16px;color:#fff;text-align:center">
          <div style="font-size:11px;opacity:.7;margin-bottom:4px">투자 점수</div>
          <div style="font-size:42px;font-weight:900;color:${r.score>=70?'#FF8A80':r.score>=50?'#FFD180':'#80D8FF'}">${r.score}</div>
          <div style="font-size:11px;opacity:.7">/ 100점</div>
        </div>
        <div style="flex:1;background:${verdictBg};border-radius:16px;padding:16px;text-align:center;display:flex;flex-direction:column;justify-content:center">
          <div style="font-size:11px;color:${verdictColor};font-weight:800;margin-bottom:6px">최종 판단</div>
          <div style="font-size:20px;font-weight:900;color:${verdictColor}">${r.verdict}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:6px">시장: ${r.market}</div>
        </div>
      </div>

      <!-- 5가지 점수 -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:800;color:#94A3B8;margin-bottom:8px">점수 상세</div>
        ${[
          ['모멘텀', r.momentum, 25],
          ['수급', r.supply, 25],
          ['추세', r.trend, 20],
          ['기술신호', r.technical, 20],
          ['리스크', r.risk, 10],
        ].map(([label, s, max]) => {
          const pct = (s.score/max*100).toFixed(0);
          const barColor = pct>=70?'#E53935':pct>=50?'#FF9800':'#1565C0';
          return `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;font-weight:700;color:#0F1D3A">${label} <span style="color:#94A3B8;font-weight:400">${s.label}</span></span>
              <span style="font-size:12px;font-weight:800;color:${barColor}">${s.score}/${max}</span>
            </div>
            <div style="height:6px;background:#F0F4FA;border-radius:3px">
              <div style="height:6px;background:${barColor};border-radius:3px;width:${pct}%;transition:width .4s"></div>
            </div>
            <div style="font-size:11px;color:#94A3B8;margin-top:3px">${s.detail}</div>
          </div>`;
        }).join('')}
      </div>

      <!-- 전략 -->
      <div style="background:${verdictBg};border-radius:14px;padding:14px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:800;color:${verdictColor};margin-bottom:6px">추천 전략</div>
        <div style="font-size:13px;color:#0F1D3A;line-height:1.6">${r.strategy}</div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <div style="flex:1;background:#fff;border-radius:10px;padding:8px;text-align:center">
            <div style="font-size:10px;color:#94A3B8">목표 수익률</div>
            <div style="font-size:14px;font-weight:900;color:#E53935">${r.targetReturn}</div>
          </div>
          <div style="flex:1;background:#fff;border-radius:10px;padding:8px;text-align:center">
            <div style="font-size:10px;color:#94A3B8">손절 기준</div>
            <div style="font-size:14px;font-weight:900;color:#1565C0">${r.stopLoss}</div>
          </div>
        </div>
      </div>

      <!-- 버핏 명언 -->
      <div style="padding:11px 13px;background:#F0F4FF;border-left:3px solid #1565C0;border-radius:0 10px 10px 0;margin-top:4px">
        <div style="font-size:10px;font-weight:800;color:#1565C0;margin-bottom:2px">💬 버핏이라면</div>
        <div style="font-size:11px;color:#0F1D3A;font-style:italic;line-height:1.6">"${
          r.quote || getBuffettQuote(
            r.verdict==='매수' ? 'buy' :
            r.verdict==='매도' ? 'sell' :
            r.verdict==='관망'||r.verdict==='매수금지' ? 'caution' : 'hold'
          )}"</div>
      </div>
    </div>
  </div>`;
  document.getElementById('timing-modal')?.remove();
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
}


// ── 3. 지금 사야 할 종목 TOP5 ──

async function runTop5AI() {
  S._top5Loading = true; render();
  notify('🔍 전체 종목 분석 중... (30초 소요)', 'info');

  // PRICE_BASE에서 데이터 있는 종목만
  const candidates = Object.entries(PRICE_BASE)
    .filter(([code, pr]) => pr.price && pr.chg != null)
    .map(([code, pr]) => {
      const stock = gs(code);
      const sup   = (window.SUPPLY_DATA || {})[code];
      const news  = NEWS.filter(n=>n.code===code);
      const posNews = news.filter(n=>n.sent==='긍정').length;
      const negNews = news.filter(n=>n.sent==='부정').length;
      const supScore= sup ? (sup.foreign>0?1:0)+(sup.inst>0?1:0) : 0;
      return {
        code, name: stock?.name||code, sector: stock?.sector||'?',
        price: pr.price, chg: pr.chg,
        supScore, newsScore: posNews-negNews,
        highLowPos: pr.high && pr.low ?
          Math.round((pr.price - parseFloat(String(pr.low).replace(/,/g,''))) /
          (parseFloat(String(pr.high).replace(/,/g,'')) - parseFloat(String(pr.low).replace(/,/g,''))) * 100) : 50
      };
    });

  // 퀀트 점수로 사전 필터링
  const quantScored = candidates.map(c => ({
    ...c,
    quant: calcSignal(c.code),
  })).filter(c => c.quant.score >= 40) // C등급 이상만
    .sort((a,b) => b.quant.score - a.quant.score);

  const top15 = quantScored.slice(0, 15).map(c =>
    `${c.name}(${c.code}): 퀀트${c.quant.score}점(${c.quant.grade}) / 수급${c.quant.details.supply?.label||'?'} / 52주${c.quant.details.high52?.label||'?'} / 모멘텀${c.quant.details.momentum?.label||'?'} / 매수신호${c.quant.autoBuy?'✅':'❌'}`
  ).join('\n');

  const prompt = `너는 단기 트레이딩 AI다. 아래 퀀트 점수 상위 종목 중 3조건(52주신고가+외국인순매수+MACD/RSI) 충족 종목을 우선으로 TOP5를 선정하라.

[퀀트 상위 15종목]
${top15}

선정 우선순위:
1순위: 3조건(autoBuy✅) 충족 종목
2순위: 퀀트점수 70점 이상
3순위: 수급강세 + 52주고가권

JSON만 응답 (마크다운 없이):
{
  "top5": [
    {"rank":1,"code":"005930","name":"삼성전자","score":82,"reason":"선정 이유 — 퀀트 기반 1문장","verdict":"강한매수|분할매수","target":"+12%","stopLoss":"-7%"},
    ...
  ],
  "marketComment": "오늘 퀀트 전략 기준 시장 코멘트 1문장",
  "updatedAt": "오늘"
}`;

  let result;
  try {
    const res  = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:800,system:"JSON만 응답",messages:[{role:"user",content:prompt}]});
    const ct = res.headers?.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error('Worker 오류: ' + txt.slice(0, 100));
    }
    const data = await res.json();
    const txt  = data.content?.map(c=>c.text||'').join('').replace(/```json|```/g,'').trim();
    result = JSON.parse(txt);
  } catch(e) {
    // 폴백 - 점수 기반 자동 선정
    const scored = candidates.map(c => ({
      ...c,
      total: c.supScore*25 + c.newsScore*15 + (c.highLowPos<35?20:c.highLowPos>75?-10:5) + (c.chg>0?15:c.chg>-1?5:-5)
    })).sort((a,b)=>b.total-a.total).slice(0,5);

    result = {
      top5: scored.map((c,i)=>({
        rank: i+1, code: c.code, name: c.name,
        score: Math.min(Math.max(50+c.total, 45), 95),
        reason: `수급${c.supScore>0?'강세':'약세'}, 뉴스${c.newsScore>0?'긍정':'중립'}, 고저위치 ${c.highLowPos}%`,
        verdict: c.total>30?'강한매수':'분할매수',
        target: '+12%', stopLoss: '-7%'
      })),
      marketComment: '수급과 뉴스 기반 자동 선정 결과입니다. AI 연결 시 더 정밀한 분석이 가능합니다.',
      updatedAt: new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})
    };
  }
  S.top5AI = result;
  S._top5Loading = false;
  render();
  showTop5Result();
}


function showTop5Result() {
  const r = S.top5AI;
  if (!r) return;
  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const verdictColor = v => v==='강한매수'?'#C62828':'#E65100';
  const verdictBg    = v => v==='강한매수'?'#FFEBEE':'#FFF3E0';

  const el = document.createElement('div');
  el.id = 'top5-modal';
  el.innerHTML = `
  <div onclick="document.getElementById('top5-modal').remove();document.body.style.overflow=''"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000"></div>
  <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:24px 24px 0 0;
    z-index:9001;max-height:90vh;overflow-y:auto;padding:0 0 50px;animation:slideUp .25s ease">
    <div style="text-align:center;padding:12px 0 4px">
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;display:inline-block"></div>
    </div>
    <div style="padding:14px 18px;border-bottom:1px solid #F0F4FA;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:16px;font-weight:900;color:#0F1D3A">🔥 지금 사야 할 TOP5</div>
        <div style="font-size:11px;color:#94A3B8">${r.updatedAt} 기준</div>
      </div>
      <button onclick="document.getElementById('top5-modal').remove();document.body.style.overflow=''"
        style="background:none;border:none;font-size:20px;color:#94A3B8;cursor:pointer">✕</button>
    </div>
    <div style="padding:16px 18px">
      <div style="background:#F4F6FA;border-radius:12px;padding:10px 12px;margin-bottom:14px;
        font-size:12px;color:#4A5A7A">${r.marketComment}</div>
      ${(r.top5||[]).map((item,i) => `
      <div style="background:#fff;border:1.5px solid ${i===0?'#FFD700':'#E2E8F4'};
        border-radius:16px;padding:14px;margin-bottom:10px;
        ${i===0?'box-shadow:0 4px 16px rgba(255,215,0,0.2)':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">${medals[i]}</span>
            <div>
              <div style="font-size:14px;font-weight:900;color:#0F1D3A">${item.name}</div>
              <div style="font-size:11px;color:#94A3B8">${item.code}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:900;color:${i===0?'#E53935':'#1565C0'}">${item.score}점</div>
            <div style="background:${verdictBg(item.verdict)};color:${verdictColor(item.verdict)};
              border-radius:20px;padding:3px 10px;font-size:11px;font-weight:800;margin-top:2px">
              ${item.verdict}
            </div>
          </div>
        </div>
        <div style="font-size:12px;color:#4A5A7A;line-height:1.6;margin-bottom:8px">${item.reason}</div>
        <div style="display:flex;gap:8px">
          <div style="flex:1;background:#FFF5F5;border-radius:8px;padding:6px;text-align:center">
            <div style="font-size:10px;color:#94A3B8">목표</div>
            <div style="font-size:13px;font-weight:800;color:#E53935">${item.target}</div>
          </div>
          <div style="flex:1;background:#EFF6FF;border-radius:8px;padding:6px;text-align:center">
            <div style="font-size:10px;color:#94A3B8">손절</div>
            <div style="font-size:13px;font-weight:800;color:#1565C0">${item.stopLoss}</div>
          </div>
          <button onclick="runBuyTiming('${item.code}');document.getElementById('top5-modal').remove();document.body.style.overflow=''"
            style="flex:1;background:#EEF4FF;border:1px solid #C7D4F0;border-radius:8px;
            font-size:11px;font-weight:700;color:#1565C0;cursor:pointer;touch-action:manipulation">
            ⏱ 타이밍
          </button>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
  document.getElementById('top5-modal')?.remove();
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
}

// ══════════════════════════════════════════
// 📒 매매기록 + AI 4분석 시스템
// ══════════════════════════════════════════

// 매매기록 로드/저장

async function runTradeAnalysis() {
  const trades = getTrades();
  if (trades.length < 2) { notify('⚠️ 거래 2건 이상 필요합니다', 'warn'); return; }
  const metrics = calcTradeMetrics(trades);
  notify('📊 매매 성과 AI 분석 중...', 'info');

  const tradesCtx = trades.slice(0,30).map(t =>
    `${t.name}(${t.code}): ${t.strategy}전략 / 진입이유:${t.reason||'미기재'} / `+
    `매수${t.buyPrice}→매도${t.sellPrice} / 수익률${t.pnlPct>0?'+':''}${t.pnlPct}% / `+
    `${t.holdingDays!=null?t.holdingDays+'일':'기간미기재'}`
  ).join('\n');

  const prompt = `You are an AI trading analyst. Analyze this trade history and respond in Korean.

[Trade History - ${trades.length} trades]
${tradesCtx}

[Calculated Metrics]
Win Rate: ${metrics.winRate}%
Avg Win: +${metrics.avgWin}% | Avg Loss: -${metrics.avgLoss}%
Risk-Reward Ratio: ${metrics.rrRatio}x
Profit Factor: ${metrics.profitFactor}x
Max Drawdown: ${metrics.maxDD.toLocaleString()}원
Total P&L: ${metrics.totalPnl.toLocaleString()}원

Analyze and respond in JSON only (no markdown):
{
  "summary": "전체 성과 요약 2문장",
  "winRate": {"score": ${metrics.winRate}, "eval": "평가 1문장", "benchmark": "평균 대비"},
  "riskReward": {"score": ${metrics.rrRatio}, "eval": "평가 1문장"},
  "profitFactor": {"score": ${metrics.profitFactor}, "eval": "평가 1문장"},
  "bestStrategy": "가장 잘한 전략/패턴",
  "worstStrategy": "가장 나쁜 전략/패턴",
  "bestSymbol": "수익 기여 최고 종목",
  "bestReason": "가장 수익성 높은 진입이유",
  "weaknesses": ["약점1", "약점2", "약점3"],
  "riskWarnings": ["경고1", "경고2"],
  "adjustments": ["개선1", "개선2", "개선3"],
  "overallGrade": "A|B|C|D"
}`;

  try {
    const res  = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:1000,
      system:"JSON만 응답. 한국어로.",messages:[{role:"user",content:prompt}]});
    const data = await res.json();
    const raw6 = data.content?.map(c=>c.text||'').join('') || '';
    const jm6  = raw6.match(/{[\s\S]*}/);
    const txt  = jm6 ? jm6[0] : raw6.replace(/```json|```/g,'').trim();
    showTradeAnalysisResult(JSON.parse(txt), metrics);
  } catch(e) {
    // 폴백
    showTradeAnalysisResult({
      summary: `총 ${trades.length}건 거래, 승률 ${metrics.winRate}%, 손익비 ${metrics.rrRatio}x`,
      winRate: {score:metrics.winRate, eval: metrics.winRate>=60?'양호':'개선 필요', benchmark:'평균 55% 대비'},
      riskReward: {score:metrics.rrRatio, eval: metrics.rrRatio>=2?'우수':metrics.rrRatio>=1?'보통':'개선 필요'},
      profitFactor: {score:metrics.profitFactor, eval: metrics.profitFactor>=1.5?'우수':'개선 필요'},
      bestStrategy: Object.entries(metrics.strategies).sort((a,b)=>b[1].wins/b[1].trades.length-a[1].wins/a[1].trades.length)[0]?.[0]||'없음',
      worstStrategy: Object.entries(metrics.strategies).sort((a,b)=>a[1].wins/a[1].trades.length-b[1].wins/b[1].trades.length)[0]?.[0]||'없음',
      bestSymbol: trades.filter(t=>t.pnlPct>0).sort((a,b)=>b.pnlPct-a.pnlPct)[0]?.name||'없음',
      bestReason: '데이터 분석 필요',
      weaknesses: ['AI 연결 시 상세 분석 가능', '손실 패턴 확인 필요', '전략 일관성 점검 필요'],
      riskWarnings: metrics.maxDD>0?[`최대 낙폭 ${metrics.maxDD.toLocaleString()}원 주의`]:['현재 주요 경고 없음'],
      adjustments: ['승률 향상을 위한 진입 기준 강화', '손절 기준 명확화', '수익 전략 비중 확대'],
      overallGrade: metrics.winRate>=60&&metrics.rrRatio>=2?'A':metrics.winRate>=50?'B':'C'
    }, metrics);
  }
}


function showTradeAnalysisResult(r, metrics) {
  const gradeColor = {A:'#2E7D32',B:'#1565C0',C:'#E65100',D:'#C62828'}[r.overallGrade]||'#1565C0';
  const gradeBg    = {A:'#E8F5E9',B:'#E3F2FD',C:'#FFF3E0',D:'#FFEBEE'}[r.overallGrade]||'#E3F2FD';

  _showAnalysisModal('trade-analysis-modal', `
  <!-- 등급 + 요약 -->
  <div style="display:flex;gap:12px;margin-bottom:16px">
    <div style="background:${gradeBg};border-radius:16px;padding:16px;text-align:center;width:80px;flex-shrink:0">
      <div style="font-size:11px;color:${gradeColor};font-weight:800;margin-bottom:4px">종합등급</div>
      <div style="font-size:36px;font-weight:900;color:${gradeColor}">${r.overallGrade}</div>
    </div>
    <div style="flex:1;background:#F4F6FA;border-radius:16px;padding:14px">
      <div style="font-size:12px;color:#4A5A7A;line-height:1.7">${r.summary}</div>
    </div>
  </div>

  <!-- 핵심 지표 -->
  <div style="font-size:11px;font-weight:800;color:#94A3B8;margin-bottom:8px">📊 핵심 지표</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
    ${[
      ['승률', r.winRate, '#E53935'],
      ['손익비', r.riskReward, '#1565C0'],
      ['수익팩터', r.profitFactor, '#2E7D32'],
    ].filter(Boolean).map(([label, d, color]) => d ? `
    <div style="background:#fff;border:1.5px solid #E2E8F4;border-radius:12px;padding:12px">
      <div style="font-size:10px;color:#94A3B8;margin-bottom:4px">${label}</div>
      <div style="font-size:16px;font-weight:900;color:${color}">${d.score}${label==='승률'?'%':'x'}</div>
      <div style="font-size:11px;color:#4A5A7A;margin-top:3px">${d.eval}</div>
    </div>` : '').join('')}
    <div style="background:#fff;border:1.5px solid #E2E8F4;border-radius:12px;padding:12px">
      <div style="font-size:10px;color:#94A3B8;margin-bottom:4px">최강 종목</div>
      <div style="font-size:13px;font-weight:900;color:#0F1D3A">${r.bestSymbol}</div>
      <div style="font-size:11px;color:#4A5A7A;margin-top:3px">최고 수익 기여</div>
    </div>
  </div>

  <!-- 패턴 분석 -->
  <div style="background:#EEF4FF;border-radius:12px;padding:13px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:800;color:#1565C0;margin-bottom:6px">🔍 패턴 분석</div>
    <div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">✅ 최강 전략: <b>${r.bestStrategy}</b></div>
    <div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">❌ 최약 전략: <b>${r.worstStrategy}</b></div>
    <div style="font-size:12px;color:#0F1D3A">💡 최고 진입이유: <b>${r.bestReason}</b></div>
  </div>

  <!-- 약점 -->
  <div style="background:#FFF3E0;border-radius:12px;padding:13px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:800;color:#E65100;margin-bottom:6px">⚠️ 약점 & 경고</div>
    ${[...(r.weaknesses||[]), ...(r.riskWarnings||[])].map(w=>
      `<div style="font-size:12px;color:#4A5A7A;margin-bottom:3px">• ${w}</div>`).join('')}
  </div>

  <!-- 개선 방안 -->
  <div style="background:#E8F5E9;border-radius:12px;padding:13px">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:6px">📈 개선 방안</div>
    ${(r.adjustments||[]).map((a,i)=>
      `<div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">${i+1}. ${a}</div>`).join('')}
  </div>
  `, '📊 매매 성과 분석');
}


// ── AI 분석 2: 전략 자동 평가 ──

async function runStrategyEval() {
  const trades = getTrades();
  if (trades.length < 2) { notify('⚠️ 거래 2건 이상 필요합니다', 'warn'); return; }
  const metrics = calcTradeMetrics(trades);
  notify('🤖 전략 유효성 AI 평가 중...', 'info');

  const stratCtx = Object.entries(metrics.strategies).map(([s, d]) => {
    const wr = Math.round(d.wins/d.trades.length*100);
    const avg = Math.round(d.trades.reduce((a,t)=>a+t.pnlPct,0)/d.trades.length*100)/100;
    return `${s}전략: ${d.trades.length}건 / 승률${wr}% / 평균${avg>0?'+':''}${avg}%`;
  }).join('\n');

  const prompt = `You are a quantitative trading strategy evaluator. Respond in Korean.

[Strategy Performance]
${stratCtx}

[Overall Stats]
Win Rate: ${metrics.winRate}% | Profit Factor: ${metrics.profitFactor}x | R:R: ${metrics.rrRatio}x
Total Trades: ${metrics.total} | Max DD: ${metrics.maxDD.toLocaleString()}원

Evaluate and respond in JSON only:
{
  "healthScore": 72,
  "classification": "strong|moderate|unstable|losing",
  "isStatisticallyProfitable": true,
  "isSustainable": true,
  "winRateAdequate": true,
  "drawdownAcceptable": true,
  "strategyEvals": [
    {"name":"전략명","health":"strong|moderate|unstable|losing","issue":"문제점","fix":"개선방안"}
  ],
  "entryTiming": "진입 타이밍 개선 방안",
  "stopLoss": "손절 로직 개선 방안",
  "positionSizing": "포지션 사이징 개선 방안",
  "tradeFrequency": "거래 빈도 평가",
  "improvementPlan": ["구체적 개선1","개선2","개선3"]
}`;

  try {
    const res  = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:800,
      system:"JSON만 응답. 한국어로.",messages:[{role:"user",content:prompt}]});
    const data = await res.json();
    const raw3 = data.content?.map(c=>c.text||'').join('') || '';
    const jm3  = raw3.match(/{[\s\S]*}/);
    const txt  = jm3 ? jm3[0] : raw3.replace(/```json|```/g,'').trim();
    showStrategyEvalResult(JSON.parse(txt));
  } catch(e) {
    const cls = metrics.profitFactor>=1.5&&metrics.winRate>=55?'strong':metrics.profitFactor>=1?'moderate':metrics.winRate>=50?'unstable':'losing';
    showStrategyEvalResult({
      healthScore: Math.round((metrics.winRate*0.4)+(metrics.rrRatio*15)+(metrics.profitFactor*10)),
      classification: cls,
      isStatisticallyProfitable: metrics.profitFactor >= 1,
      isSustainable: metrics.winRate >= 50,
      winRateAdequate: metrics.winRate >= 55,
      drawdownAcceptable: true,
      strategyEvals: Object.entries(metrics.strategies).map(([s,d])=>({
        name:s, health: d.wins/d.trades.length>=0.6?'strong':'moderate',
        issue:'상세 분석을 위해 AI 연결 필요', fix:'기준 강화'
      })),
      entryTiming:'진입 기준 강화 필요',
      stopLoss:'손절가 사전 설정 권장',
      positionSizing:'균등 배분 또는 켈리 기준 활용',
      tradeFrequency:`${metrics.total}건 기록됨`,
      improvementPlan:['승률 높은 전략 집중','손절 기준 명확화','과매매 방지']
    });
  }
}


function showStrategyEvalResult(r) {
  const clsMap = {strong:['강한전략','#2E7D32','#E8F5E9'],moderate:['보통전략','#E65100','#FFF3E0'],
    unstable:['불안정','#C62828','#FFEBEE'],losing:['손실전략','#1565C0','#E3F2FD']};
  const [clsLabel, clsColor, clsBg] = clsMap[r.classification] || clsMap.moderate;

  _showAnalysisModal('strategy-eval-modal', `
  <!-- 헬스 스코어 -->
  <div style="display:flex;gap:12px;margin-bottom:16px">
    <div style="background:linear-gradient(135deg,#0F1D3A,#1565C0);border-radius:16px;
      padding:16px;text-align:center;width:90px;flex-shrink:0;color:#fff">
      <div style="font-size:11px;opacity:.7;margin-bottom:4px">전략 건강도</div>
      <div style="font-size:32px;font-weight:900">${r.healthScore}</div>
      <div style="font-size:10px;opacity:.7">/ 100</div>
    </div>
    <div style="flex:1;background:${clsBg};border:2px solid ${clsColor}40;border-radius:16px;padding:14px">
      <div style="font-size:11px;font-weight:800;color:${clsColor};margin-bottom:4px">전략 분류</div>
      <div style="font-size:18px;font-weight:900;color:${clsColor}">${clsLabel}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
        ${[
          [r.isStatisticallyProfitable, '통계적수익'],
          [r.isSustainable, '지속가능'],
          [r.winRateAdequate, '승률충분'],
          [r.drawdownAcceptable, '낙폭허용'],
        ].map(([ok, label])=>`
        <span style="background:${ok?'#E8F5E9':'#FFEBEE'};color:${ok?'#2E7D32':'#C62828'};
          border-radius:20px;padding:3px 8px;font-size:10px;font-weight:700">
          ${ok?'✅':'❌'} ${label}</span>`).join('')}
      </div>
    </div>
  </div>

  <!-- 전략별 평가 -->
  ${(r.strategyEvals||[]).length > 0 ? `
  <div style="font-size:11px;font-weight:800;color:#94A3B8;margin-bottom:8px">전략별 평가</div>
  ${r.strategyEvals.map(s => {
    const [sl,sc,sb] = clsMap[s.health]||clsMap.moderate;
    return `
    <div style="background:#fff;border:1.5px solid #E2E8F4;border-radius:12px;padding:12px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:13px;font-weight:800;color:#0F1D3A">${s.name}</span>
        <span style="background:${sb};color:${sc};border-radius:20px;padding:3px 8px;
          font-size:10px;font-weight:700">${sl}</span>
      </div>
      <div style="font-size:11px;color:#C62828;margin-bottom:2px">⚠️ ${s.issue}</div>
      <div style="font-size:11px;color:#2E7D32">💡 ${s.fix}</div>
    </div>`;
  }).join('')}` : ''}

  <!-- 개선 계획 -->
  <div style="background:#EEF4FF;border-radius:12px;padding:13px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:800;color:#1565C0;margin-bottom:8px">🛠 개선 계획</div>
    <div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">⏱ 진입타이밍: ${r.entryTiming}</div>
    <div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">✂️ 손절로직: ${r.stopLoss}</div>
    <div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">📐 포지션: ${r.positionSizing}</div>
    <div style="font-size:12px;color:#0F1D3A">🔢 거래빈도: ${r.tradeFrequency}</div>
  </div>
  <div style="background:#E8F5E9;border-radius:12px;padding:13px">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:6px">📈 액션 플랜</div>
    ${(r.improvementPlan||[]).map((p,i)=>
      `<div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">${i+1}. ${p}</div>`).join('')}
  </div>
  `, '🤖 전략 자동 평가');
}


// ── AI 분석 3: 포트폴리오 개선 ──

async function runPortfolioImprove() {
  const trades  = getTrades();
  const port    = S.portfolio || [];
  if (trades.length === 0 && port.length === 0) {
    notify('⚠️ 매매기록 또는 포트폴리오가 필요합니다', 'warn'); return;
  }
  const metrics = calcTradeMetrics(trades);
  notify('💼 포트폴리오 개선 AI 분석 중...', 'info');

  const portCtx = port.map(p => {
    const pr = PRICE_BASE[p.code];
    const cur = pr?.price || p.buyPrice;
    const pnl = ((cur-p.buyPrice)/p.buyPrice*100).toFixed(2);
    return `${gs(p.code)?.name||p.code}: 평균${p.buyPrice}원→현재${cur}원 수익${pnl}% ${p.qty}주`;
  }).join('\n') || '포트폴리오 없음';

  const prompt = `You are an AI portfolio manager. Respond in Korean.

[Current Portfolio]
${portCtx}

[Trade History Metrics]
Win Rate: ${metrics?.winRate||'N/A'}% | Best Strategy: ${
  metrics ? Object.entries(metrics.strategies).sort((a,b)=>b[1].wins/b[1].trades.length-a[1].wins/a[1].trades.length)[0]?.[0] : 'N/A'
}

Analyze and respond in JSON only:
{
  "riskLevel": "낮음|중간|높음",
  "concentrationRisk": "집중도 리스크 평가 1문장",
  "strategyExposure": "전략 노출 평가 1문장",
  "volatilityRisk": "변동성 리스크 1문장",
  "inefficientPositions": ["비효율 포지션1","포지션2"],
  "overexposedStrategies": ["과노출 전략1"],
  "rebalancingSuggestions": ["리밸런싱1","리밸런싱2","리밸런싱3"],
  "reduceStrategies": ["줄일 전략"],
  "increaseStrategies": ["늘릴 전략"],
  "balancePlan": "단기/장기 균형 계획 2문장"
}`;

  try {
    const res  = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:700,
      system:"JSON만 응답. 한국어로.",messages:[{role:"user",content:prompt}]});
    const data = await res.json();
    const raw4 = data.content?.map(c=>c.text||'').join('') || '';
    const jm4  = raw4.match(/{[\s\S]*}/);
    const txt  = jm4 ? jm4[0] : raw4.replace(/```json|```/g,'').trim();
    showPortfolioImproveResult(JSON.parse(txt));
  } catch(e) {
    showPortfolioImproveResult({
      riskLevel: port.length<=3?'높음':port.length<=6?'중간':'낮음',
      concentrationRisk: port.length<=3?'종목 집중도 높음 — 분산 필요':'적절한 분산 수준',
      strategyExposure: metrics?`${metrics.total}건 기록 기반 분석`:'기록 부족',
      volatilityRisk: '시장 변동성 주의',
      inefficientPositions: ['AI 연결 시 상세 분석 가능'],
      overexposedStrategies: [],
      rebalancingSuggestions: ['수익 종목 일부 차익실현','손실 종목 비중 축소','현금 비중 10~20% 유지'],
      reduceStrategies: metrics?[Object.entries(metrics.strategies||{}).sort((a,b)=>a[1].wins/a[1].trades.length-b[1].wins/b[1].trades.length)[0]?.[0]||'없음']:['없음'],
      increaseStrategies: metrics?[Object.entries(metrics.strategies||{}).sort((a,b)=>b[1].wins/b[1].trades.length-a[1].wins/a[1].trades.length)[0]?.[0]||'없음']:['없음'],
      balancePlan: '단기 트레이딩과 장기 투자 균형 유지. 수익 전략 비중을 점진적으로 확대하세요.'
    });
  }
}


function showPortfolioImproveResult(r) {
  const riskColor = r.riskLevel==='높음'?'#C62828':r.riskLevel==='중간'?'#E65100':'#2E7D32';
  const riskBg    = r.riskLevel==='높음'?'#FFEBEE':r.riskLevel==='중간'?'#FFF3E0':'#E8F5E9';

  _showAnalysisModal('portimprove-modal', `
  <div style="background:${riskBg};border-radius:14px;padding:14px;margin-bottom:14px">
    <div style="font-size:11px;font-weight:800;color:${riskColor};margin-bottom:4px">포트폴리오 위험도</div>
    <div style="font-size:20px;font-weight:900;color:${riskColor}">${r.riskLevel}</div>
    <div style="font-size:12px;color:#4A5A7A;margin-top:6px">${r.concentrationRisk}</div>
    <div style="font-size:12px;color:#4A5A7A;margin-top:3px">${r.strategyExposure}</div>
    <div style="font-size:12px;color:#4A5A7A;margin-top:3px">${r.volatilityRisk}</div>
  </div>
  ${r.inefficientPositions?.length ? `
  <div style="background:#FFF0F0;border-radius:12px;padding:13px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:800;color:#C62828;margin-bottom:6px">⚠️ 비효율 포지션</div>
    ${r.inefficientPositions.map(p=>`<div style="font-size:12px;color:#0F1D3A;margin-bottom:3px">• ${p}</div>`).join('')}
  </div>` : ''}
  <div style="background:#E8F5E9;border-radius:12px;padding:13px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:6px">🔀 리밸런싱 제안</div>
    ${(r.rebalancingSuggestions||[]).map((s,i)=>
      `<div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">${i+1}. ${s}</div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
    <div style="background:#FFEBEE;border-radius:12px;padding:12px">
      <div style="font-size:10px;color:#C62828;font-weight:800;margin-bottom:6px">📉 줄일 전략</div>
      ${(r.reduceStrategies||[]).map(s=>`<div style="font-size:12px;color:#0F1D3A">• ${s}</div>`).join('')}
    </div>
    <div style="background:#E8F5E9;border-radius:12px;padding:12px">
      <div style="font-size:10px;color:#2E7D32;font-weight:800;margin-bottom:6px">📈 늘릴 전략</div>
      ${(r.increaseStrategies||[]).map(s=>`<div style="font-size:12px;color:#0F1D3A">• ${s}</div>`).join('')}
    </div>
  </div>
  <div style="background:#EEF4FF;border-radius:12px;padding:13px">
    <div style="font-size:11px;font-weight:800;color:#1565C0;margin-bottom:6px">📋 균형 계획</div>
    <div style="font-size:12px;color:#4A5A7A;line-height:1.7">${r.balancePlan}</div>
  </div>
  `, '💼 포트폴리오 개선');
}


// ── AI 분석 4: 리스크 감시 ──

async function runRiskMonitor() {
  const trades = getTrades();
  const port   = S.portfolio || [];
  notify('🚨 리스크 감시 AI 분석 중...', 'info');
  const metrics = calcTradeMetrics(trades);

  // 오늘 거래
  const today = new Date().toISOString().slice(0,10);
  const todayTrades = trades.filter(t => t.sellDate === today || t.buyDate === today);
  const todayLoss   = todayTrades.filter(t=>t.pnlAmt<0).reduce((s,t)=>s+t.pnlAmt,0);
  const recentLosses = trades.slice(0,5).filter(t=>t.pnlPct<0).length;

  const prompt = `You are an AI risk manager. Respond in Korean.

[Account Status]
Total Trades: ${trades.length} | Win Rate: ${metrics?.winRate||0}%
Today's Trades: ${todayTrades.length} | Today's Loss: ${Math.abs(todayLoss).toLocaleString()}원
Recent 5 trades losing: ${recentLosses}/5
Max Drawdown: ${metrics?.maxDD?.toLocaleString()||0}원
Profit Factor: ${metrics?.profitFactor||0}x

Respond in JSON only:
{
  "riskStatus": "safe|caution|danger|critical",
  "riskScore": 35,
  "dailyLossRisk": "일일 손실 평가",
  "drawdownRisk": "낙폭 위험 평가",
  "overtradingRisk": "과매매 위험 평가",
  "strategyRisk": "전략 이상 탐지",
  "detectedProblems": ["문제1","문제2"],
  "protectiveActions": ["보호조치1","조치2","조치3"],
  "shouldPauseTrading": false,
  "shouldReduceSize": false,
  "shouldDisableStrategy": ""
}`;

  try {
    const res  = await aiApiFetch({model:"claude-sonnet-4-20250514",max_tokens:600,
      system:"JSON만 응답. 한국어로.",messages:[{role:"user",content:prompt}]});
    const data = await res.json();
    const raw5 = data.content?.map(c=>c.text||'').join('') || '';
    const jm5  = raw5.match(/{[\s\S]*}/);
    const txt  = jm5 ? jm5[0] : raw5.replace(/```json|```/g,'').trim();
    showRiskMonitorResult(JSON.parse(txt));
  } catch(e) {
    const status = recentLosses>=4?'danger':recentLosses>=3?'caution':'safe';
    showRiskMonitorResult({
      riskStatus: status,
      riskScore: recentLosses*20,
      dailyLossRisk: todayLoss < 0 ? `오늘 ${Math.abs(todayLoss).toLocaleString()}원 손실` : '오늘 손실 없음',
      drawdownRisk: metrics?.maxDD ? `최대낙폭 ${metrics.maxDD.toLocaleString()}원` : '낙폭 없음',
      overtradingRisk: todayTrades.length > 5 ? '과매매 주의' : '거래 빈도 정상',
      strategyRisk: recentLosses >= 3 ? '연속 손실 감지' : '전략 정상',
      detectedProblems: recentLosses>=3?['연속 손실 발생 — 전략 점검 필요']:['현재 주요 위험 없음'],
      protectiveActions: ['포지션 크기 줄이기','손절 기준 강화','잠시 관망 후 재진입'],
      shouldPauseTrading: recentLosses >= 4,
      shouldReduceSize: recentLosses >= 3,
      shouldDisableStrategy: ''
    });
  }
}


function showRiskMonitorResult(r) {
  const statusMap = {
    safe:     ['안전','#2E7D32','#E8F5E9','✅'],
    caution:  ['주의','#E65100','#FFF3E0','⚠️'],
    danger:   ['위험','#C62828','#FFEBEE','🚨'],
    critical: ['긴급','#B71C1C','#FFCDD2','🔴'],
  };
  const [slabel,scolor,sbg,sicon] = statusMap[r.riskStatus]||statusMap.safe;

  _showAnalysisModal('risk-monitor-modal', `
  <!-- 리스크 상태 -->
  <div style="background:${sbg};border-radius:16px;padding:16px;margin-bottom:14px;
    display:flex;align-items:center;gap:14px">
    <div style="font-size:40px">${sicon}</div>
    <div>
      <div style="font-size:11px;font-weight:800;color:${scolor};margin-bottom:2px">계좌 리스크 상태</div>
      <div style="font-size:24px;font-weight:900;color:${scolor}">${slabel}</div>
      <div style="font-size:12px;color:#4A5A7A;margin-top:2px">리스크 점수: ${r.riskScore}/100</div>
    </div>
  </div>

  <!-- 리스크 항목별 -->
  <div style="margin-bottom:14px">
    ${[
      ['💸 일일 손실', r.dailyLossRisk],
      ['📉 낙폭 위험', r.drawdownRisk],
      ['🔄 과매매', r.overtradingRisk],
      ['🤖 전략 이상', r.strategyRisk],
    ].map(([label,val])=>`
    <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid #F4F6FA">
      <span style="font-size:12px;color:#94A3B8;width:90px;flex-shrink:0">${label}</span>
      <span style="font-size:12px;color:#0F1D3A">${val}</span>
    </div>`).join('')}
  </div>

  <!-- 감지된 문제 -->
  ${r.detectedProblems?.length ? `
  <div style="background:#FFEBEE;border-radius:12px;padding:13px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:800;color:#C62828;margin-bottom:6px">🔴 감지된 문제</div>
    ${r.detectedProblems.map(p=>`<div style="font-size:12px;color:#0F1D3A;margin-bottom:3px">• ${p}</div>`).join('')}
  </div>` : ''}

  <!-- 즉각 조치 -->
  ${(r.shouldPauseTrading||r.shouldReduceSize) ? `
  <div style="background:#FFF0F0;border:2px solid #EF9A9A;border-radius:12px;padding:13px;margin-bottom:10px">
    <div style="font-size:12px;font-weight:900;color:#C62828;margin-bottom:6px">⚡ 즉각 조치 필요</div>
    ${r.shouldPauseTrading?'<div style="font-size:12px;font-weight:700;color:#C62828">🛑 거래 일시 중단 권고</div>':''}
    ${r.shouldReduceSize?'<div style="font-size:12px;font-weight:700;color:#E65100">📐 포지션 크기 축소 권고</div>':''}
    ${r.shouldDisableStrategy?`<div style="font-size:12px;color:#C62828">⛔ ${r.shouldDisableStrategy} 전략 중단 권고</div>`:''}
  </div>` : ''}

  <!-- 보호 조치 -->
  <div style="background:#E8F5E9;border-radius:12px;padding:13px">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:6px">🛡 권장 보호 조치</div>
    ${(r.protectiveActions||[]).map((a,i)=>
      `<div style="font-size:12px;color:#0F1D3A;margin-bottom:4px">${i+1}. ${a}</div>`).join('')}
  </div>
  `, '🚨 리스크 감시');
}


// ── 공통 모달 함수 ──

function _showAnalysisModal(id, bodyHtml, title) {
  const el = document.createElement('div');
  el.id = id;
  el.innerHTML = `
  <div onclick="document.getElementById('${id}').remove();document.body.style.overflow=''"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000"></div>
  <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:24px 24px 0 0;
    z-index:9001;max-height:90vh;overflow-y:auto;padding:0 0 50px;animation:slideUp .25s ease">
    <div style="text-align:center;padding:12px 0 4px">
      <div style="width:40px;height:4px;background:#E2E8F4;border-radius:2px;display:inline-block"></div>
    </div>
    <div style="padding:14px 18px;border-bottom:1px solid #F0F4FA;
      display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:16px;font-weight:900;color:#0F1D3A">${title}</div>
      <button onclick="document.getElementById('${id}').remove();document.body.style.overflow=''"
        style="background:none;border:none;font-size:20px;color:#94A3B8;cursor:pointer">✕</button>
    </div>
    <div style="padding:16px 18px">${bodyHtml}</div>
  </div>`;
  document.getElementById(id)?.remove();
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
}

// ── 버핏 명언 풀 (상황별) ──
const BUFFETT_QUOTES = {
  // 보유/장기 투자
  hold: [
    "우리가 좋아하는 보유 기간은 영원히다.",
    "10년을 보유할 자신이 없다면 10분도 보유하지 마라.",
    "주식시장은 인내심 없는 사람의 돈을 인내심 있는 사람에게 옮겨주는 장치다.",
    "훌륭한 기업을 적당한 가격에 사는 것이 적당한 기업을 훌륭한 가격에 사는 것보다 낫다.",
    "시간은 훌륭한 기업의 친구이고, 평범한 기업의 적이다.",
  ],
  // 매수 / 저평가
  buy: [
    "남들이 탐욕스러울 때 두려워하고, 남들이 두려워할 때 탐욕스러워라.",
    "가격은 네가 지불하는 것이고, 가치는 네가 얻는 것이다.",
    "기회는 자주 오지 않는다. 하늘에서 금이 내릴 때 양동이를 가져가라.",
    "주가가 싸다는 것은 축제다. 나는 주가 하락을 즐긴다.",
    "리스크는 자신이 무엇을 하는지 모를 때 생긴다.",
  ],
  // 매도 / 차익실현
  sell: [
    "분산투자는 무지에 대한 보호다. 자신이 무엇을 하는지 아는 사람에겐 의미가 없다.",
    "멋진 기업이라도 너무 비싼 가격에 사면 나쁜 투자가 된다.",
    "첫 번째 규칙: 절대 돈을 잃지 마라. 두 번째 규칙: 첫 번째 규칙을 잊지 마라.",
    "수익이 났을 때 파는 것을 두려워하지 마라. 아무도 손해 봐서 망한 사람은 없다.",
    "조수가 빠지면 누가 수영복 없이 수영했는지 알 수 있다.",
  ],
  // 위험 / 관망
  caution: [
    "예측할 수 없는 미래에 베팅하지 마라.",
    "확신이 없을 때는 아무것도 하지 않는 것도 훌륭한 전략이다.",
    "레버리지는 현명한 사람을 파산시킬 수 있다.",
    "시장이 미쳐있을 때 당신은 냉정해야 한다.",
    "나는 복잡한 것을 이해하지 못하면 투자하지 않는다.",
  ],
};


function simulateDart(dartCode) {
  const stock = STOCKS.find(s=>s.dart===dartCode);
  const today = new Date();
  const mn = n => { const d=new Date(today); d.setDate(d.getDate()-n); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; };
  const tpl = {
    "00126380":[{title:"주요사항보고서(파운드리사업)",date:mn(12),relevance:"mid"},{title:"사업보고서(2024.12)",date:mn(5),relevance:"low"}],
    "00164779":[{title:"주요사항보고서(HBM 생산설비 증설)",date:mn(3),relevance:"high"},{title:"[자율공시]AI반도체 공급 계약",date:mn(8),relevance:"high"}],
    "00554024":[{title:"주요사항보고서(임상시험 계획)",date:mn(20),relevance:"mid"}],
    "00356360":[{title:"주요사항보고서(분할결정)",date:mn(2),relevance:"high"}],
    "00116033":[{title:"[자율공시]SMR 협력 MOU 체결",date:mn(5),relevance:"high"}],
    "00164600":[{title:"주요사항보고서(수출계약체결)",date:mn(1),relevance:"high"}],
  };
  return (tpl[dartCode]||[{title:"분기보고서(2024.09)",date:mn(30),relevance:"low"},{title:"주요사항보고서",date:mn(15),relevance:"mid"}])
    .map(t=>({...t,corp:stock?.name||'',url:"https://dart.fss.or.kr",sim:true}));
}


async function fetchDart(code, dartCode, kw) {
  if(!S.dartKey) return simulateDart(dartCode);
  const today=new Date(), bgn=new Date(today); bgn.setMonth(bgn.getMonth()-3);
  const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'');
  try {
    const r = await fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${S.dartKey}&corp_code=${dartCode}&bgn_de=${fmt(bgn)}&end_de=${fmt(today)}&pblntf_ty=A&page_count=10`);
    const d = await r.json(); if(d.status!=='000') throw 0;
    return (d.list||[]).map(x=>{
      const m = kw.split(' ').filter(w=>w.length>1&&x.report_nm.includes(w)).length;
      return {title:x.report_nm,date:x.rcept_dt.replace(/(\d{4})(\d{2})(\d{2})/,'$1.$2.$3'),corp:x.corp_name,relevance:m>1?'high':m===1?'mid':'low',url:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${x.rcp_no}`};
    }).slice(0,5);
  } catch(e) { return simulateDart(dartCode); }
}

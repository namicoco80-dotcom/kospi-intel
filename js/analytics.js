/* ==================================================
   KOSPI INTEL - analytics.js
================================================== */


function vdStyle(v) {
  if(v==="confirmed")  return {bg:"rgba(34,197,94,0.12)",bc:"rgba(34,197,94,0.35)",col:"#22c55e",lbl:"✅ 사실확인"};
  if(v==="partial")    return {bg:"rgba(232,146,30,0.12)", bc:"rgba(232,146,30,0.35)", col:"#E8921E",lbl:"⚠️ 부분사실"};
  if(v==="unverified") return {bg:"rgba(90,158,224,0.12)",bc:"rgba(90,158,224,0.35)",col:"#5A9EE0",lbl:"🔍 미확인"};
  if(v==="false")      return {bg:"rgba(239,68,68,0.12)", bc:"rgba(239,68,68,0.35)", col:"#ef4444",lbl:"❌ 허위"};
  return {bg:"var(--bg3)",bc:"var(--bdr)",col:"var(--ink3)",lbl:"미분석"};
}


function sc(s) {
  if(s==null) return "var(--ink3)";
  if(s>=80)   return "#22c55e";
  if(s>=60)   return "#E8921E";
  return "#ef4444";
}


function impactColor(s) {
  if(s>=80) return "var(--rose)";
  if(s>=50) return "var(--amber)";
  return "var(--teal)";
}


function impactLabel(s) {
  if(s>=80) return "핵심이슈";
  if(s>=50) return "산업영향";
  return "일반";
}


function updateSentimentHistory() {
  const today = new Date().toISOString().slice(0,10);
  const processed = safeLS('mem_processed_dates', []);

  NEWS.forEach(n => {
    if (!n.code || !n.sent) return;
    const hist = MEM.getSentHistory(n.code);
    // 오늘 같은 뉴스 중복 방지
    const alreadyHas = hist.some(h => h.id === n.id);
    if (alreadyHas) return;
    hist.push({
      id: n.id,
      date: today,
      sent: n.sent || '중립',      // '긍정'/'부정'/'중립'
      title: (n.title||'').slice(0, 40),
      impact: n.impactScore || n.impact || 50,
      impactScore: n.impactScore || n.impact || 50,
      type: n.type
    });
    MEM.setSentHistory(n.code, hist);
  });
}

// ── 2. 테마별 트렌드 점수 누적 ──

function updateThemeTrends() {
  const today = new Date().toISOString().slice(0,10);
  const summary = {};

  THEMES.forEach(th => {
    const relNews = NEWS.filter(n => (n.themes||[]).includes(th.name));
    if (!relNews.length) return;

    // 오늘 점수 계산
    const posCount = relNews.filter(n => n.sent === '긍정').length;
    const negCount = relNews.filter(n => n.sent === '부정').length;
    const avgImpact = relNews.reduce((s,n) => s+(n.impactScore||50), 0) / relNews.length;
    const todayScore = Math.round(
      (posCount * 2 - negCount * 2 + avgImpact * 0.3 + relNews.length * 0.5)
    );

    const hist = MEM.getThemeTrend(th.name);
    const lastEntry = hist[hist.length-1];

    // 오늘 데이터 없으면 추가
    if (!lastEntry || lastEntry.date !== today) {
      const delta = lastEntry ? todayScore - lastEntry.score : 0;
      hist.push({ date: today, score: todayScore, delta, newsCount: relNews.length });
      MEM.setThemeTrend(th.name, hist);
    }

    // 트렌드 방향 (최근 3일 기준)
    const recent = hist.slice(-3);
    const avgDelta = recent.length > 1
      ? recent.slice(1).reduce((s,h) => s+h.delta, 0) / (recent.length-1)
      : 0;

    summary[th.name] = {
      score: todayScore,
      trend: avgDelta > 2 ? '↑상승' : avgDelta < -2 ? '↓하락' : '→횡보',
      trendColor: avgDelta > 2 ? '#E53935' : avgDelta < -2 ? '#1565C0' : '#78909C',
      history: hist.slice(-7), // 최근 7일
      newsCount: relNews.length
    };
  });

  MEM.setThemeSummary(summary);
  return summary;
}

// ── 3. 주가 방향성 패턴 저장 ──

function updatePricePatterns() {
  const today = new Date().toISOString().slice(0,10);

  Object.keys(PRICE_BASE).forEach(code => {
    const pr = PRICE_BASE[code];
    if (!pr || pr.price === null) return;
    const pat = MEM.getPricePattern(code);

    // 어제 데이터와 비교
    const last = pat.history[pat.history.length-1];
    if (last && last.date === today) return; // 오늘 이미 저장됨

    const direction = !last ? 'flat'
      : pr.price > last.price ? 'up'
      : pr.price < last.price ? 'down' : 'flat';

    // 연속 방향 카운트
    if (direction === 'up') { pat.bullDays = (pat.bullDays||0)+1; pat.bearDays = 0; }
    else if (direction === 'down') { pat.bearDays = (pat.bearDays||0)+1; pat.bullDays = 0; }
    else { pat.bullDays = 0; pat.bearDays = 0; }

    pat.trend = pat.bullDays >= 3 ? 'up' : pat.bearDays >= 3 ? 'down' : 'flat';
    pat.streak = Math.max(pat.bullDays||0, pat.bearDays||0);
    pat.history = [...(pat.history||[]), { date: today, price: pr.price, dir: direction }].slice(-30);

    MEM.setPricePattern(code, pat);
  });
}

// ── 4. 종목 메모리 컨텍스트 생성 (AI 프롬프트용) ──

function getMemoryContext(code) {
  const sentHist = MEM.getSentHistory(code).slice(-10);
  const pricePat = MEM.getPricePattern(code);
  const stock = gs(code);
  const themeSummary = MEM.getThemeSummary();

  // 감성 추세
  const recentSent = sentHist.slice(-5);
  const posRatio = recentSent.length
    ? Math.round(recentSent.filter(h=>h.sent==='긍정').length / recentSent.length * 100)
    : 50;
  const sentTrend = posRatio >= 70 ? '긍정 우세' : posRatio <= 30 ? '부정 우세' : '혼조';

  // 테마 흐름
  const myThemes = (stock?.themes || []);
  const themeCtx = myThemes.map(t => {
    const ts = themeSummary[t];
    return ts ? `${t}섹터 ${ts.trend}(${ts.score}점)` : '';
  }).filter(Boolean).join(', ');

  // 주가 패턴
  const priceCtx = pricePat.streak >= 2
    ? `최근 ${pricePat.streak}일 연속 ${pricePat.trend==='up'?'상승':'하락'}세`
    : '방향성 불분명';

  return {
    sentTrend,
    posRatio,
    priceCtx,
    themeCtx,
    historyCount: sentHist.length,
    summary: `[과거 패턴] 뉴스감성 최근5건: 긍정${posRatio}% (${sentTrend}) | 주가: ${priceCtx}${themeCtx ? ` | 섹터흐름: ${themeCtx}` : ''}`
  };
}

// ── 5. 종목별 감성 추세 미니 차트 HTML ──

function sentimentMiniChart(code) {
  const hist = MEM.getSentHistory(code).slice(-10);
  if (hist.length < 2) return '';

  const bars = hist.map(h => {
    const s = h.sent || '';
    const isPos = s==='긍정' || s==='pos' || s==='positive';
    const isNeg = s==='부정' || s==='neg' || s==='negative';
    const color = isPos ? '#E53935' : isNeg ? '#1565C0' : '#94A3B8';
    const imp   = h.impactScore || h.impact || 50;
    const height = Math.max(6, Math.round(imp / 100 * 28));
    return `<div style="width:9px;height:${height}px;background:${color};border-radius:3px 3px 0 0;flex-shrink:0" title="${h.date||''} ${s}"></div>`;
  }).join('');

  // 디버그: 히스토리 첫 항목 sent 값 확인
  if (hist.length > 0 && window._debug) console.log('[Sent] 히스토리 샘플:', hist[0]);

  const posCount = hist.filter(h=>h.sent==='긍정'||h.sent==='pos'||h.sent==='positive').length;
  const negCount = hist.filter(h=>h.sent==='부정'||h.sent==='neg'||h.sent==='negative').length;
  const trend = posCount > hist.length*0.6 ? '📈 긍정우세' : negCount > hist.length*0.6 ? '📉 부정우세' : '↔ 혼조';

  return `<div style="margin-bottom:8px;padding:8px 10px;background:#F4F6FA;border-radius:10px;border:1px solid #E2E8F4">
    <div style="font-size:10px;color:#4A5A7A;font-weight:700;margin-bottom:5px">📊 뉴스 감성 히스토리 ${trend}</div>
    <div style="display:flex;align-items:flex-end;gap:2px;height:28px">${bars}</div>
    <div style="font-size:9px;color:#94A3B8;margin-top:3px">최근 ${hist.length}건 · 빨강=긍정 파랑=부정</div>
  </div>`;
}

// ── 6. 전체 학습 실행 (뉴스 로드 후 자동) ──

function dirIcon(dir) {
  return dir === 'pos' ? '▲' : dir === 'neg' ? '▼' : '●';
}

function dirC(dir) {
  return dir === 'pos' ? 'var(--rose)' : dir === 'neg' ? 'var(--blue)' : 'var(--ink3)';
}


function calcImpactScores() {
  NEWS.forEach(n => {
    if (n.impactScore) return;
    const base = {official:80, news:65, analyst:60, rumor:50}[n.type] || 55;
    const sentBonus = n.sent==='긍정' ? 8 : n.sent==='부정' ? 5 : 0;
    n.impactScore = Math.min(base + sentBonus, 99);
  });
}


function runMarketLearning() {
  calcImpactScores();
  updateSentimentHistory();
  updateThemeTrends();
  updatePricePatterns();
  console.log('[MarketMemory] 학습 완료:', new Date().toLocaleTimeString());
}


/* ══ 영어 제목 자동 번역 ══ */

function ring(score, size=60) {
  const r=size/2-6, circ=2*Math.PI*r, dash=score!=null?(score/100)*circ:0, col=sc(score);
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="6"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="6" stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
    </svg>
    <div class="ring-v" style="color:${col};font-size:${score!=null?13:10}px">${score!=null?score:"?"}</div>
  </div>`;
}

/* ══════════════════════════════════════════════
   ⑥ AI 요약 생성
══════════════════════════════════════════════ */




/* ╔══════════════════════════════════════════════════════╗
   ║   📚 시대 흐름 학습 엔진 (Market Memory System)      ║
   ║   - 주가 방향성 패턴 저장                            ║
   ║   - 테마별 트렌드 점수 누적                          ║
   ║   - 종목별 뉴스 감성 히스토리                        ║
   ║   - AI 분석 시 과거 패턴 자동 반영                   ║
   ╚══════════════════════════════════════════════════════╝ */

// ── 메모리 스토어 (localStorage 기반) ──
const MEM = {
  // 종목별 뉴스 감성 히스토리 { code: [{date, sent, title, impactScore}] }
  getSentHistory: (code) => safeLS(`mem_sent_${code}`, []),
  setSentHistory: (code, arr) => safeSetLS(`mem_sent_${code}`, arr.slice(-60)), // 최근 60건

  // 테마별 트렌드 점수 { theme: [{date, score, delta}] }
  getThemeTrend: (theme) => safeLS(`mem_theme_${theme}`, []),
  setThemeTrend: (theme, arr) => safeSetLS(`mem_theme_${theme}`, arr.slice(-30)), // 최근 30일

  // 주가 방향성 패턴 { code: {trend: 'up'|'down'|'flat', streak: N, lastDate, history:[]} }
  getPricePattern: (code) => safeLS(`mem_price_${code}`, {trend:'flat', streak:0, bullDays:0, bearDays:0, history:[]}),
  setPricePattern: (code, obj) => safeSetLS(`mem_price_${code}`, obj),

  // 전체 테마 트렌드 요약 캐시
  getThemeSummary: () => safeLS('mem_theme_summary', {}),
  setThemeSummary: (obj) => safeSetLS('mem_theme_summary', obj),
};

// ── 1. 뉴스 로드 시 감성 히스토리 업데이트 ──

function dartHTML(dr) {
  if(!dr) return '';
  if(!dr.length) return `<div style="font-size:13px;color:var(--ink3);text-align:center;padding:14px">관련 공시 없음</div>`;
  const sim = dr[0]?.sim ? `<span style="font-family:var(--mono);font-size:10px;background:var(--bg3);padding:2px 8px;border-radius:6px;color:var(--ink3)">시뮬</span>` : '';
  return `<div class="dart-res">
    <div class="dart-restit"><span>📋 DART 공시 교차검증</span>${sim}</div>
    ${dr.map(d=>`<div class="ditem">
      <div class="ditmain">${d.title}</div>
      <div class="ditmeta">
        <span class="ditdate">${d.date}</span>
        <span class="drel ${d.relevance}">${d.relevance==='high'?'🔴 높은 관련':d.relevance==='mid'?'🟡 관련 가능성':'⚪ 낮은 관련'}</span>
        <a href="${d.url}" target="_blank" class="dlink">원문↗</a>
      </div>
    </div>`).join('')}
  </div>`;
}

/* ══ RING ══ */

function sparkline(history, color) {
  if(!history?.length) return '';
  const max = Math.max(...history, 1);
  return `<div class="spark">
    <span class="spark-lbl">확산</span>
    <div class="spark-bars">${history.map(v=>`<div class="spark-bar" style="height:${Math.round((v/max)*22)||3}px;background:${color};opacity:${0.3+0.7*(v/max)}"></div>`).join('')}</div>
    <span class="spark-pk" style="color:${color}">+${history[history.length-1]}</span>
  </div>`;
}


function priceHTML(code) {
  const p = PRICE_BASE[code];
  if(!p) return '';

  /* 가격 미입력 상태 */
  if(p.price === null || p.price === undefined) {
    return `<div class="price-row" data-price-code="${code}">
      <span class="price-source-tag" style="background:rgba(138,125,104,0.2);color:var(--ink3);border:1px solid var(--bdr)">—</span>
      <div style="flex:1">
        <div style="font-size:13px;color:var(--ink3);padding:4px 0">가격 업데이트 필요</div>
        <div style="font-size:11px;color:var(--ink3)">헤더의 💰 버튼으로 현재가 입력</div>
      </div>
    </div>`;
  }

  const isUp = p.chg > 0, isFlat = p.chg === 0 || p.chg === null;
  const cls    = isFlat ? 'flat' : isUp ? 'up' : 'dn';
  const isRealData = ['live','json'].includes(p.dataSource);
  const srcCls = isRealData ? 'live' : 'sim';
  const srcLbl = p.dataSource === 'live' ? 'LIVE' : p.dataSource === 'json' ? 'JSON' : p.dataSource === 'manual' ? '수동' : p.dataSource === 'cached' ? '저장' : 'SIM';
  return `<div class="price-row" data-price-code="${code}">
    <span class="price-source-tag ${srcCls}">${srcLbl}</span>
    <div style="flex:1">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
        <span class="price-val">${p.price.toLocaleString('ko-KR')}원</span>
        <span class="price-chg ${cls}">${p.chg!=null?(p.chg>=0?'+':'')+p.chg+'%':'—'}</span>
      </div>
      <div class="price-detail">
        <span>고 ${p.high||'—'}</span>
        <span>저 ${p.low||'—'}</span>
        <span>시 ${p.open||'—'}</span>
      </div>
    </div>
    <div class="price-meta">
      <span>거래량 ${p.vol||'—'}</span>
    </div>
  </div>`;
}

/* ══ 수급 HTML ══ */

function supplyHTML(code) {
  const s = SUPPLY_BASE[code];
  if(!s) {
    // supply.json 미로드 상태
    if (!_supplyLoaded) {
      return `<div class="supply-box">
        <div class="supply-title"><span>💰 오늘 수급 현황</span></div>
        <div style="text-align:center;padding:12px;font-size:12px;color:var(--ink3)">
          ⏳ 수급 데이터 로딩 중...<br>
          <span style="font-size:11px">GitHub Actions 장마감 후 자동 수집</span>
        </div>
      </div>`;
    }
    return '';
  }
  const fmt = v => { const a=Math.abs(v); return (v>=0?'+':'-')+(a>=10000?(a/10000).toFixed(1)+'조':(a/100).toFixed(0)+'억')+'원'; };
  const maxV = Math.max(Math.abs(s.foreign),Math.abs(s.inst),Math.abs(s.retail),1);
  const bw = v => Math.round(Math.abs(v)/maxV*100);
  const rows = [{who:"외국인",v:s.foreign,c:"#5A9EE0"},{who:"기관",v:s.inst,c:"#D4AF5A"},{who:"개인",v:s.retail,c:"#8A7D68"}];
  return `<div class="supply-box">
    <div class="supply-title"><span>💰 오늘 수급 현황</span><span style="font-size:10px;color:var(--ink3)">단위: 억원</span></div>
    <div class="supply-rows">
      ${rows.map(r=>`<div class="supply-row">
        <span class="supply-who" style="color:${r.c}">${r.who}</span>
        <div class="supply-bar-wrap"><div class="supply-bar" style="width:${bw(r.v)}%;background:${r.v>=0?r.c:r.c+'88'}">${fmt(r.v)}</div></div>
        <span class="supply-amt" style="color:${r.v>=0?'var(--rose)':'var(--teal)'}">${fmt(r.v)}</span>
      </div>`).join('')}
    </div>
    <div class="supply-5d-title">최근 5일 순매수 방향</div>
    ${[{who:"외국인",data:s.f5,c:"#5A9EE0"},{who:"기관",data:s.i5,c:"#D4AF5A"}].map(r=>`
    <div class="supply-5d-row">
      <span style="font-size:11px;color:var(--ink3);width:40px;flex-shrink:0">${r.who}</span>
      ${r.data.map(v=>`<div class="supply-5d-dot" style="background:${v==='+'?'rgba(239,68,68,.6)':'rgba(34,197,94,.6)'}">${v}</div>`).join('')}
    </div>`).join('')}
  </div>`;
}

/* ══ 주가 반응 분석 HTML ══ */

function priceReactionHTML(pr) {
  if(!pr) return '';
  const isPos = pr.priceChg.startsWith('+');
  return `<div class="pi-reaction-box">
    <div class="pi-reaction-title">📈 뉴스 이후 주가 반응</div>
    <div class="pi-reaction-row"><span class="pi-reaction-label">가격 변화</span><span class="pi-reaction-val" style="color:${isPos?'var(--teal)':'var(--rose)'}">${pr.priceChg}</span></div>
    <div class="pi-reaction-row"><span class="pi-reaction-label">거래량 변화</span><span class="pi-reaction-val" style="color:var(--amber)">${pr.volChg}</span></div>
    <div class="pi-reaction-row"><span class="pi-reaction-label">기관/외국인</span><span class="pi-reaction-val" style="color:var(--blue)">${pr.instFlow}</span></div>
    <div style="margin-top:7px;font-size:12px;color:var(--ink3);line-height:1.6">${pr.desc}</div>
  </div>`;
}

/* ══ AI 점수 근거 HTML ══ */

function scoreBreakdownHTML(sb, total) {
  if(!sb || total==null) return '';
  const items=[
    {k:'news',  label:'뉴스 모멘텀', color:'#5A9EE0', max:30},
    {k:'supply',label:'수급 분석',   color:'#D4AF5A', max:30},
    {k:'theme', label:'AI 테마',     color:'#9B7FE8', max:25},
    {k:'tech',  label:'기술적 분석', color:'#6DB87A', max:25},
  ];
  return `<div class="score-breakdown">
    <div class="sb-title"><span>🧮 AI 점수 근거</span><span class="sb-total" style="color:${sc(total)}">${total}점</span></div>
    <div class="sb-rows">${items.map(item=>{const v=sb[item.k]||0;return`
      <div class="sb-row">
        <span class="sb-label">${item.label}</span>
        <div class="sb-bar-w"><div class="sb-bar" style="width:${Math.round(v/item.max*100)}%;background:${item.color}">${v}pt</div></div>
        <span class="sb-val" style="color:${item.color}">${v}</span>
      </div>`;}).join('')}
    </div>
  </div>`;
}

/* ══ 주가 영향 분석 HTML ══ */

function priceImpactHTML(item) {
  const main = gs(item.code);
  const relList = item.relStocks||[];
  if(!main) return '';
  const dirIcon = d => d==='pos'?'▲ 긍정':d==='neg'?'▼ 부정':'● 중립';
  const dirC = d => d==='pos'?'var(--teal)':d==='neg'?'var(--rose)':'var(--ink3)';
  const mainDir = item.sent==='긍정'?'pos':item.sent==='부정'?'neg':'neu';
  return `<div class="price-impact-box">
    <div class="pi-title">── 주가 영향 분석 ──</div>
    <div class="pi-stock-row ${mainDir}">
      <span class="pi-stock-name">${main.name} <span style="font-size:11px;color:var(--ink3)">(본 종목)</span></span>
      <span class="pi-dir" style="color:${dirC(mainDir)}">${dirIcon(mainDir)}</span>
      <span class="pi-strength" style="color:${impactColor(item.impactScore||50)}">강함</span>
    </div>
    ${relList.map(r=>{const s=gs(r.code);return s?`<div class="pi-stock-row ${r.dir}">
      <span class="pi-stock-name" style="color:var(--ink2)">${s.name}</span>
      <span class="pi-dir" style="color:${dirC(r.dir)}">${dirIcon(r.dir)}</span>
      <span class="pi-strength">${r.strength||'보통'}</span>
    </div>`:''}).join('')}
    ${priceReactionHTML(item.priceReaction)}
  </div>`;
}

/* ══ DART ══ */

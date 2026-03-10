/* ==================================================
   KOSPI INTEL - config.js
================================================== */

'use strict';

/* ══════════════════════════════════════════════
   ① 뉴스 신뢰도 등급 시스템
══════════════════════════════════════════════ */
// A: 공시·공식발표·주요언론(sources≥5)  B: 검증뉴스·애널  C: 찌라시·루머

function getGrade(item) {
  if(item.type === 'official') return 'A';
  if(item.type === 'news' && item.sources >= 5) return 'A';
  if(item.type === 'news' || item.type === 'analyst') return 'B';
  if(item.sources >= 4) return 'B';
  return 'C';
}
const GRADE_META = {
  A:{sublabel:'확정뉴스',color:'var(--grade-a)'},
  B:{sublabel:'검증뉴스',color:'var(--grade-b)'},
  C:{sublabel:'루머',color:'var(--grade-c)'},
};

/* ══════════════════════════════════════════════
   ② DATA — 종목 마스터 + 테마 분류
══════════════════════════════════════════════ */
const STOCKS = [
  {code:"005930",name:"삼성전자",sector:"반도체",dart:"00126380",themes:["반도체","AI"],cap:"408조"},
  {code:"000660",name:"SK하이닉스",sector:"반도체",dart:"00164779",themes:["반도체","AI","HBM"],cap:"144조"},
  {code:"035420",name:"NAVER",sector:"IT",dart:"00266961",themes:["AI","IT플랫폼"],cap:"28조"},
  {code:"005380",name:"현대차",sector:"자동차",dart:"00164742",themes:["자동차","EV"],cap:"52조"},
  {code:"068270",name:"셀트리온",sector:"바이오",dart:"00554024",themes:["바이오","바이오시밀러"],cap:"21조"},
  {code:"051910",name:"LG화학",sector:"2차전지",dart:"00356360",themes:["2차전지","소재"],cap:"20조"},
  {code:"006400",name:"삼성SDI",sector:"2차전지",dart:"00126362",themes:["2차전지","배터리"],cap:"25조"},
  {code:"105560",name:"KB금융",sector:"금융",dart:"00679390",themes:["금융","은행"],cap:"30조"},
  {code:"034020",name:"두산에너빌리티",sector:"에너지",dart:"00116033",themes:["원전","SMR"],cap:"9조"},
  {code:"000270",name:"기아",sector:"자동차",dart:"00164876",themes:["자동차","EV"],cap:"43조"},
  {code:"035720",name:"카카오",sector:"IT",dart:"00918444",themes:["AI","IT플랫폼"],cap:"18조"},
  {code:"207940",name:"삼성바이오로직스",sector:"바이오",dart:"00877059",themes:["바이오","CMO"],cap:"52조"},
  {code:"329180",name:"현대중공업",sector:"방산",dart:"00164800",themes:["방산","조선"],cap:"13조"},
  {code:"012450",name:"한화에어로스페이스",sector:"방산",dart:"00164600",themes:["방산","우주"],cap:"17조"},
  {code:"247540",name:"에코프로비엠",sector:"2차전지",dart:"00985765",themes:["2차전지","양극재"],cap:"9조"},
  {code:"042700",name:"한미반도체",sector:"반도체",dart:"00617598",themes:["반도체","AI"],cap:"7조"},
  // ── 시총 상위 추가 종목 ──
  {code:"373220",name:"LG에너지솔루션",sector:"2차전지",dart:"01426928",themes:["2차전지","배터리"],cap:"82조"},
  {code:"005490",name:"POSCO홀딩스",sector:"소재",dart:"00126186",themes:["철강","2차전지"],cap:"23조"},
  {code:"055550",name:"신한지주",sector:"금융",dart:"00382199",themes:["금융","은행"],cap:"27조"},
  {code:"086790",name:"하나금융지주",sector:"금융",dart:"00547583",themes:["금융","은행"],cap:"17조"},
  {code:"316140",name:"우리금융지주",sector:"금융",dart:"01182169",themes:["금융","은행"],cap:"11조"},
  {code:"138040",name:"메리츠금융지주",sector:"금융",dart:"00144022",themes:["금융","보험"],cap:"16조"},
  {code:"000810",name:"삼성화재",sector:"금융",dart:"00126355",themes:["금융","보험"],cap:"18조"},
  {code:"012330",name:"현대모비스",sector:"자동차",dart:"00164711",themes:["자동차","EV"],cap:"18조"},
  {code:"047810",name:"한국항공우주",sector:"방산",dart:"00556074",themes:["방산","우주"],cap:"5조"},
  {code:"064350",name:"현대로템",sector:"방산",dart:"00164722",themes:["방산","철도"],cap:"5조"},
  {code:"010140",name:"삼성중공업",sector:"조선",dart:"00126371",themes:["조선","방산"],cap:"7조"},
  {code:"042660",name:"한화오션",sector:"조선",dart:"00164620",themes:["조선","방산"],cap:"7조"},
  {code:"267250",name:"HD현대",sector:"조선",dart:"00164799",themes:["조선","방산"],cap:"6조"},
  {code:"009830",name:"한화솔루션",sector:"소재",dart:"00164600",themes:["태양광","소재"],cap:"5조"},
  {code:"086520",name:"에코프로",sector:"2차전지",dart:"00592388",themes:["2차전지","양극재"],cap:"7조"},
  {code:"096770",name:"SK이노베이션",sector:"에너지",dart:"00631518",themes:["2차전지","에너지"],cap:"13조"},
  {code:"017670",name:"SK텔레콤",sector:"통신",dart:"00631500",themes:["통신","AI"],cap:"12조"},
  {code:"030200",name:"KT",sector:"통신",dart:"00210783",themes:["통신","AI"],cap:"8조"},
  {code:"128940",name:"한미약품",sector:"바이오",dart:"00379503",themes:["바이오","신약"],cap:"5조"},
  {code:"000100",name:"유한양행",sector:"바이오",dart:"00116012",themes:["바이오","신약"],cap:"5조"},
  {code:"326030",name:"SK바이오팜",sector:"바이오",dart:"01261664",themes:["바이오","신약"],cap:"4조"},
  {code:"097950",name:"CJ제일제당",sector:"유통",dart:"00105139",themes:["식품","소비"],cap:"4조"},
  {code:"271560",name:"오리온",sector:"유통",dart:"01045934",themes:["식품","소비"],cap:"4조"},
  {code:"004170",name:"신세계",sector:"유통",dart:"00116671",themes:["유통","소비"],cap:"3조"},
  {code:"139480",name:"이마트",sector:"유통",dart:"00788956",themes:["유통","소비"],cap:"3조"},
  {code:"032640",name:"LG유플러스",sector:"통신",dart:"00356370",themes:["통신"],cap:"5조"},
  {code:"004020",name:"현대제철",sector:"소재",dart:"00164733",themes:["철강"],cap:"4조"},
  {code:"010950",name:"S-Oil",sector:"에너지",dart:"00104400",themes:["에너지","정유"],cap:"7조"},
  {code:"036570",name:"엔씨소프트",sector:"IT",dart:"00261454",themes:["게임","AI"],cap:"4조"},
  {code:"251270",name:"넷마블",sector:"IT",dart:"00826465",themes:["게임"],cap:"3조"},
];

const THEMES = [
  {name:"AI",icon:"🤖",color:"#9B7FE8"},
  {name:"반도체",icon:"💾",color:"#5A9EE0"},
  {name:"2차전지",icon:"🔋",color:"#6DB87A"},
  {name:"방산",icon:"🛡",color:"#E8921E"},
  {name:"바이오",icon:"💊",color:"#ef4444"},
  {name:"원전",icon:"⚛",color:"#22c55e"},
  {name:"자동차",icon:"🚗",color:"#D4AF5A"},
  {name:"IT플랫폼",icon:"📱",color:"#5A9EE0"},
];

const SECTORS = ["전체","반도체","IT","바이오","2차전지","자동차","금융","에너지","방산","조선","통신","유통","소재"];
const SRC = {
  official:{label:"공시",color:"#22c55e",icon:"📋"},
  news:    {label:"뉴스",color:"#5A9EE0",icon:"📰"},
  rumor:   {label:"찌라시",color:"#ef4444",icon:"🔥"},
  analyst: {label:"리포트",color:"#D4AF5A",icon:"📊"},
};
const SOURCES = [
  {id:"tg_반도체",name:"반도체 텔레그램",type:"텔레그램",total:42,confirmed:28,recent:[1,1,0,1,1,0,0,1,1,0,1,1,1,0,1],rumorsToday:3},
  {id:"dc_주식",name:"DC 주식갤",type:"커뮤니티",total:87,confirmed:31,recent:[0,1,0,0,1,0,1,0,0,1,0,0,1,0,0],rumorsToday:7},
  {id:"yt_주식왕",name:"주식왕 유튜브",type:"유튜브",total:23,confirmed:16,recent:[1,1,1,0,1,1,1,0,1,1,0,1,1,1,0],rumorsToday:1},
  {id:"tg_바이오",name:"바이오 인사이더",type:"텔레그램",total:34,confirmed:19,recent:[1,0,1,1,0,0,1,1,0,1,0,0,1,0,1],rumorsToday:2},
  {id:"blog_증권",name:"증권분석 블로그",type:"블로그",total:18,confirmed:14,recent:[1,1,1,1,0,1,1,0,1,1,1,1,0,1,1],rumorsToday:0},
  {id:"tg_IT",name:"IT섹터 채널",type:"텔레그램",total:29,confirmed:12,recent:[0,0,1,0,0,1,0,0,0,1,0,1,0,0,0],rumorsToday:4},
];

/* ══ 뉴스 데이터 — news.json 에서 동적 로드 ══
   news.json 이 없거나 로드 실패 시 빈 배열로 시작.
   GitHub Actions 가 매일 장마감 후 자동 수집.            */
let NEWS = [];   // fetchAllData() 에서 채워짐
let _newsLoaded = false;

/* ══════════════════════════════════════════════
   ③ 주가 데이터 — Yahoo Finance 프록시 + 시뮬 폴백
══════════════════════════════════════════════ */
/* ══ 주가 데이터 ══
   price:null = 미입력 상태 → "가격 업데이트 필요" 표시
   수동 입력 또는 API 성공 시 price에 실제값이 들어감
*/
const PRICE_BASE = {
  "005930":{price:null,chg:null,vol:"—",cap:"408조",high:"—",low:"—",open:"—",dataSource:"manual"},
  "000660":{price:null,chg:null,vol:"—",cap:"144조",high:"—",low:"—",open:"—",dataSource:"manual"},
  "035420":{price:null,chg:null,vol:"—",cap:"28조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "005380":{price:null,chg:null,vol:"—",cap:"52조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "068270":{price:null,chg:null,vol:"—",cap:"21조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "051910":{price:null,chg:null,vol:"—",cap:"20조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "006400":{price:null,chg:null,vol:"—",cap:"25조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "105560":{price:null,chg:null,vol:"—",cap:"30조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "034020":{price:null,chg:null,vol:"—",cap:"9조",  high:"—",low:"—",open:"—",dataSource:"manual"},
  "000270":{price:null,chg:null,vol:"—",cap:"43조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "035720":{price:null,chg:null,vol:"—",cap:"18조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "207940":{price:null,chg:null,vol:"—",cap:"52조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "329180":{price:null,chg:null,vol:"—",cap:"13조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "012450":{price:null,chg:null,vol:"—",cap:"17조", high:"—",low:"—",open:"—",dataSource:"manual"},
  "247540":{price:null,chg:null,vol:"—",cap:"9조",  high:"—",low:"—",open:"—",dataSource:"manual"},
  "042700":{price:null,chg:null,vol:"—",cap:"7조",  high:"—",low:"—",open:"—",dataSource:"manual"},
};

/* ── 앱 시작 시 localStorage 가격 즉시 적용 (가격 엔진 2순위) ──
   실제 복원은 fetchAllPrices() 내 applyLsPrices() 에서 수행 */

/* ╔══════════════════════════════════════════════════════════════════╗
   ║              가격 데이터 엔진 v2  (file:// 환경 대응)             ║
   ║                                                                  ║
   ║  우선순위                                                         ║
   ║  1순위 → 외부 JSON fetch  (prices.json 또는 CORS 프록시)         ║
   ║  2순위 → localStorage 마지막 저장 가격                            ║
   ║  3순위 → 사용자 수동 입력                                          ║
   ║                                                                  ║
   ║  file:// 에서도 localStorage는 정상 작동                          ║
   ╚══════════════════════════════════════════════════════════════════╝ */

/* ──────────────────────────────────────────
   🔧 설정
────────────────────────────────────────── */
/* ════════════════════════════════════════════════
   🔐 AI API 엔드포인트 설정
   ─────────────────────────────────────────────
   보안을 위해 Anthropic API를 직접 호출하지 않고
   Cloudflare Workers 프록시를 경유합니다.

   [배포 전 설정 방법]
   1. https://workers.cloudflare.com 에서 Worker 생성
   2. 아래 worker.js 코드를 붙여넣기:

      export default {
        async fetch(request, env) {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json"
            },
            body: request.body
          });
          return new Response(res.body, {
            headers: { ...res.headers, "Access-Control-Allow-Origin": "*" }
          });
        }
      };

   3. Worker 설정 → 환경변수 → ANTHROPIC_API_KEY 입력
   4. Worker URL을 아래 AI_API_URL에 붙여넣기
   ════════════════════════════════════════════════ */
const AI_API_URL = (() => {
  // 로컬/개발 환경: 비워두면 AI 기능 비활성화
  // 배포 환경: Cloudflare Workers URL 입력
  // 예시: "https://kospi-ai-proxy.https://misty-glade-ddcf.namicoco80.workers.dev"
  const stored = (() => { try { return localStorage.getItem('cf_worker_url') || ''; } catch(e) { return ''; } })();
  return stored || 'https://misty-glade-ddcf.namicoco80.workers.dev';
})();


function safeLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch(e) { console.warn('[KOSPI] localStorage 오류:', key, e); return fallback; }
}

function safeLSStr(key, fallback) {
  try { return localStorage.getItem(key) || fallback; }
  catch(e) { return fallback; }
}

function safeSetLS(key, val) {
  try { localStorage.setItem(key, typeof val==='string'?val:JSON.stringify(val)); }
  catch(e) { console.warn('[KOSPI] localStorage write 오류:', key, e); }
}

let S = {
  tab:"my", sector:"전체", tf:"전체", q:"", sk:null, exp:null,
  themeFilter:null, gradeFilter:"all",
  ana:{}, dartF:{}, judging:{}, aiSumF:{},
  crawling:false, notif:null, nt:null,
  dartKey: safeLSStr('dartKey',''),
  showDart: !safeLSStr('dartKey',''), dartInp:'',
  autoRefresh: true,
  autoTimer: null, priceTimer: null, refreshToast: false,
  alertSettings: safeLS('alertSettings',{surgeAlert:true,newIssueAlert:true,keywordAlert:true,watchlistAlert:true}),
  keywords: safeLS('alertKeywords',["삼성전자","반도체","HBM"]),
  watchlist: safeLS('watchlist',["005930","000660","034020"]),
  portfolio: safeLS('portfolio',[]),
  portInp:{code:"",buyPrice:"",qty:""},
  portAnalysis: safeLS('portAnalysis',{}),  // ✅ 누적 저장
  portAnaF:{},
  newKw:"",newWl:"",
  showPriceModal: false,
  manualPriceInputs: {},
  _priceUpdatedAt: null,
};

/* ══ AI 분석 결과 저장/복원 헬퍼 ══ */
// 뉴스 분석 결과 캐시 (id → {score, verdict, detail, judgment, aiSummary, aiKeywords, dartResult})
let _analysisCache = safeLS('analysisCache', {});


function getWorkerUrl() {
  try { return localStorage.getItem('cf_worker_url') || AI_API_URL; } catch(e) { return AI_API_URL; }
}


function getGeminiKey() {
  try { return localStorage.getItem('gemini_api_key') || ''; } catch(e) { return ''; }
}

function saveGeminiKey(key) {
  try { localStorage.setItem('gemini_api_key', key.trim()); } catch(e) {}
}

// 하루 3번 제한

function getPortAIUsage() {
  try {
    const d = JSON.parse(localStorage.getItem('portai_usage') || '{}');
    const today = new Date().toDateString();
    if (d.date !== today) return { date: today, count: 0 };
    return d;
  } catch(e) { return { date: new Date().toDateString(), count: 0 }; }
}

function incPortAIUsage() {
  const d = getPortAIUsage();
  d.count++;
  try { localStorage.setItem('portai_usage', JSON.stringify(d)); } catch(e) {}
}

function getPortAIRemain() {
  return Math.max(0, 3 - getPortAIUsage().count);
}


function saveCfWorkerUrl() {
  const inp = document.getElementById('cf-worker-inp');
  const url = (inp?.value || '').trim();
  try {
    if (url) {
      localStorage.setItem('cf_worker_url', url);
      notify('✅ CF Worker URL 저장 완료', 'ok');
    } else {
      localStorage.removeItem('cf_worker_url');
      notify('🗑 CF Worker URL 삭제됨 — AI 기능 비활성화', 'info');
    }
    const el = document.getElementById('cf-status');
    if (el) el.textContent = url ? '✅ URL 설정됨: ' + url.slice(0, 40) + '...' : '⚠️ 미설정';
  } catch(e) { notify('❌ 저장 실패', 'warn'); }
}


async function testCfWorker() {
  const url = (() => { try { return localStorage.getItem('cf_worker_url') || ''; } catch(e) { return ''; } })();
  if (!url) { notify('⚠️ CF Worker URL을 먼저 입력해주세요', 'warn'); return; }
  notify('🧪 연결 테스트 중...', 'info');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'ping' }] }),
    });
    if (res.ok) {
      notify('✅ CF Worker 연결 성공! AI 기능 활성화됨', 'ok');
    } else {
      const err = await res.text();
      notify(`❌ 연결 실패 (${res.status}): ${err.slice(0, 40)}`, 'warn');
    }
  } catch(e) {
    notify(`❌ 연결 오류: ${e.message.slice(0, 50)}`, 'warn');
  }
}

/* 포트폴리오 */

function saveDart(){
  const v=(S.dartInp||document.getElementById('dki')?.value||'').trim();
  if(!v||v.length<10){notify('⚠️ 유효한 API 키를 입력해주세요','warn');return;}
  S.dartKey=v;S.showDart=false;safeSetLS('dartKey',v);notify('✅ DART API 키 저장 완료','ok');render();
}

function resetDart(){S.dartKey='';S.showDart=true;S.dartInp='';try{localStorage.removeItem('dartKey')}catch(e){};render()}


function getBuffettQuote(situation) {
  // situation: 'hold' | 'buy' | 'sell' | 'caution' | null(랜덤)
  const pool = situation && BUFFETT_QUOTES[situation]
    ? BUFFETT_QUOTES[situation]
    : Object.values(BUFFETT_QUOTES).flat();
  return pool[Math.floor(Math.random() * pool.length)];
}

// ══════════════════════════════════════════════
// 📖 인앱 도움말 매뉴얼
// ══════════════════════════════════════════════
let _helpTab = 'signal';

/* ==================================================
   KOSPI INTEL - prices.js
================================================== */


function lsSavePrices() {
  try {
    const data = {};
    Object.keys(PRICE_BASE).forEach(code => {
      const p = PRICE_BASE[code];
      if (p.price !== null && p.price !== undefined) {
        data[code] = {
          price:      p.price,
          chg:        p.chg      ?? 0,
          basePrice:  p.basePrice ?? p.price,
          high:       p.high     ?? '—',
          low:        p.low      ?? '—',
          open:       p.open     ?? '—',
          vol:        p.vol      ?? '—',
          dataSource: p.dataSource ?? 'manual',
          savedAt:    Date.now(),
        };
      }
    });
    localStorage.setItem(PRICE_ENGINE.LS_KEY, JSON.stringify(data));
  } catch(e) {
    console.warn('[PriceEngine] localStorage 저장 실패:', e);
  }
}


function lsLoadPrices() {
  try {
    const raw = localStorage.getItem(PRICE_ENGINE.LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch(e) {
    console.warn('[PriceEngine] localStorage 불러오기 실패:', e);
    return {};
  }
}

/* localStorage → PRICE_BASE 에 적용 (null 인 항목만) */

function applyLsPrices(lsData) {
  let count = 0;
  Object.keys(lsData).forEach(code => {
    if (!PRICE_BASE[code]) return;
    const d = lsData[code];
    if (!d.price) return;

    // 만료 여부 체크
    const age  = Date.now() - (d.savedAt || 0);
    const src  = age > PRICE_ENGINE.EXPIRE_MS ? 'cached_old' : 'cached';

    // PRICE_BASE 가 null(미입력) 이거나 이미 cached 인 경우만 덮어씀
    // live / manual 은 더 신뢰할 수 있으므로 유지
    if (PRICE_BASE[code].price === null || PRICE_BASE[code].price === undefined ||
        PRICE_BASE[code].dataSource === 'cached' || PRICE_BASE[code].dataSource === 'cached_old') {
      Object.assign(PRICE_BASE[code], {
        price:      d.price,
        chg:        d.chg      ?? 0,
        basePrice:  d.basePrice ?? d.price,
        high:       d.high     ?? '—',
        low:        d.low      ?? '—',
        open:       d.open     ?? '—',
        vol:        d.vol      ?? '—',
        dataSource: src,
      });
      count++;
    }
  });
  return count;
}

/* ──────────────────────────────────────────
   📄 1순위: prices.json fetch
   (HTML과 같은 폴더에 prices.json 이 있으면 자동 사용)
────────────────────────────────────────── */

async function fetchJsonPrices() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    // GitHub Pages: /kospi-intel/prices.json 경로 자동 대응
    const urls = [
      PRICE_ENGINE.JSON_URL,
      './prices.json',
      window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '') + '/prices.json',
    ];
    clearTimeout(timer);
    for (const url of [...new Set(urls)]) {
      try {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 4000);
        const r = await fetch(url, { signal: ctrl2.signal, cache: 'no-store' });
        clearTimeout(t2);
        if (!r.ok) continue;
        const json = await r.json();
        const n = applyJsonData(json, 'json');
        if (n > 0) {
          console.log(`[PriceEngine] prices.json 로드 성공 (${url}): ${n}종목`);
          return n;
        }
      } catch(e2) { /* 다음 URL 시도 */ }
    }
    return 0;
  } catch(e) {
    return 0;
  }
}

/* JSON 데이터를 PRICE_BASE 에 적용
   지원 형식:
   { "005930": 55800 }                          ← 단순 가격
   { "005930": { price:55800, chg:1.2, ... } }  ← 상세 객체  */

function applyJsonData(json, source) {
  let count = 0;
  let latestUpdatedAt = null;
  Object.keys(json).forEach(code => {
    if (!PRICE_BASE[code]) return;
    const val = json[code];
    let price, chg, high, low, open, vol, basePrice, updatedAt;

    if (typeof val === 'number') {
      price     = Math.round(val);
      chg       = 0;
      basePrice = PRICE_BASE[code].basePrice ?? price;
      high = low = open = '—';
      vol = '—';
      updatedAt = null;
    } else if (typeof val === 'object' && val !== null) {
      price     = Math.round(val.price ?? val.currentPrice ?? val.close ?? 0);
      chg       = val.chg   ?? val.changeRate ?? val.change ?? 0;
      basePrice = val.basePrice ?? val.prevClose ?? val.prev ?? price;
      // prices.json high/low/open은 문자열 숫자 가능 ("56200" 형태)
      const fmtN = v => v ? Number(String(v).replace(/,/g,'')).toLocaleString('ko-KR') : '—';
      high      = fmtN(val.high);
      low       = fmtN(val.low);
      open      = fmtN(val.open);
      vol       = val.vol ?? val.volume ?? '—';
      updatedAt = val.updatedAt ?? null;
      if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) {
        latestUpdatedAt = updatedAt;
      }
    } else return;

    if (!price || price <= 0) return;

    setPriceBase(code, { price, chg, basePrice, high, low, open, vol, dataSource: source, updatedAt });
    count++;
  });
  // 마지막 업데이트 시간 헤더에 표시
  if (latestUpdatedAt) {
    try {
      const dt = new Date(latestUpdatedAt);
      const kst = new Date(dt.getTime() + 0); // updatedAt은 이미 KST ISO
      const hhmm = kst.toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      S._priceUpdatedAt = hhmm;
    } catch(e) {}
  }
  return count;
}

/* ──────────────────────────────────────────
   🌐 1순위 보조: CORS 프록시로 외부 API 시도
   (JSON 파일이 없을 때 추가 시도)
────────────────────────────────────────── */

async function fetchViaProxy(code) {
  const KOSDAQ = ['035720','247540','042700','068270'];
  const suffix  = KOSDAQ.includes(code) ? '.KQ' : '.KS';

  for (const proxyBase of PRICE_ENGINE.PROXY_URLS) {
    /* Yahoo Finance */
    try {
      const target = `https://query1.finance.yahoo.com/v8/finance/chart/${code}${suffix}?interval=1d&range=1d`;
      const url    = proxyBase.endsWith('=')
        ? proxyBase + encodeURIComponent(target)
        : proxyBase + target;

      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const r     = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) continue;

      let body;
      const text = await r.text();
      /* allorigins 는 { contents: "..." } 래퍼 사용 */
      try {
        const wrap = JSON.parse(text);
        body = wrap.contents ? JSON.parse(wrap.contents) : wrap;
      } catch(e) {
        body = JSON.parse(text);
      }

      const meta = body?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const price = Math.round(meta.regularMarketPrice ?? 0);
      if (!price) continue;

      const prev    = Math.round(meta.previousClose ?? meta.chartPreviousClose ?? 0);
      const chg     = prev ? Math.round((price - prev) / prev * 10000) / 100 : 0;
      const vol     = meta.regularMarketVolume ?? 0;
      const volStr  = vol > 1e6 ? (vol/1e6).toFixed(1)+'M' : vol > 1e3 ? (vol/1e3).toFixed(0)+'K' : String(vol);
      setPriceBase(code, {
        price, chg,
        basePrice: prev || price,
        high: Math.round(meta.regularMarketDayHigh ?? price).toLocaleString('ko-KR'),
        low:  Math.round(meta.regularMarketDayLow  ?? price).toLocaleString('ko-KR'),
        open: Math.round(meta.regularMarketOpen    ?? price).toLocaleString('ko-KR'),
        vol:  volStr,
        dataSource: 'live',
      });
      return true;
    } catch(e) { /* 다음 프록시 */ }
  }
  return false;
}

/* ──────────────────────────────────────────
   🔑 공통: PRICE_BASE 값 세팅 + 즉시 저장
────────────────────────────────────────── */

function setPriceBase(code, data) {
  if (!PRICE_BASE[code]) return;
  Object.assign(PRICE_BASE[code], data);
  // 매번 저장 대신 디바운스 (100ms 내 중복 저장 방지)
  if (setPriceBase._timer) clearTimeout(setPriceBase._timer);
  setPriceBase._timer = setTimeout(lsSavePrices, 100);
}

/* ──────────────────────────────────────────
   ✍️  3순위: 수동 입력
────────────────────────────────────────── */

function manualPriceInput(code, priceStr) {
  const price = Number(String(priceStr).replace(/[,\s]/g, ''));
  if (!price || price <= 0) {
    notify('⚠️ 올바른 가격을 입력해주세요', 'warn');
    return false;
  }
  const prev = PRICE_BASE[code]?.basePrice ?? price;
  const chg  = prev ? Math.round((price - prev) / prev * 10000) / 100 : 0;
  setPriceBase(code, {
    price, chg,
    basePrice:  prev,
    high: '—', low: '—', open: '—', vol: '—',
    dataSource: 'manual',
  });
  const name = STOCKS.find(s => s.code === code)?.name ?? code;
  notify(`✅ ${name} ${price.toLocaleString()}원 입력됨`, 'ok');
  refreshPriceDom();
  refreshPortfolioDom();
  return true;
}

/* ──────────────────────────────────────────
   🚀 메인 가격 수집 함수 (우선순위 엔진)
────────────────────────────────────────── */

async function fetchAllPrices() {
  /* ── 2순위: localStorage 먼저 적용 (즉각 반영) ── */
  const lsData  = lsLoadPrices();
  const lsCount = applyLsPrices(lsData);
  if (lsCount > 0) {
    refreshPriceDom();
    refreshPortfolioDom();
  }

  /* ── 1순위-A: prices.json fetch ── */
  const jsonCount = await fetchJsonPrices();
  if (jsonCount > 0) {
    refreshPriceDom();
    refreshPortfolioDom();
    lsSavePrices();
    return jsonCount;
  }

  /* ── 1순위-B: CORS 프록시로 종목별 API 시도 ── */
  const codes   = Object.keys(PRICE_BASE);
  let liveCount = 0;
  const CHUNK   = 3;

  for (let i = 0; i < codes.length; i += CHUNK) {
    const batch   = codes.slice(i, i + CHUNK);
    const results = await Promise.all(batch.map(fetchViaProxy));
    liveCount    += results.filter(Boolean).length;
    if (i + CHUNK < codes.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  refreshPriceDom();
  refreshPortfolioDom();
  if (liveCount > 0) lsSavePrices();

  return liveCount + lsCount;
}

/* ──────────────────────────────────────────
   🔄 DOM 갱신 (피드/워치리스트 가격 태그)
────────────────────────────────────────── */

function refreshPriceDom() {
  document.querySelectorAll('[data-price-code]').forEach(el => {
    const code = el.dataset.priceCode;
    const p    = PRICE_BASE[code];
    if (!p) return;
    if (p.price === null || p.price === undefined) return;

    const vEl = el.querySelector('.price-val');
    const cEl = el.querySelector('.price-chg');
    const sEl = el.querySelector('.price-source-tag');

    if (vEl) vEl.textContent = p.price.toLocaleString('ko-KR') + '원';

    if (cEl) {
      const chgVal = p.chg ?? 0;
      cEl.textContent = (chgVal >= 0 ? '+' : '') + chgVal + '%';
      cEl.className   = 'price-chg ' + (chgVal > 0 ? 'up' : chgVal < 0 ? 'dn' : 'flat');
    }

    if (sEl) {
      const labels = {
        live:       'LIVE',
        json:       'JSON',
        cached:     '저장',
        cached_old: '구저장',
        manual:     '수동',
      };
      const cls = ['live','json'].includes(p.dataSource) ? 'live' : 'sim';
      sEl.textContent = labels[p.dataSource] ?? 'SIM';
      sEl.className   = 'price-source-tag ' + cls;
    }
  });
}

/* ──────────────────────────────────────────
   💼 포트폴리오 DOM 갱신
────────────────────────────────────────── */

function openPriceModal() {
  S.showPriceModal = true;
  render();
}

function closePriceModal() {
  S.showPriceModal = false;
  render();
}

function savePriceModal() {
  const inputs = document.querySelectorAll('[data-manual-code]');
  let updated = 0;
  inputs.forEach(inp => {
    const code = inp.dataset.manualCode;
    const val  = inp.value.trim();
    if (val && Number(val.replace(/,/g, '')) > 0) {
      if (manualPriceInput(code, val)) updated++;
    }
  });
  if (updated > 0) {
    notify(`✅ ${updated}종목 가격 업데이트 완료`, 'ok');
    S.showPriceModal = false;
    render();
  } else {
    notify('⚠️ 입력된 가격이 없습니다', 'warn');
  }
}

async function tryAutoFetch() {
  /* 모달에 이미 입력된 값 먼저 저장 */
  document.querySelectorAll('[data-manual-code]').forEach(inp => {
    const val = inp.value.trim();
    if (val && Number(val) > 0) manualPriceInput(inp.dataset.manualCode, val);
  });
  notify('⚡ 자동 조회 시도 중...', 'info');
  const n = await fetchAllPrices();
  if (n > 0) {
    notify(`✅ ${n}종목 가격 갱신 완료`, 'ok');
    S.showPriceModal = false;
  } else {
    notify('❌ 자동 조회 실패 — 직접 입력을 사용해주세요', 'warn');
  }
  render();
}

/* ──────────────────────────────────────────
   ⏱️  시뮬 틱 (가격 없는 종목은 건드리지 않음)
────────────────────────────────────────── */

function updatePrices() {
  Object.keys(PRICE_BASE).forEach(code => {
    const p = PRICE_BASE[code];
    /* null / live / json / manual / cached 는 변경 금지 */
    if (p.price === null || p.price === undefined) return;
    if (['live','json','manual','cached','cached_old'].includes(p.dataSource)) return;
    const base = p.basePrice ?? p.price;
    const d    = (Math.random() - 0.5) * 0.5;
    const np   = Math.round(base * (1 + d / 100) / 10) * 10;
    p.price    = Math.max(Math.round(base * 0.95 / 10) * 10,
                 Math.min(Math.round(base * 1.05 / 10) * 10, np));
    p.chg      = Math.round((p.price - base) / base * 10000) / 100;
  });
}



/* ══════════════════════════════════════════════
   ④ 수급 데이터
══════════════════════════════════════════════ */
/* ══ 수급 데이터 — supply.json 에서 동적 로드 ══
   supply.json 이 없거나 로드 실패 시 빈 객체.
   supplyHTML() 에서 null 체크 후 "수급 데이터 로딩중" 표시.  */
let SUPPLY_BASE = {};   // fetchAllData() 에서 채워짐
let _supplyLoaded = false;

/* ══════════════════════════════════════════════
   ③ STATE
══════════════════════════════════════════════ */
/* ══ localStorage 안전 접근 헬퍼 ══ */

async function fetchSupplyJson() {
  const urls = ['./supply.json', window.location.pathname.replace(/\/[^\/]*$/, '') + '/supply.json'];
  for (const url of [...new Set(urls)]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!r.ok) continue;
      const json = await r.json();
      if (typeof json !== 'object' || Array.isArray(json)) continue;
      // SUPPLY_BASE 갱신
      Object.assign(SUPPLY_BASE, json);
      _supplyLoaded = true;
      console.log(`[Supply] supply.json 로드 완료: ${Object.keys(json).length}종목 (${url})`);
      return Object.keys(json).length;
    } catch(e) { /* 다음 URL 시도 */ }
  }
  return 0;
}



// ── fundamental.json 로드 (PBR/ROE/PER) ──
let FUND_DATA = {};
let SUPPLY5_DATA = {};

async function fetchFundamentalData() {
  try {
    const [fRes, s5Res] = await Promise.all([
      fetch('./fundamental.json?_=' + Date.now(), {cache:'no-store'}),
      fetch('./supply5.json?_=' + Date.now(), {cache:'no-store'}),
    ]);
    if (fRes.ok)  FUND_DATA    = await fRes.json();
    if (s5Res.ok) SUPPLY5_DATA = await s5Res.json();
    console.log('[Fund] PBR/ROE:', Object.keys(FUND_DATA).length, '종목');
    console.log('[Sup5] 5일수급:', Object.keys(SUPPLY5_DATA).length, '종목');
  } catch(e) {
    console.warn('[Fund] 로드 실패 — 폴백 모드');
  }
}
// ── quant.json 로드 (52주+MACD+RSI 실제 데이터) ──
let QUANT_DATA = {};

async function fetchQuantData() {
  try {
    const res = await fetch('./quant.json?_=' + Date.now(), {cache:'no-store'});
    if (!res.ok) return;
    QUANT_DATA = await res.json();
    console.log('[Quant] 로드 완료:', Object.keys(QUANT_DATA).length, '종목');
  } catch(e) {
    console.warn('[Quant] 로드 실패 (quant.json 없음 — 폴백 모드)');
  }
}
// ── analysis.json 자동 로드 (Gemini 서버사이드 분석) ──

async function fetchAnalysisJson() {
  try {
    const r = await fetch('./analysis.json?t=' + Date.now());
    if (!r.ok) return 0;
    const data = await r.json();
    if (!data || typeof data !== 'object') return 0;
    // portAnalysis에 자동 병합 (수동 재분석 우선)
    let merged = 0;
    for (const [code, ana] of Object.entries(data)) {
      if (code.startsWith('_')) continue;
      if (!S.portAnalysis) S.portAnalysis = {};
      // 이미 수동 분석된 건 덮어쓰지 않음
      if (!S.portAnalysis[code] || S.portAnalysis[code]._fromServer) {
        S.portAnalysis[code] = {...ana, _fromServer: true};
        merged++;
      }
    }
    if (merged > 0) {
      safeSetLS('portAnalysis', S.portAnalysis);
      console.log(`[AI] analysis.json ${merged}종목 자동 로드`);
    }
    return merged;
  } catch(e) {
    console.log('[AI] analysis.json 없음 (정상)');
    return 0;
  }
}


async function fetchETFPrices(etfCodes) {
  const results = {};
  for (const code of etfCodes) {
    try {
      const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      const q = (data.datas || data.data || [null])[0];
      if (!q) continue;
      const n = (...keys) => { for(const k of keys){const v=q[k];if(v!=null)try{return parseInt(String(v).replace(/,/g,''))}catch{}};return 0;};
      const price = n('closePrice','cp','nv','sv');
      const prev  = n('prevClosePrice','pcv','rf','pv');
      if (price) {
        const chg = prev ? Math.round((price-prev)/prev*10000)/100 : 0;
        results[code] = { price, chg, prev };
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 150));
  }
  return results;
}

// ── 자산탭 ETF 가격 갱신 ──

async function refreshETFPrices() {
  const port = safeLS('assetPortfolio', []);
  const etfCodes = port.filter(p => p.assetType === 'etf').map(p => p.id);
  if (!etfCodes.length) return;
  const prices = await fetchETFPrices(etfCodes);
  // PRICE_BASE에 병합
  Object.entries(prices).forEach(([code, data]) => {
    if (!PRICE_BASE[code]) PRICE_BASE[code] = { price: null, chg: null, vol: '—', cap: '—', high: '—', low: '—', open: '—', dataSource: 'etf' };
    PRICE_BASE[code].price = data.price;
    PRICE_BASE[code].chg   = data.chg;
    PRICE_BASE[code].dataSource = 'live';
  });
  if (Object.keys(prices).length > 0) {
    render();
    notify(`📊 ETF 현재가 갱신 (${Object.keys(prices).length}종목)`, 'ok');
  }
      }

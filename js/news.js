/* ==================================================
   KOSPI INTEL - news.js
================================================== */


async function fetchNewsJson() {
  // Worker RSS 프록시 우선, 실패시 news.json 폴백
  try {
    const workerUrl = getWorkerUrl();
    if (workerUrl) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(workerUrl + '?action=news', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (r.ok) {
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await r.json();
          const items = data.news || [];
          if (items.length > 0) {
            // Worker 뉴스를 NEWS 배열 형식으로 변환
            const converted = items.map((n, i) => ({
              id: n.id || ('w_' + i),
              title: n.title,
              link: n.link || '#',
              pubDate: n.pubDate || '',
              source: n.source || '뉴스',
              body: n.desc || '',
              code: '000000',
              urgency: 3,
              type: 'news',
              collectedAt: new Date().toISOString().slice(0,10),
            }));
            // 기존 NEWS에 없는 것만 추가
            let added = 0;
            const existIds = new Set(NEWS.map(n => n.title));
            for (const item of converted) {
              if (!existIds.has(item.title)) {
                NEWS.unshift(item);
                added++;
              }
            }
            if (NEWS.length > 200) NEWS.splice(200);
            return added;
          }
        }
      }
    }
  } catch(e) {
    console.warn('Worker 뉴스 실패, news.json 폴백:', e.message);
  }

  // 폴백: news.json
  const urls = ['./news.json', window.location.pathname.replace(/\/[^\/]*$/, '') + '/news.json'];
  for (const url of [...new Set(urls)]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json') && !ct.includes('text')) continue;
      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const existIds = new Set(NEWS.map(n => n.id));
      let added = 0;
      for (const item of arr) {
        if (!existIds.has(item.id)) { NEWS.push(item); added++; }
      }
      NEWS.sort((a,b) => (b.urgency||5)-(a.urgency||5));
      if (NEWS.length > 200) NEWS.splice(200);
      return added;
    } catch(e) { /* 다음 URL 시도 */ }
  }
  return 0;
}



async function fetchAllData() {
  /* 주가 + 수급 + 뉴스 병렬 로드 */
  const [priceN, supplyN, newsN] = await Promise.all([
    fetchAllPrices(),
    fetchSupplyJson(),
    fetchNewsJson(),
  ]);
  console.log(`[DataLoad] price:${priceN} supply:${supplyN} news:${newsN}`);
  return { priceN, supplyN, newsN };
}


function startAutoRefresh() {
  if(S.autoTimer) clearInterval(S.autoTimer);
  if(S.priceTimer) clearInterval(S.priceTimer);

  // 1분마다: 장중/장외 관계없이 실시간 조회 시도
  // 장외에도 전날 종가 기준 실시간 데이터가 유효함
  // prices.json 5분마다 fetch (GitHub Actions 업데이트 반영)
  S.priceTimer = setInterval(async() => {
    if(!S.autoRefresh) return;
    const { priceN, supplyN, newsN } = await fetchAllData();
    if(priceN === 0) { updatePrices(); refreshPriceDom(); }
    if(S.tab === 'port') refreshPortfolioDom();
    if(newsN > 0 || supplyN > 0) render();  // 수급/뉴스 갱신 시 화면 재렌더
  }, 5 * 60 * 1000);  // 5분마다

  // 5분마다 뉴스 갱신
  S.autoTimer = setInterval(() => {
    if(!S.autoRefresh) return;
    autoFetchNews();
  }, 5 * 60 * 1000);

  checkMarketEvents();

  // 시계 독립 업데이트 (render() 없이 매초)
  function tickClock() {
    const el = document.getElementById('hdr-clock');
    if(el) el.textContent = new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  tickClock();
  setInterval(tickClock, 1000);

  // 앱 로드 시 즉시 실시간 조회 시도
  /* 가격 엔진 시작:
     1) localStorage 즉시 복원 (화면에 바로 반영)
     2) 백그라운드에서 JSON/API 조회
     3) 실패 시 시뮬 틱으로 폴백                   */
  (async () => {
    notify('📡 데이터 로딩 중... (주가·수급·뉴스)', 'info');
    const { priceN, supplyN, newsN } = await fetchAllData();
    await fetchAnalysisJson();  // AI 분석 자동 로드

    const msgs = [];
    if (priceN > 0) {
      const src_label = Object.values(PRICE_BASE).find(p => p.dataSource === 'json') ? 'JSON' : 'LIVE';
      msgs.push(`주가 ${priceN}종목(${src_label})`);
    }
    if (supplyN > 0) msgs.push(`수급 ${supplyN}종목`);
    if (newsN  > 0) msgs.push(`뉴스 ${newsN}건`);

    if (msgs.length > 0) {
      notify(`✅ 로드 완료: ${msgs.join(' · ')}`, 'ok');
      if (S._priceUpdatedAt) {
        setTimeout(() => notify(`🕐 데이터 기준: ${S._priceUpdatedAt}`, 'info'), 2000);
      }
    } else {
      notify('📊 JSON 파일 미로드 — GitHub Actions 첫 실행 후 자동으로 생성됩니다', 'info');
      updatePrices();
    }

    render();  // 뉴스/수급 로드 후 화면 갱신
  })();
}

let _lastMarketStatus = getMarketStatus();

function checkMarketEvents() {
  setInterval(() => {
    const cur = getMarketStatus();
    if(cur !== _lastMarketStatus) {
      if(cur === 'open') {
        notify('🔔 장 시작! 뉴스·공시 자동 업데이트','info');
        autoFetchNews();
      } else if(cur === 'closed' && _lastMarketStatus === 'open') {
        notify('📊 장 마감. 오늘 이슈 정리됩니다','info');
        autoFetchNews();
      }
      _lastMarketStatus = cur;
      render();
    }
  }, 60000);
}


async function autoFetchNews() {
  /* news.json 을 새로 fetch 하여 갱신 (하드코딩 템플릿 제거) */
  const prevLen = NEWS.length;
  const n = await fetchNewsJson();

  if (n > 0) {
    autoTranslateEnglish();
  }
  if (n > 0 && NEWS.length > prevLen) {
    const newItems = NEWS.slice(0, NEWS.length - prevLen);
    newItems.forEach(newItem => {
      newItem._new = true;
      if(S.alertSettings.newIssueAlert) {
        notify(`🆕 신규 이슈: ${newItem.title.slice(0,20)}...`, newItem.urgency===1?'warn':'info');
      }
      if(S.alertSettings.keywordAlert) {
        const matched = S.keywords.find(kw => newItem.title.includes(kw) || newItem.body.includes(kw));
        if(matched) notify(`🔔 키워드 알림 [${matched}] 이슈 발생!`, 'warn');
      }
      checkWatchlistAlert(newItem);
    });
    S.refreshToast = true;
    if(S.tab === 'feed') reCards();
    else render();
    setTimeout(() => { S.refreshToast = false; render(); }, 3000);
  }
}


function checkWatchlistAlert(item) {
  if(!S.alertSettings.watchlistAlert) return;
  if(S.watchlist.includes(item.code)) {
    const stock = gs(item.code);
    notify(`⭐ 관심종목 [${stock?.name}] 새 이슈 발생!`, 'warn');
  }
}

/* ══════════════════════════════════════════════
   ⑤ HELPERS
══════════════════════════════════════════════ */
const gs = c => STOCKS.find(s => s.code === c);


function isEnglishTitle(title) {
  if (!title) return false;
  const eng = (title.match(/[a-zA-Z]/g) || []).length;
  return eng >= 6 && eng / title.length > 0.55;
}

async function googleTranslate(text) {
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=' + encodeURIComponent(text);
    const res = await fetch(url);
    const data = await res.json();
    return data[0]?.map(d => d[0]).join('') || text;
  } catch(e) { return text; }
}

async function autoTranslateEnglish() {
  const targets = NEWS.filter(n => isEnglishTitle(n.title) && !n._translated);
  if (!targets.length) return;
  console.log('[번역] 영어 뉴스', targets.length, '건');
  for (let i = 0; i < targets.length; i += 3) {
    const batch = targets.slice(i, i + 3);
    await Promise.all(batch.map(async n => {
      const idx = NEWS.findIndex(x => x.id === n.id);
      if (idx < 0) return;
      const translated = await googleTranslate(n.title);
      NEWS[idx]._origTitle = n.title;
      NEWS[idx].title = translated;
      NEWS[idx]._translated = true;
    }));
    await new Promise(r => setTimeout(r, 400));
  }
  reCards();
}

/* ══ 종목 자동 추가 시스템 ══ */

async function fetchStockNameNaver(code) {
  try {
    const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`;
    const res = await fetch(url, { cache:'no-store' });
    const data = await res.json();
    const q = (data.datas||data.data||[null])[0];
    if (!q) return null;
    return q.stockName || q.name || q.nm || null;
  } catch(e) { return null; }
}


function guessSector(name) {
  if (!name) return '기타';
  if (/삼성전자|SK하이닉스|반도체|한미반도체/.test(name)) return '반도체';
  if (/바이오|제약|헬스|의료|셀트|녹십자|유한|한미약/.test(name)) return '바이오';
  if (/현대차|기아|모비스|타이어|자동차/.test(name)) return '자동차';
  if (/에코프로|LG에너지|삼성SDI|배터리|전지/.test(name)) return '2차전지';
  if (/KB|신한|하나|우리|메리츠|금융|은행|보험/.test(name)) return '금융';
  if (/한화|로템|항공우주|방산|조선|중공업/.test(name)) return '방산';
  if (/NAVER|카카오|네이버|게임|엔씨|넷마블/.test(name)) return 'IT';
  if (/POSCO|철강|현대제철/.test(name)) return '소재';
  if (/텔레콤|KT|유플|통신/.test(name)) return '통신';
  if (/두산|한국전력|에너지|오일|정유/.test(name)) return '에너지';
  return '기타';
}


async function autoAddNewStocks() {
  const knownCodes = new Set(STOCKS.map(s => s.code));
  const newCodes = [...new Set(
    NEWS.map(n => n.code).filter(c => c && c.length===6 && !isNaN(c) && !knownCodes.has(c))
  )];
  if (!newCodes.length) return;
  console.log('[AutoStock] 새 종목 감지:', newCodes);
  notify(`🔍 새 종목 ${newCodes.length}개 자동 확인 중...`, 'info');
  let added = 0;
  for (const code of newCodes.slice(0, 10)) {
    const name = await fetchStockNameNaver(code);
    if (!name) continue;
    const sector = guessSector(name);
    STOCKS.push({ code, name, sector, dart:'', themes:[sector], cap:'—', _auto:true });
    added++;
    await new Promise(r => setTimeout(r, 200));
  }
  if (added > 0) {
    notify(`✅ 새 종목 ${added}개 자동 추가됨`, 'ok');
    render();
  }
}


function showUpdateToast() {
  // 이미 떠있으면 스킵
  if (document.getElementById('update-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'update-toast';
  toast.innerHTML = `
    <div style="
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:#1565C0;color:#fff;border-radius:16px;
      padding:13px 18px;display:flex;align-items:center;gap:12px;
      box-shadow:0 4px 20px rgba(21,101,192,0.4);
      z-index:9999;font-size:13px;font-weight:700;
      animation:slideUp 0.3s ease;white-space:nowrap
    ">
      <span>🆕 새 버전이 있어요!</span>
      <button onclick="location.reload(true)" style="
        background:#fff;color:#1565C0;border:none;border-radius:10px;
        padding:6px 12px;font-size:12px;font-weight:800;cursor:pointer
      ">업데이트</button>
      <button onclick="document.getElementById('update-toast').remove()" style="
        background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:8px;
        padding:6px 8px;font-size:12px;cursor:pointer
      ">✕</button>
    </div>`;
  document.body.appendChild(toast);
  // 10초 후 자동 사라짐
  setTimeout(() => toast?.remove(), 10000);
}

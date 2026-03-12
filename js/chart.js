차트 모달
   - Yahoo Finance v8 API로 1년치 OHLCV 데이터 fetch
   - Canvas로 캔들스틱 / 라인 차트 직접 렌더링
   - 1개월·3개월·6개월·1년 범위 전환
   ══════════════════════════════════════════════════════ */

const CHART_STATE = {
  code: null,
  range: '1y',    // 1mo|3mo|6mo|1y
  type: 'candle', // candle|line
  data: null,
  loading: false,
};

async function showChartModal(code) {
  CHART_STATE.code  = code;
  CHART_STATE.range = '1y';
  CHART_STATE.type  = 'candle';
  CHART_STATE.data  = null;

  const stock = PRICES[code] || DEFAULT_STOCKS.find(s=>s.code===code) || {code, name:code};

  // backdrop
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop'; bd.id = 'chart-backdrop';
  bd.onclick = closeChartModal;
  document.body.appendChild(bd);

  // sheet
  const sh = document.createElement('div');
  sh.className = 'chart-sheet'; sh.id = 'chart-sheet';
  sh.innerHTML = _chartSheetHTML(stock);
  document.body.appendChild(sh);

  requestAnimationFrame(() => { bd.classList.add('show'); sh.classList.add('show'); });

  await _loadAndDrawChart();
}

function _chartSheetHTML(stock) {
  const p    = PRICES[stock.code] || {};
  const chgC = chgClass(p.chg);
  return `
  <div class="sheet-handle"></div>
  <div class="chart-header">
    <div class="chart-stock-info">
      <div class="sheet-stock-logo">${stockLogo(stock.code)}</div>
      <div style="flex:1">
        <div style="font-size:.93rem;font-weight:700;">${stock.name||stock.code}</div>
        <div style="font-size:.71rem;color:var(--text-muted);font-family:var(--font-mono);">${stock.code}</div>
      </div>
      <button style="padding:6px;color:var(--text-muted);font-size:1.3rem;" onclick="closeChartModal()">×</button>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
      <div class="chart-price-big ${chgC}">${p.price!=null?p.price.toLocaleString('ko-KR'):'--'}</div>
      <div class="${chgC}" style="font-size:.86rem;font-weight:600;">${fmtChg(p.chg)}</div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div class="chart-range-bar" id="chart-range-bar">
        ${['1mo','3mo','6mo','1y'].map(r=>`<button class="chart-range-btn${CHART_STATE.range===r?' active':''}" onclick="changeChartRange('${r}')">${{1mo:'1개월',3mo:'3개월',6mo:'6개월','1y':'1년'}[r]}</button>`).join('')}
      </div>
      <div class="chart-type-toggle">
        <button class="chart-type-btn${CHART_STATE.type==='candle'?' active':''}" onclick="changeChartType('candle')">캔들</button>
        <button class="chart-type-btn${CHART_STATE.type==='line'?' active':''}" onclick="changeChartType('line')">라인</button>
      </div>
    </div>
  </div>
  <div id="chart-canvas-area">
    <div class="chart-loading"><div class="spinner"></div><span>차트 로딩 중...</span></div>
  </div>
  <div id="chart-stats-area"></div>
  <div style="padding:14px 16px;display:flex;gap:8px;">
    <button class="btn ${CHART_STATE.code&&(PRICES[CHART_STATE.code]||{})?' btn-outline':'btn-outline'} btn-sm" style="flex:1" onclick="goFeedByCode('${stock.code}');closeChartModal()">📰 관련 뉴스</button>
    <button class="btn btn-${(PRICES[stock.code]||{}).price?'outline':'outline'} btn-sm" style="flex:1" onclick="toggleWatchlist('${stock.code}');document.getElementById('chart-watch-btn').textContent=S.watchlist.includes('${stock.code}')?'★ 관심해제':'☆ 관심추가'">
      <span id="chart-watch-btn">${S.watchlist.includes(stock.code)?'★ 관심해제':'☆ 관심추가'}</span>
    </button>
  </div>`;
}

async function _loadAndDrawChart() {
  if (CHART_STATE.loading) return;
  CHART_STATE.loading = true;

  const area = document.getElementById('chart-canvas-area');
  if (!area) return;
  area.innerHTML = '<div class="chart-loading"><div class="spinner"></div><span>차트 로딩 중...</span></div>';

  try {
    const ticker = CHART_STATE.code + '.KS';
    const url    = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${CHART_STATE.range}`;
    const res    = await fetch(url, {signal: AbortSignal.timeout(8000)});
    const json   = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('데이터 없음');

    const timestamps = result.timestamps || result.timestamp || [];
    const quote      = result.indicators.quote[0];
    const opens  = quote.open   || [];
    const highs  = quote.high   || [];
    const lows   = quote.low    || [];
    const closes = quote.close  || [];
    const vols   = quote.volume || [];

    // null 제거 후 정리
    const bars = timestamps.map((t,i) => ({
      date:  new Date(t*1000),
      open:  opens[i],
      high:  highs[i],
      low:   lows[i],
      close: closes[i],
      vol:   vols[i],
    })).filter(b => b.open!=null && b.close!=null);

    CHART_STATE.data = bars;
    _drawChart(area, bars);
    _drawStats(bars);
  } catch(e) {
    area.innerHTML = `<div class="chart-loading" style="color:var(--rise);">차트 데이터를 불러올 수 없습니다<br><span style="font-size:.71rem;color:var(--text-muted);">${e.message}</span></div>`;
  }
  CHART_STATE.loading = false;
}

function _drawChart(container, bars) {
  const W = Math.min(window.innerWidth, 480);
  const H = 220;
  const PAD = {top:16, right:12, bottom:28, left:52};
  const CW  = W - PAD.left - PAD.right;
  const CH  = H - PAD.top  - PAD.bottom;

  const canvas = document.createElement('canvas');
  canvas.width  = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.style.display = 'block';

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip'; tooltip.id = 'chart-tooltip';

  const wrap = document.createElement('div');
  wrap.className = 'chart-canvas-wrap';
  wrap.style.position = 'relative';
  wrap.appendChild(canvas);
  wrap.appendChild(tooltip);
  container.innerHTML = '';
  container.appendChild(wrap);

  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const clr = {
    grid:    isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)',
    axis:    isDark ? '#4E5B7A' : '#9BA3B8',
    rise:    '#E53E3E',
    fall:    '#3182CE',
    line:    '#2563EB',
    lineFill:isDark ? 'rgba(37,99,235,.15)' : 'rgba(37,99,235,.08)',
    wick:    isDark ? '#8E99B8' : '#9BA3B8',
  };

  const allPrices = bars.flatMap(b => [b.high, b.low]);
  const minP = Math.min(...allPrices) * 0.998;
  const maxP = Math.max(...allPrices) * 1.002;
  const scaleY = p => PAD.top + CH * (1 - (p - minP) / (maxP - minP));

  const n   = bars.length;
  const barW = CW / n;
  const candleW = Math.max(barW * 0.6, 1.5);
  const scaleX  = i => PAD.left + (i + 0.5) * barW;

  // 그리드
  ctx.strokeStyle = clr.grid;
  ctx.lineWidth   = 1;
  const steps = 4;
  for (let i=0; i<=steps; i++) {
    const y = PAD.top + CH * i / steps;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left+CW, y); ctx.stroke();
    const price = maxP - (maxP - minP) * i / steps;
    ctx.fillStyle  = clr.axis;
    ctx.font       = `${10 * devicePixelRatio / devicePixelRatio}px monospace`;
    ctx.textAlign  = 'right';
    ctx.fillText(Math.round(price).toLocaleString('ko-KR'), PAD.left - 4, y + 3);
  }

  // X축 날짜 레이블 (약 5개)
  ctx.fillStyle = clr.axis;
  ctx.textAlign = 'center';
  ctx.font = '10px monospace';
  const labelStep = Math.floor(n / 5);
  for (let i=0; i<n; i+=labelStep) {
    const d = bars[i].date;
    const lbl = (d.getMonth()+1) + '/' + d.getDate();
    ctx.fillText(lbl, scaleX(i), H - 6);
  }

  if (CHART_STATE.type === 'candle') {
    // 캔들스틱
    bars.forEach((b, i) => {
      const x    = scaleX(i);
      const isUp = b.close >= b.open;
      const c    = isUp ? clr.rise : clr.fall;
      const yO   = scaleY(b.open);
      const yC   = scaleY(b.close);
      const yH   = scaleY(b.high);
      const yL   = scaleY(b.low);

      // 심지
      ctx.strokeStyle = clr.wick;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();

      // 몸통
      ctx.fillStyle = c;
      const bodyTop = Math.min(yO, yC);
      const bodyH   = Math.max(Math.abs(yC - yO), 1.5);
      ctx.fillRect(x - candleW/2, bodyTop, candleW, bodyH);
    });
  } else {
    // 라인 차트
    ctx.beginPath();
    bars.forEach((b,i) => {
      const x = scaleX(i), y = scaleY(b.close);
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.strokeStyle = clr.line;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // 채우기
    ctx.lineTo(scaleX(n-1), PAD.top+CH);
    ctx.lineTo(scaleX(0),   PAD.top+CH);
    ctx.closePath();
    ctx.fillStyle = clr.lineFill;
    ctx.fill();
  }

  // 터치/마우스 툴팁
  function onMove(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX    = clientX - rect.left - PAD.left;
    const idx     = Math.max(0, Math.min(n-1, Math.floor(relX / barW)));
    const b       = bars[idx];
    if (!b) return;
    const d    = b.date;
    const lbl  = `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}  ${b.close.toLocaleString('ko-KR')}원`;
    const chg  = b.open ? ((b.close-b.open)/b.open*100).toFixed(2) : '0.00';
    tooltip.textContent = `${lbl}  (${chg>=0?'+':''}${chg}%)`;
    tooltip.style.display = 'block';
    const tx = Math.min(clientX - rect.left, W - tooltip.offsetWidth - 4);
    tooltip.style.left = tx + 'px';
    tooltip.style.top  = '4px';
  }
  function onEnd() { tooltip.style.display='none'; }
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onEnd);
  canvas.addEventListener('touchmove',  onMove, {passive:true});
  canvas.addEventListener('touchend',   onEnd);
}

function _drawStats(bars) {
  const statsArea = document.getElementById('chart-stats-area');
  if (!statsArea || !bars.length) return;
  const last   = bars[bars.length-1];
  const first  = bars[0];
  const period_chg = first.close ? ((last.close-first.close)/first.close*100).toFixed(2) : '--';
  const high52 = Math.max(...bars.map(b=>b.high)).toLocaleString('ko-KR');
  const low52  = Math.min(...bars.map(b=>b.low)).toLocaleString('ko-KR');
  const avgVol = bars.length ? Math.round(bars.reduce((a,b)=>a+(b.vol||0),0)/bars.length) : 0;
  statsArea.innerHTML = `
  <div class="chart-stat-row">
    <div class="chart-stat-item"><div class="chart-stat-label">기간수익률</div><div class="chart-stat-val ${parseFloat(period_chg)>=0?'num-rise':'num-fall'}">${period_chg>=0?'+':''}${period_chg}%</div></div>
    <div class="chart-stat-item"><div class="chart-stat-label">기간고가</div><div class="chart-stat-val num-rise">${high52}</div></div>
    <div class="chart-stat-item"><div class="chart-stat-label">기간저가</div><div class="chart-stat-val num-fall">${low52}</div></div>
    <div class="chart-stat-item"><div class="chart-stat-label">평균거래량</div><div class="chart-stat-val">${avgVol>=10000?(avgVol/10000).toFixed(0)+'만':avgVol.toLocaleString()}</div></div>
  </div>`;
}

async function changeChartRange(range) {
  CHART_STATE.range = range;
  // 버튼 UI 업데이트
  document.querySelectorAll('.chart-range-btn').forEach(b => {
    b.classList.toggle('active', b.textContent === {1mo:'1개월',3mo:'3개월',6mo:'6개월','1y':'1년'}[range]);
  });
  await _loadAndDrawChart();
}

function changeChartType(type) {
  CHART_STATE.type = type;
  document.querySelectorAll('.chart-type-btn').forEach(b => {
    b.classList.toggle('active', b.textContent === (type==='candle'?'캔들':'라인'));
  });
  if (CHART_STATE.data) {
    const area = document.getElementById('chart-canvas-area');
    if (area) _drawChart(area, CHART_STATE.data);
  }
}

function closeChartModal() {
  const bd = document.getElementById('chart-backdrop');
  const sh = document.getElementById('chart-sheet');
  bd?.classList.remove('show'); sh?.classList.remove('show');
  setTimeout(() => { bd?.remove(); sh?.remove(); }, 350);
}

/* ──
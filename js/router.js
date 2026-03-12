function render() {
  const main = document.getElementById('main-content');
  if (!main) return;
  document.querySelectorAll('.tab-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === S.tab);
  });
  main.innerHTML = '';
  switch(S.tab) {
    case 'my':    main.innerHTML = rMyStocks(); break;
    case 'feed':  main.innerHTML = rFeed(); break;
    case 'port':  main.innerHTML = rPortfolio(); break;
    case 'trade': main.innerHTML = rTradelog(); break;
    case 'hm':    main.innerHTML = rHeatmap(); break;
    case 'sk':    main.innerHTML = rStocks(); break;
    case 'alert': main.innerHTML = rAlert(); break;
    default:      main.innerHTML = rMyStocks();
  }
}

function switchTab(tab) { S.tab = tab; render(); }

function renderTabBar() {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  const tabs = [
    {id:'my',label:'내종목',i:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`},
    {id:'feed',label:'뉴스',i:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H4a2 2 0 00-2 2v16a2 2 0 002 2z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg>`},
    {id:'port',label:'포트',i:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`},
    {id:'trade',label:'매매',i:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`},
    {id:'hm',label:'테마',i:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`},
    {id:'sk',label:'종목',i:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`},
    {id:'alert',label:'설정',i:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>`}
  ];
  bar.innerHTML = tabs.map(t => `<button class="tab-item${S.tab===t.id?' active':''}" data-tab="${t.id}" onclick="switchTab('${t.id}')">${t.i}<span>${t.label}</span></button>`).join('');
}

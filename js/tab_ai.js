AI 분석 ══════ */
async function aiApiFetch(body) {
  const url = getWorkerUrl(); if (!url) throw new Error('Worker URL 없음');
  const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  if (!res.ok) throw new Error(`API 오류: ${res.status}`);
  return res.json();
}

function saveAnalysisCache(id, data) {
  try { const c = JSON.parse(localStorage.getItem('ki_analysisCache')||'{}'); Object.assign(c[String(id)]={}, data); localStorage.setItem('ki_analysisCache', JSON.stringify(c)); } catch(e) {}
}

async function rfc(id) {
  const sid = String(id), item = NEWS.find(n => String(n.id) === sid);
  if (!item || S.ana[sid]) return;
  S.ana[sid] = true; updateAIBtn(sid,'fc',true); showToast('팩트체크 분석 중...');
  try {
    const data = await aiApiFetch({model:'claude-sonnet-4-20250514',max_tokens:1000,system:'한국 주식시장 전문 팩트체커. JSON만 응답. 다른 텍스트 없이.',messages:[{role:'user',content:`뉴스 팩트체크:\n제목:${item.title}\n본문:${item.body}\n출처수:${item.sources}\n\nJSON:{"score":0-100,"verdict":"confirmed|partial|unverified|false","detail":{"key_points":"핵심","risk_level":"높음|중간|낮음","action_note":"주의사항"}}`}]});
    const txt = (data.content||[]).map(c=>c.text||'').join(''), parsed = JSON.parse(txt.replace(/```json|```/g,'').trim());
    item.score = parsed.score; item.verdict = parsed.verdict; item.detail = parsed.detail;
    saveAnalysisCache(sid, {score:item.score, verdict:item.verdict, detail:item.detail});
    showToast('팩트체크 완료');
  } catch(e) { showToast('팩트체크 실패: '+e.message); }
  S.ana[sid] = false; updateAIBtn(sid,'fc',false); refreshCardModal(sid); if (S.tab==='feed') reCards();
}

async function runJudge(id) {
  const sid = String(id), item = NEWS.find(n => String(n.id) === sid);
  if (!item || S.judging[sid]) return;
  S.judging[sid] = true; updateAIBtn(sid,'jd',true); showToast('투자판단 분석 중...');
  const p = PRICES[item.code]||{}, sup = SUPPLY[item.code]||{};
  try {
    const data = await aiApiFetch({model:'claude-sonnet-4-20250514',max_tokens:1000,system:'한국 주식 투자 전문가. JSON만 응답.',messages:[{role:'user',content:`투자판단:\n뉴스:${item.title}\n본문:${item.body}\n종목:${item.code}(${stockName(item.code)})\n현재가:${p.price||'없음'}원\n등락:${p.chg||0}%\n외인:${sup.foreign||0}\n기관:${sup.institution||0}\n\nJSON:{"verdict":"매수|관망|매도","confidence":0-100,"summary":"근거","short":"매수|관망|매도","mid":"매수|관망|매도","long":"매수|관망|매도","factors":["요인1","요인2"],"stopLoss":"손절가","targetReturn":"목표수익률"}`}]});
    const txt = (data.content||[]).map(c=>c.text||'').join(''), p2 = JSON.parse(txt.replace(/```json|```/g,'').trim());
    item.judgment = {verdict:p2.verdict||'관망',confidence:p2.confidence||50,summary:p2.summary||'',short:p2.short||'관망',mid:p2.mid||'관망',long:p2.long||'관망',factors:p2.factors||[],stopLoss:p2.stopLoss||null,targetReturn:p2.targetReturn||null};
    saveAnalysisCache(sid, {judgment:item.judgment}); showToast('투자판단 완료');
  } catch(e) { showToast('투자판단 실패: '+e.message); }
  S.judging[sid] = false; updateAIBtn(sid,'jd',false); refreshCardModal(sid); if (S.tab==='feed') reCards();
}

async function runAISummary(id) {
  const sid = String(id), item = NEWS.find(n => String(n.id) === sid);
  if (!item || S.aiSumF[sid]) return;
  S.aiSumF[sid] = true; updateAIBtn(sid,'ai',true); showToast('AI 요약 생성 중...');
  try {
    const data = await aiApiFetch({model:'claude-sonnet-4-20250514',max_tokens:500,system:'한국 주식 뉴스 요약 전문가. JSON만.',messages:[{role:'user',content:`핵심 요약+키워드:\n제목:${item.title}\n본문:${item.body}\n\nJSON:{"summary":"1-2문장 요약","keywords":["키1","키2","키3"]}`}]});
    const txt = (data.content||[]).map(c=>c.text||'').join(''), p2 = JSON.parse(txt.replace(/```json|```/g,'').trim());
    item.aiSummary = p2.summary||''; item.aiKeywords = p2.keywords||[];
    saveAnalysisCache(sid, {aiSummary:item.aiSummary, aiKeywords:item.aiKeywords}); showToast('AI 요약 완료');
  } catch(e) { showToast('AI 요약 실패: '+e.message); }
  S.aiSumF[sid] = false; updateAIBtn(sid,'ai',false); refreshCardModal(sid); if (S.tab==='feed') reCards();
}

function updateAIBtn(id, type, loading) {
  const map = {fc:`btn-fc-${id}`,jd:`btn-jd-${id}`,ai:`btn-ai-${id}`};
  const el = document.getElementById(map[type]); if (!el) return;
  if (loading) { el.insertAdjacentHTML('beforeend','<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-left:4px;"></span>'); el.disabled = true; }
  else { el.querySelector('.spinner')?.remove(); el.disabled = false; }
}

async function runAll() {
  const un = NEWS.filter(n => !n.judgment); showToast(`${un.length}개 뉴스 일괄 분석 시작...`);
  for (const n of un.slice(0,10)) { await rfc(String(n.id)); await runJudge(String(n.id)); await new Promise(r=>setTimeout(r,500)); }
  showToast('일괄 분석 완료'); if (S.tab==='feed') render();
}

/* ══════
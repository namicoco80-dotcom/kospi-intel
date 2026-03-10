/* ==================================================
   KOSPI INTEL - board.js
================================================== */


function getBoardNick() {
  try { return localStorage.getItem('board_nick') || ''; } catch(e) { return ''; }
}

function saveBoardNick(n) {
  try { localStorage.setItem('board_nick', n); } catch(e) {} 
}

function getLikedPosts() {
  try { return JSON.parse(localStorage.getItem('board_liked') || '[]'); } catch(e) { return []; }
}

async function fetchBoardPosts() {
  try {
    const url = getWorkerUrl();
    if (!url) return _boardCache || [];
    const res = await fetch(url + '?action=board_get', { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch fail: ' + res.status);
    const ct2 = res.headers?.get('content-type') || '';
    if (!ct2.includes('application/json')) throw new Error('JSON 아님');
    const data = await res.json();
    _boardCache = Array.isArray(data.posts) ? data.posts : [];
    return _boardCache;
  } catch(e) {
    return _boardCache || [];
  }
}


async function submitBoardPost() {
  const nickEl  = document.getElementById('board-nick');
  const textEl  = document.getElementById('board-text');
  const typeEl  = document.getElementById('board-type');
  const stockEl = document.getElementById('board-stock');
  const btn     = document.getElementById('board-submit-btn');

  const nick  = nickEl?.value.trim() || '';
  const text  = textEl?.value.trim() || '';
  const type  = typeEl?.value || 'free';
  const stock = stockEl?.value.trim() || '';

  if (!nick) { notify('닉네임을 입력해주세요', 'warn'); nickEl?.focus(); return; }
  if (!text) { notify('내용을 입력해주세요', 'warn'); textEl?.focus(); return; }
  if (text.length > 300) { notify('300자 이내로 작성해주세요', 'warn'); return; }

  saveBoardNick(nick);
  if (btn) { btn.disabled = true; btn.textContent = '게시 중...'; }

  try {
    const url = getWorkerUrl();
    if (!url) throw new Error('Worker URL이 설정되지 않았어요');
    const post = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2,5),
      nick, text, type, stock, likes: 0,
      ts: Date.now(),
      time: new Date().toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'board_post', post })
    });
    const resText = await res.text();
    let data;
    try { data = JSON.parse(resText); } catch(e) {
      throw new Error('서버 응답 오류: ' + resText.slice(0,80));
    }
    if (!res.ok) throw new Error(data.error || '서버 오류 ' + res.status);
    _boardCache = data.posts || null;
    if (textEl) textEl.value = '';
    if (stockEl) stockEl.value = '';
    notify('✅ 게시글 등록!', 'ok');
    renderBoardTab();
  } catch(e) {
    notify('❌ 게시 실패: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '게시하기 ✈️'; }
  }
}


async function boardLike(postId) {
  const liked = getLikedPosts();
  const isLiked = liked.includes(postId);
  if (isLiked) liked.splice(liked.indexOf(postId), 1);
  else liked.push(postId);
  try { localStorage.setItem('board_liked', JSON.stringify(liked)); } catch(e) {}
  try {
    const url = getWorkerUrl();
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'board_like', postId, delta: isLiked ? -1 : 1 })
    });
    _boardCache = null;
  } catch(e) {}
  renderBoardTab();
}


function setBoardFilter(f) { _boardFilter = f; renderBoardTab(); }


async function renderBoardTab() {
  const wrap = document.getElementById('board-content');
  if (!wrap) return;
  wrap.innerHTML = '<div style="text-align:center;padding:30px;color:#94A3B8;font-size:13px">⏳ 불러오는 중...</div>';
  const posts = await fetchBoardPosts();
  const liked = getLikedPosts();
  const filtered = _boardFilter === 'all' ? posts : posts.filter(p => p.type === _boardFilter);
  const sorted = [...filtered].sort((a,b) => b.ts - a.ts);
  const typeStyle = {
    free:  { bg:'#EFF6FF', color:'#1565C0', label:'💬 자유' },
    stock: { bg:'#F0FFF4', color:'#2E7D32', label:'📈 종목' },
  };
  wrap.innerHTML = sorted.length === 0
    ? '<div style="text-align:center;padding:40px;color:#94A3B8;font-size:13px">아직 게시글이 없어요<br>첫 글을 남겨보세요! 😊</div>'
    : sorted.map(p => {
        const ts = typeStyle[p.type] || typeStyle.free;
        const isLiked = liked.includes(p.id);
        return `<div class="board-post">
          <div class="board-post-hdr">
            <span class="board-post-nick">${p.nick}</span>
            <span class="board-post-type" style="background:${ts.bg};color:${ts.color}">${ts.label}</span>
            ${p.stock ? `<span class="board-stock-tag">${p.stock}</span>` : ''}
            <span class="board-post-time">${p.time}</span>
          </div>
          <div class="board-post-body">${p.text.replace(/</g,'&lt;').split('\n').join('<br>')}</div>
          <div class="board-post-footer">
            <button class="board-like-btn ${isLiked?'liked':''}" onclick="boardLike('${p.id}')">👍 ${p.likes||0}</button>
          </div>
        </div>`;
      }).join('');
}

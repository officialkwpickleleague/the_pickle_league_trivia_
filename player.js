import { db, isDemo } from './db.js';
import { $, esc, OPTIONS, ranked, ordinal } from './common.js';

const app = $('#app');
const SAVE = 'quizlive_player_session';
if (isDemo) $('#demo').innerHTML = '<div class="demo">Demo mode: only works between tabs of this browser (see README to go live)</div>';

let pin = null, pid = null, game = null, unsub = null, tick = null, lastKey = '';
const pending = {}; // qIndex -> choice chosen locally, before the database echoes it back

const view = (html) => { app.innerHTML = html; };

function stopAll() {
  if (unsub) unsub();
  unsub = null; clearInterval(tick); tick = null; lastKey = ''; game = null;
}

function showJoin(msg = '') {
  stopAll();
  const p = new URLSearchParams(location.search).get('pin') || '';
  view(`<div class="card center">
    <img class="logo-hero" src="img/logo.png" alt="">
    <h1>Join a game</h1>
    <form id="jf">
      <input id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Game PIN" value="${esc(p)}" autocomplete="off">
      <input id="nm" maxlength="16" placeholder="Nickname" autocomplete="off">
      <button class="btn primary big" id="jb">Join</button>
    </form>
    <p class="err" id="err">${esc(msg)}</p>
  </div>`);
  const err = (t) => { $('#err').textContent = t; $('#jb').disabled = false; };
  if (p) $('#nm').focus();
  $('#jf').onsubmit = async (e) => {
    e.preventDefault();
    const pn = $('#pin').value.trim(), nm = $('#nm').value.trim();
    if (!/^\d{6}$/.test(pn)) return err('Enter the 6-digit game PIN.');
    if (!nm) return err('Pick a nickname.');
    $('#jb').disabled = true; $('#err').textContent = '';
    try {
      const state = await db.get(`games/${pn}/state`);
      if (!state) return err('Game not found. Check the PIN.');
      if (state !== 'lobby') return err('That game has already started.');
      const players = (await db.get(`games/${pn}/players`)) || {};
      if (Object.values(players).some((x) => String(x.name).toLowerCase() === nm.toLowerCase())) return err('That nickname is taken, try another.');
      const id = 'p' + Math.random().toString(36).slice(2, 10);
      await db.set(`games/${pn}/players/${id}`, { name: nm, score: 0, lastPoints: 0, lastCorrect: false, joined: db.ts });
      sessionStorage.setItem(SAVE, JSON.stringify({ pin: pn, pid: id }));
      attach(pn, id);
    } catch (x) { err('Could not connect: ' + x.message); }
  };
}

function attach(p, id) {
  stopAll();
  pin = p; pid = id;
  unsub = db.onValue(`games/${pin}`, (g) => {
    if (!g) { sessionStorage.removeItem(SAVE); return showJoin('The game has ended.'); }
    game = g; render();
  });
  tick = setInterval(onTick, 100);
}

function myChoice(g) {
  const mine = g.answers?.[g.qIndex]?.[pid];
  return mine ? mine.c : pending[g.qIndex];
}

function render() {
  const g = game, me = g.players?.[pid];
  if (!me) { sessionStorage.removeItem(SAVE); return showJoin('You were removed from the game.'); }
  const n = Object.keys(g.players).length;
  const q = g.questions?.[g.qIndex];
  const choice = myChoice(g);
  const key = [g.state, g.qIndex, choice, g.state === 'lobby' ? n : '', me.score].join('|');
  if (key === lastKey) return;
  lastKey = key;

  if (g.state === 'lobby') {
    return view(`<div class="card center"><img class="logo-hero bob mascot" src="img/logo.png" alt=""><h1>You're in!</h1><div class="pbig">${esc(me.name)}</div>
      <p class="muted">Waiting for the host to start…<br>${n} player${n === 1 ? '' : 's'} joined</p></div>`);
  }

  if (g.state === 'question' && q) {
    const locked = choice != null;
    return view(`<div class="qhead"><span>Question ${g.qIndex + 1} / ${g.questions.length}</span><span id="tleft"></span></div>
      <div class="bar"><i id="bar"></i></div>
      <div class="pq"><img class="mascot" src="img/logo.png" alt=""><h2 class="qtext">${esc(q.text)}</h2></div>
      <div class="opts">${q.options.map((o, i) => `
        <button class="opt ${OPTIONS[i].cls} ${locked ? (choice === i ? 'pick' : 'dim') : ''}" data-i="${i}" ${locked ? 'disabled' : ''}>
          <span class="sh">${OPTIONS[i].shape}</span><span>${esc(o)}</span></button>`).join('')}</div>
      <p class="center muted" id="note">${locked ? 'Answer locked in ✓ Waiting for the others…' : ''}</p>`);
  }

  if (g.state === 'results' && q) {
    const ok = !!me.lastCorrect, answered = choice != null;
    const head = ok ? 'Correct!' : answered ? 'Incorrect' : "Time's up!";
    const list = ranked(g.players), mine = list.find((p) => p.id === pid);
    return view(`<div class="res ${ok ? 'good' : 'bad'}"><div class="big">${head}</div><div class="pts">+${me.lastPoints || 0}</div></div>
      ${ok ? '' : `<p class="center muted">Correct answer: <b>${esc(q.options[g.reveal?.correct])}</b></p>`}
      <p class="stats"><b>${ordinal(mine.rank)}</b> of ${list.length} · ${me.score} pts</p>
      <p class="center muted">Look at the big screen…</p>`);
  }

  if (g.state === 'final') {
    const list = ranked(g.players), mine = list.find((p) => p.id === pid);
    return view(`<div class="card center"><img class="logo-hero bob mascot" src="img/logo.png" alt=""><h1>Game over!</h1><div class="pbig">${ordinal(mine.rank)}</div>
      <p class="stats">${me.score} points</p></div>
      <ul class="list">${list.slice(0, 5).map((p) => `<li class="${p.id === pid ? 'me' : ''}"><span class="rk">${p.rank}</span><span class="nm">${esc(p.name)}</span><span class="sc">${p.score}</span></li>`).join('')}</ul>
      <button class="btn big" id="leave">Leave game</button>`);
  }
}

function onTick() {
  const g = game;
  if (!g || g.state !== 'question' || !g.qStart) return;
  const q = g.questions[g.qIndex], total = q.time * 1000;
  const left = g.qStart + total - db.now();
  const bar = $('#bar'), tl = $('#tleft');
  if (bar) bar.style.width = Math.max(0, Math.min(100, (left / total) * 100)) + '%';
  if (tl) tl.textContent = left > 0 ? Math.ceil(left / 1000) + 's' : '0s';
  if (left <= 0 && myChoice(g) == null) {
    document.querySelectorAll('.opt').forEach((b) => (b.disabled = true));
    const note = $('#note'); if (note) note.textContent = "Time's up!";
  }
}

app.addEventListener('click', async (e) => {
  if (e.target.closest('#leave')) { sessionStorage.removeItem(SAVE); return showJoin(); }
  const b = e.target.closest('.opt');
  if (!b || b.disabled || !game || game.state !== 'question') return;
  const qi = game.qIndex, i = Number(b.dataset.i);
  if (pending[qi] != null) return;
  const q = game.questions[qi];
  if (game.qStart && db.now() > game.qStart + q.time * 1000) return;
  pending[qi] = i;
  lastKey = ''; render();
  try { await db.set(`games/${pin}/answers/${qi}/${pid}`, { c: i, t: db.ts }); }
  catch (x) { delete pending[qi]; lastKey = ''; render(); }
});

// Resume automatically after a refresh / dropped connection.
(async () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE) || 'null');
    if (s && (await db.get(`games/${s.pin}/players/${s.pid}`))) return attach(s.pin, s.pid);
  } catch {}
  sessionStorage.removeItem(SAVE);
  showJoin();
})();

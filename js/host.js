import { db, isDemo } from './db.js';
import { $, esc, OPTIONS, scorePoints, ranked, DEFAULT_QUIZ } from './common.js';

const app = $('#app');
const QKEY = 'quizlive_host_quiz';       // the quiz you are editing
const SKEY = 'quizlive_host_session';    // { pin, active } for the game in progress
const TIMES = [5, 10, 15, 20, 30, 45, 60, 90, 120];

let quiz = loadQuiz();
let pin = null, active = null, game = null, unsub = null, ticker = null, lastKey = '', finishing = null;

/* ======================= Quiz storage / sanitising ======================= */
function cleanQuiz(raw) {
  if (!raw || !Array.isArray(raw.questions) || !raw.questions.length) return null;
  return {
    title: String(raw.title || 'My Quiz'),
    questions: raw.questions.map((q) => {
      const options = [0, 1, 2, 3].map((i) => String(q.options?.[i] ?? ''));
      const correct = Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4 ? q.correct : 0;
      const time = Math.min(120, Math.max(5, Number(q.time) || 15));
      return { text: String(q.text || ''), options, correct, time };
    }),
  };
}
function loadQuiz() {
  try { const q = cleanQuiz(JSON.parse(localStorage.getItem(QKEY))); if (q) return q; } catch {}
  return structuredClone(DEFAULT_QUIZ);
}
const saveQuiz = () => localStorage.setItem(QKEY, JSON.stringify(quiz));
const blankQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0, time: 15 });

/* ============================== Editor ============================== */
function qCard(q, i) {
  const times = [...new Set([...TIMES, q.time])].sort((a, b) => a - b);
  return `<section class="qcard" data-i="${i}">
    <div class="qc-head"><b>Question ${i + 1}</b><span class="spacer"></span>
      <label class="muted">Time <select data-f="time">${times.map((t) => `<option value="${t}" ${t === q.time ? 'selected' : ''}>${t}s</option>`).join('')}</select></label>
      <button data-a="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
      <button data-a="down" ${i === quiz.questions.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
      <button data-a="dup" title="Duplicate">⧉</button>
      <button data-a="del" title="Delete">✕</button></div>
    <textarea data-f="text" rows="2" placeholder="Type your question">${esc(q.text)}</textarea>
    ${q.options.map((o, j) => `<div class="optrow ${OPTIONS[j].cls}">
      <input type="radio" name="c${i}" data-f="correct" value="${j}" ${q.correct === j ? 'checked' : ''} title="Mark as the correct answer">
      <span class="shape">${OPTIONS[j].shape}</span>
      <input type="text" data-f="opt" data-j="${j}" value="${esc(o)}" placeholder="Answer ${j + 1}${j > 1 ? ' (optional)' : ''}">
    </div>`).join('')}
  </section>`;
}

function showEditor(msg = '') {
  clearInterval(ticker); lastKey = '';
  app.innerHTML = `<header class="top"><h1>Quiz Live · Host</h1><span class="spacer"></span>
      ${isDemo ? '<span class="muted">Demo mode</span>' : '<span class="muted">Live (Firebase)</span>'}</header>
    ${isDemo ? '<div class="demo">Demo mode: players can only join from other tabs in THIS browser. Add your Firebase details in config.js to go live (see README).</div>' : ''}
    <div class="editor">
      <label class="field">Quiz title<input id="title" value="${esc(quiz.title)}"></label>
      <p class="muted">Tick the circle next to the correct answer. Leave an answer blank to use only 2 or 3 choices.</p>
      <div id="qs">${quiz.questions.map(qCard).join('')}</div>
      <div class="row">
        <button class="btn" id="add">+ Add question</button>
        <button class="btn" id="export">Export quiz (.json)</button>
        <label class="btn">Import quiz<input type="file" id="import" accept=".json,application/json" hidden></label>
        <button class="btn danger" id="reset">Reset to sample</button>
      </div>
      <p class="err" id="err">${esc(msg)}</p>
      <button class="btn primary big" id="start">Start a game (${quiz.questions.length} question${quiz.questions.length === 1 ? '' : 's'})</button>
    </div>`;
}

app.addEventListener('input', (e) => {
  const t = e.target, card = t.closest('.qcard');
  if (t.id === 'title') { quiz.title = t.value; return saveQuiz(); }
  if (!card) return;
  const q = quiz.questions[Number(card.dataset.i)], f = t.dataset.f;
  if (f === 'text') q.text = t.value;
  else if (f === 'opt') q.options[Number(t.dataset.j)] = t.value;
  else if (f === 'time') q.time = Number(t.value);
  else if (f === 'correct') q.correct = Number(t.value);
  saveQuiz();
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.f === 'correct') { quiz.questions[Number(t.closest('.qcard').dataset.i)].correct = Number(t.value); saveQuiz(); }
  if (t.id === 'import' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const q = cleanQuiz(JSON.parse(r.result));
        if (!q) throw new Error('bad file');
        quiz = q; saveQuiz(); showEditor('Quiz imported.');
      } catch { showEditor('Could not read that file. Use a file exported from this page.'); }
    };
    r.readAsText(t.files[0]);
  }
});

app.addEventListener('click', async (e) => {
  const b = e.target.closest('button, label.btn');
  if (!b) return;
  const card = b.closest('.qcard'), i = card ? Number(card.dataset.i) : -1, qs = quiz.questions;

  if (b.dataset.a) {
    if (b.dataset.a === 'up' && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
    if (b.dataset.a === 'down' && i < qs.length - 1) [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
    if (b.dataset.a === 'dup') qs.splice(i + 1, 0, structuredClone(qs[i]));
    if (b.dataset.a === 'del') { if (qs.length === 1) return showEditor('A quiz needs at least one question.'); qs.splice(i, 1); }
    saveQuiz(); return showEditor();
  }
  switch (b.id) {
    case 'add': qs.push(blankQuestion()); saveQuiz(); showEditor(); window.scrollTo(0, document.body.scrollHeight); break;
    case 'reset': if (confirm('Replace your quiz with the sample quiz?')) { quiz = structuredClone(DEFAULT_QUIZ); saveQuiz(); showEditor(); } break;
    case 'export': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(quiz, null, 2)], { type: 'application/json' }));
      a.download = (quiz.title || 'quiz').replace(/[^\w-]+/g, '_') + '.json'; a.click(); break;
    }
    case 'start': startGame(); break;
    case 'kick': db.remove(`games/${pin}/players/${b.dataset.id}`); break;
    case 'copy': navigator.clipboard?.writeText(joinUrl()); b.textContent = 'Copied!'; break;
    case 'begin': nextQuestion(0); break;
    case 'next': {
      const nxt = game.qIndex + 1;
      if (nxt < game.questions.length) nextQuestion(nxt); else db.update(`games/${pin}`, { state: 'final' });
      break;
    }
    case 'end': case 'done':
      if (b.id === 'done' || confirm('End this game for everyone?')) endGame();
      break;
  }
});

/* ============================== Game ============================== */
function buildActive() {
  const out = [];
  for (const [i, q] of quiz.questions.entries()) {
    if (!q.text.trim()) return { err: `Question ${i + 1} has no text.` };
    const idx = q.options.map((o, j) => (o.trim() ? j : -1)).filter((j) => j >= 0);
    if (idx.length < 2) return { err: `Question ${i + 1} needs at least 2 answers.` };
    if (!idx.includes(q.correct)) return { err: `Question ${i + 1}: tick a correct answer (it must have text).` };
    out.push({ text: q.text.trim(), options: idx.map((j) => q.options[j].trim()), correct: idx.indexOf(q.correct), time: q.time });
  }
  return { quiz: { title: quiz.title.trim() || 'Quiz', questions: out } };
}

async function startGame() {
  const built = buildActive();
  if (built.err) return showEditor(built.err);
  $('#start').disabled = true;
  try {
    let p;
    do { p = String(Math.floor(100000 + Math.random() * 900000)); } while (await db.get(`games/${p}/state`));
    active = built.quiz;
    // The correct answers stay on THIS device (in `active`); players never receive them until the reveal.
    await db.set(`games/${p}`, {
      state: 'lobby', title: active.title, qIndex: 0, created: db.ts,
      questions: active.questions.map((q) => ({ text: q.text, options: q.options, time: q.time })),
    });
    localStorage.setItem(SKEY, JSON.stringify({ pin: p, active }));
    attach(p);
  } catch (x) { showEditor('Could not create the game: ' + x.message); }
}

function attach(p) {
  pin = p; lastKey = ''; finishing = null;
  unsub?.();
  unsub = db.onValue(`games/${pin}`, (g) => {
    if (!g) { detach(); return showEditor('That game no longer exists.'); }
    game = g; render();
  });
  clearInterval(ticker); ticker = setInterval(onTick, 150);
}
function detach() { unsub?.(); unsub = null; clearInterval(ticker); localStorage.removeItem(SKEY); pin = null; game = null; }
async function endGame() { const p = pin; detach(); await db.remove(`games/${p}`); showEditor(); }

const joinUrl = () => new URL(`index.html?pin=${pin}`, location.href).href;

function qrSvg(text) {
  if (typeof qrcode === 'undefined') return '';
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  return qr.createSvgTag(4, 0);
}

function nextQuestion(i) {
  finishing = null;
  return db.update(`games/${pin}`, { state: 'question', qIndex: i, qStart: db.ts, reveal: null });
}

async function finishQuestion(idx) {
  const g = await db.get(`games/${pin}`);
  if (!g || g.state !== 'question' || g.qIndex !== idx) return;   // already scored
  const q = active.questions[idx], limit = q.time * 1000;
  const ans = g.answers?.[idx] || {};
  const counts = q.options.map(() => 0);
  const upd = {};
  for (const [id, p] of Object.entries(g.players || {})) {
    const a = ans[id];
    let pts = 0, ok = false;
    if (a && a.t != null && Number.isInteger(a.c) && a.c >= 0 && a.c < counts.length) {
      const ms = Math.max(0, a.t - g.qStart);
      if (ms <= limit + 300) {                       // small grace for network delay
        counts[a.c]++;
        if (a.c === q.correct) { ok = true; pts = scorePoints(ms, limit); }
      }
    }
    upd[`players/${id}/score`] = (p.score || 0) + pts;
    upd[`players/${id}/lastPoints`] = pts;
    upd[`players/${id}/lastCorrect`] = ok;
  }
  upd.state = 'results';
  upd.reveal = { correct: q.correct, counts };
  await db.update(`games/${pin}`, upd);
}

function onTick() {
  const g = game;
  if (!g || g.state !== 'question' || !g.qStart) return;
  const q = g.questions[g.qIndex], total = q.time * 1000;
  const left = g.qStart + total - db.now();
  const bar = $('#hbar'), tl = $('#hleft');
  if (bar) bar.style.width = Math.max(0, Math.min(100, (left / total) * 100)) + '%';
  if (tl) tl.textContent = Math.max(0, Math.ceil(left / 1000));
  const n = Object.keys(g.players || {}).length, got = Object.keys(g.answers?.[g.qIndex] || {}).length;
  const ac = $('#hans'); if (ac) ac.textContent = `${got} / ${n} answered`;
  if ((left <= 0 || (n > 0 && got >= n)) && finishing !== g.qIndex) {
    finishing = g.qIndex;
    const idx = g.qIndex;
    setTimeout(() => finishQuestion(idx), left <= 0 ? 800 : 250);   // wait briefly for in-flight answers
  }
}

/* ============================== Screens ============================== */
function footer() {
  return `<div class="footbar"><span>Join at <b>${esc(new URL('index.html', location.href).href.replace(/^https?:\/\//, ''))}</b></span>
    <span>PIN <b>${pin}</b></span><span class="spacer"></span><button class="btn danger" id="end">End game</button></div>`;
}

function leaderboard(g, n = 5, showPlus = false) {
  return `<ul class="list">${ranked(g.players).slice(0, n).map((p) =>
    `<li><span class="rk">${p.rank}</span><span class="nm">${esc(p.name)}</span>
     <span class="sc">${p.score}${showPlus && p.lastPoints ? `<span class="plus">+${p.lastPoints}</span>` : ''}</span></li>`).join('')}</ul>`;
}

function render() {
  const g = game, players = Object.entries(g.players || {});
  const key = [g.state, g.qIndex].join('|');

  if (g.state === 'lobby') {
    const chips = players.map(([id, p]) => `<span class="chip">${esc(p.name)}<button id="kick" data-id="${id}" title="Remove">×</button></span>`).join('');
    if (key !== lastKey) {
      lastKey = key;
      app.innerHTML = `<div class="hostwrap"><h1>${esc(g.title)}</h1>
        <div class="lobby"><div>
          <div class="pinbox"><div>Go to <b>${esc(new URL('index.html', location.href).href.replace(/^https?:\/\//, ''))}</b> and enter PIN</div>
            <div class="pin">${pin}</div></div>
          <h2 style="margin-top:20px"><span id="pcount"></span></h2>
          <div class="chips" id="chips"></div>
          <div class="row"><button class="btn primary big" id="begin">Start quiz</button></div>
          <button class="btn" id="copy">Copy join link</button> <button class="btn danger" id="end">Cancel game</button>
        </div>
        <div class="qr" title="Scan to join">${qrSvg(joinUrl())}</div></div></div>`;
    }
    $('#pcount').textContent = `${players.length} player${players.length === 1 ? '' : 's'} joined`;
    $('#chips').innerHTML = chips || '<span class="muted">Waiting for players…</span>';
    $('#begin').disabled = players.length === 0;
    return;
  }

  if (g.state === 'question') {
    if (key === lastKey) return;
    lastKey = key;
    const q = g.questions[g.qIndex];
    app.innerHTML = `<div class="hostwrap">
      <div class="hmeta"><span>Question ${g.qIndex + 1} / ${g.questions.length}</span><span id="hans"></span><span id="hleft">${q.time}</span></div>
      <div class="bar hbar"><i id="hbar"></i></div>
      <div class="hq">${esc(q.text)}</div>
      <div class="hopts">${q.options.map((o, i) => `<div class="hopt ${OPTIONS[i].cls}"><span class="sh">${OPTIONS[i].shape}</span>${esc(o)}</div>`).join('')}</div>
    </div>${footer()}`;
    return;
  }

  if (g.state === 'results') {
    if (key === lastKey) return;
    lastKey = key;
    const q = g.questions[g.qIndex], r = g.reveal || { correct: 0, counts: [] };
    const last = g.qIndex === g.questions.length - 1;
    app.innerHTML = `<div class="hostwrap">
      <div class="hmeta"><span>Question ${g.qIndex + 1} / ${g.questions.length}</span><span></span><span></span></div>
      <div class="hq">${esc(q.text)}</div>
      <div class="hopts">${q.options.map((o, i) => `<div class="hopt ${OPTIONS[i].cls} ${i === r.correct ? 'ok' : 'dim'}"><span class="sh">${OPTIONS[i].shape}</span>${esc(o)}<span class="cnt">${r.counts?.[i] || 0}</span></div>`).join('')}</div>
      <h2 style="margin-top:24px">Leaderboard</h2>${leaderboard(g, 5, true)}
      <button class="btn primary big" id="next">${last ? 'Show final results' : 'Next question'}</button>
    </div>${footer()}`;
    return;
  }

  if (g.state === 'final') {
    if (key === lastKey) return;
    lastKey = key;
    const list = ranked(g.players), top = list.slice(0, 3);
    const pod = [top[1], top[0], top[2]].map((p, i) => p && `<div class="${['p2', 'p1', 'p3'][i]}"><b>${esc(p.name)}</b>${p.score}<br><span class="muted">${['2nd', '1st', '3rd'][i]}</span></div>`).join('');
    app.innerHTML = `<div class="hostwrap"><h1 class="center">Final results</h1>
      <div class="podium">${pod}</div>${leaderboard(g, 15)}
      <button class="btn primary big" id="done">Finish &amp; clear game data</button></div>`;
  }
}

/* ============================== Start-up ============================== */
(async () => {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || 'null');
    if (s && (await db.get(`games/${s.pin}/state`))) { active = s.active; return attach(s.pin); }
  } catch {}
  localStorage.removeItem(SKEY);
  showEditor();
})();

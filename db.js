// Tiny database adapter.
//  - If config.js has Firebase details  -> real-time sync across every device (the real thing).
//  - If not                              -> "demo mode": syncs only between tabs of THIS browser,
//                                           so you can try the whole game on one computer.
import { firebaseConfig } from '../config.js';

const FB_VERSION = '10.12.2';
export const isDemo = !firebaseConfig || !firebaseConfig.databaseURL;

const keys = (p) => p.split('/').filter(Boolean);

async function localImpl() {
  const KEY = 'quizlive_demo_db';
  const TS = '__SERVER_TIMESTAMP__';
  const listeners = new Set();
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (t) => localStorage.setItem(KEY, JSON.stringify(t));
  const getAt = (t, p) => {
    let n = t;
    for (const k of keys(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
    return n === undefined ? null : n;
  };
  const setAt = (t, p, v) => {
    const ks = keys(p);
    let n = t;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof n[ks[i]] !== 'object' || n[ks[i]] === null) n[ks[i]] = {};
      n = n[ks[i]];
    }
    if (v === null || v === undefined) delete n[ks[ks.length - 1]];
    else n[ks[ks.length - 1]] = v;
  };
  const resolve = (v) => {
    if (v === TS) return Date.now();
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
    return v;
  };
  const notify = () => listeners.forEach((fn) => fn());
  window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });

  return {
    ts: TS,
    now: () => Date.now(),
    async set(p, v) { const t = load(); setAt(t, p, resolve(v)); save(t); notify(); },
    async update(p, o) {
      const t = load();
      for (const [k, v] of Object.entries(o)) setAt(t, `${p}/${k}`, resolve(v));
      save(t); notify();
    },
    async remove(p) { const t = load(); setAt(t, p, null); save(t); notify(); },
    async get(p) { return getAt(load(), p); },
    onValue(p, cb) {
      let last;
      const fn = () => {
        const v = getAt(load(), p);
        const s = JSON.stringify(v);
        if (s === last) return;
        last = s; cb(v);
      };
      listeners.add(fn); fn();
      return () => listeners.delete(fn);
    },
  };
}

async function firebaseImpl() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
  let initializeApp, m, d;
  try {
    ({ initializeApp } = await import(`${base}/firebase-app.js`));
    m = await import(`${base}/firebase-database.js`);
  } catch (e) { throw new Error('Could not load Firebase from Google (gstatic.com). Check your internet connection or ad/content blockers.'); }
  try { d = m.getDatabase(initializeApp(firebaseConfig)); }
  catch (e) { throw new Error('Firebase rejected the settings in config.js: ' + e.message); }
  let offset = 0;
  await new Promise((resolve) => {
    const to = setTimeout(resolve, 3000);
    m.onValue(m.ref(d, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; clearTimeout(to); resolve(); });
  });
  return {
    ts: m.serverTimestamp(),
    now: () => Date.now() + offset,
    set: (p, v) => m.set(m.ref(d, p), v),
    update: (p, o) => m.update(m.ref(d, p), o),
    remove: (p) => m.remove(m.ref(d, p)),
    get: (p) => Promise.race([
      m.get(m.ref(d, p)).then((s) => s.val()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Database did not respond. Check the databaseURL in config.js and the Rules tab in Firebase.')), 10000)),
    ]),
    onValue: (p, cb) => m.onValue(m.ref(d, p), (s) => cb(s.val())),
  };
}

export const db = isDemo ? await localImpl() : await firebaseImpl();
window.__quizReady = true;

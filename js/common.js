export const $ = (s, r = document) => r.querySelector(s);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const OPTIONS = [
  { shape: '▲', cls: 'o0' },
  { shape: '◆', cls: 'o1' },
  { shape: '●', cls: 'o2' },
  { shape: '■', cls: 'o3' },
];

// 1000 points for an instant correct answer, falling linearly to 500 at the buzzer.
export function scorePoints(ms, limitMs) {
  const f = Math.min(1, Math.max(0, ms / limitMs));
  return Math.round(1000 * (1 - f / 2));
}

// Sorted leaderboard with ties sharing a rank.
export function ranked(players) {
  const arr = Object.entries(players || {})
    .map(([id, p]) => ({ id, ...p, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
  let r = 0, prev = null;
  arr.forEach((p, i) => { if (p.score !== prev) { r = i + 1; prev = p.score; } p.rank = r; });
  return arr;
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const DEFAULT_QUIZ = {
  title: 'Sample Quiz',
  questions: [
    { text: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correct: 1, time: 15 },
    { text: 'What is 12 × 12?', options: ['124', '132', '144', '154'], correct: 2, time: 15 },
    { text: 'Which of these is the largest ocean?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3, time: 15 },
    { text: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], correct: 1, time: 10 },
    { text: 'Which country is home to the city of Toronto?', options: ['Canada', 'USA', 'UK', 'Australia'], correct: 0, time: 10 },
  ],
};

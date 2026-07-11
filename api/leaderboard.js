/**
 * /api/leaderboard - Tableau des scores « Les Voyageurs de l'été »
 * Lit le CSV PUBLIÉ de l'onglet `etats` du Google Sheet (aucune modification
 * de Code.gs), calcule le barème côté serveur, et ne renvoie au client que
 * pseudo + score + tampons + thèmes (jamais les codes passeport).
 *
 * Variables Vercel requises :
 *  - LEADERBOARD_KEY      : clé d'accès (vérifiée ici, passée en ?k=)
 *  - SHEET_ETATS_CSV_URL  : URL « Publier sur le web » de l'onglet etats, format CSV
 *
 * Barème : défi validé = niveau × 10 (+20 si défi final ★) · thème complété = +30.
 * Égalité départagée par l'ancienneté de la dernière mise à jour (premier arrivé).
 */

const fs = require('fs');
const path = require('path');

// --- Parseur CSV durci (BOM + point-virgule Excel), identique à chat.js ---
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const headLine = text.slice(0, text.indexOf('\n') > -1 ? text.indexOf('\n') : text.length);
  const DELIM = headLine.split(';').length > headLine.split(',').length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === DELIM) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((c) => c !== '')) rows.push(row); }
  const head = rows.shift() || [];
  return rows.map((r) => Object.fromEntries(head.map((k, i) => [k.trim(), r[i] || ''])));
}

// --- Référentiel des défis : lu depuis le repo (source de vérité du barème) ---
let DEFIS = null;
function loadDefis() {
  if (DEFIS) return DEFIS;
  const byId = {}; const themes = {};
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'content', 'defis.csv'), 'utf8');
    for (const r of parseCSV(raw)) {
      if (!r.id) continue;
      const niveau = parseInt(r.niveau, 10) || 1;
      byId[r.id] = { niveau, final: r.final === '1' };
      (themes[niveau] = themes[niveau] || []).push(r.id);
    }
  } catch (e) {
    console.warn('[leaderboard] defis.csv illisible :', e.message);
  }
  DEFIS = { byId, themes };
  return DEFIS;
}

function computePlayer(stateJson, maj) {
  let st;
  try { st = JSON.parse(stateJson); } catch (e) { return null; }
  if (!st || typeof st !== 'object') return null;
  const { byId, themes } = loadDefis();
  const done = Array.isArray(st.done) ? st.done.filter((id) => byId[id]) : [];
  if (!done.length) return null;
  let score = 0;
  for (const id of done) {
    score += byId[id].niveau * 10;
    if (byId[id].final) score += 20;
  }
  const themesDone = [];
  for (const [niveau, ids] of Object.entries(themes)) {
    if (ids.length && ids.every((id) => done.includes(id))) {
      score += 30;
      themesDone.push(parseInt(niveau, 10));
    }
  }
  const name = String(st.name || 'Voyageur').slice(0, 24);
  const ts = Date.parse(maj) || 0;
  return { name, score, stamps: done.length, themes: themesDone.sort(), ts };
}

// --- Cache mémoire : une lecture du Sheet publié par minute maximum ---
let cache = { t: 0, body: null };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET uniquement' });

  const key = process.env.LEADERBOARD_KEY || '';
  let k = (req.query && req.query.k) || '';
  if (!k) {
    try { k = new URL(req.url, 'http://x').searchParams.get('k') || ''; } catch (e) {}
  }
  if (!key || k !== key) return res.status(401).json({ error: 'Clé invalide' });

  const src = process.env.SHEET_ETATS_CSV_URL || '';
  if (!src) return res.status(500).json({ error: 'SHEET_ETATS_CSV_URL non configurée' });

  if (cache.body && Date.now() - cache.t < 60_000) {
    return res.status(200).json(cache.body);
  }

  let raw;
  try {
    const r = await fetch(src, { redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    raw = await r.text();
  } catch (e) {
    console.error('[leaderboard] Sheet publié inaccessible :', e.message);
    if (cache.body) return res.status(200).json(cache.body); // on sert l'ancien plutôt que rien
    return res.status(502).json({ error: 'Sheet inaccessible' });
  }

  const rows = parseCSV(raw);
  const players = [];
  for (const r of rows) {
    const p = computePlayer(r.etat_json, r.maj);
    if (p) players.push(p);
  }
  players.sort((a, b) => (b.score - a.score) || (a.ts - b.ts));

  const { byId } = loadDefis();
  const body = {
    ok: true,
    generated: new Date().toISOString(),
    totalDefis: Object.keys(byId).length,
    totalPlayers: players.length,
    totalStamps: players.reduce((s, p) => s + p.stamps, 0),
    totalThemes: players.reduce((s, p) => s + p.themes.length, 0),
    players: players.slice(0, 100).map(({ name, score, stamps, themes }) => ({ name, score, stamps, themes })),
  };
  cache = { t: Date.now(), body };
  return res.status(200).json(body);
};

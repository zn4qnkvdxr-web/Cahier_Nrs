/**
 * /api/chat — Passerelle LLM du Cahier de vacances IA
 * Mistral en principal, bascule Gemini Flash sur erreur/quota.
 * Durcissement : clés côté serveur uniquement, system prompt épinglé,
 * plafond de longueur, rate-limiting par IP, contrôle d'origine.
 */

// --- Rate-limiting en mémoire (par instance serverless : filet de sécurité,
// pas une garantie absolue — suffisant pour tenir les tiers gratuits) ---
const hits = new Map(); // ip -> { day, dayCount, minTs, minCount }
const LIMIT_PER_DAY = 60;
const LIMIT_PER_MIN = 8;

function rateLimited(ip) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const h = hits.get(ip) || { day: today, dayCount: 0, minTs: now, minCount: 0 };
  if (h.day !== today) { h.day = today; h.dayCount = 0; }
  if (now - h.minTs > 60_000) { h.minTs = now; h.minCount = 0; }
  h.dayCount++; h.minCount++;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear(); // garde-fou mémoire
  return h.dayCount > LIMIT_PER_DAY || h.minCount > LIMIT_PER_MIN;
}

// --- System prompt épinglé côté serveur : le client ne peut pas le modifier ---
const SYSTEM_PROMPT = [
  "Tu es l'assistant pédagogique du « Cahier de vacances IA », un parcours d'été",
  "interne pour apprendre à utiliser l'IA (prompts, automatisation, agents).",
  "Réponds toujours en français, avec bienveillance et concision (300 mots max).",
  "Encourage l'itération : si le prompt de l'utilisateur est vague, réponds puis",
  "suggère une amélioration concrète de sa formulation.",
  "Reste dans le cadre pédagogique : décline poliment toute demande manifestement",
  "hors sujet, dangereuse ou inappropriée, et ramène vers l'exercice en cours.",
].join(' ');

const MAX_PROMPT_CHARS = 4000;

// --- Contexte pédagogique par défi : lu CÔTÉ SERVEUR depuis content/defis.csv.
// Le client n'envoie que l'id du défi — impossible d'injecter son propre contexte.
const fs = require('fs');
const path = require('path');
let DEFIS = null;
function loadDefis() {
  if (DEFIS) return DEFIS;
  DEFIS = {};
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'content', 'defis.csv'), 'utf8');
    const rows = parseCSV(raw);
    for (const r of rows) if (r.id) DEFIS[r.id] = r;
  } catch (e) {
    console.warn('[chat] defis.csv illisible, contexte générique :', e.message);
  }
  return DEFIS;
}
// Mini-parseur CSV (guillemets, virgules, retours ligne) — zéro dépendance
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, ''); // BOM Excel
  // Délimiteur auto : Excel FR exporte en point-virgule
  const headLine = text.slice(0, text.indexOf('\n') > -1 ? text.indexOf('\n') : text.length);
  const DELIM = headLine.split(';').length > headLine.split(',').length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === DELIM) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(c => c !== '')) rows.push(row); }
  const head = rows.shift() || [];
  return rows.map(r => Object.fromEntries(head.map((k, i) => [k.trim(), r[i] || ''])));
}
function buildSystemPrompt(capsuleId) {
  let sp = SYSTEM_PROMPT;
  const d = loadDefis()[capsuleId];
  if (d && d.contexte_ia) {
    sp += ' Cadre du défi en cours : ' + d.contexte_ia +
      ' Reste strictement dans ce cadre : décline poliment toute demande sans rapport' +
      ' (code pour un autre projet, mails professionnels hors sujet, questions politiques…)' +
      ' et ramène vers le défi.' +
      ' Philosophie human-in-the-loop : ne fais pas le défi à la place du voyageur —' +
      ' réponds à sa demande, puis critique constructivement son prompt et suggère' +
      ' une amélioration concrète. L\'humain pilote, l\'IA assiste.';
  }
  return sp;
}

module.exports = async (req, res) => {
  // --- CORS / origine ---
  const allowedList = (process.env.ALLOWED_ORIGIN || '')
    .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const origin = (req.headers.origin || '').replace(/\/+$/, '');
  if (allowedList.length && origin && !allowedList.includes(origin)) {
    return res.status(403).json({ error: 'Origine non autorisée' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin || allowedList[0] || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST uniquement' });

  // --- Rate-limiting ---
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnu';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Doucement ! Réessaie dans une minute.' });
  }

  // --- Validation de l'entrée ---
  const { prompt, capsule, provider } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt manquant' });
  }
  const userPrompt = prompt.slice(0, MAX_PROMPT_CHARS);
  const systemPrompt = buildSystemPrompt(String(capsule || '').slice(0, 30));

  // --- Mode duel : fournisseur imposé (liste blanche), sans bascule ---
  const requested = provider === 'mistral' || provider === 'gemini' ? provider : null;
  if (requested === 'mistral') {
    try {
      const text = await callMistral(userPrompt, systemPrompt);
      return res.status(200).json({ text, provider: 'mistral' });
    } catch (err) {
      console.warn('[chat] duel Mistral KO :', err.message);
      return res.status(502).json({ error: 'Mistral indisponible', provider: 'mistral' });
    }
  }
  if (requested === 'gemini') {
    try {
      const text = await callGemini(userPrompt, systemPrompt);
      return res.status(200).json({ text, provider: 'gemini' });
    } catch (err) {
      console.warn('[chat] duel Gemini KO :', err.message);
      return res.status(502).json({ error: 'Gemini indisponible', provider: 'gemini' });
    }
  }

  // --- 1er essai : Mistral ---
  try {
    const text = await callMistral(userPrompt, systemPrompt);
    return res.status(200).json({ text, provider: 'mistral' });
  } catch (err) {
    console.warn('[chat] MISTRAL KO → bascule Gemini :', err.message);
  }

  // --- Repli : Gemini Flash ---
  try {
    const text = await callGemini(userPrompt, systemPrompt);
    console.warn('[chat] réponse servie par GEMINI (fallback Mistral)');
    return res.status(200).json({ text, provider: 'gemini' });
  } catch (err) {
    console.error('[chat] Gemini aussi en échec :', err.message);
    return res.status(502).json({
      error: "L'assistant fait la sieste. Réessaie dans quelques minutes.",
    });
  }
};

async function callMistral(userPrompt, systemPrompt) {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY absente');
  // Modèle surchargeable sans toucher au code (symétrique à GEMINI_MODEL)
  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 600,
      temperature: 0.6,
    }),
  });
  if (!r.ok) {
    // Détail complet dans les logs Vercel (jamais renvoyé au client)
    const raw = (typeof r.text === 'function')
      ? await r.text().catch(() => 'corps illisible')
      : '';
    throw new Error(`Mistral HTTP ${r.status} - ${String(raw).slice(0, 300)}`);
  }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Réponse Mistral vide');
  return text;
}

async function callGemini(userPrompt, systemPrompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY absente');
  // Modèle actif (l'API Gemini retire les anciens : gemini-1.5/2.0-flash → 404)
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.6 },
    }),
  });
  if (!r.ok) {
    // Détail complet dans les logs Vercel (jamais renvoyé au client)
    const rawError = await r.text().catch(() => 'corps illisible');
    throw new Error(`Gemini HTTP ${r.status} - ${rawError.slice(0, 300)}`);
  }
  const data = await r.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  if (!text) throw new Error('Réponse Gemini vide');
  return text;
}

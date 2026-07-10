/**
 * /api/save — État & tracking du Cahier de vacances IA
 * Proxy sécurisé vers Google Apps Script (le Sheet est la seule base).
 * Le secret partagé Vercel ↔ Apps Script ne transite jamais côté client.
 *
 * Actions :
 *  - save  : { action:'save',  code, state }   → upsert de l'état par code
 *  - load  : { action:'load',  code }          → récupère l'état d'un code
 *  - track : { action:'track', code, event, detail, prenom, palier } → ligne d'événement
 */

const hits = new Map();
const LIMIT_PER_MIN = 20;

function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { ts: now, count: 0 };
  if (now - h.ts > 60_000) { h.ts = now; h.count = 0; }
  h.count++;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.count > LIMIT_PER_MIN;
}

const CODE_RE = /^ETE-[A-Z2-9]{5}$/;
const ACTIONS = new Set(['save', 'load', 'track']);

module.exports = async (req, res) => {
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

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnu';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Trop de requêtes' });

  const { action, code, state, event, detail, prenom, palier } = req.body || {};
  if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Action inconnue' });
  if ((action === 'save' || action === 'load') && !CODE_RE.test(code || '')) {
    return res.status(400).json({ error: 'Code invalide' });
  }

  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!scriptUrl || !secret) {
    return res.status(500).json({ error: 'Backend non configuré' });
  }

  // Assainissement : on ne relaie que des champs connus, tronqués.
  const payload = {
    secret,
    action,
    code: (code || '').slice(0, 12),
    prenom: String(prenom || '').slice(0, 40),
    palier: Number(palier) || 0,
    event: String(event || '').slice(0, 40),
    detail: String(detail || '').slice(0, 120),
    state: action === 'save' ? sanitizeState(state) : undefined,
  };

  try {
    const r = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow', // Apps Script répond via une redirection 302
    });
    const data = await r.json().catch(() => ({}));
    return res.status(200).json(data);
  } catch (err) {
    console.error('[save] Apps Script injoignable :', err.message);
    return res.status(502).json({ error: 'Sauvegarde momentanément indisponible' });
  }
};

function sanitizeState(s) {
  if (!s || typeof s !== 'object') return {};
  return {
    name: String(s.name || '').slice(0, 40),
    palier: Math.min(4, Math.max(1, Number(s.palier) || 1)),
    done: Array.isArray(s.done) ? s.done.slice(0, 60).map((x) => String(x).slice(0, 30)) : [],
  };
}

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
  "Réponds toujours en français, avec bienveillance. Donne des réponses complètes, riches et détaillées : 400 mots maximum.",
  "Gère ton budget de rédaction pour conclure proprement ton propos : ne laisse jamais de phrase incomplète, suspendue ou coupée en plein milieu.",
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
// --- Prompts externalisés : /api/prompts/*.md (contribution sans contraintes CSV) ---
const fsp = fs.promises;
const PROMPT_DIR = path.join(process.cwd(), 'api', 'prompts'); // process.cwd() : fiable en serverless
const FILE_RE = /^[a-z0-9_-]+\.md$/i;                          // whitelist anti-traversée de chemin
const promptCache = new Map();                                  // instances chaudes : zéro relecture
async function loadPromptFile(name) {
  name = String(name || '').trim();
  if (!FILE_RE.test(name)) return '';
  if (promptCache.has(name)) return promptCache.get(name);
  let txt = '';
  try {
    txt = (await fsp.readFile(path.join(PROMPT_DIR, name), 'utf8')).trim();
  } catch (e) {
    // Faute de frappe dans le CSV : on logue clair, on ne crashe JAMAIS
    console.error('[chat] fichier prompt introuvable :', name, '-', e.message);
  }
  promptCache.set(name, txt);
  return txt;
}
/* Sections d'un fichier prompt : "# CRITÈRES DU JUGE" est extrait et
   JAMAIS injecté en discussion (critères secrets, leur fuite tuerait le jeu). */
function splitJudge(md) {
  const re = /^#\s*CRIT[EÈ]RES?\s+DU\s+JUGE[^\n]*$/im;
  const m = md.match(re);
  if (!m) return { ctx: md.trim(), judge: '' };
  const start = m.index;
  const after = md.slice(start + m[0].length);
  const next = after.search(/^#\s+/m);
  const judge = (next === -1 ? after : after.slice(0, next)).trim();
  const ctx = (md.slice(0, start) + (next === -1 ? '' : after.slice(next))).trim();
  return { ctx, judge };
}
async function loadJudge(capsuleId) {
  const d = loadDefis()[capsuleId];
  if (!d || d.mode !== 'prompt-juge') return '';   // audit réservé au type dédié
  const ref = parseContexteRef(d.contexte_ia);
  if (ref.kind !== 'files' || ref.b) return '';    // Juge : mono-fichier .md
  const raw = await loadPromptFile(ref.a);
  return splitJudge(raw).judge;
}

/* contexte_ia : "fichier.md" (prompt) · "a.md;b.md" (duel, IA1;IA2)
   · toute autre valeur = prose héritée (rétro-compatibilité totale). */
function parseContexteRef(raw) {
  const v = String(raw || '').trim();
  if (!v) return { kind: 'none' };
  const parts = v.split(';').map((p) => p.trim()).filter(Boolean);
  if (parts.length && parts.every((p) => FILE_RE.test(p))) {
    return parts.length >= 2 ? { kind: 'files', a: parts[0], b: parts[1] } : { kind: 'files', a: parts[0] };
  }
  return { kind: 'inline', text: v };
}
async function resolveContexte(d, provider) {
  const ref = parseContexteRef(d && d.contexte_ia);
  if (ref.kind === 'none') return '';
  if (ref.kind === 'inline') return ref.text;
  if (ref.b) {
    // Duel : chaque IA a son propre system prompt (1er fichier → Mistral, 2e → Gemini)
    return await loadPromptFile(provider === 'gemini' ? ref.b : ref.a);
  }
  return splitJudge(await loadPromptFile(ref.a)).ctx;
}

async function buildSystemPrompt(capsuleId, provider) {
  const dEnq = loadDefis()[capsuleId];
  if (dEnq && dEnq.mode === 'enquete') {
    /* Mode enquête : l'IA joue un personnage ; le cadrage pédagogique
       classique (critique de prompt) est remplacé par la posture de jeu. */
    let sp = "Tu joues un personnage dans un mini-jeu d'enquête pédagogique interne" +
      " (apprentissage de l'esprit critique face à l'IA). Réponds en français," +
      " 400 mots maximum, reste strictement dans ton personnage et ton scénario," +
      " sans jamais produire de contenu inapproprié, et décline poliment tout" +
      " sujet étranger au scénario. " + (await resolveContexte(dEnq, provider));
    if (dEnq.jeton) {
      sp += " Règle impérative : uniquement au moment précis où tu reconnais" +
        " explicitement ta faille (jamais avant, jamais par simple complaisance" +
        " ou insistance sans argument), termine ta réponse par exactement cette" +
        " chaîne : " + dEnq.jeton;
    }
    return sp;
  }
  let sp = SYSTEM_PROMPT;
  const d = loadDefis()[capsuleId];
  const ctx = d ? await resolveContexte(d, provider) : '';
  if (ctx) {
    sp += ' Cadre du défi en cours : ' + ctx +
      ' Reste strictement dans ce cadre : décline poliment toute demande sans rapport' +
      ' (code pour un autre projet, mails professionnels hors sujet, questions politiques…)' +
      ' et ramène vers le défi.';
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

  // --- Validation de l'entrée : prompt seul (classique) OU historique (enquête) ---
  const { prompt, capsule, provider, history } = req.body || {};
  const capsuleKey = String(capsule || '').slice(0, 30);
  let messages = null; // multi-tours : [{role:'user'|'assistant', content}]
  if (Array.isArray(history)) {
    messages = history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_PROMPT_CHARS) }))
      .slice(-12); // plafond : les 12 derniers échanges suffisent au jeu
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Historique invalide' });
    }
  } else if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt manquant' });
  }
  // --- Le Juge : audit du dernier prompt de l'utilisateur, critères lus du .md ---
  if ((req.body || {}).action === 'validate') {
    if (!messages) return res.status(400).json({ error: 'Historique requis' });
    const judge = await loadJudge(capsuleKey);
    if (!judge) {
      console.error('[chat] validate sans CRITÈRES DU JUGE :', capsuleKey);
      return res.status(200).json({ text: "Audit indisponible - défi validé d'office.", win: true, provider: 'aucun' });
    }
    const judgeSystem =
      "Tu es le Juge bienveillant d'un exercice d'art du prompting : ton rôle est de " +
      "faire progresser le joueur, pas de le piéger. Voici les critères de validation " +
      "définis par l'équipe pédagogique :\n" + judge + "\n\n" +
      "Analyse UNIQUEMENT le DERNIER message de l'utilisateur (son prompt le plus récent), " +
      "en t'aidant du fil pour le contexte. Sois indulgent sur la forme : un critère compte " +
      "comme rempli dès qu'il est présent, même implicitement (peu importe la formulation exacte).\n\n" +
      "FORMAT DE RÉPONSE OBLIGATOIRE — ta réponse DOIT commencer par l'un de ces deux marqueurs, " +
      "écrit exactement ainsi, majuscules et crochets compris, SANS aucun texte avant :\n" +
      "[APPROUVE] si TOUS les critères sont réunis.\n" +
      "[REJETE] s'il en manque au moins un.\n\n" +
      "Après le marqueur, en français, 60 mots maximum, ton chaleureux et encourageant :\n" +
      "- Si [APPROUVE] : félicite précisément en nommant les bons éléments que le joueur a fournis " +
      "(ex : « ton timing 14h-18h et ton budget serré donnent des rails parfaits »).\n" +
      "- Si [REJETE] : commence par saluer ce qui est déjà bien, PUIS nomme précisément le ou les " +
      "ingrédient(s) manquant(s) et donne un indice concret pour les ajouter, SANS jamais rédiger " +
      "le prompt à sa place (ex : « Bon départ avec le lieu ! Il te manque une contrainte de temps : " +
      "essaie de préciser une plage horaire »). Reste motivant, jamais sec.";
    let verdict = '';
    let vProv = 'mistral';
    try { verdict = await callMistral('', judgeSystem, messages); }
    catch (e1) {
      console.warn('[chat] Juge MISTRAL KO → bascule Gemini :', e1.message);
      try { verdict = await callGemini('', judgeSystem, messages); vProv = 'gemini'; }
      catch (e2) {
        console.error('[chat] Juge indisponible (2 moteurs KO) :', e2.message);
        // 200 + judgeError : le front affiche CE message (pas son secours générique)
        // et laisse le joueur retenter sans le pénaliser.
        return res.status(200).json({
          judgeError: true, win: false,
          text: "L'auditeur reprend son souffle 😅 Ta tentative est bien enregistrée — clique de nouveau sur Valider dans un instant."
        });
      }
    }
    // Parsing du verdict — priorité au marqueur ENTRE CROCHETS (le format imposé),
    // ce qui évite les faux positifs : une phrase comme « je ne peux pas approuver »
    // ne doit JAMAIS valider. Tolère accents (APPROUVÉ/REJETÉ), casse et espaces.
    const raw = String(verdict).trim();
    const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // sans accents
    const clean = (t) => t
      .replace(/\*+/g, '')                      // retire le gras Markdown (**)
      .replace(/^["'«»\s:.\-,\]]+/, '')        // ponctuation/guillemets de tête
      .trim();
    // 1) Cas nominal : marqueur explicitement encadré [APPROUVE] / [REJETE]
    const bracket = norm.match(/\[\s*(APPROUVE|REJETE)\s*\]/i);
    let win, text;
    if (bracket) {
      win = /APPROUVE/i.test(bracket[1]);
      const idx = norm.indexOf(bracket[0]);
      text = clean(raw.slice(0, idx) + raw.slice(idx + bracket[0].length));
    } else {
      // 2) Repli : le LLM a oublié les crochets. On n'accepte alors le marqueur
      //    QUE s'il est en tête de réponse (ancré) — jamais au milieu d'une phrase,
      //    pour ne pas confondre un « approuver » incident avec une validation.
      const lead = norm.match(/^\s*(APPROUVE|REJETE)\b/i);
      if (lead) {
        win = /APPROUVE/i.test(lead[1]);
        text = clean(raw.slice(lead[0].length));
      } else {
        // 3) Aucun marqueur exploitable : verdict RÉEL mais indécis (pas une panne).
        //    Rejet doux et instructif — on ne valide jamais par défaut.
        console.warn('[chat] Juge : verdict sans marqueur clair, rejet doux. Début:', raw.slice(0, 80));
        win = false;
        text = raw.length > 12
          ? clean(raw)
          : "Presque ! Reprends ton prompt et vérifie qu'il précise bien chaque élément attendu, puis retente.";
      }
    }
    return res.status(200).json({ text, win, provider: vProv, verdict: true });
  }

  const userPrompt = messages ? '' : prompt.slice(0, MAX_PROMPT_CHARS);
  const requested = provider === 'mistral' || provider === 'gemini' ? provider : null;
  let systemPrompt = await buildSystemPrompt(capsuleKey, requested || undefined);
  if (messages) {
    const rounds = messages.filter((m) => m.role === 'user').length;
    systemPrompt += ' (Échange n°' + rounds + '.)';
  }
  // Jeton secret : détecté et RETIRÉ côté serveur (le joueur ne le voit jamais)
  const finish = (text, prov) => {
    let win = false;
    const dd = loadDefis()[capsuleKey];
    if (messages && dd && dd.jeton && text.includes(dd.jeton)) {
      win = true;
      text = text.split(dd.jeton).join('').trim();
    }
    return res.status(200).json(win ? { text, provider: prov, win: true } : { text, provider: prov });
  };

  // --- Mode duel : fournisseur imposé (liste blanche), sans bascule,
  //     chacun avec SON system prompt (résolu ci-dessus selon le fournisseur) ---
  if (requested === 'mistral') {
    try {
      const text = await callMistral(userPrompt, systemPrompt, messages);
      return res.status(200).json({ text, provider: 'mistral' });
    } catch (err) {
      console.warn('[chat] duel Mistral KO :', err.message);
      return res.status(502).json({ error: 'Mistral indisponible', provider: 'mistral' });
    }
  }
  if (requested === 'gemini') {
    try {
      const text = await callGemini(userPrompt, systemPrompt, messages);
      return res.status(200).json({ text, provider: 'gemini' });
    } catch (err) {
      console.warn('[chat] duel Gemini KO :', err.message);
      return res.status(502).json({ error: 'Gemini indisponible', provider: 'gemini' });
    }
  }

  // --- 1er essai : Mistral ---
  try {
    const text = await callMistral(userPrompt, systemPrompt, messages);
    return finish(text, 'mistral');
  } catch (err) {
    console.warn('[chat] MISTRAL KO → bascule Gemini :', err.message);
  }

  // --- Repli : Gemini Flash ---
  try {
    const text = await callGemini(userPrompt, systemPrompt, messages);
    console.warn('[chat] réponse servie par GEMINI (fallback Mistral)');
    return finish(text, 'gemini');
  } catch (err) {
    console.error('[chat] Gemini aussi en échec :', err.message);
    return res.status(502).json({
      error: "L'assistant fait la sieste. Réessaie dans quelques minutes.",
    });
  }
};

// Garde-fou de longueur : filet de sécurité si une IA dépasse malgré la consigne.
// Coupe proprement à la fin de la dernière phrase complète sous la limite (jamais
// au milieu d'un mot), et n'ajoute « … » que si on a réellement tronqué.
const MAX_REPLY_CHARS = 2800;
function capLength(text) {
  let t = String(text || '').trim();
  
  // Si le texte est trop long, on coupe d'abord à la limite stricte
  if (t.length > MAX_REPLY_CHARS) {
    t = t.slice(0, MAX_REPLY_CHARS);
  } else if (/[.!?…]$/.test(t)) {
    // Si le texte est sous la limite ET se termine par une vraie ponctuation, on le renvoie tel quel
    return t;
  }

  // Ici, le texte est soit trop long, soit coupé au milieu d'une phrase par l'API.
  // On cherche la dernière ponctuation forte (. ! ? …) pour finir proprement.
  const m = t.match(/[\s\S]*[.!?…]/);
  let out = m ? m[0] : t.slice(0, t.lastIndexOf(' ') > 0 ? t.lastIndexOf(' ') : t.length);
  out = out.trim();
  
  // Si on n'a pas pu finir sur une ponctuation propre, on ajoute des points de suspension
  if (!/[.!?…]$/.test(out)) out += ' …';
  return out;
}

async function callMistral(userPrompt, systemPrompt, historyMsgs) {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY absente');
  // Modèle surchargeable sans toucher au code (symétrique à GEMINI_MODEL)
  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }].concat(
        historyMsgs || [{ role: 'user', content: userPrompt }]
      ),
      max_tokens: 1000,
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
  const text = capLength(data?.choices?.[0]?.message?.content);
  if (!text) throw new Error('Réponse Mistral vide');
  return text;
}

async function callGemini(userPrompt, systemPrompt, historyMsgs) {
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
      contents: (historyMsgs || [{ role: 'user', content: userPrompt }]).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      // Gemini 2.5 Flash : la réflexion interne ("thinking") est active par défaut
      // et ses tokens sont décomptés de maxOutputTokens → réponses coupées alors
      // que le texte visible est court. On la désactive (budget 0) : les 700
      // tokens vont intégralement à la réponse visible. Garde STRICTE : champ
      // envoyé uniquement aux modèles 2.5-flash* (qui l'acceptent) ; 2.5-pro le
      // refuse, et tout autre modèle surchargé via GEMINI_MODEL reste intact.
      generationConfig: Object.assign(
        { maxOutputTokens: 1000, temperature: 0.6 },
        model.includes('2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}
      ),
    }),
  });
  if (!r.ok) {
    // Détail complet dans les logs Vercel (jamais renvoyé au client)
    const rawError = await r.text().catch(() => 'corps illisible');
    throw new Error(`Gemini HTTP ${r.status} - ${rawError.slice(0, 300)}`);
  }
  const data = await r.json();
  const textRaw = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  const text = capLength(textRaw);
  if (!text) throw new Error('Réponse Gemini vide');
  return text;
}

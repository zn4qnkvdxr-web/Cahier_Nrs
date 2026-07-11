/**
 * Cahier de vacances IA — Tests de bout en bout (sans framework, sans réseau)
 * Lancer depuis la racine du projet :  node test/e2e.test.js
 *
 * Les appels LLM et Apps Script sont simulés (global.fetch mocké) pour rejouer :
 * nominal, quota Mistral 429 → bascule Gemini, double panne, duel avec
 * fournisseur imposé, rate-limiting, injection de contexte, sanitization.
 */
const assert = require('assert');

let PASS = 0, FAIL = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { PASS++; console.log('  ✓', name); })
    .catch((e) => { FAIL++; console.error('  ✗', name, '—', e.message); });
}

// --- Mocks HTTP ---
function makeRes() {
  const r = { code: 200, body: null, headers: {}, ended: false };
  return {
    status(c) { r.code = c; return this; },
    json(b) { r.body = b; return this; },
    setHeader(k, v) { r.headers[k] = v; },
    end() { r.ended = true; return this; },
    _: r,
  };
}
function makeReq({ method = 'POST', body = {}, ip = '1.1.1.1', origin } = {}) {
  const headers = { 'x-forwarded-for': ip };
  if (origin) headers.origin = origin;
  return { method, headers, body };
}

// --- Faux LLM / Apps Script pilotables ---
const NET = { mistral: 'ok', gemini: 'ok', captured: [] };
global.fetch = async (url, opts = {}) => {
  NET.captured.push({ url: String(url), opts });
  const jr = (status, obj) => ({ ok: status < 400, status, json: async () => obj });
  if (String(url).includes('api.mistral.ai')) {
    if (NET.mistral === '429') return jr(429, {});
    if (NET.mistral === 'down') throw new Error('ECONNREFUSED');
    if (NET.mistral === 'approve') return jr(200, { choices: [{ message: { content: '[APPROUVE] Excellentes contraintes : timing, style et budget sont posés.' } }] });
    if (NET.mistral === 'reject')  return jr(200, { choices: [{ message: { content: '[REJETE] Il manque une notion de budget ou de transport.' } }] });
    return jr(200, { choices: [{ message: { content: 'Réponse Mistral simulée' } }] });
  }
  if (String(url).includes('generativelanguage.googleapis.com')) {
    if (NET.gemini === '429') return jr(429, {});
    if (NET.gemini === 'down') throw new Error('ECONNREFUSED');
    return jr(200, { candidates: [{ content: { parts: [{ text: 'Réponse Gemini simulée' }] } }] });
  }
  if (String(url).includes('script.example')) {
    const payload = JSON.parse(opts.body);
    if (payload.action === 'load') return jr(200, { ok: true, state: { name: 'Tarik', palier: 3, done: ['bcn1'] } });
    return jr(200, { ok: true });
  }
  throw new Error('URL inattendue : ' + url);
};

process.env.MISTRAL_API_KEY = 'test-mistral';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.APPS_SCRIPT_URL = 'https://script.example/exec';
process.env.APPS_SCRIPT_SECRET = 's3cret-test';
delete process.env.ALLOWED_ORIGIN;

const chat = require('../api/chat.js');
const save = require('../api/save.js');
const lb = require('../api/leaderboard.js');
const fs = require('fs');

(async () => {
  console.log('\n■ /api/chat — passerelle LLM');

  await t('nominal : Mistral répond', async () => {
    NET.mistral = 'ok';
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'Bonjour', capsule: 'bcn1' }, ip: '10.0.0.1' }), res);
    assert.equal(res._.code, 200);
    assert.equal(res._.body.provider, 'mistral');
    assert.match(res._.body.text, /Mistral/);
  });

  await t('quota Mistral 429 → bascule Gemini transparente', async () => {
    NET.mistral = '429';
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'Bonjour', capsule: 'bcn1' }, ip: '10.0.0.2' }), res);
    assert.equal(res._.code, 200);
    assert.equal(res._.body.provider, 'gemini');
  });

  await t('Mistral injoignable (réseau) → bascule Gemini', async () => {
    NET.mistral = 'down';
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'Bonjour' }, ip: '10.0.0.3' }), res);
    assert.equal(res._.body.provider, 'gemini');
  });

  await t('double panne → 502 avec message doux', async () => {
    NET.mistral = 'down'; NET.gemini = 'down';
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'Bonjour' }, ip: '10.0.0.4' }), res);
    assert.equal(res._.code, 502);
    assert.match(res._.body.error, /sieste/);
    NET.mistral = 'ok'; NET.gemini = 'ok';
  });

  await t('duel : provider=gemini imposé, sans bascule', async () => {
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'Duel', capsule: 'duel1', provider: 'gemini' }, ip: '10.0.0.5' }), res);
    assert.equal(res._.body.provider, 'gemini');
  });

  await t('duel : provider=mistral en panne → 502 (pas de bascule cachée)', async () => {
    NET.mistral = '429';
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'Duel', capsule: 'duel1', provider: 'mistral' }, ip: '10.0.0.6' }), res);
    assert.equal(res._.code, 502);
    assert.equal(res._.body.provider, 'mistral');
    NET.mistral = 'ok';
  });

  await t('provider inconnu → ignoré, bascule automatique normale', async () => {
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'X', provider: 'evil-llm' }, ip: '10.0.0.7' }), res);
    assert.equal(res._.code, 200);
    assert.equal(res._.body.provider, 'mistral');
  });

  await t('contexte_ia injecté côté serveur (capsule connue)', async () => {
    NET.captured.length = 0;
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'Y', capsule: 'duel1' }, ip: '10.0.0.8' }), res);
    const sent = JSON.parse(NET.captured[0].opts.body);
    assert.match(sent.messages[0].content, /Cadre du défi en cours/);
    assert.match(sent.messages[0].content, /human-in-the-loop/);
  });

  await t('capsule inconnue → system prompt générique (pas d\'injection)', async () => {
    NET.captured.length = 0;
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'Y', capsule: 'zzz-inexistant' }, ip: '10.0.0.9' }), res);
    const sent = JSON.parse(NET.captured[0].opts.body);
    assert.doesNotMatch(sent.messages[0].content, /Cadre du défi en cours/);
  });

  await t('prompt > 4000 caractères → tronqué avant envoi au LLM', async () => {
    NET.captured.length = 0;
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'a'.repeat(9000) }, ip: '10.0.0.10' }), res);
    const sent = JSON.parse(NET.captured[0].opts.body);
    assert.equal(sent.messages[1].content.length, 4000);
  });

  await t('rate-limiting : 9e appel dans la minute → 429', async () => {
    let last;
    for (let i = 0; i < 9; i++) {
      last = makeRes();
      await chat(makeReq({ body: { prompt: 'spam' }, ip: '66.6.6.6' }), last);
    }
    assert.equal(last._.code, 429);
  });

  await t('origine : slash final toléré + liste multiple acceptée', async () => {
    process.env.ALLOWED_ORIGIN = 'https://cahier.vercel.app/, https://preview.vercel.app';
    const r1 = makeRes();
    await chat(makeReq({ body: { prompt: 'X' }, ip: '10.0.0.21', origin: 'https://cahier.vercel.app' }), r1);
    assert.equal(r1._.code, 200);
    const r2 = makeRes();
    await chat(makeReq({ body: { prompt: 'X' }, ip: '10.0.0.22', origin: 'https://preview.vercel.app/' }), r2);
    assert.equal(r2._.code, 200);
    delete process.env.ALLOWED_ORIGIN;
  });

  await t('origine interdite → 403 quand ALLOWED_ORIGIN est posée', async () => {
    process.env.ALLOWED_ORIGIN = 'https://cahier.vercel.app';
    const res = makeRes();
    await chat(makeReq({ body: { prompt: 'X' }, ip: '10.0.0.11', origin: 'https://evil.example' }), res);
    assert.equal(res._.code, 403);
    delete process.env.ALLOWED_ORIGIN;
  });

  await t('méthode GET → 405 · prompt vide → 400 · OPTIONS → 204', async () => {
    const r1 = makeRes();
    await chat(makeReq({ method: 'GET', ip: '10.0.0.12' }), r1);
    assert.equal(r1._.code, 405);
    const r2 = makeRes();
    await chat(makeReq({ body: { prompt: '   ' }, ip: '10.0.0.13' }), r2);
    assert.equal(r2._.code, 400);
    const r3 = makeRes();
    await chat(makeReq({ method: 'OPTIONS', ip: '10.0.0.14' }), r3);
    assert.equal(r3._.code, 204);
  });

  console.log('\n■ /api/save — états & tracking via Sheet');

  await t('save : payload assaini (nom 40 c., palier ≤ 4, done ≤ 60) + secret joint', async () => {
    NET.captured.length = 0;
    const res = makeRes();
    await save(makeReq({
      body: { action: 'save', code: 'ETE-AB2CD', state: { name: 'x'.repeat(200), palier: 99, done: Array(100).fill('bcn1') } },
      ip: '20.0.0.1',
    }), res);
    assert.equal(res._.code, 200);
    const sent = JSON.parse(NET.captured[0].opts.body);
    assert.equal(sent.secret, 's3cret-test');
    assert.equal(sent.state.name.length, 40);
    assert.equal(sent.state.palier, 4);
    assert.equal(sent.state.done.length, 60);
  });

  await t('load : renvoie l\'état du code', async () => {
    const res = makeRes();
    await save(makeReq({ body: { action: 'load', code: 'ETE-AB2CD' }, ip: '20.0.0.2' }), res);
    assert.equal(res._.body.ok, true);
    assert.equal(res._.body.state.name, 'Tarik');
  });

  await t('code malformé → 400 (jamais relayé au Sheet)', async () => {
    NET.captured.length = 0;
    const res = makeRes();
    await save(makeReq({ body: { action: 'load', code: 'HACK' }, ip: '20.0.0.3' }), res);
    assert.equal(res._.code, 400);
    assert.equal(NET.captured.length, 0);
  });

  await t('action inconnue → 400', async () => {
    const res = makeRes();
    await save(makeReq({ body: { action: 'dump_all' }, ip: '20.0.0.4' }), res);
    assert.equal(res._.code, 400);
  });

  await t('track : champs tronqués (event 40, detail 120)', async () => {
    NET.captured.length = 0;
    const res = makeRes();
    await save(makeReq({
      body: { action: 'track', code: 'ETE-AB2CD', event: 'e'.repeat(300), detail: 'd'.repeat(300), prenom: 'Tarik', palier: 2 },
      ip: '20.0.0.5',
    }), res);
    const sent = JSON.parse(NET.captured[0].opts.body);
    assert.equal(sent.event.length, 40);
    assert.equal(sent.detail.length, 120);
  });

  await t('rate-limiting save : 21e appel dans la minute → 429', async () => {
    let last;
    for (let i = 0; i < 21; i++) {
      last = makeRes();
      await save(makeReq({ body: { action: 'load', code: 'ETE-AB2CD' }, ip: '77.7.7.7' }), last);
    }
    assert.equal(last._.code, 429);
  });

  console.log('\n■ Front — fonctions pures & contenu');

  await t('genCode : format ETE-XXXXX, alphabet sans ambiguïté (200 tirages)', async () => {
    const h = fs.readFileSync('index.html', 'utf8');
    const src = h.slice(h.indexOf('function genCode'), h.indexOf('\n', h.indexOf('function genCode')));
    eval(src);
    for (let i = 0; i < 200; i++) assert.match(genCode(), /^ETE-[A-HJ-NP-Z2-9]{5}$/);
  });

  /* ─── /api/leaderboard : clé + barème ─── */
  await t('leaderboard : 401 sans clé valide', async () => {
    process.env.LEADERBOARD_KEY = 'SECRETK';
    const r = makeRes();
    await lb({ method: 'GET', url: '/api/leaderboard?k=BAD', query: { k: 'BAD' }, headers: {} }, r);
    assert.equal(r._.code, 401);
    delete process.env.LEADERBOARD_KEY;
  });

  await t('leaderboard : barème (niveau×10, +20 final, +30 thème), tri, zéro code exposé', async () => {
    process.env.LEADERBOARD_KEY = 'SECRETK';
    process.env.SHEET_ETATS_CSV_URL = 'http://sheet.local/etats.csv';
    const oldFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (String(url).includes('sheet.local')) return { ok: true, status: 200, text: async () =>
        'code,etat_json,maj\n' +
        '"ETE-AAAAA","{""name"":""Léa"",""done"":[""bcn1"",""qcm1""]}","2026-07-01 10:00:00"\n' +
        '"ETE-BBBBB","{""name"":""Sam"",""done"":[""agence""]}","2026-07-02 10:00:00"\n' };
      return oldFetch(url, opts);
    };
    try {
      const r = makeRes();
      await lb({ method: 'GET', url: '/api/leaderboard?k=SECRETK', query: { k: 'SECRETK' }, headers: {} }, r);
      assert.equal(r._.code, 200);
      const b = r._.body;
      assert.equal(b.players[0].name, 'Sam');   // agence : 40 + 20 (final) + 30 (thème) = 90
      assert.equal(b.players[0].score, 90);
      assert.equal(b.players[1].score, 20);     // 2 défis de niveau 1
      assert.equal(b.totalDefis, 24);
      assert.ok(!JSON.stringify(b).includes('ETE-'), 'codes jamais exposés');
    } finally {
      global.fetch = oldFetch;
      delete process.env.SHEET_ETATS_CSV_URL;
      delete process.env.LEADERBOARD_KEY;
    }
  });

  await t('prompts externalisés : défi migré (.md) servi, duel = 2 fournisseurs OK', async () => {
    const fs2 = require('fs');
    assert.ok(fs2.existsSync('api/prompts/duel1_a.md') && fs2.existsSync('api/prompts/duel1_b.md'), 'fichiers duel');
    for (const prov of ['mistral', 'gemini']) {
      const r = makeRes();
      await chat(makeReq({ body: { prompt: 'Test', capsule: 'duel1', provider: prov }, ip: '10.0.9.' + (prov === 'gemini' ? 2 : 1) }), r);
      assert.equal(r._.code, 200);
      assert.equal(r._.body.provider, prov);
    }
    const srcC = fs2.readFileSync('api/chat.js', 'utf8');
    eval(srcC.slice(srcC.indexOf('function parseCSV'), srcC.indexOf('// --- Prompts externalisés')));
    const rows = parseCSV(fs2.readFileSync('content/defis.csv', 'utf8'));
    const d = rows.find((x) => x.id === 'duel1');
    assert.equal(d.contexte_ia, 'duel1_a.md;duel1_b.md');
    assert.equal(d.gagnant, 'a', 'duel départagé');
    const b1 = rows.find((x) => x.id === 'bcn1');
    assert.equal(b1.juge, '1', 'bcn1 jugé');
    assert.ok(fs2.readFileSync('api/prompts/bcn1.md', 'utf8').includes('CRITÈRES DU JUGE'));
    assert.ok(rows.filter((x) => /\.md$/.test(x.contexte_ia)).length >= 3, 'défis migrés en .md');
  });

  await t('prose héritée dans contexte_ia : toujours acceptée (rétro-compat)', async () => {
    // une cellule non-.md doit être traitée comme du texte, jamais comme un fichier
    const src = require('fs').readFileSync('api/chat.js', 'utf8');
    assert.ok(src.includes("kind: 'inline'"), 'branche inline présente');
    const r = makeRes();
    await chat(makeReq({ body: { prompt: 'Test', capsule: 'inconnu-xyz' }, ip: '10.0.9.3' }), r);
    assert.equal(r._.code, 200); // capsule inconnue → cadre générique, zéro crash
  });

  /* ─── Le Juge (action validate) ─── */
  await t('juge : [APPROUVE] → win:true, tag retiré du verdict', async () => {
    NET.mistral = 'approve';
    const r = makeRes();
    await chat(makeReq({ body: { action: 'validate', capsule: 'bcn1',
      history: [{ role: 'user', content: 'De 14h à 18h à Gràcia, culturel et insolite, à pied, petit budget.' }] },
      ip: '10.1.0.1' }), r);
    assert.equal(r._.code, 200);
    assert.equal(r._.body.win, true);
    assert.ok(!/\[?APPROUVE/i.test(r._.body.text), 'tag nettoyé');
    NET.mistral = 'ok';
  });

  await t('juge : [REJETE] → win:false + explication pédagogique', async () => {
    NET.mistral = 'reject';
    const r = makeRes();
    await chat(makeReq({ body: { action: 'validate', capsule: 'bcn1',
      history: [{ role: 'user', content: 'Un après-midi à Barcelone stp' }] },
      ip: '10.1.0.2' }), r);
    assert.equal(r._.code, 200);
    assert.equal(r._.body.win, false);
    assert.ok(r._.body.text.includes('budget'));
    NET.mistral = 'ok';
  });

  await t('juge : défi sans critères → validé d\'office, jamais de crash', async () => {
    const r = makeRes();
    await chat(makeReq({ body: { action: 'validate', capsule: 'bbq',
      history: [{ role: 'user', content: 'x' }] }, ip: '10.1.0.3' }), r);
    assert.equal(r._.code, 200);
    assert.equal(r._.body.win, true);
    assert.ok(r._.body.text.includes('Audit indisponible'));
  });

  await t('inkFor : encre par NIVEAU (vert/bleu/rouge/or), stable', async () => {
    const h = fs.readFileSync('index.html', 'utf8');
    const sC = h.indexOf('const CAPSULES = [');
    global.CAPSULES = eval('(' + h.slice(sC + 'const CAPSULES = '.length, h.indexOf('];', sC) + 1) + ')');
    const src = h.slice(h.indexOf('const INKS='), h.indexOf('function avatarInk'));
    eval(src);
    assert.equal(inkFor('bcn1'), inkFor('bbq'));        // même niveau 1 → même encre
    assert.equal(inkFor('bcn1'), '#5C8F26');            // niveau 1 = vert
    assert.equal(inkFor('duel1'), '#015F70');           // niveau 2 = bleu
    assert.equal(inkFor('bcn3'), '#C13515');            // niveau 3 = rouge
    assert.equal(inkFor('agence'), '#B8860B');          // niveau 4 = or
    assert.notEqual(inkFor('bcn1'), inkFor('agence'));  // niveaux ≠ encres ≠
  });

  await t('parseCSV serveur : BOM + point-virgule Excel tolérés', async () => {
    const src = fs.readFileSync('api/chat.js', 'utf8');
    const fn = src.slice(src.indexOf('function parseCSV'), src.indexOf('// --- Prompts externalisés'));
    eval(fn);
    const rows = parseCSV('\uFEFFid;titre\n"a";"Salut; toi"\n');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'a');
    assert.equal(rows[0].titre, 'Salut; toi');
  });

  await t('defis.csv : 24 défis, 4 niveaux couverts, duel complet', async () => {
    const src = fs.readFileSync('api/chat.js', 'utf8');
    const fn = src.slice(src.indexOf('function parseCSV'), src.indexOf('// --- Prompts externalisés'));
    eval(fn);
    const rows = parseCSV(fs.readFileSync('content/defis.csv', 'utf8'));
    assert.equal(rows.length, 24);
    assert.deepEqual([...new Set(rows.map(r => r.niveau))].sort(), ['1', '2', '3', '4']);
    const duel = rows.find(r => r.mode === 'duel');
    assert.ok(duel && duel.sim && duel.sim2 && duel.contexte_ia);
    const qcm = rows.find(r => r.mode === 'qcm');
    assert.ok(qcm && qcm.data.includes('*') && qcm.data.includes(';;'), 'qcm data');
    const pz = rows.find(r => r.mode === 'puzzle');
    assert.ok(pz && pz.data.split('|').length >= 4 && !pz.data.includes('*'), 'puzzle data');
    const rot = rows.find(r => r.mode === 'rotation');
    assert.ok(rot && rot.data.includes('|'), 'rotation data (image|motMystere)');
    const intr = rows.find(r => r.mode === 'intrus');
    assert.ok(intr && 'urls_visuels' in intr && 'index_intrus' in intr && 'legendes' in intr && !('legende_intrus' in intr), 'colonnes intrus simplifiées');
    const fin = rows.find(r => r.final === '1');
    assert.ok(fin && fin.id === 'agence' && fin.chrono === '30', 'défi final chronométré');
    assert.ok(rows.every(r => 'chrono' in r && 'final' in r), 'colonnes chrono/final');
    assert.ok(rows.every(r => r.objectif && r.duree));
  });

  console.log(`\n═══ Résultat : ${PASS} passés, ${FAIL} échoués ═══\n`);
  process.exit(FAIL ? 1 : 0);
})();

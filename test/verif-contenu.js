#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   VALIDATEUR DE CONTRIBUTION — Cahier de vacances IA
   Usage : node test/verif-contenu.js   (ou : npm run verifier)

   À lancer AVANT chaque publication de contenu. Il vérifie defis.csv et
   ressources.csv avec les MÊMES règles que le moteur (parseur identique à
   celui du serveur), et sort un rapport lisible :
     ✗ ERREUR        → cassera ou dénaturera un défi : à corriger avant publication
     ⚠ AVERTISSEMENT → fonctionne, mais expérience dégradée ou piège probable
     ℹ INFO          → choix assumé possible, simple signalement
   Code de sortie : 1 si au moins une erreur (utilisable en CI), 0 sinon.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

/* Le parseur de la prod : zéro écart d'interprétation avec le serveur */
const srcChat = fs.readFileSync(path.join(ROOT, 'api', 'chat.js'), 'utf8');
eval(srcChat.slice(srcChat.indexOf('function parseCSV'), srcChat.indexOf('// --- Prompts externalisés')));

const MODES = ['prompt', 'prompt-juge', 'duel', 'qcm', 'puzzle', 'rotation', 'intrus', 'motsmeles', 'gratter'];
const COLS = ['id', 'niveau', 'mode', 'tag', 'titre', 'objectif', 'duree', 'pitch', 'intro', 'mission',
  'hint', 'ex', 'sim', 'sim2', 'data', 'urls_visuels', 'index_intrus', 'legendes', 'chrono', 'final',
  'juge', 'gagnant', 'ouverture', 'contexte_ia'];

let E = 0, W = 0, I = 0;
const lines = [];
const err = (id, m) => { E++; lines.push(`  ✗ ${id} — ${m}`); };
const warn = (id, m) => { W++; lines.push(`  ⚠ ${id} — ${m}`); };
const info = (id, m) => { I++; lines.push(`  ℹ ${id} — ${m}`); };

/* ─────────────────────────── defis.csv ─────────────────────────── */
let rows;
try {
  rows = parseCSV(fs.readFileSync(path.join(ROOT, 'content', 'defis.csv'), 'utf8'));
} catch (e) {
  console.error('✗ content/defis.csv illisible : ' + e.message);
  process.exit(1);
}
console.log(`\n═══ VÉRIFICATION DE CONTRIBUTION — ${rows.length} défis ═══\n`);

/* Colonnes */
const have = Object.keys(rows[0] || {});
for (const c of COLS) if (!have.includes(c)) err('(structure)', `colonne manquante : « ${c} »`);
for (const c of have) if (!COLS.includes(c)) info('(structure)', `colonne inconnue ignorée par le moteur : « ${c} »`);

/* Unicité des ids */
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.id)) err(r.id, 'id EN DOUBLE : le second écrase le premier partout (tampons, contexte, scores)');
  seen.add(r.id);
}

/* Palier à 1 seul défi → bonus thème +30 obtenu en un défi (équilibre barème) */
const byNiv = {};
for (const r of rows) byNiv[r.niveau] = (byNiv[r.niveau] || 0) + 1;
for (const [n, c] of Object.entries(byNiv)) if (c === 1)
  info('(barème)', `le palier ${n} ne compte qu'UN défi : le bonus « thème complété » (+30) tombe dès ce défi validé`);
if (!rows.some((r) => (r.final || '').trim() === '1'))
  info('(barème)', 'aucun défi marqué final=1 : le bonus +20 du grand final est dormant (choix possible)');

/* Défi par défi */
for (const r of rows) {
  const id = r.id || '(id vide)';
  const before = lines.length;

  /* id */
  if (!(r.id || '').trim()) err(id, 'id vide : défi injouable (tampon, persistance et scores impossibles)');
  if (/[;]/.test(r.id)) err(id, 'id contenant « ; » : entre en collision avec le séparateur des fichiers contexte_ia');
  if (/[,\s]/.test(r.id)) err(id, 'id contenant virgule ou espace : fragile (exports tableur, éditions manuelles) — utiliser lettres/chiffres/tirets');
  else if (/[A-Z_]/.test(r.id)) info(id, 'id avec majuscules/underscore : fonctionne, mais le kebab-case minuscule (ex. rotation-401) est recommandé pour l\'homogénéité');

  /* niveau — CRITIQUE : hors 1-4, le défi disparaît de la grille */
  if (!['1', '2', '3', '4'].includes((r.niveau || '').trim()))
    err(id, `niveau « ${r.niveau} » : hors 1-4 le défi devient INVISIBLE sur l'accueil (aucune section ne l'affiche)`);

  /* mode — CRITIQUE : toute faute de frappe bascule silencieusement en bac à sable prompt */
  const mode = (r.mode || '').trim();
  if (!MODES.includes(mode))
    err(id, `mode « ${r.mode} » inconnu : le défi basculera SILENCIEUSEMENT en bac à sable prompt (minuscules exactes requises : ${MODES.join(', ')})`);
  if (mode === 'motsmeles' || mode === 'gratter')
    warn(id, `mode « ${mode} » : mécanique gelée/squelette, non finalisée pour les joueurs`);

  /* chrono / final */
  if ((r.chrono || '').trim() && !/^\d+$/.test(r.chrono.trim()))
    warn(id, `chrono « ${r.chrono} » non numérique : ignoré par le moteur`);

  /* Règles par mode */
  const ctx = (r.contexte_ia || '').trim();
  const mdParts = ctx.split(';').map((s) => s.trim()).filter(Boolean);
  const mdFiles = mdParts.filter((p) => p.endsWith('.md'));
  for (const f of mdFiles)
    if (!fs.existsSync(path.join(ROOT, 'api', 'prompts', f)))
      err(id, `fichier référencé introuvable : api/prompts/${f} (l'IA retombera sur un cadre générique)`);

  if (mode === 'prompt') {
    if (!ctx) info(id, 'contexte_ia vide : l\'IA répond en assistant générique, sans scénario (peut être un choix assumé)');
  }

  if (mode === 'prompt-juge') {
    if (mdFiles.length !== 1) err(id, `prompt-juge : exactement UN fichier .md attendu dans contexte_ia (trouvé : ${mdFiles.length})`);
    else if (fs.existsSync(path.join(ROOT, 'api', 'prompts', mdFiles[0]))) {
      const md = fs.readFileSync(path.join(ROOT, 'api', 'prompts', mdFiles[0]), 'utf8');
      if (!/CRIT[EÈ]RES?\s+DU\s+JUGE/i.test(md))
        err(id, `${mdFiles[0]} sans section « # CRITÈRES DU JUGE » : le Juge validera TOUT d'office`);
    }
  }

  if (mode === 'duel') {
    if (mdFiles.length !== 2) err(id, `duel : DEUX fichiers .md attendus (« a.md;b.md »), trouvé : ${mdFiles.length}`);
    else {
      const [a, b] = mdFiles.map((f) => path.join(ROOT, 'api', 'prompts', f));
      if (fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a, 'utf8').trim() === fs.readFileSync(b, 'utf8').trim())
        err(id, 'duel : les deux fichiers .md sont IDENTIQUES — les deux IA joueront le même personnage');
    }
    const g = (r.gagnant || '').trim().toLowerCase();
    if (g && !['a', 'b'].includes(g)) err(id, `gagnant « ${r.gagnant} » : seuls « a », « b » ou vide (duel libre) sont acceptés`);
    if (g && (!(r.sim || '').trim() || !(r.sim2 || '').trim()))
      warn(id, 'duel départagé sans sim/sim2 : pas de réponses en mode démo NI de repli si un moteur tombe en panne');
    const o = (r.ouverture || '').trim();
    if (o && !o.includes(';;'))
      warn(id, 'ouverture de duel sans « ;; » : la MÊME réplique s\'affichera des deux côtés (format : réplique A;;réplique B)');
    if (o && g) info(id, 'duel départagé avec ouverture : garder des répliques NEUTRES qui ne trahissent pas l\'IA fiable (anonymat A/B)');
  }

  if (mode === 'qcm') {
    const qs = String(r.data || '').split(';;');
    if (!(r.data || '').trim()) err(id, 'qcm : colonne data vide');
    qs.forEach((q, i) => {
      const seg = q.split('|').map((s) => s.trim()).filter(Boolean);
      const opts = seg.slice(1);
      if (seg.length < 3) err(id, `qcm Q${i + 1} : au moins 2 options requises (format : Question|Bonne réponse*|Option)`);
      const good = opts.filter((o) => o.endsWith('*'));
      if (good.length !== 1) err(id, `qcm Q${i + 1} : ${good.length} option(s) marquée(s) « * » en fin — il en faut EXACTEMENT UNE`);
      for (const o of opts) if (o.includes('*') && !o.endsWith('*'))
        warn(id, `qcm Q${i + 1} : « * » au MILIEU d'une option — le marqueur n'est reconnu qu'en toute fin`);
    });
  }

  if (mode === 'puzzle') {
    const steps = String(r.data || '').split('|').map((s) => s.trim()).filter(Boolean);
    if (steps.length < 3) err(id, `puzzle : ${steps.length} étape(s) dans data — le moteur en exige AU MOINS 3 (séparées par |)`);
  }

  if (mode === 'rotation') {
    const seg = String(r.data || '').trim().split('|').map((s) => s.trim());
    if (!seg[0]) err(id, 'rotation : data vide (URL d\'image, ou URL|motmystere pour la phase 2)');
    else {
      if (/^http:\/\//.test(seg[0])) warn(id, 'rotation : image en http:// (non sécurisé) — préférer https');
      info(id, 'rotation : la grille est CARRÉE (3×3) — une image non carrée sera déformée ; recadrer en carré avant upload');
      if (!seg[1]) info(id, 'rotation : pas de mot mystère (phase visuelle seule) — valide ; ajouter « |motmystere » pour la phase 2');
    }
  }

  if (mode === 'intrus') {
    const urls = String(r.urls_visuels || '').split('|').map((s) => s.trim()).filter(Boolean);
    if (urls.length < 2) err(id, `intrus : ${urls.length} visuel(s) — le moteur en exige AU MOINS 2 (séparés par |, 3 recommandés)`);
    const idx = parseInt(r.index_intrus, 10);
    if (Number.isNaN(idx)) warn(id, 'intrus : index_intrus vide/non numérique — le moteur retombera sur 0 (le 1er visuel)');
    else if (idx < 0 || idx >= urls.length) err(id, `intrus : index_intrus=${idx} hors plage — position de l'intrus en BASE 0 (0=1er visuel … ${urls.length - 1}=${urls.length}ᵉ)`);
    const legs = String(r.legendes || '').split('|').map((s) => s.trim()).filter(Boolean);
    if (legs.length && legs.length !== urls.length)
      info(id, `intrus : ${legs.length} légende(s) pour ${urls.length} visuels — les manquantes seront vides`);
  }

  if (lines.length === before) lines.push(`  ✓ ${id} [${mode}]`);
}

/* ─────────────────────────── ressources.csv ─────────────────────────── */
try {
  const res = parseCSV(fs.readFileSync(path.join(ROOT, 'content', 'ressources.csv'), 'utf8'));
  lines.push('');
  lines.push(`  ── ressources.csv : ${res.length} entrée(s) ──`);
  const isBlank = (r) => Object.values(r).every((v) => !String(v || '').trim());
  const blanks = res.filter(isBlank).length;
  if (blanks) info('(ressources)', `${blanks} ligne(s) résiduelle(s) d'export « ,,,, » — déjà ignorées par l'application (filtre au chargement) ; nettoyage du Sheet optionnel`);
  res.forEach((r, i) => {
    if (isBlank(r)) return;
    if (!(r.titre || '').trim()) warn(`ressource #${i + 1}`, 'titre vide (entrée incomplète : elle sera masquée par le filtre de chargement)');
    if ((r.url || '').trim() && !/^https?:\/\//.test(r.url.trim())) warn(`ressource #${i + 1}`, `url invalide : « ${r.url} »`);
  });
} catch (e) { warn('(ressources)', 'ressources.csv illisible : ' + e.message); }

/* ─────────────────────────── Synthèse ─────────────────────────── */
console.log(lines.join('\n'));
console.log(`\n═══ SYNTHÈSE : ${E} erreur(s) · ${W} avertissement(s) · ${I} info(s) ═══`);
if (E) {
  console.log('✗ Corriger les ERREURS avant de publier (les ⚠/ℹ sont à arbitrer).\n');
  process.exit(1);
}
console.log('✓ Publiable — aucune erreur bloquante.\n');

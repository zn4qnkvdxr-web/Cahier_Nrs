/**
 * Cahier de vacances IA — Backend Google Apps Script
 * À coller dans Extensions → Apps Script d'un Google Sheet, puis
 * Déployer → Nouvelle application web (Exécuter en tant que : moi ·
 * Accès : tout le monde). L'URL obtenue va dans APPS_SCRIPT_URL sur Vercel.
 *
 * Le Sheet EST la console d'admin : onglet "evenements" pour le suivi,
 * export CSV natif (Fichier → Télécharger → CSV). Aucune vue admin web.
 *
 * Structure créée automatiquement :
 *  - onglet "etats"      : code | etat_json | maj
 *  - onglet "evenements" : horodatage | code | prenom | palier | evenement | detail
 */

var SECRET = 'CHANGE-MOI-longue-chaine-aleatoire'; // = APPS_SCRIPT_SECRET sur Vercel

function doPost(e) {
  var out = { ok: false };
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.secret !== SECRET) {
      return respond({ ok: false, error: 'unauthorized' });
    }

    if (body.action === 'save') {
      saveState(body.code, body.state || {});
      out = { ok: true };
    } else if (body.action === 'load') {
      var st = loadState(body.code);
      out = st ? { ok: true, state: st } : { ok: false, error: 'not_found' };
    } else if (body.action === 'track') {
      trackEvent(body);
      out = { ok: true };
    } else {
      out = { ok: false, error: 'unknown_action' };
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return respond(out);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function saveState(code, state) {
  var sh = sheet('etats', ['code', 'etat_json', 'maj']);
  var data = sh.getDataRange().getValues();
  var json = JSON.stringify(state).slice(0, 5000);
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      sh.getRange(i + 1, 2, 1, 2).setValues([[json, new Date()]]);
      return;
    }
  }
  sh.appendRow([code, json, new Date()]);
}

function loadState(code) {
  var sh = sheet('etats', ['code', 'etat_json', 'maj']);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      try { return JSON.parse(data[i][1]); } catch (e) { return null; }
    }
  }
  return null;
}

function trackEvent(b) {
  var sh = sheet('evenements', ['horodatage', 'code', 'prenom', 'palier', 'evenement', 'detail']);
  sh.appendRow([new Date(), b.code || '', b.prenom || '', b.palier || '', b.event || '', b.detail || '']);
}


/**
 * À exécuter UNE FOIS depuis l'éditeur Apps Script (bouton Exécuter ▶)
 * AVANT le déploiement : Google demande alors l'autorisation d'accès
 * au Sheet ("le verrou"), indispensable pour que doPost fonctionne.
 */
function declencherAutorisation() {
  SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Autorisation accordée : le verrou Google est levé.');
}

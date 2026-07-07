# 🚀 DÉPLOIEMENT - Marche à suivre complète

Runbook opérateur. Temps total estimé : **30-40 minutes**, une seule fois.
Ordre imposé : Google → Clés → GitHub → Vercel → Recette.

---

## Phase 0 - Comprendre démo vs live (2 min de lecture)

| | **Mode démo** | **Mode live** |
|---|---|---|
| Comment | Double-clic sur `index.html` (`file://`), ou `FORCE_DEMO: true` dans `config.js` | Site déployé sur Vercel, rien à changer |
| Contenu | Défis embarqués dans le code | `content/*.csv` du repo (source de vérité) |
| Bac à sable | Réponses simulées (`sim`/`sim2`) | Vrais appels Mistral → Gemini |
| Tracking/reprise | Rien ne sort de l'appareil | Google Sheet actif |
| PWA | Inactive | Active |

La bascule est **automatique** : aucun fichier à modifier entre les deux.
`FORCE_DEMO: true` sert à faire une revue en ligne sans consommer de quota.

---

## Phase 1 - Google (Sheet + Apps Script) · ~10 min

1. Créer un **Google Sheet** vierge, le nommer `Cahier IA - données`
2. `Extensions → Apps Script` → supprimer le contenu → coller **`apps-script/Code.gs`**
3. Ligne `var SECRET = 'CHANGE-MOI...'` : remplacer par une **longue chaîne aléatoire**
   (30+ caractères, par ex. générée sur passwordsgenerator.net). **La copier de côté.**
4. `Déployer → Nouveau déploiement → Application web` :
   - Exécuter en tant que : **Moi**
   - Accès : **Tout le monde** *(l'URL est impossible à deviner et le secret bloque tout appel non signé)*
5. **Copier l'URL `/exec`** affichée. La garder de côté avec le secret.

✅ Vérif : les onglets `etats` et `evenements` se créeront tout seuls au premier usage.
Le Sheet **est** ta console d'admin : suivi en direct dans `evenements`,
export `Fichier → Télécharger → CSV` pour le reporting de septembre.

## Phase 2 - Clés LLM (sans carte bancaire) · ~5 min

- **Mistral** : `console.mistral.ai` → API Keys → créer une clé (tier gratuit / expérimentation).
  ⚠ Vérifier sur leur page *Limits* que le tier couvre ton volume - sinon le fallback Gemini absorbe.
- **Gemini** : `aistudio.google.com/apikey` → créer une clé (tier gratuit).

**Ne jamais** coller ces clés dans un fichier du repo, un mail ou un chat. Prochain arrêt : Vercel.

## Phase 3 - GitHub · ~5 min

1. Créer un repo (privé recommandé) → y pousser **tout le contenu du zip** tel quel
2. Branche par défaut : `main`. C'est tout - aucune URL à récupérer, les CSV sont lus en chemins relatifs.

## Phase 4 - Vercel · ~8 min

1. `vercel.com → Add New → Project` → importer le repo GitHub
2. Framework preset : **Other** · Build command : *(vide)* · Output : *(vide)*
3. **Environment Variables** - les 5 lignes, avant le premier deploy :

| Nom | Valeur |
|---|---|
| `MISTRAL_API_KEY` | ta clé Mistral |
| `GEMINI_API_KEY` | ta clé Gemini |
| `APPS_SCRIPT_URL` | l'URL `/exec` de la Phase 1 |
| `APPS_SCRIPT_SECRET` | le secret de la Phase 1 |
| `ALLOWED_ORIGIN` | l'URL finale du site, ex. `https://cahier-ia.vercel.app` *(à poser après le 1er deploy si tu ne la connais pas encore, puis Redeploy)* |

4. **Deploy**. Chaque `git push` redéploiera automatiquement (~30 s).

## Phase 5 - Recette (smoke tests) · ~8 min

Sur le site en ligne, dans l'ordre :

- [ ] Splash : logo ↔ emojis puis zoom-reveal ; recharger → version courte (2 emojis)
- [ ] Onboarding : prénom + 3 questions → niveau proposé → escales visibles
- [ ] Défi `prompt` : envoyer un vrai prompt → réponse IA (pas la réponse `sim` du mode démo)
- [ ] Défi duel (« Deux IA, un match ») : deux réponses **différentes** côte à côte
- [ ] Valider un défi : fond assombri + tampon encré daté + vibration (mobile)
- [ ] Google Sheet : une ligne `onboarding` + une ligne `defi_valide` dans `evenements`, une ligne dans `etats`
- [ ] Reprise : noter le code, ouvrir le site en navigation privée, saisir le code → progression restaurée
- [ ] PWA : menu navigateur → « Installer l'application » → icône aux 3 cercles
- [ ] Anti-abus : spammer le bac à sable → message « Doucement ! » vers le 9e envoi dans la minute

En cas de souci : `Vercel → ton projet → Logs` montre les fonctions ; les lignes
`[chat] Mistral indisponible → bascule Gemini` sont **normales** si le quota Mistral est atteint.

---

## Enregistrement des prompts - état actuel et option

**Par défaut (et par conception) : le texte des prompts n'est JAMAIS stocké.**
Seuls partent au Sheet : prénom, niveau, code, événements (`defi_valide`, `duel`, …)
avec l'**id** du défi - jamais le contenu tapé. C'est le réglage RGPD-friendly
pour un outil interne sans déclaration particulière.

Si tu veux analyser la progression des prompts en septembre, un interrupteur
`FEATURES.SAVE_PROMPTS` peut être greffé (prompt final envoyé dans `detail`,
tronqué à 120 c.) - prévu en option au lot Passeport, **à activer en
connaissance de cause et à annoncer aux participants**.

## Maintenance pendant l'été

- **Modifier le contenu** = éditer `content/defis.csv` ou `ressources.csv` sur GitHub (voir `CONTRIBUER.md`). Zéro redéploiement manuel.
- **Modifier le site lui-même** (`index.html`, `sw.js`…) : incrémenter `VERSION` dans `sw.js` (`cv-ia-v2`, …) pour invalider le cache PWA des utilisateurs.
- **Quotas** : à surveiller ponctuellement sur console.mistral.ai et aistudio.google.com. Le rate-limiting (8 req/min/IP, 60/jour) protège le gratuit.
- **Tests** : `node test/e2e.test.js` avant tout merge qui touche `api/` (22 scénarios).
- **Rotation** : si le secret ou une clé fuite → régénérer, mettre à jour la variable Vercel, Redeploy.

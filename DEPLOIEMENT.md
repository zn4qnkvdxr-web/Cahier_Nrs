# 🚀 MODE OPÉRATOIRE - Installation propre

Scénario : tu écrases le repo avec la nouvelle archive, tu re-saisis les
variables Vercel, tu repars sur un **nouveau** Google Sheet.
**Temps total : ~25 minutes. Aucun fichier de code à modifier.**

> ✅ **Compatibilité vérifiée avant livraison** : Chrome, Edge, Firefox récents ·
> Safari et iOS 14.1+ · Android · PWA installable · mode démo par double-clic.
> Limites connues : pas de vibration sur iPhone (blocage Apple, pas un bug) ·
> Internet Explorer non supporté.

---

## Étape 1 - Le repo GitHub (5 min)

1. Dans ton repo : **supprimer tout le contenu** (ou créer un repo neuf).
2. Déposer **tout le contenu de l'archive à la racine** du repo.
   ⚠ `index.html` doit être à la racine, pas dans un sous-dossier `projet/`.
3. Commit sur `main`.
4. Si le projet Vercel est déjà lié au repo : il redéploie tout seul (~40 s).
   Sinon : vercel.com → Add New → Project → importer le repo → Framework
   **Other**, Build et Output **vides**.

## Étape 2 - Nouveau Google Sheet + Apps Script (8 min)

1. Créer un **Google Sheet vierge** (nom libre, ex. `Cahier IA - données`).
2. `Extensions → Apps Script` → tout effacer → coller le contenu de
   **`apps-script/Code.gs`** de l'archive.
3. Ligne `var SECRET = '...'` : remplacer par une **longue chaîne aléatoire**
   (30+ caractères). **La copier de côté** : c'est la même valeur qu'à l'étape 3.
4. **Lever le verrou Google** : sélectionner la fonction
   `declencherAutorisation` dans la barre → **Exécuter ▶** → accepter tout
   (écran « application non validée » → *Paramètres avancés* → *Accéder au projet*).
5. `Déployer → Nouveau déploiement → ⚙ Application web` :
   - Exécuter en tant que : **Moi**
   - Accès : **Tout le monde**
6. **Copier l'URL `/exec`** → c'est `APPS_SCRIPT_URL` de l'étape 3.

> ### ⚠ Vigilances Code.gs (à lire une fois)
> - Le `SECRET` du script et la variable Vercel doivent être **identiques au
>   caractère près** - sinon le Sheet reste muet, sans message d'erreur visible.
> - Sans l'exécution de `declencherAutorisation` (étape 2.4), les écritures
>   échouent silencieusement.
> - **Toute modification future du script** exige : `Déployer → Gérer les
>   déploiements → ✏️ → Version : Nouvelle version → Déployer`. C'est ce qui
>   conserve la même URL `/exec`. (Un « Nouveau déploiement » créerait une
>   nouvelle URL → il faudrait la reporter dans Vercel.)
> - Les onglets `etats` et `evenements` se créent **tout seuls** au premier
>   usage : un Sheet vide après installation est normal.
> - Le Sheet **est** ta console d'admin : suivi en direct dans `evenements`,
>   export `Fichier → Télécharger → CSV` pour le reporting de septembre.

## Étape 3 - Variables Vercel (5 min)

`Vercel → ton projet → Settings → Environment Variables` - supprimer les
anciennes si présentes, puis saisir (environnement **Production** coché) :

| Variable | Valeur |
|---|---|
| `MISTRAL_API_KEY` | ta clé Mistral (console.mistral.ai) |
| `GEMINI_API_KEY` | ta clé Gemini (aistudio.google.com/apikey) |
| `APPS_SCRIPT_URL` | l'URL `/exec` de l'étape 2 |
| `APPS_SCRIPT_SECRET` | le secret de l'étape 2, à l'identique |
| `ALLOWED_ORIGIN` | l'origine **copiée depuis la barre d'adresse** du site, sans `/` final ni chemin, ex. `https://cahier-norsys.vercel.app` (plusieurs possibles, séparées par des virgules) |

Optionnelle : `GEMINI_MODEL` - uniquement si les logs montrent un jour
`404 model no longer available` (y mettre le nom du modèle actif d'AI Studio).

⚠ **Après toute saisie/modification de variable : `Deployments → ⋯ → Redeploy`.**
Sans redéploiement, l'ancienne configuration continue de tourner.

## Étape 4 - C'est tout

Zéro fichier à éditer : les CSV sont lus en chemins relatifs depuis le repo,
la bascule démo/live est automatique, le cache PWA des visiteurs est invalidé
par la version embarquée (`cv-ia-v3`). Personnalisation facultative dans
`config.js` : équipe du « À propos » (`ABOUT.TEAM`), interrupteurs `FEATURES`.

## Étape 5 - Recette express (10 min, dans l'ordre)

- [ ] Splash logo/emojis → accueil ; recharger → version courte
- [ ] Onboarding (prénom vide accepté → pseudonyme `Voyageur-XXXX`)
- [ ] Défi prompt : « Demander à l'IA » → **vraie** réponse (pas le texte de démo) ; bouton verrouillé « Génération… » pendant l'appel ; « Valider » débloqué seulement après
- [ ] Duel : deux réponses **différentes** côte à côte
- [ ] « L'agence qui tourne seule » : **rideau** « Commencer » → split-flap qui décompte
- [ ] Valider un défi : tampon encré + **Refaire/Exporter apparaissent aussitôt** ; « Refaire » → pouf → rejouable
- [ ] Intrus : mauvaise réponse = galerie secouée ; bonne = légendes déployées sous chaque visuel
- [ ] Passeport : ✎ renomme instantanément ; « 🧨 Tout réinitialiser » en deux temps (sur un profil de test !)
- [ ] Reprise : saisir le code en navigation privée → tampons restaurés
- [ ] Google Sheet : lignes `onboarding`, `defi_valide`, `chrono_fin`, `nom_modifie` visibles

## Étape 6 - Dépannage express

| Symptôme | Cause | Remède |
|---|---|---|
| Réponses IA = textes de démo en ligne | 403 : `ALLOWED_ORIGIN` inexacte | Copier l'origine depuis la barre d'adresse, sans `/` final, puis **Redeploy** |
| Gemini renvoie le texte de secours | Modèle retiré par Google (404 en logs) | Variable `GEMINI_MODEL` + Redeploy |
| Rien n'arrive dans le Sheet | `SECRET` différent, autorisation non levée, ou script modifié sans « Nouvelle version » | Revoir étape 2 / vigilances |
| Ancienne interface qui persiste | Cache PWA | Automatique dès la v3 ; sinon : navigateur → vider les données du site |
| Pas de vibration sur iPhone | API bloquée par Apple | Normal - fonctionne sur Android |

---

## Annexe A - Compléter les CSV sans les casser

Trois voies, de la plus sûre à la moins sûre :

1. **GitHub directement** (recommandé) : crayon ✏️ sur le fichier → modifier →
   Commit. Zéro problème d'encodage, historique versionné, site à jour en ~40 s.
2. **Google Sheets** : ouvrir le CSV → travailler → `Fichier → Télécharger →
   Valeurs séparées par des virgules (.csv)` → remplacer le fichier sur GitHub.
   Toujours propre (virgules + UTF-8).
3. **Excel** : *déconseillé* - Excel français exporte en **points-virgules** et
   peut casser les accents. Le site tolère désormais ces fichiers (séparateur
   et BOM auto-détectés), mais si Excel est imposé : enregistrer en
   **« CSV UTF-8 (délimité par des virgules) »** et vérifier une escale sur le
   site après le commit.

Règles de contenu (détail dans `CONTRIBUER.md`) : guillemets doublés `""`,
retours à la ligne `\n` dans `sim`/`sim2`, jamais recycler un `id`.

## Annexe B - Renseigner les URLs d'images (rotation, intrus)

**Recommandation : héberger dans le repo.** Créer `content/img/`, y déposer
les images, et mettre dans le CSV le **chemin relatif** :
`content/img/plage-1.jpg`. Avantages : versionné, déployé avec le site,
jamais de lien mort, aucun souci de droits d'accès.

Alternative : une URL `https://…` **publique et directe** (qui se termine par
`.jpg`/`.png` et affiche l'image seule dans un onglet). ⚠ Les liens de partage
SharePoint/Drive/Teams ne servent **pas** l'image : ils ouvrent une page - ils
ne fonctionneront pas ici.

Formats conseillés : rotation → image **carrée** ~800×800, < 300 Ko ·
intrus → ratio 4:3, < 300 Ko chacune · `demo` reste disponible pour tester.

## Annexe C - Changer le logo du loader (splash)

Dans `index.html`, chercher le repère **`LOGO DU LOADER`** (~ligne 630). Le bloc
`<div class="sp-logo" id="spLogo">` contient un `<svg>` (les 3 cercles Norsys).
Deux options :
1. Remplacer le contenu du `<svg>` par ton propre SVG inline ; ou
2. Remplacer tout le `<svg>` par
   `<img src="content/img/mon-logo.svg" alt="" style="width:120px;height:auto">`
   après avoir déposé le fichier dans `content/img/`.

**Seule règle : ne pas toucher au conteneur `#spLogo`** - c'est lui que GSAP
anime (alternance logo/emojis, zoom de sortie) ; tout logo placé dedans hérite
des animations. L'icône d'installation PWA est distincte : `icons/` + `manifest.json`.

# Cahier de vacances IA 🏖️

Mini-site interne d'été : 7 escales pour progresser en IA (du prompt aux agents),
sans compte, sans coût, avec un rendez-vous collectif en septembre.

## Architecture (100 % gratuite)

```
GitHub (repo)                    Vercel                        Google
─────────────                    ──────                        ──────
content/defis.csv  ──lecture──▶  index.html (statique)
content/ressources.csv           api/chat.js ──▶ Mistral ─┐
                                              └▶ Gemini ◀─┘ (fallback)
                                 api/save.js ──────────────▶ Apps Script ──▶ Sheet
                                                              (états + événements)
```

- **Contenu** : piloté par les CSV du repo (lecture seule, versionné, éditable en PR)
- **Progression** : localStorage + code de reprise `ETE-XXXXX` (synchro via Sheet)
- **Admin** : le Google Sheet lui-même - onglet `evenements`, export CSV natif.
  Aucune vue admin web (surface d'attaque nulle).

## Déploiement en 5 étapes

### 1. Google Sheet + Apps Script
1. Créer un Google Sheet vierge → Extensions → Apps Script
2. Coller le contenu de `apps-script/Code.gs`
3. Remplacer `SECRET` par une longue chaîne aléatoire (garder-la pour l'étape 4)
4. Déployer → Nouvelle application web → Exécuter en tant que : **moi** ·
   Accès : **tout le monde** → copier l'URL `/exec`

### 2. Clés LLM (sans carte bancaire)
- **Mistral** : console.mistral.ai → clé API (tier gratuit / expérimentation)
- **Gemini** : aistudio.google.com → clé API (tier gratuit)

### 3. Repo GitHub
1. Pousser ce dossier dans un repo
2. Noter les URLs raw des CSV :
   `https://raw.githubusercontent.com/<user>/<repo>/main/content/defis.csv`

### 4. Vercel
1. Importer le repo (framework : *Other*, zéro build)
2. Variables d'environnement :

| Variable | Valeur |
|---|---|
| `MISTRAL_API_KEY` | clé Mistral |
| `GEMINI_API_KEY` | clé Gemini |
| `APPS_SCRIPT_URL` | URL `/exec` de l'étape 1 |
| `APPS_SCRIPT_SECRET` | le secret de l'étape 1 |
| `ALLOWED_ORIGIN` | `https://<ton-projet>.vercel.app` |

### 5. C'est tout - plug-and-play
Aucune ligne de code à modifier : les CSV sont chargés en **chemins relatifs**
depuis le repo lui-même (chaque push GitHub redéploie Vercel en ~30 s).
Le **mode démo est automatique** : `index.html` ouvert en double-clic (`file://`)
tourne intégralement simulé - contenu embarqué, réponses IA factices.
Les interrupteurs (vibration, partage, futur leaderboard…) sont dans `config.js`.

## Piloter le contenu

Tout passe par les CSV - aucun redéploiement nécessaire (cache raw ~5 min) :
- `content/ressources.csv` : `type (doc|lien), tag, titre, desc, url`

Niveaux : 1 = 🏖 Découverte · 2 = ⛵ Grand large · 3 = 🌊 Haute mer · 4 = 🧭 Cap Horn

Colonnes de `defis.csv` : `id, niveau (1-4), mode (prompt|duel), tag, titre,
objectif, duree, pitch, intro, mission, hint, ex, sim, sim2, contexte_ia`.

**Mode duel** (`mode=duel`) : le même prompt part vers Mistral **et** Gemini en
parallèle, réponses côte à côte pour comparaison critique. `sim`/`sim2` sont les
réponses de démo/secours des deux panneaux. Côté API, le paramètre `provider`
(liste blanche `mistral|gemini`) impose le fournisseur sans bascule. Un duel
consomme 2 requêtes du quota par IP (8/min → 4 duels/min).
Le `contexte_ia` est lu **côté serveur** par `api/chat.js` (jamais transmis par
le client) et cadre l'assistant : recentrage sur le défi, refus du hors-sujet,
posture human-in-the-loop (guider le prompt plutôt que faire à la place).

Couleurs officielles du logo (tokens `--nrs-*`) : bleu pétrole `#015F70`,
vert anis `#9EC859`, orange brique `#E05529`.

## PWA (installable, offline de base)

Le site est installable (mobile et desktop) : `manifest.json` + `sw.js`,
icônes générées depuis les 3 cercles du logo. Hors-ligne : la coquille et les
CSV restent consultables ; le bac à sable bascule automatiquement sur ses
réponses de secours (`sim`/`sim2`) puisque `/api/*` n'est jamais mis en cache.
Interrupteur : `FEATURES.PWA` dans `config.js`. Après une mise à jour du site,
incrémenter `VERSION` dans `sw.js` (ex. `cv-ia-v2`) pour invalider le cache.

## Sécurité (résumé)

- Clés API et secret **uniquement** en variables d'environnement Vercel -
  rien d'exploitable dans le code source visible au navigateur
- System prompt épinglé **côté serveur** (non modifiable depuis le client)
- Rate-limiting par IP : 8/min et 60/jour sur `/api/chat`, 20/min sur `/api/save`
  (en mémoire par instance : filet suffisant pour tenir les tiers gratuits)
- Plafond de 4 000 caractères par prompt, champs assainis et tronqués sur `/api/save`
- Contrôle d'origine via `ALLOWED_ORIGIN`
- Codes de reprise : alphabet sans ambiguïté, 33 M de combinaisons, format validé
  côté serveur - et ne protègent qu'un prénom + une liste de défis cochés
- Aucune donnée sensible : pas d'email, pas de mot de passe, prénom facultatif

## Test local rapide

```bash
npx vercel dev
# puis http://localhost:3000 avec un fichier .env.local reprenant les variables
```

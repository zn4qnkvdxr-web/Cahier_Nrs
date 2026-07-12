# ✍️ CONTRIBUER - Guide de l'équipe

Vous n'avez **jamais** besoin de toucher au code. Tout le contenu vit dans
deux fichiers CSV : les modifier sur GitHub met le site à jour en ~30 secondes.

> Éditer : ouvrir le fichier sur GitHub → icône crayon → modifier → **Commit changes**.
> Astuce : travailler le texte dans un Google Sheet puis exporter en CSV fonctionne
> aussi - garder exactement les mêmes colonnes.

---

## 1. `content/defis.csv` - la matrice des défis

Une ligne = un défi. Colonnes, dans l'ordre :

| Colonne | Rôle | Règles |
|---|---|---|
| `id` | Identifiant technique | court, unique, sans espace ni accent (`plage2`, `duel-resto`) - **ne jamais changer un id existant** (il est lié aux tampons déjà collectés) |
| `niveau` | Palier | `1` 🏖 Découverte · `2` ⛵ Grand large · `3` 🌊 Haute mer · `4` 🧭 Cap Horn |
| `mode` | Type de défi | `prompt` (une IA) · `duel` (Mistral vs Gemini) · `qcm` · `puzzle` (remise en ordre) · `rotation` (image à reconstituer) · `intrus` (trouver l'image IA) · `gratter` (bientôt) |
| `tag` | Petit surtitre de la carte | ex. `Escale 07` |
| `titre` | Intitulé de l'exercice | court et évocateur (2-5 mots) |
| `objectif` | 🎯 Ce que le participant doit apprendre | 1 phrase, affichée dans le défi |
| `duree` | Durée indicative | ex. `12 min` |
| `pitch` | Accroche de la carte (sommaire) | 1 phrase donnant envie |
| `intro` | Mise en situation | 2-3 phrases, ton estival, situation concrète |
| `mission` | La consigne | ce que le participant doit obtenir/concevoir |
| `hint` | 💡 Indice | le réflexe-clé en 1 phrase |
| `ex` | Prompt d'exemple | inséré tel quel via « Voir un exemple » : doit fonctionner |
| `sim` | Réponse de secours (IA n°1) | affichée hors-ligne / en démo / si l'API tombe |
| `sim2` | Réponse de secours (IA n°2) | **obligatoire si `mode=duel`**, sinon vide - la rendre volontairement différente de `sim` pour que la comparaison ait un intérêt |
| `contexte_ia` | **Le system prompt du défi** | voir section 2 |

**Règles CSV** : chaque champ entre guillemets `"…"` ; un guillemet dans le texte
se double (`""`) ; les retours à la ligne dans `sim`/`sim2` s'écrivent `\n`.
Le plus simple : dupliquer une ligne existante et remplacer.

**Avec quel outil ?** GitHub directement (recommandé) ou Google Sheets
(export « virgules .csv »). Excel FR est déconseillé (points-virgules, accents) -
toléré par le site, mais si imposé : enregistrer en « CSV UTF-8 délimité par
des virgules » et vérifier une escale après commit.

**Images (rotation/intrus)** : les déposer dans `content/img/` du repo et
renseigner le chemin relatif `content/img/mon-image.jpg` (recommandé), ou une
URL https publique **directe** (.jpg/.png) - jamais un lien de partage
SharePoint/Drive, qui ouvre une page et non l'image.

## 1 bis. La colonne `data` (défis-jeux uniquement)

| Mode | Format de `data` | Exemple |
|---|---|---|
| `qcm` | `Question ?\|Bonne réponse*\|Option\|Option;;Question 2 ?\|…` - l'étoile `*` marque la bonne réponse, `;;` sépare les questions | `Capitale ?\|Paris*\|Lyon;;…` |
| `puzzle` | Les étapes **dans le bon ordre**, séparées par `\|` (le site mélange tout seul) - 4 étapes minimum | `Objectif\|Contraintes\|Options\|Validation` |
| `rotation` | `image` seule (phase visuelle) ou `image\|motMystère` (2 phases : reconstruction puis devinette arbitrée par l'IA avec indices). `image` = URL/chemin d'une image **carrée**, ou `demo` (carte postale) / `demo-agent` (robot) | `demo-agent\|agent` |
| `gratter` | À venir - laisser vide | |

Pour `prompt` et `duel`, laisser `data` vide.

**Deux familles de défis de prompt :**

- **`prompt` (standard)** — le voyageur discute avec l'IA dans le bac à sable,
  puis clique sur « Valider » quand il le décide : **auto-validation manuelle**,
  sans arbitrage. Parfait pour s'entraîner librement. Le `.md` ne contient que
  la configuration de l'assistant (pas de section Juge).

- **`prompt-juge`** — même expérience de discussion, mais « Valider » déclenche
  un **audit automatique** par l'IA-Juge, qui analyse le **dernier** prompt du
  voyageur selon des critères secrets. Pour créer ce type : mets `prompt-juge`
  dans la colonne `mode`, et ajoute dans le `.md` un titre `# CRITÈRES DU JUGE`
  suivi des critères en français libre (ce bloc reste **secret**, jamais montré
  en discussion). Critères remplis → tampon ; sinon → rapport d'audit expliquant
  ce qui manque, et on itère. Modèle : `bcn1.md` (sections MISSION /
  CONFIGURATION DE L'ASSISTANT / CRITÈRES DU JUGE).

  **Écrire des critères que le Juge applique de façon fiable** (important pour
  une expérience gratifiante et non aléatoire) :
  - **Numérote** chaque critère (1., 2., 3.) et vise 2 à 4 critères, pas plus.
  - Donne pour chacun **2-3 exemples concrets entre guillemets** — le Juge s'en
    sert de repères (« de 14h à 18h », « petit budget », « à pied »).
  - Formule chaque critère comme une **présence à vérifier** (« le prompt doit
    contenir une contrainte de temps »), pas comme un jugement subjectif
    (« le prompt doit être bien écrit » — trop flou, résultats imprévisibles).
  - Le Juge est réglé pour être **indulgent sur la forme** : un critère compte
    dès qu'il est présent, même formulé autrement. Écris donc des critères
    *fonctionnels* (une info attendue), pas *littéraux* (un mot exact imposé).
  - Le rapport d'audit est automatiquement **encourageant** : il salue ce qui va,
    nomme ce qui manque, et donne un indice — tu n'as pas à le rédiger, juste à
    fournir des critères clairs.

**L'ouverture (colonne `ouverture`, bonus optionnel)** — une réplique d'accueil
qui s'affiche dès l'ouverture du défi, avant même que le voyageur écrive. Pour
les défis de rédaction (`prompt`, `prompt-juge`, `duel`). Aucun appel IA : c'est
un texte fixe que tu écris, affiché avec un fondu et mémorisé (il reste au
rafraîchissement). Laisse la colonne vide → aucun changement, le défi démarre
sur un fil blanc comme aujourd'hui.
- *prompt / prompt-juge* : une seule réplique (l'hôte accueille le voyageur).
- *duel* : **chaque IA a sa propre réplique**, séparées par `;;` dans la cellule
  (`Réplique de A;;Réplique de B`). Sans `;;`, la même réplique s'affiche des
  deux côtés. ⚠ En duel départagé, garde des répliques **neutres** qui ne
  trahissent pas laquelle est fiable (l'anonymat A/B fait partie du jeu).

**Le duel à départage (colonne `gagnant` = `a` ou `b`)** - écris deux system
prompts (`x_a.md;x_b.md`) dont UN volontairement piégeur (hallucination
confiante, vague, hors-sujet chic…), déclare le fiable dans `gagnant`.
Les panneaux s'affichent anonymisés « Réponse A / Réponse B » ; le voyageur a
**un choix par échange** : bon choix = tampon, mauvais choix = il doit relancer
un prompt plus discriminant avant de re-choisir. Colonne vide = duel classique
actuel, inchangé. Modèle : `duel1_a.md` (fiable) / `duel1_b.md` (piégeuse).

**Défi final de thème & chrono** - 2 colonnes optionnelles :
`final` = `1` pour marquer le défi récapitulatif d'un thème (carte texturée ★ FINAL,
étoile dans le passeport - jamais bloquant pour le reste du parcours) ·
`chrono` = durée conseillée **en minutes** (vide = pas de timer). Le décompte s'affiche
en minutes seules, un toast doux prévient à 5 minutes restantes, et à zéro rien ne
bloque : un bandeau l'indique, le temps réel est journalisé dans le Sheet (`chrono_fin`).

**Mode `rotation` avec mot mystère** : la réponse attendue vit dans `data`
(après le `|`, ex. `content/img/schema.png|prompt`). Le prompt d'arbitrage
(OK / NON + indice) est généré automatiquement - rien à rédiger. ⚠ Laisser
`contexte_ia` **vide** pour ces défis : le rempli déclencherait le cadrage
pédagogique standard du serveur, incompatible avec le format strict OK/NON.

**Mode `intrus`** - 3 colonnes dédiées (laisser vides sur les autres modes) :
`urls_visuels` = URLs des images séparées par `|` (vide = démo intégrée) ·
`index_intrus` = position de l'image IA en partant de 0 ·
`legendes` = une entrée par image séparées par `|`, **dans le même ordre** :
crédits pour les vraies photos, et l'explication pédagogique complète à la
position de l'intrus. Tout se révèle sous les visuels après la victoire.

## 2. Bien écrire `contexte_ia` (le cadrage de l'IA)

**Le cadrage de l'IA vit désormais dans des fichiers dédiés** - fini les pavés
de texte coincés dans une cellule CSV (guillemets, sauts de ligne…) :

1. Écris ton prompt système dans un fichier **`api/prompts/mon_defi.md`**
   (texte libre, multi-lignes, aucune règle d'échappement - nomme-le en
   minuscules : lettres, chiffres, `-`, `_`, extension `.md`).
2. Dans le CSV, la colonne `contexte_ia` contient **juste le nom du fichier** :
   `mon_defi.md`.
3. **Défi `duel`** : deux fichiers séparés par `;` - `mon_duel_a.md;mon_duel_b.md`.
   Le 1er cadre l'IA n°1 (Mistral), le 2e l'IA n°2 (Gemini) : même prompt
   utilisateur, deux personnalités. C'est tout l'intérêt pédagogique du duel.

**Filets de sécurité** : une faute de frappe dans le nom (fichier introuvable)
ne casse rien - le serveur le journalise et sert le cadre pédagogique générique.
L'ancienne méthode (prose directement dans la cellule) reste acceptée : les
lignes historiques fonctionnent sans migration.

Contenu conseillé d'un fichier prompt : 2-3 phrases - le cadre du défi, ce que
l'IA doit aider à faire, ce qu'elle doit décliner. Voir `api/prompts/bcn1.md`
pour un exemple réel.

## 3. `content/ressources.csv` - le sac de plage

| Colonne | Rôle |
|---|---|
| `type` | `doc` (📄) ou `lien` (🔗) |
| `tag` | catégorie courte (`Guide`, `Outil`, `Rentrée`…) |
| `titre` / `desc` | titre + 1 phrase |
| `url` | lien complet `https://…` (SharePoint, Drive, site…) |

## 4. Check-list avant de committer

- [ ] `id` unique, jamais recyclé
- [ ] `niveau` entre 1 et 4, `mode` = `prompt` ou `duel`
- [ ] `sim2` rempli si duel, avec une vraie divergence à observer
- [ ] le prompt `ex` testé tel quel dans le bac à sable
- [ ] guillemets doublés, `\n` pour les sauts de ligne
- [ ] relecture sur le site ~1 min après le commit (recharger la page)

En cas de doute, cassez tout sans peur : `git` garde l'historique, un revert suffit.


## Contribuer la pop-in « À propos »

Tout se passe dans **`config.js`**, bloc `ABOUT` - zéro HTML à toucher :

```js
ABOUT: {
  INTRO: "Le texte d'introduction du projet.",
  TEAM: [
    { nom: 'Prénom N.', role: 'Contenu des escales' },
    { nom: 'Autre P.',  role: 'Relecture & tests' },
  ],
  MENTION: "La ligne technique/confiance affichée en bas.",
},
```

Pour t'ajouter : une ligne `{ nom: '…', role: '…' }` dans `TEAM` (garde la
virgule finale). L'avatar est généré automatiquement à partir de tes initiales,
avec une couleur de la charte. `INTRO` et `MENTION` restent modifiables
librement. Commit sur GitHub → visible sur le site en ~40 secondes.

---

## Après avoir contribué : publier

1. Commit du/des fichier(s) sur GitHub (CSV, et le `.md` s'il y en a un).
2. **Incrémenter la version dans `sw.js`** (`cv-ia-vN` → `vN+1`) — un seul
   chiffre à changer. C'est ce qui garantit que tout le monde voit la mise à
   jour ; en cas d'oubli, les nouveaux défis s'affichent quand même (le
   contenu est servi réseau d'abord), mais autant prendre le bon réflexe.
3. Vercel redéploie seul (~40 s). Vérifier une escale en navigation privée.

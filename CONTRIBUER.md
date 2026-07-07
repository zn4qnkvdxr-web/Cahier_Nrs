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
| `mode` | Type de bac à sable | `prompt` (une IA) ou `duel` (Mistral vs Gemini côte à côte) |
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

## 2. Bien écrire `contexte_ia` (le cadrage de l'IA)

Ce texte est injecté **côté serveur** dans le system prompt de l'assistant,
uniquement pour ce défi. L'assistant a déjà pour consignes globales : répondre
en français, rester concis, décliner le hors-sujet, et la posture
*human-in-the-loop* (répondre PUIS suggérer une amélioration du prompt,
sans faire le défi à la place du participant).

Votre `contexte_ia` doit donc seulement préciser, en 1-2 phrases :
- le **sujet** du défi (ce qui est « dans le cadre ») ;
- ce que l'IA doit **encourager** pédagogiquement.

✅ Bon : `"Défi estimateur : logique de calcul peinture (surfaces, litres, coût). Encourage la décomposition entrées → calcul → sortie."`
❌ À éviter : réécrire les consignes globales, coller la solution, dépasser 3 phrases.

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

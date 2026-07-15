/**
 * Cahier de vacances IA - Tour de contrôle
 * Script classique (pas de module ES6) pour que le mode démo fonctionne
 * même en ouvrant index.html par double-clic (file://).
 *
 * ⚠ Ce fichier ne contient AUCUN secret : les clés API vivent uniquement
 * dans les variables d'environnement Vercel.
 */
window.CV_CONFIG = {
  APP_NAME: 'Mon été IA',

  // Réseau - plug-and-play : ne rien changer pour un déploiement Vercel standard
  API_BASE: '',                        // '' = même origine
  CSV_DEFIS: 'content/defis.csv',      // relatif au site : le repo est la source
  CSV_RESSOURCES: 'content/ressources.csv',
  FORCE_DEMO: false,                   // true = tout simulé même en ligne (revues)

  // Interrupteurs de fonctionnalités
  FEATURES: {
    VIBRATION: true,   // retour haptique à la validation d'un défi
    SHARE: true,       // copie / partage du code de reprise
    LEADERBOARD: false, // « Voyageurs de l'été » : réservé au débrief de septembre
    SOUND: false,
    PWA: true,         // installable + offline de base (sw.js)
  },

  // « À propos » - l'équipe s'ajoute ici (aucun code à toucher)
  ABOUT: {
    INTRO: "Ce cahier de vacances n'est pas une formation, il s'agit de petits exercices ludiques, pensés pour continuer à se familiariser avec l'IA générative, à son rythme et sans pression.Ce projet d'acculturation IA est porté par  Tarik, Eric, Virginie, Patrick, Virginia, Matthieu & Gertrude avec l'appui de Sophie REMAY et s'adresse à tous les collaborateurs, quel que soit leur métier.L'idée : garder le contact avec ces outils tout en s'amusant, pas de devenir expert en une semaine.",
    TEAM: [
      { nom: 'Ton prénom ici', role: 'Idée & produit' },
      { nom: 'Ajoute-toi',     role: 'Contenu des escales' },
      { nom: 'Et toi aussi',   role: 'Relecture & tests' },
    ],
    MENTION: "Une découverte à partager, une question, vos retours ? Écrivez-nous sur cahier_de_vacances_IA@norsys.fr",
  },
};

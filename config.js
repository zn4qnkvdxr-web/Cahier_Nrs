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
    INTRO: "Ce cahier de vacances a pour objectif de vous familiariser avec l'IA générative, garder le contact avec ces outils tout en s'amusant, pas de devenir expert en une semaine, dans un contexte ludique à votre rythme et sans pression. Ce cahier s'adresse à tous les collaborateurs, quel que soit leur métier.",
    TEAM: [
      { nom: 'Tarik', role: 'Conception & développement' },
      { nom: 'Virginie',     role: 'Conception-rédaction & idée' },
      { nom: 'Eric',   role: 'Contenu des escales' },
      { nom: 'Patrick',   role: 'Contenu des escales' },
      { nom: 'Matthieu',   role: 'Contenu des escales' },
      { nom: 'Gertrude',   role: 'Contenu des escales & recette' },
      { nom: 'Virginia',   role: 'Relecture & recette' },
      { nom: 'Sophie',   role: 'Sponsor' },
    ],
    MENTION: "Besoin d'un coup de pouce, une question, un retour ? Alors écrivez-nous sur cahier_de_vacances_IA@norsys.fr",
  },
};

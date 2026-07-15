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
    INTRO: "Un cahier de vacances pour continuer l'IA à ton rythme cet été - fabriqué maison, sans budget, entre deux baignades. Rendez-vous en septembre pour le webinaire et les ateliers.",
    TEAM: [
      { nom: 'Ton prénom ici', role: 'Idée & produit' },
      { nom: 'Ajoute-toi',     role: 'Contenu des escales' },
      { nom: 'Et toi aussi',   role: 'Relecture & tests' },
    ],
    MENTION: "Propulsé par Vercel · Mistral (fallback Gemini) · Google Sheet. Aucun texte de prompt n'est stocké.",
  },
};

import type { NavGroup, Role, ScreenKey } from '../types';

export interface NavBadges {
  congeEnAttente: number;
  accesEnAttente: number;
}

// Navigation par profil — portée de src/data/nav.ts, exactement le
// `navGroups()` du prototype (Portail CERER.dc.html). `badges` pilote les
// compteurs affichés à côté de « Demandes de congé » / « Validations » /
// « Comptes et accès ».
export function getNavGroups(role: Role, badges: NavBadges): NavGroup[] {
  const { congeEnAttente: enAttente, accesEnAttente } = badges;
  if (role === 'Administrateur') {
    return [
      {
        titre: 'Administration',
        items: [{ screen: 'comptes', label: 'Comptes et accès', badge: accesEnAttente }],
      },
      {
        titre: 'Ressources humaines',
        items: [
          { screen: 'drh', label: 'Demandes de congé', badge: enAttente },
          { screen: 'absences', label: 'Absences et présences' },
          { screen: 'stats', label: 'Statistiques RH' },
          { screen: 'annuaire', label: 'Annuaire du personnel' },
        ],
      },
      {
        titre: 'Autres services',
        items: [
          { screen: 'missions', label: 'Ordres de mission' },
          { screen: 'materiel', label: 'Matériel et fournitures' },
          { screen: 'stock', label: 'Stock et fournitures' },
        ],
      },
    ];
  }

  if (role === 'DRH') {
    return [
      // 15/09/2026, demande du commanditaire : même disposition que le Chef
      // de service ci-dessous (Mon espace en haut, puis À traiter, puis
      // Service) — même contenu qu'avant, juste réordonné/regroupé.
      {
        titre: 'Mon espace',
        items: [
          // 15/09/2026, demande du commanditaire : la DRH n'avait aucun
          // tableau de bord — elle atterrissait directement sur "Demandes
          // de congé" (DrhPage), sans vision groupée "à traiter" tous types
          // + ses propres demandes récentes. Même écran que le Chef de
          // service (AccueilPage), adapté à ses droits réels ci-dessous.
          { screen: 'accueil', label: 'Tableau de bord' },
          // La DRH peut déposer sa propre demande de congé, validable
          // uniquement par le Chef de service ou l'Administrateur (voir
          // DrhPage) — jamais par elle-même.
          { screen: 'conge', label: 'Ma demande de congé' },
        ],
      },
      {
        // 15/09/2026, demande du commanditaire : Matériel (qu'elle traite
        // réellement) et Ordres de mission (qu'elle suit de près, même en
        // lecture) rejoignent ici — "Service" ne garde que le consultatif
        // pur. Aucun changement de droits, juste le regroupement.
        titre: 'À traiter',
        items: [
          { screen: 'drh', label: 'Demandes de congé', badge: enAttente },
          { screen: 'missions', label: 'Ordres de mission' },
          { screen: 'materiel', label: 'Matériel et fournitures' },
        ],
      },
      {
        titre: 'Service',
        items: [
          { screen: 'absences', label: 'Absences et présences' },
          { screen: 'stats', label: 'Statistiques RH' },
          { screen: 'annuaire', label: 'Annuaire du personnel' },
          { screen: 'stock', label: 'Stock et fournitures' },
        ],
      },
    ];
  }

  if (role === 'Chef de service') {
    return [
      // 15/09/2026, demande du commanditaire : Mon espace en haut, puis À
      // traiter, puis Service — même contenu qu'avant, juste réordonné.
      {
        titre: 'Mon espace',
        items: [
          { screen: 'accueil', label: 'Tableau de bord' },
          { screen: 'conge', label: 'Demande de congé' },
          { screen: 'missions', label: 'Ordres de mission' },
        ],
      },
      {
        titre: 'À traiter',
        items: [
          { screen: 'drh', label: 'Validations', badge: enAttente },
          { screen: 'materiel', label: 'Demandes matériel' },
        ],
      },
      {
        titre: 'Service',
        items: [
          { screen: 'absences', label: 'Absences de l’équipe' },
          { screen: 'stock', label: 'Stock et fournitures' },
          { screen: 'stats', label: 'Statistiques RH' },
          { screen: 'annuaire', label: 'Annuaire' },
        ],
      },
    ];
  }

  if (role === 'Direction') {
    return [
      {
        titre: 'Pilotage',
        items: [
          { screen: 'stats', label: 'Statistiques' },
          { screen: 'drh', label: 'Demandes de congé' },
        ],
      },
      {
        titre: 'Consultation',
        items: [
          { screen: 'missions', label: 'Ordres de mission' },
          { screen: 'absences', label: 'Absences et présences' },
          { screen: 'stock', label: 'Stock et fournitures' },
          { screen: 'annuaire', label: 'Annuaire du personnel' },
        ],
      },
    ];
  }

  // Agent
  return [
    {
      titre: 'Mon espace',
      items: [
        { screen: 'accueil', label: 'Tableau de bord' },
        { screen: 'conge', label: 'Demande de congé' },
        { screen: 'missions', label: 'Ordres de mission' },
        { screen: 'materiel', label: 'Matériel et fournitures' },
      ],
    },
    {
      titre: 'Centre',
      items: [
        // Congés : lecture seule pour tout le personnel (qui est en congé,
        // statut, remplaçant) — décision du commanditaire du 10/09/2026, à
        // la différence du matériel qui reste réservé à DRH/Chef/Direction.
        { screen: 'drh', label: 'Congés du personnel' },
        { screen: 'absences', label: 'Absences et présences' },
        { screen: 'annuaire', label: 'Annuaire du personnel' },
      ],
    },
  ];
}

// Écran d'accueil par profil — §4 du README.
export const DEFAULT_SCREEN: Record<Role, ScreenKey> = {
  Agent: 'accueil',
  // Chef de service et DRH atterrissent directement sur leurs validations
  // (l'action la plus fréquente) — "Tableau de bord" reste accessible en
  // premier lien de "Mon espace" pour la vue groupée, pas comme écran de
  // connexion par défaut.
  'Chef de service': 'drh',
  DRH: 'drh',
  Direction: 'stats',
  Administrateur: 'comptes',
};

export interface PageMeta {
  titre: string;
  sousTitre: string;
  cta?: { label: string; to: ScreenKey };
}

// Titres et sous-titres de page — porté de `pageMeta()` du prototype.
export function getPageMeta(screen: ScreenKey, role: Role, prenom: string): PageMeta {
  switch (screen) {
    case 'accueil': {
      // Date figée du prototype ("au 3 septembre 2026") jamais rendue
      // dynamique — corrigé le 11/09/2026 (signalé par le commanditaire :
      // "nous sommes le 13 pourquoi il affiche au 3 septembre").
      const aujourdHui = new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
      return {
        titre: `Bonjour ${prenom}`,
        sousTitre: `Voici l’état de vos demandes au ${aujourdHui}`,
        cta: { label: 'Nouvelle demande de congé', to: 'conge' },
      };
    }
    case 'conge':
      return {
        titre: 'Demande de congé',
        sousTitre: 'Formulaire numérique — remplace le formulaire papier à 3 exemplaires',
      };
    case 'drh':
      return {
        titre: role === 'Chef de service' ? 'Validations de premier niveau' : 'Demandes de congé',
        sousTitre: 'Traitement centralisé des demandes du personnel du CERER',
      };
    case 'annuaire':
      return { titre: 'Annuaire du personnel', sousTitre: '50 agents répartis sur 6 services' };
    case 'missions':
      return {
        titre: 'Ordres de mission',
        sousTitre: 'Déplacements et missions du personnel',
        cta: { label: 'Nouvel ordre de mission', to: 'missions' },
      };
    case 'absences':
      return { titre: 'Absences et présences', sousTitre: 'Vue mensuelle du personnel' };
    case 'materiel':
      return { titre: 'Matériel et fournitures', sousTitre: 'Demandes d’achat et de consommables' };
    case 'stock':
      return {
        titre: 'Stock et fournitures',
        sousTitre: 'Stock restant par article et historique des livraisons',
      };
    case 'stats':
      // Le bouton d'export vit désormais dans l'écran lui-même (StatsPage),
      // pas ici en CTA d'en-tête — plus de sens vu qu'il agit sur les
      // données affichées juste en dessous plutôt que de naviguer.
      return { titre: 'Statistiques RH', sousTitre: `Année ${new Date().getFullYear()}` };
    case 'comptes':
      return {
        titre: 'Comptes et accès',
        sousTitre: 'Demandes d’accès en attente et gestion des comptes utilisateurs',
      };
    default:
      // Filet de sécurité : la route racine "/" redirige immédiatement vers
      // l'écran par défaut du profil (voir IndexRedirect), mais AppShell
      // calcule ce méta avant que la redirection ne s'applique.
      return { titre: '', sousTitre: '' };
  }
}

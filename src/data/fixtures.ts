// Données fictives (fixtures) — reprises du prototype `Portail CERER.dc.html`
// pour la mise en page uniquement. À remplacer par des appels d'API en
// production (voir §11 du README de handoff).
import type { CompteUtilisateur, Statut } from '../types';

export const CURRENT_USER = {
  nom: 'Jacques KOUKOUI',
  prenom: 'Jacques',
  initiales: 'JK',
};

export const SERVICES = [
  'Solaire photovoltaïque',
  'Biomasse & biocarburants',
  'Énergie éolienne',
  'Efficacité énergétique',
  'Administration & Finances',
  'Service Informatique',
];

export interface Agent {
  nom: string;
  poste: string;
  service: string;
  telephone: string;
}

// Annuaire du personnel — porté de la liste `AGENTS` du prototype.
export const AGENTS: Agent[] = [
  { nom: 'DIALLO Amadou', poste: 'Ingénieur de recherche', service: SERVICES[0], telephone: '77 645 12 08' },
  { nom: 'NDIAYE Fatou', poste: 'Technicienne supérieure', service: SERVICES[5], telephone: '76 330 88 41' },
  { nom: 'SARR Moussa', poste: 'Chargé de recherche', service: SERVICES[1], telephone: '78 214 55 90' },
  { nom: 'BA Aminata', poste: 'Assistante de direction', service: SERVICES[4], telephone: '77 902 41 16' },
  { nom: 'FALL Ibrahima', poste: 'Ingénieur d’études', service: SERVICES[2], telephone: '70 118 63 25' },
  { nom: 'GUEYE Ousmane', poste: 'Technicien de laboratoire', service: SERVICES[3], telephone: '77 484 20 73' },
  { nom: 'CISSÉ Mariama', poste: 'Documentaliste', service: SERVICES[4], telephone: '76 551 09 38' },
  { nom: 'THIAM Cheikh', poste: 'Chercheur associé', service: SERVICES[0], telephone: '78 607 77 12' },
  { nom: 'KOUKOUI Jacques', poste: 'Chef du Service Informatique', service: SERVICES[5], telephone: '77 512 34 08' },
];

// Indicateurs statiques de l'écran DRH (§5.4), conservés tels quels du
// prototype — non dérivés des demandes de congé réelles.
export const DRH_KPIS_STATIQUES = {
  ceMois: '23 j',
  agentsEnConge: 4,
  effectifTotal: 50,
  delaiMoyen: '2,4 j',
};

// --- Tableau de bord agent (accueil) ---------------------------------------

export const SOLDE_ANNUEL = { total: 30, consomme: 12 };

export const PROCHAINE_ABSENCE = {
  periode: '14 → 25 sept.',
  detail: 'Congé annuel — 10 jours',
  remplacant: 'Remplaçant : NDIAYE Fatou',
};

export const DEMANDES_EN_COURS = {
  nombre: 2,
  lignes: ['1 congé en attente DRH', '1 ordre de mission validé'],
};

export interface DemandeRecente {
  type: string;
  ref: string;
  periode: string;
  jours: number;
  statut: Statut;
}

export const MES_DEMANDES_RECENTES: DemandeRecente[] = [
  { type: 'Congé annuel', ref: 'CERER/RH/012/2026', periode: '14/09 → 25/09', jours: 10, statut: 'En attente' },
  { type: 'Ordre de mission — DSI UCAD', ref: 'CERER/OM/015/2026', periode: '02/09', jours: 1, statut: 'Accordé' },
  { type: 'Matériel — disque dur 2 To', ref: 'CERER/MAT/039/2026', periode: '21/08', jours: 1, statut: 'Approuvée' },
  { type: 'Congé annuel', ref: 'CERER/RH/004/2026', periode: '06/04 → 17/04', jours: 10, statut: 'Accordé' },
];

// --- Formulaire de demande de congé -----------------------------------------

// Pré-remplissage du demandeur — en production, ces champs viennent du
// profil de l'agent authentifié (voir §11 du README de handoff).
export const DEMANDEUR_PAR_DEFAUT = {
  nom: 'KOUKOUI',
  prenom: 'Jacques Boubacar',
  matricule: 'CERER-0142',
  poste: 'Chef du Service Informatique',
  service: SERVICES[5],
  telephone: '77 512 34 08',
  email: 'jacques.koukoui@ucad.edu.sn',
};

// Référence illustrative — en production, attribuée de façon atomique côté
// serveur (séquence Postgres ou RPC), jamais calculée côté client (§9).
export const REF_PREVIEW = 'CERER/RH/013/2026';
export const DELAI_TRAITEMENT = '3 à 5 jours ouvrables';

// --- Absences et présences ----------------------------------------------------

// Code de cellule → (fond, bordure, texte, glyphe, libellé de légende).
// §5.7 du README. Palette resaturée le 10/09/2026 (retour commanditaire :
// "couleurs plus vives, meilleure UI") — Présent/Dimanche restent neutres
// pour ne pas noyer les statuts qui comptent, ceux-ci sont pleins et
// lisibles sans avoir à survoler la case. Code 3 : au CERER le samedi est
// travaillé, seul le dimanche ne l'est pas.
export const ABSENCE_CODES = [
  { code: 0, label: 'Présent', bg: '#F3F4F1', border: '#E4E6E0', text: '#A0A7AE', glyph: '' },
  { code: 1, label: 'Congé', bg: '#22C55E', border: '#16A34A', text: '#FFFFFF', glyph: 'CG' },
  { code: 2, label: 'Maladie', bg: '#F59E0B', border: '#D97706', text: '#FFFFFF', glyph: 'MA' },
  { code: 3, label: 'Dimanche', bg: '#DADCD5', border: '#C7C9C1', text: '#7A828C', glyph: '' },
  { code: 4, label: 'Mission', bg: '#3B82F6', border: '#2563EB', text: '#FFFFFF', glyph: 'MI' },
] as const;

// Ordre d'affichage de la légende — reprend celui du prototype (Présent,
// Congé, Maladie, Mission, puis Dimanche).
export const ABSENCE_LEGENDE_ORDRE = [0, 1, 2, 4, 3];

export const JOURS_ABSENCES = Array.from({ length: 15 }, (_, i) => i + 1);

// Matrice agent × jour (15 j, septembre 2026) — un code de ABSENCE_CODES par
// case ; portée du prototype (8 premiers agents de AGENTS).
export const PRESENCE_PATTERN: number[][] = [
  [0, 0, 0, 0, 0, 3, 3, 0, 0, 1, 1, 1, 1, 3, 3],
  [0, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 3, 3],
  [0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 4, 4, 3, 3],
  [1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 1, 3, 3],
  [0, 0, 4, 4, 0, 3, 3, 0, 0, 0, 0, 0, 0, 3, 3],
  [0, 0, 0, 0, 0, 3, 3, 0, 1, 1, 1, 0, 0, 3, 3],
  [0, 0, 0, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 3, 3],
  [0, 0, 0, 0, 0, 3, 3, 4, 4, 4, 0, 0, 0, 3, 3],
];

// --- Ordres de mission -------------------------------------------------------

export interface Mission {
  ref: string;
  agent: string;
  destination: string;
  periode: string;
  jours: number;
  statut: Statut;
}

export const MISSIONS: Mission[] = [
  { ref: 'CERER/OM/018/2026', agent: 'THIAM Cheikh', destination: 'Thiès — site pilote PV', periode: '08/09 → 11/09', jours: 4, statut: 'Accordé' },
  { ref: 'CERER/OM/017/2026', agent: 'SARR Moussa', destination: 'Kaolack — atelier biomasse', periode: '15/09 → 17/09', jours: 3, statut: 'En attente' },
  { ref: 'CERER/OM/016/2026', agent: 'FALL Ibrahima', destination: 'Saint-Louis — mesures éoliennes', periode: '22/09 → 26/09', jours: 5, statut: 'Validé chef' },
  { ref: 'CERER/OM/015/2026', agent: 'KOUKOUI Jacques', destination: 'Dakar — DSI UCAD', periode: '02/09 → 02/09', jours: 1, statut: 'Accordé' },
  { ref: 'CERER/OM/014/2026', agent: 'DIALLO Amadou', destination: 'Tambacounda — mini-réseau', periode: '18/08 → 24/08', jours: 7, statut: 'Terminé' },
];

// --- Matériel et fournitures --------------------------------------------------

// 15/09/2026 : catégories réelles reprises du catalogue fourni par le
// commanditaire (Catalogue_Articles_CERER.xlsx, 128 articles), en
// remplacement des 4 catégories provisoires du prototype initial.
export const MATERIEL_CATEGORIES = [
  'Fournitures de Bureau',
  'Papeterie',
  'Informatique & Électronique',
  'Consommables Impression',
  'Mobilier & Équipement',
  'Hygiène & Entretien',
];

// Unités reprises du même catalogue, + quelques valeurs courantes en plus
// (ex. Bande) pour anticiper de futurs articles.
export const MATERIEL_UNITES = [
  'Pièce',
  'Ramette',
  'Rouleau',
  'Boîte',
  'Bloc',
  'Jeu',
  'Bidon',
  'Paquet',
  'Bande',
];

export interface DemandeMateriel {
  ref: string;
  article: string;
  qte: number;
  date: string; // JJ/MM/AAAA
  statut: Statut;
}

export const MATERIEL_DEMANDES: DemandeMateriel[] = [
  { ref: 'CERER/MAT/041/2026', article: 'Multimètre numérique Fluke 117', qte: 2, date: '01/09/2026', statut: 'En commande' },
  { ref: 'CERER/MAT/040/2026', article: 'Ramettes A4 (carton)', qte: 5, date: '28/08/2026', statut: 'Livrée' },
  { ref: 'CERER/MAT/039/2026', article: 'Disque dur externe 2 To', qte: 1, date: '21/08/2026', statut: 'Approuvée' },
  { ref: 'CERER/MAT/038/2026', article: 'Cellules de référence PV', qte: 4, date: '12/08/2026', statut: 'Rejetée' },
];

// --- Comptes et accès (profil Administrateur) -------------------------------

export const COMPTES: CompteUtilisateur[] = [
  { id: 'c-1', nom: 'KOUKOUI', prenom: 'Jacques', service: SERVICES[5], email: 'jacques.koukoui@ucad.edu.sn', role: 'Administrateur', statut: 'Actif' },
  { id: 'c-2', nom: 'DIALLO', prenom: 'Amadou', service: SERVICES[0], email: 'amadou.diallo@ucad.edu.sn', role: 'Agent', statut: 'Actif' },
  { id: 'c-3', nom: 'NDIAYE', prenom: 'Fatou', service: SERVICES[5], email: 'fatou.ndiaye@ucad.edu.sn', role: 'Agent', statut: 'Actif' },
  { id: 'c-4', nom: 'SARR', prenom: 'Moussa', service: SERVICES[1], email: 'moussa.sarr@ucad.edu.sn', role: 'Chef de service', statut: 'Actif' },
  { id: 'c-5', nom: 'BA', prenom: 'Aminata', service: SERVICES[4], email: 'aminata.ba@ucad.edu.sn', role: 'Agent', statut: 'Actif' },
  { id: 'c-6', nom: 'SY', prenom: 'Malado', service: SERVICES[4], email: 'malado.sy@ucad.edu.sn', role: 'DRH', statut: 'Actif' },
  { id: 'c-7', nom: 'FALL', prenom: 'Ibrahima', service: SERVICES[2], email: 'ibrahima.fall@ucad.edu.sn', role: 'Agent', statut: 'Désactivé' },
];

export const RACCOURCIS: { label: string; sous: string; to: string }[] = [
  { label: 'Demande de congé', sous: 'Formulaire en 4 sections', to: 'conge' },
  { label: 'Ordre de mission', sous: 'Déplacement professionnel', to: 'missions' },
  { label: 'Demander du matériel', sous: 'Fournitures et consommables', to: 'materiel' },
  // 15/09/2026, demande du commanditaire : absent du tableau de bord alors
  // que déjà accessible depuis le menu — ajouté comme raccourci pour tous.
  { label: 'Annuaire du personnel', sous: 'Rechercher un agent, un service', to: 'annuaire' },
];

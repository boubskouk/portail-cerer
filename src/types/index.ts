// Types partagés du portail. Le rôle proviendra de l'authentification en
// production ; ScreenKey correspond à une route (une URL par écran).

// « Administrateur » : 5e profil technique (gestion des comptes et des
// demandes d'accès, tous droits) — distinct des 4 profils métier définis
// dans le handoff design initial.
export type Role = 'Agent' | 'Chef de service' | 'DRH' | 'Direction' | 'Administrateur';

export type ScreenKey =
  | 'accueil'
  | 'conge'
  | 'drh'
  | 'annuaire'
  | 'missions'
  | 'absences'
  | 'materiel'
  | 'stock'
  | 'stats'
  | 'comptes';

export interface NavItem {
  screen: ScreenKey;
  label: string;
  badge?: number;
}

export interface NavGroup {
  titre: string;
  items: NavItem[];
}

// --- Formulaire de demande de congé ---------------------------------------

export type FormVariant = 'A' | 'B';

export type LeaveType =
  | 'annuel'
  | 'maladie'
  | 'maternite'
  | 'exceptionnel'
  | 'sansSolde'
  | 'autre';

export interface Fraction {
  debut: string; // JJ/MM/AAAA
  fin: string; // JJ/MM/AAAA
  jours: number;
}

// --- Statuts communs (congés, missions, matériel, documents) --------------

export type Statut =
  | 'En attente'
  | 'Validé chef'
  | 'En cours'
  | 'En commande'
  | 'Note de service'
  | 'Accordé'
  | 'Approuvée'
  | 'Livrée'
  | 'Terminé'
  | 'Procédure'
  | 'Refusé'
  | 'Rejetée'
  | 'Instruction'
  | 'Formulaire'
  | 'Actif'
  | 'Désactivé';

// --- Comptes et accès (profil Administrateur) ------------------------------

export interface DemandeAcces {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  poste: string;
  service: string;
  telephone: string;
  email: string;
  motif: string;
  dateDemande: string; // JJ/MM/AAAA
  role: Role; // rôle proposé par l'admin, ajustable avant approbation
  statut: 'En attente' | 'Approuvée' | 'Refusé';
}

export interface CompteUtilisateur {
  id: string;
  nom: string;
  prenom: string;
  service: string;
  email: string;
  role: Role;
  statut: 'Actif' | 'Désactivé';
}

// --- Profil agent authentifié (table `agents` de Supabase) ----------------
// id = auth.users.id (voir migration schema_initial_portail_cerer). Chargé
// une fois par AuthContext après connexion ; source de vérité du rôle
// (remplace le sélecteur de démo de RoleContext).
export interface AgentProfil {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  poste: string | null;
  service_id: string | null;
  telephone: string | null;
  email: string;
  role: Role;
  statut: 'Actif' | 'Désactivé';
  // Jours de congé annuel reportés des années antérieures (14/09/2026) —
  // s'ajoute au droit annuel fixe (voir SOLDE_ANNUEL) pour le solde réel
  // disponible de l'agent.
  solde_report: number;
}

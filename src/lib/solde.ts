// Calcul du solde de congé annuel disponible — extrait le 15/09/2026 pour
// être partagé entre DrhPage (blocage/surplus à la validation d'un congé) et
// MissionsPage (blocage de la défalcation d'une mission), sans dupliquer une
// 3e fois la même logique déjà écrite dans CongeForm/AccueilPage (dont le
// calcul reste inchangé, pour ne pas risquer de régression sur ce qui
// fonctionne déjà côté agent).
//
// Règle du commanditaire (15/09/2026) :
// - Un congé annuel qui dépasse le solde disponible peut quand même être
//   accordé par le Chef de service/DRH/Administrateur, mais seulement en
//   confirmant explicitement un « surplus exceptionnel » — tracé sur la
//   demande (colonne `solde_depasse`).
// - Une mission dont la défalcation dépasserait le solde ne peut PAS être
//   défalquée du tout — aucun surplus possible ici, la seule solution est
//   d'augmenter le solde reporté de l'agent avant de décider (écran Congés →
//   Soldes de congé annuel).
export const DROIT_ANNUEL = 30;

export interface CongeAccordeLite {
  agent_id: string;
  type: string;
  statut: string;
  defalque_solde: boolean;
  jours: number;
  fractions: { debut: string }[];
}

export interface MissionAccordeLite {
  agent_id: string;
  statut: string;
  defalque_solde: boolean;
  jours: number;
  debut: string;
}

// Jours de congé annuel + jours de mission déjà accordés et défalqués pour
// un agent, sur une année donnée. Un congé multi-périodes est réparti au
// prorata de ses fractions (même logique que `DrhPage.consommeAnnee`).
export function joursConsommes(
  agentId: string,
  annee: number,
  conges: CongeAccordeLite[],
  missions: MissionAccordeLite[],
): number {
  const congeConsomme = conges
    .filter((d) => d.agent_id === agentId && d.type === 'annuel' && d.statut === 'Accordé' && d.defalque_solde)
    .flatMap((d) => d.fractions.map((f) => ({ jours: d.jours / Math.max(d.fractions.length, 1), annee: f.debut.slice(0, 4) })))
    .filter((f) => f.annee === String(annee))
    .reduce((somme, f) => somme + f.jours, 0);
  const missionConsomme = missions
    .filter((m) => m.agent_id === agentId && m.statut === 'Accordé' && m.defalque_solde && m.debut.slice(0, 4) === String(annee))
    .reduce((somme, m) => somme + m.jours, 0);
  return congeConsomme + missionConsomme;
}

export function soldeDisponible(soldeReport: number, consomme: number): number {
  return DROIT_ANNUEL + soldeReport - consomme;
}

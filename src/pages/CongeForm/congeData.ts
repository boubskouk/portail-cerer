import type { LeaveType } from '../../types';
import { toFr } from '../../lib/date';

export { computeJours, toFr, todayFr } from '../../lib/date';

export const LEAVE_TYPES: { key: LeaveType; label: string; sous: (total: number) => string }[] = [
  { key: 'annuel', label: 'Congé annuel', sous: (total) => `${total} jours par an, fractionnable` },
  { key: 'maladie', label: 'Congé de maladie', sous: () => 'Certificat médical requis' },
  { key: 'maternite', label: 'Maternité / paternité', sous: () => 'Selon statut de l’agent' },
  { key: 'exceptionnel', label: 'Congé exceptionnel', sous: () => 'Événement familial' },
  { key: 'sansSolde', label: 'Congé sans solde', sous: () => 'Validation DRH renforcée' },
  { key: 'autre', label: 'Autre', sous: () => 'À préciser' },
];

export const ETAPES_LABELS = ['Demandeur', 'Type de congé', 'Dates et durée', 'Remplacement'];

/** Libellé français d'un type de congé (clé DB -> texte affiché). */
export function libelleTypeConge(type: LeaveType): string {
  return LEAVE_TYPES.find((t) => t.key === type)?.label ?? type;
}

/** Résumé de période affichable — une ligne "début → fin", ou "N périodes"
 * pour un congé annuel fractionné sur plusieurs tranches. Partagé entre
 * DrhPage et AccueilPage (source : `conge_fractions`, dates ISO). */
export function periodeFractions(fractions: { debut: string; fin: string }[]): string {
  if (fractions.length === 0) return '—';
  if (fractions.length === 1) return `${toFr(fractions[0].debut)} → ${toFr(fractions[0].fin)}`;
  return `${fractions.length} périodes`;
}

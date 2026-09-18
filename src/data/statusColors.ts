import type { Statut } from '../types';

// Palette des pastilles de statut — §6 du README de handoff. Une même
// couleur sert plusieurs statuts (ex. Accordé / Approuvée / Livrée /
// Terminé partagent le vert).
export const STATUT_COLORS: Record<
  Statut,
  { bg: string; text: string; border: string }
> = {
  'En attente': { bg: '#FDF0E3', text: '#A8480B', border: '#F0D5B4' },
  'Validé chef': { bg: '#E8F1F9', text: '#12558B', border: '#C9DDF0' },
  'En cours': { bg: '#E8F1F9', text: '#12558B', border: '#C9DDF0' },
  'En commande': { bg: '#E8F1F9', text: '#12558B', border: '#C9DDF0' },
  'Note de service': { bg: '#E8F1F9', text: '#12558B', border: '#C9DDF0' },
  Accordé: { bg: '#EEF6E4', text: '#4E8420', border: '#C9E2AC' },
  Approuvée: { bg: '#EEF6E4', text: '#4E8420', border: '#C9E2AC' },
  Livrée: { bg: '#EEF6E4', text: '#4E8420', border: '#C9E2AC' },
  Terminé: { bg: '#EEF6E4', text: '#4E8420', border: '#C9E2AC' },
  Procédure: { bg: '#EEF6E4', text: '#4E8420', border: '#C9E2AC' },
  Refusé: { bg: '#FBF3F2', text: '#B3261E', border: '#E9DAD8' },
  Rejetée: { bg: '#FBF3F2', text: '#B3261E', border: '#E9DAD8' },
  Instruction: { bg: '#F2F3EF', text: '#5C6570', border: '#E3E5E0' },
  Formulaire: { bg: '#F2F3EF', text: '#5C6570', border: '#E3E5E0' },
  Actif: { bg: '#EEF6E4', text: '#4E8420', border: '#C9E2AC' },
  Désactivé: { bg: '#F2F3EF', text: '#5C6570', border: '#E3E5E0' },
};

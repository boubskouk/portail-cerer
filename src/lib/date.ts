// Utilitaires de date partagés (formulaire de congé, matériel, missions…).

/** 'YYYY-MM-DD' (valeur d'un <input type="date">) → 'JJ/MM/AAAA'. */
export function toFr(dateIso: string): string {
  if (!dateIso) return '';
  const [y, m, d] = dateIso.split('-');
  return `${d}/${m}/${y}`;
}

/** Nombre de jours de congé inclusifs entre deux dates ISO ('YYYY-MM-DD').
 * Le dimanche n'est pas travaillé au CERER et ne compte donc pas comme un
 * jour de congé posé ; le samedi, travaillé, compte normalement. Compte
 * jour par jour (pas de division sur une durée fixe) pour rester exact quel
 * que soit le nombre de jours du mois traversé (28, 29, 30 ou 31). */
export function computeJours(debutIso: string, finIso: string): number {
  if (!debutIso || !finIso) return 0;
  const debut = new Date(debutIso);
  const fin = new Date(finIso);
  if (fin < debut) return 0;
  let jours = 0;
  const cursor = new Date(debut);
  while (cursor <= fin) {
    if (cursor.getDay() !== 0) jours++; // 0 = dimanche
    cursor.setDate(cursor.getDate() + 1);
  }
  return jours;
}

export function todayFr(): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

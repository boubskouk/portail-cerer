// Écran pas encore construit — la coquille (en-tête, barre latérale,
// routage, jetons de design) et le formulaire de congé sont le périmètre en
// cours ; les autres écrans du portail (§5 du README de handoff) suivent
// dans l'ordre de travail convenu.
export function StubPage({ titre }: { titre: string }) {
  return (
    <div className="card" style={{ color: 'var(--color-text-secondary)' }}>
      <div className="card-label" style={{ marginBottom: 8 }}>
        Écran à venir
      </div>
      <div style={{ font: '400 14px/1.6 var(--font-body)' }}>
        « {titre} » sera implémenté dans une prochaine étape, une fois la coquille
        d'application et le formulaire de demande de congé validés.
      </div>
    </div>
  );
}

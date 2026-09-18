import { STATUT_COLORS } from '../../data/statusColors';
import type { Statut } from '../../types';

export function StatusPill({ statut }: { statut: Statut }) {
  const c = STATUT_COLORS[statut];
  return (
    <span
      className="status-pill"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {statut}
    </span>
  );
}

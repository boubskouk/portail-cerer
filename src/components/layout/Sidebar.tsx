import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';
import { useRole } from '../../context/RoleContext';
import { getNavGroups } from '../../data/nav';
import { countDemandesAccesEnAttente, countEnAttente } from '../../data/fixtures';

type SidebarProps = {
  // Non fournis (desktop) : la sidebar reste dans son flux normal, ces
  // props ne servent qu'au tiroir plein écran affiché sous 900px.
  isOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { role } = useRole();
  const location = useLocation();
  const groups = getNavGroups(role, {
    congeEnAttente: countEnAttente(),
    accesEnAttente: countDemandesAccesEnAttente(),
  });

  return (
    <nav className={`app-sidebar ${isOpen ? 'is-open' : ''}`}>
      <div className="app-sidebar__mobile-head">
        <span>Menu</span>
        <button
          type="button"
          className="app-sidebar__close"
          onClick={onClose}
          aria-label="Fermer le menu"
        >
          ×
        </button>
      </div>
      {groups.map((group) => (
        <div key={group.titre} className="app-sidebar__group">
          <div className="app-sidebar__group-title">{group.titre}</div>
          {group.items.map((item) => {
            const to = `/${item.screen}`;
            const active = location.pathname === to;
            return (
              <Link
                key={item.screen}
                to={to}
                className={`app-sidebar__item ${active ? 'is-active' : ''}`}
                onClick={onClose}
              >
                <span>{item.label}</span>
                {!!item.badge && <span className="app-sidebar__badge">{item.badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}

      {/* 15/09/2026, demande du commanditaire : ce bloc "Assistance —
          Responsable Informatique CERER" retiré, devenu redondant avec le
          bouton flottant WhatsApp (AppShell) qui joue désormais ce rôle de
          contact rapide sur toutes les pages, pas seulement ici. */}
      <div className="app-sidebar__spacer" />
    </nav>
  );
}

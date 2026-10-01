import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getNavGroups, type NavBadges } from '../../data/nav';

type SidebarProps = {
  // Non fournis (desktop) : la sidebar reste dans son flux normal, ces
  // props ne servent qu'au tiroir plein écran affiché sous 900px.
  isOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { role } = useRole();
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // 01/10/2026, demande du commanditaire : les badges ("Validation 3" alors
  // qu'il n'y avait 0 validation en attente) venaient des fixtures de démo
  // (`countEnAttente`/`countDemandesAccesEnAttente` sur des tableaux codés en
  // dur dans data/fixtures.ts), sans rapport avec les vraies demandes en
  // base. Remplacé par un comptage Supabase réel, mêmes tables/filtres que
  // DrhPage (demandes_conge) et ComptesPage (demandes_acces). Requêtes
  // limitées aux rôles qui affichent effectivement ces badges (voir
  // getNavGroups ci-dessous), et relancées à chaque changement de page pour
  // rester à jour après une validation/approbation.
  const [badges, setBadges] = useState<NavBadges>({ congeEnAttente: 0, accesEnAttente: 0 });

  useEffect(() => {
    const besoinConge = role === 'Administrateur' || role === 'DRH' || role === 'Chef de service';
    const besoinAcces = role === 'Administrateur';
    if (!besoinConge && !besoinAcces) {
      setBadges({ congeEnAttente: 0, accesEnAttente: 0 });
      return;
    }

    let annule = false;
    Promise.all([
      besoinConge
        ? supabase.from('demandes_conge').select('id', { count: 'exact', head: true }).in('statut', ['En attente', 'Validé chef'])
        : Promise.resolve({ count: 0, error: null }),
      besoinAcces
        ? supabase.from('demandes_acces').select('id', { count: 'exact', head: true }).eq('statut', 'En attente')
        : Promise.resolve({ count: 0, error: null }),
    ]).then(([congeRes, accesRes]) => {
      if (annule) return;
      if (congeRes.error) console.error('Erreur de comptage des validations en attente :', congeRes.error);
      if (accesRes.error) console.error('Erreur de comptage des demandes d’accès en attente :', accesRes.error);
      setBadges({ congeEnAttente: congeRes.count ?? 0, accesEnAttente: accesRes.count ?? 0 });
    });

    return () => {
      annule = true;
    };
  }, [role, location.pathname]);

  const groups = getNavGroups(role, badges);
  // 01/10/2026, demande du commanditaire : groupes repliables "à la demande"
  // pour libérer de la place (menus chargés type Chef de service) — fermés
  // ici = titres dans cet ensemble. Tous ouverts par défaut (même rendu
  // qu'avant), l'agent replie lui-même ce dont il n'a pas besoin.
  const [groupesFermes, setGroupesFermes] = useState<Set<string>>(() => new Set());

  function toggleGroupe(titre: string) {
    setGroupesFermes((prev) => {
      const next = new Set(prev);
      if (next.has(titre)) {
        next.delete(titre);
      } else {
        next.add(titre);
      }
      return next;
    });
  }

  async function handleLogout() {
    onClose?.();
    await signOut();
    navigate('/login', { replace: true });
  }

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
      {groups.map((group) => {
        const estFerme = groupesFermes.has(group.titre);
        return (
          <div key={group.titre} className="app-sidebar__group">
            <button
              type="button"
              className="app-sidebar__group-title"
              onClick={() => toggleGroupe(group.titre)}
              aria-expanded={!estFerme}
            >
              <span>{group.titre}</span>
              <span className="app-sidebar__chevron" aria-hidden="true" />
            </button>
            {!estFerme &&
              group.items.map((item) => {
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
        );
      })}

      {/* 15/09/2026, demande du commanditaire : ce bloc "Assistance —
          Responsable Informatique CERER" retiré, devenu redondant avec le
          bouton flottant WhatsApp (AppShell) qui joue désormais ce rôle de
          contact rapide sur toutes les pages, pas seulement ici. */}
      <div className="app-sidebar__spacer" />

      {/* 01/10/2026, demande du commanditaire : déplacé depuis l'en-tête,
          sous les éléments du menu. */}
      <button type="button" className="app-sidebar__logout" onClick={handleLogout}>
        Se déconnecter
      </button>
    </nav>
  );
}

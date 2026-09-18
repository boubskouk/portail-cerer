import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import './AppShell.css';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { WhatsAppButton } from '../ui/WhatsAppButton';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { getPageMeta } from '../../data/nav';
import { APP_VERSION } from '../../data/version';
import type { ScreenKey } from '../../types';

// Coquille d'application — en-tête + barre latérale + zone principale
// (§5.1 du README de handoff). Le titre/sous-titre/bouton d'action de page
// sont dérivés de l'écran courant (route) et du profil actif. `agent` est
// garanti non nul : ce composant n'est rendu que sous <RequireAuth>.
export function AppShell() {
  const { role } = useRole();
  const { agent } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const screen = location.pathname.slice(1) as ScreenKey;
  const meta = getPageMeta(screen, role, agent!.prenom);

  // La barre latérale devient un tiroir plein écran sous 900px (voir
  // Sidebar.css) : on la referme à chaque changement de page et on bloque
  // le scroll du fond pendant qu'elle est ouverte.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  return (
    <div className="app-shell">
      <Header onMenuToggle={() => setMobileNavOpen((open) => !open)} />
      <div className="app-shell__body">
        <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div
          className={`app-shell__backdrop ${mobileNavOpen ? 'is-visible' : ''}`}
          onClick={() => setMobileNavOpen(false)}
        />
        <main className="app-shell__main">
          <div className="page-header">
            <div>
              <h1 className="page-header__title">{meta.titre}</h1>
              <div className="page-header__subtitle">{meta.sousTitre}</div>
            </div>
            {meta.cta && (
              <button
                type="button"
                className="page-header__cta"
                onClick={() => navigate(`/${meta.cta!.to}`)}
              >
                {meta.cta.label}
              </button>
            )}
          </div>

          <Outlet />

          <footer className="app-shell__footer">
            <div>Portail interne CERER Hub — Université Cheikh Anta Diop de Dakar</div>
            <div>
              © {new Date().getFullYear()} CERER. Tous droits réservés. Développé par le Service Informatique du
              CERER. — Version {APP_VERSION}
            </div>
          </footer>
        </main>
      </div>
      {/* Masqué tant que le tiroir mobile est ouvert : même position
          (bas-gauche, fixed) et même z-index que le tiroir — sans ça, le
          bouton restait affiché par-dessus le menu ouvert sur mobile. */}
      {!mobileNavOpen && <WhatsAppButton />}
    </div>
  );
}

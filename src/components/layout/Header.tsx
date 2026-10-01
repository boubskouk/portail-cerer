import './Header.css';
import { useAuth } from '../../context/AuthContext';
import logoCerer from '../../assets/brand/logo-cerer.png';
import logoUcad from '../../assets/brand/logo-ucad.png';

function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

// Le sélecteur de profil de démo a été retiré : le rôle affiché vient
// désormais du compte connecté (voir AuthContext). `agent` est garanti non
// nul ici, ce composant n'étant rendu que sous <RequireAuth>.
type HeaderProps = {
  // Non fourni : pas de bouton hamburger (écrans publics). L'AppShell le
  // branche pour ouvrir/fermer le tiroir de navigation sous 900px.
  onMenuToggle?: () => void;
};

export function Header({ onMenuToggle }: HeaderProps) {
  const { agent } = useAuth();

  if (!agent) return null;

  return (
    <header className="app-header">
      <div className="app-header__side app-header__side--left">
        {onMenuToggle && (
          <button
            type="button"
            className="app-header__menu-btn"
            onClick={onMenuToggle}
            aria-label="Ouvrir le menu"
          >
            <span className="app-header__menu-icon" />
          </button>
        )}
        <div className="app-header__logo-group">
          <img src={logoCerer} alt="CERER" className="app-header__logo-cerer" />
          <div className="app-header__logo-label app-header__logo-label--cerer">CERER</div>
        </div>
      </div>

      <div className="app-header__hub">
        <div className="app-header__hub-title">Portail CERER Hub</div>
        <div className="app-header__subtitle">
          Centre d'Étude et de Recherche en Énergies Renouvelables
        </div>
      </div>

      <div className="app-header__side app-header__side--right">
        <div className="app-header__identity">
          <div className="app-header__identity-text">
            <div className="app-header__name">
              {agent.prenom} {agent.nom}
            </div>
            <div className="app-header__role">{agent.role}</div>
          </div>
          <div className="app-header__avatar">{initiales(agent.prenom, agent.nom)}</div>
        </div>

        <div className="app-header__divider" />

        <div className="app-header__logo-group">
          <img src={logoUcad} alt="UCAD" className="app-header__logo-ucad" />
          <div className="app-header__logo-label app-header__logo-label--ucad">UCAD</div>
        </div>
      </div>
    </header>
  );
}

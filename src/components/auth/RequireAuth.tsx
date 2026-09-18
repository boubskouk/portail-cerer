import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './RequireAuth.css';

// Bouton de secours pour les écrans bloquants ci-dessous : sans lui, un
// compte supprimé/désactivé pendant qu'une session est encore active laisse
// l'utilisateur bloqué sans aucun moyen de revenir à /login avec d'autres
// identifiants (rencontré le 10/09/2026 lors des tests : une session de
// compte de test supprimé restait "connectée" côté navigateur).
function BoutonDeconnexion() {
  const { signOut } = useAuth();
  return (
    <button
      type="button"
      className="auth-status__deconnexion"
      onClick={() => {
        signOut();
      }}
    >
      Se déconnecter
    </button>
  );
}

// Protège toutes les routes de la coquille authentifiée (AppShell) : pas de
// session -> renvoi vers /login ; session sans ligne `agents` correspondante
// (compte pas encore lié) ou compte désactivé -> message d'attente plutôt que
// de laisser planter les pages qui supposent un `agent` chargé.
export function RequireAuth() {
  const { session, agent, loading } = useAuth();

  if (loading) {
    return <div className="auth-status">Chargement…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!agent) {
    return (
      <div className="auth-status">
        <p>
          Votre compte n'est pas encore configuré sur le portail. Contactez
          l'administrateur du Service Informatique.
        </p>
        <BoutonDeconnexion />
      </div>
    );
  }

  if (agent.statut === 'Désactivé') {
    return (
      <div className="auth-status">
        <p>
          Ce compte a été désactivé. Contactez l'administrateur du Service
          Informatique.
        </p>
        <BoutonDeconnexion />
      </div>
    );
  }

  return <Outlet />;
}

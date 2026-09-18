import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Field } from '../components/ui/Field';
import { WhatsAppButton } from '../components/ui/WhatsAppButton';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import logoCerer from '../assets/brand/logo-cerer.png';
import logoUcad from '../assets/brand/logo-ucad.png';
import { APP_VERSION } from '../data/version';
import './LoginPage.css';

// Page publique, hors coquille authentifiée. Remplace le sélecteur de profil
// de démo : la connexion détermine désormais le rôle réel via la table
// `agents` (voir AuthContext).
export function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Déjà connecté : inutile de rester sur /login.
  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    setEnvoi(false);
    if (error) {
      setErreur('Email ou mot de passe incorrect.');
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="login-page">
      <img src={logoCerer} alt="" aria-hidden="true" className="login-page__watermark login-page__watermark--cerer" />
      <img src={logoUcad} alt="" aria-hidden="true" className="login-page__watermark login-page__watermark--ucad" />

      <header className="login-page__header">
        <div className="login-page__logo-group">
          <img src={logoCerer} alt="CERER" className="login-page__logo" />
          <div className="login-page__logo-label login-page__logo-label--cerer">CERER</div>
        </div>
        <div className="login-page__brand">
          <div className="login-page__title">Portail CERER Hub</div>
          <div className="login-page__subtitle">
            Centre d'Étude et de Recherche en Énergies Renouvelables
          </div>
        </div>
        <div className="login-page__logo-group">
          <img src={logoUcad} alt="UCAD" className="login-page__logo-ucad" />
          <div className="login-page__logo-label login-page__logo-label--ucad">UCAD</div>
        </div>
      </header>

      <main className="login-page__main">
        <form className="login-card card" onSubmit={onSubmit}>
          <div className="login-card__heading">
            <h1 className="login-card__h1">Connexion</h1>
            <p className="login-card__lead">Accédez à votre espace du portail interne.</p>
          </div>

          <div className="form-grid">
            <Field label="Email" required span={2}>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Mot de passe" required span={2}>
              <div className="login-card__mdp-champ">
                <input
                  type={afficherMotDePasse ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-card__mdp-oeil"
                  onClick={() => setAfficherMotDePasse((v) => !v)}
                  aria-label={afficherMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={afficherMotDePasse}
                  tabIndex={-1}
                >
                  {afficherMotDePasse ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a20.32 20.32 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <path d="M1 1l22 22" />
                    </svg>
                  )}
                </button>
              </div>
            </Field>
          </div>

          {erreur && <div className="login-card__erreur">{erreur}</div>}

          <div className="login-card__submit">
            <button type="submit" className="btn btn--primary" disabled={envoi}>
              {envoi ? 'Connexion…' : 'Se connecter'}
            </button>
          </div>

          <a className="login-card__lien-acces" href="/demande-acces">
            Pas encore de compte ? Faire une demande d'accès
          </a>
        </form>
      </main>

      <footer className="login-page__footer">
        © {new Date().getFullYear()} CERER. Tous droits réservés. Développé par le Service Informatique du CERER. —
        Version {APP_VERSION}
      </footer>
      <WhatsAppButton />
    </div>
  );
}

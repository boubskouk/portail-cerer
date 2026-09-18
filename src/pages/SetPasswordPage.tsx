import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field } from '../components/ui/Field';
import { WhatsAppButton } from '../components/ui/WhatsAppButton';
import { supabase } from '../lib/supabase';
import logoCerer from '../assets/brand/logo-cerer.png';
import logoUcad from '../assets/brand/logo-ucad.png';
import '../components/auth/RequireAuth.css';
import { APP_VERSION } from '../data/version';
import './LoginPage.css';

// Page publique, destination du lien d'activation envoyé après approbation
// d'une demande d'accès (voir ComptesPage -> fonction serveur
// approuver-demande-acces, qui génère ce lien avec redirect_to = ici).
//
// Le client Supabase consomme automatiquement le fragment d'URL
// (#access_token=...) au chargement de la page (detectSessionInUrl, activé
// par défaut) : une session est donc déjà active quand ce composant monte,
// sans action de notre part — on vérifie juste qu'elle est bien là avant de
// proposer de choisir un mot de passe.
export function SetPasswordPage() {
  const navigate = useNavigate();
  const [verification, setVerification] = useState(true);
  const [sessionValide, setSessionValide] = useState(false);
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionValide(!!data.session);
      setVerification(false);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setEnvoi(true);
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    setEnvoi(false);

    if (error) {
      setErreur(
        "Impossible de définir le mot de passe. Redemandez un lien à l'administrateur si le problème persiste.",
      );
      return;
    }

    setSucces(true);
    setTimeout(() => navigate('/', { replace: true }), 1500);
  }

  if (verification) {
    return <div className="auth-status">Vérification du lien…</div>;
  }

  if (!sessionValide) {
    return (
      <div className="auth-status">
        Ce lien d'activation est invalide ou a expiré. Contactez l'administrateur du
        Service Informatique pour en obtenir un nouveau.
      </div>
    );
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
        {succes ? (
          <div className="login-card card">
            <div className="login-card__heading">
              <h1 className="login-card__h1">Mot de passe défini</h1>
              <p className="login-card__lead">Redirection vers votre espace…</p>
            </div>
          </div>
        ) : (
          <form className="login-card card" onSubmit={onSubmit}>
            <div className="login-card__heading">
              <h1 className="login-card__h1">Bienvenue sur le portail CERER</h1>
              <p className="login-card__lead">
                Votre compte a été créé. Choisissez un mot de passe pour l'activer.
              </p>
            </div>

            <div className="form-grid">
              <Field label="Mot de passe" required span={2}>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                />
              </Field>
              <Field label="Confirmer le mot de passe" required span={2}>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                />
              </Field>
            </div>

            {erreur && <div className="login-card__erreur">{erreur}</div>}

            <div className="login-card__submit">
              <button type="submit" className="btn btn--primary" disabled={envoi}>
                {envoi ? 'Enregistrement…' : 'Activer mon compte'}
              </button>
            </div>
          </form>
        )}
      </main>

      <footer className="login-page__footer">
        © {new Date().getFullYear()} CERER. Tous droits réservés. Développé par le Service Informatique du CERER. —
        Version {APP_VERSION}
      </footer>
      <WhatsAppButton />
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Field } from '../components/ui/Field';
import { WhatsAppButton } from '../components/ui/WhatsAppButton';
import { supabase } from '../lib/supabase';
import logoCerer from '../assets/brand/logo-cerer.png';
import logoUcad from '../assets/brand/logo-ucad.png';
import { APP_VERSION } from '../data/version';
import './LoginPage.css';

// Page publique, hors coquille authentifiée. Demande d'envoi d'un lien de
// réinitialisation (`resetPasswordForEmail`) — le modèle d'email "Reset
// Password" côté Supabase Dashboard pointe déjà vers /set-password avec
// ?token_hash=...&type=recovery (voir correctif "liens d'activation",
// même mécanisme anti-scanner réutilisé ici). SetPasswordPage gère ensuite
// la confirmation du lien et la saisie du nouveau mot de passe.
//
// Message de confirmation volontairement identique que l'adresse existe ou
// non en base, pour ne pas laisser deviner les comptes existants.
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
    });
    if (error) {
      console.error('Erreur resetPasswordForEmail :', error);
    }
    setEnvoi(false);
    setEnvoye(true);
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
        {envoye ? (
          <div className="login-card card">
            <div className="login-card__heading">
              <h1 className="login-card__h1">Email envoyé</h1>
              <p className="login-card__lead">
                Si cette adresse correspond à un compte du portail, un lien de
                réinitialisation vient de lui être envoyé. Ouvrez l'email et suivez les
                instructions pour choisir un nouveau mot de passe.
              </p>
            </div>
            <a className="login-card__lien-acces" href="/login">
              Retour à la connexion
            </a>
          </div>
        ) : (
          <form className="login-card card" onSubmit={onSubmit}>
            <div className="login-card__heading">
              <h1 className="login-card__h1">Mot de passe oublié</h1>
              <p className="login-card__lead">
                Indiquez votre adresse email. Si un compte y est associé, vous recevrez un
                lien pour choisir un nouveau mot de passe.
              </p>
            </div>

            <div className="form-grid">
              <Field label="Email" required span={2}>
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="prenom.nom@ucad.edu.sn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="login-card__submit">
              <button type="submit" className="btn btn--primary" disabled={envoi}>
                {envoi ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </div>

            <a className="login-card__lien-acces" href="/login">
              Retour à la connexion
            </a>
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

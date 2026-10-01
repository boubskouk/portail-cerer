import { useEffect, useState } from 'react';
import { Field } from '../components/ui/Field';
import { WhatsAppButton } from '../components/ui/WhatsAppButton';
import { supabase } from '../lib/supabase';
import logoCerer from '../assets/brand/logo-cerer.png';
import logoUcad from '../assets/brand/logo-ucad.png';
import { APP_VERSION } from '../data/version';
import './DemandeAccesPage.css';

type FieldKey = 'nom' | 'prenom' | 'matricule' | 'service' | 'telephone' | 'email';

// Application réservée aux agents UCAD : seule une adresse @ucad.edu.sn peut
// recevoir un accès (revérifié côté serveur dans approuver-demande-acces et
// par une contrainte CHECK en base — ce regex n'est qu'un premier filtre
// pour un retour immédiat à la saisie).
const EMAIL_RE = /^[^\s@]+@ucad\.edu\.sn$/i;

interface ServiceOption {
  id: string;
  nom: string;
}

// 01/10/2026, demande du commanditaire : "Poste / fonction" était un champ
// texte libre — remplacé par ce menu déroulant fermé. N'affecte que le champ
// `poste` (descriptif, affiché à l'Administrateur dans ComptesPage) ; le rôle
// réellement attribué au compte reste `role_propose`, toujours ajustable par
// l'Administrateur avant approbation (voir ComptesPage.tsx), inchangé ici.
const POSTES_PROPOSES = ['Agent', 'Chef de service', 'DRH', 'Directeur'] as const;

const EMPTY_FORM = {
  nom: '',
  prenom: '',
  matricule: '',
  poste: POSTES_PROPOSES[0] as string,
  serviceId: '',
  telephone: '',
  email: '',
  motif: '',
};

// Page publique, hors coquille authentifiée — un agent sans compte demande
// ici la création de son accès au portail. Insertion réelle dans
// `demandes_acces` (RLS : insertion ouverte à `anon`, voir migration
// rls_policies_portail_cerer). Un Administrateur traite ensuite la demande
// dans l'écran « Comptes et accès » (ComptesPage), qui appelle la fonction
// serveur `approuver-demande-acces` pour créer réellement le compte.
export function DemandeAccesPage() {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    supabase
      .from('services')
      .select('id, nom')
      .order('nom')
      .then(({ data, error }) => {
        if (error) {
          console.error('Erreur de chargement des services :', error);
          return;
        }
        const list = (data as ServiceOption[]) ?? [];
        setServices(list);
        if (list.length > 0) {
          setForm((f) => ({ ...f, serviceId: f.serviceId || list[0].id }));
        }
      });
  }, []);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): Partial<Record<FieldKey, string>> {
    const e: Partial<Record<FieldKey, string>> = {};
    if (!form.nom.trim()) e.nom = 'Champ obligatoire';
    if (!form.prenom.trim()) e.prenom = 'Champ obligatoire';
    if (!form.matricule.trim()) e.matricule = 'Champ obligatoire';
    if (!form.telephone.trim()) e.telephone = 'Champ obligatoire';
    if (!form.email.trim()) e.email = 'Champ obligatoire';
    else if (!EMAIL_RE.test(form.email)) e.email = 'Doit être une adresse professionnelle @ucad.edu.sn';
    return e;
  }

  async function onSubmit() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    setErreurEnvoi(null);
    setEnvoi(true);

    const { error } = await supabase.from('demandes_acces').insert({
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      matricule: form.matricule.trim(),
      poste: form.poste.trim() || null,
      service_id: form.serviceId || null,
      telephone: form.telephone.trim(),
      email: form.email.trim(),
      motif: form.motif.trim() || null,
      role_propose: 'Agent', // rôle par défaut le plus bas ; l'admin l'ajuste avant approbation
    });

    setEnvoi(false);

    if (error) {
      console.error('Erreur d’envoi de la demande d’accès :', error);
      setErreurEnvoi("Une erreur est survenue lors de l'envoi. Réessayez.");
      return;
    }

    setSubmitted(true);
  }

  return (
    <div className="acces-page">
      <img src={logoCerer} alt="" aria-hidden="true" className="acces-page__watermark acces-page__watermark--cerer" />
      <img src={logoUcad} alt="" aria-hidden="true" className="acces-page__watermark acces-page__watermark--ucad" />

      <header className="acces-page__header">
        <div className="acces-page__logo-group">
          <img src={logoCerer} alt="CERER" className="acces-page__logo" />
          <div className="acces-page__logo-label acces-page__logo-label--cerer">CERER</div>
        </div>
        <div className="acces-page__brand">
          <div className="acces-page__title">Portail CERER Hub</div>
          <div className="acces-page__subtitle">
            Centre d'Étude et de Recherche en Énergies Renouvelables
          </div>
        </div>
        <div className="acces-page__logo-group">
          <img src={logoUcad} alt="UCAD" className="acces-page__logo-ucad" />
          <div className="acces-page__logo-label acces-page__logo-label--ucad">UCAD</div>
        </div>
      </header>

      <main className="acces-page__main">
        {submitted ? (
          <div className="acces-confirm card">
            <div className="acces-confirm__disc" />
            <div className="acces-confirm__title">Demande transmise</div>
            <div className="acces-confirm__text">
              Votre demande d'accès a été transmise au Service Informatique. Vous recevrez un
              email de confirmation à l'adresse indiquée une fois votre compte créé.
            </div>
          </div>
        ) : (
          <div className="acces-card card">
            <div className="acces-card__heading">
              <h1 className="acces-card__h1">Demande d'accès au portail</h1>
              <p className="acces-card__lead">
                Vous n'avez pas encore de compte ? Remplissez ce formulaire — le Service
                Informatique créera votre accès après vérification.
              </p>
            </div>

            <div className="form-grid">
              <Field label="Nom" required error={errors.nom}>
                <input value={form.nom} onChange={(e) => set('nom', e.target.value)} />
              </Field>
              <Field label="Prénom" required error={errors.prenom}>
                <input value={form.prenom} onChange={(e) => set('prenom', e.target.value)} />
              </Field>
              <Field label="Matricule" required error={errors.matricule}>
                <input value={form.matricule} onChange={(e) => set('matricule', e.target.value)} />
              </Field>
              <Field label="Poste / fonction">
                <select value={form.poste} onChange={(e) => set('poste', e.target.value)}>
                  {POSTES_PROPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Service">
                <select value={form.serviceId} onChange={(e) => set('serviceId', e.target.value)}>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Téléphone" required error={errors.telephone}>
                <input value={form.telephone} onChange={(e) => set('telephone', e.target.value)} />
              </Field>
              <Field
                label={
                  <>
                    Email (<span className="field__label-minuscule">@ucad.edu.sn</span>)
                  </>
                }
                required
                error={errors.email}
                span={2}
              >
                <input
                  type="email"
                  placeholder="prenom.nom@ucad.edu.sn"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label="Motif de la demande (facultatif)" span={2}>
                <textarea
                  rows={3}
                  placeholder="Ex. : nouvelle recrue, remplacement, stage…"
                  value={form.motif}
                  onChange={(e) => set('motif', e.target.value)}
                />
              </Field>
            </div>

            {erreurEnvoi && <div className="acces-card__erreur">{erreurEnvoi}</div>}

            <div className="acces-card__submit">
              <button type="button" className="btn btn--primary" onClick={onSubmit} disabled={envoi}>
                {envoi ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="acces-page__footer">
        © {new Date().getFullYear()} CERER. Tous droits réservés. Développé par le Service Informatique du CERER. —
        Version {APP_VERSION}
      </footer>
      <WhatsAppButton />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field } from '../../components/ui/Field';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { SOLDE_ANNUEL } from '../../data/fixtures';
import type { FormVariant, LeaveType } from '../../types';
import { computeJours, ETAPES_LABELS, LEAVE_TYPES, toFr, todayFr } from './congeData';
import './CongeForm.css';

type FieldKey = 'fractions' | 'dateDebut' | 'dateFin' | 'certificat';

// Une période avec sa version ISO (pour la base) en plus de l'affichage
// français — nécessaire pour insérer dans `conge_fractions`.
interface FractionSaisie {
  debutIso: string;
  finIso: string;
  debut: string;
  fin: string;
  jours: number;
}

// On ne dépose pas de congé sur des jours déjà passés.
const AUJOURDHUI_ISO = new Date().toISOString().slice(0, 10);

export function CongeForm() {
  const { agent } = useAuth();
  const navigate = useNavigate();
  // Approche UX — à trancher par le commanditaire (§5.3 du README) ; les
  // deux variantes partagent exactement les mêmes sections ci-dessous.
  const [variant, setVariant] = useState<FormVariant>('A');
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [refSoumise, setRefSoumise] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);

  // Section 1 — demandeur : affichage seul, dérivé du profil authentifié
  // (voir agents/services). Il n'y a rien à saisir ni à soumettre ici, la
  // demande est rattachée à l'agent connecté via agent_id côté serveur.
  const [serviceNom, setServiceNom] = useState<string | null>(null);

  useEffect(() => {
    if (!agent?.service_id) return;
    supabase
      .from('services')
      .select('nom')
      .eq('id', agent.service_id)
      .maybeSingle()
      .then(({ data }) => setServiceNom(data?.nom ?? null));
  }, [agent?.service_id]);

  // Solde déjà consommé cette année — calculé depuis les congés annuels déjà
  // accordés de l'agent (même logique que le tableau de bord, AccueilPage).
  // Corrige un bug réel (10/09/2026) : cette section affichait encore le
  // même chiffre fixe (12 j) pour tout le monde, y compris un agent n'ayant
  // jamais fait de demande.
  const [soldeConsommeReel, setSoldeConsommeReel] = useState(0);

  useEffect(() => {
    if (!agent) return;
    const anneeEnCours = new Date().getFullYear();
    Promise.all([
      supabase
        .from('demandes_conge')
        .select('jours, fractions:conge_fractions(debut)')
        .eq('agent_id', agent.id)
        .eq('type', 'annuel')
        .eq('statut', 'Accordé')
        .eq('defalque_solde', true),
      // Une mission peut aussi défalquer le solde annuel, sur décision du
      // Chef de service à la validation (voir migration
      // ordres_de_mission_regles_completes) — pas automatique.
      supabase
        .from('missions')
        .select('jours, debut')
        .eq('agent_id', agent.id)
        .eq('statut', 'Accordé')
        .eq('defalque_solde', true),
    ]).then(([congesRes, missionsRes]) => {
        if (congesRes.error) {
          console.error('Erreur de chargement du solde de congé :', congesRes.error);
          return;
        }
        if (missionsRes.error) {
          console.error('Erreur de chargement des missions :', missionsRes.error);
        }
        const consommeConges = ((congesRes.data as unknown as { jours: number; fractions: { debut: string }[] }[]) ?? [])
          .flatMap((d) => d.fractions.map((f) => ({ jours: d.jours, annee: f.debut.slice(0, 4) })))
          .filter((f) => f.annee === String(anneeEnCours))
          .reduce((somme, f) => somme + f.jours, 0);
        const consommeMissions = (missionsRes.data ?? [])
          .filter((m) => m.debut.slice(0, 4) === String(anneeEnCours))
          .reduce((somme, m) => somme + m.jours, 0);
        setSoldeConsommeReel(consommeConges + consommeMissions);
      });
  }, [agent]);

  // Section 2 — type de congé
  const [type, setType] = useState<LeaveType>('annuel');

  // Section 3 — dates et durée
  const [fractions, setFractions] = useState<FractionSaisie[]>([]);
  const [fracDebut, setFracDebut] = useState('');
  const [fracFin, setFracFin] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [jours, setJours] = useState(0);
  // Option, jamais une obligation : défalquer ces jours du solde annuel.
  // Coché par défaut pour un congé annuel (cas normal), décoché d'office
  // pour les autres types (ils ne comptent de toute façon pas dans ce
  // solde) ; le validateur (Chef/DRH/Direction) peut de toute façon changer
  // ce choix à l'approbation, indépendamment de ce qui est coché ici.
  const [defalqueSolde, setDefalqueSolde] = useState(true);
  const [certificatFile, setCertificatFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Section 4 — remplacement et motif
  const [remp, setRemp] = useState<'oui' | 'non'>('non');
  const [remplacantNom, setRemplacantNom] = useState('');
  const [travauxUrgents, setTravauxUrgents] = useState('');
  const [motif, setMotif] = useState('');

  // Droit annuel fixe + solde reporté des années antérieures (14/09/2026,
  // même correction que AccueilPage — voir son commentaire).
  const total = SOLDE_ANNUEL.total + (agent?.solde_report ?? 0);
  const consomme = soldeConsommeReel;
  const demande = fractions.reduce((a, f) => a + f.jours, 0);
  const dispo = Math.max(0, total - consomme - demande);
  const pctUsed = (consomme / total) * 100;
  const pctReq = Math.min(100 - pctUsed, (demande / total) * 100);
  const over = consomme + demande > total;
  const warn = (consomme + demande) / total >= 0.8;
  // 15/09/2026, demande du commanditaire : avant même l'envoi en
  // validation, l'agent doit être prévenu clairement qu'il ne dispose pas
  // d'assez de jours — pas seulement un chiffre dépassé, une phrase directe.
  const alerte = over
    ? `Vous ne disposez pas d’assez de jours pour cette demande (${Math.max(0, total - consomme)} j disponibles pour ${demande} j demandés) — retirez une période avant de soumettre.`
    : warn
      ? `Vous atteignez ${Math.round(((consomme + demande) / total) * 100)} % de votre solde annuel.`
      : null;

  function onDateChange(next: { debut?: string; fin?: string }) {
    const nd = next.debut ?? dateDebut;
    const nf = next.fin ?? dateFin;
    if (next.debut !== undefined) setDateDebut(next.debut);
    if (next.fin !== undefined) setDateFin(next.fin);
    setJours(computeJours(nd, nf));
  }

  function addFraction() {
    if (fracDebut && fracDebut < AUJOURDHUI_ISO) {
      setErrors((e) => ({ ...e, fractions: 'La date de début ne peut pas être antérieure à aujourd’hui' }));
      return;
    }
    const j = computeJours(fracDebut, fracFin);
    if (j <= 0) return;
    setFractions((f) => [
      ...f,
      { debutIso: fracDebut, finIso: fracFin, debut: toFr(fracDebut), fin: toFr(fracFin), jours: j },
    ]);
    setFracDebut('');
    setFracFin('');
    setErrors((e) => ({ ...e, fractions: undefined }));
  }

  function removeFraction(i: number) {
    setFractions((f) => f.filter((_, k) => k !== i));
  }

  function validateSection3(): Partial<Record<FieldKey, string>> {
    const e: Partial<Record<FieldKey, string>> = {};
    if (type === 'annuel') {
      if (fractions.length === 0) e.fractions = 'Ajoutez au moins une période';
      else if (over) e.fractions = `Vous ne disposez pas d’assez de jours (${Math.max(0, total - consomme)} j disponibles)`;
    } else {
      if (!dateDebut) e.dateDebut = 'Champ obligatoire';
      else if (dateDebut < AUJOURDHUI_ISO) e.dateDebut = 'Ne peut pas être antérieure à aujourd’hui';
      if (!dateFin) e.dateFin = 'Champ obligatoire';
      if (dateDebut && dateFin && dateFin < dateDebut) e.dateFin = 'Doit être postérieure à la date de début';
      if (type === 'maladie' && !certificatFile) e.certificat = 'Certificat médical requis';
    }
    return e;
  }

  async function soumettre() {
    if (!agent) return;
    setErreurEnvoi(null);

    const fractionsAEnvoyer: { debut: string; fin: string; jours: number }[] =
      type === 'annuel'
        ? fractions.map((f) => ({ debut: f.debutIso, fin: f.finIso, jours: f.jours }))
        : [{ debut: dateDebut, fin: dateFin, jours }];
    const joursTotal = fractionsAEnvoyer.reduce((a, f) => a + f.jours, 0);

    setEnvoi(true);

    // 15/09/2026 : le téléversement se fait AVANT la création de la
    // demande, pas après. Un essai précédent (créer la demande, puis
    // l'UPDATE avec le chemin du fichier) échouait silencieusement : un
    // agent n'a aucun droit de modifier sa propre demande une fois créée
    // (seulement le droit de la créer, voir policy `conge_insert`) — le
    // fichier partait bien sur le stockage, mais son chemin ne s'enregistrait
    // jamais sur la ligne. En générant l'id à l'avance et en le fournissant
    // dès l'INSERT (avec certificat_url), tout passe par le droit de
    // création, qui lui fonctionne.
    const demandeId = crypto.randomUUID();
    let certificatChemin: string | null = null;

    if (type === 'maladie' && certificatFile) {
      certificatChemin = `${agent.id}/${demandeId}-${certificatFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('certificats-medicaux')
        .upload(certificatChemin, certificatFile);
      if (uploadError) {
        console.error('Erreur de téléversement du certificat :', uploadError);
        setEnvoi(false);
        setErreurEnvoi('Le certificat n’a pas pu être téléversé. Réessayez, ou contactez le Service Informatique.');
        return;
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('demandes_conge')
      .insert({
        id: demandeId,
        agent_id: agent.id,
        type,
        jours: joursTotal,
        defalque_solde: type === 'annuel' ? defalqueSolde : false,
        motif: motif.trim() || null,
        remplacant_nom: remp === 'oui' ? remplacantNom.trim() || null : null,
        travaux_urgents: remp === 'oui' ? travauxUrgents.trim() || null : null,
        certificat_url: certificatChemin,
      })
      .select('id, ref')
      .single();

    if (insertError || !inserted) {
      console.error('Erreur de soumission de la demande de congé :', insertError);
      setEnvoi(false);
      setErreurEnvoi('Une erreur est survenue lors de la soumission. Réessayez.');
      return;
    }

    const { error: fractionsError } = await supabase.from('conge_fractions').insert(
      fractionsAEnvoyer.map((f) => ({ demande_id: inserted.id, debut: f.debut, fin: f.fin, jours: f.jours })),
    );

    setEnvoi(false);

    if (fractionsError) {
      console.error('Erreur d’enregistrement des périodes :', fractionsError);
      setErreurEnvoi('La demande a été créée mais les périodes n’ont pas pu être enregistrées. Contactez le Service Informatique.');
      return;
    }

    setRefSoumise(inserted.ref);
    setSubmitted(true);
  }

  function goNext() {
    if (variant === 'B' && step < 4) {
      if (step === 3) {
        const e = validateSection3();
        if (Object.keys(e).length > 0) {
          setErrors(e);
          return;
        }
      }
      setErrors({});
      setStep((s) => s + 1);
      return;
    }
    // Variante A (tout visible) ou étape 4 de la variante B : soumission.
    const e = validateSection3();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    soumettre();
  }

  function goPrev() {
    setStep((s) => Math.max(1, s - 1));
  }

  function resetForm() {
    setSubmitted(false);
    setStep(1);
    setFractions([]);
    setDateDebut('');
    setDateFin('');
    setJours(0);
    setMotif('');
    setRemp('non');
    setRemplacantNom('');
    setTravauxUrgents('');
    setCertificatFile(null);
    setDefalqueSolde(true);
  }

  const sec1 = variant === 'A' || step === 1;
  const sec2 = variant === 'A' || step === 2;
  const sec3 = variant === 'A' || step === 3;
  const sec4 = variant === 'A' || step === 4;
  const showPrev = variant === 'B' && step > 1;
  const nextLabel = variant === 'B' && step < 4 ? 'Continuer' : envoi ? 'Envoi…' : 'Soumettre la demande';

  if (!agent) return null;

  if (submitted) {
    return (
      <div className="conge-confirm card">
        <div className="conge-confirm__disc" />
        <div className="conge-confirm__title">Demande transmise</div>
        <div className="conge-confirm__text">Votre demande a été transmise au service RH.</div>
        <div className="conge-confirm__ref">{refSoumise}</div>
        <div>
          <button type="button" className="btn btn--outline-sm" onClick={resetForm}>
            Nouvelle demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="conge-form">
      <div className="conge-form__variant-bar card">
        <span className="card-label">Approche UX</span>
        <SegmentedControl
          options={[
            { value: 'A', label: 'A — Page unique' },
            { value: 'B', label: 'B — Par étapes' },
          ]}
          value={variant}
          onChange={(v) => {
            setVariant(v);
            setStep(1);
          }}
        />
        <span className="conge-form__variant-note">
          {variant === 'A'
            ? 'Toutes les sections visibles — dépôt en un écran, adapté au poste de travail.'
            : 'Une section à la fois — moins d’effort perçu, adapté au téléphone.'}
        </span>
      </div>

      <div className="conge-form__ref-banner">
        <div>
          <div className="conge-form__ref-label">Référence</div>
          <div className="conge-form__ref-value">Attribuée à la soumission</div>
        </div>
        <div className="conge-form__ref-date">
          <div className="conge-form__ref-label">Date de dépôt</div>
          <div className="conge-form__ref-value">{todayFr()}</div>
        </div>
        <button
          type="button"
          className="btn btn--outline-sm conge-form__voir-conges"
          onClick={() => navigate('/drh')}
        >
          Qui est en congé ?
        </button>
      </div>

      {variant === 'B' && (
        <div className="conge-form__etapes">
          {ETAPES_LABELS.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            const cls = active ? 'is-active' : done ? 'is-done' : 'is-upcoming';
            return (
              <div key={label} className={`step-pill ${cls}`}>
                <span className="step-pill__num">{n}</span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {sec1 && (
        <section className="conge-section card">
          <div className="conge-section__header">
            <span className="conge-section__badge">1</span>
            <span className="conge-section__title">Informations du demandeur</span>
          </div>
          {/* Affichage seul — dérivé du profil authentifié, rien à saisir :
              la demande est rattachée à l'agent connecté côté serveur. */}
          <div className="conge-section__body form-grid">
            <div className="field">
              <span className="field__label">Nom</span>
              <div className="conge-demandeur__valeur">{agent.nom}</div>
            </div>
            <div className="field">
              <span className="field__label">Prénom</span>
              <div className="conge-demandeur__valeur">{agent.prenom}</div>
            </div>
            <div className="field">
              <span className="field__label">Matricule</span>
              <div className="conge-demandeur__valeur">{agent.matricule}</div>
            </div>
            <div className="field">
              <span className="field__label">Poste / fonction</span>
              <div className="conge-demandeur__valeur">{agent.poste ?? '—'}</div>
            </div>
            <div className="field">
              <span className="field__label">Service</span>
              <div className="conge-demandeur__valeur">{serviceNom ?? '—'}</div>
            </div>
            <div className="field">
              <span className="field__label">Téléphone</span>
              <div className="conge-demandeur__valeur">{agent.telephone ?? '—'}</div>
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <span className="field__label">Email</span>
              <div className="conge-demandeur__valeur">{agent.email}</div>
            </div>
          </div>
        </section>
      )}

      {sec2 && (
        <section className="conge-section card">
          <div className="conge-section__header">
            <span className="conge-section__badge">2</span>
            <span className="conge-section__title">Type de congé</span>
          </div>
          <div className="conge-section__body conge-types">
            {LEAVE_TYPES.map((t) => {
              const active = type === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`type-card ${active ? 'is-active' : ''}`}
                  onClick={() => setType(t.key)}
                >
                  <span className="type-card__dot" />
                  <span className="type-card__text">
                    <span className="type-card__label">{t.label}</span>
                    <span className="type-card__sous">{t.sous(total)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {sec3 && (
        <section className="conge-section card">
          <div className="conge-section__header">
            <span className="conge-section__badge">3</span>
            <span className="conge-section__title">Dates et durée</span>
          </div>

          {type === 'annuel' ? (
            <div className="conge-section__body conge-annuel">
              <div className="solde-box">
                <div className="solde-box__top">
                  <span className="solde-box__title">Solde annuel — {total} jours</span>
                  <span className={`solde-box__count ${over ? 'is-over' : warn ? 'is-warn' : ''}`}>
                    {demande} j demandés · {dispo} j disponibles
                  </span>
                </div>
                <div className="solde-box__track">
                  <div className="solde-box__used" style={{ width: `${pctUsed}%` }} />
                  <div
                    className={`solde-box__req ${over ? 'is-over' : ''}`}
                    style={{ width: `${pctReq}%` }}
                  />
                </div>
                <div className="solde-box__legend">
                  <span className="solde-box__legend-item">
                    <span className="solde-box__swatch solde-box__swatch--used" />
                    Déjà consommé ({consomme} j)
                  </span>
                  <span className="solde-box__legend-item">
                    <span className="solde-box__swatch solde-box__swatch--req" />
                    Cette demande ({demande} j)
                  </span>
                </div>
                {alerte && <div className="solde-box__alert">{alerte}</div>}
                <label className="solde-box__defalque">
                  <input
                    type="checkbox"
                    checked={defalqueSolde}
                    onChange={(e) => setDefalqueSolde(e.target.checked)}
                  />
                  Défalquer ces jours de mon solde annuel
                </label>
                <div className="solde-box__defalque-note">
                  Facultatif — le Chef de service ou la DRH peut de toute
                  façon changer ce choix et ajuster le nombre de jours
                  retenu au moment de la décision.
                </div>
              </div>

              <div className="fractions">
                <div className="card-label">Périodes demandées</div>
                {fractions.map((f, i) => (
                  <div className="fraction-row" key={`${f.debut}-${f.fin}-${i}`}>
                    <span className="fraction-row__index">{i + 1}</span>
                    <span className="fraction-row__dates">
                      {f.debut} → {f.fin}
                    </span>
                    <span className="fraction-row__jours">{f.jours} jours</span>
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="fraction-row__remove"
                      onClick={() => removeFraction(i)}
                    >
                      Retirer
                    </button>
                  </div>
                ))}
                {errors.fractions && <span className="field__error">{errors.fractions}</span>}
                <div className="fraction-add">
                  <Field label="Date de début">
                    <input
                      type="date"
                      min={AUJOURDHUI_ISO}
                      value={fracDebut}
                      onChange={(e) => setFracDebut(e.target.value)}
                    />
                  </Field>
                  <Field label="Date de fin">
                    <input
                      type="date"
                      min={fracDebut || AUJOURDHUI_ISO}
                      value={fracFin}
                      onChange={(e) => setFracFin(e.target.value)}
                    />
                  </Field>
                  <button type="button" className="btn btn--green" onClick={addFraction}>
                    Ajouter la période
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="conge-section__body form-grid form-grid--tight">
              <Field label="Date de début" required error={errors.dateDebut}>
                <input
                  type="date"
                  min={AUJOURDHUI_ISO}
                  value={dateDebut}
                  onChange={(e) => onDateChange({ debut: e.target.value })}
                />
              </Field>
              <Field label="Date de fin" required error={errors.dateFin}>
                <input
                  type="date"
                  min={dateDebut || AUJOURDHUI_ISO}
                  value={dateFin}
                  onChange={(e) => onDateChange({ fin: e.target.value })}
                />
              </Field>
              <Field label="Nombre de jours">
                <input
                  value={jours}
                  onChange={(e) => setJours(Number(e.target.value) || 0)}
                />
              </Field>
              {type === 'maladie' && (
                <div className="maladie-banner">
                  <span
                    className={`maladie-banner__check ${certificatFile ? 'is-checked' : ''}`}
                  />
                  <span className="maladie-banner__text">
                    Certificat médical obligatoire — joindre le fichier (PDF ou photo)
                    {certificatFile && <em> — {certificatFile.name}</em>}
                    {errors.certificat && (
                      <span className="field__error" style={{ display: 'block' }}>
                        {errors.certificat}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 1 }} />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    hidden
                    onChange={(e) => setCertificatFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className="btn btn--outline-orange"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Joindre
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {sec4 && (
        <section className="conge-section card">
          <div className="conge-section__header">
            <span className="conge-section__badge">4</span>
            <span className="conge-section__title">Remplacement et motif</span>
          </div>
          <div className="conge-section__body conge-remplacement">
            <div className="conge-remplacement__toggle">
              <span style={{ font: '500 13px var(--font-body)' }}>Remplacement prévu</span>
              <SegmentedControl
                options={[
                  { value: 'oui', label: 'Oui' },
                  { value: 'non', label: 'Non' },
                ]}
                value={remp}
                onChange={setRemp}
              />
            </div>
            {remp === 'oui' && (
              <div className="form-grid">
                <Field label="Nom du remplaçant">
                  <input value={remplacantNom} onChange={(e) => setRemplacantNom(e.target.value)} />
                </Field>
                <Field label="Travaux urgents à déléguer">
                  <input value={travauxUrgents} onChange={(e) => setTravauxUrgents(e.target.value)} />
                </Field>
              </div>
            )}
            <Field label="Motif (facultatif)">
              <textarea
                rows={3}
                placeholder="Précisez si nécessaire"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              />
            </Field>
          </div>
        </section>
      )}

      {erreurEnvoi && (
        <div className="conge-submit card">
          <div className="conge-submit__note" style={{ color: 'var(--color-red)' }}>
            {erreurEnvoi}
          </div>
        </div>
      )}

      <div className="conge-submit card">
        <div className="conge-submit__note">
          Dépôt à effectuer au moins 7 jours avant la date de départ.
        </div>
        <span style={{ flex: 1 }} />
        {showPrev && (
          <button type="button" className="btn btn--outline" onClick={goPrev}>
            Précédent
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={goNext} disabled={envoi}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Field } from '../components/ui/Field';
import { StatusPill } from '../components/ui/StatusPill';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';
import { supabase } from '../lib/supabase';
import { toFr } from '../lib/date';
import { computeJours } from './CongeForm/congeData';
import { joursConsommes, soldeDisponible, type CongeAccordeLite } from '../lib/solde';
import type { Statut } from '../types';
import './MissionsPage.css';

const AUJOURDHUI_ISO = new Date().toISOString().slice(0, 10);
const ANNEE_EN_COURS = new Date().getFullYear();

interface AgentLite {
  id: string;
  nom: string;
  prenom: string;
  service_id: string | null;
  solde_report: number;
  service: { nom: string } | null;
}

interface MissionRow {
  id: string;
  ref: string;
  agent_id: string;
  // null pour tout le monde sauf Chef de service/DRH/Direction/Administrateur
  // — masqué côté serveur par la vue `missions_pour_personnel`, jamais
  // envoyé au navigateur des autres agents (pas juste caché à l'affichage).
  destination: string | null;
  debut: string;
  fin: string;
  jours: number;
  motif: string | null;
  remplacant_nom: string | null;
  statut: Statut;
  defalque_solde: boolean;
  agent: AgentLite | null;
}

interface Ajustement {
  jours: string;
  defalque: boolean;
}

// Ordres de mission (§5.6 du README de handoff, complété le 11/09/2026 sur
// demande du commanditaire) : jusqu'ici un simple tableau en lecture seule,
// sans aucun moyen d'en déposer un. Construit ici de bout en bout :
// - Formulaire de dépôt (toutes les infos utiles avant le départ : dates,
//   destination, motif, remplaçant).
// - Liste visible par **tout le personnel** (RLS `missions_select` ouverte
//   à tous, comme les congés le 10/09) — "tous les autres agents doivent
//   voir que la personne est en mission".
// - Validation réservée au **Chef de service** (de son propre service) et à
//   l'Administrateur — ni DRH ni Direction ne sont impliqués ici,
//   contrairement aux congés. Décision finale immédiate (même schéma que
//   les congés depuis leur simplification), avec possibilité pour le chef
//   de défalquer ou non ces jours du solde de congé annuel de l'agent.
export function MissionsPage() {
  const { agent } = useAuth();
  const { role } = useRole();
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [chargement, setChargement] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ligneEnDecision, setLigneEnDecision] = useState<string | null>(null);
  const [ajustements, setAjustements] = useState<Record<string, Ajustement>>({});
  // 15/09/2026, demande du commanditaire : même filtre par nom que sur les
  // congés (DrhPage) — permet d'isoler un agent dans la liste sans se
  // perdre parmi tous les ordres de mission du CERER.
  const [recherche, setRecherche] = useState('');
  // 15/09/2026, demande du commanditaire : contrairement à un congé annuel,
  // une mission dont la défalcation dépasserait le solde disponible de
  // l'agent ne peut PAS être accordée avec défalcation — aucun surplus
  // possible ici (voir lib/solde). Le seul recours du Chef de service est
  // d'augmenter le solde reporté de l'agent avant de décider (Congés →
  // Soldes de congé annuel), pas un bouton "quand même" comme pour les
  // congés.
  const [congesAccordes, setCongesAccordes] = useState<CongeAccordeLite[]>([]);

  // Formulaire de dépôt
  const [destination, setDestination] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [motif, setMotif] = useState('');
  const [remplacantNom, setRemplacantNom] = useState('');
  const [erreurChamp, setErreurChamp] = useState<string | undefined>();
  const [envoi, setEnvoi] = useState(false);

  const recharger = useCallback(async () => {
    // On lit `missions_pour_personnel` (vue qui masque la destination selon
    // le rôle), pas la table `missions` directement — l'accès direct à la
    // table a été retiré côté serveur pour empêcher de contourner ce
    // masquage. PostgREST n'embarque pas les jointures de façon fiable à
    // travers une vue, donc l'agent est récupéré séparément et fusionné ici.
    const [missionsRes, agentsRes, congesRes] = await Promise.all([
      supabase
        .from('missions_pour_personnel')
        .select('id, ref, agent_id, destination, debut, fin, jours, motif, remplacant_nom, statut, defalque_solde')
        .order('debut', { ascending: false }),
      supabase.from('agents').select('id, nom, prenom, service_id, solde_report, service:services(nom)'),
      // Congés annuels défalqués déjà accordés — nécessaires pour calculer
      // le solde disponible d'un agent avant d'autoriser la défalcation
      // d'une mission (voir `disponiblePourAgent` ci-dessous).
      supabase
        .from('demandes_conge')
        .select('agent_id, type, statut, defalque_solde, jours, fractions:conge_fractions(debut)')
        .eq('type', 'annuel')
        .eq('statut', 'Accordé')
        .eq('defalque_solde', true),
    ]);
    if (missionsRes.error) {
      console.error('Erreur de chargement des missions :', missionsRes.error);
      return;
    }
    if (agentsRes.error) {
      console.error('Erreur de chargement des agents :', agentsRes.error);
    }
    if (congesRes.error) {
      console.error('Erreur de chargement des congés accordés :', congesRes.error);
    } else {
      setCongesAccordes((congesRes.data as unknown as CongeAccordeLite[]) ?? []);
    }
    const agentsParId = new Map(((agentsRes.data as unknown as AgentLite[]) ?? []).map((a) => [a.id, a]));
    const enrichies = (missionsRes.data ?? []).map((m) => ({
      ...m,
      agent: agentsParId.get(m.agent_id) ?? null,
    }));
    setMissions(enrichies as MissionRow[]);
  }, []);

  useEffect(() => {
    setChargement(true);
    recharger().finally(() => setChargement(false));
  }, [recharger]);

  function peutAgirSur(m: MissionRow): boolean {
    if (role === 'Administrateur') return m.statut === 'En attente';
    // Un seul Chef de service pour tout le CERER — valide pour tous les
    // agents, quel que soit leur service (11/09/2026, clarification du
    // commanditaire), y compris ses propres ordres de mission (13/09/2026 :
    // la Direction, surchargée, ne doit plus être sollicitée pour ce cas —
    // seuls le Chef de service lui-même et l'Administrateur interviennent).
    if (role === 'Chef de service') return m.statut === 'En attente';
    return false;
  }

  const missionsFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return missions;
    return missions.filter((m) => {
      const nomAgent = `${m.agent?.nom ?? ''} ${m.agent?.prenom ?? ''}`.toLowerCase();
      const service = (m.agent?.service?.nom ?? '').toLowerCase();
      return nomAgent.includes(q) || service.includes(q);
    });
  }, [missions, recherche]);

  function ajustement(m: MissionRow): Ajustement {
    return ajustements[m.id] ?? { jours: String(m.jours), defalque: m.defalque_solde };
  }

  function majAjustement(m: MissionRow, patch: Partial<Ajustement>) {
    setAjustements((a) => ({ ...a, [m.id]: { ...ajustement(m), ...patch } }));
  }

  // Solde disponible d'un agent à l'instant présent (congé annuel + missions
  // déjà accordées et défalquées, année en cours) — voir lib/solde.
  function disponiblePourAgent(agentId: string, soldeReport: number): number {
    const consomme = joursConsommes(agentId, ANNEE_EN_COURS, congesAccordes, missions);
    return soldeDisponible(soldeReport, consomme);
  }

  // 15/09/2026, demande du commanditaire : contrairement aux congés, aucun
  // surplus exceptionnel n'est possible ici — si cocher "Défalquer" fait
  // passer l'agent sous zéro, la défalcation elle-même doit être
  // impossible (le Chef de service peut toujours accorder la mission SANS
  // défalquer, ou augmenter le solde reporté de l'agent au préalable).
  function depassementDefalcationPour(m: MissionRow): number {
    const { jours, defalque } = ajustement(m);
    if (!defalque) return 0;
    const dispo = disponiblePourAgent(m.agent_id, m.agent?.solde_report ?? 0);
    return Math.max(0, (Number(jours) || m.jours) - dispo);
  }

  async function onSubmit() {
    if (!agent) return;
    if (!destination.trim()) {
      setErreurChamp('Champ obligatoire');
      return;
    }
    if (!dateDebut || !dateFin) {
      setErreurChamp('Dates obligatoires');
      return;
    }
    if (dateDebut < AUJOURDHUI_ISO) {
      setErreurChamp('La date de départ ne peut pas être antérieure à aujourd’hui');
      return;
    }
    if (dateFin < dateDebut) {
      setErreurChamp('La date de retour doit suivre la date de départ');
      return;
    }
    setErreurChamp(undefined);
    setEnvoi(true);

    const { error } = await supabase.from('missions').insert({
      agent_id: agent.id,
      destination: destination.trim(),
      debut: dateDebut,
      fin: dateFin,
      jours: computeJours(dateDebut, dateFin),
      motif: motif.trim() || null,
      remplacant_nom: remplacantNom.trim() || null,
    });

    setEnvoi(false);

    if (error) {
      console.error('Erreur de soumission de l’ordre de mission :', error);
      return;
    }

    setDestination('');
    setDateDebut('');
    setDateFin('');
    setMotif('');
    setRemplacantNom('');
    recharger();
  }

  async function accorder(m: MissionRow) {
    // 15/09/2026, demande du commanditaire : contrairement à un congé
    // annuel, ce blocage n'a pas de bouton "quand même" — voir
    // `depassementDefalcationPour`.
    if (depassementDefalcationPour(m) > 0) return;
    const { jours, defalque } = ajustement(m);
    setBusyId(m.id);
    const { error } = await supabase
      .from('missions')
      .update({ statut: 'Accordé', jours: Number(jours) || m.jours, defalque_solde: defalque })
      .eq('id', m.id);
    setBusyId(null);
    if (error) {
      console.error('Erreur de validation de la mission :', error);
      return;
    }
    setAjustements((a) => {
      const { [m.id]: _retire, ...reste } = a;
      return reste;
    });
    setLigneEnDecision(null);
    recharger();
  }

  async function refuser(m: MissionRow) {
    setBusyId(m.id);
    const { error } = await supabase.from('missions').update({ statut: 'Refusé' }).eq('id', m.id);
    setBusyId(null);
    if (error) {
      console.error('Erreur de refus de la mission :', error);
      return;
    }
    setLigneEnDecision(null);
    recharger();
  }

  return (
    <div className="missions-page">
      {/* 13/09/2026, précision du commanditaire : l'Administrateur ne dépose
          jamais d'ordre de mission pour lui-même (c'est un profil de
          dépannage/support, invisible du reste du personnel) — il ne fait
          que consulter et approuver/refuser ceux des autres, ci-dessous. */}
      {role !== 'Administrateur' && (
        <div className="card missions-page__form">
          <div className="missions-page__form-titre">Nouvel ordre de mission</div>
          <div className="missions-page__form-body">
            <div className="form-grid">
              <Field label="Destination" required error={erreurChamp} span={2}>
                <input
                  placeholder="Ex. Thiès — site pilote PV"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </Field>
              <Field label="Date de départ" required>
                <input type="date" min={AUJOURDHUI_ISO} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
              </Field>
              <Field label="Date de retour" required>
                <input
                  type="date"
                  min={dateDebut || AUJOURDHUI_ISO}
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                />
              </Field>
              <Field label="Remplaçant pendant l’absence (facultatif)">
                <input value={remplacantNom} onChange={(e) => setRemplacantNom(e.target.value)} />
              </Field>
              <Field label="Objet de la mission">
                <input value={motif} onChange={(e) => setMotif(e.target.value)} />
              </Field>
            </div>
            <button type="button" className="btn btn--primary-blue" onClick={onSubmit} disabled={envoi}>
              {envoi ? 'Envoi…' : 'Soumettre l’ordre de mission'}
            </button>
          </div>
        </div>
      )}

      <div className="data-table">
        <div className="data-table__toolbar">
          <div className="data-table__title">Ordres de mission du personnel</div>
          <span style={{ flex: 1 }} />
          <input
            className="search-input"
            placeholder="Rechercher un agent…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <div className="data-table__scroll">
          <div className="data-table__row data-table__head missions-row">
            <div>Référence</div>
            <div>Agent</div>
            <div>Destination</div>
            <div>Période</div>
            <div>Jours</div>
            <div>Remplaçant</div>
            <div>Statut</div>
            <div>Action</div>
          </div>
          {chargement && <div className="data-table__empty">Chargement…</div>}
          {!chargement && missions.length === 0 && (
            <div className="data-table__empty">Aucun ordre de mission pour l’instant.</div>
          )}
          {!chargement && missions.length > 0 && missionsFiltrees.length === 0 && (
            <div className="data-table__empty">Aucun ordre de mission ne correspond à cette recherche.</div>
          )}
          {missionsFiltrees.map((m) => (
            <div key={m.id}>
              <div className="data-table__row missions-row">
                <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{m.ref}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {m.agent?.nom} {m.agent?.prenom}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                    {m.agent?.service?.nom ?? '—'}
                  </div>
                </div>
                <div style={{ color: 'var(--color-text-secondary)' }} title={m.motif ?? undefined}>
                  {m.destination ?? <span style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>Confidentiel</span>}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {toFr(m.debut)} → {toFr(m.fin)}
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>{m.jours}</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>{m.remplacant_nom ?? '—'}</div>
                <div>
                  <StatusPill statut={m.statut} />
                </div>
                <div className="data-table__actions">
                  {peutAgirSur(m) &&
                    (ligneEnDecision === m.id ? (
                      <span className="data-table__en-cours">Décision ci-dessous ↓</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--approve"
                          disabled={busyId === m.id}
                          onClick={() => setLigneEnDecision(m.id)}
                        >
                          Accorder
                        </button>
                        <button
                          type="button"
                          className="btn btn--refuse"
                          disabled={busyId === m.id}
                          onClick={() => refuser(m)}
                        >
                          Refuser
                        </button>
                      </>
                    ))}
                </div>
              </div>

              {ligneEnDecision === m.id && (
                <div className="decision-panel">
                  <div className="decision-panel__contexte">
                    Accorder la mission de <strong>{m.agent?.nom} {m.agent?.prenom}</strong> — {m.destination},{' '}
                    {toFr(m.debut)} → {toFr(m.fin)}
                  </div>
                  <div className="decision-panel__champs">
                    <label className="decision-panel__champ">
                      <span className="decision-panel__label">Jours à accorder</span>
                      <input
                        type="number"
                        min={0}
                        className="decision-panel__jours"
                        value={ajustement(m).jours}
                        onChange={(e) => majAjustement(m, { jours: e.target.value })}
                      />
                    </label>
                    <label className="decision-panel__toggle">
                      <input
                        type="checkbox"
                        checked={ajustement(m).defalque}
                        onChange={(e) => majAjustement(m, { defalque: e.target.checked })}
                      />
                      <span className="decision-panel__toggle-track">
                        <span className="decision-panel__toggle-thumb" />
                      </span>
                      <span>
                        Défalquer du solde de congé annuel
                        <span className="decision-panel__label-sous">
                          Une mission ne consomme pas de congé par défaut — à cocher seulement si c’est voulu
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* 15/09/2026, demande du commanditaire : contrairement à
                      un congé, pas de "quand même" ici — la défalcation
                      elle-même est bloquée si le solde ne la supporte pas. */}
                  {depassementDefalcationPour(m) > 0 && (
                    <div className="decision-panel__alerte-solde decision-panel__alerte-solde--bloque">
                      ⛔ {m.agent?.nom} {m.agent?.prenom} ne dispose que de{' '}
                      {disponiblePourAgent(m.agent_id, m.agent?.solde_report ?? 0)} j — la défalcation est
                      impossible ({depassementDefalcationPour(m)} j de trop). Décochez-la, ou augmentez le solde
                      reporté de l’agent (Congés → Soldes de congé annuel).
                    </div>
                  )}

                  <div className="decision-panel__actions">
                    <button type="button" className="btn btn--outline-sm" onClick={() => setLigneEnDecision(null)}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn btn--approve"
                      disabled={busyId === m.id || depassementDefalcationPour(m) > 0}
                      onClick={() => accorder(m)}
                    >
                      {busyId === m.id ? 'Confirmation…' : 'Confirmer l’accord'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

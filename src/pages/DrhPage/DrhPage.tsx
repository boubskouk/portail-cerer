import { useCallback, useEffect, useMemo, useState } from 'react';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { StatusPill } from '../../components/ui/StatusPill';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { supabase } from '../../lib/supabase';
import { libelleTypeConge, periodeFractions } from '../CongeForm/congeData';
import { DROIT_ANNUEL, joursConsommes, soldeDisponible } from '../../lib/solde';
import type { LeaveType, Role, Statut } from '../../types';
import './DrhPage.css';

type Filtre = 'Toutes' | 'En attente' | 'Accordé' | 'Refusé';

const ANNEE_PRECEDENTE = new Date().getFullYear() - 1;

interface AgentSoldeRow {
  id: string;
  nom: string;
  prenom: string;
  solde_report: number;
  service: { nom: string } | null;
}

interface DemandeRow {
  id: string;
  ref: string;
  agent_id: string;
  type: LeaveType;
  jours: number;
  statut: Statut;
  defalque_solde: boolean;
  solde_depasse: boolean;
  remplacant_nom: string | null;
  created_at: string;
  decide_le: string | null;
  certificat_url: string | null;
  agent: { nom: string; prenom: string; role: Role; service_id: string | null; service: { nom: string } | null } | null;
  fractions: { debut: string; fin: string }[];
}

interface MissionAccordeeRow {
  agent_id: string;
  statut: Statut;
  defalque_solde: boolean;
  jours: number;
  debut: string;
}

interface Ajustement {
  jours: string;
  defalque: boolean;
}

const AUJOURDHUI_ISO = new Date().toISOString().slice(0, 10);
const ANNEE_EN_COURS = new Date().getFullYear();
const MOIS_EN_COURS = new Date().getMonth(); // 0-indexé

function exportCsv(demandes: DemandeRow[]) {
  const entetes = ['Référence', 'Agent', 'Service', 'Type', 'Jours', 'Période', 'Statut', 'Remplaçant', 'Surplus exceptionnel'];
  const lignes = demandes.map((d) => [
    d.ref,
    `${d.agent?.nom ?? ''} ${d.agent?.prenom ?? ''}`.trim(),
    d.agent?.service?.nom ?? '',
    libelleTypeConge(d.type),
    String(d.jours),
    periodeFractions(d.fractions),
    d.statut,
    d.remplacant_nom ?? '',
    d.solde_depasse ? 'Oui' : '',
  ]);
  const csv = [entetes, ...lignes]
    .map((ligne) => ligne.map((v) => `"${v.replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `demandes-conge-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Écran DRH / Validations (§5.4 du README de handoff). Partagé par DRH,
// Chef de service (« Validations de premier niveau »), Direction (lecture
// seule, §11) et Administrateur (tous droits). Branché sur Supabase le
// 10/09/2026 : la visibilité (agent -> ses demandes, chef -> son service,
// DRH/Direction/Admin -> tout) et les transitions de statut autorisées sont
// déjà appliquées côté RLS (migrations rls_policies_portail_cerer et
// conge_extra_fields_and_chef_refuse_fix) — ce composant se contente
// d'afficher ce que la base laisse passer et de tenter les updates.
export function DrhPage() {
  const { role } = useRole();
  const { agent } = useAuth();
  const [demandes, setDemandes] = useState<DemandeRow[]>([]);
  const [effectifTotal, setEffectifTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('Toutes');
  const [recherche, setRecherche] = useState('');
  // Ajustements en cours de saisie avant de cliquer Accorder : le
  // validateur (Chef/DRH/Direction) peut modifier le nombre de jours retenu
  // et choisir de ne pas défalquer le solde annuel, indépendamment de ce que
  // l'agent avait demandé/coché à la soumission. Refonte UI du 11/09/2026
  // (retour commanditaire : la case + le champ minuscules dans la ligne
  // étaient illisibles) — Accorder ouvre maintenant un vrai panneau de
  // décision sous la ligne au lieu de tout entasser dans la colonne Action.
  const [ajustements, setAjustements] = useState<Record<string, Ajustement>>({});
  const [ligneEnDecision, setLigneEnDecision] = useState<string | null>(null);
  // 15/09/2026, demande du commanditaire : un congé annuel qui dépasse le
  // solde disponible de l'agent ne doit pas passer d'un simple clic — le
  // validateur doit d'abord voir le dépassement, puis confirmer
  // explicitement un « surplus exceptionnel » (armé ici avant le vrai
  // `accorder`, voir `depassementPour`/`accorder`).
  const [depassementConfirme, setDepassementConfirme] = useState<Record<string, boolean>>({});
  const [missionsAccordees, setMissionsAccordees] = useState<MissionAccordeeRow[]>([]);

  // Solde de congé reporté (14/09/2026, demande du commanditaire) : les
  // agents partent souvent en congé annuel sur des blocs de 30-31 jours ;
  // à la sortie des nouveaux congés, DRH/Chef de service peuvent reporter
  // le reliquat non consommé de l'année précédente dans le solde de la
  // nouvelle année plutôt que de le perdre. Écriture réservée à DRH/Chef de
  // service/Administrateur (RLS + trigger dédiés, voir migration
  // solde_conge_reporte) — Direction voit la même chose mais en lecture
  // seule (aucun champ éditable affiché pour elle).
  const peutGererSolde = role === 'DRH' || role === 'Chef de service' || role === 'Administrateur';
  const [agentsSolde, setAgentsSolde] = useState<AgentSoldeRow[]>([]);
  const [editionsSolde, setEditionsSolde] = useState<Record<string, string>>({});
  const [enregistrementSolde, setEnregistrementSolde] = useState<string | null>(null);

  // Direction ne valide plus aucune demande de congé, quel que soit le
  // demandeur (15/09/2026, demande du commanditaire) — c'était déjà le cas
  // pour le Chef de service depuis le 13/09 (surcharge de la Direction),
  // désormais étendu à la DRH : ses propres demandes sont validables
  // uniquement par le Chef de service ou l'Administrateur (aucun des deux
  // n'a de restriction sur la DRH comme cible, rien à changer côté RLS pour
  // eux). Direction reste lecture seule partout sur cet écran.
  function peutAgirSur(d: DemandeRow): boolean {
    // Un seul Chef de service pour tout le CERER (poste transversal, pas un
    // chef par service technique) — valide pour tous les agents, quel que
    // soit leur service (11/09/2026, clarification du commanditaire), y
    // compris ses propres demandes (13/09/2026) et celles de la DRH.
    if (role === 'Chef de service') return d.statut === 'En attente';
    if (role === 'DRH') return (d.statut === 'En attente' || d.statut === 'Validé chef') && d.agent_id !== agent?.id;
    if (role === 'Administrateur') return d.statut === 'En attente' || d.statut === 'Validé chef';
    return false;
  }

  function ajustement(d: DemandeRow): Ajustement {
    return ajustements[d.id] ?? { jours: String(d.jours), defalque: d.defalque_solde };
  }

  function majAjustement(d: DemandeRow, patch: Partial<Ajustement>) {
    setAjustements((a) => ({ ...a, [d.id]: { ...ajustement(d), ...patch } }));
    // Réarme la confirmation de dépassement : le chiffre change, la
    // confirmation précédente ne porte plus sur les mêmes jours.
    setDepassementConfirme((c) => {
      if (!c[d.id]) return c;
      const { [d.id]: _retire, ...reste } = c;
      return reste;
    });
  }

  // Jours accordés et défalqués du solde (congé annuel + missions
  // défalquées), pour un agent et une année donnés — tableau "Soldes de
  // congé annuel" et report du reliquat. Avant le 24/09/2026 les missions
  // n'étaient pas comptées ici : le Chef de service/Direction/DRH voyaient
  // un solde plus élevé que celui affiché à l'agent sur son tableau de bord.
  function consommeAnnee(agentId: string, annee: number): number {
    return joursConsommes(agentId, annee, demandes, missionsAccordees);
  }

  // Solde réellement disponible pour un agent à l'instant présent (congé
  // annuel + missions défalquées, année en cours) — utilisé pour bloquer/
  // avertir à la décision d'un congé (ci-dessous) ou d'une mission
  // (MissionsPage). Recalculé à chaque rendu à partir des données déjà en
  // mémoire : accorder une demande recharge la liste, donc ce chiffre
  // reflète bien "ce qui reste" après une 1re décision avant d'en traiter
  // une 2e pour le même agent (voir demande du commanditaire du 15/09/2026).
  function disponiblePourAgent(agentId: string): number {
    const soldeReport = agentsSolde.find((a) => a.id === agentId)?.solde_report ?? 0;
    const consomme = joursConsommes(agentId, ANNEE_EN_COURS, demandes, missionsAccordees);
    return soldeDisponible(soldeReport, consomme);
  }

  // Dépassement (en jours) qu'entraînerait l'accord de `d` avec son
  // ajustement en cours — 0 si tout rentre dans le solde disponible, ou si
  // ce n'est pas un congé annuel défalqué (seul cas concerné ici : les
  // autres types ne défalquent jamais le solde).
  function depassementPour(d: DemandeRow): number {
    if (d.type !== 'annuel') return 0;
    const { jours, defalque } = ajustement(d);
    if (!defalque) return 0;
    const dispo = disponiblePourAgent(d.agent_id);
    return Math.max(0, (Number(jours) || d.jours) - dispo);
  }

  function soldeAffiche(a: AgentSoldeRow): string {
    return editionsSolde[a.id] ?? String(a.solde_report);
  }

  function reporterReliquat(a: AgentSoldeRow) {
    const reliquat = Math.max(0, DROIT_ANNUEL - consommeAnnee(a.id, ANNEE_PRECEDENTE));
    setEditionsSolde((e) => ({ ...e, [a.id]: String(a.solde_report + reliquat) }));
  }

  async function enregistrerSolde(a: AgentSoldeRow) {
    const valeur = Number(soldeAffiche(a));
    if (Number.isNaN(valeur) || valeur < 0) return;
    setEnregistrementSolde(a.id);
    const { error } = await supabase.from('agents').update({ solde_report: valeur }).eq('id', a.id);
    setEnregistrementSolde(null);
    if (error) {
      console.error('Erreur d’enregistrement du solde reporté :', error);
      return;
    }
    setEditionsSolde((e) => {
      const { [a.id]: _retire, ...reste } = e;
      return reste;
    });
    recharger();
  }

  const recharger = useCallback(async () => {
    const [demandesRes, agentsRes, agentsSoldeRes, missionsRes] = await Promise.all([
      supabase
        .from('demandes_conge')
        // `agents:agent_id` lève l'ambiguïté : demandes_conge a 2 clés étrangères
        // vers `agents` (agent_id = demandeur, decide_par = qui a validé/refusé) —
        // sans précision, PostgREST refuse de choisir et l'appel échoue.
        .select(
          'id, ref, agent_id, type, jours, statut, defalque_solde, solde_depasse, remplacant_nom, created_at, decide_le, certificat_url, agent:agents!agent_id(nom, prenom, role, service_id, service:services(nom)), fractions:conge_fractions(debut, fin)',
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('agents')
        .select('id', { count: 'exact', head: true })
        .eq('statut', 'Actif')
        .neq('role', 'Administrateur'),
      supabase
        .from('agents')
        .select('id, nom, prenom, solde_report, service:services(nom)')
        .eq('statut', 'Actif')
        .neq('role', 'Administrateur')
        .order('nom'),
      // Missions défalquées déjà accordées — nécessaires pour calculer le
      // solde réellement disponible d'un agent avant d'accorder un congé
      // annuel (voir `disponiblePourAgent`). Colonnes déjà accordées en
      // lecture à `authenticated` sur la table `missions` (pas besoin de la
      // vue `missions_pour_personnel`, aucune n'est confidentielle ici).
      supabase.from('missions').select('agent_id, statut, defalque_solde, jours, debut').eq('statut', 'Accordé').eq('defalque_solde', true),
    ]);
    if (demandesRes.error) {
      console.error('Erreur de chargement des demandes de congé :', demandesRes.error);
      return;
    }
    if (agentsRes.error) {
      console.error('Erreur de chargement de l’effectif :', agentsRes.error);
    } else {
      setEffectifTotal(agentsRes.count ?? 0);
    }
    if (agentsSoldeRes.error) {
      console.error('Erreur de chargement des soldes de congé :', agentsSoldeRes.error);
    } else {
      setAgentsSolde((agentsSoldeRes.data as unknown as AgentSoldeRow[]) ?? []);
    }
    if (missionsRes.error) {
      console.error('Erreur de chargement des missions défalquées :', missionsRes.error);
    } else {
      setMissionsAccordees((missionsRes.data as MissionAccordeeRow[]) ?? []);
    }
    setDemandes((demandesRes.data as unknown as DemandeRow[]) ?? []);
  }, []);

  useEffect(() => {
    setChargement(true);
    recharger().finally(() => setChargement(false));
  }, [recharger]);

  async function accorder(d: DemandeRow) {
    // Décision finale immédiate, quel que soit qui accorde (Chef de
    // service, DRH, Direction pour un chef/la DRH, ou Administrateur) —
    // simplifié le 11/09/2026 : l'ancien circuit à 2 niveaux ("Validé chef"
    // en attente d'une confirmation DRH) était jugé confus par le
    // commanditaire, notamment parce que rien n'indiquait clairement que la
    // décision du chef n'était que provisoire.
    // Le validateur peut avoir ajusté le nombre de jours retenu et/ou décidé
    // de ne pas défalquer le solde annuel — voir `ajustement()`/`majAjustement()`.

    // 15/09/2026, demande du commanditaire : un congé annuel qui dépasse le
    // solde disponible de l'agent ne part pas au 1er clic — le panneau
    // affiche le dépassement (voir JSX) et ce 1er clic ne fait qu'armer la
    // confirmation ; il faut recliquer pour accorder malgré le dépassement
    // (traçé ensuite via `solde_depasse`).
    const depassement = depassementPour(d);
    if (depassement > 0 && !depassementConfirme[d.id]) {
      setDepassementConfirme((c) => ({ ...c, [d.id]: true }));
      return;
    }

    const { jours, defalque } = ajustement(d);
    setBusyId(d.id);
    const { error } = await supabase
      .from('demandes_conge')
      .update({
        statut: 'Accordé',
        jours: Number(jours) || d.jours,
        defalque_solde: defalque,
        decide_par: agent?.id,
        decide_le: new Date().toISOString(),
        solde_depasse: depassement > 0,
      })
      .eq('id', d.id);
    setBusyId(null);
    if (error) {
      console.error('Erreur de validation :', error);
      return;
    }
    setAjustements((a) => {
      const { [d.id]: _retire, ...reste } = a;
      return reste;
    });
    setDepassementConfirme((c) => {
      const { [d.id]: _retire, ...reste } = c;
      return reste;
    });
    setLigneEnDecision(null);
    recharger();
  }

  async function refuser(d: DemandeRow) {
    setBusyId(d.id);
    const { error } = await supabase
      .from('demandes_conge')
      .update({ statut: 'Refusé', decide_par: agent?.id, decide_le: new Date().toISOString() })
      .eq('id', d.id);
    setBusyId(null);
    if (error) {
      console.error('Erreur de refus :', error);
      return;
    }
    setLigneEnDecision(null);
    recharger();
  }

  // 15/09/2026 : le certificat n'était jamais consultable par le
  // validateur (bucket de stockage manquant, voir migration
  // stockage_certificats_medicaux) — corrigé. Bucket privé : on génère une
  // URL signée à la demande plutôt qu'un lien public.
  const [ouvertureCertificat, setOuvertureCertificat] = useState<string | null>(null);

  async function voirCertificat(d: DemandeRow) {
    if (!d.certificat_url) return;
    setOuvertureCertificat(d.id);
    const { data, error } = await supabase.storage
      .from('certificats-medicaux')
      .createSignedUrl(d.certificat_url, 60);
    setOuvertureCertificat(null);
    if (error || !data) {
      console.error('Erreur d’accès au certificat :', error);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return demandes.filter((d) => {
      const matchFiltre =
        filtre === 'Toutes' ||
        d.statut === filtre ||
        (filtre === 'En attente' && d.statut === 'Validé chef');
      const nomAgent = `${d.agent?.nom ?? ''} ${d.agent?.prenom ?? ''}`.toLowerCase();
      const service = (d.agent?.service?.nom ?? '').toLowerCase();
      const matchRecherche = !q || nomAgent.includes(q) || service.includes(q);
      return matchFiltre && matchRecherche;
    });
  }, [demandes, filtre, recherche]);

  const enAttente = demandes.filter((d) => d.statut === 'En attente' || d.statut === 'Validé chef').length;

  // Jours de congé accordés dont au moins une période démarre ce mois-ci.
  const joursCeMois = demandes
    .filter((d) => d.statut === 'Accordé')
    .flatMap((d) => d.fractions.map((f) => ({ jours: d.jours, debut: new Date(f.debut) })))
    .filter((f) => f.debut.getFullYear() === ANNEE_EN_COURS && f.debut.getMonth() === MOIS_EN_COURS)
    .reduce((somme, f) => somme + f.jours, 0);

  // Agents dont une période accordée couvre aujourd'hui.
  const agentsEnCongeAujourdhui = new Set(
    demandes
      .filter((d) => d.statut === 'Accordé' && d.fractions.some((f) => f.debut <= AUJOURDHUI_ISO && f.fin >= AUJOURDHUI_ISO))
      .map((d) => d.agent_id),
  ).size;

  if (chargement) {
    return <div className="comptes-page__chargement">Chargement…</div>;
  }

  return (
    <div className="drh-page">
      <div className="drh-page__kpis">
        <div className="kpi-card">
          <div className="card-label">À traiter</div>
          <div className="kpi-card__value">{enAttente}</div>
          <div className="kpi-card__sous">demandes en attente</div>
        </div>
        <div className="kpi-card">
          <div className="card-label">Ce mois</div>
          <div className="kpi-card__value">{joursCeMois} j</div>
          <div className="kpi-card__sous">congés accordés</div>
        </div>
        <div className="kpi-card">
          <div className="card-label">Agents en congé</div>
          <div className="kpi-card__value">
            {agentsEnCongeAujourdhui}/{effectifTotal}
          </div>
          <div className="kpi-card__sous">agents, aujourd’hui</div>
        </div>
      </div>

      <div className="data-table">
        <div className="data-table__toolbar">
          <div className="data-table__title">Demandes de congé</div>
          <SegmentedControl
            options={(['Toutes', 'En attente', 'Accordé', 'Refusé'] as Filtre[]).map((f) => ({
              value: f,
              label: f,
            }))}
            value={filtre}
            onChange={setFiltre}
          />
          <span style={{ flex: 1 }} />
          <input
            className="search-input"
            placeholder="Rechercher un agent…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {/* Réservé aux rôles qui voient déjà le détail de tout le monde à
              l'écran — un Agent ne doit pas pouvoir exporter en masse ce
              qu'on lui masque justement ligne par ligne (jours des autres). */}
          {role !== 'Agent' && (
            <button type="button" className="btn btn--outline-xs" onClick={() => exportCsv(filtrees)}>
              Exporter CSV
            </button>
          )}
        </div>
        <div className="data-table__scroll">
          <div className="data-table__row data-table__head drh-row">
            <div>Référence</div>
            <div>Agent</div>
            <div>Type</div>
            <div>Jours</div>
            <div>Période</div>
            <div>Remplaçant</div>
            <div>Statut</div>
            <div>Action</div>
          </div>
          {filtrees.length === 0 && (
            <div className="data-table__empty">Aucune demande ne correspond à ce filtre.</div>
          )}
          {filtrees.map((d) => (
            <div key={d.id}>
              <div className="data-table__row drh-row">
                <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{d.ref}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {d.agent?.nom} {d.agent?.prenom}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                    {d.agent?.service?.nom ?? '—'}
                  </div>
                  {/* 15/09/2026, demande du commanditaire : positionné au
                      niveau de l'agent concerné (pas sous le type), pour
                      qu'il soit clair à qui appartient le certificat. */}
                  {d.type === 'maladie' && d.certificat_url && (
                    <button
                      type="button"
                      className="btn btn--outline-xs"
                      style={{ marginTop: 4 }}
                      disabled={ouvertureCertificat === d.id}
                      onClick={() => voirCertificat(d)}
                    >
                      {ouvertureCertificat === d.id ? '…' : '📄 Certificat'}
                    </button>
                  )}
                </div>
                <div style={{ color: 'var(--color-text-secondary)' }}>{libelleTypeConge(d.type)}</div>
                {/* 15/09/2026, demande du commanditaire : un Agent normal ne
                    doit pas connaître le nombre de jours accordés aux
                    autres — seulement pour ses propres demandes. */}
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {role === 'Agent' && d.agent_id !== agent?.id ? '—' : d.jours}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {periodeFractions(d.fractions)}
                </div>
                <div style={{ color: 'var(--color-text-secondary)' }}>{d.remplacant_nom ?? '—'}</div>
                <div>
                  <StatusPill statut={d.statut} />
                  {/* 15/09/2026, demande du commanditaire : traçabilité — ce
                      congé a été accordé au-delà du solde disponible de
                      l'agent, sur décision explicite du validateur. */}
                  {d.solde_depasse && (
                    <span className="drh-page__surplus-badge" title="Accordé au-delà du solde disponible de l’agent">
                      ⚠ Surplus
                    </span>
                  )}
                </div>
                <div className="data-table__actions">
                  {/* Chef de service et DRH ont chacun un pouvoir de décision
                      finale immédiat et équivalent (11/09/2026) — jamais sur
                      sa propre demande. Direction : lecture seule partout,
                      SAUF la demande d'un Chef de service ou de la DRH,
                      qu'elle tranche seule. Administrateur : tout, toujours. */}
                  {peutAgirSur(d) &&
                    (ligneEnDecision === d.id ? (
                      <span className="data-table__en-cours">Décision ci-dessous ↓</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--approve"
                          disabled={busyId === d.id}
                          onClick={() => setLigneEnDecision(d.id)}
                        >
                          Accorder
                        </button>
                        <button
                          type="button"
                          className="btn btn--refuse"
                          disabled={busyId === d.id}
                          onClick={() => refuser(d)}
                        >
                          Refuser
                        </button>
                      </>
                    ))}
                </div>
              </div>

              {ligneEnDecision === d.id && (
                <div className="decision-panel">
                  <div className="decision-panel__contexte">
                    Accorder le congé de <strong>{d.agent?.nom} {d.agent?.prenom}</strong>
                    {' — '}
                    {libelleTypeConge(d.type)}, {periodeFractions(d.fractions)}
                  </div>
                  <div className="decision-panel__champs">
                    <label className="decision-panel__champ">
                      <span className="decision-panel__label">Jours à accorder</span>
                      <input
                        type="number"
                        min={0}
                        className="decision-panel__jours"
                        value={ajustement(d).jours}
                        onChange={(e) => majAjustement(d, { jours: e.target.value })}
                      />
                    </label>
                    <label className="decision-panel__toggle">
                      <input
                        type="checkbox"
                        checked={ajustement(d).defalque}
                        onChange={(e) => majAjustement(d, { defalque: e.target.checked })}
                      />
                      <span className="decision-panel__toggle-track">
                        <span className="decision-panel__toggle-thumb" />
                      </span>
                      <span>
                        Défalquer du solde annuel
                        <span className="decision-panel__label-sous">
                          Décochez pour accorder sans que ça compte dans le solde de l’agent
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* 15/09/2026, demande du commanditaire : dépasser le
                      solde disponible de l'agent n'est pas bloqué, mais
                      jamais silencieux — 1er clic sur "Confirmer" arme cet
                      avertissement, il faut recliquer pour accorder malgré
                      le dépassement (tracé ensuite, voir `solde_depasse`). */}
                  {depassementPour(d) > 0 && (
                    <div className="decision-panel__alerte-solde">
                      ⚠️ {d.agent?.nom} {d.agent?.prenom} ne dispose que de {disponiblePourAgent(d.agent_id)} j —
                      cette décision dépasse son solde de {depassementPour(d)} j.
                      {depassementConfirme[d.id]
                        ? ' Recliquez sur "Confirmer le surplus" pour l’accorder quand même.'
                        : ' Vous pouvez tout de même l’accorder à titre exceptionnel.'}
                    </div>
                  )}

                  <div className="decision-panel__actions">
                    <button type="button" className="btn btn--outline-sm" onClick={() => setLigneEnDecision(null)}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      className={depassementPour(d) > 0 ? 'btn btn--outline-orange' : 'btn btn--approve'}
                      disabled={busyId === d.id}
                      onClick={() => accorder(d)}
                    >
                      {busyId === d.id
                        ? 'Confirmation…'
                        : depassementPour(d) > 0
                          ? 'Confirmer le surplus exceptionnel'
                          : 'Confirmer l’accord'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 15/09/2026, demande du commanditaire : un Agent normal ne doit pas
          voir le solde de congé annuel des autres — tout ce tableau
          comparatif lui est masqué. Il garde la visibilité de son propre
          solde ailleurs (tableau de bord personnel, AccueilPage). */}
      {role !== 'Agent' && (
      <div className="data-table">
        <div className="data-table__toolbar">
          <div className="data-table__title">Soldes de congé annuel</div>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Disponible = reporté + {DROIT_ANNUEL} j (droit {ANNEE_EN_COURS}) − déjà accordé cette année
          </span>
        </div>
        <div className="data-table__scroll">
          <div className="data-table__row data-table__head solde-row">
            <div>Agent</div>
            <div>Service</div>
            <div>Reporté</div>
            <div>Consommé {ANNEE_EN_COURS}</div>
            <div>Disponible</div>
            {peutGererSolde && <div>Action</div>}
          </div>
          {agentsSolde.map((a) => {
            const consomme = consommeAnnee(a.id, ANNEE_EN_COURS);
            const enEdition = editionsSolde[a.id] !== undefined;
            const disponible = a.solde_report + DROIT_ANNUEL - consomme;
            return (
              <div className="data-table__row solde-row" key={a.id}>
                <div style={{ fontWeight: 500 }}>
                  {a.nom} {a.prenom}
                </div>
                <div style={{ color: 'var(--color-text-secondary)' }}>{a.service?.nom ?? '—'}</div>
                <div>
                  {peutGererSolde ? (
                    <input
                      type="number"
                      min={0}
                      className="solde-row__input"
                      value={soldeAffiche(a)}
                      onChange={(e) => setEditionsSolde((ed) => ({ ...ed, [a.id]: e.target.value }))}
                    />
                  ) : (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{a.solde_report}</span>
                  )}
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>{consomme}</div>
                <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{disponible} j</div>
                {peutGererSolde && (
                  <div className="data-table__actions">
                    <button type="button" className="btn btn--outline-xs" onClick={() => reporterReliquat(a)}>
                      Reporter le reliquat {ANNEE_PRECEDENTE}
                    </button>
                    {enEdition && (
                      <button
                        type="button"
                        className="btn btn--approve"
                        disabled={enregistrementSolde === a.id}
                        onClick={() => enregistrerSolde(a)}
                      >
                        {enregistrementSolde === a.id ? '…' : 'Enregistrer'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

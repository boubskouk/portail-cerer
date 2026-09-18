import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { libelleTypeConge } from '../CongeForm/congeData';
import type { LeaveType, Role, Statut } from '../../types';
import './StatsPage.css';

const ANNEE_EN_COURS = new Date().getFullYear();
const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

interface AgentRow {
  id: string;
  role: Role;
  statut: 'Actif' | 'Désactivé';
  service: { nom: string } | null;
}

interface CongeRow {
  agent_id: string;
  type: LeaveType;
  statut: Statut;
  jours: number;
  fractions: { debut: string }[];
}

interface MissionRow {
  agent_id: string;
  statut: Statut;
  jours: number;
  debut: string;
}

function telechargerCsv(nomFichier: string, entetes: string[], lignes: (string | number)[][]) {
  const csv = [entetes, ...lignes]
    .map((ligne) => ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}

// Statistiques RH (14/09/2026, demande du commanditaire) : jusqu'ici un
// simple écran vide (StubPage). Vue d'ensemble en lecture seule pour
// DRH/Direction/Administrateur (seuls rôles ayant ce module dans leur menu,
// voir data/nav.ts) — la gestion du solde de congé reporté, elle, vit dans
// DrhPage (accessible aussi au Chef de service, qui n'a pas cet écran-ci).
export function StatsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [conges, setConges] = useState<CongeRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [chargement, setChargement] = useState(true);

  // Rapport complet (15/09/2026, demande du commanditaire) : sur une
  // période choisie (typiquement l'année écoulée), le détail ligne par
  // ligne de TOUTES les demandes — congés, missions, matériel — pas
  // seulement les agrégats déjà couverts par "Exporter le rapport"
  // ci-dessus. Requêtes dédiées, déclenchées seulement au clic (rapport
  // occasionnel, pas de raison de charger tout ce détail à chaque visite
  // de l'écran).
  const [rapportDebut, setRapportDebut] = useState(`${ANNEE_EN_COURS}-01-01`);
  const [rapportFin, setRapportFin] = useState(`${ANNEE_EN_COURS}-12-31`);
  const [genererEnCours, setGenererEnCours] = useState(false);
  const [erreurRapport, setErreurRapport] = useState<string | undefined>();

  useEffect(() => {
    Promise.all([
      supabase.from('agents').select('id, role, statut, service:services(nom)'),
      supabase
        .from('demandes_conge')
        .select('agent_id, type, statut, jours, fractions:conge_fractions(debut)'),
      supabase.from('missions').select('agent_id, statut, jours, debut'),
    ]).then(([agentsRes, congesRes, missionsRes]) => {
      if (agentsRes.error) console.error('Erreur de chargement des agents :', agentsRes.error);
      else setAgents((agentsRes.data as unknown as AgentRow[]) ?? []);
      if (congesRes.error) console.error('Erreur de chargement des congés :', congesRes.error);
      else setConges((congesRes.data as unknown as CongeRow[]) ?? []);
      if (missionsRes.error) console.error('Erreur de chargement des missions :', missionsRes.error);
      else setMissions((missionsRes.data as unknown as MissionRow[]) ?? []);
      setChargement(false);
    });
  }, []);

  const stats = useMemo(() => {
    const actifs = agents.filter((a) => a.statut === 'Actif');

    const parService = new Map<string, number>();
    for (const a of actifs) {
      const nom = a.service?.nom ?? 'Sans service';
      parService.set(nom, (parService.get(nom) ?? 0) + 1);
    }

    const parRole = new Map<string, number>();
    for (const a of actifs) {
      parRole.set(a.role, (parRole.get(a.role) ?? 0) + 1);
    }

    const congesAnnee = conges.filter((c) => c.fractions.some((f) => f.debut.slice(0, 4) === String(ANNEE_EN_COURS)));
    const congeParStatut = new Map<string, number>();
    for (const c of congesAnnee) {
      congeParStatut.set(c.statut, (congeParStatut.get(c.statut) ?? 0) + 1);
    }
    const congeParType = new Map<string, { nombre: number; jours: number }>();
    for (const c of congesAnnee.filter((c) => c.statut === 'Accordé')) {
      const entree = congeParType.get(c.type) ?? { nombre: 0, jours: 0 };
      entree.nombre += 1;
      entree.jours += c.jours;
      congeParType.set(c.type, entree);
    }
    const joursCongeAccordes = [...congeParType.values()].reduce((s, v) => s + v.jours, 0);

    const missionsAnnee = missions.filter((m) => m.debut.slice(0, 4) === String(ANNEE_EN_COURS));
    const missionsAccordees = missionsAnnee.filter((m) => m.statut === 'Accordé' || m.statut === 'Terminé');
    const joursMission = missionsAccordees.reduce((s, m) => s + m.jours, 0);
    const missionParStatut = new Map<string, number>();
    for (const m of missionsAnnee) {
      missionParStatut.set(m.statut, (missionParStatut.get(m.statut) ?? 0) + 1);
    }

    // Tendance mensuelle : jours de congé + de mission accordés, par mois de
    // départ, sur l'année en cours — un seul graphique combiné plutôt que
    // deux séparés, pour voir les pics d'absence toutes causes confondues.
    // Pour un congé fractionné, chaque fraction compte une part égale des
    // jours totaux de la demande — approximation raisonnable pour une
    // tendance visuelle, pas un décompte comptable au jour près.
    const joursCongeParMois = new Array(12).fill(0);
    for (const c of congesAnnee.filter((c) => c.statut === 'Accordé')) {
      for (const f of c.fractions) {
        if (f.debut.slice(0, 4) === String(ANNEE_EN_COURS)) {
          const m = Number(f.debut.slice(5, 7)) - 1;
          joursCongeParMois[m] += c.jours / c.fractions.length;
        }
      }
    }
    const joursMissionParMois = new Array(12).fill(0);
    for (const m of missionsAccordees) {
      const mois = Number(m.debut.slice(5, 7)) - 1;
      joursMissionParMois[mois] += m.jours;
    }
    const tendanceFinale = MOIS_LABELS.map((label, i) => ({
      label,
      conge: Math.round(joursCongeParMois[i]),
      mission: Math.round(joursMissionParMois[i]),
    }));

    return {
      effectifActif: actifs.length,
      parService: [...parService.entries()].sort((a, b) => b[1] - a[1]),
      parRole: [...parRole.entries()].sort((a, b) => b[1] - a[1]),
      congeParStatut,
      congeParType: [...congeParType.entries()],
      joursCongeAccordes,
      missionsTotal: missionsAnnee.length,
      joursMission,
      missionParStatut,
      tendanceFinale,
    };
  }, [agents, conges, missions]);

  // Rapport complet sur une période choisie : résumé + détail ligne par
  // ligne de
  // TOUTES les demandes (congés, missions, matériel) déposées dans cette
  // fenêtre — pas juste les agrégats de "Exporter le rapport" ci-dessus.
  // Requêtes à part, avec le détail nécessaire (agent, service, décideur),
  // que le chargement initial de l'écran ne charge pas.
  async function genererRapportComplet() {
    setErreurRapport(undefined);
    if (!rapportDebut || !rapportFin || rapportDebut > rapportFin) {
      setErreurRapport('Période invalide : la date de début doit précéder la date de fin.');
      return;
    }
    setGenererEnCours(true);

    const finInclusive = `${rapportFin}T23:59:59`;

    const [congesRes, missionsRes, materielRes, agentsNomsRes] = await Promise.all([
      supabase
        .from('demandes_conge')
        .select(
          'ref, type, jours, statut, motif, remplacant_nom, created_at, decide_le, defalque_solde, agent:agents!agent_id(nom, prenom, service:services(nom)), decideur:agents!decide_par(nom, prenom), fractions:conge_fractions(debut, fin)',
        )
        .gte('created_at', rapportDebut)
        .lte('created_at', finInclusive),
      // missions_pour_personnel (pas la table missions directement) : la
      // vue masque déjà la destination selon le rôle, aucune fuite possible
      // même dans un export. Filtrée sur les dates de mission (période
      // couverte), pas la date de dépôt.
      supabase
        .from('missions_pour_personnel')
        .select('ref, agent_id, destination, debut, fin, jours, motif, remplacant_nom, statut, defalque_solde')
        .gte('debut', rapportDebut)
        .lte('debut', rapportFin),
      supabase
        .from('demandes_materiel')
        .select(
          'ref, categorie, article, qte, statut, justification, created_at, livre_le, agent:agents!agent_id(nom, prenom, service:services(nom))',
        )
        .gte('created_at', rapportDebut)
        .lte('created_at', finInclusive),
      // La vue missions_pour_personnel n'embarque pas l'agent via
      // PostgREST de façon fiable (même souci documenté dans
      // MissionsPage/AbsencesPage) — noms récupérés à part et fusionnés
      // ci-dessous.
      supabase.from('agents').select('id, nom, prenom, service:services(nom)'),
    ]);

    setGenererEnCours(false);

    if (congesRes.error || missionsRes.error || materielRes.error || agentsNomsRes.error) {
      console.error(
        'Erreur de génération du rapport :',
        congesRes.error ?? missionsRes.error ?? materielRes.error ?? agentsNomsRes.error,
      );
      setErreurRapport('Échec de la génération du rapport. Réessayez.');
      return;
    }

    const agentsParId = new Map(
      ((agentsNomsRes.data as unknown as { id: string; nom: string; prenom: string; service: { nom: string } | null }[]) ?? []).map(
        (a) => [a.id, a],
      ),
    );

    type CongeDetail = {
      ref: string; type: LeaveType; jours: number; statut: Statut; motif: string | null; remplacant_nom: string | null;
      created_at: string; decide_le: string | null; defalque_solde: boolean;
      agent: { nom: string; prenom: string; service: { nom: string } | null } | null;
      decideur: { nom: string; prenom: string } | null;
      fractions: { debut: string; fin: string }[];
    };
    type MissionDetail = {
      ref: string; destination: string | null; debut: string; fin: string; jours: number; motif: string | null;
      remplacant_nom: string | null; statut: Statut; defalque_solde: boolean; agent_id: string;
    };
    type MaterielDetail = {
      ref: string; categorie: string; article: string; qte: number; statut: Statut; justification: string | null;
      created_at: string; livre_le: string | null;
      agent: { nom: string; prenom: string; service: { nom: string } | null } | null;
    };

    const conges2 = (congesRes.data as unknown as CongeDetail[]) ?? [];
    const missions2 = (missionsRes.data as unknown as MissionDetail[]) ?? [];
    const materiel2 = (materielRes.data as unknown as MaterielDetail[]) ?? [];

    // Résumé de la période choisie — un seul bouton, un seul fichier :
    // chiffres agrégés d'abord, détail ligne par ligne ensuite.
    const congeParStatutPeriode = new Map<string, number>();
    for (const c of conges2) congeParStatutPeriode.set(c.statut, (congeParStatutPeriode.get(c.statut) ?? 0) + 1);
    const joursCongeAccordesPeriode = conges2.filter((c) => c.statut === 'Accordé').reduce((s, c) => s + c.jours, 0);
    const missionsAccordeesPeriode = missions2.filter((m) => m.statut === 'Accordé' || m.statut === 'Terminé');
    const joursMissionPeriode = missionsAccordeesPeriode.reduce((s, m) => s + m.jours, 0);
    const materielParStatutPeriode = new Map<string, number>();
    for (const m of materiel2) materielParStatutPeriode.set(m.statut, (materielParStatutPeriode.get(m.statut) ?? 0) + 1);

    const lignes: (string | number)[][] = [
      [`Rapport complet CERER — du ${rapportDebut} au ${rapportFin}`],
      [],
      ['Résumé de la période'],
      ['Congés déposés', conges2.length],
      ...[...congeParStatutPeriode.entries()].map(([statut, n]) => [`  dont ${statut}`, n]),
      ['Jours de congé accordés', joursCongeAccordesPeriode],
      ['Ordres de mission déposés', missions2.length],
      ['Jours de mission (accordés/terminés)', joursMissionPeriode],
      ['Demandes de matériel déposées', materiel2.length],
      ...[...materielParStatutPeriode.entries()].map(([statut, n]) => [`  dont ${statut}`, n]),
      [],
      [`Congés déposés (${conges2.length})`],
      ['Référence', 'Agent', 'Service', 'Type', 'Jours', 'Période', 'Statut', 'Décidé par', 'Décidé le', 'Défalqué', 'Remplaçant', 'Motif', 'Déposé le'],
      ...conges2.map((c) => [
        c.ref,
        c.agent ? `${c.agent.nom} ${c.agent.prenom}` : '',
        c.agent?.service?.nom ?? '',
        libelleTypeConge(c.type),
        c.jours,
        c.fractions.map((f) => `${f.debut}→${f.fin}`).join(' / '),
        c.statut,
        c.decideur ? `${c.decideur.nom} ${c.decideur.prenom}` : '',
        c.decide_le ?? '',
        c.defalque_solde ? 'Oui' : 'Non',
        c.remplacant_nom ?? '',
        c.motif ?? '',
        c.created_at.slice(0, 10),
      ]),
      [],
      [`Ordres de mission déposés (${missions2.length})`],
      ['Référence', 'Agent', 'Service', 'Destination', 'Début', 'Fin', 'Jours', 'Statut', 'Défalqué', 'Remplaçant', 'Motif'],
      ...missions2.map((m) => {
        const a = agentsParId.get(m.agent_id);
        return [
          m.ref,
          a ? `${a.nom} ${a.prenom}` : '',
          a?.service?.nom ?? '',
          m.destination ?? 'Confidentiel',
          m.debut,
          m.fin,
          m.jours,
          m.statut,
          m.defalque_solde ? 'Oui' : 'Non',
          m.remplacant_nom ?? '',
          m.motif ?? '',
        ];
      }),
      [],
      [`Demandes de matériel déposées (${materiel2.length})`],
      ['Référence', 'Agent', 'Service', 'Catégorie', 'Article', 'Qté', 'Statut', 'Justification', 'Déposée le', 'Livrée le'],
      ...materiel2.map((m) => [
        m.ref,
        m.agent ? `${m.agent.nom} ${m.agent.prenom}` : '',
        m.agent?.service?.nom ?? '',
        m.categorie,
        m.article,
        m.qte,
        m.statut,
        m.justification ?? '',
        m.created_at.slice(0, 10),
        m.livre_le ? m.livre_le.slice(0, 10) : '',
      ]),
    ];

    telechargerCsv(`rapport-complet-cerer-${rapportDebut}-au-${rapportFin}.csv`, [`Rapport ${rapportDebut} → ${rapportFin}`], lignes);
  }

  if (chargement) {
    return <div className="comptes-page__chargement">Chargement…</div>;
  }

  const maxTendance = Math.max(1, ...stats.tendanceFinale.map((t) => t.conge + t.mission));
  const maxService = Math.max(1, ...stats.parService.map(([, n]) => n));

  return (
    <div className="stats-page">
      <div className="comptes-page__kpis">
        <div className="kpi-card">
          <div className="card-label">Effectif actif</div>
          <div className="kpi-card__value">{stats.effectifActif}</div>
          <div className="kpi-card__sous">agents</div>
        </div>
        <div className="kpi-card">
          <div className="card-label">Congés {ANNEE_EN_COURS}</div>
          <div className="kpi-card__value">{stats.joursCongeAccordes} j</div>
          <div className="kpi-card__sous">accordés au total</div>
        </div>
        <div className="kpi-card">
          <div className="card-label">Missions {ANNEE_EN_COURS}</div>
          <div className="kpi-card__value">{stats.joursMission} j</div>
          <div className="kpi-card__sous">cumulés ({stats.missionsTotal} demandes)</div>
        </div>
        <div className="kpi-card">
          <div className="card-label">En attente</div>
          <div className="kpi-card__value">
            {(stats.congeParStatut.get('En attente') ?? 0) + (stats.congeParStatut.get('Validé chef') ?? 0)}
          </div>
          <div className="kpi-card__sous">congés à traiter</div>
        </div>
      </div>

      {/* 15/09/2026, demande du commanditaire : rapport complet, sur une
          période choisie (typiquement l'année écoulée), du détail de
          TOUTES les demandes — congés, missions, matériel — pas seulement
          les agrégats du bouton "Exporter le rapport" ci-dessus. */}
      <div className="card stats-page__bloc">
        <div className="stats-page__bloc-titre">Rapport de la période</div>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
          Un seul fichier : le résumé chiffré puis le détail ligne par ligne de toutes les demandes de congé, ordres
          de mission et demandes de matériel déposés sur la période choisie — pratique en fin d'année pour un bilan
          complet.
        </p>
        <div className="stats-page__rapport-form">
          <label className="stats-page__rapport-champ">
            Du
            <input type="date" value={rapportDebut} onChange={(e) => setRapportDebut(e.target.value)} />
          </label>
          <label className="stats-page__rapport-champ">
            Au
            <input type="date" value={rapportFin} onChange={(e) => setRapportFin(e.target.value)} />
          </label>
          <button type="button" className="btn btn--primary-blue" onClick={genererRapportComplet} disabled={genererEnCours}>
            {genererEnCours ? 'Génération…' : 'Exporter le rapport (CSV)'}
          </button>
        </div>
        {erreurRapport && <div className="stats-page__erreur">{erreurRapport}</div>}
      </div>

      <div className="stats-page__grid">
        <div className="card stats-page__bloc">
          <div className="stats-page__bloc-titre">Répartition par service</div>
          <div className="stats-page__barres">
            {stats.parService.map(([nom, n]) => (
              <div className="stats-page__barre-ligne" key={nom}>
                <div className="stats-page__barre-label">{nom}</div>
                <div className="stats-page__barre-piste">
                  <div className="stats-page__barre-remplissage" style={{ width: `${(n / maxService) * 100}%` }} />
                </div>
                <div className="stats-page__barre-valeur">{n}</div>
              </div>
            ))}
            {stats.parService.length === 0 && <div className="accueil__muted-text">Aucun agent actif.</div>}
          </div>
        </div>

        <div className="card stats-page__bloc">
          <div className="stats-page__bloc-titre">Congés {ANNEE_EN_COURS} par type (accordés)</div>
          <div className="data-table__scroll">
            <div className="data-table__row data-table__head stats-type-row">
              <div>Type</div>
              <div>Demandes</div>
              <div>Jours</div>
            </div>
            {stats.congeParType.length === 0 && (
              <div className="data-table__empty">Aucun congé accordé cette année.</div>
            )}
            {stats.congeParType.map(([type, v]) => (
              <div className="data-table__row stats-type-row" key={type}>
                <div>{libelleTypeConge(type as LeaveType)}</div>
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>{v.nombre}</div>
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>{v.jours}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card stats-page__bloc">
        <div className="stats-page__bloc-titre">Tendance mensuelle — jours d'absence ({ANNEE_EN_COURS})</div>
        <div className="stats-page__legende">
          <span className="stats-page__legende-item">
            <span className="stats-page__pastille stats-page__pastille--conge" /> Congé
          </span>
          <span className="stats-page__legende-item">
            <span className="stats-page__pastille stats-page__pastille--mission" /> Mission
          </span>
        </div>
        <div className="stats-page__mois-grille">
          {stats.tendanceFinale.map((t) => (
            <div className="stats-page__mois-colonne" key={t.label}>
              <div className="stats-page__mois-barres" style={{ height: 120 }}>
                <div
                  className="stats-page__mois-barre stats-page__mois-barre--conge"
                  style={{ height: `${(t.conge / maxTendance) * 100}%` }}
                  title={`${t.conge} j de congé`}
                />
                <div
                  className="stats-page__mois-barre stats-page__mois-barre--mission"
                  style={{ height: `${(t.mission / maxTendance) * 100}%` }}
                  title={`${t.mission} j de mission`}
                />
              </div>
              <div className="stats-page__mois-label">{t.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

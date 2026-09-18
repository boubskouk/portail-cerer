import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusPill } from '../components/ui/StatusPill';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';
import { supabase } from '../lib/supabase';
import { libelleTypeConge, periodeFractions } from './CongeForm/congeData';
import { toFr } from '../lib/date';
import { RACCOURCIS, SOLDE_ANNUEL } from '../data/fixtures';
import type { LeaveType, Statut } from '../types';
import './AccueilPage.css';

interface DemandeAgent {
  id: string;
  ref: string;
  type: LeaveType;
  jours: number;
  statut: Statut;
  remplacant_nom: string | null;
  defalque_solde: boolean;
  fractions: { debut: string; fin: string }[];
}

interface ProchaineAbsence {
  periode: string;
  detail: string;
  remplacant: string | null;
}

interface MissionAgent {
  id: string;
  ref: string;
  destination: string | null;
  debut: string;
  fin: string;
  jours: number;
  statut: Statut;
  defalque_solde: boolean;
}

interface MaterielAgent {
  id: string;
  ref: string;
  article: string;
  qte: number;
  statut: Statut;
  created_at: string;
}

const AUJOURDHUI_ISO = new Date().toISOString().slice(0, 10);
const ANNEE_EN_COURS = new Date().getFullYear();

// Un statut est "en cours" (pas encore de décision finale) tant qu'il n'est
// ni accordé/approuvé/livré/terminé (vert) ni refusé/rejeté (rouge) — même
// logique de couleur que STATUT_COLORS, réutilisée ici pour compter à
// travers les 3 types de demandes (congé, mission, matériel) sans dupliquer
// une liste de statuts "finaux" à la main.
const STATUTS_FINAUX: Statut[] = ['Accordé', 'Approuvée', 'Livrée', 'Terminé', 'Refusé', 'Rejetée'];
function estEnCours(statut: Statut): boolean {
  return !STATUTS_FINAUX.includes(statut);
}

// « Mes demandes récentes » et « Demandes en cours » branchés sur les vraies
// demandes de l'agent connecté le 10/09/2026. « Solde de congé annuel » et
// « Prochaine absence » corrigés le 10/09/2026 : ils affichaient encore des
// chiffres fixes identiques pour tout le monde (fixture) — trompeur pendant
// les tests réels, un agent tout juste créé voyait un solde déjà entamé et
// une absence à venir qu'il n'avait jamais demandée. Calculés maintenant à
// partir des congés réellement accordés de l'agent.
export function AccueilPage() {
  const { agent } = useAuth();
  const { role } = useRole();
  const navigate = useNavigate();
  const [demandes, setDemandes] = useState<DemandeAgent[]>([]);
  const [chargement, setChargement] = useState(true);

  const [missions, setMissions] = useState<MissionAgent[]>([]);
  // 15/09/2026, demande du commanditaire : l'agent voyait déjà "Mes
  // demandes récentes" (congé) et "Mes ordres de mission" sur son tableau
  // de bord, mais aucune trace de ses demandes de matériel — pas de vision
  // globale sur les 3 types de demandes possibles. Ajout du même schéma de
  // liste pour le matériel, ci-dessous.
  const [materiel, setMateriel] = useState<MaterielAgent[]>([]);

  // 15/09/2026, demande du commanditaire : le tableau de bord était
  // strictement identique pour tous les rôles (centré sur "mes propres"
  // congés/missions), sans rien refléter le rôle de validateur du Chef de
  // service. Ajout d'un total "à traiter" tous types confondus (congés +
  // missions + matériel, de tout le personnel, pas seulement son service —
  // cohérent avec le Chef de service transversal unique du CERER).
  // Étendu à la DRH le 15/09/2026 (même besoin signalé pour elle) — mais
  // sans le compteur missions : la DRH suit les ordres de mission en
  // lecture seule, elle ne les valide jamais (seuls Chef de service et
  // Administrateur le font, voir MissionsPage.peutAgirSur), donc ce
  // chiffre ne serait pas vraiment "à traiter" pour elle.
  const [aTraiter, setATraiter] = useState<{ conges: number; missions: number; materiel: number } | null>(null);

  const recharger = useCallback(async () => {
    if (!agent) return;
    const [congesRes, missionsRes, materielRes] = await Promise.all([
      supabase
        .from('demandes_conge')
        .select('id, ref, type, jours, statut, remplacant_nom, defalque_solde, fractions:conge_fractions(debut, fin)')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false }),
      // Une mission peut, sur décision du Chef de service à la validation,
      // aussi défalquer le solde annuel — pas automatique (voir migration
      // ordres_de_mission_regles_completes). Lecture via la vue
      // `missions_pour_personnel` (pas la table `missions` directement, dont
      // l'accès a été retiré) — la destination reste `null` ici même pour
      // ses propres missions : réservée à CSA/DRH/Direction/Administrateur,
      // strictement, sans exception pour l'agent demandeur (11/09/2026).
      supabase
        .from('missions_pour_personnel')
        .select('id, ref, destination, debut, fin, jours, statut, defalque_solde')
        .eq('agent_id', agent.id)
        .order('debut', { ascending: false }),
      supabase
        .from('demandes_materiel')
        .select('id, ref, article, qte, statut, created_at')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false }),
    ]);
    if (congesRes.error) {
      console.error('Erreur de chargement de mes demandes de congé :', congesRes.error);
      return;
    }
    if (missionsRes.error) {
      console.error('Erreur de chargement de mes missions :', missionsRes.error);
    } else {
      setMissions((missionsRes.data as MissionAgent[]) ?? []);
    }
    if (materielRes.error) {
      console.error('Erreur de chargement de mes demandes de matériel :', materielRes.error);
    } else {
      setMateriel((materielRes.data as MaterielAgent[]) ?? []);
    }
    setDemandes((congesRes.data as unknown as DemandeAgent[]) ?? []);
  }, [agent]);

  useEffect(() => {
    setChargement(true);
    recharger().finally(() => setChargement(false));
  }, [recharger]);

  useEffect(() => {
    if (role !== 'Chef de service' && role !== 'DRH') return;
    Promise.all([
      supabase.from('demandes_conge').select('id', { count: 'exact', head: true }).in('statut', ['En attente', 'Validé chef']),
      supabase.from('missions').select('id', { count: 'exact', head: true }).eq('statut', 'En attente'),
      supabase.from('demandes_materiel').select('id', { count: 'exact', head: true }).eq('statut', 'En attente'),
    ]).then(([congesRes, missionsRes, materielRes]) => {
      if (congesRes.error) console.error('Erreur de comptage des congés à traiter :', congesRes.error);
      if (missionsRes.error) console.error('Erreur de comptage des missions à traiter :', missionsRes.error);
      if (materielRes.error) console.error('Erreur de comptage du matériel à traiter :', materielRes.error);
      setATraiter({
        conges: congesRes.count ?? 0,
        missions: missionsRes.count ?? 0,
        materiel: materielRes.count ?? 0,
      });
    });
  }, [role]);

  // 15/09/2026, demande du commanditaire : cette carte ne comptait que les
  // congés, alors que l'agent voit désormais aussi ses missions et son
  // matériel juste en dessous — un agent avec 2 congés + 1 mission en
  // attente voyait "2" au lieu de "3", trompeur. Compte maintenant les 3
  // types (le détail par demande reste dans les listes ci-dessous, cette
  // carte ne donne que le total + la répartition en un coup d'œil).
  const enCoursConge = demandes.filter((d) => estEnCours(d.statut));
  const enCoursMission = missions.filter((m) => estEnCours(m.statut));
  const enCoursMateriel = materiel.filter((m) => estEnCours(m.statut));
  const totalEnCours = enCoursConge.length + enCoursMission.length + enCoursMateriel.length;
  const repartitionEnCours = [
    enCoursConge.length > 0 && `${enCoursConge.length} congé${enCoursConge.length > 1 ? 's' : ''}`,
    enCoursMission.length > 0 && `${enCoursMission.length} mission${enCoursMission.length > 1 ? 's' : ''}`,
    enCoursMateriel.length > 0 && `${enCoursMateriel.length} matériel`,
  ].filter(Boolean) as string[];

  // Droit annuel fixe + solde reporté des années antérieures (14/09/2026) —
  // avant cette date, le solde reporté n'était affiché nulle part côté
  // agent, alors même que DrhPage permettait déjà de le saisir : un agent
  // avec du reliquat voyait toujours "30 jours" comme s'il n'avait rien.
  const soldeTotal = SOLDE_ANNUEL.total + (agent?.solde_report ?? 0);
  const joursMissionDefalques = missions
    .filter((m) => m.statut === 'Accordé' && m.defalque_solde && m.debut.slice(0, 4) === String(ANNEE_EN_COURS))
    .reduce((somme, m) => somme + m.jours, 0);
  const soldeConsomme =
    demandes
      .filter((d) => d.statut === 'Accordé' && d.type === 'annuel' && d.defalque_solde)
      .flatMap((d) => d.fractions.map((f) => ({ jours: d.jours, annee: f.debut.slice(0, 4) })))
      .filter((f) => f.annee === String(ANNEE_EN_COURS))
      .reduce((somme, f) => somme + f.jours, 0) + joursMissionDefalques;
  const soldeRestant = Math.max(0, soldeTotal - soldeConsomme);
  const soldePct = Math.min(100, Math.round((soldeConsomme / soldeTotal) * 100));

  const prochaineAbsence: ProchaineAbsence | null = (() => {
    let meilleure: { debut: string; fin: string; demande: DemandeAgent } | null = null;
    for (const d of demandes) {
      if (d.statut !== 'Accordé') continue;
      for (const f of d.fractions) {
        if (f.fin < AUJOURDHUI_ISO) continue; // déjà passée
        if (!meilleure || f.debut < meilleure.debut) meilleure = { debut: f.debut, fin: f.fin, demande: d };
      }
    }
    if (!meilleure) return null;
    return {
      periode: `${toFr(meilleure.debut)} → ${toFr(meilleure.fin)}`,
      detail: `${libelleTypeConge(meilleure.demande.type)} — ${meilleure.demande.jours} jours`,
      remplacant: meilleure.demande.remplacant_nom,
    };
  })();

  return (
    <div className="accueil">
      {(role === 'Chef de service' || role === 'DRH') && aTraiter && (
        <div className="card accueil__a-traiter">
          <div className="accueil__card-title">
            {role === 'Chef de service' ? 'À traiter — tout le personnel' : 'Mes validations à traiter'}
          </div>
          <div className="accueil__a-traiter-grid">
            <button type="button" className="accueil__a-traiter-item" onClick={() => navigate('/drh')}>
              <span className="accueil__big-number">{aTraiter.conges}</span>
              <span className="accueil__muted-text">Congés en attente</span>
            </button>
            {/* La DRH suit les ordres de mission mais ne les valide jamais
                (voir commentaire ci-dessus) — cette case reste réservée au
                Chef de service, seul avec l'Administrateur à en décider. */}
            {role === 'Chef de service' && (
              <button type="button" className="accueil__a-traiter-item" onClick={() => navigate('/missions')}>
                <span className="accueil__big-number">{aTraiter.missions}</span>
                <span className="accueil__muted-text">Ordres de mission en attente</span>
              </button>
            )}
            <button type="button" className="accueil__a-traiter-item" onClick={() => navigate('/materiel')}>
              <span className="accueil__big-number">{aTraiter.materiel}</span>
              <span className="accueil__muted-text">Demandes matériel en attente</span>
            </button>
          </div>
        </div>
      )}

      <div className="accueil__stats">
        <div className="card">
          <div className="card-label" style={{ marginBottom: 12 }}>
            Solde de congé annuel
          </div>
          <div className="accueil__solde-value">
            <span className="accueil__solde-number">{soldeRestant}</span>
            <span className="accueil__solde-total">/ {soldeTotal} jours restants</span>
          </div>
          <div className="accueil__solde-track">
            <div className="accueil__solde-fill" style={{ width: `${soldePct}%` }} />
          </div>
          <div className="accueil__solde-note">
            {soldeConsomme} jours consommés en {ANNEE_EN_COURS}
          </div>
        </div>

        <div className="card">
          <div className="card-label" style={{ marginBottom: 12 }}>
            Demandes en cours
          </div>
          <div className="accueil__big-number">{totalEnCours}</div>
          <div className="accueil__muted-text">
            {repartitionEnCours.length === 0 ? 'Aucune demande en attente' : repartitionEnCours.join(' · ')}
          </div>
        </div>

        <div className="card">
          <div className="card-label" style={{ marginBottom: 12 }}>
            Prochaine absence
          </div>
          {prochaineAbsence ? (
            <>
              <div className="accueil__mid-number">{prochaineAbsence.periode}</div>
              <div className="accueil__muted-text">
                {prochaineAbsence.detail}
                {prochaineAbsence.remplacant && (
                  <>
                    <br />
                    Remplaçant : {prochaineAbsence.remplacant}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="accueil__muted-text">Aucune absence prévue.</div>
          )}
        </div>
      </div>

      <div className="accueil__lower">
        <div className="card">
          <div className="accueil__card-title">Mes demandes récentes</div>
          {chargement && <div className="accueil__muted-text">Chargement…</div>}
          {!chargement && demandes.length === 0 && (
            <div className="accueil__muted-text">Aucune demande de congé pour l’instant.</div>
          )}
          {demandes.slice(0, 5).map((d) => (
            <div className="accueil__demande-row" key={d.id}>
              <div>
                <div className="accueil__demande-type">{libelleTypeConge(d.type)}</div>
                <div className="accueil__demande-meta">
                  {d.ref} · {periodeFractions(d.fractions)} · {d.jours} j
                </div>
              </div>
              <StatusPill statut={d.statut} />
            </div>
          ))}
        </div>

        <div className="card">
          <div className="accueil__card-title">Mes ordres de mission</div>
          {chargement && <div className="accueil__muted-text">Chargement…</div>}
          {!chargement && missions.length === 0 && (
            <div className="accueil__muted-text">Aucun ordre de mission pour l’instant.</div>
          )}
          {missions.slice(0, 5).map((m) => (
            <div className="accueil__demande-row" key={m.id}>
              <div>
                <div className="accueil__demande-type">
                  {m.destination ?? <em>Mission (destination réservée à la CSA/DRH/Direction)</em>}
                </div>
                <div className="accueil__demande-meta">
                  {m.ref} · {toFr(m.debut)} → {toFr(m.fin)} · {m.jours} j
                </div>
                {m.statut === 'Accordé' && m.defalque_solde && (
                  <div className="accueil__demande-defalque">
                    {m.jours} jour{m.jours > 1 ? 's' : ''} de mission défalqué{m.jours > 1 ? 's' : ''} de vos congés
                  </div>
                )}
              </div>
              <StatusPill statut={m.statut} />
            </div>
          ))}
        </div>

        <div className="card">
          <div className="accueil__card-title">Mes demandes de matériel</div>
          {chargement && <div className="accueil__muted-text">Chargement…</div>}
          {!chargement && materiel.length === 0 && (
            <div className="accueil__muted-text">Aucune demande de matériel pour l’instant.</div>
          )}
          {materiel.slice(0, 5).map((m) => (
            <div className="accueil__demande-row" key={m.id}>
              <div>
                <div className="accueil__demande-type">{m.article}</div>
                <div className="accueil__demande-meta">
                  {m.ref} · qté {m.qte} · {toFr(m.created_at.slice(0, 10))}
                </div>
              </div>
              <StatusPill statut={m.statut} />
            </div>
          ))}
        </div>

        <div className="card">
          <div className="accueil__card-title">Raccourcis</div>
          <div className="accueil__raccourcis">
            {RACCOURCIS.map((r) => (
              <button
                key={r.label}
                type="button"
                className="accueil__raccourci"
                onClick={() => navigate(`/${r.to}`)}
              >
                <span className="accueil__raccourci-label">{r.label}</span>
                <span className="accueil__raccourci-sous">{r.sous}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ABSENCE_CODES, ABSENCE_LEGENDE_ORDRE } from '../data/fixtures';
import { libelleTypeConge } from './CongeForm/congeData';
import { toFr } from '../lib/date';
import type { LeaveType } from '../types';
import './AbsencesPage.css';

interface AgentLite {
  id: string;
  nom: string;
  prenom: string;
  service_id: string | null;
}

interface Plage {
  debut: string; // ISO
  fin: string; // ISO
  code: number; // index dans ABSENCE_CODES
  motif: string; // pour l'infobulle
}

const JOURS_SEMAINE = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Absences et présences (§5.7). Refondu le 10/09/2026 : n'affichait que des
// noms fictifs figés (fixture), sans lien avec les vrais comptes, et aucune
// explication au survol des cases — remplacé par un calcul réel à partir des
// congés et missions **accordés** (statut final), sur le mois en cours.
// Aucune table dédiée : décision du 09/09/2026 (voir mémoire projet).
export function AbsencesPage() {
  const { agent } = useAuth();
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [plages, setPlages] = useState<Map<string, Plage[]>>(new Map());
  const [chargement, setChargement] = useState(true);
  // 15/09/2026, demande du commanditaire : filtre par nom pour isoler un
  // agent sans se perdre parmi toutes les lignes (calendrier large =
  // beaucoup de personnel = lignes faciles à confondre visuellement).
  const [recherche, setRecherche] = useState('');

  const aujourdHui = new Date();
  const annee = aujourdHui.getFullYear();
  const mois = aujourdHui.getMonth(); // 0-indexé
  const nbJours = new Date(annee, mois + 1, 0).getDate();
  const jours = Array.from({ length: nbJours }, (_, i) => i + 1);
  const isoJour = (j: number) => `${annee}-${pad(mois + 1)}-${pad(j)}`;
  // Au CERER, le samedi est travaillé — seul le dimanche (0) est un jour non
  // travaillé, contrairement à un week-end classique.
  const estNonTravaille = (j: number) => new Date(annee, mois, j).getDay() === 0;
  const libelleMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(aujourdHui);

  useEffect(() => {
    const moi = agent;
    if (!moi) return;
    setChargement(true);

    const charger = async () => {
      const [agentsRes, congesRes, missionsRes] = await Promise.all([
        supabase.from('agents').select('id, nom, prenom, service_id').eq('statut', 'Actif').order('nom'),
        supabase
          .from('demandes_conge')
          .select('agent_id, type, fractions:conge_fractions(debut, fin)')
          .eq('statut', 'Accordé'),
        // Lecture via la vue `missions_pour_personnel` (pas la table
        // `missions` directement) : la vue masque `destination` pour qui
        // n'a pas le rôle requis (renvoie null) et surtout, contrairement à
        // la table, elle a les bons droits SELECT — la table elle-même n'en
        // a volontairement pas sur `destination` (voir migration
        // grant_select_colonnes_missions_pour_validation), donc une lecture
        // directe échouait silencieusement et aucune mission n'apparaissait
        // ici, quel que soit son statut.
        supabase
          .from('missions_pour_personnel')
          .select('agent_id, destination, debut, fin')
          .in('statut', ['Accordé', 'Terminé']),
      ]);

      if (agentsRes.error) console.error('Erreur de chargement des agents :', agentsRes.error);
      if (congesRes.error) console.error('Erreur de chargement des congés :', congesRes.error);
      if (missionsRes.error) console.error('Erreur de chargement des missions :', missionsRes.error);

      // Un seul Chef de service pour tout le CERER (poste transversal, pas un
      // chef par service technique) — voit tout le monde, comme
      // DRH/Direction/Administrateur (11/09/2026, clarification du
      // commanditaire ; le filtrage "son équipe" du 10/09 n'avait plus lieu
      // d'être).
      setAgents((agentsRes.data as unknown as AgentLite[]) ?? []);

      const parAgent = new Map<string, Plage[]>();
      function ajouter(agentId: string, plage: Plage) {
        const liste = parAgent.get(agentId) ?? [];
        liste.push(plage);
        parAgent.set(agentId, liste);
      }

      for (const c of (congesRes.data as unknown as { agent_id: string; type: LeaveType; fractions: { debut: string; fin: string }[] }[]) ?? []) {
        const code = c.type === 'maladie' ? 2 : 1;
        for (const f of c.fractions) {
          ajouter(c.agent_id, { debut: f.debut, fin: f.fin, code, motif: libelleTypeConge(c.type) });
        }
      }
      for (const m of (missionsRes.data as unknown as { agent_id: string; destination: string | null; debut: string; fin: string }[]) ?? []) {
        // destination est masquée (null) par la vue pour qui n'a pas le
        // rôle requis (Chef de service/DRH/Direction/Administrateur).
        ajouter(m.agent_id, { debut: m.debut, fin: m.fin, code: 4, motif: `Mission — ${m.destination ?? 'confidentiel'}` });
      }

      setPlages(parAgent);
      setChargement(false);
    };

    charger();
  }, [agent]);

  function celluleDuJour(agentId: string, j: number): { code: number; motif: string } {
    if (estNonTravaille(j)) return { code: 3, motif: ABSENCE_CODES[3].label };
    const iso = isoJour(j);
    const plage = (plages.get(agentId) ?? []).find((p) => iso >= p.debut && iso <= p.fin);
    if (plage) return { code: plage.code, motif: plage.motif };
    return { code: 0, motif: ABSENCE_CODES[0].label };
  }

  function initiales(nom: string, prenom: string): string {
    return `${nom[0] ?? ''}${prenom[0] ?? ''}`.toUpperCase();
  }

  // Grille dimensionnée au vrai nombre de jours du mois (28 à 31) — un
  // gabarit CSS figé à 15 colonnes désalignait l'affichage au-delà.
  const gridStyle = { gridTemplateColumns: `190px repeat(${nbJours}, minmax(30px, 1fr))` };

  const agentsFiltres = agents.filter((a) => {
    const q = recherche.trim().toLowerCase();
    return !q || `${a.nom} ${a.prenom}`.toLowerCase().includes(q);
  });

  if (chargement) {
    return <div className="comptes-page__chargement">Chargement…</div>;
  }

  return (
    <div className="absences-page">
      <div className="absences-page__toolbar">
        <div>
          <div className="absences-page__mois">{libelleMois.charAt(0).toUpperCase() + libelleMois.slice(1)}</div>
          <div className="absences-page__sous">
            Calculé à partir des congés et missions déjà accordés — les
            jours non couverts par une demande sont comptés présents.
          </div>
        </div>
        <div className="absences-page__legende">
          {ABSENCE_LEGENDE_ORDRE.map((code) => {
            const c = ABSENCE_CODES[code];
            return (
              <span
                className="absences-page__legende-item"
                key={code}
                style={{ background: c.bg, borderColor: c.border, color: c.text }}
              >
                {c.label}
              </span>
            );
          })}
        </div>
        <input
          className="search-input"
          placeholder="Rechercher un agent…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      {agentsFiltres.length === 0 ? (
        <div className="card data-table__empty">
          {agents.length === 0 ? 'Aucun agent à afficher pour l’instant.' : 'Aucun agent ne correspond à cette recherche.'}
        </div>
      ) : (
        <div className="card absences-page__card">
          <div className="absences-page__scroll">
            <div className="absences-grid absences-grid--head" style={gridStyle}>
              <div className="absences-grid__corner" />
              {jours.map((j) => (
                <div
                  className={`absences-grid__day ${estNonTravaille(j) ? 'is-weekend' : ''} ${j === aujourdHui.getDate() ? 'is-today' : ''}`}
                  key={j}
                  title={toFr(isoJour(j))}
                >
                  <span className="absences-grid__day-num">{j}</span>
                  <span className="absences-grid__day-wd">{JOURS_SEMAINE[new Date(annee, mois, j).getDay()][0]}</span>
                </div>
              ))}
            </div>
            {agentsFiltres.map((a, i) => (
              <div className="absences-grid absences-grid--row" style={gridStyle} key={a.id}>
                <div className="absences-grid__nom" title={`${a.nom} ${a.prenom}`}>
                  <span className={`absences-grid__avatar ${i % 2 ? 'is-blue' : 'is-green'}`}>
                    {initiales(a.nom, a.prenom)}
                  </span>
                  {a.nom} {a.prenom}
                </div>
                {jours.map((j) => {
                  const { code, motif } = celluleDuJour(a.id, j);
                  const c = ABSENCE_CODES[code];
                  return (
                    <div
                      className={`absences-grid__cell ${j === aujourdHui.getDate() ? 'is-today' : ''}`}
                      style={{ background: c.bg, borderColor: c.border, color: c.text }}
                      key={j}
                      title={`${a.nom} ${a.prenom} · ${toFr(isoJour(j))} · ${motif}`}
                    >
                      {c.glyph}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

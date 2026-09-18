import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import './AnnuairePage.css';

interface AgentAnnuaire {
  id: string;
  nom: string;
  prenom: string;
  poste: string | null;
  telephone: string | null;
  service: { nom: string } | null;
}

function initiales(nom: string, prenom: string): string {
  return `${nom[0] ?? ''}${prenom[0] ?? ''}`.toUpperCase();
}

// Annuaire du personnel (§5.5 du README de handoff). Branché sur Supabase le
// 10/09/2026 : lecture ouverte à tout compte connecté (`agents`, RLS
// `agents_select`). Seuls les comptes Actifs sont listés.
export function AnnuairePage() {
  const [agents, setAgents] = useState<AgentAnnuaire[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [service, setService] = useState('Tous les services');

  useEffect(() => {
    Promise.all([
      supabase
        .from('agents')
        .select('id, nom, prenom, poste, telephone, service:services(nom)')
        .eq('statut', 'Actif')
        .order('nom'),
      supabase.from('services').select('nom').order('nom'),
    ])
      .then(([agentsRes, servicesRes]) => {
        if (agentsRes.error) console.error('Erreur de chargement de l’annuaire :', agentsRes.error);
        else setAgents((agentsRes.data as unknown as AgentAnnuaire[]) ?? []);
        if (servicesRes.error) console.error('Erreur de chargement des services :', servicesRes.error);
        else setServices((servicesRes.data ?? []).map((s) => s.nom));
      })
      .finally(() => setChargement(false));
  }, []);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return agents.filter((a) => {
      const nomService = a.service?.nom ?? '';
      const matchService = service === 'Tous les services' || nomService === service;
      const matchRecherche =
        !q ||
        a.nom.toLowerCase().includes(q) ||
        a.prenom.toLowerCase().includes(q) ||
        nomService.toLowerCase().includes(q);
      return matchService && matchRecherche;
    });
  }, [agents, recherche, service]);

  if (chargement) {
    return <div className="comptes-page__chargement">Chargement…</div>;
  }

  return (
    <div className="annuaire-page">
      <div className="annuaire-page__filters">
        <input
          placeholder="Nom, matricule, service…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <select value={service} onChange={(e) => setService(e.target.value)}>
          <option>Tous les services</option>
          {services.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {filtres.length === 0 ? (
        <div className="card data-table__empty">Aucun agent ne correspond à cette recherche.</div>
      ) : (
        <div className="annuaire-page__grid">
          {filtres.map((a, i) => (
            <div className="annuaire-card" key={a.id}>
              <div className={`annuaire-card__avatar ${i % 2 ? 'is-blue' : 'is-green'}`}>
                {initiales(a.nom, a.prenom)}
              </div>
              <div className="annuaire-card__body">
                <div className="annuaire-card__nom">
                  {a.nom} {a.prenom}
                </div>
                <div className="annuaire-card__poste">{a.poste ?? '—'}</div>
                <div className="annuaire-card__meta">
                  {a.service?.nom ?? '—'}
                  <br />
                  {a.telephone ?? '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

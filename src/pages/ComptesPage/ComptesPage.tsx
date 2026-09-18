import { useCallback, useEffect, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { StatusPill } from '../../components/ui/StatusPill';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { toFr } from '../../lib/date';
import type { Role } from '../../types';
import './ComptesPage.css';

// supabase.functions.invoke() ne remplit `data` que si la fonction répond en
// 200 — dès qu'elle répond avec un code d'erreur (ce que font toutes nos
// fonctions pour signaler un problème, ex. 409 email déjà utilisé), `data`
// vaut null et le vrai corps de réponse (le message précis qu'on a pris soin
// d'écrire côté serveur) se retrouve dans `error.context` (un Response), pas
// dans `data.error`. Sans ça, tous les messages personnalisés des fonctions
// (domaine non autorisé, email déjà utilisé, etc.) tombaient sur le message
// générique ci-dessous, jamais le vrai — repéré le 13/09/2026.
async function messageErreurFonction(error: unknown, message: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const corps = await error.context.json();
      if (typeof corps?.error === 'string') return corps.error;
    } catch {
      // Corps non-JSON ou déjà consommé : on retombe sur le message générique.
    }
  }
  return message;
}

const ROLES: Role[] = ['Agent', 'Chef de service', 'DRH', 'Direction', 'Administrateur'];
type Filtre = 'Toutes' | 'En attente' | 'Approuvée' | 'Refusé';

interface DemandeRow {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  poste: string | null;
  telephone: string | null;
  email: string;
  motif: string | null;
  date_demande: string;
  role_propose: Role;
  statut: 'En attente' | 'Approuvée' | 'Refusé';
  service: { nom: string } | null;
}

interface AgentRow {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  statut: 'Actif' | 'Désactivé';
  service: { nom: string } | null;
}

// Écran Administrateur — file des demandes d'accès et gestion des comptes
// existants. Branché sur Supabase le 09/09/2026 : lecture/écriture réelles
// (`demandes_acces`, `agents`, RLS réservée à Administrateur — voir migration
// rls_policies_portail_cerer). L'approbation crée réellement le compte via la
// fonction serveur `approuver-demande-acces` (nécessite la clé service_role,
// donc côté serveur, pas depuis le navigateur).
export function ComptesPage() {
  const { agent } = useAuth();
  const [demandes, setDemandes] = useState<DemandeRow[]>([]);
  const [comptes, setComptes] = useState<AgentRow[]>([]);
  const [chargement, setChargement] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [lienCopie, setLienCopie] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>('En attente');

  const rechargerDemandes = useCallback(async () => {
    const { data, error } = await supabase
      .from('demandes_acces')
      .select(
        'id, nom, prenom, matricule, poste, telephone, email, motif, date_demande, role_propose, statut, service:services(nom)',
      )
      .order('date_demande', { ascending: false });
    if (error) {
      console.error('Erreur de chargement des demandes d’accès :', error);
      return;
    }
    setDemandes((data as unknown as DemandeRow[]) ?? []);
  }, []);

  const rechargerComptes = useCallback(async () => {
    const { data, error } = await supabase
      .from('agents')
      .select('id, nom, prenom, email, role, statut, service:services(nom)')
      .order('nom');
    if (error) {
      console.error('Erreur de chargement des comptes :', error);
      return;
    }
    setComptes((data as unknown as AgentRow[]) ?? []);
  }, []);

  useEffect(() => {
    setChargement(true);
    Promise.all([rechargerDemandes(), rechargerComptes()]).finally(() => setChargement(false));
  }, [rechargerDemandes, rechargerComptes]);

  async function setDemandeRole(id: string, role: Role) {
    setDemandes((ds) => ds.map((d) => (d.id === id ? { ...d, role_propose: role } : d)));
    const { error } = await supabase.from('demandes_acces').update({ role_propose: role }).eq('id', id);
    if (error) console.error('Erreur de mise à jour du rôle proposé :', error);
  }

  async function approuver(demande: DemandeRow) {
    setErreur(null);
    setInviteLink(null);
    setLienCopie(false);
    setBusyId(demande.id);
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      invite_link?: string | null;
      error?: string;
    }>('approuver-demande-acces', {
      body: { demande_id: demande.id, redirect_to: `${window.location.origin}/set-password` },
    });
    setBusyId(null);

    if (error || data?.error) {
      setErreur(data?.error ?? (await messageErreurFonction(error, "Échec de la création du compte. Réessayez.")));
      return;
    }

    if (data?.invite_link) setInviteLink(data.invite_link);
    await Promise.all([rechargerDemandes(), rechargerComptes()]);
  }

  // Le lien affiché par approuver() ci-dessus disparaît si la page est
  // quittée/rafraîchie avant d'être copié — pas d'endroit où le retrouver
  // ensuite. Ce bouton permet d'en régénérer un à tout moment pour un compte
  // qui existe déjà (utile aussi si l'agent a perdu le lien reçu).
  async function renvoyerLien(email: string) {
    setErreur(null);
    setInviteLink(null);
    setLienCopie(false);
    setBusyId(email);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; link?: string | null; error?: string }>(
      'renvoyer-lien-activation',
      { body: { email, redirect_to: `${window.location.origin}/set-password` } },
    );
    setBusyId(null);

    if (error || data?.error) {
      setErreur(data?.error ?? (await messageErreurFonction(error, 'Échec de la génération du lien. Réessayez.')));
      return;
    }

    if (data?.link) setInviteLink(data.link);
  }

  async function refuser(id: string) {
    setBusyId(id);
    const { error } = await supabase
      .from('demandes_acces')
      .update({ statut: 'Refusé', traite_par: agent?.id, traite_le: new Date().toISOString() })
      .eq('id', id);
    setBusyId(null);
    if (error) {
      console.error('Erreur de refus de la demande :', error);
      return;
    }
    rechargerDemandes();
  }

  async function setCompteRole(id: string, role: Role) {
    setComptes((cs) => cs.map((c) => (c.id === id ? { ...c, role } : c)));
    const { error } = await supabase.from('agents').update({ role }).eq('id', id);
    if (error) console.error('Erreur de changement de rôle :', error);
  }

  async function toggleCompteStatut(id: string, statutActuel: 'Actif' | 'Désactivé') {
    const statut = statutActuel === 'Actif' ? 'Désactivé' : 'Actif';
    setComptes((cs) => cs.map((c) => (c.id === id ? { ...c, statut } : c)));
    const { error } = await supabase.from('agents').update({ statut }).eq('id', id);
    if (error) console.error('Erreur de changement de statut :', error);
  }

  // Suppression définitive (départ du CERER — distinct de Désactiver, qui
  // suspend temporairement) : nécessite la clé service_role pour supprimer
  // le compte Supabase Auth, donc une fonction serveur, pas un simple UPDATE.
  async function supprimerCompte(c: AgentRow) {
    const confirme = window.confirm(
      `Supprimer définitivement le compte de ${c.prenom} ${c.nom} ? Cette action est irréversible.`,
    );
    if (!confirme) return;

    setErreur(null);
    setBusyId(c.id);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('supprimer-agent', {
      body: { agent_id: c.id },
    });
    setBusyId(null);

    if (error || data?.error) {
      setErreur(data?.error ?? (await messageErreurFonction(error, 'Échec de la suppression du compte. Réessayez.')));
      return;
    }

    setComptes((cs) => cs.filter((x) => x.id !== c.id));
  }

  function copierLien() {
    if (!inviteLink) return;
    navigator.clipboard
      ?.writeText(inviteLink)
      .then(() => {
        setLienCopie(true);
        setTimeout(() => setLienCopie(false), 2000);
      })
      .catch(() => {});
  }

  const enAttente = demandes.filter((d) => d.statut === 'En attente').length;
  const actifs = comptes.filter((c) => c.statut === 'Actif').length;
  const desactives = comptes.filter((c) => c.statut === 'Désactivé').length;

  const demandesAffichees = demandes.filter((d) => filtre === 'Toutes' || d.statut === filtre);

  if (chargement) {
    return <div className="comptes-page__chargement">Chargement…</div>;
  }

  return (
    <div className="comptes-page">
      {erreur && <div className="comptes-page__alerte comptes-page__alerte--erreur">{erreur}</div>}

      {inviteLink && (
        <div className="comptes-page__alerte comptes-page__alerte--info">
          Compte créé, un email d'activation a été envoyé à l'agent. En cas de
          non-réception (spam, SMTP pas encore configuré…), voici un lien de
          secours à transmettre manuellement :
          <div className="comptes-page__lien">
            <code>{inviteLink}</code>
            <button type="button" className="btn btn--outline-xs" onClick={copierLien}>
              {lienCopie ? 'Copié !' : 'Copier'}
            </button>
          </div>
        </div>
      )}

      <div className="comptes-page__kpis">
        <div className="kpi-card">
          <div className="card-label">Demandes en attente</div>
          <div className="kpi-card__value">{enAttente}</div>
          <div className="kpi-card__sous">à traiter</div>
        </div>
        <div className="kpi-card">
          <div className="card-label">Comptes actifs</div>
          <div className="kpi-card__value">{actifs}</div>
          <div className="kpi-card__sous">sur {comptes.length} comptes</div>
        </div>
        <div className="kpi-card">
          <div className="card-label">Comptes désactivés</div>
          <div className="kpi-card__value">{desactives}</div>
          <div className="kpi-card__sous">accès révoqué</div>
        </div>
      </div>

      <div className="data-table">
        <div className="data-table__toolbar">
          <div className="data-table__title">Demandes d’accès</div>
          <SegmentedControl
            options={(['Toutes', 'En attente', 'Approuvée', 'Refusé'] as Filtre[]).map((f) => ({
              value: f,
              label: f,
            }))}
            value={filtre}
            onChange={setFiltre}
          />
        </div>
        <div className="data-table__scroll">
          <div className="data-table__row data-table__head access-row">
            <div>Demandeur</div>
            <div>Service</div>
            <div>Contact</div>
            <div>Motif</div>
            <div>Date</div>
            <div>Rôle proposé</div>
            <div>Statut</div>
            <div>Action</div>
          </div>
          {demandesAffichees.length === 0 && (
            <div className="data-table__empty">Aucune demande dans ce filtre.</div>
          )}
          {demandesAffichees.map((d) => (
            <div className="data-table__row access-row" key={d.id}>
              <div>
                <div style={{ fontWeight: 500 }}>
                  {d.nom} {d.prenom}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                  {d.matricule} · {d.poste ?? '—'}
                </div>
              </div>
              <div style={{ color: 'var(--color-text-secondary)' }}>{d.service?.nom ?? '—'}</div>
              <div>
                <div>{d.email}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{d.telephone}</div>
              </div>
              <div className="access-row__motif" title={d.motif ?? undefined}>
                {d.motif ?? '—'}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {toFr(d.date_demande)}
              </div>
              <div>
                {d.statut === 'En attente' ? (
                  <select
                    className="table-select"
                    value={d.role_propose}
                    onChange={(e) => setDemandeRole(d.id, e.target.value as Role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  d.role_propose
                )}
              </div>
              <div>
                <StatusPill statut={d.statut} />
              </div>
              <div className="data-table__actions">
                {d.statut === 'En attente' && (
                  <>
                    <button
                      type="button"
                      className="btn btn--approve"
                      disabled={busyId === d.id}
                      onClick={() => approuver(d)}
                    >
                      {busyId === d.id ? '…' : 'Approuver'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--refuse"
                      disabled={busyId === d.id}
                      onClick={() => refuser(d.id)}
                    >
                      Refuser
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="data-table">
        <div className="data-table__toolbar">
          <div className="data-table__title">Comptes utilisateurs</div>
        </div>
        <div className="data-table__scroll">
          <div className="data-table__row data-table__head account-row">
            <div>Nom</div>
            <div>Service</div>
            <div>Email</div>
            <div>Rôle</div>
            <div>Statut</div>
            <div>Action</div>
          </div>
          {comptes.map((c) => {
            // Un administrateur ne doit pas pouvoir changer son propre rôle
            // ou se désactiver depuis cet écran — ça l'a déjà bloqué hors de
            // ses propres droits par accident (09/09/2026). Un autre
            // administrateur peut toujours le faire depuis son propre compte.
            const soiMeme = c.id === agent?.id;
            return (
            <div className="data-table__row account-row" key={c.id}>
              <div style={{ fontWeight: 500 }}>
                {c.nom} {c.prenom}
                {soiMeme && (
                  <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}> (vous)</span>
                )}
              </div>
              <div style={{ color: 'var(--color-text-secondary)' }}>{c.service?.nom ?? '—'}</div>
              <div style={{ color: 'var(--color-text-secondary)' }}>{c.email}</div>
              <div>
                <select
                  className="table-select"
                  value={c.role}
                  disabled={soiMeme}
                  title={soiMeme ? 'Impossible de modifier son propre rôle' : undefined}
                  onChange={(e) => setCompteRole(c.id, e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <StatusPill statut={c.statut} />
              </div>
              <div className="data-table__actions">
                <button
                  type="button"
                  className="btn btn--outline-xs"
                  disabled={busyId === c.email}
                  onClick={() => renvoyerLien(c.email)}
                >
                  {busyId === c.email ? '…' : 'Renvoyer le lien'}
                </button>
                <button
                  type="button"
                  className={c.statut === 'Actif' ? 'btn btn--refuse' : 'btn btn--approve'}
                  disabled={soiMeme}
                  title={soiMeme ? 'Impossible de désactiver son propre compte' : undefined}
                  onClick={() => toggleCompteStatut(c.id, c.statut)}
                >
                  {c.statut === 'Actif' ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  type="button"
                  className="btn btn--refuse"
                  disabled={soiMeme || busyId === c.id}
                  title={soiMeme ? 'Impossible de supprimer son propre compte' : 'Départ du CERER — suppression définitive'}
                  onClick={() => supprimerCompte(c)}
                >
                  Supprimer
                </button>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

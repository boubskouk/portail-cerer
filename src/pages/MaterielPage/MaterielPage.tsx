import { useCallback, useEffect, useState } from 'react';
import { Field } from '../../components/ui/Field';
import { StatusPill } from '../../components/ui/StatusPill';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { supabase } from '../../lib/supabase';
import { MATERIEL_CATEGORIES } from '../../data/fixtures';
import { toFr } from '../../lib/date';
import type { Statut } from '../../types';
import './MaterielPage.css';

const STATUTS_MATERIEL: Statut[] = ['En attente', 'Approuvée', 'En commande', 'Livrée', 'Rejetée'];

interface DemandeMaterielRow {
  id: string;
  ref: string;
  article: string;
  qte: number;
  statut: Statut;
  created_at: string;
}

interface DemandeATraiter extends DemandeMaterielRow {
  categorie: string;
  justification: string | null;
  agent: { nom: string; prenom: string; service: { nom: string } | null } | null;
}

interface ArticleCatalogue {
  id: string;
  nom: string;
  categorie: string;
}

const ARTICLE_AUTRE = '__autre__';

interface LigneArticle {
  categorie: string;
  articleId: string; // id du catalogue, ARTICLE_AUTRE, ou '' (rien choisi)
  article: string; // texte libre — utilisé seulement si articleId === ARTICLE_AUTRE
  qte: string;
}

function ligneVide(): LigneArticle {
  return { categorie: MATERIEL_CATEGORIES[0], articleId: '', article: '', qte: '1' };
}

// Matériel et fournitures (§5.8). Branché sur Supabase le 10/09/2026 :
// soumission réelle (référence CERER/MAT/NNN/AAAA générée côté serveur par
// trigger) + liste « Mes demandes » = les vraies demandes de l'agent
// connecté (RLS `materiel_select`).
//
// Section « Demandes à traiter » ajoutée le 10/09/2026 : les demandes
// soumises n'avaient aucun écran pour être validées (Chef/DRH/Administrateur
// avaient les droits RLS mais pas d'interface). Visibilité et droits
// d'écriture déjà posés par RLS `materiel_select`/`materiel_update` — Chef de
// service voit et modifie celles de son service, DRH/Administrateur toutes,
// Agent aucune (section masquée pour ce rôle).
export function MaterielPage() {
  const { agent } = useAuth();
  const { role } = useRole();
  const peutTraiter = role !== 'Agent' && role !== 'Direction';

  const [demandes, setDemandes] = useState<DemandeMaterielRow[]>([]);
  const [chargement, setChargement] = useState(true);
  // Plusieurs articles en une seule soumission (10/09/2026 — le formulaire ne
  // permettait qu'un seul article à la fois) : une ligne par article, +/-
  // pour en ajouter/retirer. Chaque ligne devient sa propre demande en base
  // (sa propre référence CERER/MAT/NNN/AAAA) ; la justification reste unique,
  // partagée par l'ensemble de la soumission.
  const [lignes, setLignes] = useState<LigneArticle[]>([ligneVide()]);
  const [justification, setJustification] = useState('');
  const [erreurArticle, setErreurArticle] = useState<string | undefined>();
  const [envoi, setEnvoi] = useState(false);
  // Catalogue fermé (13/09/2026, voir migration suivi_stock_fournitures) :
  // choisir dedans plutôt que du texte libre est ce qui permet à une
  // livraison de décrémenter le bon article dans le stock. « + Autre »
  // reste possible pour un article pas encore catalogué, mais ne compte
  // alors pas dans le suivi de stock tant qu'il n'est pas ajouté au
  // catalogue (écran Stock).
  const [catalogue, setCatalogue] = useState<ArticleCatalogue[]>([]);

  const [aTraiter, setATraiter] = useState<DemandeATraiter[]>([]);
  const [chargementATraiter, setChargementATraiter] = useState(peutTraiter);
  const [busyId, setBusyId] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    if (!agent) return;
    const { data, error } = await supabase
      .from('demandes_materiel')
      .select('id, ref, article, qte, statut, created_at')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Erreur de chargement des demandes de matériel :', error);
      return;
    }
    setDemandes((data as DemandeMaterielRow[]) ?? []);
  }, [agent]);

  const rechargerATraiter = useCallback(async () => {
    if (!peutTraiter) return;
    const { data, error } = await supabase
      .from('demandes_materiel')
      .select(
        'id, ref, categorie, article, qte, justification, statut, created_at, agent:agents!agent_id(nom, prenom, service:services(nom))',
      )
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Erreur de chargement des demandes à traiter :', error);
      return;
    }
    setATraiter((data as unknown as DemandeATraiter[]) ?? []);
  }, [peutTraiter]);

  useEffect(() => {
    setChargement(true);
    recharger().finally(() => setChargement(false));
  }, [recharger]);

  useEffect(() => {
    supabase
      .from('articles')
      .select('id, nom, categorie')
      .order('categorie')
      .order('nom')
      .then(({ data, error }) => {
        if (error) {
          console.error('Erreur de chargement du catalogue d’articles :', error);
          return;
        }
        setCatalogue((data as ArticleCatalogue[]) ?? []);
      });
  }, []);

  useEffect(() => {
    setChargementATraiter(peutTraiter);
    rechargerATraiter().finally(() => setChargementATraiter(false));
  }, [rechargerATraiter, peutTraiter]);

  function ajouterLigne() {
    setLignes((ls) => [...ls, ligneVide()]);
  }

  function retirerLigne(index: number) {
    setLignes((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== index) : ls));
  }

  function modifierLigne(index: number, patch: Partial<LigneArticle>) {
    setLignes((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  // 15/09/2026, refonte du formulaire : choisir un article du catalogue
  // dérive désormais automatiquement sa catégorie (au lieu d'un champ
  // Catégorie séparé à synchroniser à la main, source d'un vrai risque
  // d'incohérence — la ligne pouvait afficher « Informatique » tout en
  // envoyant la catégorie restée sur « Papeterie »). Le choix manuel de
  // catégorie ne reste utile — et visible — que pour un article « Autre »,
  // absent du catalogue.
  function choisirArticle(index: number, articleId: string) {
    setLignes((ls) =>
      ls.map((l, i) => {
        if (i !== index) return l;
        if (articleId === ARTICLE_AUTRE) return { ...l, articleId, article: '' };
        const trouve = catalogue.find((a) => a.id === articleId);
        return { ...l, articleId, categorie: trouve?.categorie ?? l.categorie, article: '' };
      }),
    );
  }

  function incrementerQte(index: number) {
    modifierLigne(index, { qte: String((Number(lignes[index].qte) || 0) + 1) });
  }

  function decrementerQte(index: number) {
    modifierLigne(index, { qte: String(Math.max(1, (Number(lignes[index].qte) || 1) - 1)) });
  }

  function nomArticle(l: LigneArticle): string {
    if (l.articleId === ARTICLE_AUTRE) return l.article.trim();
    return catalogue.find((a) => a.id === l.articleId)?.nom ?? '';
  }

  async function onSubmit() {
    if (!agent) return;
    const lignesValides = lignes.filter((l) => nomArticle(l));
    if (lignesValides.length === 0) {
      setErreurArticle('Choisissez au moins un article');
      return;
    }
    setErreurArticle(undefined);
    setEnvoi(true);

    const justificationTexte = justification.trim() || null;
    const { error } = await supabase.from('demandes_materiel').insert(
      lignesValides.map((l) => ({
        agent_id: agent.id,
        categorie: l.categorie,
        article: nomArticle(l),
        article_id: l.articleId === ARTICLE_AUTRE || !l.articleId ? null : l.articleId,
        qte: Number(l.qte) || 1,
        justification: justificationTexte,
      })),
    );

    setEnvoi(false);

    if (error) {
      console.error('Erreur de soumission de la demande de matériel :', error);
      return;
    }

    setLignes([ligneVide()]);
    setJustification('');
    recharger();
    rechargerATraiter();
  }

  async function changerStatut(id: string, statut: Statut) {
    setBusyId(id);
    setATraiter((ds) => ds.map((d) => (d.id === id ? { ...d, statut } : d)));
    const { error } = await supabase.from('demandes_materiel').update({ statut }).eq('id', id);
    setBusyId(null);
    if (error) {
      console.error('Erreur de mise à jour du statut :', error);
      rechargerATraiter();
      return;
    }
    if (agent) recharger(); // au cas où le chef traite sa propre demande
  }

  return (
    <div className="materiel-page">
      <div className="card materiel-page__liste">
        <div className="materiel-page__liste-titre">Mes demandes</div>
        {chargement && <div className="accueil__muted-text">Chargement…</div>}
        {!chargement && demandes.length === 0 && (
          <div className="accueil__muted-text">Aucune demande pour l’instant.</div>
        )}
        {demandes.map((d) => (
          <div className="materiel-row" key={d.id}>
            <div className="materiel-row__texte">
              <div className="materiel-row__article">{d.article}</div>
              <div className="materiel-row__meta">
                {d.ref} · qté {d.qte} · {toFr(d.created_at.slice(0, 10))}
              </div>
            </div>
            <StatusPill statut={d.statut} />
          </div>
        ))}
      </div>

      <div className="card materiel-form-card">
        <div className="materiel-form__head">
          <div>
            <div className="materiel-form__titre">Nouvelle demande</div>
            <div className="materiel-form__sous">
              Un seul formulaire pour plusieurs articles — chacun devient sa
              propre demande, suivie séparément dans « Mes demandes ».
            </div>
          </div>
          <span className="materiel-form__count">
            {lignes.length} article{lignes.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="materiel-form__body">
          <div className="materiel-form__lignes">
            {lignes.map((ligne, i) => (
              <div className="materiel-form__ligne" key={i}>
                <div className="materiel-form__ligne-top">
                  <span className="materiel-form__badge">{i + 1}</span>
                  <button
                    type="button"
                    className="materiel-form__ligne-retirer"
                    onClick={() => retirerLigne(i)}
                    disabled={lignes.length === 1}
                    title="Retirer cet article"
                  >
                    ×
                  </button>
                </div>

                <Field label="Article" required error={i === 0 ? erreurArticle : undefined}>
                  <select value={ligne.articleId} onChange={(e) => choisirArticle(i, e.target.value)}>
                    <option value="">— Choisir un article —</option>
                    {MATERIEL_CATEGORIES.map((cat) => {
                      const items = catalogue.filter((a) => a.categorie === cat);
                      if (items.length === 0) return null;
                      return (
                        <optgroup label={cat} key={cat}>
                          {items.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.nom}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                    <option value={ARTICLE_AUTRE}>Autre (préciser)…</option>
                  </select>
                  {ligne.articleId === ARTICLE_AUTRE && (
                    <input
                      className="materiel-form__autre"
                      placeholder="Ex. multimètre numérique"
                      value={ligne.article}
                      onChange={(e) => modifierLigne(i, { article: e.target.value })}
                    />
                  )}
                </Field>

                <div className="materiel-form__ligne-meta">
                  {ligne.articleId === ARTICLE_AUTRE ? (
                    <label className="materiel-form__categorie-select">
                      <span className="materiel-form__meta-label">Catégorie</span>
                      <select
                        value={ligne.categorie}
                        onChange={(e) => modifierLigne(i, { categorie: e.target.value })}
                      >
                        {MATERIEL_CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="materiel-form__categorie-tag">
                      <span className="materiel-form__meta-label">Catégorie</span>
                      <span className="materiel-form__tag">{ligne.articleId ? ligne.categorie : '—'}</span>
                    </div>
                  )}
                  <div className="materiel-form__stepper-wrap">
                    <span className="materiel-form__meta-label">Quantité</span>
                    <div className="materiel-form__stepper">
                      <button type="button" onClick={() => decrementerQte(i)} aria-label="Diminuer la quantité">
                        −
                      </button>
                      <input
                        inputMode="numeric"
                        value={ligne.qte}
                        onChange={(e) => modifierLigne(i, { qte: e.target.value.replace(/[^0-9]/g, '') })}
                      />
                      <button type="button" onClick={() => incrementerQte(i)} aria-label="Augmenter la quantité">
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="materiel-form__ajouter" onClick={ajouterLigne}>
              + Ajouter un article
            </button>
          </div>

          <Field label="Justification (commune à tous les articles ci-dessus)">
            <textarea rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} />
          </Field>

          <div className="materiel-form__submit-row">
            <span className="materiel-form__submit-note">
              {lignes.filter((l) => nomArticle(l)).length} article(s) prêt(s) à soumettre
            </span>
            <button type="button" className="btn btn--primary-blue" onClick={onSubmit} disabled={envoi}>
              {envoi ? 'Envoi…' : lignes.length > 1 ? 'Soumettre les demandes' : 'Soumettre la demande'}
            </button>
          </div>
        </div>
      </div>

      {peutTraiter && (
        <div className="data-table materiel-page__traiter">
          <div className="data-table__toolbar">
            <div className="data-table__title">Demandes à traiter</div>
          </div>
          <div className="data-table__scroll">
            <div className="data-table__row data-table__head materiel-traiter-row">
              <div>Référence</div>
              <div>Demandeur</div>
              <div>Article</div>
              <div>Qté</div>
              <div>Justification</div>
              <div>Date</div>
              <div>Statut</div>
            </div>
            {chargementATraiter && <div className="data-table__empty">Chargement…</div>}
            {!chargementATraiter && aTraiter.length === 0 && (
              <div className="data-table__empty">Aucune demande de matériel pour l’instant.</div>
            )}
            {aTraiter.map((d) => (
              <div className="data-table__row materiel-traiter-row" key={d.id}>
                <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{d.ref}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {d.agent?.nom} {d.agent?.prenom}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                    {d.agent?.service?.nom ?? '—'}
                  </div>
                </div>
                <div>{d.article}</div>
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>{d.qte}</div>
                <div className="access-row__motif" title={d.justification ?? undefined}>
                  {d.justification ?? '—'}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {toFr(d.created_at.slice(0, 10))}
                </div>
                <div>
                  <select
                    className="table-select"
                    value={d.statut}
                    disabled={busyId === d.id}
                    onChange={(e) => changerStatut(d.id, e.target.value as Statut)}
                  >
                    {STATUTS_MATERIEL.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

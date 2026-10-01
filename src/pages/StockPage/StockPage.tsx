import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Field } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { supabase } from '../../lib/supabase';
import { MATERIEL_CATEGORIES, MATERIEL_UNITES } from '../../data/fixtures';
import { toFr } from '../../lib/date';
import './StockPage.css';

// Suivi de stock (13/09/2026, demande du commanditaire) : traçabilité des
// fournitures livrées + stock restant par article. Catalogue fermé
// (`articles`) plutôt que le texte libre historique de `demandes_materiel`,
// seule façon de calculer un stock fiable (voir migration
// suivi_stock_fournitures). Une sortie de stock n'est jamais saisie ici —
// elle est générée automatiquement (trigger serveur) quand une demande de
// matériel passe au statut Livrée ; cet écran ne sert qu'aux ENTRÉES
// (réceptions/achats) et à la consultation.
//
// Écriture (nouvelle entrée + nouvel article) : Chef de service, DRH,
// Administrateur. Direction : lecture seule (même schéma que le reste de
// l'appli — elle supervise sans agir).

function premierJourDuMois(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function aujourdHuiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ArticleRow {
  id: string;
  nom: string;
  categorie: string;
  unite: string;
  marque: string | null;
}

interface EtatStockRow {
  article_id: string;
  nom: string;
  categorie: string;
  unite: string;
  total_entrees: number;
  total_sorties: number;
  stock_restant: number;
}

interface LivraisonRow {
  id: string;
  quantite: number;
  date: string;
  note: string | null;
  reference_source: string | null;
  article: { nom: string; categorie: string; unite: string } | null;
  demande: {
    ref: string;
    agent: { nom: string; prenom: string; service: { nom: string } | null } | null;
  } | null;
}

const ARTICLE_AUTRE = '__autre__';

function telechargerCsv(nomFichier: string, lignes: (string | number)[][]) {
  const csv = lignes.map((ligne) => ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}

// Import Excel des entrées de stock (15/09/2026, demande du commanditaire).
// Colonnes attendues dans le fichier (première ligne = en-têtes, exactement
// ces noms) : nom_article, quantite, date (JJ-MM-AAAA), reference_source et
// note (facultatives). Chaque ligne devient une Entrée dans
// mouvements_stock ; type et enregistre_par sont posés automatiquement,
// jamais lus du fichier.
const COLONNES_REQUISES = ['nom_article', 'quantite', 'date'];

interface ResultatImport {
  type: 'succes' | 'avertissement' | 'erreur';
  titre: string;
  details: string[];
}

interface LigneImportValide {
  article_id: string;
  type: 'Entrée';
  quantite: number;
  date: string;
  reference_source: string | null;
  note: string | null;
  enregistre_par: string;
}

/** "15-09-2026" -> "2026-09-15", ou null si le format/la date est invalide. */
function parserDateJjMmAaaa(valeur: unknown): string | null {
  if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) {
    // Si la cellule Excel contient une vraie date (pas du texte), SheetJS
    // peut la restituer à quelques millisecondes de minuit selon la
    // précision flottante du format Excel — sans cet arrondi, .toISOString()
    // tronquerait parfois sur le jour précédent. Vérifié empiriquement le
    // 15/09/2026 lors des tests de cette fonctionnalité.
    const arrondie = new Date(Math.round(valeur.getTime() / 86_400_000) * 86_400_000);
    return arrondie.toISOString().slice(0, 10);
  }
  const texte = String(valeur ?? '').trim();
  const correspondance = texte.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!correspondance) return null;
  const jour = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  const annee = Number(correspondance[3]);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  // Rejette les dates qui "débordent" (ex. 31-02-2026 -> 03-03-2026 silencieusement en JS).
  if (date.getUTCFullYear() !== annee || date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** "nom_article *" ou "date * (JJ-MM-AAAA)" -> "nom_article" / "date" — un
 * fichier réel a souvent une ligne de titre au-dessus des en-têtes et des
 * annotations dessus (astérisque obligatoire, indication de format) plutôt
 * que le nom de colonne strict. On les tolère plutôt que de les rejeter. */
function normaliserEntete(cellule: unknown): string {
  return String(cellule ?? '')
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*\*+\s*$/, '')
    .trim()
    .toLowerCase();
}

export function StockPage() {
  const { agent } = useAuth();
  const { role } = useRole();
  const peutSaisir = role === 'Chef de service' || role === 'DRH' || role === 'Administrateur';

  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [etatStock, setEtatStock] = useState<EtatStockRow[]>([]);
  const [chargementStock, setChargementStock] = useState(true);

  // Recherche/filtre + édition en ligne de l'état du stock (15/09/2026,
  // demande du commanditaire — vu le volume d'articles). Article/Catégorie
  // s'éditent directement sur `articles`. "Entrées"/"Stock restant" ne sont
  // pas des colonnes stockées (agrégats calculés par la vue etat_stock) —
  // les corriger se fait via un mouvement de type Correction, jamais en
  // écrasant l'agrégat, pour ne pas perdre la traçabilité ni pouvoir
  // confondre ça avec une vraie Sortie (livraison).
  const [rechercheStock, setRechercheStock] = useState('');
  const [filtreCategorieStock, setFiltreCategorieStock] = useState('Toutes');
  // 01/10/2026, demande du commanditaire : les cases "Articles suivis"/"En
  // rupture" étaient de simples chiffres sans explication, dont le
  // fonctionnement n'était pas clair (que comptent-elles au juste ?).
  // Rendues cliquables : "En rupture" filtre directement le tableau
  // ci-dessous sur les articles concernés, "Articles suivis" revient à la
  // vue complète — leur rôle se comprend en les utilisant, pas seulement en
  // les lisant.
  const [filtreRuptureSeulement, setFiltreRuptureSeulement] = useState(false);
  const [ligneEnEdition, setLigneEnEdition] = useState<string | null>(null);
  const [editionNom, setEditionNom] = useState('');
  const [editionCategorie, setEditionCategorie] = useState('');
  const [editionStockCible, setEditionStockCible] = useState('');
  const [enregistrementLigne, setEnregistrementLigne] = useState(false);
  const [erreurLigne, setErreurLigne] = useState<string | undefined>();

  const [debutPeriode, setDebutPeriode] = useState(premierJourDuMois());
  const [finPeriode, setFinPeriode] = useState(aujourdHuiIso());
  const [livraisons, setLivraisons] = useState<LivraisonRow[]>([]);
  const [chargementLivraisons, setChargementLivraisons] = useState(true);

  // Formulaire « Nouvelle entrée »
  const [articleId, setArticleId] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [dateEntree, setDateEntree] = useState(aujourdHuiIso());
  const [referenceSource, setReferenceSource] = useState('');
  const [note, setNote] = useState('');
  const [envoiEntree, setEnvoiEntree] = useState(false);
  const [erreurEntree, setErreurEntree] = useState<string | undefined>();
  const [succesEntree, setSuccesEntree] = useState(false);

  // Mini-formulaire « Nouvel article » (bootstrap du catalogue)
  const [ajoutArticleOuvert, setAjoutArticleOuvert] = useState(false);
  const [nouvelArticleNom, setNouvelArticleNom] = useState('');
  const [nouvelArticleCategorie, setNouvelArticleCategorie] = useState(MATERIEL_CATEGORIES[0]);
  const [nouvelArticleUnite, setNouvelArticleUnite] = useState(MATERIEL_UNITES[0]);
  const [nouvelArticleMarque, setNouvelArticleMarque] = useState('');
  const [envoiArticle, setEnvoiArticle] = useState(false);
  const [erreurArticle, setErreurArticle] = useState<string | undefined>();

  // Import Excel des entrées de stock — voir la fonction traiterFichierImport
  // ci-dessous pour le détail des règles de validation.
  const fichierImportRef = useRef<HTMLInputElement>(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [resultatImport, setResultatImport] = useState<ResultatImport | null>(null);

  const rechargerArticles = useCallback(async () => {
    const { data, error } = await supabase
      .from('articles')
      .select('id, nom, categorie, unite, marque')
      .order('categorie')
      .order('nom');
    if (error) {
      console.error('Erreur de chargement du catalogue d’articles :', error);
      return;
    }
    setArticles((data as ArticleRow[]) ?? []);
  }, []);

  const rechargerEtatStock = useCallback(async () => {
    const { data, error } = await supabase.from('etat_stock').select('*');
    if (error) {
      console.error('Erreur de chargement de l’état du stock :', error);
      return;
    }
    setEtatStock((data as EtatStockRow[]) ?? []);
  }, []);

  const rechargerLivraisons = useCallback(async () => {
    const { data, error } = await supabase
      .from('mouvements_stock')
      .select(
        'id, quantite, date, note, reference_source, article:articles(nom, categorie, unite), demande:demandes_materiel(ref, agent:agents(nom, prenom, service:services(nom)))',
      )
      .eq('type', 'Sortie')
      .gte('date', debutPeriode)
      .lte('date', finPeriode)
      .order('date', { ascending: false });
    if (error) {
      console.error('Erreur de chargement des livraisons :', error);
      return;
    }
    setLivraisons((data as unknown as LivraisonRow[]) ?? []);
  }, [debutPeriode, finPeriode]);

  useEffect(() => {
    setChargementStock(true);
    Promise.all([rechargerArticles(), rechargerEtatStock()]).finally(() => setChargementStock(false));
  }, [rechargerArticles, rechargerEtatStock]);

  useEffect(() => {
    setChargementLivraisons(true);
    rechargerLivraisons().finally(() => setChargementLivraisons(false));
  }, [rechargerLivraisons]);

  async function onSubmitEntree() {
    setErreurEntree(undefined);
    setSuccesEntree(false);
    if (!articleId) {
      setErreurEntree('Choisissez un article');
      return;
    }
    const qte = Number(quantite);
    if (!qte || qte <= 0) {
      setErreurEntree('Quantité invalide');
      return;
    }
    setEnvoiEntree(true);
    const { error } = await supabase.from('mouvements_stock').insert({
      article_id: articleId,
      type: 'Entrée',
      quantite: qte,
      date: dateEntree,
      reference_source: referenceSource.trim() || null,
      note: note.trim() || null,
      enregistre_par: agent?.id ?? null,
    });
    setEnvoiEntree(false);

    if (error) {
      console.error('Erreur d’enregistrement de l’entrée de stock :', error);
      setErreurEntree("Échec de l'enregistrement. Réessayez.");
      return;
    }

    setQuantite('1');
    setReferenceSource('');
    setNote('');
    setSuccesEntree(true);
    setTimeout(() => setSuccesEntree(false), 3000);
    rechargerEtatStock();
  }

  async function onSubmitNouvelArticle() {
    setErreurArticle(undefined);
    if (!nouvelArticleNom.trim()) {
      setErreurArticle('Nom obligatoire');
      return;
    }
    setEnvoiArticle(true);
    const { data, error } = await supabase
      .from('articles')
      .insert({
        nom: nouvelArticleNom.trim(),
        categorie: nouvelArticleCategorie,
        unite: nouvelArticleUnite,
        marque: nouvelArticleMarque.trim() || null,
      })
      .select('id')
      .single();
    setEnvoiArticle(false);

    if (error) {
      console.error('Erreur de création de l’article :', error);
      setErreurArticle(
        error.code === '23505' ? 'Cet article existe déjà dans le catalogue.' : 'Échec de la création. Réessayez.',
      );
      return;
    }

    setNouvelArticleNom('');
    setNouvelArticleMarque('');
    setNouvelArticleUnite(MATERIEL_UNITES[0]);
    await rechargerArticles();
    if (data?.id) setArticleId(data.id);
    setAjoutArticleOuvert(false);
  }

  function demarrerEditionLigne(ligne: EtatStockRow) {
    setLigneEnEdition(ligne.article_id);
    setEditionNom(ligne.nom);
    setEditionCategorie(ligne.categorie);
    setEditionStockCible(String(ligne.stock_restant));
    setErreurLigne(undefined);
  }

  function annulerEditionLigne() {
    setLigneEnEdition(null);
    setErreurLigne(undefined);
  }

  async function enregistrerEditionLigne(ligne: EtatStockRow) {
    setErreurLigne(undefined);
    const nom = editionNom.trim();
    if (!nom) {
      setErreurLigne('Le nom ne peut pas être vide');
      return;
    }
    const cible = Number(editionStockCible);
    if (!Number.isInteger(cible) || cible < 0) {
      setErreurLigne('Stock restant invalide (nombre entier ≥ 0)');
      return;
    }

    setEnregistrementLigne(true);

    // Article / catégorie : mise à jour directe si changés.
    if (nom !== ligne.nom || editionCategorie !== ligne.categorie) {
      const { error } = await supabase
        .from('articles')
        .update({ nom, categorie: editionCategorie })
        .eq('id', ligne.article_id);
      if (error) {
        setEnregistrementLigne(false);
        console.error('Erreur de modification de l’article :', error);
        setErreurLigne(
          error.code === '23505' ? 'Un autre article porte déjà ce nom.' : 'Échec de la modification. Réessayez.',
        );
        return;
      }
    }

    // Stock restant : jamais écrasé directement — un mouvement Correction
    // (positif ou négatif) comble l'écart, jamais confondu avec une Sortie
    // réelle (qui reste exclusivement générée par la livraison).
    const ecart = cible - ligne.stock_restant;
    if (ecart !== 0) {
      const { error } = await supabase.from('mouvements_stock').insert({
        article_id: ligne.article_id,
        type: 'Correction',
        quantite: ecart,
        reference_source: null,
        note: 'Ajustement manuel depuis État du stock',
        enregistre_par: agent?.id ?? null,
      });
      if (error) {
        setEnregistrementLigne(false);
        console.error('Erreur d’ajustement du stock :', error);
        setErreurLigne('Échec de l’ajustement du stock. Réessayez.');
        return;
      }
    }

    setEnregistrementLigne(false);
    setLigneEnEdition(null);
    await Promise.all([rechargerArticles(), rechargerEtatStock()]);
  }

  function declencherImport() {
    fichierImportRef.current?.click();
  }

  async function onFichierImportChoisi(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = ''; // permet de resélectionner le même fichier ensuite
    if (!fichier) return;

    setResultatImport(null);

    // Sécurité côté code, en plus du bouton déjà masqué pour les autres
    // rôles — jamais confiance uniquement en l'UI cachée.
    if (!peutSaisir) {
      setResultatImport({
        type: 'erreur',
        titre: "❌ Accès refusé. Vous n'avez pas les droits pour effectuer cette action.",
        details: [],
      });
      return;
    }
    if (!agent) return;

    setImportEnCours(true);
    try {
      const donnees = await fichier.arrayBuffer();
      const classeur = XLSX.read(donnees, { type: 'array', cellDates: true });
      const feuille = classeur.Sheets[classeur.SheetNames[0]];
      const lignesBrutes: unknown[][] = XLSX.utils.sheet_to_json(feuille, { header: 1, raw: true, defval: '' });

      // La ligne d'en-tête n'est pas forcément la première ligne du fichier
      // (souvent précédée d'une ligne de titre) — on cherche parmi les 5
      // premières lignes celle qui contient les 3 colonnes obligatoires,
      // une fois les annotations (*, parenthèses) retirées.
      let indexEntete = -1;
      let entetes: string[] = [];
      for (let i = 0; i < Math.min(5, lignesBrutes.length); i++) {
        const normalisees = (lignesBrutes[i] ?? []).map(normaliserEntete);
        if (COLONNES_REQUISES.every((c) => normalisees.includes(c))) {
          indexEntete = i;
          entetes = normalisees;
          break;
        }
      }
      if (indexEntete === -1) {
        setResultatImport({
          type: 'erreur',
          titre:
            '❌ Fichier invalide !\nVérifiez que le fichier est bien au format .xlsx\net que les colonnes nom_article, quantite, date sont présentes.',
          details: [],
        });
        return;
      }

      const lignesDonnees = lignesBrutes.slice(indexEntete + 1);
      const nonVides = lignesDonnees.filter((ligne) => ligne.some((v) => String(v).trim() !== ''));
      if (nonVides.length === 0) {
        setResultatImport({
          type: 'erreur',
          titre: '❌ Le fichier est vide. Aucune donnée à importer.',
          details: [],
        });
        return;
      }

      const indexColonne = (nom: string) => entetes.indexOf(nom);
      const iArticle = indexColonne('nom_article');
      const iQuantite = indexColonne('quantite');
      const iDate = indexColonne('date');
      const iRef = indexColonne('reference_source');
      const iNote = indexColonne('note');

      const catalogueParNom = new Map(articles.map((a) => [a.nom.trim().toLowerCase(), a.id]));

      const lignesValides: LigneImportValide[] = [];
      const erreurs: string[] = [];

      lignesDonnees.forEach((ligne, i) => {
        if (!ligne.some((v) => String(v).trim() !== '')) return; // ligne entièrement vide, ignorée en silence
        const numeroLigne = indexEntete + i + 2; // ligne réelle dans le fichier (titre/en-tête compris), 1-indexée

        const nomArticle = String(ligne[iArticle] ?? '').trim();
        const articleId = catalogueParNom.get(nomArticle.toLowerCase());
        if (!articleId) {
          erreurs.push(`Ligne ${numeroLigne} : '${nomArticle}' → article introuvable dans la base`);
          return;
        }

        const quantiteBrute = ligne[iQuantite];
        const quantite = Number(quantiteBrute);
        if (!Number.isInteger(quantite) || quantite <= 0) {
          erreurs.push(`⛔ Ligne ${numeroLigne} ignorée : quantité invalide (doit être un nombre > 0)`);
          return;
        }

        const date = parserDateJjMmAaaa(ligne[iDate]);
        if (!date) {
          erreurs.push(`⛔ Ligne ${numeroLigne} ignorée : date invalide (format attendu : JJ-MM-AAAA, ex: 15-09-2026)`);
          return;
        }

        lignesValides.push({
          article_id: articleId,
          type: 'Entrée',
          quantite,
          date,
          reference_source: iRef >= 0 ? String(ligne[iRef] ?? '').trim() || null : null,
          note: iNote >= 0 ? String(ligne[iNote] ?? '').trim() || null : null,
          enregistre_par: agent.id,
        });
      });

      if (lignesValides.length > 0) {
        const { error } = await supabase.from('mouvements_stock').insert(lignesValides);
        if (error) {
          console.error('Erreur d’import des entrées de stock :', error);
          setResultatImport({
            type: 'erreur',
            titre: '❌ Erreur de connexion à la base de données. Réessayez dans quelques instants.',
            details: [],
          });
          return;
        }
      }

      if (erreurs.length === 0) {
        setResultatImport({
          type: 'succes',
          titre: `✅ Import terminé avec succès !\n${lignesValides.length} lignes importées dans le stock.`,
          details: [],
        });
      } else {
        setResultatImport({
          type: 'avertissement',
          titre: `⚠️ Import terminé avec des avertissements\n✅ ${lignesValides.length} lignes importées avec succès\n❌ ${erreurs.length} lignes ignorées :`,
          details: [...erreurs, 'Corrigez ces lignes et relancez l’import.'],
        });
      }

      await rechargerEtatStock();
    } catch (err) {
      console.error('Erreur de lecture du fichier Excel :', err);
      setResultatImport({
        type: 'erreur',
        titre:
          '❌ Fichier invalide !\nVérifiez que le fichier est bien au format .xlsx\net que les colonnes nom_article, quantite, date sont présentes.',
        details: [],
      });
    } finally {
      setImportEnCours(false);
    }
  }

  const totalRupture = etatStock.filter((a) => a.stock_restant <= 0).length;

  const etatStockFiltre = etatStock.filter((a) => {
    const q = rechercheStock.trim().toLowerCase();
    const matchRecherche = !q || a.nom.toLowerCase().includes(q);
    const matchCategorie = filtreCategorieStock === 'Toutes' || a.categorie === filtreCategorieStock;
    const matchRupture = !filtreRuptureSeulement || a.stock_restant <= 0;
    return matchRecherche && matchCategorie && matchRupture;
  });

  // Export combiné (15/09/2026, demande du commanditaire) : état du stock
  // (ce qui reste), fournitures livrées sur la période affichée (ce qui est
  // parti) + un résumé — un seul fichier plutôt que d'obliger à exporter
  // les deux séparément pour avoir "toutes les réponses".
  function exporterStock() {
    const marqueParId = new Map(articles.map((a) => [a.id, a.marque]));
    const lignes: (string | number)[][] = [
      [`État du stock CERER — export du ${toFr(aujourdHuiIso())}`],
      [],
      ['Résumé', ''],
      ['Articles suivis', etatStock.length],
      ['Articles en rupture (stock restant ≤ 0)', totalRupture],
      [`Livraisons du ${toFr(debutPeriode)} au ${toFr(finPeriode)}`, livraisons.length],
      [],
      [`État du stock${rechercheStock || filtreCategorieStock !== 'Toutes' ? ' (filtré selon l’écran)' : ''}`],
      ['Catégorie', 'Article', 'Marque', 'Unité', 'Entrées', 'Sorties (livré)', 'Stock restant', 'Rupture'],
      ...etatStockFiltre.map((a) => [
        a.categorie,
        a.nom,
        marqueParId.get(a.article_id) ?? '',
        a.unite,
        a.total_entrees,
        a.total_sorties,
        a.stock_restant,
        a.stock_restant <= 0 ? 'Oui' : 'Non',
      ]),
      [],
      [`Fournitures livrées (${toFr(debutPeriode)} → ${toFr(finPeriode)})`],
      ['Date', 'Article', 'Catégorie', 'Quantité', 'Unité', 'Référence demande', 'Demandeur', 'Service', 'Fournisseur/Référence', 'Note'],
      ...livraisons.map((l) => [
        toFr(l.date),
        l.article?.nom ?? '',
        l.article?.categorie ?? '',
        l.quantite,
        l.article?.unite ?? '',
        l.demande?.ref ?? '',
        l.demande?.agent ? `${l.demande.agent.nom} ${l.demande.agent.prenom}` : '',
        l.demande?.agent?.service?.nom ?? '',
        l.reference_source ?? '',
        l.note ?? '',
      ]),
    ];
    telechargerCsv(`etat-stock-${aujourdHuiIso()}.csv`, lignes);
  }

  if (chargementStock) {
    return <div className="comptes-page__chargement">Chargement…</div>;
  }

  return (
    <div className="stock-page">
      <div className="stock-page__toolbar">
        <button type="button" className="btn btn--outline-xs" onClick={exporterStock}>
          Exporter CSV
        </button>
      </div>

      <div className="comptes-page__kpis">
        <button
          type="button"
          className={`kpi-card kpi-card--clickable ${!filtreRuptureSeulement ? 'is-active' : ''}`}
          onClick={() => setFiltreRuptureSeulement(false)}
          aria-pressed={!filtreRuptureSeulement}
        >
          <div className="card-label">Articles suivis</div>
          <div className="kpi-card__value">{etatStock.length}</div>
          <div className="kpi-card__sous">
            Articles différents référencés au catalogue — pas la quantité en stock. Cliquez pour voir le tableau
            complet.
          </div>
        </button>
        <button
          type="button"
          className={`kpi-card kpi-card--clickable ${filtreRuptureSeulement ? 'is-active' : ''}`}
          onClick={() => setFiltreRuptureSeulement(true)}
          aria-pressed={filtreRuptureSeulement}
        >
          <div className="card-label">En rupture</div>
          <div className="kpi-card__value">{totalRupture}</div>
          <div className="kpi-card__sous">
            {totalRupture === 0
              ? 'Aucun article à stock restant nul ou négatif — rien à réapprovisionner en urgence.'
              : 'Stock restant nul ou négatif. Cliquez pour les isoler dans le tableau ci-dessous.'}
          </div>
        </button>
        <div className="kpi-card">
          <div className="card-label">Livraisons (période)</div>
          <div className="kpi-card__value">{livraisons.length}</div>
          <div className="kpi-card__sous">
            {toFr(debutPeriode)} → {toFr(finPeriode)}
          </div>
        </div>
      </div>

      {peutSaisir && (
        <div className="card stock-page__form">
          <div className="stock-page__form-header">
            <div className="stock-page__form-titre">Nouvelle entrée de stock</div>
            <div>
              <input
                type="file"
                accept=".xlsx"
                ref={fichierImportRef}
                onChange={onFichierImportChoisi}
                style={{ display: 'none' }}
              />
              <button type="button" className="btn btn--outline-sm" onClick={declencherImport} disabled={importEnCours}>
                {importEnCours ? 'Import…' : 'Importer Excel'}
              </button>
            </div>
          </div>

          {resultatImport && (
            <div className={`stock-page__import-resultat stock-page__import-resultat--${resultatImport.type}`}>
              <div className="stock-page__import-titre">{resultatImport.titre}</div>
              {resultatImport.details.length > 0 && (
                <ul className="stock-page__import-details">
                  {resultatImport.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="form-grid">
            <Field label="Article" required error={erreurEntree && !articleId ? erreurEntree : undefined} span={2}>
              <select
                value={articleId}
                onChange={(e) => {
                  if (e.target.value === ARTICLE_AUTRE) {
                    setAjoutArticleOuvert(true);
                    return;
                  }
                  setArticleId(e.target.value);
                }}
              >
                <option value="">— Choisir —</option>
                {MATERIEL_CATEGORIES.map((cat) => {
                  const items = articles.filter((a) => a.categorie === cat);
                  if (items.length === 0) return null;
                  return (
                    <optgroup label={cat} key={cat}>
                      {items.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nom}
                          {a.marque ? ` (${a.marque})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
                <option value={ARTICLE_AUTRE}>+ Nouvel article…</option>
              </select>
            </Field>
            <Field label="Quantité" required>
              <input type="number" min={1} value={quantite} onChange={(e) => setQuantite(e.target.value)} />
            </Field>
            <Field label="Date de réception">
              <input type="date" value={dateEntree} onChange={(e) => setDateEntree(e.target.value)} />
            </Field>
            <Field label="Référence / fournisseur (facultatif)">
              <input value={referenceSource} onChange={(e) => setReferenceSource(e.target.value)} />
            </Field>
            <Field label="Note (facultatif)" span={2}>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>

          {ajoutArticleOuvert && (
            <div className="stock-page__ajout-article">
              <div className="stock-page__ajout-article-titre">Nouvel article au catalogue</div>
              <div className="form-grid">
                <Field label="Nom de l’article" required error={erreurArticle} span={2}>
                  <input value={nouvelArticleNom} onChange={(e) => setNouvelArticleNom(e.target.value)} />
                </Field>
                <Field label="Catégorie">
                  <select value={nouvelArticleCategorie} onChange={(e) => setNouvelArticleCategorie(e.target.value)}>
                    {MATERIEL_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Unité">
                  <select value={nouvelArticleUnite} onChange={(e) => setNouvelArticleUnite(e.target.value)}>
                    {MATERIEL_UNITES.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Marque / précision (facultatif)">
                  <input
                    placeholder="Ex. HP — LaserJet 107A"
                    value={nouvelArticleMarque}
                    onChange={(e) => setNouvelArticleMarque(e.target.value)}
                  />
                </Field>
              </div>
              <div className="stock-page__ajout-article-actions">
                <button
                  type="button"
                  className="btn btn--outline-sm"
                  onClick={() => {
                    setAjoutArticleOuvert(false);
                    setErreurArticle(undefined);
                  }}
                >
                  Annuler
                </button>
                <button type="button" className="btn btn--primary-blue" onClick={onSubmitNouvelArticle} disabled={envoiArticle}>
                  {envoiArticle ? 'Ajout…' : 'Ajouter au catalogue'}
                </button>
              </div>
            </div>
          )}

          {erreurEntree && articleId && <div className="stock-page__erreur">{erreurEntree}</div>}
          {succesEntree && <div className="stock-page__succes">Entrée enregistrée.</div>}

          <div className="stock-page__form-submit">
            <button type="button" className="btn btn--primary-blue" onClick={onSubmitEntree} disabled={envoiEntree}>
              {envoiEntree ? 'Enregistrement…' : 'Enregistrer l’entrée'}
            </button>
          </div>
        </div>
      )}

      <div className="data-table">
        <div className="data-table__toolbar">
          <div className="data-table__title">
            État du stock{filtreRuptureSeulement ? ' — en rupture uniquement' : ''}
          </div>
          <input
            className="search-input"
            placeholder="Rechercher un article…"
            value={rechercheStock}
            onChange={(e) => setRechercheStock(e.target.value)}
          />
          <select
            className="table-select"
            value={filtreCategorieStock}
            onChange={(e) => setFiltreCategorieStock(e.target.value)}
          >
            <option>Toutes</option>
            {MATERIEL_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="data-table__scroll">
          <div className={`data-table__row data-table__head stock-etat-row${peutSaisir ? ' stock-etat-row--action' : ''}`}>
            <div>Article</div>
            <div>Catégorie</div>
            <div>Entrées</div>
            <div>Sorties (livré)</div>
            <div>Stock restant</div>
            {peutSaisir && <div>Action</div>}
          </div>
          {etatStockFiltre.length === 0 && (
            <div className="data-table__empty">Aucun article ne correspond à cette recherche.</div>
          )}
          {etatStockFiltre.map((a) => {
            const enEdition = ligneEnEdition === a.article_id;
            return (
              <div key={a.article_id}>
                <div className={`data-table__row stock-etat-row${peutSaisir ? ' stock-etat-row--action' : ''}`}>
                  {enEdition ? (
                    <>
                      <div>
                        <input value={editionNom} onChange={(e) => setEditionNom(e.target.value)} />
                      </div>
                      <div>
                        <select
                          className="table-select"
                          value={editionCategorie}
                          onChange={(e) => setEditionCategorie(e.target.value)}
                        >
                          {MATERIEL_CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-tertiary)' }}>
                        {a.total_entrees}
                      </div>
                      <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-tertiary)' }}>
                        {a.total_sorties}
                      </div>
                      <div>
                        <input
                          type="number"
                          min={0}
                          className="solde-row__input"
                          value={editionStockCible}
                          onChange={(e) => setEditionStockCible(e.target.value)}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 500 }}>{a.nom}</div>
                      <div style={{ color: 'var(--color-text-secondary)' }}>{a.categorie}</div>
                      <div style={{ fontVariantNumeric: 'tabular-nums' }}>{a.total_entrees}</div>
                      <div style={{ fontVariantNumeric: 'tabular-nums' }}>{a.total_sorties}</div>
                      <div
                        style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                        className={a.stock_restant <= 0 ? 'stock-etat-row__rupture' : undefined}
                      >
                        {a.stock_restant} {a.unite}
                      </div>
                    </>
                  )}
                  {peutSaisir && (
                    <div className="data-table__actions">
                      {enEdition ? (
                        <>
                          <button type="button" className="btn btn--outline-xs" onClick={annulerEditionLigne}>
                            Annuler
                          </button>
                          <button
                            type="button"
                            className="btn btn--approve"
                            disabled={enregistrementLigne}
                            onClick={() => enregistrerEditionLigne(a)}
                          >
                            {enregistrementLigne ? '…' : 'Enregistrer'}
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn--outline-xs" onClick={() => demarrerEditionLigne(a)}>
                          Modifier
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {enEdition && erreurLigne && <div className="stock-page__erreur">{erreurLigne}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="data-table">
        <div className="data-table__toolbar">
          <div className="data-table__title">Fournitures livrées</div>
          <div className="stock-page__periode">
            <input type="date" value={debutPeriode} onChange={(e) => setDebutPeriode(e.target.value)} />
            <span>→</span>
            <input type="date" value={finPeriode} onChange={(e) => setFinPeriode(e.target.value)} />
          </div>
        </div>
        <div className="data-table__scroll">
          <div className="data-table__row data-table__head stock-livraison-row">
            <div>Date</div>
            <div>Article</div>
            <div>Qté</div>
            <div>Demandeur</div>
            <div>Référence demande</div>
          </div>
          {chargementLivraisons && <div className="data-table__empty">Chargement…</div>}
          {!chargementLivraisons && livraisons.length === 0 && (
            <div className="data-table__empty">Aucune livraison sur cette période.</div>
          )}
          {livraisons.map((l) => (
            <div className="data-table__row stock-livraison-row" key={l.id}>
              <div style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {toFr(l.date)}
              </div>
              <div>
                {l.article?.nom ?? '—'}
                <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{l.article?.categorie}</div>
              </div>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                {l.quantite} {l.article?.unite}
              </div>
              <div>
                {l.demande?.agent ? (
                  <>
                    {l.demande.agent.nom} {l.demande.agent.prenom}
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                      {l.demande.agent.service?.nom ?? '—'}
                    </div>
                  </>
                ) : (
                  '—'
                )}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {l.demande?.ref ?? '—'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

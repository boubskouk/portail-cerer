# .claude-memory.md — Portail CERER Hub

> Dernière mise à jour : 15 septembre 2026
> Généré depuis : Guide_Portail_CERER_Hub_rapport_final_a_presenter.docx

---

## 🏛️ Contexte du projet

**Nom** : Portail CERER Hub  
**Client** : CERER — Centre d'Étude et de Recherche en Énergies Renouvelables, UCAD, Dakar  
**Responsable IT** : Jacques Boubacar KOUKOUI (SSIN)  
**Stack technique** : React + TypeScript + Vite  
**Statut** : En cours de développement — phase initiale  
**Version guide** : V1.0 — Septembre 2026  

---

## 🎯 Objectif

Remplacer le circuit papier du CERER (congés, ordres de mission, matériel/fournitures, comptes personnel) par un portail web interne unique, où chaque décision est prise par la bonne personne, tracée, et visible uniquement de qui doit la voir.

---

## 👥 Les 5 rôles utilisateurs

| Rôle | Profil | Droits clés |
|---|---|---|
| **Agent** | Tout membre du personnel | Dépose ses demandes, voit l'annuaire et calendrier absences |
| **Chef de service** | Validation de terrain (unique pour tout le CERER) | Valide congés, missions, matériel — y compris les siens |
| **DRH** | Ressources humaines | Valide congés (pas les siens), gère stock et soldes |
| **Direction** | Supervision stratégique | Lecture seule sur tout, aucune validation |
| **Administrateur** | Service Informatique (SSIN) | Tous droits, invisible dans l'annuaire |

### Règles de confidentialité importantes
- Un agent ne voit JAMAIS les demandes refusées d'un collègue
- La destination d'une mission est confidentielle (seulement agent + validateurs)
- Le certificat médical est visible uniquement par l'agent et son validateur
- Le solde de congé d'un collègue est invisible pour les agents

---

## 📦 Modules fonctionnels

### 1. Congés
- 6 types : annuel, maladie, maternité/paternité, exceptionnel, sans solde, autre
- Solde = 30 jours/an + reliquat reporté
- Arrêt maladie : certificat médical obligatoire
- Statuts : En attente → Accordé / Refusé (pas de double circuit)
- Dépôt : Agent, Chef de service, DRH
- Validation : Chef de service, DRH (pas ses propres demandes), Administrateur

### 2. Ordres de mission
- Champs : destination, dates, remplaçant
- Le validateur choisit si les jours défalquent le solde de congé (jamais automatique)
- Dépôt : Agent, Chef de service
- Validation : Chef de service, Administrateur

### 3. Matériel et fournitures
- Catalogue de 128 articles, 6 catégories :
  - Fournitures de Bureau
  - Papeterie
  - Informatique & Électronique
  - Consommables Impression
  - Mobilier & Équipement
  - Hygiène & Entretien
- Saisie libre possible pour articles hors catalogue
- Livraison = décrémentation automatique du stock
- Dépôt : tout le personnel
- Validation : Chef de service, DRH, Administrateur

### 4. Stock et fournitures
- État par article (entrées, sorties livrées, restant)
- Recherche et filtre par catégorie
- Correction d'inventaire tracée (jamais par écrasement)
- Import Excel (.xlsx) en masse
- Export CSV (stock + historique livraisons)
- Accès : Chef de service, DRH, Administrateur (écriture) / Direction (lecture)

### 5. Comptes et accès
- Demande d'accès depuis page publique (adresse professionnelle requise)
- Approbation → création compte + email d'activation automatique
- Réservé à l'Administrateur

### 6. Statistiques RH
- Effectifs par service
- Congés par type et statut
- Jours de mission cumulés
- Tendance mensuelle des absences
- Export CSV (résumé + détail sur période choisie)
- Accès : Chef de service, DRH, Direction, Administrateur

---

## 🔐 Règles de sécurité / confidentialité

### Privé (agent + validateur uniquement)
- Motif d'un refus de congé ou mission
- Destination d'une mission en cours
- Certificat médical d'un arrêt maladie
- Solde de congé individuel d'un collègue

### Visible par tout le personnel
- Qui est en congé ou mission (accordée)
- Annuaire complet du personnel actif
- Calendrier mensuel des présences

---

## 🏗️ Architecture technique

- **Framework** : React + TypeScript + Vite
- **Lint** : Oxlint (config `.oxlintrc.json`)
- **React Compiler** : Non activé (impact sur les perfs dev/build)
- **Plugins Vite** : `@vitejs/plugin-react` (Oxc) ou `@vitejs/plugin-react-swc` (SWC)

---

## 📌 État d'avancement

| Module | Statut |
|---|---|
| Setup React + TypeScript + Vite | ✅ Fait |
| Authentification / gestion des rôles | ⏳ À faire |
| Module Congés | ⏳ À faire |
| Module Ordres de mission | ⏳ À faire |
| Module Matériel et fournitures | ⏳ À faire |
| Module Stock | ⏳ À faire |
| Module Comptes et accès | ⏳ À faire |
| Module Statistiques RH | ⏳ À faire |
| Annuaire + Calendrier absences | ⏳ À faire |
| Import Excel / Export CSV | ⏳ À faire |

---

## 🔁 Prochaine session — par où commencer

1. Définir la structure des routes (React Router)
2. Mettre en place le système d'authentification et la gestion des rôles
3. Créer les layouts par rôle (tableau de bord personnalisé selon le rôle connecté)
4. Commencer par le module Congés (le plus central)

---

## 📝 Décisions techniques prises

- Aucune pour l'instant — projet au démarrage

## ⚠️ Points d'attention

- L'Administrateur ne doit jamais apparaître dans l'annuaire ni dans aucune liste visible par les autres comptes
- Le Chef de service est UNIQUE pour tout le CERER (pas un chef par service technique)
- La validation d'une mission ne déduit JAMAIS automatiquement le solde de congé
- Les corrections de stock sont toujours tracées, jamais par écrasement direct
# PlanViz — Visualiseur de plannings multi-sources

Application web de visualisation et de superposition de plannings Excel, 100% côté client.

## ✦ Fonctionnalités

- **Import multi-fichiers** — Excel (.xlsx, .xls) et CSV simultanément, par glisser-déposer ou sélection
- **Couches indépendantes** — chaque fichier est une couche colorée, activable/désactivable
- **Calendrier multicouche** — FullCalendar avec vues Jour, Semaine, Mois, Trimestre, Année
- **Détection automatique** des colonnes date/heure/titre/catégorie avec assistant de mapping manuel
- **Formats de date** européens (JJ/MM/AAAA) et internationaux
- **Filtres avancés** — recherche texte, catégories, plage de dates
- **Modes de couleur** — par fichier, par catégorie, par mot-clé
- **Détection de conflits** — chevauchements de ressources entre fichiers
- **Tableau de bord** — statistiques, graphiques par catégorie, semaine et fichier
- **Export** — PDF, PNG haute résolution, Excel fusionné, CSV
- **Mode clair/sombre** — persisté en localStorage
- **Design responsive** — sidebar repliable, compatible mobile

## ▶ Installation & lancement

### Option 1 : Ouvrir directement
Double-cliquer sur `index.html` dans votre navigateur.

> ⚠️ Certains navigateurs (Chrome) bloquent les modules locaux. Si le calendrier ne s'affiche pas, utiliser l'option 2.

### Option 2 : Serveur local léger

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8080
```

Ouvrir ensuite http://localhost:8080 dans votre navigateur.

### Option 3 : GitHub Pages
Pousser le dossier sur un repo GitHub et activer GitHub Pages depuis les paramètres.

## 📄 Format des fichiers Excel

L'application détecte automatiquement les colonnes. Pour de meilleurs résultats :

| Colonne recommandée | Exemples de noms acceptés |
|---|---|
| Date de début | `Date début`, `Start Date`, `Début`, `From` |
| Date de fin | `Date fin`, `End Date`, `Fin`, `To` |
| Heure début | `Heure début`, `Start Time` |
| Heure fin | `Heure fin`, `End Time` |
| Titre | `Titre`, `Tâche`, `Task`, `Nom`, `Sujet` |
| Catégorie | `Catégorie`, `Type`, `Groupe` |
| Ressource | `Ressource`, `Intervenant`, `Personne` |
| Description | `Description`, `Note`, `Commentaire` |

### Formats de date supportés
- `JJ/MM/AAAA` (France) — `25/01/2025`
- `AAAA-MM-JJ` (ISO) — `2025-01-25`
- `MM/JJ/AAAA` (US) — `01/25/2025`
- Numéros de série Excel

### Formats d'heure supportés
- `HH:MM` — `09:30`
- `HHhMM` — `09h30`
- `HH` — `09`

## 🎨 Couleurs intelligentes

**Par fichier** — chaque fichier a sa couleur unique, modifiable via le sélecteur.

**Par catégorie** — couleurs prédéfinies :
- Formation → Bleu `#6c8cf5`
- Congés → Vert `#4caf82`
- Réunion → Orange `#f5a742`
- Maintenance → Rouge `#f56060`

**Par mot-clé** — analyse le titre + catégorie pour détecter des mots-clés.

## 📊 Tableau de bord

Cliquer sur **◫ Tableau de bord** pour afficher :
- Nombre total de tâches, fichiers, conflits, taux d'occupation
- Répartition par catégorie (graphique en anneau)
- Tâches par semaine (histogramme)
- Répartition par fichier (barres horizontales)

## ⚡ Détection de conflits

Cliquer sur **⚡ Conflits** pour analyser :
- Chevauchements entre fichiers sur la même période
- Conflits de ressources (même intervenant, même horaire)

## 📤 Export

| Format | Contenu |
|---|---|
| PDF | Vue actuelle avec couleurs, légende et superpositions |
| PNG | Capture haute résolution (×3) |
| Excel | Feuille "Planning fusionné" + 1 feuille par source |
| CSV | Tous les événements avec métadonnées |

## 🏗️ Architecture

```
planning-app/
├── index.html              # Entrée principale, structure HTML
├── css/
│   └── style.css           # Design system complet (dark/light)
├── js/
│   ├── app.js              # Orchestrateur principal, ColorManager
│   ├── excelImporter.js    # Lecture XLSX/CSV, détection colonnes
│   ├── calendarManager.js  # FullCalendar, filtres, conflits
│   ├── exportManager.js    # PDF, PNG, Excel, CSV
│   ├── dashboard.js        # Statistiques, Chart.js
│   └── filters.js          # Panneau de filtres, état
└── README.md
```

## 📦 Dépendances CDN (aucune installation)

| Bibliothèque | Version | Usage |
|---|---|---|
| FullCalendar | 6.1.10 | Calendrier interactif |
| SheetJS (xlsx) | 0.18.5 | Lecture Excel/CSV |
| Chart.js | 4.4.0 | Graphiques dashboard |
| jsPDF | 2.5.1 | Export PDF |
| html2canvas | 1.4.1 | Capture PNG/PDF |

## 🌐 Compatibilité navigateurs

Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## ⚙️ Performance

- Supporte 100+ fichiers et plusieurs milliers d'événements
- Rendu différé des événements hors vue
- Filtrage en mémoire sans rechargement

---

Made with ◈ PlanViz

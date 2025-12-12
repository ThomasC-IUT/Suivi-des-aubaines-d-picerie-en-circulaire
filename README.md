# Suivi des Aubaines d'Épicerie

Ce projet est une **application web monopage (SPA-like)** permettant de consulter, filtrer et analyser les circulaires d'épicerie au Québec.  
Elle aide les utilisateurs à repérer les meilleures offres, gérer une liste d’achats et analyser l’historique des prix.

Visiter notre projet: https://thomasc-iut.github.io/Suivi-des-aubaines-d-picerie-en-circulaire/

***

## 🏗 Architecture technique

L'application est construite en **Vanilla JavaScript (ES6+)**, **HTML5** et **CSS3**, sans framework lourd, pour assurer **légèreté** et **performance**.

### Structure des fichiers

- **index.html** : Point d'entrée principal. Contient la grille d'items et les filtres.  
- **script.js** : Cœur logique (*Model & Controller*). Gère la connexion Supabase, la récupération des données, le calcul des statistiques et la gestion du panier.  
- **layout.js** : Gestion de la Vue. Contient les fonctions de rendu DOM (produits, graphiques Chart.js, mise à jour du panier).  
- **header_footer.js** : Composants globaux. Injecte dynamiquement le Header, le Footer et la Modale Panier pour éviter la duplication de code.  
- **style.css** : Feuille de style unique utilisant des **variables CSS (Custom Properties)** pour un thème cohérent.

***

## 🔄 Flux de données

1. Au chargement, `script.js` initialise la connexion à **Supabase**.  
2. Les données sont récupérées (`fetchItems`) et stockées en mémoire (`allItems`).  
3. Elles sont regroupées par **semaine ISO** (`weekGroups`) et analysées pour générer des métriques (`analyticsBySku`).  
4. L’interface est rendue via `layout.js` selon les filtres actifs.

***

## 🛠 Fonctionnalités clés

- **Système d’analyse de prix** : Compare le prix actuel à la moyenne des 12 dernières semaines pour déterminer si le prix est *Bon*, *Excellent* ou *Meilleur Historique*.  
- **Persistance locale** : Le panier et le budget utilisateur sont sauvegardés dans `localStorage`.  
- **Export PDF** : Génération d’une liste d’épicerie formatée via **jsPDF** et **jspdf-autotable**.  
- **Graphiques interactifs** : Visualisation de l’historique des prix avec **Chart.js** et annotations des zones de prix idéales.

***

## 📦 Dépendances

- **Supabase JS** : Backend-as-a-Service (base de données).  
- **Chart.js** & **Date Adapter** : Rendu des graphiques.  
- **jsPDF** : Génération de PDF côté client.

***

## 📝 Guide de maintenance

### Ajouter un nouveau magasin

1. Ajouter la couleur du magasin dans `STORE_COLORS` (fichier `layout.js`).  
2. Le système de filtre détectera automatiquement le nouveau nom au prochain fetch.

### Modifier l’algorithme de “Deal”

- Consulter la fonction `computeDealInsights` dans `script.js`.  
- Les seuils de pourcentage pour les badges (actuellement le **10e percentile** pour “Meilleur prix”) y sont définis.

### Configuration Supabase

- Les clés API se trouvent en haut de `script.js`.  
- La clé actuelle est une clé **ANON** publique avec droits de lecture seule (RLS).  
- En cas de changement de base, mettre à jour :
  - `SUPABASE_URL`
  - `SUPABASE_KEY`

***

**Projet réalisé dans le cadre du cours 8WEB101.**  

***
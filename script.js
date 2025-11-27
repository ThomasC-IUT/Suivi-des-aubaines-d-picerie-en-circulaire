// ============================================================================
// SCRIPT.JS - Logique métier, données et analytics
// ============================================================================

// ============================================================================
// CONFIGURATION SUPABASE
// ============================================================================

const SUPABASE_URL = 'https://uusnmuuysekydjtkkjjb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c25tdXV5c2VreWRqdGtrampiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0Mjc3MDksImV4cCI6MjA3OTAwMzcwOX0.6rRP22MpPe4QYL-Ibx-k764aS1AyT3X2OwSrytKU5sY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

// ============================================================================
// ÉTAT GLOBAL DE L'APPLICATION
// ============================================================================

let allItems = [];
let filteredItems = [];
let weekGroups = {};
let availableWeeks = [];
let currentWeek = null;

// État du panier
let shoppingCart = JSON.parse(localStorage.getItem('grocery_cart')) || [];
let userBudget = parseFloat(localStorage.getItem('grocery_budget')) || 100;

// Analytics
let analyticsBySku = new Map();
let historyBySku = new Map();

// ============================================================================
// UTILITAIRES DE GESTION DES SEMAINES ISO
// ============================================================================

/**
 * Calcule la semaine ISO 8601 d'une date
 * @param {Date|string} date - Date à analyser
 * @returns {Object} {year, week}
 */
function getISOWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getFullYear(), week: weekNo };
}

/**
 * Formate une clé de semaine (ex: "2025-W48")
 */
function formatWeekKey(year, week) {
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Parse une clé de semaine
 */
function parseWeekKey(key) {
    const [y, w] = key.split('-W');
    return { year: parseInt(y), week: parseInt(w) };
}

/**
 * Regroupe les items par semaine ISO
 */
function groupItemsByWeek(items) {
    const groups = {};
    items.forEach(it => {
        if (it.date) {
            const { year, week } = getISOWeek(it.date);
            const wk = formatWeekKey(year, week);
            if (!groups[wk]) groups[wk] = [];
            groups[wk].push(it);
        }
    });
    return groups;
}

/**
 * Retourne la semaine la plus récente
 */
function getMostRecentWeek(groups) {
    const weeks = Object.keys(groups).sort().reverse();
    return weeks.length ? weeks[0] : null;
}

// ============================================================================
// CALCULS ET TRI
// ============================================================================

/**
 * Calcule le prix unitaire normalisé pour le tri et l'analyse
 * (ramène tout en $/100g, $/100ml ou $/unité)
 * @param {Object} item - Item à analyser
 * @returns {number|null} Prix normalisé
 */
function getSortableUnitPrice(item) {
    if (!item.unit_price || !item.quantity || !item.unit) return null;
    
    const q = parseFloat(item.quantity);
    const p = parseFloat(item.unit_price);
    const u = String(item.unit).toLowerCase();
    
    if (!q || !p) return null;
    
    if (u === 'un') return p / q;
    if (u === 'g') return (p / q) * 100;
    if (u === 'kg') return (p / q) / 10;
    if (u === 'ml') return (p / q) * 100;
    if (u === 'l') return (p / q) / 10;
    
    return p / q;
}

/**
 * Trie les items selon le critère sélectionné
 * @param {Array} items - Items à trier
 * @returns {Array} Items triés
 */
function sortItems(items) {
    const v = document.getElementById('filter-sort').value;
    if (!v) return items;
    
    return items.sort((a, b) => {
        if (v === 'price-asc') return (a.unit_price || 0) - (b.unit_price || 0);
        if (v === 'price-desc') return (b.unit_price || 0) - (a.unit_price || 0);
        
        if (v === 'unit-price-asc') {
            const A = getSortableUnitPrice(a), B = getSortableUnitPrice(b);
            if (A == null && B == null) return 0;
            if (A == null) return 1;
            if (B == null) return -1;
            return A - B;
        }
        
        if (v === 'unit-price-desc') {
            const A = getSortableUnitPrice(a), B = getSortableUnitPrice(b);
            if (A == null && B == null) return 0;
            if (A == null) return 1;
            if (B == null) return -1;
            return B - A;
        }
        
        return 0;
    });
}

// ============================================================================
// ANALYTICS ET DÉTECTION D'AUBAINES
// ============================================================================

/**
 * Crée un identifiant unique pour un produit (SKU)
 * @param {Object} item - Item à identifier
 * @returns {string} Identifiant unique
 */
function skuKey(item) {
    const name = (item.item || '').trim().toLowerCase();
    const brand = (item.brand || '').trim().toLowerCase();
    const qty = String(item.quantity || '').trim().toLowerCase();
    const unit = (item.unit || '').trim().toLowerCase();
    return `${name}__${brand}__${qty}${unit}`;
}

/**
 * Alias pour le prix unitaire normalisé
 */
function normalizedUnitValue(item) {
    return getSortableUnitPrice(item);
}

/**
 * Construit les statistiques historiques pour chaque produit
 */
function buildAnalytics() {
    analyticsBySku = new Map();
    historyBySku = new Map();
    
    // Construire l'historique de chaque SKU
    allItems.forEach(it => {
        const key = skuKey(it);
        const unitVal = normalizedUnitValue(it);
        if (unitVal == null) return;
        
        const dt = it.date ? new Date(it.date) : null;
        if (!historyBySku.has(key)) historyBySku.set(key, []);
        historyBySku.get(key).push({ unitVal, date: dt, item: it });
    });
    
    // Filtrer sur 12 dernières semaines
    const now = new Date();
    const cutoff = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
    
    historyBySku.forEach(arr => {
        arr.sort((a, b) => (b.date || 0) - (a.date || 0));
        const recent = arr.filter(r => r.date && r.date >= cutoff);
        if (recent.length > 0) {
            arr.splice(0, arr.length, ...recent);
        }
    });
    
    // Calculer moyenne, min, max
    historyBySku.forEach((arr, key) => {
        const values = arr.map(r => r.unitVal).filter(v => Number.isFinite(v));
        if (values.length === 0) return;
        
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        
        analyticsBySku.set(key, { avg, min, max, count: values.length });
    });
}

/**
 * Calcule les insights d'une aubaine (badge, % vs moyenne, etc.)
 * @param {Object} item - Item à analyser
 * @param {Array} currentWeekItems - Items de la semaine pour comparaison
 * @returns {Object|null} Insights calculés
 */
function computeDealInsights(item, currentWeekItems) {
    const key = skuKey(item);
    const ana = analyticsBySku.get(key);
    const val = normalizedUnitValue(item);
    
    if (!ana || val == null) return null;
    
    // % vs moyenne historique
    const pctVsAvg = ((val - ana.avg) / ana.avg) * 100;
    
    // Meilleur concurrent cette semaine
    let bestCompetitor = null;
    if (Array.isArray(currentWeekItems)) {
        const sameSku = currentWeekItems.filter(it => skuKey(it) === key);
        const best = sameSku.reduce((best, it) => {
            const v = normalizedUnitValue(it);
            if (v == null) return best;
            if (!best || v < best.v) return { v, store: it.store_name };
            return best;
        }, null);
        bestCompetitor = best;
    }
    
    const pctVsCompetitor = bestCompetitor && bestCompetitor.v 
        ? ((val - bestCompetitor.v) / bestCompetitor.v) * 100 
        : null;
    
    // Dernière fois à ce prix
    let lastTimeWeeks = null;
    const history = historyBySku.get(key) || [];
    const ref = val;
    const similar = history.find(h => 
        Math.abs((h.unitVal - ref) / ref) <= 0.02 && 
        h.item.date && 
        h.item.date !== item.date
    );
    
    if (similar && similar.date) {
        const diff = Math.abs(new Date() - similar.date);
        lastTimeWeeks = Math.round(diff / (7 * 24 * 60 * 60 * 1000));
    }
    
    // Calcul du percentile
    const values = (history || []).map(h => h.unitVal).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    const rankCount = values.filter(v => v <= val).length;
    const percentile = values.length ? (rankCount / values.length) * 100 : 100;
    
    // Attribution du badge
    let badge = { cls: 'badge-regular', label: '⚠️ PRIX HABITUEL/ÉLEVÉ' };
    if (percentile <= 10) {
        badge = { cls: 'badge-best', label: '🔥 MEILLEUR PRIX HISTORIQUE' };
    } else if (percentile <= 25) {
        badge = { cls: 'badge-excellent', label: '✅ EXCELLENT' };
    } else if (val < ana.avg) {
        badge = { cls: 'badge-good', label: '👍 BON PRIX' };
    }
    
    return { badge, pctVsAvg, pctVsCompetitor, lastTimeWeeks };
}

// ============================================================================
// GESTION DU PANIER
// ============================================================================

/**
 * Ajoute un item au panier
 * @param {Object} item - Item à ajouter
 */
function addToCart(item) {
    const sku = skuKey(item);
    const existing = shoppingCart.find(i => 
        skuKey(i) === sku && i.store_name === item.store_name
    );
    
    if (existing) {
        alert('Cet article est déjà dans votre liste !');
    } else {
        shoppingCart.push(item);
        saveCart();
        updateCartCount();
        
        // Animation du bouton
        const btn = document.activeElement;
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '✅';
            setTimeout(() => btn.innerHTML = original, 1000);
        }
    }
}

/**
 * Retire un item du panier
 * @param {number} index - Index de l'item à retirer
 */
function removeFromCart(index) {
    shoppingCart.splice(index, 1);
    saveCart();
    updateCartDisplay();
    updateCartCount();
}

/**
 * Sauvegarde le panier dans localStorage
 */
function saveCart() {
    localStorage.setItem('grocery_cart', JSON.stringify(shoppingCart));
    localStorage.setItem('grocery_budget', userBudget);
}

// ============================================================================
// CHARGEMENT DES DONNÉES
// ============================================================================

/**
 * Récupère les items depuis Supabase
 */
async function fetchItems() {
    try {
        const { data, error } = await supabase
            .from('itemCirculaire')
            .select('*')
            .order('date', { ascending: false });
        
        if (error) throw error;
        
        allItems = data;
        weekGroups = groupItemsByWeek(data);
        availableWeeks = Object.keys(weekGroups).sort().reverse();
        buildAnalytics();
        currentWeek = getMostRecentWeek(weekGroups);
        
        populateFilters();
        
        if (currentWeek) {
            displayWeekItems(currentWeek);
        } else {
            // Afficher tous les items si pas de semaine
            const categoryFilter = document.getElementById('filter-category').value.toLowerCase();
            const searchFilter = document.getElementById('filter-search').value.toLowerCase();
            const checkedStores = Array.from(document.querySelectorAll('input[name="store-select"]:checked')).map(cb => cb.value);
            
            let filtered = data.filter(item => {
                const matchStore = !item.store_name || checkedStores.includes(item.store_name);
                const matchCategory = !categoryFilter || (item.categorie && item.categorie.toLowerCase() === categoryFilter);
                const matchSearch = !searchFilter || 
                    (item.item && item.item.toLowerCase().includes(searchFilter)) || 
                    (item.brand && item.brand.toLowerCase().includes(searchFilter));
                return matchStore && matchCategory && matchSearch;
            });
            
            filteredItems = sortItems(filtered);
            renderList(filteredItems, data);
        }
        
        document.getElementById('loading').style.display = 'none';
    } catch (err) {
        console.error('Erreur lors du chargement:', err);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error-message').innerHTML = 
            `<div class="error">Erreur lors du chargement des données: ${err.message}</div>`;
    }
}

// ============================================================================
// FILTRAGE ET AFFICHAGE PAR SEMAINE
// ============================================================================

/**
 * Affiche les items d'une semaine spécifique
 * @param {string} weekKey - Clé de semaine (ex: "2025-W48")
 */
function displayWeekItems(weekKey) {
    currentWeek = weekKey;
    const { week } = parseWeekKey(weekKey);
    document.getElementById('week-title').textContent = `Aubaines de la semaine ${week}`;
    
    const weekItems = weekGroups[weekKey] || [];
    
    // Appliquer les filtres
    const categoryFilter = document.getElementById('filter-category').value.toLowerCase();
    const searchFilter = document.getElementById('filter-search').value.toLowerCase();
    const checkedStores = Array.from(document.querySelectorAll('input[name="store-select"]:checked')).map(cb => cb.value);
    
    let filtered = weekItems.filter(item => {
        const matchStore = !item.store_name || checkedStores.includes(item.store_name);
        const matchCategory = !categoryFilter || (item.categorie && item.categorie.toLowerCase() === categoryFilter);
        const matchSearch = !searchFilter || 
            (item.item && item.item.toLowerCase().includes(searchFilter)) || 
            (item.brand && item.brand.toLowerCase().includes(searchFilter));
        return matchStore && matchCategory && matchSearch;
    });
    
    filteredItems = sortItems(filtered);
    renderList(filteredItems, weekItems);
    updateWeekSelector();
    updateNavigationButtons();
}

/**
 * Applique les filtres de recherche/catégorie/magasin
 */
function filterItems() {
    if (currentWeek) {
        displayWeekItems(currentWeek);
    } else {
        const categoryFilter = document.getElementById('filter-category').value.toLowerCase();
        const searchFilter = document.getElementById('filter-search').value.toLowerCase();
        const checkedStores = Array.from(document.querySelectorAll('input[name="store-select"]:checked')).map(cb => cb.value);
        
        let filtered = allItems.filter(item => {
            const matchStore = !item.store_name || checkedStores.includes(item.store_name);
            const matchCategory = !categoryFilter || (item.categorie && item.categorie.toLowerCase() === categoryFilter);
            const matchSearch = !searchFilter || 
                (item.item && item.item.toLowerCase().includes(searchFilter)) || 
                (item.brand && item.brand.toLowerCase().includes(searchFilter));
            return matchStore && matchCategory && matchSearch;
        });
        
        filteredItems = sortItems(filtered);
        renderList(filteredItems, allItems);
    }
}

// ============================================================================
// EVENT LISTENERS & INITIALISATION
// ============================================================================

// Attendre que TOUT le HTML soit chargé
window.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM chargé, initialisation...');
    
    // Event listeners des filtres
    const filterCategory = document.getElementById('filter-category');
    const filterSort = document.getElementById('filter-sort');
    const filterSearch = document.getElementById('filter-search');
    const compactMode = document.getElementById('compact-mode');
    const weekSelector = document.getElementById('week-selector');
    const prevWeek = document.getElementById('prev-week');
    const nextWeek = document.getElementById('next-week');
    
    if (filterCategory) filterCategory.addEventListener('change', filterItems);
    if (filterSort) filterSort.addEventListener('change', filterItems);
    if (filterSearch) filterSearch.addEventListener('input', filterItems);
    if (compactMode) compactMode.addEventListener('change', filterItems);
    
    if (weekSelector) {
        weekSelector.addEventListener('change', e => {
            if (e.target.value) displayWeekItems(e.target.value);
        });
    }
    
    if (prevWeek) {
        prevWeek.addEventListener('click', () => {
            const i = availableWeeks.indexOf(currentWeek);
            if (i < availableWeeks.length - 1) displayWeekItems(availableWeeks[i + 1]);
        });
    }
    
    if (nextWeek) {
        nextWeek.addEventListener('click', () => {
            const i = availableWeeks.indexOf(currentWeek);
            if (i > 0) displayWeekItems(availableWeeks[i - 1]);
        });
    }
    
    // Initialiser le panier et charger les données
    updateCartCount();
    fetchItems();
    
    console.log('✅ Initialisation terminée');
});
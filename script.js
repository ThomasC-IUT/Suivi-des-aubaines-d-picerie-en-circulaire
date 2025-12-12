// ============================================================================
// SCRIPT.JS - Logique métier, données et analytics
// ============================================================================

// ============================================================================
// CONFIGURATION SUPABASE
// ============================================================================
const SUPABASE_URL = 'https://uusnmuuysekydjtkkjjb.supabase.co';
// Note: La clé API est requise pour le fonctionnement en lecture seule publique
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c25tdXV5c2VreWRqdGtrampiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0Mjc3MDksImV4cCI6MjA3OTAwMzcwOX0.6rRP22MpPe4QYL-Ibx-k764aS1AyT3X2OwSrytKU5sY';

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
}) : null;

// ============================================================================
// ÉTAT GLOBAL DE L'APPLICATION
// ============================================================================
let allItems = [];
let filteredItems = [];
let weekGroups = {};
let availableWeeks = [];
let currentWeek = null;

// État du panier (Persistance LocalStorage)
let shoppingCart = JSON.parse(localStorage.getItem('grocery_cart')) || [];
let userBudget = parseFloat(localStorage.getItem('grocery_budget')) || 100;

// Analytics (Mémorisés pour performance)
let analyticsBySku = new Map();
let historyBySku = new Map();

// ============================================================================
// UTILITAIRES : DATES & SEMAINES
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
 * Retourne la semaine la plus récente disponible
 */
function getMostRecentWeek(groups) {
    const weeks = Object.keys(groups).sort().reverse();
    return weeks.length ? weeks[0] : null;
}

// ============================================================================
// LOGIQUE MÉTIER : PRIX & TRI
// ============================================================================

/**
 * Normalise le prix unitaire pour comparaison (ramène tout en $/unité de base)
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
 * Trie les items selon le critère sélectionné dans l'interface
 */
function sortItems(items) {
    const filterSort = document.getElementById('filter-sort');
    if (!filterSort) return items;
    
    const v = filterSort.value;
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
// ANALYTICS & INTELLIGENCE D'AFFAIRES
// ============================================================================

/**
 * Génère un identifiant unique (SKU logique) pour un produit
 */
function skuKey(item) {
    const name = (item.item || '').trim().toLowerCase();
    const brand = (item.brand || '').trim().toLowerCase();
    const qty = String(item.quantity || '').trim().toLowerCase();
    const unit = (item.unit || '').trim().toLowerCase();
    return `${name}__${brand}__${qty}${unit}`;
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
        const unitVal = getSortableUnitPrice(it);
        if (unitVal == null) return;
        
        const dt = it.date ? new Date(it.date) : null;
        if (!historyBySku.has(key)) historyBySku.set(key, []);
        historyBySku.get(key).push({ unitVal, date: dt, item: it });
    });
    
    // Filtrer sur 12 dernières semaines (84 jours)
    const now = new Date();
    const cutoff = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
    
    historyBySku.forEach(arr => {
        arr.sort((a, b) => (b.date || 0) - (a.date || 0));
        const recent = arr.filter(r => r.date && r.date >= cutoff);
        if (recent.length > 0) {
            arr.splice(0, arr.length, ...recent);
        }
    });
    
    // Calculer les métriques (moyenne, min, max)
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
 * Calcule les métriques d'une aubaine (badge, % vs moyenne, etc.)
 */
function computeDealInsights(item, currentWeekItems) {
    const key = skuKey(item);
    const ana = analyticsBySku.get(key);
    const val = getSortableUnitPrice(item);
    
    if (!ana || val == null) return null;
    
    // % vs moyenne historique
    const pctVsAvg = ((val - ana.avg) / ana.avg) * 100;
    
    // Comparaison concurrentielle
    let bestCompetitor = null;
    if (Array.isArray(currentWeekItems)) {
        const sameSku = currentWeekItems.filter(it => skuKey(it) === key);
        const best = sameSku.reduce((best, it) => {
            const v = getSortableUnitPrice(it);
            if (v == null) return best;
            if (!best || v < best.v) return { v, store: it.store_name };
            return best;
        }, null);
        bestCompetitor = best;
    }
    
    const pctVsCompetitor = bestCompetitor && bestCompetitor.v 
        ? ((val - bestCompetitor.v) / bestCompetitor.v) * 100 
        : null;
    
    // Fréquence du prix
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
    
    // Classement percentile
    const values = (history || []).map(h => h.unitVal).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    const rankCount = values.filter(v => v <= val).length;
    const percentile = values.length ? (rankCount / values.length) * 100 : 100;
    
    // Détermination du badge
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
// GESTION DU PANIER (ACTIONS UTILISATEUR)
// ============================================================================

/**
 * Ajoute un item au panier
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
        
        // Feedback visuel
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
 */
function removeFromCart(index) {
    shoppingCart.splice(index, 1);
    saveCart();
    if (typeof updateCartDisplay === 'function') {
        updateCartDisplay();
    }
    updateCartCount();
}

/**
 * Sauvegarde le panier dans localStorage
 */
function saveCart() {
    localStorage.setItem('grocery_cart', JSON.stringify(shoppingCart));
    localStorage.setItem('grocery_budget', userBudget);
}

/**
 * Met à jour le compteur du panier dans le header
 */
function updateCartCount() {
    const cartCount = document.getElementById('cart-count');
    if (cartCount) {
        cartCount.textContent = shoppingCart.length;
    }
}

// ============================================================================
// RÉCUPÉRATION DES DONNÉES (API)
// ============================================================================

/**
 * Récupère les items depuis Supabase
 */
async function fetchItems() {
    if (!supabase) {
        return;
    }
    
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
        
        // Initialisation de l'interface après chargement
        if (typeof populateFilters === 'function') {
            populateFilters();
        }
        
        if (currentWeek && typeof displayWeekItems === 'function') {
            displayWeekItems(currentWeek);
        } else if (typeof renderList === 'function') {
            // Fallback: affichage global si pas de semaine spécifique
            filterItems();
        }
        
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
        
    } catch (err) {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
        
        const errorEl = document.getElementById('error-message');
        if (errorEl) {
            errorEl.innerHTML = `<div class="error">Erreur lors du chargement des données: ${err.message}</div>`;
        }
    }
}

// ============================================================================
// NAVIGATION & FILTRAGE
// ============================================================================

/**
 * Affiche les items d'une semaine spécifique
 */
function displayWeekItems(weekKey) {
    currentWeek = weekKey;
    const { week } = parseWeekKey(weekKey);
    
    const weekTitle = document.getElementById('week-title');
    if (weekTitle) {
        weekTitle.textContent = `Aubaines de la semaine ${week}`;
    }
    
    const weekItems = weekGroups[weekKey] || [];
    applyFilters(weekItems);
    
    if (typeof updateWeekSelector === 'function') updateWeekSelector();
    if (typeof updateNavigationButtons === 'function') updateNavigationButtons();
}

/**
 * Applique les filtres actifs à la liste d'items fournie ou globale
 */
function applyFilters(sourceItems = null) {
    const itemsToFilter = sourceItems || allItems;
    
    const categoryFilter = document.getElementById('filter-category');
    const searchFilter = document.getElementById('filter-search');
    
    const categoryValue = categoryFilter ? categoryFilter.value.toLowerCase() : '';
    const searchValue = searchFilter ? searchFilter.value.toLowerCase() : '';
    const checkedStores = Array.from(document.querySelectorAll('input[name="store-select"]:checked')).map(cb => cb.value);
    
    let filtered = itemsToFilter.filter(item => {
        const matchStore = !item.store_name || checkedStores.includes(item.store_name);
        const matchCategory = !categoryValue || (item.categorie && item.categorie.toLowerCase() === categoryValue);
        const matchSearch = !searchValue || 
            (item.item && item.item.toLowerCase().includes(searchValue)) || 
            (item.brand && item.brand.toLowerCase().includes(searchValue));
        return matchStore && matchCategory && matchSearch;
    });
    
    filteredItems = sortItems(filtered);
    
    if (typeof renderList === 'function') {
        renderList(filteredItems, sourceItems || allItems);
    }
}

/**
 * Wrapper pour l'événement de filtrage
 */
function filterItems() {
    if (currentWeek) {
        displayWeekItems(currentWeek);
    } else {
        applyFilters(allItems);
    }
}

// ============================================================================
// EXPORTATION PDF
// ============================================================================

/**
 * Exporte le panier en PDF via jsPDF et AutoTable
 */
function exportCartToPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("Erreur : La génération de PDF n'est pas disponible pour le moment.");
        return;
    }

    const currentCart = JSON.parse(localStorage.getItem('grocery_cart')) || []; 
    
    if (currentCart.length === 0) {
        alert("Votre liste d'épicerie est vide.");
        return;
    }

    const cleanText = (text) => String(text || '').replace(/\r?\n|\r/g, ' ').trim();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'letter');
    const MARGIN = 10;
    let y = MARGIN; 

    // Regroupement par magasin
    const groupedByStore = {};
    currentCart.forEach(item => {
        const store = cleanText(item.store_name) || 'Divers'; 
        if (!groupedByStore[store]) groupedByStore[store] = [];
        groupedByStore[store].push(item);
    });

    const headers = [["", "Article / Marque", "Qté & Unité", "Prix Total", "Prix Unitaire"]];

    // En-tête du document
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text("Liste d'Épicerie : Aubaines Circulaires", MARGIN, y);
    y += 10;
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Date: ${new Date().toLocaleDateString('fr-CA')}`, MARGIN, y);
    y += 10;

    // Génération des tableaux
    Object.keys(groupedByStore).sort().forEach(store => {
        if (y > pdf.internal.pageSize.getHeight() - MARGIN - 20) {
            pdf.addPage();
            y = MARGIN;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        y += 5;
        pdf.text(`${store}`, MARGIN, y);
        y += 5; 

        const tableBody = groupedByStore[store].map(item => {
            let formattedUnitPrice = 'N/D';
            const unitPriceValue = getSortableUnitPrice(item);
            if (unitPriceValue != null) {
                formattedUnitPrice = `${unitPriceValue.toFixed(2)}$ / Norm.`;
            }
            
            return [
                '[ ]', 
                `${cleanText(item.item || 'Sans nom')}\n(${cleanText(item.brand || 'Sans marque')})`, 
                `${cleanText(item.quantity || '')} ${cleanText(item.unit || '')}`,
                item.unit_price ? item.unit_price.toFixed(2) + ' $' : 'N/D',
                formattedUnitPrice
            ];
        });

        if (typeof pdf.autoTable === 'function') {
            pdf.autoTable({
                head: headers,
                body: tableBody,
                startY: y,
                theme: 'striped',
                headStyles: { fillColor: [50, 50, 50], fontSize: 10 },
                styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center', valign: 'middle' }, 
                    3: { halign: 'center' }, 
                    4: { halign: 'center' }  
                },
                margin: { left: MARGIN, right: MARGIN },
            });
            y = pdf.lastAutoTable.finalY;
        }
    });

    pdf.save("liste_epicerie_" + new Date().toISOString().slice(0, 10) + ".pdf");
}


// ============================================================================
// INITIALISATION
// ============================================================================

window.addEventListener('DOMContentLoaded', function() {
    
    // Initialisation des écouteurs d'événements
    const elements = {
        filterCategory: document.getElementById('filter-category'),
        filterSort: document.getElementById('filter-sort'),
        filterSearch: document.getElementById('filter-search'),
        compactMode: document.getElementById('compact-mode'),
        weekSelector: document.getElementById('week-selector'),
        prevWeek: document.getElementById('prev-week'),
        nextWeek: document.getElementById('next-week'),
        exportBtn: document.getElementById("exportPdfBtn")
    };
    
    if (elements.filterCategory) elements.filterCategory.addEventListener('change', filterItems);
    if (elements.filterSort) elements.filterSort.addEventListener('change', filterItems);
    if (elements.filterSearch) elements.filterSearch.addEventListener('input', filterItems);
    if (elements.compactMode) elements.compactMode.addEventListener('change', filterItems);
    
    if (elements.weekSelector) {
        elements.weekSelector.addEventListener('change', e => {
            if (e.target.value) displayWeekItems(e.target.value);
        });
    }
    
    if (elements.prevWeek) {
        elements.prevWeek.addEventListener('click', () => {
            const i = availableWeeks.indexOf(currentWeek);
            if (i < availableWeeks.length - 1) displayWeekItems(availableWeeks[i + 1]);
        });
    }
    
    if (elements.nextWeek) {
        elements.nextWeek.addEventListener('click', () => {
            const i = availableWeeks.indexOf(currentWeek);
            if (i > 0) displayWeekItems(availableWeeks[i - 1]);
        });
    }

    if (elements.exportBtn) {
        const newBtn = elements.exportBtn.cloneNode(true);
        elements.exportBtn.parentNode.replaceChild(newBtn, elements.exportBtn);
        newBtn.addEventListener("click", exportCartToPdf);
    }
    
    // Initialiser le panier
    updateCartCount();
    
    // Charger les données si le conteneur principal existe
    if (document.getElementById('items-container')) {
        fetchItems();
    }
});
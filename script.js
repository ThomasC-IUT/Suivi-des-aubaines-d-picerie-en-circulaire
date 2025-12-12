// ============================================================================
// SCRIPT.JS - Logique métier, gestion des données et événements
// ============================================================================

// Configuration Supabase
const SUPABASE_URL = 'https://uusnmuuysekydjtkkjjb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c25tdXV5c2VreWRqdGtrampiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0Mjc3MDksImV4cCI6MjA3OTAwMzcwOX0.6rRP22MpPe4QYL-Ibx-k764aS1AyT3X2OwSrytKU5sY';

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
}) : null;

// État global
let allItems = [];
let filteredItems = [];
let weekGroups = {};
let availableWeeks = [];
let currentWeek = null;

// Panier & Budget (Persistance)
let shoppingCart = JSON.parse(localStorage.getItem('grocery_cart')) || [];
let userBudget = parseFloat(localStorage.getItem('grocery_budget')) || 100;

// Analytics (Cache)
let analyticsBySku = new Map();
let historyBySku = new Map();

// ============================================================================
// UTILITAIRES : DATES & CLÉS
// ============================================================================

function getISOWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getFullYear(), week: weekNo };
}

function formatWeekKey(year, week) {
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function parseWeekKey(key) {
    const [y, w] = key.split('-W');
    return { year: parseInt(y), week: parseInt(w) };
}

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

function getMostRecentWeek(groups) {
    const weeks = Object.keys(groups).sort().reverse();
    return weeks.length ? weeks[0] : null;
}

function skuKey(item) {
    const name = (item.item || '').trim().toLowerCase();
    const brand = (item.brand || '').trim().toLowerCase();
    const qty = String(item.quantity || '').trim().toLowerCase();
    const unit = (item.unit || '').trim().toLowerCase();
    return `${name}__${brand}__${qty}${unit}`;
}

// ============================================================================
// LOGIQUE DE PRIX ET TRI
// ============================================================================

/**
 * Normalise le prix pour le tri (prix par unité de base)
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
// ANALYTICS
// ============================================================================

function buildAnalytics() {
    analyticsBySku.clear();
    historyBySku.clear();
    
    // 1. Construire l'historique
    allItems.forEach(it => {
        const key = skuKey(it);
        const unitVal = getSortableUnitPrice(it);
        if (unitVal == null) return;
        
        const dt = it.date ? new Date(it.date) : null;
        if (!historyBySku.has(key)) historyBySku.set(key, []);
        historyBySku.get(key).push({ unitVal, date: dt, item: it });
    });
    
    // 2. Filtrer (12 semaines) et calculer métriques
    const now = new Date();
    const cutoff = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
    
    historyBySku.forEach((arr, key) => {
        arr.sort((a, b) => (b.date || 0) - (a.date || 0));
        
        // Garder uniquement les récents pour l'analyse
        const recent = arr.filter(r => r.date && r.date >= cutoff);
        if (recent.length > 0) {
            // Mise à jour de la ref si nécessaire, mais on garde tout l'historique pour l'affichage graph
        }
        
        const values = arr.map(r => r.unitVal).filter(v => Number.isFinite(v));
        if (values.length === 0) return;
        
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        
        analyticsBySku.set(key, { avg, min, max, count: values.length });
    });
}

function computeDealInsights(item, currentWeekItems) {
    const key = skuKey(item);
    const ana = analyticsBySku.get(key);
    const val = getSortableUnitPrice(item);
    
    if (!ana || val == null) return null;
    
    const pctVsAvg = ((val - ana.avg) / ana.avg) * 100;
    
    // Meilleur concurrent
    let bestCompetitor = null;
    if (Array.isArray(currentWeekItems)) {
        const sameSku = currentWeekItems.filter(it => skuKey(it) === key);
        const best = sameSku.reduce((acc, it) => {
            const v = getSortableUnitPrice(it);
            if (v == null) return acc;
            if (!acc || v < acc.v) return { v, store: it.store_name };
            return acc;
        }, null);
        bestCompetitor = best;
    }
    
    const pctVsCompetitor = bestCompetitor && bestCompetitor.v 
        ? ((val - bestCompetitor.v) / bestCompetitor.v) * 100 
        : null;
    
    // Dernière fois à ce prix
    let lastTimeWeeks = null;
    const history = historyBySku.get(key) || [];
    const similar = history.find(h => 
        Math.abs((h.unitVal - val) / val) <= 0.02 && 
        h.item.date && 
        h.item.date !== item.date
    );
    
    if (similar && similar.date) {
        const diff = Math.abs(new Date() - similar.date);
        lastTimeWeeks = Math.round(diff / (7 * 24 * 60 * 60 * 1000));
    }
    
    // Percentile et Badge
    const values = (history || []).map(h => h.unitVal).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    const rankCount = values.filter(v => v <= val).length;
    const percentile = values.length ? (rankCount / values.length) * 100 : 100;
    
    let badge = { cls: 'badge-regular', label: '⚠️ PRIX HABITUEL' };
    if (percentile <= 10) badge = { cls: 'badge-best', label: '🔥 MEILLEUR PRIX' };
    else if (percentile <= 25) badge = { cls: 'badge-excellent', label: '✅ EXCELLENT' };
    else if (val < ana.avg) badge = { cls: 'badge-good', label: '👍 BON PRIX' };
    
    return { badge, pctVsAvg, pctVsCompetitor, lastTimeWeeks };
}

// ============================================================================
// GESTION PANIER
// ============================================================================

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
        
        const btn = document.activeElement;
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '✅';
            setTimeout(() => btn.innerHTML = original, 1000);
        }
    }
}

function removeFromCart(index) {
    shoppingCart.splice(index, 1);
    saveCart();
    if (typeof updateCartDisplay === 'function') updateCartDisplay();
    updateCartCount();
}

function saveCart() {
    localStorage.setItem('grocery_cart', JSON.stringify(shoppingCart));
    localStorage.setItem('grocery_budget', userBudget);
}

function updateCartCount() {
    const cartCount = document.getElementById('cart-count');
    if (cartCount) {
        cartCount.textContent = shoppingCart.length;
    }
}

// ============================================================================
// APPEL API & DONNÉES
// ============================================================================

async function fetchItems() {
    if (!supabase) return;
    
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
        
        if (typeof populateFilters === 'function') populateFilters();
        
        if (currentWeek) {
            displayWeekItems(currentWeek);
        } else {
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
// EVENTS UI
// ============================================================================

function displayWeekItems(weekKey) {
    currentWeek = weekKey;
    const { week } = parseWeekKey(weekKey);
    
    const weekTitle = document.getElementById('week-title');
    if (weekTitle) weekTitle.textContent = `Aubaines de la semaine ${week}`;
    
    const weekItems = weekGroups[weekKey] || [];
    applyFilters(weekItems);
    
    if (typeof updateWeekSelector === 'function') updateWeekSelector();
    if (typeof updateNavigationButtons === 'function') updateNavigationButtons();
}

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

function filterItems() {
    if (currentWeek) {
        displayWeekItems(currentWeek);
    } else {
        applyFilters(allItems);
    }
}

// ============================================================================
// PDF EXPORT
// ============================================================================

function exportCartToPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("Erreur : Module PDF non chargé.");
        return;
    }

    const currentCart = JSON.parse(localStorage.getItem('grocery_cart')) || []; 
    if (currentCart.length === 0) {
        alert("Votre liste d'épicerie est vide.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'letter');
    const MARGIN = 10;
    let y = MARGIN; 

    // Regroupement
    const groupedByStore = {};
    const cleanText = (text) => String(text || '').replace(/\r?\n|\r/g, ' ').trim();

    currentCart.forEach(item => {
        const store = cleanText(item.store_name) || 'Divers'; 
        if (!groupedByStore[store]) groupedByStore[store] = [];
        groupedByStore[store].push(item);
    });

    // En-tête
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text("Liste d'Épicerie : Aubaines Circulaires", MARGIN, y);
    y += 10;
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Date: ${new Date().toLocaleDateString('fr-CA')}`, MARGIN, y);
    y += 10;

    const headers = [["", "Article / Marque", "Qté & Unité", "Prix Total", "Prix Unitaire"]];

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

        if (pdf.autoTable) {
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

    pdf.save(`liste_epicerie_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// INITIALISATION
// ============================================================================

window.addEventListener('DOMContentLoaded', function() {
    
    // Attachement des listeners UI
    const elements = {
        filterCategory: document.getElementById('filter-category'),
        filterSort: document.getElementById('filter-sort'),
        filterSearch: document.getElementById('filter-search'),
        compactMode: document.getElementById('compact-mode'),
        weekSelector: document.getElementById('week-selector'),
        prevWeek: document.getElementById('prev-week'),
        nextWeek: document.getElementById('next-week')
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

    // Délégation d'événement pour le bouton export (car il peut être injecté dynamiquement)
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'exportPdfBtn') {
            exportCartToPdf();
        }
    });
    
    // Init Panier
    updateCartCount();
    
    // Fetch Data seulement si on est sur une page qui affiche des items
    if (document.getElementById('items-container')) {
        fetchItems();
    }
});
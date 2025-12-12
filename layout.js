// ============================================================================
// LAYOUT.JS - Gestion de l'interface utilisateur et du rendu
// ============================================================================

const storeColors = {
    'Super C': '#EF4444',
    'Maxi': '#3B82F6',
    'IGA': '#F59E0B',
    'Metro': '#10B981',
    'Provigo': '#8B5CF6',
    'Walmart': '#EC4899',
    'default': '#6B7280'
};

let chartInstance = null;

// ============================================================================
// MODALES (Historique & Panier)
// ============================================================================

/**
 * Affiche l'historique des prix dans une modale avec graphique Chart.js
 * @param {string} sku - Identifiant unique du produit
 */
function openHistoryModal(sku) {
    const history = historyBySku.get(sku);
    if (!history || history.length === 0) return;

    const itemRef = history[0].item;
    const title = `${itemRef.item} ${itemRef.brand ? '- ' + itemRef.brand : ''}`;
    const subtitle = `Historique pour ${itemRef.quantity} ${itemRef.unit}`;
    
    const titleEl = document.getElementById('modal-title');
    const subtitleEl = document.getElementById('modal-subtitle');
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;

    // Préparation des données Chart.js
    const storesMap = {};
    let minDate = new Date();
    let maxDate = new Date(0);
    const allPrices = [];

    history.forEach(h => {
        if (!h.item.date) return;
        const date = new Date(h.item.date);
        if (date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;
        
        const store = h.item.store_name || 'Autre';
        if (!storesMap[store]) storesMap[store] = [];
        const val = h.item.unit_price;
        allPrices.push(val);
        storesMap[store].push({ x: date, y: val });
    });

    Object.values(storesMap).forEach(arr => arr.sort((a, b) => a.x - b.x));

    // Calcul de la zone idéale (25e percentile)
    allPrices.sort((a, b) => a - b);
    const p25Index = Math.floor(allPrices.length * 0.25);
    const p25Value = allPrices.length > 0 ? allPrices[p25Index] : 0;

    const bandStart = new Date(minDate);
    bandStart.setDate(bandStart.getDate() - 7);
    const bandEnd = new Date(maxDate);
    bandEnd.setDate(bandEnd.getDate() + 7);

    const datasets = [];
    
    // Dataset: Zone idéale
    datasets.push({
        label: 'Zone Idéale (Top 25%)',
        data: [{ x: bandStart, y: p25Value }, { x: bandEnd, y: p25Value }],
        borderColor: 'transparent',
        backgroundColor: 'rgba(16,185,129,0.15)',
        borderWidth: 0,
        pointRadius: 0,
        fill: 'start',
        order: 99
    });

    // Dataset: Magasins
    Object.keys(storesMap).forEach(store => {
        const color = storeColors[store] || storeColors.default;
        datasets.push({
            label: store,
            data: storesMap[store],
            borderColor: color,
            backgroundColor: color,
            tension: 0.1,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: color,
            borderWidth: 2
        });
    });

    // Rendu du graphique
    const ctx = document.getElementById('priceChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } },
                tooltip: {
                    callbacks: {
                        title: (ctx) => {
                            const date = new Date(ctx[0].parsed.x);
                            const { week } = getISOWeek(date);
                            return `${date.toLocaleDateString('fr-CA')} (Semaine ${week})`;
                        },
                        label: (ctx) => {
                            if (ctx.dataset.label.includes('Zone Idéale')) return null;
                            return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} $`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'week',
                        tooltipFormat: 'yyyy-MM-dd',
                        displayFormats: { week: 'd MMM' }
                    },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    title: { display: true, text: 'Prix ($)' },
                    beginAtZero: true
                }
            }
        }
    });

    document.getElementById('history-modal').classList.add('open');
}

function closeHistoryModal() {
    document.getElementById('history-modal').classList.remove('open');
}

function openCart() {
    const budgetInput = document.getElementById('cart-budget');
    if (budgetInput) budgetInput.value = userBudget;
    updateCartDisplay();
    document.getElementById('cart-modal').classList.add('open');
}

function closeCart() {
    document.getElementById('cart-modal').classList.remove('open');
}

// ============================================================================
// AFFICHAGE DU PANIER
// ============================================================================

/**
 * Met à jour l'affichage HTML du panier (items, totaux, alertes)
 */
function updateCartDisplay() {
    const budgetInput = document.getElementById('cart-budget');
    userBudget = parseFloat(budgetInput.value) || 0;
    
    let total = 0;
    let savings = 0;
    const groupedByStore = {};

    shoppingCart.forEach((item, index) => {
        const store = item.store_name || 'Autres';
        if (!groupedByStore[store]) groupedByStore[store] = [];
        groupedByStore[store].push({ ...item, originalIndex: index });
        
        total += (item.unit_price || 0);
        
        const key = skuKey(item);
        const ana = analyticsBySku.get(key);
        if (ana && ana.avg && item.unit_price) {
            const itemVal = getSortableUnitPrice(item);
            if (itemVal && itemVal < ana.avg) {
                const factor = item.unit_price / itemVal;
                const saved = (ana.avg - itemVal) * factor;
                if (saved > 0) savings += saved;
            }
        }
    });

    const container = document.getElementById('cart-items');
    container.innerHTML = '';

    if (shoppingCart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--color-text-secondary); margin-top:20px;">Votre liste est vide.</p>';
    } else {
        Object.keys(groupedByStore).sort().forEach(store => {
            const storeDiv = document.createElement('div');
            storeDiv.className = 'store-group';
            storeDiv.innerHTML = `<div class="store-group-title">${store}</div>`;

            const byCat = {};
            groupedByStore[store].forEach(item => {
                const cat = item.categorie || 'Divers';
                if (!byCat[cat]) byCat[cat] = [];
                byCat[cat].push(item);
            });

            Object.keys(byCat).sort().forEach(cat => {
                const catDiv = document.createElement('div');
                catDiv.className = 'category-group';
                catDiv.innerHTML = `<div class="category-title">${cat}</div>`;

                byCat[cat].forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'cart-item';
                    row.innerHTML = `
                        <div class="cart-item-info">
                            <div class="cart-item-title">${item.item}</div>
                            <div class="cart-item-meta">${item.brand || ''} • ${item.quantity} ${item.unit}</div>
                        </div>
                        <div class="cart-item-actions">
                            <div class="cart-price">${item.unit_price.toFixed(2)}$</div>
                            <button class="remove-btn" onclick="removeFromCart(${item.originalIndex})">&times;</button>
                        </div>
                    `;
                    catDiv.appendChild(row);
                });
                storeDiv.appendChild(catDiv);
            });
            container.appendChild(storeDiv);
        });
    }

    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = total.toFixed(2) + ' $';
    
    const savingsEl = document.getElementById('cart-savings');
    if (savingsEl) savingsEl.textContent = savings.toFixed(2) + ' $';

    const warning = document.getElementById('budget-warning');
    if (warning && totalEl) {
        if (userBudget > 0 && total > userBudget) {
            warning.style.display = 'inline';
            totalEl.style.color = '#ef4444';
        } else {
            warning.style.display = 'none';
            totalEl.style.color = 'var(--color-text)';
        }
    }

    saveCart();
}

/**
 * Met à jour les options du sélecteur de semaine
 */
function updateWeekSelector() {
    const sel = document.getElementById('week-selector');
    if (!sel) return;

    sel.innerHTML = '';
    availableWeeks.forEach(weekKey => {
        const { year, week } = parseWeekKey(weekKey);
        const opt = document.createElement('option');
        opt.value = weekKey;
        opt.textContent = `Semaine ${week} de ${year}`;
        sel.appendChild(opt);
    });
    
    if (currentWeek) sel.value = currentWeek;
}

/**
 * Met à jour l'état des boutons de navigation (précédent/suivant)
 */
function updateNavigationButtons() {
    const idx = availableWeeks.indexOf(currentWeek);
    const prev = document.getElementById('prev-week');
    const next = document.getElementById('next-week');
    
    if (prev) {
        prev.disabled = idx >= availableWeeks.length - 1;
        prev.style.opacity = prev.disabled ? '0.5' : '1';
        prev.style.cursor = prev.disabled ? 'not-allowed' : 'pointer';
    }
    
    if (next) {
        next.disabled = idx <= 0;
        next.style.opacity = next.disabled ? '0.5' : '1';
        next.style.cursor = next.disabled ? 'not-allowed' : 'pointer';
    }
}

// ============================================================================
// RENDU DES ITEMS
// ============================================================================

/**
 * Génère le HTML pour l'affichage du prix unitaire
 */
function calculateUnitPrice(item) {
    if (!item.unit_price || !item.quantity || !item.unit) return '';
    
    const val = getSortableUnitPrice(item);
    if (!val) return '';
    
    const u = item.unit.toLowerCase();
    let label = '$/unité';
    
    if (u === 'g' || u === 'kg') label = '$/100g';
    else if (u === 'ml' || u === 'l') label = '$/100ml';
    else if (u !== 'un') label = `$/${u}`;
    
    return `<span style="font-size:12px;color:var(--color-text-secondary);">(${val.toFixed(2)} ${label})</span>`;
}

/**
 * Génère le HTML pour un badge et les insights
 */
function generateInsightsHtml(item, currentWeekItems, items) {
    const insights = computeDealInsights(item, currentWeekItems || items) || null;
    let badgeHtml = '';
    let linesHtml = '<div class="detail-row empty"></div>';
    
    if (insights) {
        const vsAvg = isFinite(insights.pctVsAvg) 
            ? `${insights.pctVsAvg < 0 ? '' : '+'}${insights.pctVsAvg.toFixed(0)}% vs moyenne` 
            : '';
        const vsComp = isFinite(insights.pctVsCompetitor) 
            ? `${insights.pctVsCompetitor < 0 ? '' : '+'}${insights.pctVsCompetitor.toFixed(0)}% vs meilleur concurrent` 
            : '';
        const last = Number.isFinite(insights.lastTimeWeeks) 
            ? `Dernière fois à ce prix : il y a ${insights.lastTimeWeeks} semaine${insights.lastTimeWeeks > 1 ? 's' : '<div class="detail-row empty"></div>'}` 
            : '<div class="detail-row empty"></div>';
        
        const parts = [vsAvg, vsComp].filter(Boolean).join('  |  ');
        const detail = [parts, last].filter(Boolean).join('\n');
        
        badgeHtml = `<div class="deal-badge ${insights.badge.cls}">${insights.badge.label}</div>`;
        if (detail) {
            linesHtml = `<div class="deal-insights"><div class="deal-line">${detail.replace(/\n/g, '<br>')}</div></div>`;
        }
    }
    return { badgeHtml, linesHtml };
}

/**
 * Affiche la liste des items (Mode Standard)
 */
function displayItems(items, currentWeekItems = null) {
    const container = document.getElementById('items-container');
    
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--color-text-secondary); grid-column:1/-1;">Aucune aubaine trouvée pour les critères sélectionnés.</p>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        const { badgeHtml, linesHtml } = generateInsightsHtml(item, currentWeekItems, items);
        const sku = skuKey(item).replace(/['"\\]/g, '\\$&');
        const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');
        
        return `
            <div class="item-card">
                <div class="item-header">
                    <div class="item-name">${item.item || 'Sans nom'}</div>
                    ${item.categorie ? `<div class="item-category">${item.categorie}</div>` : ''}
                    <div class="add-item"><button class="add-to-list-btn" onclick="addToCart(${itemJson})" title="Ajouter à ma liste">+</button></div>
                </div>
                <div class="item-details">
                    ${item.brand ? `<div class="detail-row"><span class="detail-label">Marque:</span><span class="detail-value">${item.brand}</span></div>` : '<div class="detail-row empty"></div>'}
                    ${item.unit ? `<div class="detail-row"><span class="detail-label">Unité:</span><span class="detail-value">${item.quantity || 1} ${item.unit}</span></div>` : '<div class="detail-row empty"></div>'}
                </div>
                <div class="item-price">
                    ${item.unit_price ? `
                        <div style="display:flex; align-items:baseline; gap:8px;">
                            <span style="font-size: var(--font-size-2xl); font-weight:600;">${item.unit_price.toFixed(2)} $</span>
                            ${calculateUnitPrice(item)}
                        </div>
                        ${badgeHtml}
                        ${linesHtml}
                    ` : 'Prix non disponible'}
                </div>
                <div class="item-store">
                    <span class="store-name">${item.store_name || 'Magasin inconnu'}</span>
                    <span class="item-date">${item.date ? new Date(item.date).toLocaleDateString('fr-CA') : ''}</span>
                </div>
                <button class="view-history-btn" onclick="openHistoryModal('${sku}')">📈 Voir l'historique complet</button>
            </div>
        `;
    }).join('');
}

/**
 * Affiche la liste des items (Mode Compact)
 */
function displayItemsCompact(items, currentWeekItems = null) {
    const container = document.getElementById('items-container');
    
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--color-text-secondary); grid-column:1/-1;">Aucune aubaine trouvée pour les critères sélectionnés.</p>';
        return;
    }
    
    // Regroupement
    const groups = new Map();
    for (const it of items) {
        const key = `${(it.item||'').trim().toLowerCase()}__${(it.brand||'').trim().toLowerCase()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
    }
    
    const compacted = [];
    groups.forEach(arr => {
        if (arr.length === 0) return;
        arr.sort((a, b) => {
            const ua = getSortableUnitPrice(a);
            const ub = getSortableUnitPrice(b);
            if (ua != null && ub != null) return ua - ub;
            return (a.unit_price || Infinity) - (b.unit_price || Infinity);
        });
        const best = arr[0];
        const others = arr.slice(1).map(o => `${o.store_name || 'Magasin'}: ${o.unit_price ? o.unit_price.toFixed(2) + ' $' : 'N/D'}`);
        compacted.push({ best, others });
    });

    // Tri des groupes
    const sortVal = document.getElementById('filter-sort').value;
    compacted.sort((A, B) => {
        const a = A.best, b = B.best;
        if (sortVal === 'price-asc') return (a.unit_price || 0) - (b.unit_price || 0);
        if (sortVal === 'price-desc') return (b.unit_price || 0) - (a.unit_price || 0);
        return 0; // Simplifié pour brevity, logique complète dans script.js
    });
    
    container.innerHTML = compacted.map(g => {
        const item = g.best;
        const { badgeHtml, linesHtml } = generateInsightsHtml(item, currentWeekItems, items);
        const sku = skuKey(item).replace(/['"\\]/g, '\\$&');
        const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');
        const othersHtml = g.others.length 
            ? `<div class="deal-insights" style="margin-top:6px;"><div class="deal-line"><strong>Autres enseignes:</strong> ${g.others.join(' • ')}</div></div>` 
            : '';
        
        return `
            <div class="item-card">
                <div class="item-header">
                    <div class="item-name">${item.item || 'Sans nom'}</div>
                    ${item.categorie ? `<div class="item-category">${item.categorie}</div>` : ''}
                    <div class="add-item"><button class="add-to-list-btn" onclick="addToCart(${itemJson})" title="Ajouter à ma liste">+</button></div>
                </div>
                <div class="item-details">
                    ${item.brand ? `<div class="detail-row"><span class="detail-label">Marque:</span><span class="detail-value">${item.brand}</span></div>` : '<div class="detail-row empty"></div>'}
                    ${item.unit ? `<div class="detail-row"><span class="detail-label">Unité:</span><span class="detail-value">${item.quantity || 1} ${item.unit}</span></div>` : '<div class="detail-row empty"></div>'}
                </div>
                <div class="item-price">
                    ${item.unit_price ? `
                        <div style="display:flex; align-items:baseline; gap:8px;">
                            <span style="font-size: var(--font-size-2xl); font-weight:600;">${item.unit_price.toFixed(2)} $</span>
                            ${calculateUnitPrice(item)}
                        </div>
                        ${badgeHtml}
                        ${linesHtml}
                        ${othersHtml}
                    ` : 'Prix non disponible'}
                </div>
                <div class="item-store">
                    <span class="store-name">${item.store_name || 'Magasin inconnu'}</span>
                    <span class="item-date">${item.date ? new Date(item.date).toLocaleDateString('fr-CA') : ''}</span>
                </div>
                <button class="view-history-btn" onclick="openHistoryModal('${sku}')">📈 Voir l'historique complet</button>
            </div>
        `;
    }).join('');
}

/**
 * Routeur d'affichage (Standard ou Compact)
 */
function renderList(items, currentWeekItems = null) {
    const compact = document.getElementById('compact-mode')?.checked;
    if (compact) {
        displayItemsCompact(items, currentWeekItems);
    } else {
        displayItems(items, currentWeekItems);
    }
}

/**
 * Initialise les filtres dynamiques (Magasins & Catégories)
 */
function populateFilters() {
    const stores = [...new Set(allItems.map(i => i.store_name))].filter(Boolean).sort();
    const cats = [...new Set(allItems.map(i => i.categorie))].filter(Boolean).sort();
    
    // Checkboxes Magasins
    const storeContainer = document.getElementById('store-list-container');
    if (storeContainer) {
        storeContainer.innerHTML = '';
        stores.forEach(store => {
            const label = document.createElement('label');
            label.className = 'store-checkbox-label';
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'store-select';
            input.value = store;
            input.checked = true;
            input.addEventListener('change', filterItems);
            
            label.appendChild(input);
            label.appendChild(document.createTextNode(store));
            storeContainer.appendChild(label);
        });
    }
    
    // Select Catégories
    const catSel = document.getElementById('filter-category');
    if (catSel) {
        while (catSel.options.length > 1) catSel.remove(1);
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            catSel.appendChild(opt);
        });
    }
}

// Initialisation des écouteurs de fermeture de modale
window.addEventListener('DOMContentLoaded', function() {
    const historyModal = document.getElementById('history-modal');
    const cartModal = document.getElementById('cart-modal');
    
    if (historyModal) {
        historyModal.addEventListener('click', e => {
            if (e.target.id === 'history-modal') closeHistoryModal();
        });
    }
    
    if (cartModal) {
        cartModal.addEventListener('click', e => {
            if (e.target.id === 'cart-modal') closeCart();
        });
    }
});
/**
 * header_footer.js
 * Gestion de l'injection dynamique des éléments communs de l'interface (Header, Footer, Modales)
 */

// HTML du Header
const baseHeaderHTML = `
<header>
    <div class="header-container">
        <div class="logo">
            <h1>🛒 Aubaines Épicerie</h1>
            <p>Suivi des circulaires du Québec</p>
        </div>
        <nav>
            <ul>
                <li>
                    <a href="index.html">Accueil</a>
                    <!-- Placeholder pour le sélecteur de magasin (injecté si page d'accueil) -->
                    <div id="store-selector-placeholder"></div>
                </li>
                <li><a href="circulaire.html">Circulaire</a></li>
                <li>
                    <button onclick="openCart()" class="cart-btn">
                        <span>🛒 Ma Liste</span>
                        <span id="cart-count" style="background: rgba(255,255,255,0.2); padding:2px 6px; border-radius:10px; font-size: .8em;">0</span>
                    </button>
                </li>
            </ul>
        </nav>
    </div>
</header>
`;

// HTML du Footer
const footerHTML = `
<footer>
    <div class="footer-container">
        <div class="footer-info" style="flex:1;">
            <h3 class="font-lg text-primary">Aubaines Épicerie</h3>
            <p class="font-sm text-secondary">Votre source pour les meilleures aubaines d'épicerie au Québec</p>
            <p class="mt-20 font-sm text-secondary">&copy; 2025 Aubaines Épicerie. Tous droits réservés.</p>
        </div>
        <div class="footer-links">
            <ul class="footer-links-list">
                <li><a href="mentions_legales.html" class="footer-link">Mentions Légales</a></li>
            </ul>
        </div>
    </div>
</footer>
`;

// HTML du Sélecteur de magasin (spécifique sidebar)
const storeSelectorHTML = `
<div class="nav-subsection">
    <div id="store-list-container" class="store-list"></div>
</div>
`;

// HTML de la Modale Panier (Centralisée pour éviter la duplication)
const cartModalHTML = `
<div id="cart-modal" class="modal-overlay">
    <div class="modal-content cart-modal-content">
        <button class="close-modal" onclick="closeCart()">&times;</button>
        <div class="cart-header">
            <h3 class="font-xl text-primary">Ma Liste d'Épicerie</h3>
            <div class="budget-control">
                <label for="cart-budget">Budget Max ($):</label>
                <input type="number" id="cart-budget" value="100" onchange="updateCartDisplay()">
                <span id="budget-warning" class="budget-alert hidden">⚠️ Budget dépassé !</span>
            </div>
        </div>
        <div id="cart-items" class="cart-items-container">
            <p class="text-center text-secondary mt-20">Votre liste est vide.</p>
        </div>
        <div class="cart-footer">
            <div class="cart-summary-row">
                <span>Économies estimées (vs prix moyen) :</span>
                <span id="cart-savings" class="cart-savings">0.00 $</span>
            </div>
            <div class="cart-summary-row">
                <span class="font-lg font-bold">Total estimé :</span>
                <span id="cart-total" class="cart-total">0.00 $</span>
            </div>
            <div class="cart-export-row text-right mt-20">
                <button id="exportPdfBtn" class="btn-primary">
                    Exporter en PDF 📥
                </button>
            </div>
        </div>
    </div>
</div>
`;

/**
 * Injecte le contenu commun dans le DOM
 * S'exécute au chargement de la page
 */
function injectContent() {
    const currentPath = window.location.pathname;
    const isHomePage = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('/');

    // 1. Injection du Header
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        headerPlaceholder.innerHTML = baseHeaderHTML;
        
        // Injection conditionnelle du sélecteur de magasin
        const storePlaceholder = document.getElementById('store-selector-placeholder');
        if (isHomePage && storePlaceholder) {
            storePlaceholder.outerHTML = storeSelectorHTML;
        } else if (storePlaceholder) {
            storePlaceholder.remove();
        }
    }

    // 2. Injection du Footer
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
        footerPlaceholder.innerHTML = footerHTML;
    }

    // 3. Injection de la Modale Panier (append à la fin du body)
    if (!document.getElementById('cart-modal')) {
        document.body.insertAdjacentHTML('beforeend', cartModalHTML);
    }
}

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', injectContent);
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
                    <!-- Store Selector placeholder -->
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

const footerHTML = `
<footer>
    <div class="footer-container" style="max-width:1200px; margin:0 auto; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: var(--space-16);">
        <div class="footer-info" style="flex:1;">
            <h3 style="font-size: var(--font-size-lg); color: var(--color-primary);">Aubaines Épicerie</h3>
            <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">Votre source pour les meilleures aubaines d'épicerie au Québec</p>
            <p style="margin-top: var(--space-8); font-size: var(--font-size-sm); color: var(--color-text-secondary);">&copy; 2025 Aubaines Épicerie. Tous droits réservés.</p>
        </div>
        <div class="footer-links">
            <ul style="list-style:none; display:flex; gap: var(--space-16);">
                <li><a href="mentions_legales.html" class="footer-link">Mentions Légales</a></li>
            </ul>
        </div>
    </div>
</footer>
`;

const storeSelectorHTML = `
<div class="nav-subsection">
    <div id="store-list-container" class="store-list"></div>
</div>
`;

/**
 * Injecte le Header et le Footer dynamiquement dans la page
 */
function injectContent() {
    // 1. Détermine si la page est la page d'accueil
    const currentPath = window.location.pathname;
    const isHomePage = currentPath.endsWith('index.html') || currentPath === '/';

    let finalHeaderHTML = baseHeaderHTML;

    // 2. Gestion conditionnelle du sélecteur de magasins
    if (isHomePage) {
        finalHeaderHTML = baseHeaderHTML.replace('<!-- Store Selector placeholder -->', storeSelectorHTML);
    } else {
        finalHeaderHTML = baseHeaderHTML.replace('<!-- Store Selector placeholder -->', '');
    }

    // 3. Injection
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        headerPlaceholder.innerHTML = finalHeaderHTML;
    }

    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
        footerPlaceholder.innerHTML = footerHTML;
    }
}

document.addEventListener('DOMContentLoaded', injectContent);
/**
 * Ouvre la circulaire du magasin sélectionné dans un nouvel onglet
 * @param {string} store - Identifiant du magasin (maxi, iga, metro)
 */
function openFlyer(store) {
    const urls = {
        maxi: "https://www.maxi.ca/fr/print-flyer",
        iga: "https://www.iga.net/fr/circulaire",
        metro: "https://www.metro.ca/circulaire"
    };

    if (urls[store]) {
        window.open(urls[store], "_blank");
    }
}
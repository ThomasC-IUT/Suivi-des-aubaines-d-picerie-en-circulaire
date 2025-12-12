/**
 * Ouvre la circulaire du magasin sélectionné dans un nouvel onglet
 * @param {string} store - Identifiant du magasin (maxi, iga, metro)
 */
function openFlyer(store) {
    let url = "";
    switch (store) {
        case "maxi":
            url = "https://www.maxi.ca/fr/print-flyer";
            break;
        case "iga":
            url = "https://www.iga.net/fr/circulaire";
            break;
        case "metro":
            url = "https://www.metro.ca/circulaire";
            break;
    }
    if (url) {
        window.open(url, "_blank");
    }
}
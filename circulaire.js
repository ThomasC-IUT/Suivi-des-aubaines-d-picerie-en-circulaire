function openFlyer(store) {
    let url = "";
    switch (store) {
        case "maxi":
            url = "https://www.maxi.ca/fr/print-flyer";
            break;
        case "iga":
            url = "https://www.iga.net/fr/circulaire";
            break;
        case "Metro":
            url = "https://www.metro.ca/circulaire";
            break;
    }
    window.open(url, "_blank");
}

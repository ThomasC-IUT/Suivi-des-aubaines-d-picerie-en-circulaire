function openFlyer(store) {
    let url = "";
    switch (store) {
        case "maxi":
            url = "https://www.maxi.ca/fr/print-flyer";
            break;
        case "iga":
            url = "https://www.iga.net/fr/circulaire";
            break;
        case "walmart":
            url = "https://www.walmart.ca/fr/flyer?locale=fr&store_code=1201";
            break;
    }
    window.open(url, "_blank");
}

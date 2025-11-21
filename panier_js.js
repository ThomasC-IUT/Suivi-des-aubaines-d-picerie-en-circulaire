// Panier initial avec 14 items
let cart = [
    { name: "Lait", price: 3.50, store: "Maxi" },
    { name: "Pain", price: 2.25, store: "IGA" },
    { name: "Oeufs", price: 4.75, store: "Walmart" },
    { name: "Beurre", price: 5.00, store: "IGA" },
    { name: "Fromage", price: 6.50, store: "Maxi" },
    { name: "Yaourt", price: 3.00, store: "Walmart" },
    { name: "Jus d'orange", price: 4.20, store: "IGA" },
    { name: "Céréales", price: 4.50, store: "Maxi" },
    { name: "Tomates", price: 2.80, store: "IGA" },
    { name: "Pommes", price: 3.90, store: "Walmart" },
    { name: "Bananes", price: 1.80, store: "IGA" },
    { name: "Pâtes", price: 2.20, store: "Maxi" },
    { name: "Riz", price: 2.60, store: "Walmart" },
    { name: "Chocolat", price: 5.50, store: "IGA" }
];

// Afficher les items
function displayCart() {
    const container = document.getElementById("cart-items");
    container.innerHTML = "";

    cart.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "cart-item";
        div.innerHTML = `
            <div class="photo-placeholder">Photo</div>
            <div class="info">
                <span><strong>${item.name}</strong></span>
                <span>Prix: $${item.price.toFixed(2)}</span>
                <span>Épicier: ${item.store}</span>
            </div>
            <button onclick="removeItem(${index})">Supprimer</button>
        `;
        container.appendChild(div);
    });
}

// Supprimer un item
function removeItem(index) {
    cart.splice(index, 1);
    displayCart();
}

// Tri par prix ascendant
function sortPriceAsc() {
    cart.sort((a, b) => a.price - b.price);
    displayCart();
}

// Tri par prix descendant
function sortPriceDesc() {
    cart.sort((a, b) => b.price - a.price);
    displayCart();
}

// Tri par épicier alphabétique
function sortStore() {
    cart.sort((a, b) => a.store.localeCompare(b.store));
    displayCart();
}

// Export PDF (fonction simplifiée)
function exportPDF() {
    alert("Fonction Export PDF non implémentée pour l'instant.");
}

// Envoyer par e-mail
function sendEmail() {
    const email = prompt("Entrez l'adresse e-mail à laquelle envoyer le panier :");
    if (email) {
        alert(`Le panier sera envoyé à : ${email} (fonction non implémentée pour l'instant).`);
    }
}

// Affichage initial
displayCart();
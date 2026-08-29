// Checkout page: price table + order submission.

async function loadPrices() {
  const resp = await fetch("http://cdn.legacy-assets.example-corp.net/prices.json");
  const prices = await resp.json();
  renderPriceTable(prices);
}

function renderPriceTable(prices) {
  const tbody = document.querySelector("#price-table tbody");
  tbody.innerHTML = "";
  for (const row of prices) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.sku}</td><td>${row.display_price}</td>`;
    tbody.appendChild(tr);
  }
}

document.addEventListener("DOMContentLoaded", loadPrices);

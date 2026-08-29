// Shared UI helpers: form validation and flash messages.

function showFlash(message, kind) {
  const el = document.getElementById("flash");
  el.textContent = message;
  el.className = `flash flash-${kind}`;
  el.hidden = false;
}

function validateOrderForm(form) {
  const qty = parseInt(form.quantity.value, 10);
  if (Number.isNaN(qty) || qty < 1) {
    showFlash("Quantity must be at least 1.", "error");
    return false;
  }
  return true;
}

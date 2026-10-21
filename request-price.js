const form = document.querySelector('#requestForm');
let cart = {};
try {
  const savedCart = JSON.parse(localStorage.getItem('quoteCart') || '{}');
  if (savedCart && typeof savedCart === 'object' && !Array.isArray(savedCart)) cart = savedCart;
} catch {
  localStorage.removeItem('quoteCart');
}
const itemLines = () => Object.entries(cart)
  .filter(([sku, qty]) => sku && Number.isFinite(Number(qty)) && Number(qty) > 0)
  .map(([sku, qty]) => `${sku} — Qty: ${Math.floor(Number(qty))}`);

form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  const body = [
    `Company name: ${data.get('company')}`,
    `VAT number: ${data.get('vat') || 'Not provided'}`,
    `Contact person: ${data.get('contact')}`,
    `Company email: ${data.get('email')}`,
    `Phone number: ${data.get('phone')}`,
    `Delivery area: ${data.get('deliveryArea')}`,
    `Notes: ${data.get('notes') || 'None'}`,
    '', 'Products:', ...(itemLines().length ? itemLines() : ['No products selected — general pricing enquiry'])
  ].join('\n');
  window.location.href = `mailto:sales@vukapowertrade.com?subject=${encodeURIComponent(`Price request — ${data.get('company')}`)}&body=${encodeURIComponent(body)}`;
});

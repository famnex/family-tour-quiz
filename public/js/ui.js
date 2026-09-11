window.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.showToast = (message, error = false) => {
  const el = document.getElementById('toast-message');
  el.textContent = message;
  el.className = 'toast-message' + (error ? ' toast-error' : '');
  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => el.classList.add('hidden'), error ? 6500 : 3000);
};
document.querySelectorAll('.emoji-choice, .color-choice').forEach(el => {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', el.dataset.emoji ? `Avatar ${el.dataset.emoji}` : `Farbe ${el.dataset.color}`);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
});
document.querySelectorAll('button[title]').forEach(el => el.setAttribute('aria-label', el.title));
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  const title = el.querySelector('h2,h3');
  if (title) { title.id ||= el.id + '-title'; el.setAttribute('aria-labelledby', title.id); }
});

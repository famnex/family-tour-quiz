(() => {
  const dialog = document.getElementById('admin-reset-dialog');
  const form = document.getElementById('admin-reset-form');
  const status = document.getElementById('admin-reset-status');
  let busy = false;
  document.getElementById('admin-reset-open').addEventListener('click', () => {
    form.reset(); status.textContent = ''; dialog.showModal();
  });
  document.getElementById('admin-reset-close').addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', () => form.reset());
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const password = document.getElementById('admin-reset-password').value;
    if (password !== document.getElementById('admin-reset-repeat').value) {
      status.textContent = 'Die Passwörter stimmen nicht überein.'; return;
    }
    const code = document.getElementById('admin-reset-code').value.trim();
    busy = true; form.querySelector('button[type="submit"]').disabled = true;
    status.textContent = 'Passwort wird gespeichert …';
    try {
      const res = await fetch(window.apiUrl('/api/admin/reset-password'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Zurücksetzen fehlgeschlagen.');
      sessionStorage.removeItem('rallye_admin_unlocked');
      document.getElementById('admin-pw-input').value = '';
      form.reset();
      status.textContent = 'Passwort gespeichert. Schließe diesen Dialog und melde dich mit dem neuen Passwort an.';
    } catch (error) { status.textContent = error.message || 'Verbindung fehlgeschlagen. Bitte erneut versuchen.'; }
    finally { busy = false; form.querySelector('button[type="submit"]').disabled = false; }
  });
})();

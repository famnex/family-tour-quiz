(() => {
  const dialog = document.getElementById('invite-dialog');
  const input = document.getElementById('invite-url');
  const qr = document.getElementById('invite-qr');
  const status = document.getElementById('invite-status');
  const buttons = [...dialog.querySelectorAll('[data-invite-action]')];
  let sequence = 0, readyUrl = '', svg = '';
  const invalidate = () => {
    sequence++; readyUrl = ''; svg = ''; qr.replaceChildren();
    buttons.forEach(b => b.disabled = true);
    status.textContent = 'Adresse prüfen und QR-Code erstellen.';
  };
  const generate = async () => {
    invalidate();
    let url;
    try {
      url = new URL(input.value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      if (['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(url.hostname)) {
        status.textContent = 'Diese Adresse funktioniert nur auf diesem Gerät. Trage die WLAN-IP des Servers oder die öffentliche Adresse ein (mit Port und ggf. /family/).';
        input.focus(); return;
      }
    } catch { status.textContent = 'Bitte eine vollständige http://- oder https://-Adresse eingeben.'; return; }
    const requestId = sequence;
    status.textContent = 'QR-Code wird erstellt …';
    try {
      const res = await window.admin.request(window.apiUrl('/api/admin/invite-qr'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.href })
      });
      const data = await res.json();
      if (requestId !== sequence || !dialog.open) return;
      readyUrl = data.url; svg = data.svg;
      // SVG comes only from the server QR encoder, never from supplied markup.
      qr.innerHTML = svg;
      qr.querySelector('svg').setAttribute('role', 'img');
      qr.querySelector('svg').setAttribute('aria-label', 'QR-Code zum Beitreten der Rallye');
      buttons.forEach(b => b.disabled = false);
      status.textContent = 'Mit der Smartphone-Kamera scannen. Bei einer WLAN-Adresse müssen alle Geräte das Servernetz erreichen können.';
    } catch {
      if (requestId === sequence) status.textContent = 'QR-Code konnte nicht erstellt werden. Prüfe Verbindung und Admin-Anmeldung.';
    }
  };
  const open = () => {
    input.value = new URL(window.apiUrl('/'), location.origin).href;
    dialog.showModal(); generate();
  };
  document.getElementById('invite-open-btn').addEventListener('click', open);
  document.getElementById('mobile-invite-open-btn').addEventListener('click', () => {
    document.getElementById('admin-mobile-drawer').classList.add('hidden'); open();
  });
  document.getElementById('invite-close-btn').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', invalidate);
  input.addEventListener('input', invalidate);
  document.getElementById('invite-form').addEventListener('submit', e => { e.preventDefault(); generate(); });
  document.getElementById('invite-copy-btn').addEventListener('click', async () => {
    if (!readyUrl) return;
    try { await navigator.clipboard.writeText(readyUrl); status.textContent = 'Einladungslink kopiert ✓'; }
    catch { input.focus(); input.select(); status.textContent = 'Der Link ist markiert. Bitte über das Gerätemenü kopieren.'; }
  });
  document.getElementById('invite-share-btn').addEventListener('click', async () => {
    if (!readyUrl) return;
    if (!navigator.share) { document.getElementById('invite-copy-btn').click(); return; }
    try { await navigator.share({title: 'Komm zur Familien-Rallye!', text: 'Hier kannst du mitspielen:', url: readyUrl}); }
    catch (e) { if (e.name !== 'AbortError') status.textContent = 'Teilen nicht möglich. Bitte den Link kopieren.'; }
  });
  document.getElementById('invite-download-btn').addEventListener('click', () => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], {type:'image/svg+xml'}));
    const a = document.createElement('a'); a.href = url; a.download = 'rallye-einladung.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();

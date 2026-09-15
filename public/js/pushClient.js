(() => {
  const dialog = document.getElementById('push-dialog');
  const status = document.getElementById('push-status');
  const enable = document.getElementById('push-enable');
  const disable = document.getElementById('push-disable');
  let registration, publicKey, busy = false;
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const request = async (path, data) => {
    const res = await fetch(window.apiUrl(path), {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${window.app?.token || ''}`}, body:JSON.stringify(data)});
    const result = await res.json();
    if (!res.ok) throw Error(result.error || 'Push-Einstellung konnte nicht gespeichert werden.');
    return result;
  };
  const prepare = async () => {
    enable.disabled = true; disable.disabled = true;
    if (!supported) { status.textContent = 'Push ist hier nicht verfügbar. Verwende HTTPS und auf iPhone/iPad die App vom Home-Bildschirm (iOS 16.4 oder neuer).'; return; }
    if (!window.app?.token) { status.textContent = 'Bitte zuerst als Mitspieler anmelden.'; return; }
    if (Notification.permission === 'denied') { status.textContent = 'Benachrichtigungen sind blockiert. Bitte in den Browser- oder Geräteeinstellungen erlauben.'; return; }
    try {
      const response = await fetch(window.apiUrl('/api/push/key'));
      if (!response.ok) throw Error('Push-Konfiguration nicht erreichbar.');
      publicKey = (await response.json()).publicKey;
      registration = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(()=>reject(Error('App wird vorbereitet. Bitte erneut öffnen.')),8000))]);
      const sub = await registration.pushManager.getSubscription();
      enable.disabled = false; disable.disabled = !sub;
      status.textContent = sub ? 'Push ist auf diesem Gerät erlaubt. Mit „Push erlauben“ die Anmeldung beim Rallye-Server bestätigen/erneuern.' : 'Tippe auf „Push erlauben“ und bestätige die Anfrage deines Geräts.';
    } catch (e) { status.textContent = e.message; }
  };
  document.getElementById('push-settings-btn').addEventListener('click', () => { dialog.showModal(); prepare(); });
  document.getElementById('push-close').addEventListener('click', () => dialog.close());
  enable.addEventListener('click', async () => {
    if (busy || !registration || !publicKey) return;
    busy = true; enable.disabled = true; disable.disabled = true;
    try {
      // Permission is requested directly from this user action (required on iOS).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw Error('Push wurde nicht erlaubt. Du kannst es später erneut aktivieren.');
      const bytes = Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
      const sub = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
      await request('/api/push/subscribe',{subscription:sub.toJSON()});
      status.textContent = '✓ Push-Nachrichten sind für dieses Gerät aktiviert.';
      disable.disabled = false;
    } catch(e) { status.textContent = e.message || 'Push konnte nicht aktiviert werden.'; }
    finally { busy = false; enable.disabled = false; }
  });
  disable.addEventListener('click', async () => {
    if (busy || !registration) return;
    busy = true; enable.disabled = true; disable.disabled = true;
    try {
      const sub = await registration.pushManager.getSubscription();
      if (sub) { await request('/api/push/unsubscribe',{endpoint:sub.endpoint}); await sub.unsubscribe(); }
      status.textContent = 'Push-Nachrichten sind ausgeschaltet.';
    } catch(e) { status.textContent = e.message; disable.disabled = false; }
    finally { busy = false; enable.disabled = false; }
  });
})();

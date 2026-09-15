(() => {
  const app = document.getElementById('app');
  const viewport = document.querySelector('meta[name="viewport"]');
  const normalViewport = viewport.content;
  let restoreTimer;
  window.restoreLiveScale = () => {
    if (document.querySelector('dialog[open], #admin-modal:not(.hidden)')) return;
    clearTimeout(restoreTimer);
    // iOS may retain its input zoom after blur. Request scale 1 without a reload.
    viewport.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, viewport-fit=cover';
    restoreTimer = setTimeout(() => { viewport.content = normalViewport; }, 400);
  };
  // Restrict browser pinch/double-tap zoom to the live surface, keeping scrolling.
  const onLiveSurface = e => e.target instanceof Element && app.contains(e.target);
  document.addEventListener('gesturestart', e => { if (onLiveSurface(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturechange', e => { if (onLiveSurface(e)) e.preventDefault(); }, { passive: false });
  app.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  app.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
})();

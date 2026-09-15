(() => {
  const app = document.getElementById('app');
  const viewport = document.querySelector('meta[name="viewport"]');
  const normalViewport = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
  const liveViewport = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, viewport-fit=cover';
  const adminOrDialogOpen = () => !!document.querySelector('dialog[open], #admin-modal:not(.hidden)');
  const isZoomed = () => (window.visualViewport?.scale || 1) > 1.01;
  const updateTouchPolicy = () => {
    // Never trap an already zoomed view: allow the user to pinch back out.
    app.style.touchAction = isZoomed() ? 'auto' : 'pan-x pan-y';
  };
  const updateViewport = () => {
    const value = adminOrDialogOpen() ? normalViewport : liveViewport;
    if (viewport.content !== value) viewport.content = value;
    updateTouchPolicy();
  };
  // Set the live limit BEFORE focus, and retain it throughout keyboard dismissal.
  // Removing it on a fixed 400ms timer can race iOS keyboard/viewport animations.
  window.prepareLiveInput = updateViewport;
  window.restoreLiveScale = updateViewport;
  updateViewport();
  const observer = new MutationObserver(updateViewport);
  for (const el of document.querySelectorAll('dialog, #admin-modal')) {
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'open'] });
  }
  app.addEventListener('pointerdown', updateViewport, { capture: true, passive: true });
  window.visualViewport?.addEventListener('resize', updateTouchPolicy);
  window.addEventListener('pageshow', updateViewport);
  const onLiveSurface = e => e.target instanceof Element && app.contains(e.target);
  document.addEventListener('gesturestart', e => { if (onLiveSurface(e) && !isZoomed()) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturechange', e => { if (onLiveSurface(e) && !isZoomed()) e.preventDefault(); }, { passive: false });
  app.addEventListener('touchmove', e => { if (e.touches.length > 1 && !isZoomed()) e.preventDefault(); }, { passive: false });
  app.addEventListener('wheel', e => { if (e.ctrlKey && !isZoomed()) e.preventDefault(); }, { passive: false });
})();

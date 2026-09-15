(() => {
  const app = document.getElementById('app');
  // Restrict browser pinch/double-tap zoom to the live surface, keeping scrolling.
  const onLiveSurface = e => e.target instanceof Element && app.contains(e.target);
  document.addEventListener('gesturestart', e => { if (onLiveSurface(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturechange', e => { if (onLiveSurface(e)) e.preventDefault(); }, { passive: false });
  app.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  app.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
})();

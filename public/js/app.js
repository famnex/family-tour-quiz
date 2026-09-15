/**
 * Familienausflug-Rallye Companion App Client
 */
class RallyeApp {
  constructor() {
    this.user = null;
    this.token = null;
    this.ws = null;
    this.odometer = null;
    this.state = null;
    this.timerInterval = null;
    this.heartbeatInterval = null;
    this.hasCelebratedPhase4 = false;
    this.lastPhase = null;
    this.currentSlideId = null;
    this.miniMap = null;
    this.miniMapMarker = null;
    this.localSubmissions = {};
    this.currentEstValue = '';
    this.currentEstSlideId = null;
    this.estDebounceTimer = null;
    this.hasPerformedGrandCeremony = false;
    this.isCeremonyRunning = false;
    this.fallbackPollingInterval = null;
    this.wsRetryCount = 0;
  }

  async init() {
    this.initOdometer();
    this.bindEvents();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(window.apiUrl('/sw.js'), { scope: window.apiUrl('/') })
        .catch(e => console.warn('Offline-Cache nicht verfügbar:', e));
    }

    if (window.admin) {
      window.admin.init();
    }

    // 1. Sofort initialen State laden & rendern
    await this.fetchInitialState();

    // 2. Fallback Polling sofort starten
    this.startFallbackPolling();

    // 3. Authentifizierung prüfen & WebSocket verbinden
    await this.checkAuth();
  }

  initOdometer() {
    const odoContainer = document.getElementById('odometer-container');
    if (odoContainer && typeof Odometer !== 'undefined') {
      this.odometer = new Odometer(odoContainer, 4);
    }
  }

  bindEvents() {
    // Sound Toggle Button
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', () => {
        const isMuted = window.soundFx.toggleMute();
        soundToggleBtn.textContent = isMuted ? '🔇' : '🔊';
      });
    }

    // Login Form Submit
    const authForm = document.getElementById('auth-form');
    if (authForm) {
      authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Avatar Color & Emoji Selection
    document.querySelectorAll('.emoji-choice').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.emoji-choice').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
      });
    });

    document.querySelectorAll('.color-choice').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.color-choice').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
      });
    });

    // Logout on Profile Badge Click
    const profileBadge = document.getElementById('user-profile-btn') || document.querySelector('.user-profile-badge');
    if (profileBadge) {
      profileBadge.style.cursor = 'pointer';
      profileBadge.title = 'Klicken zum Abmelden';
      profileBadge.addEventListener('click', () => {
        if (confirm('Möchtest du dich wirklich abmelden?')) {
          this.logout();
        }
      });
    }

    // Image Lightbox Close
    const lightboxModal = document.getElementById('image-lightbox-modal');
    const closeLightboxBtn = document.getElementById('close-lightbox-btn');
    if (lightboxModal) {
      lightboxModal.addEventListener('click', () => {
        lightboxModal.classList.add('hidden');
      });
    }
    if (closeLightboxBtn) {
      closeLightboxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        lightboxModal?.classList.add('hidden');
      });
    }

    // Winner Trophy Modal Close Button
    const closeTrophyBtn = document.getElementById('close-winner-trophy-btn');
    const trophyModal = document.getElementById('winner-trophy-modal');
    if (closeTrophyBtn) {
      closeTrophyBtn.addEventListener('click', () => {
        trophyModal?.classList.add('hidden');
      });
    }
  }

  openImageLightbox(imageUrl) {
    const modal = document.getElementById('image-lightbox-modal');
    const img = document.getElementById('lightbox-full-img');
    if (modal && img && imageUrl) {
      img.src = imageUrl;
      modal.classList.remove('hidden');
    }
  }

  async logout() {
    if (window.admin?.guard && !await window.admin.guard.confirmLeave()) return;
    await fetch(window.apiUrl('/api/auth/logout'), { method: 'POST' });
    localStorage.removeItem('rallye_auth_token');
    localStorage.removeItem('rallye_username');
    localStorage.removeItem('rallye_user_emoji');
    localStorage.removeItem('rallye_user_color');
    sessionStorage.removeItem('rallye_admin_unlocked');
    this.user = null;
    this.token = null;
    this.localSubmissions = {};
    this.currentEstSlideId = null;
    if (this.ws) this.ws.close();

    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = 'Gast';

    document.getElementById('admin-modal')?.classList.add('hidden');
    document.getElementById('auth-modal')?.classList.remove('hidden');
  }

  async checkAuth() {
    const savedToken = localStorage.getItem('rallye_auth_token');
    const savedName = localStorage.getItem('rallye_username');
    const savedEmoji = localStorage.getItem('rallye_user_emoji') || '🌟';
    const savedColor = localStorage.getItem('rallye_user_color') || '#4f46e5';

    if (savedToken || savedName) {
      try {
        const headers = {};
        if (savedToken) headers['Authorization'] = `Bearer ${savedToken}`;
        if (savedName) headers['x-user-name'] = encodeURIComponent(savedName);

        const res = await fetch(window.apiUrl('/api/auth/me'), { headers });
        if (res.ok) {
          const data = await res.json();
          this.user = data.user;
          this.token = savedToken;
          localStorage.setItem('rallye_auth_token', this.token);
          this.onAuthenticated();
          return;
        } else if (savedName) {
          // Auto-re-register if user was deleted or DB was re-seeded
          const reLogin = await fetch(window.apiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: savedName,
              role: 'player',
              avatar_emoji: savedEmoji,
              avatar_color: savedColor
            })
          });
          if (reLogin.ok) {
            const reData = await reLogin.json();
            this.user = reData.user;
            this.token = reData.token;
            localStorage.setItem('rallye_auth_token', this.token);
            this.onAuthenticated();
            return;
          }
        }
      } catch (e) {
        console.warn('Auth check failed', e);
      }
    }

    document.getElementById('auth-modal')?.classList.remove('hidden');
  }

  async handleLogin() {
    const nameInput = document.getElementById('login-name');
    const selectedEmoji = document.querySelector('.emoji-choice.selected')?.dataset.emoji || '🌟';
    const selectedColor = document.querySelector('.color-choice.selected')?.dataset.color || '#4f46e5';

    const name = nameInput?.value?.trim();
    if (!name) return;

    try {
      const res = await fetch(window.apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          role: 'player',
          avatar_emoji: selectedEmoji,
          avatar_color: selectedColor
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Fehler beim Anmelden');
        return;
      }

      const data = await res.json();
      this.user = data.user;
      this.token = data.token;
      localStorage.setItem('rallye_auth_token', this.token);
      localStorage.setItem('rallye_username', this.user.name);
      localStorage.setItem('rallye_user_emoji', this.user.avatar_emoji || selectedEmoji);
      localStorage.setItem('rallye_user_color', this.user.avatar_color || selectedColor);

      document.getElementById('auth-modal')?.classList.add('hidden');
      this.onAuthenticated();
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler beim Anmelden');
    }
  }

  async onAuthenticated() {
    const avatarEl = document.getElementById('user-avatar-circle');
    const nameEl = document.getElementById('user-display-name');

    if (avatarEl) {
      avatarEl.textContent = this.user.avatar_emoji || '🌟';
      avatarEl.style.backgroundColor = this.user.avatar_color || '#4f46e5';
    }
    if (nameEl) {
      nameEl.textContent = this.user.name;
    }

    if (this.odometer) {
      this.odometer.set(this.user.score || 0, false);
    }

    if (window.admin) {
      window.admin.init();
    }

    // 1. Sofort initialen State per HTTP laden (kein Warten auf WS-Verbindung)
    await this.fetchInitialState();

    // 2. WebSocket für Echtzeit-Synchronisation verbinden
    this.connectWebSocket();

    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 10000);
  }

  async fetchInitialState() {
    try {
      const headers = {};
      if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
      const res = await fetch(window.apiUrl('/api/state'), { headers });
      if (res.ok) {
        const state = await res.json();
        this.state = state;
    this.serverOffset = state.server_time ? state.server_time - Date.now() : 0;
    const progress = document.getElementById('tour-progress-fill');
    if (progress) progress.style.width = `${state.total_slides ? ((state.current_slide_index + 1) / state.total_slides) * 100 : 0}%`;
    const label = document.getElementById('tour-progress-label');
    if (label) label.textContent = state.total_slides ? `Station ${state.current_slide_index + 1} von ${state.total_slides}` : 'Die Tour wird vorbereitet';
        this.renderState(state);
        if (window.admin && typeof window.admin.updateFromState === 'function') {
          window.admin.updateFromState(state);
        }
      }
    } catch (e) {
      console.warn('Initial state fetch failed:', e);
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = window.APP_BASE || (window.location.pathname.startsWith('/family') ? '/family' : '');
    
    // Teste alternierend /family/ws und /ws falls Proxy-Pfad abweicht
    const candidateUrls = [
      `${protocol}//${window.location.host}${basePath}/ws`,
      `${protocol}//${window.location.host}/ws`
    ];
    const wsUrl = candidateUrls[this.wsRetryCount % candidateUrls.length];

    try {
      if (this.ws) {
        try { this.ws.onclose = null; this.ws.close(); } catch (e) {}
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsRetryCount = 0;
        this.setConnectionStatus(true);
        if (this.fallbackPollingInterval) {
          clearInterval(this.fallbackPollingInterval);
          this.fallbackPollingInterval = null;
        }

        this.ws.send(JSON.stringify({
          type: 'identify',
          token: this.token,
          role: this.user?.role
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWsMessage(data);
        } catch (e) {
          console.error('Error handling WS message', e);
        }
      };

      this.ws.onclose = () => {
        this.setConnectionStatus(false);
        this.startFallbackPolling();
        this.wsRetryCount++;
        setTimeout(() => this.connectWebSocket(), 3000);
      };

      this.ws.onerror = () => {
        this.setConnectionStatus(false);
        this.startFallbackPolling();
      };
    } catch (e) {
      this.startFallbackPolling();
      this.wsRetryCount++;
      setTimeout(() => this.connectWebSocket(), 3000);
    }
  }

  startFallbackPolling() {
    if (this.fallbackPollingInterval) return;
    this.fallbackPollingInterval = setInterval(() => {
      this.fetchInitialState();
    }, 2500);
  }

  setConnectionStatus(online) {
    const status = document.getElementById('live-connection-label');
    if (status) status.textContent = online ? 'Live verbunden' : 'Verbindung wird wiederhergestellt …';
    const dot = document.getElementById('connection-status-dot');
    if (dot) {
      dot.className = online ? 'connection-dot' : 'connection-dot offline';
      dot.title = online ? 'Online (Live verbunden)' : 'Offline (Verbinde...)';
    }
  }

  sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.user) {
      this.ws.send(JSON.stringify({
        type: 'heartbeat',
        token: this.token
      }));
    }
  }

  handleWsMessage(data) {
    switch (data.type) {
      case 'init_state':
      case 'state_update':
      case 'heartbeat_ack':
        this.renderState(data.state);
        if (window.admin) {
          window.admin.updateFromState(data.state);
        }
        break;

      case 'media_control':
        this.syncMediaPlayback(data.media_status);
        break;

      case 'announcement':
        this.showAnnouncement(data.message);
        break;

      case 'leaderboard_update':
        this.renderLeaderboard(data.leaderboard);
        if (this.state) {
          this.state.leaderboard = data.leaderboard;
        }
        const userInLb = data.leaderboard?.find(u => u.id === this.user?.id);
        if (userInLb) {
          if (this.user) this.user.score = userInLb.score;
          if (this.odometer) this.odometer.set(userInLb.score, true);
        }
        break;

      case 'submission_received':
        if (window.admin && this.state) {
          const statsBadge = document.getElementById('admin-submission-stats');
          if (statsBadge) {
            statsBadge.textContent = `${data.submission_count} abgegeben (${data.user_emoji || ''} ${data.user_name || ''})`;
          }
        }
        break;

      default:
        break;
    }
  }

  renderState(state) {
    if (!state) return;
    if (this.user && Array.isArray(state.participants_status) && !state.participants_status.some(p => p.id === this.user.id)) {
      for (const key of ['rallye_auth_token', 'rallye_username', 'rallye_user_emoji', 'rallye_user_color']) localStorage.removeItem(key);
      this.user = null;
      this.token = null;
      this.localSubmissions = {};
      this.currentEstSlideId = null;
      this.odometer?.set(0, false);
      document.getElementById('user-display-name').textContent = 'Gast';
      if (!window.admin?.isAdminUnlocked()) document.getElementById('auth-modal').classList.remove('hidden');
    }
    if (!state) return;
    this.state = state;
    this.serverOffset = state.server_time ? state.server_time - Date.now() : 0;
    const progress = document.getElementById('tour-progress-fill');
    if (progress) progress.style.width = `${state.total_slides ? ((state.current_slide_index + 1) / state.total_slides) * 100 : 0}%`;
    const label = document.getElementById('tour-progress-label');
    if (label) label.textContent = state.total_slides ? `Station ${state.current_slide_index + 1} von ${state.total_slides}` : 'Die Tour wird vorbereitet';

    if (this.lastPhase !== state.phase) {
      if (state.phase !== 4 && state.phase !== 5) {
        this.hasCelebratedPhase4 = false;
      }
      this.lastPhase = state.phase;
    }

    if (state.active_announcement) {
      this.showAnnouncement(state.active_announcement, false);
    } else {
      this.hideAnnouncement();
    }

    this.renderSlide(state.current_slide, state.current_slide_index, state.total_slides);
    this.renderQuizPhase(state);
    this.scrollToNewAnswers(state);
    this.syncTimer(state.timer);
    this.syncMediaPlayback(state.media_status);

    // Score & Odometer Update
    const currentUserInLeaderboard = state.leaderboard?.find(u => u.id === this.user?.id);
    const currentUserInParticipants = state.participants_status?.find(u => u.id === this.user?.id);
    const currentScore = currentUserInLeaderboard ? currentUserInLeaderboard.score : (currentUserInParticipants ? currentUserInParticipants.score : (this.user?.score || 0));

    if (this.user) {
      this.user.score = currentScore;
    }
    if (this.odometer) {
      this.odometer.set(currentScore, true);
    }
  }

  scrollToNewAnswers(state) {
    const slide = state.current_slide;
    const targetId = slide?.type === 'multiple_choice' && [2, 3].includes(state.phase)
      ? 'options-grid' : slide?.type === 'estimation' && state.phase === 3 ? 'estimation-container' : null;
    const key = targetId ? `${slide.id}:${targetId}` : null;
    if (this.visibleAnswersKey === key) return;
    this.visibleAnswersKey = key;
    if (!key) return;
    requestAnimationFrame(() => {
      if (this.visibleAnswersKey !== key) return;
      // Leave admin dialogs and player input focus untouched.
      if (document.querySelector('dialog[open], .modal-overlay:not(.hidden), #admin-modal:not(.hidden)')) return;
      const main = document.querySelector('#app > main');
      const target = document.getElementById(targetId);
      if (!main || !target || !target.getClientRects().length) return;
      const viewport = main.getBoundingClientRect();
      const answers = target.getBoundingClientRect();
      const inset = 12;
      let delta = 0;
      if (answers.height > main.clientHeight - inset * 2 || answers.top < viewport.top + inset) {
        delta = answers.top - viewport.top - inset;
      } else if (answers.bottom > viewport.bottom - inset) {
        delta = answers.bottom - viewport.bottom + inset;
      }
      if (delta) main.scrollTo({ top: main.scrollTop + delta,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }

  showAnnouncement(msg, playSound = true) {
    const banner = document.getElementById('announcement-banner');
    const text = document.getElementById('announcement-text');
    if (!banner || !text || !msg) return;

    text.textContent = msg;
    banner.classList.remove('hidden');

    if (playSound && window.soundFx) {
      window.soundFx.playAnnouncementChime();
    }
  }

  hideAnnouncement() {
    const banner = document.getElementById('announcement-banner');
    if (banner) banner.classList.add('hidden');
  }

  renderSlide(slide, index, total) {
    const titleEl = document.getElementById('slide-title');
    const descEl = document.getElementById('slide-description');
    const badge = document.getElementById('slide-badge');
    const footerStation = document.getElementById('footer-station-indicator');
    const mediaContainer = document.getElementById('slide-media-container');

    if (!slide) {
      if (titleEl) titleEl.textContent = 'Willkommen zur Familien-Rallye! 🌟';
      if (descEl) descEl.textContent = 'Bereit für die Rallye? Der Spielleiter schaltet gleich die erste Station frei!';
      if (badge) badge.textContent = 'Rallye bereit';
      if (footerStation) footerStation.textContent = '🌟 Startbereit';
      if (mediaContainer) mediaContainer.classList.add('hidden');
      return;
    }

    const isNewSlide = this.currentSlideId !== slide.id;
    this.currentSlideId = slide.id;

    if (slide.type === 'transit') {
      badge.textContent = `🚶 Unterwegs (${index + 1}/${total})`;
      if (footerStation) footerStation.textContent = `🚶 Unterwegs (${index + 1}/${total})`;
    } else {
      badge.textContent = `Station ${index + 1} von ${total}`;
      if (footerStation) footerStation.textContent = `📍 Station ${index + 1} / ${total}`;
    }
    badge.className = `badge badge-${slide.type}`;

    document.getElementById('slide-title').textContent = slide.title;
    document.getElementById('slide-description').textContent = slide.description || '';

    const locationEl = document.getElementById('slide-location-tag');
    const meetingEl = document.getElementById('slide-meeting-tag');

    if (slide.location_name) {
      locationEl.textContent = `📍 ${slide.location_name}`;
      locationEl.classList.remove('hidden');
    } else {
      locationEl.classList.add('hidden');
    }

    if (slide.meeting_time) {
      meetingEl.textContent = `⏰ Treffpunkt: ${slide.meeting_time}`;
      meetingEl.classList.remove('hidden');
    } else {
      meetingEl.classList.add('hidden');
    }

    // Media Rendering (Image, Video, Audio, Image + Audio)
    if (mediaContainer) {
      if (isNewSlide || !mediaContainer.dataset.renderedSlideId || mediaContainer.dataset.renderedSlideId !== slide.id) {
        mediaContainer.dataset.renderedSlideId = slide.id;
        mediaContainer.onclick = null;
        mediaContainer.innerHTML = '';
        mediaContainer.classList.remove('media-unavailable');

        const mediaType = slide.media_type || 'image';
        const hasMedia = !!(slide.media_url || slide.audio_url);

        if (!hasMedia) {
          mediaContainer.classList.add('hidden');
        } else {
          mediaContainer.classList.remove('hidden');

          if (mediaType === 'video') {
            mediaContainer.innerHTML = `
              <video id="active-media-player" src="${window.escapeHtml(slide.media_url)}" controls playsinline style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-md);"></video>
            `;
          } else if (mediaType === 'audio') {
            mediaContainer.innerHTML = `
              <div style="padding: 12px; text-align: center; background: #0f172a; border-radius: var(--radius-md);">
                <div style="font-size: 1.8rem; margin-bottom: 4px;">🎵</div>
                <p style="font-weight: 800; color: #38bdf8; font-size: 0.85rem; margin-bottom: 6px;">Audio-Guide</p>
                <audio id="active-media-player" src="${window.escapeHtml(slide.media_url)}" controls style="width: 100%; height: 32px;"></audio>
              </div>
            `;
          } else if (mediaType === 'image_and_audio') {
            mediaContainer.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
                <div style="position: relative; height: 85px; width: 100%; cursor: pointer;" data-lightbox-image>
                  <img src="${window.escapeHtml(slide.media_url)}" alt="Station Bild" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-md);">
                  <div class="media-zoom-badge">🔍 Bild vergrößern</div>
                </div>
                <div style="background: rgba(15, 23, 42, 0.9); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid rgba(56, 189, 248, 0.3);">
                  <small style="color: #38bdf8; font-weight: 800; display: block; margin-bottom: 2px;">🎵 Audio-Begleitung</small>
                  <audio id="active-media-player" src="${window.escapeHtml(slide.audio_url || slide.media_url)}" controls style="width: 100%; height: 28px;"></audio>
                </div>
              </div>
            `;
          } else {
            // Default Image - Compact Thumbnail with Zoom Click
            mediaContainer.innerHTML = `
              <img id="slide-media-img" src="${window.escapeHtml(slide.media_url)}" alt="Station Media" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
              <div class="media-zoom-badge">🔍 Bild vergrößern</div>
            `;
            mediaContainer.onclick = () => this.openImageLightbox(slide.media_url);
          }
        }
      }
    }

    const stationImage = mediaContainer?.querySelector('img');
    if (stationImage) stationImage.onerror = () => {
      mediaContainer.textContent = 'Bild gerade nicht verfügbar. Die Frage kannst du trotzdem beantworten.';
      mediaContainer.classList.add('media-unavailable');
      mediaContainer.onclick = null;
    };
    const lightboxTarget = mediaContainer?.querySelector('[data-lightbox-image]');
    if (lightboxTarget) lightboxTarget.onclick = () => this.openImageLightbox(slide.media_url);

    // Participant Mini-Map & Navigation for Info & Transit Slides with GPS
    const mapBox = document.getElementById('slide-map-box');
    const navBtn = document.getElementById('slide-nav-btn');

    if (mapBox && navBtn) {
      const isNavSlide = slide.type === 'info' || slide.type === 'transit';
      const hasCoords = slide.latitude !== null && slide.latitude !== undefined && slide.longitude !== null && slide.longitude !== undefined;

      if (isNavSlide && hasCoords) {
        mapBox.classList.remove('hidden');
        navBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${slide.latitude},${slide.longitude}`;

        const distanceBadge = document.getElementById('slide-map-distance-badge');
        if (distanceBadge) {
          distanceBadge.textContent = slide.type === 'transit' ? 'Wegstrecke / Ziel' : 'Zielstation';
        }

        if (typeof L !== 'undefined') {
          if (!this.miniMap) {
            this.miniMap = L.map('slide-mini-map', { zoomControl: true }).setView([slide.latitude, slide.longitude], 16);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: '© OpenStreetMap'
            }).addTo(this.miniMap);
          }

          if (!this.miniMapMarker) {
            const pinIcon = L.divIcon({
              className: 'custom-step-marker-container',
              html: `<div class="custom-step-marker-inner active-station"><span>${index + 1}</span></div>`,
              iconSize: [34, 34],
              iconAnchor: [17, 17]
            });
            this.miniMapMarker = L.marker([slide.latitude, slide.longitude], { icon: pinIcon }).addTo(this.miniMap);
          } else {
            this.miniMapMarker.setLatLng([slide.latitude, slide.longitude]);
            const pinIcon = L.divIcon({
              className: 'custom-step-marker-container',
              html: `<div class="custom-step-marker-inner active-station"><span>${index + 1}</span></div>`,
              iconSize: [34, 34],
              iconAnchor: [17, 17]
            });
            this.miniMapMarker.setIcon(pinIcon);
          }

          this.miniMap.setView([slide.latitude, slide.longitude], 16);
          setTimeout(() => {
            if (this.miniMap) this.miniMap.invalidateSize();
          }, 200);
        }
      } else {
        mapBox.classList.add('hidden');
      }
    }
  }

  syncMediaPlayback(status) {
    const player = document.getElementById('active-media-player');
    if (!player) return;

    if (status === 'playing') {
      player.play().catch(e => console.warn('Autoplay prevented by browser', e));
    } else if (status === 'paused') {
      player.pause();
    } else if (status === 'stopped') {
      player.pause();
      player.currentTime = 0;
    }
  }

  renderQuizPhase(state) {
    const slide = state.current_slide;
    const stageCard = document.getElementById('slide-stage-card');
    const stageGrid = document.getElementById('stage-grid');
    const quizCol = document.getElementById('stage-quiz-col');
    const leaderboardSection = document.getElementById('leaderboard-section');

    const lockNotice = document.getElementById('quiz-lock-notice');
    const timerContainer = document.getElementById('timer-container');
    const optionsGrid = document.getElementById('options-grid');
    const estimationContainer = document.getElementById('estimation-container');
    const resultBanner = document.getElementById('result-banner');

    if (state.phase === 5) {
      stageCard.classList.add('hidden');
      leaderboardSection.classList.remove('hidden');
      this.renderLeaderboard(state.leaderboard);
      return;
    }

    this.hasPerformedGrandCeremony = false;
    this.isCeremonyRunning = false;
    document.getElementById('winner-trophy-modal')?.classList.add('hidden');

    leaderboardSection.classList.add('hidden');
    stageCard.classList.remove('hidden');

    const isQuizSlide = slide && (slide.type === 'multiple_choice' || slide.type === 'estimation' || slide.type === 'action');

    if (!isQuizSlide) {
      quizCol.classList.add('hidden');
      stageGrid.classList.remove('has-media');
      return;
    }

    quizCol.classList.remove('hidden');
    stageGrid.classList.toggle('has-media', !!(slide.media_url || slide.audio_url));
    document.getElementById('question-text').textContent = slide.question || slide.title;

    lockNotice.classList.add('hidden');
    timerContainer.classList.add('hidden');
    optionsGrid.classList.add('hidden');
    estimationContainer.classList.add('hidden');
    resultBanner.classList.add('hidden');

    const userSubmission = state.user_submission;

    if (state.phase === 1) {
      lockNotice.textContent = 'Lies die Frage in Ruhe. Die Tourleitung blendet gleich die Antworten ein.';
      lockNotice.classList.remove('hidden');
    } else if (state.phase === 2) {
      lockNotice.textContent = 'Gleich geht’s los! Antworten sind möglich, sobald der Countdown startet.';
      lockNotice.classList.remove('hidden');

      if (slide.type === 'multiple_choice') {
        optionsGrid.classList.remove('hidden');
        this.renderMultipleChoiceOptions(slide, false, userSubmission, false);
      } else if (slide.type === 'estimation') {
        estimationContainer.classList.add('hidden');
      }
    } else if (state.phase === 3) {
      timerContainer.classList.remove('hidden');

      const isInputLocked = state.timer.status !== 'running' || state.timer.remaining <= 0;

      if (slide.type === 'multiple_choice') {
        optionsGrid.classList.remove('hidden');
        this.renderMultipleChoiceOptions(slide, !isInputLocked, userSubmission, false);
      } else if (slide.type === 'estimation') {
        estimationContainer.classList.remove('hidden');
        this.renderEstimationInput(slide, !isInputLocked, userSubmission, false);
      }
    } else if (state.phase === 4) {
      if (slide.type === 'multiple_choice') {
        optionsGrid.classList.remove('hidden');
        this.renderMultipleChoiceOptions(slide, false, userSubmission, true);
      } else if (slide.type === 'estimation') {
        estimationContainer.classList.add('hidden');
      }

      this.renderPhase4Results(state);
    }
  }

  renderMultipleChoiceOptions(slide, isInteractive, userSubmission, isReveal = false) {
    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';

    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const options = slide.options || [];

    options.forEach((optText, idx) => {
      // In Phase 4: Falsche Antworten ausblenden, nur die richtige Antwort anzeigen!
      if (isReveal && idx !== slide.correct_option_index) {
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.disabled = !isInteractive;

      const isSelected = userSubmission && userSubmission.selected_option === idx;
      if (isSelected) {
        btn.classList.add('selected');
      }

      if (isReveal && idx === slide.correct_option_index) {
        btn.classList.add('correct-reveal');
      }

      btn.innerHTML = `
        <span class="option-letter">${letters[idx] || (idx + 1)}</span>
        <span style="flex: 1;">${window.escapeHtml(optText)}</span>
        ${isReveal ? '<span style="color: #10b981; font-weight: 800; font-size: 0.85rem;">✓ Richtige Antwort</span>' : (isSelected ? '<span style="font-size: 1.2rem;">✓</span>' : '')}
      `;

      if (isInteractive) {
        btn.addEventListener('click', () => {
          window.soundFx.playClick();
          this.submitMultipleChoice(slide.id, idx, optText);
        });
      }

      grid.appendChild(btn);
    });
  }

  renderEstimationInput(slide, isInteractive, userSubmission, isReveal = false) {
    const container = document.getElementById('estimation-container');
    // Keep the real input mounted during heartbeats, so keyboard and caret stay put.
    if (this.currentEstSlideId !== slide.id || !document.getElementById('est-number-input')) {
      this.currentEstSlideId = slide.id;
      container.innerHTML = `
        <form id="est-answer-form" class="estimate-form">
          <label for="est-number-input">Deine Schätzung</label>
          <input id="est-number-input" class="input-field estimate-input" type="text" inputmode="decimal" autocomplete="off" maxlength="16" placeholder="Zahl eingeben">
          <small>Dezimalzahlen mit Komma oder Punkt sind möglich. Erst mit „Tipp abgeben“ wird gespeichert.</small>
          <button class="submit-btn" id="est-submit-btn" type="submit">Tipp abgeben →</button>
          <p id="est-saved-note" role="status"></p>
        </form>`;
      document.getElementById('est-number-input').value = userSubmission?.numeric_value ?? '';
      document.getElementById('est-answer-form').addEventListener('submit', e => {
        e.preventDefault();
        const raw = document.getElementById('est-number-input').value.trim().replace(',', '.');
        if (!raw || !Number.isFinite(Number(raw))) return window.showToast('Bitte eine gültige Zahl eingeben.', true);
        this.submitEstimation(slide.id, Number(raw));
      });
    }
    document.getElementById('est-number-input').disabled = !isInteractive;
    document.getElementById('est-submit-btn').disabled = !isInteractive || !!this.submissionPending;
    document.getElementById('est-saved-note').textContent = userSubmission
      ? `✓ Gespeichert: ${userSubmission.numeric_value}. Änderungen bitte erneut abgeben.`
      : 'Noch kein Tipp abgegeben.';
  }

  async submitMultipleChoice(slideId, optionIndex, text) {
    if (this.submissionPending) return;
    this.submissionPending = true;
    try {
      const res = await fetch(window.apiUrl('/api/submissions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          slide_id: slideId,
          selected_option: optionIndex,
          answer_text: text
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Antwort konnte nicht gespeichert werden.");
      if (data.success && data.submission) {
        this.localSubmissions[slideId] = data.submission;
        if (this.state?.current_slide?.id !== slideId) return;
        this.state.user_submission = data.submission;
        this.renderQuizPhase(this.state);
        window.showToast('Antwort gespeichert ✓');
      }
    } catch (e) {
      window.showToast(e.message || 'Keine Verbindung. Bitte erneut versuchen.', true);
    } finally { this.submissionPending = false; }
  }

  async submitEstimation(slideId, numberVal, isBackground = false) {
    if (!Number.isFinite(numberVal) || this.submissionPending) return;
    this.submissionPending = true;
    try {
      const res = await fetch(window.apiUrl('/api/submissions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          slide_id: slideId,
          numeric_value: numberVal,
          answer_text: String(numberVal)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Antwort konnte nicht gespeichert werden.");
      if (data.success && data.submission) {
        this.localSubmissions[slideId] = data.submission;
        if (this.state?.current_slide?.id !== slideId) return;
        this.state.user_submission = data.submission;
        
        const submitBtn = document.getElementById('est-submit-btn');
        if (submitBtn) {
          submitBtn.textContent = 'Tipp aktualisieren →';
          document.getElementById('est-saved-note').textContent = `✓ Gespeichert: ${numberVal}`;
          window.showToast('Tipp gespeichert ✓');
        }
      }
    } catch (e) {
      window.showToast(e.message || 'Keine Verbindung. Bitte erneut versuchen.', true);
    } finally {
      this.submissionPending = false;
      if (this.state?.current_slide?.id === slideId) this.renderQuizPhase(this.state);
    }
  }

  renderPhase4Results(state) {
    const resultBanner = document.getElementById('result-banner');
    const slide = state.current_slide;
    const mySub = state.user_submission;

    resultBanner.classList.remove('hidden');

    if (!mySub) {
      resultBanner.className = 'result-banner wrong';
      resultBanner.innerHTML = `
        <div class="result-title">⏳ Keine Antwort abgegeben!</div>
        <p style="color: var(--text-muted);">Du hast bei dieser Aufgabe leider keine Punkte erzielt.</p>
      `;
      return;
    }

    const isCorrect = mySub.is_correct > 0;
    const pts = mySub.final_points || 0;

    resultBanner.className = isCorrect ? 'result-banner' : 'result-banner wrong';

    let speedText = '';
    if (mySub.rank_in_speed > 0) {
      const rankEmoji = mySub.rank_in_speed === 1 ? '🥇 1. Platz' : mySub.rank_in_speed === 2 ? '🥈 2. Platz' : mySub.rank_in_speed === 3 ? '🥉 3. Platz' : `${mySub.rank_in_speed}. Platz`;
      speedText = `<span class="speed-badge">${rankEmoji} (Speed-Bonus: ${Math.round(mySub.speed_bonus_pct * 100)}%)</span>`;
    }

    let estimateComparison = '';
    if (slide.type === 'estimation') {
      const diff = Math.abs(mySub.numeric_value - slide.target_value);
      estimateComparison = `
        <p style="margin-top: 6px; font-weight: 700;">
          🎯 Exakter Zielwert: <span style="color: #38bdf8;">${slide.target_value}</span><br>
          Dein Tipp: <span style="color: #fbbf24;">${mySub.numeric_value}</span> (Abweichung: ${diff})
        </p>
      `;
    }

    resultBanner.innerHTML = `
      <div class="result-title">${isCorrect ? '🎉 Super gemacht!' : '❌ Leider daneben!'}</div>
      <div class="points-awarded">+${pts} Punkte</div>
      ${speedText}
      ${estimateComparison}
    `;

    if (!this.hasCelebratedPhase4) {
      this.hasCelebratedPhase4 = true;
      if (isCorrect && pts > 0) {
        window.confetti.burst(90);
        window.soundFx.playCorrectChime();
      } else {
        window.soundFx.playWrongBuzzer();
      }
    }
  }

  renderLeaderboard(leaderboard) {
    const list = document.getElementById('ranking-list');
    const titleEl = document.getElementById('leaderboard-header-title');
    if (!list || !leaderboard) return;

    const isLastSlide = this.state && this.state.current_slide_index === (this.state.total_slides - 1);
    const isFinalCeremony = this.state?.phase === 5 && isLastSlide;

    if (isFinalCeremony) {
      if (titleEl) titleEl.innerHTML = '<span>🏆</span> Große Endauswertung & Siegerehrung';

      // If animation is currently running, do NOT restart it!
      if (this.isCeremonyRunning) {
        return;
      }

      // If animation was already played once, render static list without restarting
      if (this.hasPerformedGrandCeremony) {
        this.renderStaticLeaderboard(leaderboard);
        return;
      }

      this.startGrandFinalCeremony(leaderboard);
      return;
    }

    if (titleEl) titleEl.innerHTML = '<span>🏆</span> Familien-Leaderboard (Gesamtwertung)';
    this.renderStaticLeaderboard(leaderboard);

    if (this.state?.phase === 5 && !this.hasCelebratedPhase4) {
      this.hasCelebratedPhase4 = true;
      if (window.soundFx) window.soundFx.playFanfare();
    }
  }

  renderStaticLeaderboard(leaderboard) {
    const list = document.getElementById('ranking-list');
    if (!list || !leaderboard) return;

    list.innerHTML = '';
    leaderboard.forEach((player, idx) => {
      const rank = idx + 1;
      const isMe = player.id === this.user?.id;
      const topClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

      const item = document.createElement('div');
      item.className = `rank-item ${topClass} ${isMe ? 'current-user' : ''} ${rank === 1 ? 'sieger-highlight' : ''}`;
      item.innerHTML = `
        <div class="rank-left">
          <span class="rank-pos">${medal}</span>
          <div class="avatar-circle" style="background-color: ${player.avatar_color};">
            ${window.escapeHtml(player.avatar_emoji)}
          </div>
          <span class="user-name">${window.escapeHtml(player.name)} ${isMe ? '(Du)' : ''}</span>
        </div>
        <span class="rank-score">${player.score}</span>
      `;
      list.appendChild(item);
    });
  }

  async startGrandFinalCeremony(leaderboard) {
    const list = document.getElementById('ranking-list');
    if (!list || !leaderboard || leaderboard.length === 0) return;

    this.isCeremonyRunning = true;
    this.hasPerformedGrandCeremony = true;

    list.innerHTML = '';
    const rows = [];

    // Pre-create all rows in hidden state
    leaderboard.forEach((player, idx) => {
      const rank = idx + 1;
      const isMe = player.id === this.user?.id;
      const topClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

      const item = document.createElement('div');
      item.className = `rank-item ${topClass} ${isMe ? 'current-user' : ''} rank-reveal-hidden`;
      item.id = `rank-row-${idx}`;
      item.innerHTML = `
        <div class="rank-left">
          <span class="rank-pos">${medal}</span>
          <div class="avatar-circle" style="background-color: ${player.avatar_color};">
            ${window.escapeHtml(player.avatar_emoji)}
          </div>
          <span class="user-name">${window.escapeHtml(player.name)} ${isMe ? '(Du)' : ''}</span>
        </div>
        <span class="rank-score">${player.score}</span>
      `;
      list.appendChild(item);
      rows.push(item);
    });

    // Sequential Reveal: Bottom to Top (from last place up to 1st place!)
    const total = leaderboard.length;
    for (let i = total - 1; i >= 0; i--) {
      const rank = i + 1;
      const row = rows[i];

      if (rank === 1) {
        // Dramatic Drumroll before Sieger
        if (window.soundFx) window.soundFx.playDrumroll(1400);
        await new Promise(r => setTimeout(r, 1400));

        row.classList.remove('rank-reveal-hidden');
        row.classList.add('rank-revealed', 'sieger-highlight');

        if (window.soundFx) window.soundFx.playGrandChampionFanfare();
        if (typeof window.confetti !== 'undefined') window.confetti.burst(150);

        await new Promise(r => setTimeout(r, 1000));

        // Check if current user reached Top 3 (1, 2, or 3) and show personal Trophy Modal
        const myRankIndex = leaderboard.findIndex(p => p.id === this.user?.id);
        if (myRankIndex >= 0 && myRankIndex < 3) {
          this.showWinnerTrophyModal(leaderboard[myRankIndex], myRankIndex + 1);
        }
      } else {
        // Play suspense step for each position
        if (window.soundFx) window.soundFx.playSuspenseStep(rank, total);
        row.classList.remove('rank-reveal-hidden');
        row.classList.add('rank-revealed');
        await new Promise(r => setTimeout(r, 1300));
      }
    }

    this.isCeremonyRunning = false;
  }

  showWinnerTrophyModal(player, rank) {
    const modal = document.getElementById('winner-trophy-modal');
    const container = document.getElementById('winner-trophy-3d-container');
    const headline = document.getElementById('winner-modal-headline');
    const subtext = document.getElementById('winner-modal-subtext');
    const scoreBadge = document.getElementById('winner-modal-score');
    if (!modal || !container) return;

    const trophyType = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
    const trophyLabel = rank === 1 ? 'Goldpokal' : rank === 2 ? 'Silberpokal' : 'Bronzepokal';

    container.innerHTML = `
      <div class="modal-trophy-scene">
        <div class="modal-trophy-model trophy-${trophyType}">
          <div class="trophy-cup">
            <div class="trophy-handle-left"></div>
            <div class="trophy-handle-right"></div>
          </div>
          <div class="trophy-stem"></div>
          <div class="trophy-base">${rank}</div>
        </div>
      </div>
    `;

    if (rank === 1) {
      if (headline) headline.textContent = '👑 HERZLICHEN GLÜCKWUNSCH! 👑';
      if (subtext) subtext.innerHTML = `Du bist der <strong>Champion</strong> unserer Familien-Rallye!<br>Eine grandiose Spitzenleistung!`;
      if (scoreBadge) scoreBadge.innerHTML = `🏆 1. Platz • ${trophyLabel} (${player.score})`;
    } else if (rank === 2) {
      if (headline) headline.textContent = '🥈 FANTASTISCH! 🥈';
      if (subtext) subtext.innerHTML = `Du hast dir den <strong>2. Platz</strong> auf dem Sieger-Treppchen gesichert!<br>Super gemacht!`;
      if (scoreBadge) scoreBadge.innerHTML = `🥈 2. Platz • ${trophyLabel} (${player.score})`;
    } else if (rank === 3) {
      if (headline) headline.textContent = '🥉 HERVORRAGEND! 🥉';
      if (subtext) subtext.innerHTML = `Du bist unter den <strong>Top 3</strong> auf dem Treppchen!<br>Tolle Leistung!`;
      if (scoreBadge) scoreBadge.innerHTML = `🥉 3. Platz • ${trophyLabel} (${player.score})`;
    }

    modal.classList.remove('hidden');
    if (window.soundFx) window.soundFx.playTrophyRevealChime();
    if (typeof window.confetti !== 'undefined') window.confetti.burst(100);
  }

  syncTimer(timer) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const timerBadge = document.getElementById('timer-badge');
    const timerProgress = document.getElementById('timer-progress-fill');

    if (!timer || timer.status !== 'running' || !timer.start) {
      if (timerBadge) {
        timerBadge.textContent = timer?.status === 'expired' ? 'Zeit abgelaufen' : 'Antwortabgabe gestoppt';
        timerBadge.classList.remove('urgent');
      }
      if (timerProgress) timerProgress.style.width = '0%';
      return;
    }

    const duration = timer.duration;
    const startTime = timer.start;

    const updateTick = () => {
      const elapsed = ((Date.now() + (this.serverOffset || 0)) - startTime) / 1000;
      const remaining = Math.max(0, Math.ceil(duration - elapsed));
      const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));

      if (timerBadge) {
        timerBadge.textContent = `⏱️ ${remaining}s`;
        if (remaining <= 5 && remaining > 0) {
          timerBadge.classList.add('urgent');
          window.soundFx.playTimerUrgent();
        } else {
          timerBadge.classList.remove('urgent');
          if (remaining > 0) window.soundFx.playTick();
        }
      }

      if (timerProgress) {
        timerProgress.style.width = `${pct}%`;
      }

      if (remaining <= 0) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;

        if (this.state && this.state.phase === 3) {
          this.renderQuizPhase({ ...this.state, timer: { ...timer, status: 'expired', remaining: 0 } });
        }
      }
    };

    updateTick();
    this.timerInterval = setInterval(updateTick, 1000);
  }
}

window.app = new RallyeApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});

/**
 * Admin Live-Controller & Slide Studio Designer
 */
class AdminController {
  constructor() {
    this.currentSlideId = null;
    this.currentPhase = 1;
    this.allSlides = [];
    this.editingSlideId = null;
    this.latestState = null;

    // Leaflet Maps State
    this.pickerMap = null;
    this.pickerMarker = null;
    this.tempPickerCoords = null;
    this.routeMap = null;
    this.routeLayerGroup = null;
    this.lastUsedMapCenter = null;
    this.cachedRouteGeoJson = { query: '', coords: [], distance: 0, duration: 0 };
    this.routeMapHasInitialFit = false;
    this.lastRenderedCoordsKey = null;
    this.isInitialized = false;
    this.isSaving = false;
    this.guard = new window.EditorGuard(document.getElementById('studio-slide-form'));
  }

  async request(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        sessionStorage.removeItem('rallye_admin_unlocked');
        document.getElementById('admin-modal').classList.add('hidden');
      }
      const message = data.error || 'Aktion fehlgeschlagen. Bitte erneut versuchen.';
      window.showToast(message, true);
      throw new Error(message);
    }
    return res;
  }

  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.bindEvents();
    await this.loadSlides();
    await this.fetchLiveState();
  }

  async fetchLiveState() {
    try {
      const res = await this.request(window.apiUrl('/api/state'));
      if (res.ok) {
        const state = await res.json();
        this.updateFromState(state);
      }
    } catch (e) {
      console.warn('Admin live state fetch error:', e);
    }
  }

  isAdminUnlocked() {
    return sessionStorage.getItem('rallye_admin_unlocked') === 'true';
  }

  bindEvents() {
    // Admin Toggle Button in Header
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    const adminModal = document.getElementById('admin-modal');
    const closeAdminBtn = document.getElementById('close-admin-btn');
    const adminLockBtn = document.getElementById('admin-lock-btn');

    // Mobile Burger Drawer Elements
    const adminBurgerBtn = document.getElementById('admin-burger-btn');
    const adminMobileDrawer = document.getElementById('admin-mobile-drawer');
    const closeMobileDrawerBtn = document.getElementById('close-admin-mobile-drawer-btn');
    const mobileLockBtn = document.getElementById('mobile-admin-lock-btn');
    const mobileCloseBtn = document.getElementById('mobile-close-admin-btn');

    if (adminBurgerBtn && adminMobileDrawer) {
      adminBurgerBtn.addEventListener('click', () => {
        adminMobileDrawer.classList.remove('hidden');
      });
    }

    if (closeMobileDrawerBtn && adminMobileDrawer) {
      closeMobileDrawerBtn.addEventListener('click', () => {
        adminMobileDrawer.classList.add('hidden');
      });
    }

    const closeWorkspace = async (lock = false) => {
      if (!await this.guard.confirmLeave()) return;
      if (lock) {
        try { await this.request(window.apiUrl('/api/admin/logout'), { method: 'POST' }); }
        catch { return; }
        sessionStorage.removeItem('rallye_admin_unlocked');
        window.app?.connectWebSocket();
      }
      adminMobileDrawer?.classList.add('hidden');
      adminModal?.classList.add('hidden');
      if (!window.app?.user) document.getElementById('auth-modal')?.classList.remove('hidden');
    };
    mobileLockBtn?.addEventListener('click', () => closeWorkspace(true));
    mobileCloseBtn?.addEventListener('click', () => closeWorkspace());
    adminLockBtn?.addEventListener('click', () => closeWorkspace(true));
    closeAdminBtn?.addEventListener('click', () => closeWorkspace());

    // Map Picker Modal Elements
    const openMapPickerBtn = document.getElementById('edit-open-map-picker-btn');
    const clearCoordsBtn = document.getElementById('edit-clear-coords-btn');
    const closeMapPickerBtn = document.getElementById('close-map-picker-btn');
    const pickerRemovePinBtn = document.getElementById('picker-remove-pin-btn');
    const pickerConfirmBtn = document.getElementById('picker-confirm-btn');
    const pickerSearchBtn = document.getElementById('picker-search-btn');
    const pickerSearchInput = document.getElementById('picker-search-input');

    if (openMapPickerBtn) {
      openMapPickerBtn.addEventListener('click', () => this.openMapPicker());
    }
    if (clearCoordsBtn) {
      clearCoordsBtn.addEventListener('click', () => this.clearCoordsFromForm());
    }
    if (closeMapPickerBtn) {
      closeMapPickerBtn.addEventListener('click', () => {
        document.getElementById('admin-map-picker-modal')?.classList.add('hidden');
      });
    }
    if (pickerRemovePinBtn) {
      pickerRemovePinBtn.addEventListener('click', () => this.removePickerPin());
    }
    if (pickerConfirmBtn) {
      pickerConfirmBtn.addEventListener('click', () => this.confirmPickerCoords());
    }
    if (pickerSearchBtn) {
      pickerSearchBtn.addEventListener('click', () => this.searchPickerLocation());
    }
    if (pickerSearchInput) {
      pickerSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.searchPickerLocation();
        }
      });
    }

    // Password Prompt
    const adminPwModal = document.getElementById('admin-password-modal');
    const closeAdminPwBtn = document.getElementById('close-admin-pw-btn');
    const adminPwForm = document.getElementById('admin-password-form');
    const adminPwInput = document.getElementById('admin-pw-input');
    const adminPwError = document.getElementById('admin-pw-error');

    if (adminToggleBtn) {
      adminToggleBtn.addEventListener('click', async () => {
        if (this.isAdminUnlocked()) {
          adminModal.classList.remove('hidden');
          await this.loadSlides();
          await this.guard.offerRestore();
        } else {
          adminPwInput.value = '';
          adminPwError.classList.add('hidden');
          adminPwModal.classList.remove('hidden');
          setTimeout(() => adminPwInput.focus(), 150);
        }
      });
    }

    if (closeAdminPwBtn) {
      closeAdminPwBtn.addEventListener('click', () => {
        adminPwModal.classList.add('hidden');
      });
    }

    if (adminPwForm) {
      adminPwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = adminPwInput.value;
        try {
          const res = await this.request(window.apiUrl('/api/admin/auth'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, userId: window.app?.user?.id })
          });

          if (res.ok) {
            sessionStorage.setItem('rallye_admin_unlocked', 'true');
            if (window.app?.user) {
              window.app.user.role = 'admin';
            }
            adminPwModal.classList.add('hidden');
            adminModal.classList.remove('hidden');
            await this.loadSlides();
            await this.fetchLiveState();
            window.app?.connectWebSocket();
            await this.guard.offerRestore();
          } else {
            adminPwError.classList.remove('hidden');
            if (window.soundFx) window.soundFx.playWrongBuzzer();
          }
        } catch (err) {
          adminPwError.classList.remove('hidden');
        }
      });
    }

    // Unified Tab Switching Function
    const switchTab = async (tabName) => {
      if (tabName !== 'studio' && !await this.guard.confirmLeave()) return;
      const tabController = document.getElementById('tab-controller-btn');
      const tabStudio = document.getElementById('tab-studio-btn');
      const tabRoute = document.getElementById('tab-route-btn');
      const mobController = document.getElementById('mobile-tab-controller-btn');
      const mobStudio = document.getElementById('mobile-tab-studio-btn');
      const mobRoute = document.getElementById('mobile-tab-route-btn');

      const viewLive = document.getElementById('admin-live-view');
      const viewStudio = document.getElementById('admin-studio-view');
      const viewRoute = document.getElementById('admin-route-view');

      // Update Desktop Tabs
      tabController?.classList.toggle('active', tabName === 'controller');
      tabStudio?.classList.toggle('active', tabName === 'studio');
      tabRoute?.classList.toggle('active', tabName === 'route');

      // Update Mobile Drawer Tabs
      mobController?.classList.toggle('active', tabName === 'controller');
      mobStudio?.classList.toggle('active', tabName === 'studio');
      mobRoute?.classList.toggle('active', tabName === 'route');

      // Update Views
      viewLive?.classList.toggle('hidden', tabName !== 'controller');
      viewStudio?.classList.toggle('hidden', tabName !== 'studio');
      viewRoute?.classList.toggle('hidden', tabName !== 'route');

      // Close mobile drawer
      adminMobileDrawer?.classList.add('hidden');

      if (tabName === 'studio') {
        this.loadSlides();
      } else if (tabName === 'route') {
        await this.loadSlides();
        await this.renderRouteMap();
      }
    };

    // Desktop Tab Buttons
    document.getElementById('tab-controller-btn')?.addEventListener('click', () => switchTab('controller'));
    document.getElementById('tab-studio-btn')?.addEventListener('click', () => switchTab('studio'));
    document.getElementById('tab-route-btn')?.addEventListener('click', () => switchTab('route'));

    // Mobile Drawer Tab Buttons
    document.getElementById('mobile-tab-controller-btn')?.addEventListener('click', () => switchTab('controller'));
    document.getElementById('mobile-tab-studio-btn')?.addEventListener('click', () => switchTab('studio'));
    document.getElementById('mobile-tab-route-btn')?.addEventListener('click', () => switchTab('route'));

    // Phase Stepper Buttons
    document.querySelectorAll('.phase-step-btn-large').forEach(btn => {
      btn.addEventListener('click', () => {
        const phase = parseInt(btn.dataset.phase, 10);
        this.setPhase(phase);
      });
    });

    // Sequential Navigation Buttons (Phase / Slide Step)
    const prevSlideBtn = document.getElementById('admin-prev-slide');
    const nextSlideBtn = document.getElementById('admin-next-slide');
    if (prevSlideBtn) {
      prevSlideBtn.addEventListener('click', () => this.navigatePhaseOrSlide(-1));
    }
    if (nextSlideBtn) {
      nextSlideBtn.addEventListener('click', () => this.navigatePhaseOrSlide(1));
    }

    // Direct Slide Select Dropdown (requires confirmation)
    const slideSelect = document.getElementById('admin-slide-select');
    if (slideSelect) {
      slideSelect.addEventListener('change', (e) => {
        this.setSlideWithConfirm(e.target.value);
      });
    }

    // Timer Duration Preset Chips
    document.querySelectorAll('.chip-timer').forEach(chip => {
      chip.addEventListener('click', () => {
        const dur = chip.dataset.dur;
        const durInput = document.getElementById('admin-timer-duration');
        if (durInput) durInput.value = dur;
      });
    });

    // Timer Controls
    const startTimerBtn = document.getElementById('admin-start-timer-btn');
    const stopTimerBtn = document.getElementById('admin-stop-timer-btn');
    const timerDurationInput = document.getElementById('admin-timer-duration');

    if (startTimerBtn) {
      startTimerBtn.addEventListener('click', () => {
        const dur = parseInt(timerDurationInput?.value, 10) || 20;
        this.startTimer(dur);
      });
    }

    if (stopTimerBtn) {
      stopTimerBtn.addEventListener('click', () => this.stopTimer());
    }

    // Live Media Controls (Play / Pause / Stop)
    const mediaPlayBtn = document.getElementById('admin-media-play-btn');
    const mediaPauseBtn = document.getElementById('admin-media-pause-btn');
    const mediaStopBtn = document.getElementById('admin-media-stop-btn');

    if (mediaPlayBtn) mediaPlayBtn.addEventListener('click', () => this.sendMediaControl('play'));
    if (mediaPauseBtn) mediaPauseBtn.addEventListener('click', () => this.sendMediaControl('pause'));
    if (mediaStopBtn) mediaStopBtn.addEventListener('click', () => this.sendMediaControl('stop'));

    // Announcement Preset Chips
    document.querySelectorAll('.chip-msg').forEach(chip => {
      chip.addEventListener('click', () => {
        const input = document.getElementById('admin-announcement-input');
        if (input) input.value = chip.textContent.trim();
      });
    });

    // Announcement Actions
    const sendAnnouncementBtn = document.getElementById('admin-send-announcement-btn');
    const clearAnnouncementBtn = document.getElementById('admin-clear-announcement-btn');
    const announcementInput = document.getElementById('admin-announcement-input');

    if (sendAnnouncementBtn) {
      sendAnnouncementBtn.addEventListener('click', () => {
        const msg = announcementInput?.value?.trim();
        if (msg) {
          this.sendAnnouncement(msg);
          if (announcementInput) announcementInput.value = '';
        }
      });
    }

    if (clearAnnouncementBtn) {
      clearAnnouncementBtn.addEventListener('click', () => this.clearAnnouncement());
    }

    const dismissActiveAnnounceBtn = document.getElementById('admin-dismiss-active-announcement-btn');
    if (dismissActiveAnnounceBtn) {
      dismissActiveAnnounceBtn.addEventListener('click', () => this.clearAnnouncement());
    }

    // Reset Tour
    const resetTourBtn = document.getElementById('admin-reset-tour-btn');
    if (resetTourBtn) {
      resetTourBtn.addEventListener('click', () => {
        if (confirm('Möchtest du die Rallye zurücksetzen? Alle Teilnehmerkonten, Anmeldungen und Antworten werden gelöscht. Die Tourfolien und dein Admin-Zugang bleiben erhalten.')) {
          this.resetTour();
        }
      });
    }

    // ===================================
    // SLIDE STUDIO DESIGNER BINDINGS
    // ===================================
    const addSlideBtn = document.getElementById('studio-add-slide-btn');
    const seedSampleBtn = document.getElementById('studio-seed-sample-btn');
    const studioForm = document.getElementById('studio-slide-form');
    const slideTypeSelect = document.getElementById('edit-slide-type');
    const mediaTypeSelect = document.getElementById('edit-slide-media-type');
    const mediaUrlInput = document.getElementById('edit-slide-media-url');

    // File Upload Buttons
    const uploadMediaBtn = document.getElementById('edit-upload-media-btn');
    const mediaFileInput = document.getElementById('edit-slide-media-file');
    const uploadAudioBtn = document.getElementById('edit-upload-audio-btn');
    const audioFileInput = document.getElementById('edit-slide-audio-file');

    if (uploadMediaBtn && mediaFileInput) {
      uploadMediaBtn.addEventListener('click', () => mediaFileInput.click());
      mediaFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.uploadFile(file, 'edit-slide-media-url');
      });
    }

    if (uploadAudioBtn && audioFileInput) {
      uploadAudioBtn.addEventListener('click', () => audioFileInput.click());
      audioFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.uploadFile(file, 'edit-slide-audio-url');
      });
    }

    if (addSlideBtn) {
      addSlideBtn.addEventListener('click', () => {
        this.openSlideEditor(null);
      });
    }

    if (seedSampleBtn) {
      seedSampleBtn.addEventListener('click', () => {
        if (confirm('Muster-Tour neu laden? Bestehende Folien werden überschrieben.')) {
          this.seedSampleTour();
        }
      });
    }

    // Backup & Import Actions
    const exportTourBtn = document.getElementById('studio-export-tour-btn');
    const importTourBtn = document.getElementById('studio-import-tour-btn');
    const importTourFile = document.getElementById('studio-import-tour-file');

    if (exportTourBtn) {
      exportTourBtn.addEventListener('click', () => this.exportTour());
    }

    if (importTourBtn && importTourFile) {
      importTourBtn.addEventListener('click', () => importTourFile.click());
      importTourFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.importTour(file);
          importTourFile.value = '';
        }
      });
    }

    if (slideTypeSelect) {
      slideTypeSelect.addEventListener('change', () => {
        this.toggleSlideTypeFields(slideTypeSelect.value);
      });
    }

    if (mediaTypeSelect) {
      mediaTypeSelect.addEventListener('change', () => {
        const isAudioWithImg = mediaTypeSelect.value === 'image_and_audio';
        document.getElementById('edit-audio-url-wrapper')?.classList.toggle('hidden', !isAudioWithImg);
      });
    }

    if (mediaUrlInput) {
      mediaUrlInput.addEventListener('input', () => {
        const url = mediaUrlInput.value.trim();
        const prevContainer = document.getElementById('edit-media-preview-container');
        const prevImg = document.getElementById('edit-media-preview-img');
        if (url) {
          prevImg.src = url;
          prevContainer.classList.remove('hidden');
        } else {
          prevContainer.classList.add('hidden');
        }
      });
    }

    if (studioForm) {
      studioForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSlide();
      });
    }
  }

  async uploadFile(file, targetInputId) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const filedata = e.target.result;
      try {
        const res = await this.request(window.apiUrl('/api/admin/upload'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, filedata })
        });
        const data = await res.json();
        if (data.success && data.url) {
          document.getElementById(targetInputId).value = data.url;
          this.guard.changed();
          if (targetInputId === 'edit-slide-media-url') {
            const prevContainer = document.getElementById('edit-media-preview-container');
            const prevImg = document.getElementById('edit-media-preview-img');
            if (prevContainer && prevImg) {
              prevImg.src = data.url;
              prevContainer.classList.remove('hidden');
            }
          }
          alert('Datei erfolgreich hochgeladen! ✅');
        } else {
          alert('Upload fehlgeschlagen');
        }
      } catch (err) {
        console.error('Upload Error', err);
        alert('Fehler beim Upload der Datei');
      }
    };
    reader.readAsDataURL(file);
  }

  async sendMediaControl(action) {
    try {
      await this.request(window.apiUrl('/api/admin/media-control'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
    } catch (e) {
      console.error(e);
    }
  }

  updateFromState(state) {
    this.latestState = state;
    this.currentPhase = state.phase;
    this.currentSlideId = state.current_slide?.id;

    const currentSlide = state.current_slide;
    const isEstimation = currentSlide && currentSlide.type === 'estimation';
    const isQuizSlide = currentSlide && (
      currentSlide.type === 'multiple_choice' || 
      currentSlide.type === 'estimation' || 
      currentSlide.type === 'action'
    );

    // 1. Quiz-Phasen-Steuerung NUR bei Quiz-Folien anzeigen
    const phaseCard = document.getElementById('admin-quiz-phase-card');
    if (phaseCard) {
      phaseCard.classList.toggle('hidden', !isQuizSlide);
    }

    // 2. Abstimmungs-Status NUR bei Quiz-Folien anzeigen
    const voteTrackerCard = document.getElementById('admin-vote-tracker-card');
    if (voteTrackerCard) {
      voteTrackerCard.classList.toggle('hidden', !isQuizSlide);
    }

    // 3. Admin Live Preview Rendering (Frage bei Phase 1, Optionen bei Phase 2, Timer bei Phase 3)
    this.renderAdminLivePreview(state, currentSlide, isQuizSlide);

    // Toggle Live Media Control box if active slide has audio/video
    const mediaBox = document.getElementById('admin-media-control-box');
    if (mediaBox) {
      const hasAudioOrVideo = currentSlide && (
        currentSlide.audio_url || 
        currentSlide.media_type === 'audio' || 
        currentSlide.media_type === 'video' || 
        currentSlide.media_type === 'image_and_audio'
      );
      mediaBox.classList.toggle('hidden', !hasAudioOrVideo);
    }

    // Update Phase 2 button (disabled for estimation questions)
    const p2Btn = document.querySelector('.phase-step-btn-large[data-phase="2"]');
    if (p2Btn) {
      if (isEstimation) {
        p2Btn.style.opacity = '0.35';
        p2Btn.style.pointerEvents = 'none';
        p2Btn.title = 'Entfällt bei Schätzfragen';
        const nameEl = p2Btn.querySelector('.phase-name');
        if (nameEl) nameEl.textContent = 'Optionen (Entfällt)';
      } else {
        p2Btn.style.opacity = '1';
        p2Btn.style.pointerEvents = 'auto';
        p2Btn.title = '';
        const nameEl = p2Btn.querySelector('.phase-name');
        if (nameEl) nameEl.textContent = 'Optionen';
      }
    }

    // Update active slide badge in header
    const activeBadge = document.getElementById('admin-active-slide-badge');
    if (activeBadge && state.current_slide) {
      activeBadge.textContent = `Station ${state.current_slide_index + 1} / ${state.total_slides}`;
    }

    // Update Next Slide / Endauswertung button
    const nextBtn = document.getElementById('admin-next-slide');
    if (nextBtn) {
      const isLastSlide = state.current_slide_index === (state.total_slides - 1);
      if (isLastSlide) {
        nextBtn.innerHTML = `🏆 Endauswertung starten ▶`;
        nextBtn.classList.add('btn-final-ceremony');
      } else {
        nextBtn.innerHTML = `Nächste Folie ▶`;
        nextBtn.classList.remove('btn-final-ceremony');
      }
    }

    // Update phase button highlights
    document.querySelectorAll('.phase-step-btn-large').forEach(btn => {
      const p = parseInt(btn.dataset.phase, 10);
      btn.classList.toggle('active', p === state.phase);
    });

    // Update Slide Select dropdown
    const slideSelect = document.getElementById('admin-slide-select');
    if (slideSelect && state.current_slide) {
      slideSelect.value = state.current_slide.id;
    }

    // Update submission count badge
    const statsBadge = document.getElementById('admin-submission-stats');
    if (statsBadge && state.submission_stats) {
      statsBadge.textContent = `${state.submission_stats.submitted} / ${state.submission_stats.total_players} abgegeben`;
    }

    // Update active announcement card in Admin Live Controller
    const activeAnnounceCard = document.getElementById('admin-active-announcement-card');
    const activeAnnounceText = document.getElementById('admin-active-announcement-text');
    const activeAnnouncePill = document.getElementById('admin-announcement-status-pill');

    if (state.active_announcement) {
      if (activeAnnounceCard) activeAnnounceCard.classList.remove('hidden');
      if (activeAnnounceText) activeAnnounceText.textContent = state.active_announcement;
      if (activeAnnouncePill) activeAnnouncePill.classList.remove('hidden');
    } else {
      if (activeAnnounceCard) activeAnnounceCard.classList.add('hidden');
      if (activeAnnouncePill) activeAnnouncePill.classList.add('hidden');
    }

    // Update Live Participants List
    this.renderLiveParticipants(state);

    // Auto-Refresh Route Map if Route Tab is active
    const tabRoute = document.getElementById('tab-route-btn');
    if (tabRoute && tabRoute.classList.contains('active')) {
      this.renderRouteMap();
    }
  }

  renderAdminLivePreview(state, currentSlide, isQuizSlide) {
    const previewBox = document.getElementById('admin-live-preview-box');
    if (!previewBox) return;

    if (!currentSlide) {
      previewBox.innerHTML = `
        <div style="text-align: center; padding: 25px; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🎬</div>
          <p><strong>Noch keine Stationen in der Rallye vorhanden.</strong></p>
          <p style="font-size: 0.85rem; margin-top: 4px;">Öffne das Folien-Studio oder lade eine Muster-Rallye.</p>
        </div>
      `;
      previewBox.classList.remove('hidden');
      return;
    }

    const labelEl = document.getElementById('admin-preview-phase-label');
    const titleEl = document.getElementById('admin-preview-title');
    const descEl = document.getElementById('admin-preview-desc');
    const metaEl = document.getElementById('admin-preview-meta');
    const mediaEl = document.getElementById('admin-preview-media');
    const questionEl = document.getElementById('admin-preview-question');
    const optionsEl = document.getElementById('admin-preview-options');
    const timerBox = document.getElementById('admin-phase3-timer-box');
    const timerDisplay = document.getElementById('admin-integrated-timer-display');
    const notesBox = document.getElementById('admin-preview-notes-box');
    const notesText = document.getElementById('admin-preview-notes-text');

    previewBox.classList.remove('hidden');

    // 1. Base Slide Details (Always shown to admin for Info, Transit & Quiz)
    if (titleEl) titleEl.textContent = `${state.current_slide_index + 1}. ${currentSlide.title}`;
    if (descEl) descEl.textContent = currentSlide.description || '';

    // Meta (Location / Meeting Time)
    if (metaEl) {
      const parts = [];
      if (currentSlide.location_name) parts.push(`📍 ${currentSlide.location_name}`);
      if (currentSlide.meeting_time) parts.push(`⏰ Treffpunkt: ${currentSlide.meeting_time}`);
      if (parts.length > 0) {
        metaEl.textContent = parts.join(' • ');
        metaEl.classList.remove('hidden');
      } else {
        metaEl.classList.add('hidden');
      }
    }

    // Media preview
    if (mediaEl) {
      if (currentSlide.media_url) {
        mediaEl.innerHTML = `<img src="${window.escapeHtml(currentSlide.media_url)}" alt="Station Media" style="width: 100%; max-height: 140px; object-fit: cover; border-radius: 4px;">`;
        mediaEl.classList.remove('hidden');
      } else {
        mediaEl.innerHTML = '';
        mediaEl.classList.add('hidden');
      }
    }

    // 2. Non-Quiz Slides (Info & Transit)
    if (!isQuizSlide) {
      if (questionEl) questionEl.classList.add('hidden');
      if (optionsEl) optionsEl.classList.add('hidden');
      if (timerBox) timerBox.classList.add('hidden');

      if (labelEl) {
        if (currentSlide.type === 'transit') {
          labelEl.textContent = '🚶 Wegstrecke / Transfer (Aktiv auf allen Geräten)';
          labelEl.style.color = '#38bdf8';
        } else {
          labelEl.textContent = 'ℹ️ Stations-Information (Aktiv auf allen Geräten)';
          labelEl.style.color = '#93c5fd';
        }
      }

      // Memory Notes for Info & Transit (Directly shown)
      if (notesBox && notesText) {
        if (currentSlide.admin_notes && currentSlide.admin_notes.trim()) {
          notesText.textContent = currentSlide.admin_notes;
          notesBox.classList.remove('hidden');
        } else {
          notesBox.classList.add('hidden');
        }
      }
      return;
    }

    // 3. Quiz Slides: Question & Phase Handling
    if (questionEl) {
      questionEl.textContent = `❓ Quizfrage: ${currentSlide.question || currentSlide.title}`;
      questionEl.classList.remove('hidden');
    }

    // Phase Label
    if (labelEl) {
      if (state.phase === 1) {
        labelEl.textContent = '🔒 Phase 1: Frage aktiv (Antworten noch verborgen)';
        labelEl.style.color = '#818cf8';
      } else if (state.phase === 2) {
        labelEl.textContent = '⏱️ Phase 2: Antwortmöglichkeiten eingeblendet';
        labelEl.style.color = '#fbbf24';
      } else if (state.phase === 3) {
        labelEl.textContent = '🚀 Phase 3: Countdown läuft & Abstimmung aktiv';
        labelEl.style.color = '#34d399';
      } else if (state.phase === 4) {
        labelEl.textContent = '🎉 Phase 4: Auflösung & Punkte vergeben';
        labelEl.style.color = '#38bdf8';
      } else if (state.phase === 5) {
        labelEl.textContent = '🏆 Phase 5: Zwischenstand (Leaderboard)';
        labelEl.style.color = '#a78bfa';
      }
    }

    // Options Display
    // Requirement 5: In Phase 2 & 3, do NOT reveal the right answer yet! Only reveal in Phase 4 & 5.
    if (optionsEl) {
      if (state.phase >= 2) {
        optionsEl.classList.remove('hidden');
        optionsEl.innerHTML = '';

        const revealAnswer = state.phase >= 4;

        if (currentSlide.type === 'multiple_choice') {
          const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
          const opts = currentSlide.options || [];
          opts.forEach((optText, idx) => {
            const isCorrect = idx === currentSlide.correct_option_index;
            const optRow = document.createElement('div');
            optRow.style.display = 'flex';
            optRow.style.alignItems = 'center';
            optRow.style.gap = '8px';
            optRow.style.padding = '6px 10px';
            optRow.style.borderRadius = 'var(--radius-sm)';

            if (revealAnswer && isCorrect) {
              optRow.style.background = 'rgba(16, 185, 129, 0.25)';
              optRow.style.border = '1px solid #10b981';
            } else {
              optRow.style.background = 'rgba(255, 255, 255, 0.05)';
              optRow.style.border = '1px solid rgba(255, 255, 255, 0.08)';
            }

            optRow.innerHTML = `
              <strong style="color: ${revealAnswer && isCorrect ? '#34d399' : 'var(--text-muted)'};">${letters[idx]}:</strong>
              <span style="flex: 1; color: white; font-size: 0.95rem;">${window.escapeHtml(optText)}</span>
              ${revealAnswer && isCorrect ? '<span style="color: #34d399; font-weight: 800; font-size: 0.85rem;">✓ Richtige Antwort</span>' : ''}
            `;
            optionsEl.appendChild(optRow);
          });
        } else if (currentSlide.type === 'estimation') {
          if (revealAnswer) {
            optionsEl.innerHTML = `
              <div style="background: rgba(56, 189, 248, 0.18); border: 1px solid #38bdf8; padding: 8px 12px; border-radius: var(--radius-sm); color: white;">
                🎯 <strong>Exakter Zielwert:</strong> <span style="color: #38bdf8; font-size: 1.15rem; font-weight: 900;">${currentSlide.target_value}</span> 
                <small style="color: var(--text-muted); margin-left: 8px;">(Skalierung: ${currentSlide.scale_factor})</small>
              </div>
            `;
          } else {
            optionsEl.innerHTML = `
              <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); padding: 8px 12px; border-radius: var(--radius-sm); color: var(--text-muted); font-size: 0.9rem;">
                🎯 <em>Schätz-Zahleneingabe auf Teilnehmergeräten (Zielwert wird in Phase 4 aufgelöst)</em>
              </div>
            `;
          }
        }
      } else {
        optionsEl.classList.add('hidden');
      }
    }

    // Integrated Phase 3 Timer Control
    if (timerBox && timerDisplay) {
      if (state.phase === 3) {
        timerBox.classList.remove('hidden');
        const remaining = state.timer?.remaining ?? currentSlide.countdown_seconds ?? 20;
        timerDisplay.textContent = `⏱️ Countdown: ${remaining}s`;
        if (remaining <= 5) {
          timerDisplay.style.color = '#ef4444';
        } else {
          timerDisplay.style.color = '#fbbf24';
        }
      } else {
        timerBox.classList.add('hidden');
      }
    }

    // Requirement 4: Quiz Memory Notes shown in Phase 4 (and 5)
    if (notesBox && notesText) {
      if (state.phase >= 4 && currentSlide.admin_notes && currentSlide.admin_notes.trim()) {
        notesText.textContent = currentSlide.admin_notes;
        notesBox.classList.remove('hidden');
      } else {
        notesBox.classList.add('hidden');
      }
    }
  }

  renderLiveParticipants(state) {
    const list = document.getElementById('admin-live-participants-list');
    if (!list) return;

    const participants = state.participants_status || state.leaderboard || [];

    if (participants.length === 0) {
      list.innerHTML = '<small style="color: var(--text-muted);">Noch keine Mitspieler angemeldet.</small>';
      return;
    }

    list.innerHTML = '';
    participants.forEach(player => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.background = '#233146';
      row.style.padding = '8px 12px';
      row.style.borderRadius = 'var(--radius-sm)';

      let statusIcon = '⏳ Überlegt noch...';
      let statusColor = '#f59e0b';

      if (state.phase === 3) {
        if (player.has_submitted) {
          statusIcon = '✅ Abgestimmt';
          statusColor = '#34d399';
        } else {
          statusIcon = '⏳ Überlegt noch...';
          statusColor = '#f59e0b';
        }
      } else if (state.phase >= 4) {
        if (player.has_submitted && player.is_correct !== null) {
          if (player.is_correct === 1 || player.is_correct === true) {
            statusIcon = `✅ Richtig (+${player.final_points || 0})`;
            statusColor = '#34d399';
          } else if (player.is_correct === 2) {
            statusIcon = `🎯 Volltreffer! (+${player.final_points || 0})`;
            statusColor = '#38bdf8';
          } else {
            statusIcon = '❌ Falsch';
            statusColor = '#ef4444';
          }
        } else if (player.has_submitted) {
          statusIcon = '✅ Abgegeben';
          statusColor = '#34d399';
        } else {
          statusIcon = '⚪ Keine Abgabe';
          statusColor = '#94a3b8';
        }
      } else {
        // Phase 1 & 2
        if (player.has_submitted) {
          statusIcon = '✅ Bereit';
          statusColor = '#34d399';
        } else {
          statusIcon = '⏳ Wartet auf Start';
          statusColor = '#94a3b8';
        }
      }

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.1rem;">${window.escapeHtml(player.avatar_emoji || '🌟')}</span>
          <strong style="color: white; font-size: 0.9rem;">${window.escapeHtml(player.name)}</strong>
          <small style="color: var(--text-muted);">(${player.score || 0})</small>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 0.8rem; font-weight: 800; color: ${statusColor};">${statusIcon}</span>
          <button type="button" class="btn-delete-player" data-id="${player.id}" data-name="${window.escapeHtml(player.name)}" style="background: none; border: none; color: #64748b; font-size: 0.85rem; cursor: pointer; padding: 2px 4px;" title="Teilnehmer entfernen">🗑️</button>
        </div>
      `;

      row.querySelector('.btn-delete-player')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pId = e.currentTarget.dataset.id;
        const pName = e.currentTarget.dataset.name;
        if (confirm(`Möchtest du Teilnehmer "${pName}" wirklich entfernen?`)) {
          this.deletePlayer(pId);
        }
      });

      list.appendChild(row);
    });
  }

  async deletePlayer(id) {
    try {
      const res = await this.request(window.apiUrl(`/api/admin/users/${id}`), { method: 'DELETE' });
      if (!res.ok) {
        alert('Fehler beim Entfernen des Teilnehmers');
      }
    } catch (e) {
      console.error(e);
      alert('Fehler beim Entfernen des Teilnehmers');
    }
  }

  async loadSlides() {
    try {
      const res = await this.request(window.apiUrl('/api/slides'));
      this.allSlides = await res.json();
      this.renderSlideSelect();
      this.renderStudioList();

      if (this.guard.baseline === null && this.allSlides.length > 0) {
        await this.openSlideEditor(this.allSlides[0].id, true);
      } else if (this.editingSlideId && !this.guard.isDirty() && !this.isSaving && this.allSlides.some(s => s.id === this.editingSlideId)) {
        await this.openSlideEditor(this.editingSlideId, true);
      }

      const tabRoute = document.getElementById('tab-route-btn');
      if (tabRoute && tabRoute.classList.contains('active')) {
        this.renderRouteMap();
      }

      await this.fetchLiveState();
    } catch (e) {
      console.error('Failed to load slides', e);
    }
  }

  renderSlideSelect() {
    const slideSelect = document.getElementById('admin-slide-select');
    if (!slideSelect) return;

    slideSelect.innerHTML = '';
    this.allSlides.forEach((slide, idx) => {
      const opt = document.createElement('option');
      opt.value = slide.id;
      opt.textContent = `${idx + 1}. [${slide.type.toUpperCase()}] ${slide.title}`;
      if (slide.id === this.currentSlideId) {
        opt.selected = true;
      }
      slideSelect.appendChild(opt);
    });
  }

  renderStudioList() {
    const list = document.getElementById('studio-slides-list');
    if (!list) return;

    list.innerHTML = '';
    this.allSlides.forEach((slide, idx) => {
      const card = document.createElement('div');
      card.className = `studio-slide-item-card ${slide.id === this.editingSlideId ? 'active-editing' : ''}`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge badge-${slide.type}">${slide.type === 'summary' ? 'Endauswertung' : slide.type}</span>
            <strong style="color: white; font-size: 0.95rem;">${idx + 1}. ${window.escapeHtml(slide.title)}</strong>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <small style="color: var(--text-muted); font-size: 0.8rem;">
            ${window.escapeHtml(slide.location_name || 'Kein Standort')}${['multiple_choice','estimation'].includes(slide.type) ? ` • ${slide.max_points} Pkt • ⏱️ ${slide.countdown_seconds}s` : ''}
          </small>
          <div style="display: flex; gap: 4px;" onclick="event.stopPropagation();">
            <button class="icon-btn" style="padding: 4px 8px; font-size: 0.8rem;" onclick="window.admin.moveSlide(${idx}, -1)" title="Nach oben">▲</button>
            <button class="icon-btn" style="padding: 4px 8px; font-size: 0.8rem;" onclick="window.admin.moveSlide(${idx}, 1)" title="Nach unten">▼</button>
            <button class="icon-btn" style="padding: 4px 8px; font-size: 0.8rem; color: #ef4444;" onclick="window.admin.deleteSlide('${slide.id}')" title="Löschen">🗑️</button>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.openSlideEditor(slide.id);
      });

      list.appendChild(card);
    });
  }

  async setSlide(slideId) {
    try {
      await this.request(window.apiUrl('/api/admin/set-slide'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide_id: slideId })
      });
    } catch (e) {
      console.error(e);
    }
  }

  async setSlideWithConfirm(slideId) {
    if (slideId === this.currentSlideId) return;
    if (!confirm('Möchtest du wirklich direkt zu dieser Station wechseln? Der aktuelle Quiz-Ablauf wird dabei unterbrochen.')) {
      const slideSelect = document.getElementById('admin-slide-select');
      if (slideSelect && this.currentSlideId) {
        slideSelect.value = this.currentSlideId;
      }
      return;
    }
    await this.setSlide(slideId);
  }

  async navigatePhaseOrSlide(offset) {
    const currentSlide = this.allSlides.find(s => s.id === this.currentSlideId);
    const currentIdx = this.allSlides.findIndex(s => s.id === this.currentSlideId);
    if (!currentSlide || currentIdx === -1) return;

    const isQuizSlide = currentSlide.type === 'multiple_choice' || currentSlide.type === 'estimation' || currentSlide.type === 'action';
    const isEstimation = currentSlide.type === 'estimation';
    const currentPhase = this.currentPhase || 1;

    if (offset === 1) {
      if (isQuizSlide && currentPhase < 5) {
        let nextPhase = currentPhase + 1;
        if (nextPhase === 2 && isEstimation) {
          nextPhase = 3;
        }
        await this.setPhase(nextPhase);
      } else {
        const targetIdx = currentIdx + 1;
        if (targetIdx < this.allSlides.length) {
          await this.setSlide(this.allSlides[targetIdx].id);
        } else {
          // Reached end of presentation: Start Grand Endauswertung (Phase 5)
          await this.setPhase(5);
        }
      }
    } else if (offset === -1) {
      if (isQuizSlide && currentPhase > 1) {
        let prevPhase = currentPhase - 1;
        if (prevPhase === 2 && isEstimation) {
          prevPhase = 1;
        }
        await this.setPhase(prevPhase);
      } else {
        const targetIdx = currentIdx - 1;
        if (targetIdx >= 0) {
          await this.setSlide(this.allSlides[targetIdx].id);
        }
      }
    }
  }

  async setPhase(phaseNum) {
    let targetPhase = phaseNum;
    const currentSlide = this.allSlides.find(s => s.id === this.currentSlideId);
    if (currentSlide && currentSlide.type === 'estimation' && targetPhase === 2) {
      targetPhase = 3;
    }

    try {
      await this.request(window.apiUrl('/api/admin/set-phase'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: targetPhase })
      });
    } catch (e) {
      console.error(e);
    }
  }

  async startTimer(duration) {
    try {
      await this.request(window.apiUrl('/api/admin/timer/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration })
      });
    } catch (e) {
      console.error(e);
    }
  }

  async stopTimer() {
    try {
      await this.request(window.apiUrl('/api/admin/timer/stop'), { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  }

  async sendAnnouncement(message) {
    try {
      const response = await this.request(window.apiUrl('/api/admin/announcement'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await response.json();
      window.showToast(data.push?.failed ? `Eilmeldung angezeigt. Push: ${data.push.accepted} angenommen, ${data.push.failed} fehlgeschlagen.` : `Eilmeldung gesendet. Push: ${data.push?.accepted || 0} Geräte angenommen.`);
    } catch (e) {
      console.error(e);
    }
  }

  async clearAnnouncement() {
    try {
      await this.request(window.apiUrl('/api/admin/clear-announcement'), { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  }

  async resetTour() {
    try {
      await this.request(window.apiUrl('/api/admin/reset-rallye'), { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  }

  async seedSampleTour() {
    if (!await this.guard.confirmLeave()) return;
    try {
      await this.request(window.apiUrl('/api/admin/seed-sample'), { method: 'POST' });
      await this.loadSlides();
      await this.openSlideEditor(this.allSlides[0]?.id || null, true);
    } catch (e) {
      console.error(e);
    }
  }

  async moveSlide(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= this.allSlides.length) return;

    const copy = [...this.allSlides];
    const item = copy.splice(index, 1)[0];
    copy.splice(target, 0, item);

    const newOrder = copy.map(s => s.id);
    try {
      await this.request(window.apiUrl('/api/admin/slides/reorder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder })
      });
      await this.loadSlides();
    } catch (e) {
      console.error(e);
    }
  }

  async deleteSlide(id) {
    if (!await this.guard.confirmLeave()) return;
    if (!confirm('Diese Folie wirklich löschen?')) return;
    try {
      await this.request(window.apiUrl(`/api/admin/slides/${id}`), { method: 'DELETE' });
      this.editingSlideId = null;
      await this.loadSlides();
      await this.openSlideEditor(this.allSlides[0]?.id || null, true);
    } catch (e) {
      console.error(e);
    }
  }

  async exportTour() {
    try {
      const res = await this.request(window.apiUrl('/api/admin/tour/export'));
      if (!res.ok) throw new Error('Export fehlgeschlagen');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rallye_tour_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Fehler beim Herunterladen des Backups');
    }
  }

  async importTour(file) {
    if (!await this.guard.confirmLeave()) return;
    if (!confirm(`Möchtest du die Rallye aus der Datei "${file.name}" importieren? Bestehende Folien werden durch das Backup ersetzt.`)) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const tourData = JSON.parse(e.target.result);
        const res = await this.request(window.apiUrl('/api/admin/tour/import'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_data: tourData })
        });
        const data = await res.json();
        if (data.success) {
          await this.loadSlides();
          await this.openSlideEditor(this.allSlides[0]?.id || null, true);
          alert(`Erfolg! ${data.count} Stationen erfolgreich wiederhergestellt! ✅`);
        } else {
          alert('Import fehlgeschlagen: ' + (data.error || 'Unbekannter Fehler'));
        }
      } catch (err) {
        console.error(err);
        alert('Fehler beim Lesen der JSON-Datei');
      }
    };
    reader.readAsText(file);
  }

  async openSlideEditor(slideId = null, skipGuard = false) {
    if (!skipGuard && !await this.guard.confirmLeave()) return false;
    this.editingSlideId = slideId;
    this.renderStudioList();

    const titleEl = document.getElementById('studio-editor-title');
    const badgeEl = document.getElementById('studio-editor-type-badge');
    const form = document.getElementById('studio-slide-form');

    if (!slideId) {
      form.reset();
      document.getElementById('edit-slide-id').value = '';
      document.getElementById('edit-slide-admin-notes').value = '';
      document.getElementById('edit-slide-lat').value = '';
      document.getElementById('edit-slide-lng').value = '';
      document.getElementById('edit-slide-coords-badge').textContent = 'Kein Standort';
      document.getElementById('edit-slide-coords-badge').style.color = 'var(--text-muted)';
      document.getElementById('edit-clear-coords-btn')?.classList.add('hidden');
      titleEl.textContent = '➕ Neue Folie erstellen';
      badgeEl.textContent = 'NEU';
      badgeEl.className = 'badge badge-info';
      document.getElementById('edit-media-preview-container').classList.add('hidden');
      document.getElementById('edit-audio-url-wrapper').classList.add('hidden');
      document.getElementById('edit-slide-type').value = 'info';
      this.toggleSlideTypeFields('info');
      this.guard.markClean(this.guard.baseline !== null && this.guard.restored);
      return true;
    }

    const slide = this.allSlides.find(s => s.id === slideId);
    if (!slide) return;

    titleEl.textContent = `Folie bearbeiten: ${slide.title}`;
    badgeEl.textContent = slide.type === 'summary' ? 'ENDAUSWERTUNG' : slide.type.toUpperCase();
    badgeEl.className = `badge badge-${slide.type}`;

    document.getElementById('edit-slide-id').value = slide.id;
    document.getElementById('edit-slide-type').value = slide.type;
    document.getElementById('edit-slide-title').value = slide.title || '';
    document.getElementById('edit-slide-desc').value = slide.description || '';
    document.getElementById('edit-slide-location').value = slide.location_name || '';
    document.getElementById('edit-slide-meeting').value = slide.meeting_time || '';
    document.getElementById('edit-slide-media-type').value = slide.media_type || 'image';
    document.getElementById('edit-slide-media-url').value = slide.media_url || '';
    document.getElementById('edit-slide-audio-url').value = slide.audio_url || '';
    document.getElementById('edit-slide-max-points').value = slide.max_points ?? 100;
    document.getElementById('edit-slide-countdown').value = slide.countdown_seconds ?? 20;
    document.getElementById('edit-slide-admin-notes').value = slide.admin_notes || '';

    // GPS Coordinates
    const latInput = document.getElementById('edit-slide-lat');
    const lngInput = document.getElementById('edit-slide-lng');
    const coordsBadge = document.getElementById('edit-slide-coords-badge');
    const clearCoordsBtn = document.getElementById('edit-clear-coords-btn');

    if (slide.latitude !== undefined && slide.latitude !== null && slide.longitude !== undefined && slide.longitude !== null) {
      latInput.value = slide.latitude;
      lngInput.value = slide.longitude;
      if (coordsBadge) {
        coordsBadge.textContent = `📍 ${slide.latitude.toFixed(4)}, ${slide.longitude.toFixed(4)}`;
        coordsBadge.style.color = '#38bdf8';
      }
      clearCoordsBtn?.classList.remove('hidden');
    } else {
      latInput.value = '';
      lngInput.value = '';
      if (coordsBadge) {
        coordsBadge.textContent = 'Kein Standort';
        coordsBadge.style.color = 'var(--text-muted)';
      }
      clearCoordsBtn?.classList.add('hidden');
    }

    const isAudioWithImg = slide.media_type === 'image_and_audio';
    document.getElementById('edit-audio-url-wrapper')?.classList.toggle('hidden', !isAudioWithImg);

    // Image preview
    const prevContainer = document.getElementById('edit-media-preview-container');
    const prevImg = document.getElementById('edit-media-preview-img');
    if (slide.media_url) {
      prevImg.src = slide.media_url;
      prevContainer.classList.remove('hidden');
    } else {
      prevContainer.classList.add('hidden');
    }

    // Quiz fields
    document.getElementById('edit-slide-question').value = slide.question || '';
    
    if (slide.options && slide.options.length) {
      document.getElementById('edit-slide-opt0').value = slide.options[0] || '';
      document.getElementById('edit-slide-opt1').value = slide.options[1] || '';
      document.getElementById('edit-slide-opt2').value = slide.options[2] || '';
      document.getElementById('edit-slide-opt3').value = slide.options[3] || '';
    } else {
      document.getElementById('edit-slide-opt0').value = '';
      document.getElementById('edit-slide-opt1').value = '';
      document.getElementById('edit-slide-opt2').value = '';
      document.getElementById('edit-slide-opt3').value = '';
    }

    const correctIdx = slide.correct_option_index ?? 0;
    const radio = document.querySelector(`input[name="correct_opt_radio"][value="${correctIdx}"]`);
    if (radio) radio.checked = true;

    document.getElementById('edit-slide-target-val').value = slide.target_value ?? '';
    document.getElementById('edit-slide-scale').value = slide.scale_factor ?? 100;

    this.toggleSlideTypeFields(slide.type);
    this.guard.markClean(this.guard.baseline !== null && this.guard.restored);
    return true;
  }

  toggleSlideTypeFields(type) {
    const scoring = document.getElementById('edit-scoring-section');
    const isQuiz = ['multiple_choice', 'estimation'].includes(type);
    scoring.classList.toggle('hidden', !isQuiz);
    scoring.querySelectorAll('input').forEach(input => input.disabled = !isQuiz);
    const mcSection = document.getElementById('edit-mc-section');
    const estSection = document.getElementById('edit-estimation-section');
    const questSection = document.getElementById('edit-question-section');
    const badgeEl = document.getElementById('studio-editor-type-badge');

    if (badgeEl) {
      badgeEl.textContent = type === 'summary' ? 'ENDAUSWERTUNG' : type.toUpperCase();
      badgeEl.className = `badge badge-${type}`;
    }

    if (type === 'multiple_choice') {
      questSection.classList.remove('hidden');
      mcSection.classList.remove('hidden');
      estSection.classList.add('hidden');
    } else if (type === 'estimation') {
      questSection.classList.remove('hidden');
      mcSection.classList.add('hidden');
      estSection.classList.remove('hidden');
    } else if (type === 'action') {
      questSection.classList.remove('hidden');
      mcSection.classList.add('hidden');
      estSection.classList.add('hidden');
    } else {
      // Info & Transit
      questSection.classList.add('hidden');
      mcSection.classList.add('hidden');
      estSection.classList.add('hidden');
    }
  }

  async saveSlide() {
    if (this.isSaving) return false;
    if (!document.getElementById('studio-slide-form').reportValidity()) return false;
    this.guard.saving = true;
    document.getElementById('studio-slide-form').inert = true;
    this.isSaving = true;

    const submitBtn = document.querySelector('#studio-slide-form button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '💾 Folie speichern';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '💾 Speichere...';
    }

    const slideId = document.getElementById('edit-slide-id').value;
    const type = document.getElementById('edit-slide-type').value;
    const title = document.getElementById('edit-slide-title').value.trim();
    const description = document.getElementById('edit-slide-desc').value.trim();
    const location_name = document.getElementById('edit-slide-location').value.trim();
    const meeting_time = document.getElementById('edit-slide-meeting').value.trim();
    const media_type = document.getElementById('edit-slide-media-type').value;
    const media_url = document.getElementById('edit-slide-media-url').value.trim();
    const audio_url = document.getElementById('edit-slide-audio-url').value.trim();
    const max_points = parseInt(document.getElementById('edit-slide-max-points').value, 10) || 0;
    const countdown_seconds = parseInt(document.getElementById('edit-slide-countdown').value, 10) || 20;
    const admin_notes = document.getElementById('edit-slide-admin-notes')?.value.trim() || null;
    const latitude = document.getElementById('edit-slide-lat')?.value ? parseFloat(document.getElementById('edit-slide-lat').value) : null;
    const longitude = document.getElementById('edit-slide-lng')?.value ? parseFloat(document.getElementById('edit-slide-lng').value) : null;

    const question = document.getElementById('edit-slide-question').value.trim();
    
    let options = null;
    let correct_option_index = null;
    let target_value = null;
    let scale_factor = 100;

    if (type === 'multiple_choice') {
      options = [
        document.getElementById('edit-slide-opt0').value.trim(),
        document.getElementById('edit-slide-opt1').value.trim(),
        document.getElementById('edit-slide-opt2').value.trim(),
        document.getElementById('edit-slide-opt3').value.trim()
      ];
      
      const checkedRadio = document.querySelector('input[name="correct_opt_radio"]:checked');
      const selectedIndex = checkedRadio ? parseInt(checkedRadio.value, 10) : 0;
      correct_option_index = options.slice(0, selectedIndex).filter(Boolean).length;
      if (!options[selectedIndex]) correct_option_index = -1;
      options = options.filter(Boolean);
    } else if (type === 'estimation') {
      target_value = parseFloat(document.getElementById('edit-slide-target-val').value) || 0;
      scale_factor = parseFloat(document.getElementById('edit-slide-scale').value) || 100;
    }

    const payload = {
      type, title, description, location_name, meeting_time, media_type, media_url, audio_url,
      max_points, countdown_seconds, admin_notes, latitude, longitude,
      question, options, correct_option_index,
      target_value, scale_factor
    };

    try {
      let savedSlideId = slideId;
      if (slideId) {
        await this.request(window.apiUrl(`/api/admin/slides/${slideId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        const res = await this.request(window.apiUrl('/api/admin/slides'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        savedSlideId = data.slide?.id;
      }

      this.guard.markClean();
      this.editingSlideId = savedSlideId;
      await this.loadSlides();
      if (savedSlideId) await this.openSlideEditor(savedSlideId, true);
      window.showToast('Folie gespeichert ✓');
      return true;
    } catch (e) {
      console.error(e);
      window.showToast('Speichern fehlgeschlagen. Deine Änderungen bleiben erhalten.', true);
      return false;
    } finally {
      document.getElementById('studio-slide-form').inert = false;
      this.guard.saving = false;
      this.isSaving = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  // ==========================================
  // MAP PICKER MODAL (STANDORT ANPINNEN)
  // ==========================================
  initMapPicker() {
    if (this.pickerMap || typeof L === 'undefined') return;

    this.pickerMap = L.map('picker-map').setView([50.978, 11.029], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(this.pickerMap);

    this.pickerMap.on('click', (e) => {
      this.setPickerMarker(e.latlng.lat, e.latlng.lng);
    });
  }

  openMapPicker() {
    if (typeof L === 'undefined') {
      alert('Karten-Bibliothek wird noch geladen. Bitte kurz warten.');
      return;
    }

    const modal = document.getElementById('admin-map-picker-modal');
    modal?.classList.remove('hidden');

    const searchInput = document.getElementById('picker-search-input');
    const searchFeedback = document.getElementById('picker-search-feedback');
    if (searchInput) searchInput.value = '';
    if (searchFeedback) searchFeedback.classList.add('hidden');

    this.initMapPicker();

    const curLat = parseFloat(document.getElementById('edit-slide-lat')?.value);
    const curLng = parseFloat(document.getElementById('edit-slide-lng')?.value);

    setTimeout(() => {
      if (this.pickerMap) {
        this.pickerMap.invalidateSize();

        let targetCenter = null;
        let shouldPlacePin = false;

        if (!isNaN(curLat) && !isNaN(curLng)) {
          targetCenter = [curLat, curLng];
          shouldPlacePin = true;
        } else {
          // Look for closest previous waypoint in the tour
          const curSlide = this.allSlides.find(s => s.id === this.editingSlideId);
          if (curSlide) {
            const prevSlide = this.allSlides
              .filter(s => s.order_index < curSlide.order_index && s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined)
              .sort((a, b) => b.order_index - a.order_index)[0];
            
            if (prevSlide) {
              targetCenter = [prevSlide.latitude, prevSlide.longitude];
            }
          }

          if (!targetCenter) {
            // Any last slide with coordinates
            const anySlide = [...this.allSlides]
              .filter(s => s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined)
              .sort((a, b) => b.order_index - a.order_index)[0];
            
            if (anySlide) {
              targetCenter = [anySlide.latitude, anySlide.longitude];
            }
          }

          if (!targetCenter && this.lastUsedMapCenter) {
            targetCenter = this.lastUsedMapCenter;
          }

          if (!targetCenter) {
            targetCenter = [50.978, 11.029];
          }
        }

        this.pickerMap.setView(targetCenter, 16);

        if (shouldPlacePin) {
          this.setPickerMarker(curLat, curLng);
        } else {
          this.removePickerPin();
        }
      }
    }, 200);
  }

  async searchPickerLocation() {
    const input = document.getElementById('picker-search-input');
    const feedback = document.getElementById('picker-search-feedback');
    if (!input || !this.pickerMap) return;

    const query = input.value.trim();
    if (!query) return;

    feedback.classList.remove('hidden');
    feedback.style.color = '#38bdf8';
    feedback.textContent = `🔎 Suche nach "${query}"...`;

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
      const results = await res.json();

      if (results && results.length > 0) {
        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);
        this.pickerMap.flyTo([lat, lon], 16);
        this.lastUsedMapCenter = [lat, lon];
        feedback.style.color = '#34d399';
        feedback.textContent = `📍 Gefunden: ${results[0].display_name}`;
      } else {
        feedback.style.color = '#ef4444';
        feedback.textContent = `❌ Kein Ort für "${query}" gefunden. Versuche PLZ oder Stadtname.`;
      }
    } catch (e) {
      console.error('Search error', e);
      feedback.style.color = '#ef4444';
      feedback.textContent = '❌ Fehler bei der Ortssuche.';
    }
  }

  setPickerMarker(lat, lng) {
    this.tempPickerCoords = { lat, lng };
    this.lastUsedMapCenter = [lat, lng];

    if (!this.pickerMarker && this.pickerMap) {
      this.pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(this.pickerMap);
      this.pickerMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        this.setPickerMarker(pos.lat, pos.lng);
      });
    } else if (this.pickerMarker) {
      this.pickerMarker.setLatLng([lat, lng]);
    }

    const coordsText = document.getElementById('picker-coords-text');
    if (coordsText) {
      coordsText.textContent = `📍 Gewählt: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      coordsText.style.color = '#38bdf8';
    }
  }

  removePickerPin() {
    this.tempPickerCoords = null;
    if (this.pickerMarker && this.pickerMap) {
      this.pickerMap.removeLayer(this.pickerMarker);
      this.pickerMarker = null;
    }
    const coordsText = document.getElementById('picker-coords-text');
    if (coordsText) {
      coordsText.textContent = 'Klicke auf die Karte, um einen Pin zu setzen';
      coordsText.style.color = 'var(--text-muted)';
    }
  }

  confirmPickerCoords() {
    const latInput = document.getElementById('edit-slide-lat');
    const lngInput = document.getElementById('edit-slide-lng');
    const coordsBadge = document.getElementById('edit-slide-coords-badge');
    const clearBtn = document.getElementById('edit-clear-coords-btn');

    if (this.tempPickerCoords) {
      latInput.value = this.tempPickerCoords.lat;
      lngInput.value = this.tempPickerCoords.lng;
      if (coordsBadge) {
        coordsBadge.textContent = `📍 ${this.tempPickerCoords.lat.toFixed(4)}, ${this.tempPickerCoords.lng.toFixed(4)}`;
        coordsBadge.style.color = '#38bdf8';
      }
      clearBtn?.classList.remove('hidden');
    } else {
      latInput.value = '';
      lngInput.value = '';
      if (coordsBadge) {
        coordsBadge.textContent = 'Kein Standort';
        coordsBadge.style.color = 'var(--text-muted)';
      }
      clearBtn?.classList.add('hidden');
    }

    document.getElementById('admin-map-picker-modal')?.classList.add('hidden');
    this.guard.changed();
    this.guard.changed();
  }

  clearCoordsFromForm() {
    document.getElementById('edit-slide-lat').value = '';
    document.getElementById('edit-slide-lng').value = '';
    const badge = document.getElementById('edit-slide-coords-badge');
    if (badge) {
      badge.textContent = 'Kein Standort';
      badge.style.color = 'var(--text-muted)';
    }
    document.getElementById('edit-clear-coords-btn')?.classList.add('hidden');
    this.removePickerPin();
    this.guard.changed();
  }

  // ==========================================
  // ROUTE MAP TAB (GESAMTE ROUTE ENTLANG DER STRASSEN)
  // ==========================================
  async renderRouteMap() {
    if (typeof L === 'undefined') return;

    if (!this.routeMap) {
      this.routeMap = L.map('admin-route-map').setView([50.978, 11.029], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(this.routeMap);
      this.routeLayerGroup = L.layerGroup().addTo(this.routeMap);
    }

    setTimeout(() => {
      if (this.routeMap) this.routeMap.invalidateSize();
    }, 150);

    if (!this.routeLayerGroup) return;
    this.routeLayerGroup.clearLayers();

    // Sort all slides by order_index
    const orderedSlides = [...this.allSlides].sort((a, b) => a.order_index - b.order_index);
    const validSlides = orderedSlides.filter(s => s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined);

    const statsBadge = document.getElementById('route-stats-badge');
    if (statsBadge) {
      statsBadge.textContent = `${validSlides.length} von ${orderedSlides.length} Stationen mit GPS`;
    }

    if (validSlides.length === 0) return;

    const latLngs = validSlides.map(s => [s.latitude, s.longitude]);

    // 1. Follow Actual Streets & Paths using OSRM Pedestrian / Foot Routing
    if (latLngs.length > 1) {
      let streetCoordinates = [];
      let totalDistanceMeters = 0;
      let totalDurationSeconds = 0;

      const coordsQuery = validSlides.map(s => `${s.longitude},${s.latitude}`).join(';');

      if (this.cachedRouteGeoJson && this.cachedRouteGeoJson.query === coordsQuery && this.cachedRouteGeoJson.coords.length > 0) {
        streetCoordinates = this.cachedRouteGeoJson.coords;
        totalDistanceMeters = this.cachedRouteGeoJson.distance;
        totalDurationSeconds = this.cachedRouteGeoJson.duration;
      } else {
        try {
          // OpenStreetMap Pedestrian Foot Routing via internal API proxy
          const routeUrl = window.apiUrl(`/api/route?coords=${coordsQuery}`);
          const response = await fetch(routeUrl);
          if (response.ok) {
            const routeData = await response.json();
            if (routeData.code === 'Ok' && routeData.routes && routeData.routes[0]) {
              const route = routeData.routes[0];
              totalDistanceMeters = route.distance;
              totalDurationSeconds = route.duration;
              // GeoJSON coords are [lng, lat] -> Leaflet wants [lat, lng]
              streetCoordinates = route.geometry.coordinates.map(pt => [pt[1], pt[0]]);
              this.cachedRouteGeoJson = {
                query: coordsQuery,
                coords: streetCoordinates,
                distance: totalDistanceMeters,
                duration: totalDurationSeconds
              };
            }
          }
        } catch (err) {
          console.warn('Foot routing service unavailable, falling back to direct waypoints', err);
        }
      }

      // Fallback if offline or OSRM failed
      if (!streetCoordinates || streetCoordinates.length === 0) {
        streetCoordinates = latLngs;
      } else {
        if (statsBadge && totalDistanceMeters > 0) {
          const distKm = (totalDistanceMeters / 1000).toFixed(1);
          const walkMin = Math.round(totalDurationSeconds / 60);
          statsBadge.textContent = `${validSlides.length} Stationen • 🚶 ${distKm} km (~${walkMin} Min)`;
        }
      }

      // Draw subtle glow outline under street route
      L.polyline(streetCoordinates, {
        color: '#38bdf8',
        weight: 8,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.routeLayerGroup);

      // Draw main street route polyline
      const mainPolyline = L.polyline(streetCoordinates, {
        color: '#6366f1',
        weight: 5,
        opacity: 0.95,
        dashArray: '8, 6',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.routeLayerGroup);

      // 2. Draw Direction Arrows along the real street path (Exact Direction of Travel)
      const totalPoints = streetCoordinates.length;
      const desiredArrowCount = Math.max(3, Math.min(25, validSlides.length * 2));
      const step = Math.max(2, Math.floor(totalPoints / desiredArrowCount));

      for (let i = 1; i < totalPoints - 1; i += step) {
        const p1 = streetCoordinates[i];
        
        // Find a subsequent point with measurable distance to calculate accurate street heading
        let p2 = streetCoordinates[Math.min(i + 1, totalPoints - 1)];
        let nextIdx = i + 1;
        while (nextIdx < totalPoints && Math.abs(p2[0] - p1[0]) + Math.abs(p2[1] - p1[1]) < 0.00005) {
          nextIdx++;
          if (nextIdx < totalPoints) p2 = streetCoordinates[nextIdx];
        }

        if (p1[0] === p2[0] && p1[1] === p2[1]) continue;

        // Spherical trigonometry bearing from North (0° = North/Up, 90° = East/Right, etc.)
        const dLng = (p2[1] - p1[1]) * Math.PI / 180;
        const lat1Rad = p1[0] * Math.PI / 180;
        const lat2Rad = p2[0] * Math.PI / 180;
        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
        const headingDeg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

        const arrowIcon = L.divIcon({
          className: 'custom-arrow-marker',
          html: `
            <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
              <svg width="20" height="20" viewBox="0 0 24 24" style="transform: rotate(${headingDeg}deg); transform-origin: center center; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.9));">
                <path d="M12 2L4 21L12 17L20 21Z" fill="#38bdf8" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        L.marker(p1, { icon: arrowIcon, interactive: false }).addTo(this.routeLayerGroup);
      }

      // Only fitBounds on initial load or if coordinates changed, preserving user zoom/pan!
      const shouldFit = !this.routeMapHasInitialFit || this.lastRenderedCoordsKey !== coordsQuery;
      if (shouldFit) {
        this.routeMap.fitBounds(mainPolyline.getBounds(), { padding: [40, 40] });
        this.routeMapHasInitialFit = true;
        this.lastRenderedCoordsKey = coordsQuery;
      }
    } else if (latLngs.length === 1) {
      if (!this.routeMapHasInitialFit) {
        this.routeMap.setView(latLngs[0], 16);
        this.routeMapHasInitialFit = true;
      }
    }

    // 3. Draw Numbered Station Markers for each station
    const activeSlideId = this.currentSlideId || this.latestState?.current_slide_id || this.latestState?.current_slide?.id;

    validSlides.forEach((slide) => {
      const isCurrent = activeSlideId ? (slide.id === activeSlideId) : (slide.order_index === 0);
      const stepNumber = slide.order_index + 1;

      const markerIcon = L.divIcon({
        className: 'custom-step-marker-container',
        html: `<div class="custom-step-marker-inner ${isCurrent ? 'active-station' : ''}"><span>${stepNumber}</span></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -20]
      });

      const marker = L.marker([slide.latitude, slide.longitude], { icon: markerIcon }).addTo(this.routeLayerGroup);

      const popupContent = `
        <div style="min-width: 200px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <span class="badge badge-${slide.type}" style="font-size: 0.75rem;">${slide.type.toUpperCase()}</span>
            ${isCurrent ? '<strong style="color: #f59e0b; font-size: 0.75rem;">🔥 AKTIV</strong>' : ''}
          </div>
          <strong style="color: white; font-size: 1rem; display: block; margin-bottom: 2px;">${stepNumber}. ${window.escapeHtml(slide.title)}</strong>
          ${slide.location_name ? `<small style="color: #38bdf8; display: block; margin-bottom: 6px;">📍 ${window.escapeHtml(slide.location_name)}</small>` : ''}
          <div style="margin-top: 8px;">
            <button class="submit-btn" style="width: 100%; padding: 8px 10px; font-size: 0.85rem;" onclick="window.admin.setSlideWithConfirm('${slide.id}')">
              Zu dieser Station wechseln ▶
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
    });
  }
}

window.admin = new AdminController();

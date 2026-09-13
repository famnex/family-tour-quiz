/** Protect the slide editor and retain a tab-local recovery draft. */
class EditorGuard {
  constructor(form) {
    this.form = form;
    this.baseline = null;
    this.key = 'rallye_editor_draft:' + (window.APP_BASE || '/');
    this.pending = false;
    this.restored = false;
    this.saving = false;
    form.addEventListener('input', () => this.changed());
    form.addEventListener('change', () => this.changed());
    window.addEventListener('beforeunload', e => {
      if (!this.isDirty()) return;
      this.changed();
      e.preventDefault(); e.returnValue = '';
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.changed(); });
  }
  controls() {
    return [...this.form.querySelectorAll('input,textarea,select')].filter(el => el.type !== 'file');
  }
  snapshot() {
    return this.controls().map(el => ({ key: el.id || `${el.name}:${el.value}`, value: el.value, checked: el.checked }));
  }
  apply(fields) {
    const map = new Map(fields.map(f => [f.key, f]));
    for (const el of this.controls()) {
      const item = map.get(el.id || `${el.name}:${el.value}`);
      if (!item) continue;
      if (el.type === 'radio' || el.type === 'checkbox') el.checked = !!item.checked;
      else el.value = item.value;
    }
  }
  isDirty() { return this.baseline !== null && JSON.stringify(this.snapshot()) !== this.baseline; }
  markClean(clearDraft = true) {
    this.baseline = JSON.stringify(this.snapshot());
    if (clearDraft) this.removeDraft();
    this.updateStatus();
  }
  removeDraft() { try { sessionStorage.removeItem(this.key); } catch {} }
  changed() {
    if (this.baseline === null) return;
    if (this.isDirty()) {
      try { sessionStorage.setItem(this.key, JSON.stringify({ fields: this.snapshot(), baseline: this.baseline, savedAt: Date.now() })); }
      catch { /* beforeunload and in-app guards still protect the draft */ }
    } else this.removeDraft();
    this.updateStatus();
  }
  updateStatus() {
    const status = document.getElementById('editor-save-status');
    status.textContent = this.isDirty() ? 'Ungespeicherte Änderungen' : 'Keine ungespeicherten Änderungen';
    status.classList.toggle('is-dirty', this.isDirty());
  }
  async confirmLeave() {
    if (this.saving) { window.showToast('Die Folie wird noch gespeichert. Bitte kurz warten.'); return false; }
    if (!this.isDirty()) return true;
    if (this.pending) return false;
    this.pending = true;
    const dialog = document.getElementById('editor-unsaved-dialog');
    const previousFocus = document.activeElement;
    dialog.returnValue = 'cancel';
    dialog.showModal();
    const choice = await new Promise(resolve => {
      const finish = value => { dialog.removeEventListener('close', onClose); resolve(value); };
      const onClose = () => finish(dialog.returnValue);
      dialog.addEventListener('close', onClose);
    });
    let leave = false;
    if (choice === 'save') leave = await window.admin.saveSlide();
    if (choice === 'discard') {
      this.apply(JSON.parse(this.baseline));
      this.removeDraft(); this.updateStatus();
      leave = true;
    }
    this.pending = false;
    previousFocus?.focus();
    return !!leave;
  }
  async offerRestore() {
    if (this.restored || this.isDirty()) return;
    this.restored = true;
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(this.key)); } catch { this.removeDraft(); }
    if (!draft || !Array.isArray(draft.fields) || typeof draft.baseline !== 'string') return;
    const dialog = document.getElementById('editor-restore-dialog');
    dialog.returnValue = 'cancel';
    dialog.showModal();
    const choice = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
    if (choice === 'cancel') { this.restored = false; return; }
    if (choice !== 'restore') { this.removeDraft(); return; }
    const id = draft.fields.find(f => f.key === 'edit-slide-id')?.value || null;
    const existing = window.admin.allSlides.some(s => s.id === id);
    await window.admin.openSlideEditor(existing ? id : null, true);
    this.apply(draft.fields);
    if (id && !existing) document.getElementById('edit-slide-id').value = '';
    window.admin.editingSlideId = existing ? id : null;
    window.admin.toggleSlideTypeFields(document.getElementById('edit-slide-type').value);
    this.changed();
    document.getElementById('tab-studio-btn').click();
    window.showToast('Entwurf wiederhergestellt. Bitte prüfen und speichern.');
  }
}
window.EditorGuard = EditorGuard;

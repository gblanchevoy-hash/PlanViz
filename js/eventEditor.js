/**
 * eventEditor.js v3 — formulaire création/édition/vue, sans aucun setOption calendrier
 */
class EventEditor {
  constructor(app) {
    this.app = app;
    this.editingEventIds = [];
    this.selectedColor   = '#6c8cf5';
    this.dateRowCount    = 0;
    this.viewModeActive  = false;

    this.swatches = [
      '#6c8cf5','#4caf82','#f5a742','#f56060',
      '#a78bfa','#38bdf8','#fb7185','#34d399',
      '#fbbf24','#e879f9','#94a3b8','#f97316',
    ];
  }

  init() {
    this.buildSwatches();
    document.getElementById('evCustomColor').addEventListener('input', (e) => {
      this.setColor(e.target.value, false);
    });
  }

  // ── SWATCHES ─────────────────────────────────────────────
  buildSwatches() {
    const container = document.getElementById('colorSwatches');
    if (!container) return;
    container.innerHTML = '';
    this.swatches.forEach(color => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch' + (color === this.selectedColor ? ' selected' : '');
      btn.style.background = color;
      btn.addEventListener('click', () => {
        this.setColor(color, true);
        document.getElementById('evCustomColor').value = color;
      });
      container.appendChild(btn);
    });
  }

  setColor(color, fromSwatch) {
    this.selectedColor = color;
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
    if (fromSwatch) {
      const match = [...document.querySelectorAll('.swatch')]
        .find(s => s.style.background === color || s.style.background === this.hexToRgb(color));
      if (match) match.classList.add('selected');
    }
    const titleEl = document.getElementById('evTitle');
    if (titleEl) {
      titleEl.style.borderLeft = `4px solid ${color}`;
      titleEl.style.borderRadius = '0 6px 6px 0';
    }
    document.querySelectorAll('.date-row-bar').forEach(bar => bar.style.background = color);
  }

  hexToRgb(hex) {
    try {
      const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      return `rgb(${r}, ${g}, ${b})`;
    } catch { return hex; }
  }

  getContrastColor(hex) {
    try {
      const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      return (0.299*r+0.587*g+0.114*b)/255 > 0.5 ? '#1a1a2e' : '#ffffff';
    } catch { return '#ffffff'; }
  }

  // ── OUVRIR (nouveau) ──────────────────────────────────────
  open(existingEvent = null, prefillDate = null) {
    this.viewModeActive  = false;
    this.editingEventIds = [];
    this.dateRowCount    = 0;

    this._setReadOnly(false);
    document.getElementById('eventModalTitle').textContent = 'Nouvel événement';
    document.getElementById('evDeleteBtn').style.display = 'none';
    document.getElementById('evTitle').value       = '';
    document.getElementById('evCategory').value    = '';
    document.getElementById('evResource').value    = '';
    document.getElementById('evDescription').value = '';
    document.getElementById('evTitle').style.borderLeft = '';

    this.setColor(this.swatches[0], true);
    document.getElementById('evCustomColor').value = this.swatches[0];
    this.buildSwatches();

    document.getElementById('dateRows').innerHTML = '';
    this.addDateRow(prefillDate || new Date().toISOString().slice(0,10));

    this._setSaveBtn('Enregistrer', () => this.save());
    this._setCancelBtn(() => this.close());
    document.getElementById('eventModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('evTitle').focus(), 80);
  }

  // ── OUVRIR (édition d'un événement manuel) ─────────────────
  openEdit(event) {
    this.viewModeActive  = false;
    this.editingEventIds = [event.id];
    this.dateRowCount    = 0;

    this._setReadOnly(false);
    document.getElementById('eventModalTitle').textContent = 'Modifier l\'événement';
    document.getElementById('evDeleteBtn').style.display = 'inline-flex';
    document.getElementById('evTitle').value       = event.title || '';
    document.getElementById('evCategory').value    = event.extendedProps.category || '';
    document.getElementById('evResource').value    = event.extendedProps.resource || '';
    document.getElementById('evDescription').value = event.extendedProps.description || '';

    const color = event.extendedProps.color || this.swatches[0];
    this.selectedColor = color;
    document.getElementById('evCustomColor').value = color;
    this.buildSwatches();
    this.setColor(color, false);

    document.getElementById('dateRows').innerHTML = '';
    this.addDateRow(
      event.start ? event.start.toISOString().slice(0,10) : '',
      event.start ? event.start.toTimeString().slice(0,5) : '09:00',
      event.end   ? event.end.toISOString().slice(0,10)   : '',
      event.end   ? event.end.toTimeString().slice(0,5)   : '10:00'
    );

    this._setSaveBtn('Enregistrer', () => this.save());
    this._setCancelBtn(() => this.close());
    document.getElementById('eventModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('evTitle').focus(), 80);
  }

  // ── OUVRIR (lecture seule, événements importés) ────────────
  openView(event) {
    this.viewModeActive  = true;
    this.editingEventIds = [];
    this.dateRowCount    = 0;

    this._setReadOnly(true);
    document.getElementById('eventModalTitle').textContent = '📋 Détail';
    document.getElementById('evDeleteBtn').style.display = 'none';
    document.getElementById('evTitle').value       = event.title || '';
    document.getElementById('evCategory').value    = event.extendedProps.category || '';
    document.getElementById('evResource').value    = event.extendedProps.resource || '';
    document.getElementById('evDescription').value = event.extendedProps.description || '';

    const color = event.extendedProps.color || event.backgroundColor || this.swatches[0];
    this.selectedColor = color;
    document.getElementById('evCustomColor').value = color;
    this.buildSwatches();
    this.setColor(color, false);

    document.getElementById('dateRows').innerHTML = '';
    this.addDateRow(
      event.start ? event.start.toISOString().slice(0,10) : '',
      event.start ? event.start.toTimeString().slice(0,5) : '',
      event.end   ? event.end.toISOString().slice(0,10)   : '',
      event.end   ? event.end.toTimeString().slice(0,5)   : ''
    );
    document.querySelectorAll('.date-row-fields input').forEach(i => i.readOnly = true);

    this._setSaveBtn('Fermer', () => this.close());
    this._setCancelBtn(null); // hide cancel in view mode
    document.getElementById('eventModal').classList.remove('hidden');
  }

  // ── AJOUTER UNE LIGNE DE DATE ─────────────────────────────
  addDateRow(prefillStart='', prefillStartTime='09:00', prefillEnd='', prefillEndTime='10:00') {
    this.dateRowCount++;
    const id = this.dateRowCount;
    const container = document.getElementById('dateRows');

    // Clone last row's date by default
    if (!prefillStart && id > 1) {
      const prev = document.getElementById(`row_startDate_${id-1}`);
      if (prev?.value) prefillStart = prev.value;
    }
    if (!prefillEnd) prefillEnd = prefillStart;

    const div = document.createElement('div');
    div.className = 'date-row';
    div.id = `dateRow_${id}`;
    div.innerHTML = `
      <div class="date-row-bar" style="background:${this.selectedColor}">
        <span class="date-row-label">Date ${id}</span>
        ${id > 1 ? `<button type="button" class="date-row-remove" onclick="app.eventEditor.removeDateRow(${id})">✕</button>` : ''}
      </div>
      <div class="date-row-fields">
        <div class="drf"><label>Début ★</label>
          <input type="date" id="row_startDate_${id}" class="filter-input" value="${prefillStart}"></div>
        <div class="drf"><label>Heure début</label>
          <input type="time" id="row_startTime_${id}" class="filter-input" value="${prefillStartTime}"></div>
        <div class="drf"><label>Fin</label>
          <input type="date" id="row_endDate_${id}" class="filter-input" value="${prefillEnd}"></div>
        <div class="drf"><label>Heure fin</label>
          <input type="time" id="row_endTime_${id}" class="filter-input" value="${prefillEndTime}"></div>
      </div>`;
    container.appendChild(div);

    document.getElementById(`row_startDate_${id}`).addEventListener('change', (e) => {
      const endEl = document.getElementById(`row_endDate_${id}`);
      if (!endEl.value || endEl.value < e.target.value) endEl.value = e.target.value;
    });

    div.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  removeDateRow(id) {
    document.getElementById(`dateRow_${id}`)?.remove();
  }

  // ── SAUVEGARDER ───────────────────────────────────────────
  save() {
    if (this.viewModeActive) { this.close(); return; }

    const title = document.getElementById('evTitle').value.trim();
    if (!title) {
      document.getElementById('evTitle').focus();
      document.getElementById('evTitle').style.outline = '2px solid var(--danger)';
      setTimeout(() => document.getElementById('evTitle').style.outline = '', 1500);
      return;
    }

    const category    = document.getElementById('evCategory').value.trim();
    const resource    = document.getElementById('evResource').value.trim();
    const description = document.getElementById('evDescription').value.trim();
    const color       = this.selectedColor;
    const textColor   = this.getContrastColor(color);

    const entries = [];
    document.querySelectorAll('.date-row').forEach(row => {
      const rowId     = row.id.replace('dateRow_','');
      const startDate = document.getElementById(`row_startDate_${rowId}`)?.value;
      const startTime = document.getElementById(`row_startTime_${rowId}`)?.value || '00:00';
      const endDate   = document.getElementById(`row_endDate_${rowId}`)?.value || startDate;
      const endTime   = document.getElementById(`row_endTime_${rowId}`)?.value || '01:00';
      if (!startDate) return;
      const start = new Date(`${startDate}T${startTime}:00`);
      let   end   = new Date(`${endDate}T${endTime}:00`);
      if (isNaN(start.getTime())) return;
      if (end <= start) end = new Date(start.getTime() + 3600000);
      entries.push({ start, end });
    });

    if (entries.length === 0) { alert('Veuillez renseigner au moins une date.'); return; }

    this.ensureManualLayer();

    // Supprimer les anciens si édition
    if (this.editingEventIds.length > 0) {
      this.editingEventIds.forEach(id => {
        this.app.calendarManager.calendar.getEventById(id)?.remove();
      });
      this.editingEventIds = [];
    }

    const layer = this.app.layers.find(l => l.id === 'manual');
    entries.forEach(({ start, end }) => {
      const eventId = 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
      this.app.calendarManager.calendar.addEvent({
        id: eventId, title,
        start: start.toISOString(), end: end.toISOString(),
        backgroundColor: color, borderColor: color, textColor,
        extendedProps: { fileId:'manual', filename:'Saisie manuelle', color, manual:true, category, resource, description }
      });
      if (layer) layer.events.push({ id: eventId });
    });

    if (layer) this.app.renderLayerList();
    this.app.dashboard.update();
    this.close();
  }

  ensureManualLayer() {
    if (this.app.layers.find(l => l.id === 'manual')) return;
    this.app.layers.push({ id:'manual', name:'Saisie manuelle', color:this.selectedColor, events:[], visible:true, manual:true });
    this.app.renderLayerList();
    this.app.updateBadge();
  }

  deleteEvent() {
    if (!confirm('Supprimer cet événement ?')) return;
    this.editingEventIds.forEach(id => {
      this.app.calendarManager.calendar.getEventById(id)?.remove();
    });
    const layer = this.app.layers.find(l => l.id === 'manual');
    if (layer) layer.events = layer.events.filter(e => !this.editingEventIds.includes(e.id));
    this.app.renderLayerList();
    this.app.dashboard.update();
    this.close();
  }

  close() {
    this._setReadOnly(false);
    document.getElementById('eventModal').classList.add('hidden');
    this.editingEventIds = [];
    this.viewModeActive  = false;
    // Restore default save button
    this._setSaveBtn('Enregistrer', () => this.save());
    this._setCancelBtn(() => this.close());
  }

  // ── HELPERS ───────────────────────────────────────────────
  _setReadOnly(on) {
    ['evTitle','evCategory','evResource','evDescription'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.readOnly = on;
    });
    const addDateBtn = document.querySelector('.btn-add-date');
    if (addDateBtn) addDateBtn.style.display = on ? 'none' : '';
  }

  _setSaveBtn(label, fn) {
    const btn = document.querySelector('#eventModal .btn-primary');
    if (!btn) return;
    btn.textContent = label;
    btn.onclick = fn;
  }

  _setCancelBtn(fn) {
    const btn = document.querySelector('#eventModal .btn-ghost:not(#evDeleteBtn)');
    if (!btn) return;
    if (fn) { btn.style.display = ''; btn.onclick = fn; }
    else    { btn.style.display = 'none'; }
  }
}

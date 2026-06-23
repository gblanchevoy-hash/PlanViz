/**
 * eventContextMenu.js v2 — gestionnaire central de toutes les interactions calendrier
 *
 * Clic sur case vide      → formulaire nouvel événement
 * Clic sur case avec évts → panel "Ajouter / Copier un événement"
 * Clic sur événement      → menu contextuel (Ouvrir · Copier · Supprimer)
 * Mode collage actif      → clic sur case = coller
 */
class EventContextMenu {
  constructor(app) {
    this.app = app;
    this.copiedEvent = null;
    this.pasteMode   = false;
  }

  init() {
    // Bouton "+ Nouvel événement" de la topbar
    document.getElementById('newEventBtn').addEventListener('click', () => {
      this.openNewEventForm();
    });

    // Fermer le menu contextuel en cliquant ailleurs
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('eventContextMenu');
      if (!menu.classList.contains('hidden') && !menu.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    // Échap = fermer menus + annuler mode collage
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideContextMenu();
        this.hideDayPanel();
        if (this.pasteMode) this.cancelPasteMode();
      }
    });

    // Boutons du menu contextuel
    document.getElementById('ctxOpenBtn').addEventListener('click',   () => this.ctxOpen());
    document.getElementById('ctxCopyBtn').addEventListener('click',   () => this.ctxCopy());
    document.getElementById('ctxDeleteBtn').addEventListener('click', () => this.ctxDelete());
  }

  // ════════════════════════════════════════════════════════════
  // ENTRÉES PRINCIPALES (appelées par calendarManager)
  // ════════════════════════════════════════════════════════════

  /** Clic sur un événement */
  onEventClick(event, jsEvent) {
    this.hideDayPanel();
    this.showContextMenu(event, jsEvent);
  }

  /** Clic sur une case de date */
  onDateClick(dateStr, dateObj, jsEvent) {
    this.hideContextMenu();

    // Mode collage : coller directement
    if (this.pasteMode && this.copiedEvent) {
      this.pasteOnDate(dateStr);
      return;
    }

    // Trouver les événements sur cette date
    const eventsOnDay = this.getEventsOnDate(dateObj);

    if (eventsOnDay.length === 0) {
      // Case vide → ouvrir formulaire directement
      this.openNewEventForm(dateStr);
    } else {
      // Case avec événements → panel choix
      this.showDayPanel(dateStr, eventsOnDay, jsEvent);
    }
  }

  // ════════════════════════════════════════════════════════════
  // MENU CONTEXTUEL (sur événement)
  // ════════════════════════════════════════════════════════════

  showContextMenu(event, jsEvent) {
    this._ctxEvent = event;
    const menu = document.getElementById('eventContextMenu');
    document.getElementById('ctxEventTitle').textContent = event.title;

    const isManual = !!event.extendedProps.manual;
    document.getElementById('ctxDeleteBtn').style.display = isManual ? 'flex' : 'none';

    menu.classList.remove('hidden');

    // Position
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = jsEvent.clientX + 8, y = jsEvent.clientY + 8;
    menu.style.left = '0'; menu.style.top = '0';   // measure
    requestAnimationFrame(() => {
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      if (x + mw > vw - 8) x = jsEvent.clientX - mw - 8;
      if (y + mh > vh - 8) y = jsEvent.clientY - mh - 8;
      menu.style.left = Math.max(8, x) + 'px';
      menu.style.top  = Math.max(8, y) + 'px';
    });
  }

  hideContextMenu() {
    document.getElementById('eventContextMenu').classList.add('hidden');
    this._ctxEvent = null;
  }

  ctxOpen() {
    const ev = this._ctxEvent;
    this.hideContextMenu();
    if (!ev) return;
    if (ev.extendedProps.manual) {
      this.app.eventEditor.openEdit(ev);
    } else {
      this.app.eventEditor.openView(ev);
    }
  }

  ctxCopy() {
    const ev = this._ctxEvent;
    this.hideContextMenu();
    if (!ev) return;
    this.startCopy(ev);
  }

  ctxDelete() {
    const ev = this._ctxEvent;
    this.hideContextMenu();
    if (!ev) return;
    if (!confirm(`Supprimer "${ev.title}" ?`)) return;
    ev.remove();
    const layer = this.app.layers.find(l => l.id === 'manual');
    if (layer) layer.events = layer.events.filter(e => e.id !== ev.id);
    this.app.renderLayerList();
    this.app.dashboard.update();
  }

  // ════════════════════════════════════════════════════════════
  // PANEL JOUR (case avec événements existants)
  // ════════════════════════════════════════════════════════════

  showDayPanel(dateStr, events, jsEvent) {
    const panel = document.getElementById('dayPanel');
    const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
    document.getElementById('dayPanelDate').textContent = dateLabel;
    document.getElementById('dayPanelAddBtn').onclick = () => {
      this.hideDayPanel();
      this.openNewEventForm(dateStr);
    };

    const list = document.getElementById('dayPanelEventList');
    list.innerHTML = '';
    events.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'day-panel-event';
      const startTime = ev.start ? ev.start.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : '';
      const endTime   = ev.end   ? ev.end.toLocaleTimeString('fr-FR',   {hour:'2-digit', minute:'2-digit'}) : '';
      item.innerHTML = `
        <div class="dpe-color" style="background:${ev.extendedProps.color || ev.backgroundColor}"></div>
        <div class="dpe-info">
          <div class="dpe-title">${ev.title}</div>
          ${startTime ? `<div class="dpe-time">${startTime}${endTime ? ' → ' + endTime : ''}</div>` : ''}
          ${ev.extendedProps.resource ? `<div class="dpe-resource">${ev.extendedProps.resource}</div>` : ''}
        </div>
        <button class="dpe-copy-btn" title="Copier cet événement" onclick="app.contextMenu.startCopyById('${ev.id}')">
          📋 Copier
        </button>
      `;
      list.appendChild(item);
    });

    panel.classList.remove('hidden');

    // Position near click, prefer right side
    const vw = window.innerWidth, vh = window.innerHeight;
    panel.style.left = '0'; panel.style.top = '0';
    requestAnimationFrame(() => {
      const pw = panel.offsetWidth || 300, ph = panel.offsetHeight || 250;
      let x = jsEvent.clientX + 10, y = jsEvent.clientY + 10;
      if (x + pw > vw - 8) x = jsEvent.clientX - pw - 10;
      if (y + ph > vh - 8) y = jsEvent.clientY - ph - 10;
      panel.style.left = Math.max(8, x) + 'px';
      panel.style.top  = Math.max(8, y) + 'px';
    });
  }

  hideDayPanel() {
    document.getElementById('dayPanel').classList.add('hidden');
  }

  // ════════════════════════════════════════════════════════════
  // COPIER / COLLER
  // ════════════════════════════════════════════════════════════

  startCopyById(eventId) {
    this.hideDayPanel();
    const ev = this.app.calendarManager.calendar.getEventById(eventId);
    if (ev) this.startCopy(ev);
  }

  startCopy(event) {
    const start = event.start;
    const end   = event.end || new Date(start.getTime() + 3600000);
    this.copiedEvent = {
      title:       event.title,
      duration:    end - start,
      startHour:   start.getHours(),
      startMin:    start.getMinutes(),
      color:       event.extendedProps.color || event.backgroundColor || '#6c8cf5',
      category:    event.extendedProps.category    || '',
      resource:    event.extendedProps.resource    || '',
      description: event.extendedProps.description || '',
      allDay:      event.allDay,
    };
    this.pasteMode = true;

    document.getElementById('pmb-title').textContent = event.title;
    document.getElementById('pasteModeBar').classList.remove('hidden');
    document.getElementById('calendarWrapper').classList.add('paste-mode-active');
    this.showToast(`"${event.title}" copié — cliquez sur une date pour coller`);
  }

  pasteOnDate(dateStr) {
    if (!this.copiedEvent) return;
    const c = this.copiedEvent;
    const base = new Date(dateStr + 'T00:00:00');
    const start = new Date(base);
    start.setHours(c.startHour, c.startMin, 0, 0);
    const end = new Date(start.getTime() + c.duration);

    const color = c.color;
    const textColor = this.getContrastColor(color);
    const eventId = 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);

    this.app.calendarManager.calendar.addEvent({
      id: eventId,
      title: c.title,
      start: start.toISOString(),
      end:   end.toISOString(),
      backgroundColor: color,
      borderColor:     color,
      textColor,
      extendedProps: {
        fileId:'manual', filename:'Saisie manuelle',
        color, manual:true,
        category:    c.category,
        resource:    c.resource,
        description: c.description,
      }
    });

    this.app.eventEditor.ensureManualLayer();
    const layer = this.app.layers.find(l => l.id === 'manual');
    if (layer) { layer.events.push({ id: eventId }); this.app.renderLayerList(); }
    this.app.dashboard.update();

    const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
    this.showToast(`Collé le ${label} — cliquez encore pour coller ailleurs`);
  }

  cancelPasteMode() {
    this.pasteMode = false;
    this.copiedEvent = null;
    document.getElementById('pasteModeBar').classList.add('hidden');
    document.getElementById('calendarWrapper').classList.remove('paste-mode-active');
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  openNewEventForm(dateStr) {
    this.hideDayPanel();
    this.app.eventEditor.open(null, dateStr || null);
  }

  getEventsOnDate(dateObj) {
    const cal = this.app.calendarManager.calendar;
    const dayStart = new Date(dateObj); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(dateObj); dayEnd.setHours(23,59,59,999);
    return cal.getEvents().filter(ev => {
      if (ev.display === 'none') return false;
      const s = ev.start;
      const e = ev.end || new Date(s.getTime() + 60000);
      return s <= dayEnd && e >= dayStart;
    });
  }

  showToast(msg) {
    let t = document.getElementById('planvizToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'planvizToast';
      t.className = 'pv-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  getContrastColor(hex) {
    try {
      const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      return (0.299*r+0.587*g+0.114*b)/255 > 0.5 ? '#1a1a2e' : '#ffffff';
    } catch { return '#ffffff'; }
  }
}

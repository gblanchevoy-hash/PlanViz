/**
 * calendarManager.js v3 — source unique de vérité pour les clics calendrier
 */
class CalendarManager {
  constructor(app) {
    this.app = app;
    this.calendar = null;
    this.currentView = 'dayGridMonth';
  }

  init() {
    const el = document.getElementById('calendar');

    this.calendar = new FullCalendar.Calendar(el, {
      initialView: this.currentView,
      locale: 'fr',
      firstDay: 1,
      height: '100%',
      nowIndicator: true,
      dayMaxEvents: false,
      eventMaxStack: 999,
      slotMinTime: '06:00:00',
      slotMaxTime: '22:00:00',
      slotDuration: '00:30:00',
      expandRows: true,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: ''
      },
      views: {
        dayGridFourWeek: {
          type: 'dayGrid',
          duration: { weeks: 13 },
          buttonText: 'Trimestre'
        }
      },
      eventDidMount:   (info) => this.onEventMount(info),
      eventMouseEnter: (info) => this.onEventHover(info, true),
      eventMouseLeave: (info) => this.onEventHover(info, false),
      datesSet:        ()     => this.app.dashboard && this.app.dashboard.update(),

      // ── SEUL gestionnaire de clic sur événement ──
      eventClick: (info) => {
        info.jsEvent.preventDefault();
        info.jsEvent.stopPropagation();
        // Délégué au contextMenu dès qu'il est prêt
        if (this.app.contextMenu) {
          this.app.contextMenu.onEventClick(info.event, info.jsEvent);
        }
      },

      // ── SEUL gestionnaire de clic sur date ──
      dateClick: (info) => {
        if (this.app.contextMenu) {
          this.app.contextMenu.onDateClick(info.dateStr, info.date, info.jsEvent);
        }
      }
    });

    this.calendar.render();
    this.setupViewButtons();
  }

  setupViewButtons() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.calendar.changeView(btn.dataset.view);
        this.currentView = btn.dataset.view;
      });
    });
  }

  addEvents(events) {
    events.forEach(ev => this.calendar.addEvent(ev));
  }

  removeLayerEvents(fileId) {
    this.calendar.getEvents()
      .filter(ev => ev.extendedProps.fileId === fileId)
      .forEach(ev => ev.remove());
  }

  updateLayerColor(fileId, color) {
    this.calendar.getEvents()
      .filter(ev => ev.extendedProps.fileId === fileId)
      .forEach(ev => {
        ev.setProp('backgroundColor', color);
        ev.setProp('borderColor', color);
        ev.setExtendedProp('color', color);
      });
  }

  toggleLayerVisibility(fileId, visible) {
    this.calendar.getEvents()
      .filter(ev => ev.extendedProps.fileId === fileId)
      .forEach(ev => ev.setProp('display', visible ? 'auto' : 'none'));
  }

  getAllEvents()     { return this.calendar.getEvents(); }
  getVisibleEvents() { return this.calendar.getEvents().filter(ev => ev.display !== 'none'); }

  onEventMount(info) {
    const { resource } = info.event.extendedProps;
    if (resource) {
      const titleEl = info.el.querySelector('.fc-event-title');
      if (titleEl) {
        const badge = document.createElement('span');
        badge.style.cssText = 'opacity:0.65;font-size:9px;margin-left:4px;';
        badge.textContent = resource.substring(0, 10);
        titleEl.appendChild(badge);
      }
    }
  }

  onEventHover(info, entering) {
    const tooltip = document.getElementById('eventTooltip');
    if (!entering) { tooltip.classList.add('hidden'); return; }

    const ev = info.event;
    const props = ev.extendedProps;
    const fmt = (d) => d ? d.toLocaleString('fr-FR', { day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit' }) : '—';

    tooltip.innerHTML = `
      <div class="tooltip-title">
        <span class="tooltip-color" style="background:${props.color || ev.backgroundColor}"></span>
        ${ev.title}
      </div>
      ${[['Source', props.filename],['Début', fmt(ev.start)],['Fin', fmt(ev.end)],
         ['Catégorie', props.category],['Ressource', props.resource],
         ['Note', props.description ? props.description.substring(0,80) : null]]
        .filter(r => r[1]).map(r => `
        <div class="tooltip-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}
    `;
    tooltip.classList.remove('hidden');

    const r = info.el.getBoundingClientRect();
    let left = r.right + 8, top = r.top;
    if (left + 280 > window.innerWidth) left = r.left - 288;
    if (top + 160 > window.innerHeight) top = window.innerHeight - 160;
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top  = Math.max(8, top)  + 'px';
  }

  applyColorMode(mode, layers) {
    const allEvents = this.calendar.getEvents();
    if (mode === 'file') {
      allEvents.forEach(ev => {
        const layer = layers.find(l => l.id === ev.extendedProps.fileId);
        if (layer) { ev.setProp('backgroundColor', layer.color); ev.setProp('borderColor', layer.color); }
      });
    } else if (mode === 'category') {
      allEvents.forEach(ev => {
        const color = this.app.colorManager.colorForString(ev.extendedProps.category || ev.title);
        ev.setProp('backgroundColor', color); ev.setProp('borderColor', color);
      });
    } else if (mode === 'keyword') {
      const kw = this.app.colorManager.keywordColors;
      allEvents.forEach(ev => {
        const hay = (ev.title + ' ' + (ev.extendedProps.category || '')).toLowerCase();
        let color = ev.extendedProps.color;
        for (const [k, c] of Object.entries(kw)) { if (hay.includes(k.toLowerCase())) { color = c; break; } }
        ev.setProp('backgroundColor', color); ev.setProp('borderColor', color);
      });
    }
  }

  detectConflicts(layers) {
    const conflicts = [];
    const events = this.calendar.getEvents()
      .filter(ev => ev.display !== 'none')
      .map(ev => ({ id:ev.id, title:ev.title, start:ev.start, end:ev.end||new Date(ev.start.getTime()+3600000), fileId:ev.extendedProps.fileId, resource:ev.extendedProps.resource }))
      .sort((a,b) => a.start - b.start);
    for (let i = 0; i < events.length; i++) {
      for (let j = i+1; j < events.length; j++) {
        const a = events[i], b = events[j];
        if (b.start >= a.end) break;
        if (a.resource && b.resource && a.resource === b.resource)
          conflicts.push({ label:`Conflit ressource: ${a.resource}`, events:[a,b] });
        else if (a.fileId !== b.fileId)
          conflicts.push({ label:'Chevauchement entre fichiers', events:[a,b] });
      }
    }
    return conflicts;
  }

  applyFilters(filters, layers) {
    const { search, categories, dateFrom, dateTo } = filters;
    const visibleFiles = layers.filter(l => l.visible).map(l => l.id);
    this.calendar.getEvents().forEach(ev => {
      const p = ev.extendedProps;
      let v = visibleFiles.includes(p.fileId);
      if (v && search) {
        const q = search.toLowerCase();
        v = (ev.title + ' ' + (p.category||'') + ' ' + (p.resource||'')).toLowerCase().includes(q);
      }
      if (v && categories.size > 0) v = categories.has(p.category);
      if (v && dateFrom && ev.start < dateFrom) v = false;
      if (v && dateTo   && ev.start > dateTo)   v = false;
      ev.setProp('display', v ? 'auto' : 'none');
    });
  }

  goToDate(date) { this.calendar.gotoDate(date); }
}

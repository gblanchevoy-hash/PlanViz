// PlanViz — main.js v5
// Fixes: Excel serial dates, per-file colors, French holidays, two import formats

// ── JOURS FÉRIÉS FRANCE 2025-2030 ──────────────────────────
const FERIES = new Set(["2025-01-01","2025-04-21","2025-05-01","2025-05-08","2025-05-29","2025-06-09","2025-07-14","2025-08-15","2025-11-01","2025-11-11","2025-12-25","2026-01-01","2026-04-06","2026-05-01","2026-05-08","2026-05-14","2026-05-25","2026-07-14","2026-08-15","2026-11-01","2026-11-11","2026-12-25","2027-01-01","2027-03-29","2027-05-01","2027-05-06","2027-05-08","2027-05-17","2027-07-14","2027-08-15","2027-11-01","2027-11-11","2027-12-25","2028-01-01","2028-04-17","2028-05-01","2028-05-08","2028-05-25","2028-06-05","2028-07-14","2028-08-15","2028-11-01","2028-11-11","2028-12-25","2029-01-01","2029-04-02","2029-05-01","2029-05-08","2029-05-10","2029-05-21","2029-07-14","2029-08-15","2029-11-01","2029-11-11","2029-12-25","2030-01-01","2030-04-22","2030-05-01","2030-05-08","2030-05-30","2030-06-10","2030-07-14","2030-08-15","2030-11-01","2030-11-11","2030-12-25"]); // 66 jours fériés France 2025-2030 (corrigé)

// ── ÉTAT ────────────────────────────────────────────────────
const S = {
  layers:[], calendar:null, charts:{},
  selectedColor:'#5b8af5', dateRowCount:0,
  editingId:null, viewMode:false,
  clipboard:null, pasteMode:false,
  moveMode:false, moveEvent:null,   // déplacement d'un event
  periodFrom:null, periodTo:null,   // filtre période actif
  eraserMode:false,
  pendingRows:null, pendingFile:null, pendingHeaders:null,
  activeCategories:new Set(), allCategories:new Set(),
  fileColorIndex: 0,
  undoStack:[], // [{type,data}] — pile des actions annulables
};

// Une couleur distincte par fichier importé — tous les événements d'un fichier = même couleur
const FILE_PALETTE = [
  '#5b8af5', // bleu
  '#f5a023', // orange
  '#e05f92', // rose
  '#3db87a', // vert
  '#9b6cf5', // violet
  '#22b8d4', // cyan
  '#f05656', // rouge
  '#f5c842', // jaune
  '#e8693a', // orange foncé
  '#45c9b5', // turquoise
  '#7055e8', // indigo
  '#27c4a0', // émeraude
];
const BASE_PALETTE = FILE_PALETTE; // alias pour les graphiques

// Retourne la couleur du fichier selon son index dans la liste des couches importées
function getFileColor(fileIndex) {
  return FILE_PALETTE[fileIndex % FILE_PALETTE.length];
}

// Rétrocompat (non utilisé pour les couleurs, gardé pour ne pas casser)
function getFileColors(fileIndex) {
  const c = getFileColor(fileIndex);
  return { 'Cours':c,'Stage':c,'Employeur':c,'Fermeture':c,'TPG':c,'API':c };
}

const FIELD_LABELS = {
  startDate:'Date de début ★', endDate:'Date de fin',
  startTime:'Heure de début', endTime:'Heure de fin',
  title:'Nom de la tâche', category:'Catégorie',
  resource:'Ressource', description:'Description'
};

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initCalendar();
  initSidebar();
  initTheme();
  initDropZone();
  initFilters();
  initSwatches();
  document.getElementById('newEvtBtn').onclick  = () => openEventModal();
  document.getElementById('addDateBtn').onclick = () => addDateRow();
  document.getElementById('dashBtn').onclick    = () => toggleDash();
  document.getElementById('conflictBtn').onclick = showConflicts;
  document.getElementById('eraserBtn').onclick   = () => toggleEraser();
  document.getElementById('copyToolBtn').onclick  = () => toggleCopyMode();
  document.getElementById('moveToolBtn').onclick  = () => toggleMoveMode();
  document.getElementById('undoBtn').onclick      = () => undoLast();
  document.getElementById('filterApplyBtn').onclick = () => applyPeriodFilter();
  document.getElementById('filterClearBtn').onclick = () => clearPeriodFilter();
  document.getElementById('saveBtn').onclick    = () => saveProject();
  document.getElementById('loadBtn').onclick    = () => document.getElementById('loadFileInput').click();
  document.getElementById('loadFileInput').onchange = e => { loadProject(e.target.files[0]); e.target.value=''; };
  document.addEventListener('click', closeCtxOutside);
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') { closeCtx(); if (S.pasteMode) cancelPaste(); if (S.eraserMode) app_cancelEraser(); if (S.moveMode) cancelMove(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='z') { e.preventDefault(); undoLast(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='c') { /* handled via context menu */ }
  });
  updateUndoBtn();
});

// ═══════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════
function initCalendar() {
  S.calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView:'dayGridMonth', locale:'fr', firstDay:1,
    height:'100%', nowIndicator:true, dayMaxEvents:false, expandRows:true,
    headerToolbar:{ left:'prev,next today', center:'title', right:'' },
    buttonText:{ today:"Aujourd'hui" },
    views:{
      dayGridFourWeek:{ type:'dayGrid', duration:{weeks:13} },
      multiMonthYear:{
        multiMonthMaxColumns: 3,
        multiMonthMinWidth: 200,
        dayMaxEvents: false,
        eventMaxStack: 999,
      }
    },

    // Afficher les jours fériés dans les cellules
    dayCellDidMount: (info) => {
      // info.date est en heure locale pour les vues allDay → utiliser getFullYear/Month/Date
      const d = info.date;
      const dateStr = d.getFullYear() + '-' +
        String(d.getMonth()+1).padStart(2,'0') + '-' +
        String(d.getDate()).padStart(2,'0');
      if (FERIES.has(dateStr)) {
        const badge = document.createElement('span');
        badge.className = 'ferie-badge';
        badge.textContent = 'F';
        badge.title = 'Jour férié';
        info.el.style.position = 'relative';
        info.el.appendChild(badge);
      }
    },

    eventClick: (info) => {
      info.jsEvent.preventDefault(); info.jsEvent.stopPropagation();

      // ── Mode GOMME : supprimer l'événement cliqué ──
      if (S.eraserMode) {
        pushUndo('delete', snapshotEvent(info.event));
        doDeleteEvent(info.event);
        return;
      }

      // ── Mode COPIE (attente de sélection) : copier cet événement ──
      if (S.pasteMode && !S.clipboard) {
        startCopy(info.event);
        return;
      }

      // ── Mode DÉPLACEMENT ──
      if (S.moveMode) {
        if (!S.moveEvent) {
          // Phase 1 : sélectionner l'event à déplacer
          startMove(info.event);
          return;
        } else {
          // Phase 2 : coller sur la date de l'event cliqué
          let el2 = info.el; let dateStr2 = null;
          while (el2 && !dateStr2) { dateStr2 = el2.getAttribute('data-date'); el2 = el2.parentElement; }
          if (!dateStr2 && info.event.start) {
            const s = info.event.start;
            dateStr2 = s.getFullYear() + '-' + String(s.getMonth()+1).padStart(2,'0') + '-' + String(s.getDate()).padStart(2,'0');
          }
          if (dateStr2) moveEventTo(dateStr2);
          return;
        }
      }

      // ── Mode COLLAGE actif : coller sur la date du jour cliqué ──
      if (S.pasteMode && S.clipboard) {
        // Chercher la cellule de jour parente dans le DOM pour lire data-date
        let el = info.el;
        let dateStr = null;
        while (el && !dateStr) {
          dateStr = el.getAttribute('data-date');
          el = el.parentElement;
        }
        // Fallback : lire depuis event.start en local
        if (!dateStr && info.event.start) {
          const s = info.event.start;
          dateStr = s.getFullYear() + '-' +
            String(s.getMonth()+1).padStart(2,'0') + '-' +
            String(s.getDate()).padStart(2,'0');
        }
        if (dateStr) pasteOnDate(dateStr);
        return;
      }

      // ── Normal : menu contextuel ──
      showCtx(info.event, info.jsEvent);
    },

    dateClick: (info) => {
      // Mode déplacement : déplacer l'event sur cette date
      if (S.moveMode && S.moveEvent) {
        moveEventTo(info.dateStr);
        return;
      }
      if (S.pasteMode && S.clipboard) {
        pasteOnDate(info.dateStr);
        return;
      }
      openEventModal(null, info.dateStr);
    },

    eventMouseEnter: (info) => showTooltip(info),
    eventMouseLeave: ()     => hideTooltip(),
    datesSet:        ()     => { if (!document.getElementById('dash').classList.contains('hide')) updateDash(); },
  });
  S.calendar.render();

  document.querySelectorAll('.vbtn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.vbtn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      S.calendar.changeView(btn.dataset.view);
    };
  });
}

// ═══════════════════════════════════════════════════════════
// CONTEXT MENU
// ═══════════════════════════════════════════════════════════
let _ctxEv = null;

function showCtx(event, jsEvent) {
  _ctxEv = event;
  const menu = document.getElementById('ctxMenu');
  document.getElementById('ctxTitle').textContent = event.title;
  document.getElementById('ctxDel').style.display = 'flex'; // Supprimer disponible pour tous
  menu.classList.remove('hide');
  menu.style.left = '-9999px'; menu.style.top = '-9999px';

  document.getElementById('ctxRename').onclick = (e) => { e.stopPropagation(); const ev=_ctxEv; const pos={clientX:jsEvent.clientX,clientY:jsEvent.clientY}; closeCtx(); if(ev) openRenamePopup(ev, pos); };
  document.getElementById('ctxMove').onclick   = () => { const ev=_ctxEv; closeCtx(); if(ev) startMove(ev); };
  document.getElementById('ctxOpen').onclick   = () => { const ev=_ctxEv; closeCtx(); if(ev) ev.extendedProps.manual?openEventModal(ev):openViewModal(ev); };
  document.getElementById('ctxCopy').onclick   = () => { const ev=_ctxEv; closeCtx(); if(ev) startCopy(ev); };
  document.getElementById('ctxDel').onclick    = () => { const ev=_ctxEv; closeCtx(); if(ev) deleteEvent(ev); };

  requestAnimationFrame(() => {
    const vw=window.innerWidth, vh=window.innerHeight;
    const mw=menu.offsetWidth||210, mh=menu.offsetHeight||160;
    let x=jsEvent.clientX+8, y=jsEvent.clientY+8;
    if(x+mw>vw-8) x=jsEvent.clientX-mw-8;
    if(y+mh>vh-8) y=jsEvent.clientY-mh-8;
    menu.style.left=Math.max(8,x)+'px'; menu.style.top=Math.max(8,y)+'px';
  });
}

function closeCtx() { document.getElementById('ctxMenu').classList.add('hide'); _ctxEv=null; }
function closeCtxOutside(e) {
  const m=document.getElementById('ctxMenu');
  if(!m.classList.contains('hide')&&!m.contains(e.target)) closeCtx();
  const rp=document.getElementById('renamePopup');
  if(rp&&!rp.classList.contains('hide')&&!rp.contains(e.target)) closeRenamePopup();
}

// ── RENOMMAGE INLINE ──────────────────────────────────────
let _renameEv = null;

function openRenamePopup(event, pos) {  // pos = {clientX, clientY}
  _renameEv = event;
  const popup = document.getElementById('renamePopup');
  const input = document.getElementById('renameInput');
  const okBtn = document.getElementById('renameOk');

  input.value = event.title;

  // Wirer les handlers directement (pas de DOMContentLoaded)
  okBtn.onclick = commitRename;
  input.onkeydown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') { closeRenamePopup(); }
  };

  popup.classList.remove('hide');

  // Positionner sous le clic
  const vw = window.innerWidth, vh = window.innerHeight;
  const pw = 240;
  let x = (pos.clientX||0) - pw/2;
  let y = (pos.clientY||0) + 12;
  if (x < 8) x = 8;
  if (x + pw > vw - 8) x = vw - pw - 8;
  if (y + 48 > vh - 8) y = (pos.clientY||0) - 56;
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';

  setTimeout(() => { input.focus(); input.select(); }, 30);
}

function closeRenamePopup() {
  document.getElementById('renamePopup').classList.add('hide');
  _renameEv = null;
}

function commitRename() {
  if (!_renameEv) return;
  const newTitle = document.getElementById('renameInput').value.trim();
  if (!newTitle) { closeRenamePopup(); return; }
  if (newTitle === _renameEv.title) { closeRenamePopup(); return; }
  // Sauvegarder ancien titre pour undo
  const oldTitle = _renameEv.title;
  const evId = _renameEv.id;
  pushUndo('rename', { id: evId, oldTitle, newTitle });
  _renameEv.setProp('title', newTitle);
  toast('Titre renommé en "' + newTitle + '"');
  closeRenamePopup();
}

function deleteEvent(ev) {
  if(!confirm(`Supprimer "${ev.title}" ?`)) return;
  pushUndo('delete', snapshotEvent(ev));
  doDeleteEvent(ev);
}

function doDeleteEvent(ev) {
  const evId   = ev.id;
  const fileId = ev.extendedProps.fileId;
  ev.remove();
  const layer = S.layers.find(l => l.id === fileId);
  if (layer) {
    layer.events = layer.events.filter(e => e.id !== evId);
    if (layer.events.length === 0) {
      S.layers = S.layers.filter(l => l.id !== fileId);
      updateBadge();
    }
  }
  renderLayers(); updateDashIfOpen();
  toast('Événement supprimé — ↩ pour annuler');
}

function snapshotEvent(ev) {
  return {
    id: ev.id,
    title: ev.title,
    start: ev.allDay ? fcDateToStr(ev.start) : ev.start.toISOString(),
    end:   ev.end ? (ev.allDay ? fcDateToStr(ev.end) : ev.end.toISOString()) : null,
    allDay: ev.allDay,
    backgroundColor: ev.backgroundColor,
    borderColor: ev.borderColor,
    textColor: ev.textColor,
    extendedProps: { ...ev.extendedProps }
  };
}

// ═══════════════════════════════════════════════════════════
// COPIER / COLLER — réécrit de zéro
// ═══════════════════════════════════════════════════════════

// S.clipboard : données de l'événement copié (null = rien)
// S.pasteMode : true = on attend des clics pour coller

function startCopy(event) {
  const start = event.start || new Date();
  const end   = event.end   || new Date(start.getTime() + 86400000);

  S.clipboard = {
    title:         event.title,
    allDay:        event.allDay,
    duration:      end.getTime() - start.getTime(),
    startHour:     start.getHours(),
    startMin:      start.getMinutes(),
    color:         event.extendedProps.color || event.backgroundColor || '#5b8af5',
    category:      event.extendedProps.category    || '',
    resource:      event.extendedProps.resource    || '',
    description:   event.extendedProps.description || '',
    sourceLayerId: event.extendedProps.fileId || null,
    layerName:     event.extendedProps.filename   || 'Saisie collée',
  };
  S.pasteMode = true;

  const bar  = document.getElementById('pastebar');
  const name = document.getElementById('pb-name');
  if (bar)  bar.classList.remove('hide');
  if (name) name.textContent = event.title;
  document.getElementById('calWrap').classList.add('cal-paste-mode');
  document.getElementById('copyToolBtn')?.classList.add('active');

  toast('"' + event.title + '" copié — cliquez sur les dates pour coller · Échap pour terminer');
}

function cancelPaste() {
  S.pasteMode = false;
  S.clipboard = null;
  const bar = document.getElementById('pastebar');
  if (bar) bar.classList.add('hide');
  document.getElementById('calWrap').classList.remove('cal-paste-mode');
  document.getElementById('copyToolBtn')?.classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// DÉPLACER UN ÉVÉNEMENT
// ═══════════════════════════════════════════════════════════

function toggleMoveMode() {
  if (S.moveMode) {
    cancelMove();
  } else {
    if (S.pasteMode) cancelPaste();
    if (S.eraserMode) app_cancelEraser();
    // Activer l'attente : prochain clic sur un event = déplacer
    S.moveMode  = true;
    S.moveEvent = null;
    document.getElementById('moveToolBtn').classList.add('active');
    document.getElementById('moveBar').classList.remove('hide');
    document.getElementById('moveBarName').textContent = '…';
    document.getElementById('calWrap').classList.add('cal-paste-mode');
    toast('↗ Cliquez sur l\'événement à déplacer');
  }
}

function startMove(event) {
  if (S.pasteMode) cancelPaste();
  if (S.eraserMode) app_cancelEraser();

  S.moveMode  = true;
  S.moveEvent = event;
  document.getElementById('moveToolBtn')?.classList.add('active');
  document.getElementById('moveBarName').textContent = event.title;
  document.getElementById('moveBar').classList.remove('hide');
  document.getElementById('calWrap').classList.add('cal-paste-mode');

  toast('↗ "' + event.title + '" — cliquez sur la date de destination');
}

function cancelMove() {
  S.moveMode  = false;
  S.moveEvent = null;
  document.getElementById('moveBar').classList.add('hide');
  document.getElementById('calWrap').classList.remove('cal-paste-mode');
  document.getElementById('moveToolBtn')?.classList.remove('active');
}

function moveEventTo(dateStr) {
  const ev = S.moveEvent;
  if (!ev || !dateStr) { cancelMove(); return; }

  pushUndo('edit', snapshotEvent(ev));

  // Décomposer la date cible en composantes locales
  const [ty, tm, td] = dateStr.split('-').map(Number);

  if (ev.allDay) {
    // Calculer la durée en jours (origEnd est exclusive donc durée = end - start en jours)
    const origStart = ev.start;
    const origEnd   = ev.end || new Date(origStart.getTime() + 86400000);
    const durationDays = Math.round((origEnd - origStart) / 86400000);

    // Construire les nouvelles dates avec Date LOCAL (évite le décalage UTC)
    // setDates() atomique : évite les recalculs intermédiaires de FullCalendar
    const newStart = new Date(ty, tm-1, td);
    const newEnd   = new Date(ty, tm-1, td + durationDays); // fin exclusive

    ev.setDates(newStart, newEnd, { allDay: true });
  } else {
    // Avec heure : conserver durée en ms et heures d'origine
    const origStart  = ev.start;
    const origEnd    = ev.end || new Date(origStart.getTime() + 3600000);
    const durationMs = origEnd - origStart;

    const newStart = new Date(ty, tm-1, td,
      origStart.getHours(), origStart.getMinutes(), 0, 0);
    const newEnd   = new Date(newStart.getTime() + durationMs);

    ev.setDates(newStart, newEnd, { allDay: false });
  }

  const label = new Date(ty, tm-1, td).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
  toast('"' + ev.title + '" déplacé au ' + label + ' — ↩ pour annuler');
  cancelMove();
}

// Appelée avec une chaîne YYYY-MM-DD
function pasteOnDate(dateStr) {
  const c = S.clipboard;
  if (!c || !dateStr) return;

  // Construire start/end en LOCAL pur — jamais d'ISO string UTC
  const parts = dateStr.split('-').map(Number);  // [2026, 9, 11]
  const y = parts[0], mo = parts[1]-1, d = parts[2];

  let startStr, endStr;
  if (c.allDay) {
    const durDays = Math.max(1, Math.round(c.duration / 86400000));
    startStr = dateStr;
    const eDate = new Date(y, mo, d + durDays);
    endStr = eDate.getFullYear() + '-' +
             String(eDate.getMonth()+1).padStart(2,'0') + '-' +
             String(eDate.getDate()).padStart(2,'0');
  } else {
    const s = new Date(y, mo, d, c.startHour, c.startMin, 0, 0);
    const e = new Date(s.getTime() + c.duration);
    startStr = s.toISOString();
    endStr   = e.toISOString();
  }

  const id = 'manual_cp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const color = c.color;
  const tc    = getContrast(color);

  // Trouver la couche source de l'événement copié (pour coller dans la même couche)
  const srcLayer = S.layers.find(l => l.id === c.sourceLayerId) ||
                   getOrCreateManualLayer(c.layerName || 'Saisie collée', color);

  // Ajouter l'événement au calendrier
  S.calendar.addEvent({
    id, title: c.title,
    start: startStr, end: endStr, allDay: c.allDay,
    backgroundColor: srcLayer.color, borderColor: srcLayer.color, textColor: getContrast(srcLayer.color),
    extendedProps: {
      fileId: srcLayer.id, filename: srcLayer.name,
      color: srcLayer.color, manual: true,
      category: c.category, resource: c.resource, description: c.description
    }
  });

  // Mettre à jour la couche
  srcLayer.events.push({ id });
  renderLayers();
  updateDashIfOpen();

  // Undo
  pushUndo('add', { id });

  const label = new Date(y, mo, d).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
  toast('✓ Collé le ' + label + ' — continuez à cliquer pour coller ailleurs');
  // Le mode collage reste actif !
}

// ═══════════════════════════════════════════════════════════
// EVENT MODAL
// ═══════════════════════════════════════════════════════════
// Extrait une date YYYY-MM-DD depuis un objet Date FullCalendar sans décalage
// isEndExclusive=true : pour allDay, FullCalendar stocke end = lendemain → retire 1 jour
function eventDateStr(date, allDay, isEndExclusive) {
  if (!date) return '';
  // Utiliser getFullYear/Month/Date (LOCAL) — FullCalendar normalise les allDay en local
  let y = date.getFullYear();
  let m = date.getMonth();
  let d = date.getDate();
  if (allDay && isEndExclusive) {
    // end exclusive : soustraire 1 jour
    const prev = new Date(y, m, d - 1);
    y = prev.getFullYear(); m = prev.getMonth(); d = prev.getDate();
  }
  return y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}

function openEventModal(event=null, prefillDate=null) {
  S.viewMode=false; S.editingId=null; S.dateRowCount=0; setRO(false);
  document.getElementById('mEvtTitle').textContent=event?'Modifier':'Nouvel événement';
  document.getElementById('mEvtSub').textContent='';
  document.getElementById('evTitle').value=event?.title||'';
  document.getElementById('evCat').value=event?.extendedProps.category||'';
  document.getElementById('evRes').value=event?.extendedProps.resource||'';
  document.getElementById('evDesc').value=event?.extendedProps.description||'';
  document.getElementById('evDelBtn').classList.toggle('hide',!event);
  document.getElementById('evSaveBtn').textContent='Enregistrer';
  document.getElementById('evSaveBtn').onclick=saveEvent;
  document.getElementById('addDateBtn').style.display='';
  const color=event?.extendedProps.color||BASE_PALETTE[0];
  S.selectedColor=color; document.getElementById('evColor').value=color;
  rebuildSwatches(); setColorUI(color);
  document.getElementById('dateRows').innerHTML='';
  // Pré-remplir le champ "Nom de la couche"
  const layerNameEl = document.getElementById('evLayerName');
  if (layerNameEl) {
    if (event) {
      // En édition : nom de la couche existante
      const existingLayer = S.layers.find(l => l.id === event.extendedProps.fileId);
      layerNameEl.value = existingLayer?.name || '';
    } else {
      layerNameEl.value = '';
    }
    layerNameEl.readOnly = false;
  }
  if(event){ S.editingId=event.id;
    // Extraire les dates pour le formulaire sans décalage timezone
    const sd = eventDateStr(event.start, event.allDay, false);
    const ed = eventDateStr(event.end || event.start, event.allDay, true);  // true = end exclusive → -1j
    const st = event.allDay ? '' : (event.start?.toTimeString().slice(0,5)||'09:00');
    const et = event.allDay ? '' : (event.end?.toTimeString().slice(0,5)||'10:00');
    addDateRow(sd, st, ed, et);
  } else { addDateRow(prefillDate||dateToStr(new Date())); }
  document.getElementById('modalEvent').classList.remove('hide');
  setTimeout(()=>document.getElementById('evTitle').focus(),80);
}

// openViewModal remplacé par openEventModal (édition complète pour tous)
function openViewModal(event) { openEventModal(event); }

function closeEventModal() {
  document.getElementById('modalEvent').classList.add('hide');
  setRO(false);
  S.editingId = null;
  S.viewMode  = false;
  S.dateRowCount = 0;
  document.getElementById('evSaveBtn').textContent = 'Enregistrer';
  document.getElementById('evSaveBtn').onclick = saveEvent;
  // Restaurer le bouton Annuler
  const cancelBtn = document.querySelector('#modalEvent .btn-ghost:not(#evDelBtn)');
  if (cancelBtn) { cancelBtn.style.display = ''; cancelBtn.onclick = closeEventModal; }
}

function setRO(on) { ['evTitle','evCat','evRes','evDesc','evLayerName'].forEach(id=>{const el=document.getElementById(id);if(el)el.readOnly=on;}); }

// Crée ou retrouve une couche manuelle par son nom
// Chaque nom distinct = couche distincte avec sa propre couleur
function getOrCreateManualLayer(name, color) {
  const safeName = name || 'Saisie manuelle';
  // Chercher une couche manuelle existante avec ce nom exact
  const existing = S.layers.find(l => l.manual && l.name === safeName);
  if (existing) return existing;
  // Sinon créer une nouvelle couche avec une couleur unique
  const usedColors = S.layers.map(l => l.color);
  const layerColor = color || FILE_PALETTE.find(c => !usedColors.includes(c)) || FILE_PALETTE[S.layers.length % FILE_PALETTE.length];
  const id = 'manual_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const layer = { id, name: safeName, color: layerColor, events: [], visible: true, manual: true };
  S.layers.push(layer);
  renderLayers(); updateBadge();
  return layer;
}

// Rétrocompat : appelée par le code undo
function ensureManualLayer(color) {
  getOrCreateManualLayer('Saisie manuelle', color);
}

function saveEvent() {
  if (S.viewMode) { closeEventModal(); return; }

  const title = document.getElementById('evTitle').value.trim();
  if (!title) {
    const el = document.getElementById('evTitle');
    el.style.outline = '2px solid var(--danger)';
    setTimeout(() => el.style.outline = '', 1500);
    el.focus(); return;
  }

  const layerName = document.getElementById('evLayerName')?.value.trim() || '';
  const cat   = document.getElementById('evCat').value.trim();
  const res   = document.getElementById('evRes').value.trim();
  const desc  = document.getElementById('evDesc').value.trim();
  const color = S.selectedColor;

  // Collecter les dates
  const entries = [];
  document.querySelectorAll('.date-row').forEach(row => {
    const rid = row.id.replace('dateRow_','');
    const sd = document.getElementById(`dr_sd_${rid}`)?.value; if (!sd) return;
    const st = document.getElementById(`dr_st_${rid}`)?.value || '';
    const ed = document.getElementById(`dr_ed_${rid}`)?.value || sd;
    const et = document.getElementById(`dr_et_${rid}`)?.value || '';
    let start, end, allDay;
    if (st) {
      start  = new Date(`${sd}T${st}:00`);
      end    = et ? new Date(`${ed}T${et}:00`) : new Date(start.getTime() + 3600000);
      allDay = false;
      if (end <= start) end = new Date(start.getTime() + 3600000);
    } else {
      start = sd; end = ed; allDay = true;
    }
    if (isNaN(new Date(start))) return;
    entries.push({ start, end, allDay });
  });

  if (!entries.length) { alert('Veuillez renseigner au moins une date.'); return; }

  // ── CAS 1 : ÉDITION d'un événement existant (importé ou manuel) ──
  if (S.editingId) {
    const existing = S.calendar.getEventById(S.editingId);
    if (existing) {
      // Sauvegarder l'état complet AVANT modification pour l'undo
      pushUndo('edit', snapshotEvent(existing));
      // Mettre à jour sur place — conserve la couche d'origine
      existing.setProp('title', title);
      existing.setExtendedProp('category',    cat);
      existing.setExtendedProp('resource',    res);
      existing.setExtendedProp('description', desc);

      // Changer la couleur si modifiée
      const oldColor = existing.extendedProps.color || existing.backgroundColor;
      if (color !== oldColor) {
        existing.setProp('backgroundColor', color);
        existing.setProp('borderColor',     color);
        existing.setProp('textColor',       getContrast(color));
        existing.setExtendedProp('color',   color);
        // Mettre à jour la couleur de la couche si c'est une couche manuelle
        const lyr = S.layers.find(l => l.id === existing.extendedProps.fileId);
        if (lyr && lyr.manual) lyr.color = color;
      }

      // Mettre à jour les dates (première date row seulement pour l'édition)
      const first = entries[0];
      if (first.allDay) {
        // allDay : passer des strings YYYY-MM-DD — FullCalendar les traite en local sans décalage
        // start = "2026-06-05", end = "2026-06-06" (exclusive = start + 1 jour)
        const startStr = first.start; // déjà YYYY-MM-DD
        // Calculer end exclusive = end + 1 jour
        const [ey,em,ed2] = first.end.split('-').map(Number);
        const endExcl = new Date(ey, em-1, ed2+1);
        const endStr  = endExcl.getFullYear() + '-' +
          String(endExcl.getMonth()+1).padStart(2,'0') + '-' +
          String(endExcl.getDate()).padStart(2,'0');
        existing.setAllDay(true, { maintainDuration: false });
        existing.setStart(startStr);
        existing.setEnd(endStr);
      } else {
        existing.setAllDay(false);
        existing.setStart(first.start instanceof Date ? first.start : new Date(first.start));
        existing.setEnd(  first.end   instanceof Date ? first.end   : new Date(first.end));
      }

      renderLayers(); updateDashIfOpen(); applyFilters();
      closeEventModal();
      toast('"' + title + '" modifié — ↩ pour annuler');
      return;
    }
  }

  // ── CAS 2 : NOUVEL événement ──
  const name  = layerName || title;
  const layer = getOrCreateManualLayer(name, color);

  entries.forEach(({ start, end, allDay }) => {
    const id = 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
    // Pour allDay, passer strings YYYY-MM-DD ; end = end+1 jour (exclusive)
    let ss, ee;
    if (allDay) {
      ss = start; // string YYYY-MM-DD
      const [ey2,em2,ed3] = end.split('-').map(Number);
      const endEx2 = new Date(ey2, em2-1, ed3+1);
      ee = endEx2.getFullYear() + '-' + String(endEx2.getMonth()+1).padStart(2,'0') + '-' + String(endEx2.getDate()).padStart(2,'0');
    } else {
      ss = start instanceof Date ? start.toISOString() : start;
      ee = end   instanceof Date ? end.toISOString()   : end;
    }
    S.calendar.addEvent({
      id, title, start: ss, end: ee, allDay,
      backgroundColor: layer.color, borderColor: layer.color, textColor: getContrast(layer.color),
      extendedProps: {
        fileId: layer.id, filename: layer.name,
        color: layer.color, manual: true,
        category: cat, resource: res, description: desc
      }
    });
    layer.events.push({ id });
    pushUndo('add', { id });
  });

  renderLayers(); updateDashIfOpen(); applyFilters();
  closeEventModal();
  toast(entries.length + ' événement(s) ajouté(s) dans "' + layer.name + '" — ↩ pour annuler');
}

function deleteEditEvent(){
  if(!S.editingId||!confirm('Supprimer ?')) return;
  const ev = S.calendar.getEventById(S.editingId);
  if (ev) {
    pushUndo('delete', snapshotEvent(ev));
    doDeleteEvent(ev);
  }
  closeEventModal();
}

// ── DATE ROWS ─────────────────────────────────────────────
function addDateRow(sd='',st='',ed='',et='') {
  S.dateRowCount++; const id=S.dateRowCount;
  if(!sd&&id>1){const prev=document.getElementById(`dr_sd_${id-1}`);if(prev?.value){sd=prev.value;ed=prev.value;}}
  if(!ed)ed=sd;
  const div=document.createElement('div'); div.className='date-row'; div.id=`dateRow_${id}`;
  div.innerHTML=`<div class="dr-bar" style="background:${S.selectedColor}"><span class="dr-lbl">Date ${id}</span>${id>1?`<button type="button" class="dr-rm" onclick="removeDateRow(${id})">✕</button>`:''}</div><div class="dr-fields"><div class="drf"><label>Début ★</label><input type="date" class="fi" id="dr_sd_${id}" value="${sd}"></div><div class="drf"><label>Heure début</label><input type="time" class="fi" id="dr_st_${id}" value="${st}" placeholder="(opt.)"></div><div class="drf"><label>Fin</label><input type="date" class="fi" id="dr_ed_${id}" value="${ed}"></div><div class="drf"><label>Heure fin</label><input type="time" class="fi" id="dr_et_${id}" value="${et}" placeholder="(opt.)"></div></div>`;
  document.getElementById('dateRows').appendChild(div);
  document.getElementById(`dr_sd_${id}`).onchange=e=>{const el=document.getElementById(`dr_ed_${id}`);if(!el.value||el.value<e.target.value)el.value=e.target.value;};
  div.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function removeDateRow(id){document.getElementById(`dateRow_${id}`)?.remove();}

// ── SWATCHES ──────────────────────────────────────────────
function initSwatches(){rebuildSwatches();document.getElementById('evColor').oninput=e=>{S.selectedColor=e.target.value;setColorUI(e.target.value);rebuildSwatches();};}
function setColorUI(c){const el=document.getElementById('evTitle');if(el){el.style.borderLeft=`3px solid ${c}`;el.style.borderRadius='0 6px 6px 0';}document.querySelectorAll('.dr-bar').forEach(b=>b.style.background=c);}
function rebuildSwatches(){const c=document.getElementById('swatches');if(!c)return;c.innerHTML='';BASE_PALETTE.slice(0,12).forEach(col=>{const b=document.createElement('button');b.type='button';b.className='sw'+(col===S.selectedColor?' on':'');b.style.background=col;b.onclick=()=>{S.selectedColor=col;document.getElementById('evColor').value=col;setColorUI(col);rebuildSwatches();};c.appendChild(b);});}

// ═══════════════════════════════════════════════════════════
// IMPORT EXCEL
// ═══════════════════════════════════════════════════════════
function initDropZone(){
  const dz=document.getElementById('dropZone'),fi=document.getElementById('fileInput');
  fi.onchange=e=>{importFiles(Array.from(e.target.files));fi.value='';};
  dz.ondragover=e=>{e.preventDefault();dz.classList.add('drag-over');};
  dz.ondragleave=()=>dz.classList.remove('drag-over');
  dz.ondrop=e=>{e.preventDefault();dz.classList.remove('drag-over');importFiles(Array.from(e.dataTransfer.files).filter(f=>/\.(xlsx|xls|csv)$/i.test(f.name)));};
}

async function importFiles(files){for(const f of files)await importSingleFile(f);}

async function importSingleFile(file) {
  toast(`Lecture de "${file.name}"…`);
  try {
    const {rows, raw} = await readExcel(file);
    if (!rows || rows.length === 0) { alert(`"${file.name}" est vide.`); return; }
    const fileIndex = S.layers.filter(l => l.id !== 'manual').length;

    // Ordre de détection : mois-en-colonnes EN PREMIER (plus spécifique),
    // puis grille semaine×jour, puis mapping standard
    const calEvts = tryMonthColumnFormat(file.name, raw, fileIndex);
    if (calEvts && calEvts.length > 0) {
      addLayer({id:'f_'+Date.now(), name:file.name, color:getFileColor(fileIndex), events:calEvts, visible:true});
      toast(`${calEvts.length} événements importés depuis "${file.name}"`);
      return;
    }

    const fourColEvts = tryFourColPerMonthFormat(file.name, raw, fileIndex);
    if (fourColEvts && fourColEvts.length > 0) {
      addLayer({id:'f_'+Date.now(), name:file.name, color:getFileColor(fileIndex), events:fourColEvts, visible:true});
      toast(`${fourColEvts.length} événements importés depuis "${file.name}"`);
      return;
    }

    const gridEvts = tryGridFormat(file.name, raw, fileIndex);
    if (gridEvts && gridEvts.length > 0) {
      addLayer({id:'f_'+Date.now(), name:file.name, color:getFileColor(fileIndex), events:gridEvts, visible:true});
      toast(`${gridEvts.length} événements importés depuis "${file.name}"`);
      return;
    }

    // Fallback : modal de mapping manuel
    S.pendingRows = rows; S.pendingFile = file; S.pendingHeaders = Object.keys(rows[0]);
    showMappingModal(file.name, rows, S.pendingHeaders, fileIndex);
  } catch(err) { alert(`Erreur: ${err.message}`); console.error(err); }
}

async function readExcel(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const isCSV = file.name.toLowerCase().endsWith('.csv');
        const wb = isCSV
          ? XLSX.read(e.target.result, {type:'string'})
          : XLSX.read(new Uint8Array(e.target.result), {type:'array', cellDates:true});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw   = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:null});
        const rows  = smartParse(sheet);
        res({rows, raw});
      } catch(err) { rej(err); }
    };
    reader.onerror = rej;
    if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
  });
}

function smartParse(sheet) {
  const all = XLSX.utils.sheet_to_json(sheet, {header:1, raw:false, defval:''});
  if (!all || all.length < 2) return [];
  let hi = 0;
  for (let i = 0; i < Math.min(8, all.length); i++) {
    if (all[i].filter(c => String(c).trim()).length >= 2) { hi = i; break; }
  }
  const headers = all[hi].map((h, i) => {
    const c = String(h).trim();
    return (!c || c.startsWith('_EMPTY') || c === 'undefined') ? `Col_${i+1}` : c;
  });
  const rows = [];
  for (let i = hi+1; i < all.length; i++) {
    if (all[i].every(c => !String(c).trim())) continue;
    const obj = {};
    headers.forEach((h, j) => obj[h] = all[i][j] !== undefined ? String(all[i][j]) : '');
    rows.push(obj);
  }
  return rows;
}

// ── UTILITAIRES COMMUNS ───────────────────────────────────
function parseMonthStr(v) {
  if (!v) return null;
  if (v instanceof Date) return {year: v.getUTCFullYear(), month: v.getUTCMonth()+1};
  const s = String(v).toLowerCase().trim();
  const MONTHS = {jan:1,janv:1,'fév':2,'fevr':2,'févr':2,fev:2,mars:3,mar:3,avr:4,mai:5,
    juin:6,jul:7,juil:7,aou:8,'aout':8,'août':8,sep:9,sept:9,oct:10,nov:11,
    'déc':12,dec:12,'dé':12};
  const m = s.match(/([a-záàâéèêîïôùûüœæ]+)[.\-\s]?(\d{2,4})/);
  if (!m) return null;
  const mon = Object.entries(MONTHS).find(([k]) => m[1].startsWith(k));
  if (!mon) return null;
  let yr = parseInt(m[2]);
  if (yr < 100) yr += 2000;
  return {year: yr, month: mon[1]};
}

function categorizeCell(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const su = s.toUpperCase().replace(/[\n\r]+/g,' ').replace(/\s+/g,' ').trim();
  if (su === 'F')                    return {cat:'Fermeture', label:'Fermeture'};
  if (su === 'TPG')                  return {cat:'TPG',       label:'TPG'};
  if (su === 'API')                  return {cat:'API',       label:'API'};
  if (/^CFA\b/.test(su))            return {cat:'Cours',     label:s};
  if (su[0]==='B' && su.length>1)   return {cat:'Cours',     label:s};
  if (/^M\d/.test(su))              return {cat:'Cours',     label:s};
  if (/^STAGE/.test(su) || su[0]==='S' && su.length>1 && !/^S$/.test(su) && !/^SAM/.test(su) && !/^SA/.test(su))
                                     return {cat:'Stage',     label:s};
  if (/^EMPLOYEUR/.test(su) || su==='E' && su.length===1)
                                     return {cat:'Employeur', label:'Employeur'};
  if (/EMPLOYEUR/.test(su))         return {cat:'Employeur', label:'Employeur'};
  if (su==='E')                      return {cat:'Employeur', label:'Employeur'};
  return null;
}

function makeEvent(id, title, dateStr, color, cat, filename) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const nextDay = new Date(y, m-1, d+1);
  const endStr  = nextDay.getFullYear()+'-'+String(nextDay.getMonth()+1).padStart(2,'0')+'-'+String(nextDay.getDate()).padStart(2,'0');
  return {
    id, title, start:dateStr, end:endStr, allDay:true,
    backgroundColor:color, borderColor:color, textColor:getContrast(color),
    extendedProps:{fileId:'', filename, color, category:cat, resource:'', description:''}
  };
}

// ── FORMAT 1 : MOIS EN COLONNES, 3 COLS PAR MOIS ─────────
// Ligne N : "sept-26" "oct-26" ... (toutes les 3 colonnes)
// Lignes N+1... : num_jour | lettre_jour | activité (× nb_mois)
// Fichiers: APPRENTIS_EMEIS, APPRENTIS_SEPT_2026
function tryMonthColumnFormat(filename, rawRows, fileIndex) {
  if (!rawRows || rawRows.length < 8) return null;
  const color = getFileColor(fileIndex);

  // 1. Chercher la ligne des mois : ≥3 valeurs reconnaissables comme mois
  let monthRowIdx = -1;
  for (let i = 0; i < Math.min(12, rawRows.length); i++) {
    const row = rawRows[i];
    let cnt = 0;
    for (const v of row) { if (parseMonthStr(v)) cnt++; }
    if (cnt >= 3) { monthRowIdx = i; break; }
  }
  if (monthRowIdx === -1) return null;

  // 2. Collecter colonnes de mois (espacement de 3)
  const monthRow = rawRows[monthRowIdx];
  const monthCols = {};
  for (let ci = 0; ci < monthRow.length; ci++) {
    const ym = parseMonthStr(monthRow[ci]);
    if (ym) monthCols[ci] = ym;
  }
  if (Object.keys(monthCols).length < 2) return null;

  // 3. Vérifier que l'espacement est bien de 3 (pas 4)
  const cis = Object.keys(monthCols).map(Number).sort((a,b)=>a-b);
  const gaps = cis.slice(1).map((c,i) => c - cis[i]);
  const typicalGap = gaps.sort((a,b)=>gaps.filter(x=>x===a).length-gaps.filter(x=>x===b).length).pop();
  if (typicalGap !== 3) return null; // C'est le format 4-cols, pas 3-cols

  // 4. Lire les données
  const SKIP_LETTERS = new Set(['S','D']); // Samedi, Dimanche
  const events = []; let eid = 0;

  for (const [ciStr, {year, month}] of Object.entries(monthCols)) {
    const ci = parseInt(ciStr);
    for (let ri = monthRowIdx+1; ri < rawRows.length; ri++) {
      const row = rawRows[ri];
      if (!row || row.length <= ci+2) continue;
      const dayNum    = row[ci];
      const dayLetter = row[ci+1] ? String(row[ci+1]).trim().toUpperCase() : '';
      const activity  = row[ci+2];

      if (!dayNum || typeof dayNum !== 'number' || dayNum < 1 || dayNum > 31) continue;
      if (SKIP_LETTERS.has(dayLetter)) continue;

      const cat = categorizeCell(activity);
      if (!cat) continue;

      let date;
      try { date = new Date(year, month-1, Math.round(dayNum)); } catch { continue; }
      if (isNaN(date.getTime()) || date.getMonth() !== month-1) continue;

      const ds = dateToStr(date);
      eid++;
      events.push(makeEvent(`mc_${fileIndex}_${eid}`, cat.label, ds, color, cat.cat, filename));
    }
  }
  return events.length > 0 ? events : null;
}

// ── FORMAT 2 : 4 COLONNES PAR MOIS (Nouveau Planning) ─────
// Ligne 6: datetime(2026,1,1), datetime(2026,2,1)... (toutes les 4 colonnes)
// Lignes 7+: date_cell(mauvaise année) | lettre_jour | activité | heures
// Le vrai jour du mois = date_cell.day, l'année réelle vient de la ligne 6
function tryFourColPerMonthFormat(filename, rawRows, fileIndex) {
  if (!rawRows || rawRows.length < 8) return null;
  const color = getFileColor(fileIndex);

  // 1. Chercher ligne des mois avec Date objects espacés de 4
  let monthRowIdx = -1;
  for (let i = 0; i < Math.min(12, rawRows.length); i++) {
    const row = rawRows[i];
    const dateCols = [];
    for (let ci = 0; ci < row.length; ci++) {
      if (row[ci] instanceof Date && row[ci].getUTCFullYear() >= 2025) dateCols.push(ci);
    }
    if (dateCols.length >= 3) {
      // Vérifier espacement de 4
      const gaps = dateCols.slice(1).map((c,j) => c - dateCols[j]);
      if (gaps.every(g => g === 4)) { monthRowIdx = i; break; }
    }
  }
  if (monthRowIdx === -1) return null;

  // 2. Collecter colonnes de mois
  const monthRow = rawRows[monthRowIdx];
  const monthCols = {};
  for (let ci = 0; ci < monthRow.length; ci++) {
    const v = monthRow[ci];
    if (v instanceof Date && v.getUTCFullYear() >= 2025) {
      monthCols[ci] = {year: v.getUTCFullYear(), month: v.getUTCMonth()+1};
    }
  }

  // 3. Chercher aussi une 2e section de mois (ex: 2027) plus bas
  for (let i = monthRowIdx+1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const dateCols = [];
    for (let ci = 0; ci < row.length; ci++) {
      if (row[ci] instanceof Date && row[ci].getUTCFullYear() >= 2025) dateCols.push(ci);
    }
    if (dateCols.length >= 3) {
      const gaps = dateCols.slice(1).map((c,j) => c - dateCols[j]);
      if (gaps.every(g => g === 4)) {
        // C'est une 2e section
        dateCols.forEach(ci => {
          const v = row[ci];
          if (v instanceof Date) monthCols[`${i}_${ci}`] = {year:v.getUTCFullYear(), month:v.getUTCMonth()+1, rowStart:i+1, colBase:ci};
        });
        break;
      }
    }
  }

  // 4. Lire les données
  const SKIP = new Set(['S','D']);
  const events = []; let eid = 0;

  for (const [key, info] of Object.entries(monthCols)) {
    const ci = info.colBase !== undefined ? info.colBase : parseInt(key);
    const rowStart = info.rowStart !== undefined ? info.rowStart : monthRowIdx+1;
    const {year, month} = info;

    // Trouver la fin de section (ligne vide ou nouvelle ligne de mois)
    let rowEnd = rawRows.length;
    for (let ri = rowStart; ri < rawRows.length; ri++) {
      const row = rawRows[ri];
      if (!row || row.every(v => v === null)) continue;
      // Arrêter si on tombe sur une autre ligne de mois (Date >= 2025 en col 0)
      if (ri > rowStart+5 && row[0] instanceof Date && row[0].getUTCFullYear() >= 2025 && row[4] instanceof Date) {
        rowEnd = ri; break;
      }
    }

    for (let ri = rowStart; ri < rowEnd; ri++) {
      const row = rawRows[ri];
      if (!row || row.length <= ci+2) continue;

      const dateCell  = row[ci];
      const dayLetter = row[ci+1] ? String(row[ci+1]).trim().toUpperCase() : '';
      const activity  = row[ci+2];

      // dateCell doit être un objet Date avec un numéro de jour valide
      if (!(dateCell instanceof Date)) continue;
      const dayNum = dateCell.getUTCDate(); // toujours UTC pour les Date XLSX
      if (dayNum < 1 || dayNum > 31) continue;
      if (SKIP.has(dayLetter)) continue;

      const cat = categorizeCell(activity);
      if (!cat) continue;

      let date;
      try { date = new Date(year, month-1, dayNum); } catch { continue; }
      if (isNaN(date.getTime()) || date.getMonth() !== month-1) continue;

      const ds = dateToStr(date);
      eid++;
      events.push(makeEvent(`fc_${fileIndex}_${eid}`, cat.label, ds, color, cat.cat, filename));
    }
  }
  return events.length > 0 ? events : null;
}

// ── FORMAT 3 : GRILLE SEMAINE×JOUR ────────────────────────
// Ligne N : dates de lundi (Date objects consécutives, espacement 1)
// Colonne A : "Lundi", "Mardi"... "Vendredi"
// Cellules : activité
// STRICT : les dates doivent avoir year >= 2024 pour éviter les faux positifs
function tryGridFormat(filename, rawRows, fileIndex) {
  if (!rawRows || rawRows.length < 5) return null;
  const color = getFileColor(fileIndex);
  const DAY_OFFSETS = {lundi:0, mardi:1, mercredi:2, jeudi:3, vendredi:4};
  const DAY_NAMES   = ['lundi','mardi','mercredi','jeudi','vendredi'];
  const events = []; let eid = 0;

  for (let dateRowIdx = 0; dateRowIdx < rawRows.length-5; dateRowIdx++) {
    const dateRow = rawRows[dateRowIdx];
    const weekDates = {};
    for (let ci = 1; ci < dateRow.length; ci++) {
      const v = dateRow[ci];
      if (!(v instanceof Date)) continue;
      const yr = v.getUTCFullYear();
      // STRICT: rejeter les années erronées (< 2024) pour éviter faux positifs
      if (yr < 2024 || yr > 2035) continue;
      weekDates[ci] = new Date(yr, v.getUTCMonth(), v.getUTCDate()); // local
    }
    if (Object.keys(weekDates).length < 3) continue;

    const dayRows = {};
    for (let ri = dateRowIdx+1; ri < Math.min(dateRowIdx+12, rawRows.length); ri++) {
      const fc = String(rawRows[ri]?.[0] || '').trim().toLowerCase();
      const match = DAY_NAMES.find(d => fc.startsWith(d));
      if (match) dayRows[match] = ri;
    }
    if (Object.keys(dayRows).length < 3) continue;

    for (const [dayName, rowIdx] of Object.entries(dayRows)) {
      const row = rawRows[rowIdx];
      for (const [ciStr, weekStart] of Object.entries(weekDates)) {
        const ci = parseInt(ciStr);
        const cat = categorizeCell(row[ci]);
        if (!cat) continue;
        const evDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()+DAY_OFFSETS[dayName]);
        eid++;
        events.push(makeEvent(`gr_${fileIndex}_${eid}`, cat.label, dateToStr(evDate), color, cat.cat, filename));
      }
    }
    if (events.length > 0) break;
  }
  return events.length > 0 ? events : null;
}

// ═══════════════════════════════════════════════════════════
// LAYERS
// ═══════════════════════════════════════════════════════════
function addLayer(layer){
  const fileId=layer.id;
  layer.events.forEach(ev=>{ev.extendedProps.fileId=fileId;});
  S.layers.push(layer);
  layer.events.forEach(ev=>S.calendar.addEvent(ev));
  layer.events.forEach(ev=>{if(ev.extendedProps?.category)S.allCategories.add(ev.extendedProps.category);});
  renderCategoryChips(); renderLayers(); updateBadge(); updateDashIfOpen();
  if(layer.events.length&&S.layers.filter(l=>l.id!=='manual').length===1){
    const first=layer.events.map(e=>new Date(e.start)).filter(d=>!isNaN(d)).sort((a,b)=>a-b)[0];
    if(first)S.calendar.gotoDate(first);
  }
}

function removeLayer(id){S.calendar.getEvents().filter(e=>e.extendedProps.fileId===id).forEach(e=>e.remove());S.layers=S.layers.filter(l=>l.id!==id);renderLayers();updateBadge();updateDashIfOpen();}
function toggleLayer(id){const l=S.layers.find(l=>l.id===id);if(!l)return;l.visible=!l.visible;S.calendar.getEvents().filter(e=>e.extendedProps.fileId===id).forEach(e=>e.setProp('display',l.visible?'auto':'none'));renderLayers();updateDashIfOpen();}
function updateLayerColor(id,color){const l=S.layers.find(l=>l.id===id);if(!l)return;l.color=color;S.calendar.getEvents().filter(e=>e.extendedProps.fileId===id).forEach(e=>{e.setProp('backgroundColor',color);e.setProp('borderColor',color);e.setExtendedProp('color',color);});}

function renderLayers(){
  const list=document.getElementById('layerList');
  if(!S.layers.length){list.innerHTML='<div class="empty-layers">Aucune couche</div>';return;}
  list.innerHTML=S.layers.map(l=>`
    <div class="layer-item">
      <input type="checkbox" class="layer-cb" ${l.visible?'checked':''} style="accent-color:${l.color}"
        onchange="toggleLayer('${l.id}')" title="Afficher/masquer">
      <div class="layer-dot" style="background:${l.color}" title="Changer la couleur">
        <input type="color" value="${l.color}" oninput="updateLayerColor('${l.id}',this.value)">
      </div>
      <span class="layer-name" title="Double-clic pour renommer"
        ondblclick="renameLayer('${l.id}',this)">${cleanFileName(l.name)}</span>
      <span class="layer-n">${l.events.length}</span>
      <button class="layer-rm" onclick="removeLayer('${l.id}')" title="Supprimer">✕</button>
    </div>`).join('');
}

function renameLayer(id, el) {
  const layer = S.layers.find(l => l.id === id);
  if (!layer) return;
  // Remplacer le span par un input temporaire
  const input = document.createElement('input');
  input.type = 'text';
  input.value = layer.name;
  input.className = 'layer-name fi';
  input.style.cssText = 'flex:1;padding:2px 6px;font-size:11px;height:22px';
  el.replaceWith(input);
  input.focus(); input.select();
  const commit = () => {
    const newName = input.value.trim() || layer.name;
    layer.name = newName;
    // Mettre à jour les extendedProps des événements de cette couche
    S.calendar.getEvents()
      .filter(ev => ev.extendedProps.fileId === id)
      .forEach(ev => ev.setExtendedProp('filename', newName));
    renderLayers();
  };
  input.onblur  = commit;
  input.onkeydown = e => { if (e.key==='Enter') { e.preventDefault(); input.blur(); } if (e.key==='Escape') { input.value=layer.name; input.blur(); } };
}
function updateBadge(){document.getElementById('layerBadge').textContent=S.layers.length;}

// ═══════════════════════════════════════════════════════════
// FILTRES
// ═══════════════════════════════════════════════════════════
function initFilters(){
  let timer;
  document.getElementById('fSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(applyFilters, 200); };
  // Les dates ne déclenchent plus automatiquement — il faut cliquer "Filtrer"
}

function renderCategoryChips(){
  const c=document.getElementById('fCats');c.innerHTML='';
  S.allCategories.forEach(cat=>{
    const btn=document.createElement('button');btn.className='chip'+(S.activeCategories.has(cat)?' on':'');btn.textContent=cat;
    btn.onclick=()=>{if(S.activeCategories.has(cat))S.activeCategories.delete(cat);else S.activeCategories.add(cat);btn.classList.toggle('on',S.activeCategories.has(cat));applyFilters();};
    c.appendChild(btn);
  });
}

function applyPeriodFilter() {
  const fromV = document.getElementById('fFrom').value;
  const toV   = document.getElementById('fTo').value;
  if (!fromV && !toV) { toast('Sélectionnez au moins une date'); return; }

  S.periodFrom = fromV ? new Date(fromV + 'T00:00:00') : null;
  S.periodTo   = toV   ? new Date(toV   + 'T23:59:59') : null;

  // Naviguer vers la date de début
  if (S.periodFrom) S.calendar.gotoDate(S.periodFrom);

  // Afficher le tag "filtre actif"
  const tag = document.getElementById('filterActiveTag');
  const lbl = document.getElementById('filterActiveLabel');
  const fmt = d => d.toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric'});
  lbl.textContent = (fromV ? fmt(S.periodFrom) : '…') + ' → ' + (toV ? fmt(S.periodTo) : '…');
  tag.classList.remove('hide');

  applyFilters();
  toast('Filtre période appliqué');
}

function clearPeriodFilter() {
  S.periodFrom = null;
  S.periodTo   = null;
  document.getElementById('fFrom').value = '';
  document.getElementById('fTo').value   = '';
  document.getElementById('filterActiveTag').classList.add('hide');
  applyFilters();
  toast('Filtre période annulé');
}

function applyFilters(){
  const q      = document.getElementById('fSearch').value.trim().toLowerCase();
  const from   = S.periodFrom;
  const to     = S.periodTo;
  const visFids = S.layers.filter(l=>l.visible).map(l=>l.id);

  S.calendar.getEvents().forEach(ev=>{
    let show = visFids.includes(ev.extendedProps.fileId);
    if(show&&q){
      const hay = (ev.title+' '+(ev.extendedProps.category||'')+' '+(ev.extendedProps.resource||'')).toLowerCase();
      show = hay.includes(q);
    }
    if(show && S.activeCategories.size>0) show = S.activeCategories.has(ev.extendedProps.category);
    if(show && from && ev.start) show = ev.start >= from;
    if(show && to   && ev.start) show = ev.start <= to;
    ev.setProp('display', show ? 'auto' : 'none');
  });
}

// ═══════════════════════════════════════════════════════════
// TOOLTIP
// ═══════════════════════════════════════════════════════════
function showTooltip(info){
  const ev=info.event,p=ev.extendedProps;
  const fmt=d=>d?d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  const t=document.getElementById('tooltip');
  t.innerHTML=`<div style="font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${p.color||ev.backgroundColor};display:inline-block;flex-shrink:0"></span>${ev.title}</div>`+
    [['Source',p.filename],['Début',fmt(ev.start)],['Fin',fmt(ev.end)],['Catégorie',p.category],['Ressource',p.resource],['Note',p.description?p.description.substring(0,70):null]].filter(r=>r[1]).map(r=>`<div style="display:flex;gap:8px;margin-bottom:2px"><span style="color:var(--tx3);width:70px;flex-shrink:0">${r[0]}</span><span style="color:var(--tx2)">${r[1]}</span></div>`).join('');
  t.style.display='block';
  const r=info.el.getBoundingClientRect();let x=r.right+8,y=r.top;
  if(x+260>window.innerWidth)x=r.left-268;if(y+160>window.innerHeight)y=window.innerHeight-160;
  t.style.left=Math.max(8,x)+'px';t.style.top=Math.max(8,y)+'px';
}
function hideTooltip(){document.getElementById('tooltip').style.display='none';}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function toggleDash(){const d=document.getElementById('dash');d.classList.toggle('hide');if(!d.classList.contains('hide'))updateDash();}
function updateDashIfOpen(){const d=document.getElementById('dash');if(!d.classList.contains('hide'))updateDash();}
function updateDash(){
  const evts=S.calendar.getEvents();
  document.getElementById('sTotal').textContent=evts.length;
  document.getElementById('sFiles').textContent=S.layers.length;
  document.getElementById('sConflicts').textContent=detectConflicts().length;
  const dates=new Set(evts.map(e=>e.start?fcDateToStr(e.start):null).filter(Boolean));
  const view=S.calendar.view;const span=view?Math.max(1,Math.round((view.currentEnd-view.currentStart)/86400000)):30;
  document.getElementById('sOcc').textContent=Math.round(dates.size/span*100)+'%';
  renderCharts(evts);
}

function renderCharts(evts){
  const isDark=document.documentElement.dataset.theme==='dark';
  const tc=isDark?'#7c839a':'#5a6282',gc=isDark?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)';
  const catC={};evts.forEach(e=>{const c=e.extendedProps.category||'Autre';catC[c]=(catC[c]||0)+1;});
  const catE=Object.entries(catC).sort((a,b)=>b[1]-a[1]).slice(0,8);
  makeChart('cCat','doughnut',{labels:catE.map(e=>e[0]),datasets:[{data:catE.map(e=>e[1]),backgroundColor:BASE_PALETTE,borderWidth:0}]},tc,gc);
  const wkC={};evts.forEach(e=>{if(!e.start)return;const w=weekKey(e.start);wkC[w]=(wkC[w]||0)+1;});
  const wkE=Object.entries(wkC).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
  makeChart('cWeek','bar',{labels:wkE.map(e=>`S${e[0].split('-W')[1]}`),datasets:[{label:'Tâches',data:wkE.map(e=>e[1]),backgroundColor:BASE_PALETTE[0],borderRadius:4}]},tc,gc);
  makeChart('cFile','bar',{labels:S.layers.map(l=>l.name.replace(/\.[^.]+$/,'').substring(0,16)),datasets:[{label:'Evt',data:S.layers.map(l=>{const fid=l.id;return evts.filter(e=>e.extendedProps.fileId===fid).length;}),backgroundColor:S.layers.map(l=>l.color),borderRadius:4}]},tc,gc,{indexAxis:'y'});
}

function makeChart(id,type,data,tc,gc,extra={}){if(S.charts[id])S.charts[id].destroy();const canvas=document.getElementById(id);if(!canvas)return;S.charts[id]=new Chart(canvas,{type,data,options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:type==='doughnut',position:'right',labels:{color:tc,font:{size:10},boxWidth:10,padding:6}},tooltip:{backgroundColor:'var(--overlay)',titleColor:'var(--tx)',bodyColor:tc,borderColor:'var(--border2)',borderWidth:1}},scales:type!=='doughnut'?{x:{grid:{color:gc},ticks:{color:tc,font:{size:9}}},y:{grid:{color:gc},ticks:{color:tc,font:{size:9}}}}:{},...extra}});}
function weekKey(date){const d=new Date(date);d.setHours(0,0,0,0);d.setDate(d.getDate()+3-(d.getDay()+6)%7);const w1=new Date(d.getFullYear(),0,4);const n=1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7);return`${d.getFullYear()}-W${String(n).padStart(2,'0')}`;}

function showConflicts(){const c=detectConflicts();if(!c.length){toast('Aucun conflit ✓');return;}alert(`${c.length} conflit(s):\n\n`+c.slice(0,12).map(x=>`• ${x.label}\n  ${x.events.map(e=>e.title).join(' / ')}`).join('\n\n'));}
function detectConflicts(){const evts=S.calendar.getEvents().filter(e=>e.display!=='none').map(e=>({id:e.id,title:e.title,start:e.start,end:e.end||new Date(e.start.getTime()+3600000),fileId:e.extendedProps.fileId,resource:e.extendedProps.resource})).sort((a,b)=>a.start-b.start);const out=[];for(let i=0;i<evts.length;i++)for(let j=i+1;j<evts.length;j++){if(evts[j].start>=evts[i].end)break;if(evts[i].resource&&evts[j].resource&&evts[i].resource===evts[j].resource)out.push({label:`Conflit ressource`,events:[evts[i],evts[j]]});else if(evts[i].fileId!==evts[j].fileId)out.push({label:'Chevauchement',events:[evts[i],evts[j]]});}return out;}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════
async function doExport(type){
  if(type==='pdf'){try{const canvas=await html2canvas(document.getElementById('calWrap'),{scale:2,useCORS:true,backgroundColor:null});const{jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();const m=10,aw=pw-2*m,ah=ph-2*m-16;const ratio=canvas.width/canvas.height;let iw=aw,ih=iw/ratio;if(ih>ah){ih=ah;iw=ih*ratio;}pdf.setFontSize(12);pdf.setFont('helvetica','bold');pdf.text('PlanViz',m,m+7);pdf.setFontSize(8);pdf.setFont('helvetica','normal');pdf.text(new Date().toLocaleString('fr-FR'),m,m+13);pdf.addImage(canvas.toDataURL('image/png'),'PNG',m,m+16,iw,ih);pdf.save(`planviz_${stamp()}.pdf`);}catch(e){alert('PDF: '+e.message);}}
  else if(type==='png'){try{const canvas=await html2canvas(document.getElementById('calWrap'),{scale:3,useCORS:true});const a=document.createElement('a');a.download=`planviz_${stamp()}.png`;a.href=canvas.toDataURL('image/png');a.click();}catch(e){alert('PNG: '+e.message);}}
  else if(type==='xlsx'){const rows=S.calendar.getEvents().map(e=>({Titre:e.title,Début:e.start?e.start.toLocaleString('fr-FR'):'',Fin:e.end?e.end.toLocaleString('fr-FR'):'',Catégorie:e.extendedProps.category||'',Ressource:e.extendedProps.resource||'',Source:e.extendedProps.filename||''}));const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Planning');XLSX.writeFile(wb,`planviz_${stamp()}.xlsx`);}
  else if(type==='csv'){const evts=S.calendar.getEvents();const cols=['Titre','Début','Fin','Catégorie','Ressource','Source'];const csv=[cols.join(','),...evts.map(e=>[e.title,e.start?e.start.toLocaleString('fr-FR'):'',e.end?e.end.toLocaleString('fr-FR'):'',e.extendedProps.category||'',e.extendedProps.resource||'',e.extendedProps.filename||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'}));a.download=`planviz_${stamp()}.csv`;a.click();}
}
function stamp(){return new Date().toISOString().slice(0,10);}


// ═══════════════════════════════════════════════════════════
// IMPORT PDF — parseur universel pour plannings AS
// Formats supportés: ASCA (semaines/colonnes), EMEIS/Nouveau (couleurs de fond)
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const pdfBtn = document.getElementById('pdfImportBtn');
  const pdfIn  = document.getElementById('pdfInput');
  if (pdfBtn) pdfBtn.onclick = () => pdfIn.click();
  if (pdfIn)  pdfIn.onchange = e => { importPDFs(Array.from(e.target.files)); pdfIn.value=''; };
});

async function importPDFs(files) {
  for (const f of files) await importSinglePDF(f);
}

async function importSinglePDF(file) {
  toast(`Lecture PDF "${file.name}"…`);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;

    const fileIndex = S.layers.filter(l => l.id !== 'manual').length;
    const fileColor = getFileColor(fileIndex);
    const filename  = file.name.replace(/\.pdf$/i, '');
    const allEvents = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page    = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const ops     = await page.getOperatorList();

      // Extraire les mots avec positions
      const items = content.items.map(item => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        h: Math.abs(item.transform[3])
      })).filter(i => i.text);

      // Extraire les couleurs de fond (rectangles remplis)
      const coloredRects = extractColoredRects(ops, page);

      // Détecter le format de la page
      const baseYear = detectBaseYear(items);
      const monthHeaders = findMonthHeaders(items);

      if (monthHeaders.length >= 3) {
        // Format avec mois en ligne (EMEIS, Nouveau Planning)
        // Vérifier si on a des weekday rows (ASCA) ou des rects colorés
        const dayRows = findDayRows(items);
        if (dayRows.length >= 3) {
          // Format ASCA
          const evts = parseASCAFormat(items, monthHeaders, dayRows, baseYear, filename, fileColor);
          allEvents.push(...evts);
        } else if (coloredRects.length > 10) {
          // Format EMEIS/Nouveau avec couleurs
          const evts = parseColoredFormat(items, monthHeaders, coloredRects, filename, fileColor);
          allEvents.push(...evts);
        }
      }
    }

    if (allEvents.length === 0) {
      toast(`⚠ Aucun événement extrait de "${file.name}". Format non reconnu.`);
      return;
    }

    addLayer({ id:'f_'+Date.now(), name:file.name, color:fileColor, events:allEvents, visible:true });
    toast(`${allEvents.length} événements importés depuis "${file.name}"`);
  } catch(err) {
    alert(`Erreur lecture PDF "${file.name}": ${err.message}`);
    console.error(err);
  }
}

// ── Extraction des rectangles colorés depuis les opérateurs PDF ──
function extractColoredRects(ops, page) {
  const rects = [];
  const vp = page.getViewport({scale:1});
  let currentColor = null;
  const OPS = pdfjsLib.OPS;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    // setFillRGBColor
    if (fn === OPS.setFillRGBColor) {
      currentColor = [args[0], args[1], args[2]];
    }
    // setFillGray
    else if (fn === OPS.setFillGray) {
      const g = args[0];
      currentColor = [g, g, g];
    }
    // fillRect ou rectangle + fill
    else if ((fn === OPS.rectangle || fn === OPS.constructPath) && currentColor) {
      const a = fn === OPS.rectangle ? args : (args[1] || []);
      if (a.length >= 4) {
        const [x, y, w, h] = fn === OPS.rectangle ? a : a.slice(0,4);
        if (Math.abs(w) > 3 && Math.abs(h) > 3 && Math.abs(w) < 200 && Math.abs(h) < 50) {
          rects.push({
            x: Math.min(x, x+w),
            y: vp.height - Math.max(y, y+h),  // PDF y-axis is bottom-up
            w: Math.abs(w),
            h: Math.abs(h),
            color: [...currentColor]
          });
        }
      }
    }
  }
  return rects;
}

// ── Détection de l'année de base ──────────────────────────
function detectBaseYear(items) {
  // Chercher "1ère année 2026" ou "2026" dans le texte
  const text = items.map(i=>i.text).join(' ');
  const m1 = text.match(/1[eèr]re?\s+ann[eé]e\s+(20\d{2})/i);
  if (m1) return parseInt(m1[1]);
  const m2 = text.match(/[Dd][ée]but[^0-9]+(\d{2})\b/);
  if (m2) return parseInt(m2[1]) + 2000;
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
    const yr = parseInt(m[1]);
    if (yr >= 2026) return yr;
  }
  return 2026;
}

const PDF_MONTHS = {
  'janv':1,'jan':1,'fevr':2,'fev':2,'fevrier':2,'mars':3,'avr':4,'avril':4,'mai':5,
  'juin':6,'juil':7,'juillet':7,'aout':8,'sept':9,'septembre':9,'oct':10,'octobre':10,
  'nov':11,'novembre':11,'dec':12,'decembre':12
};

function parseMonthPDF(s) {
  if (!s) return null;
  const norm = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'-');
  const m = norm.match(/([a-z]+)[-.]?(\d{2,4})/);
  if (!m) return null;
  const monKey = m[1].replace(/-/,'');
  const month = Object.entries(PDF_MONTHS).find(([k]) => monKey.startsWith(k) || k.startsWith(monKey.slice(0,4)));
  if (!month) return null;
  let yr = parseInt(m[2]); if (yr < 100) yr += 2000;
  return (2025 <= yr && yr <= 2031) ? {year:yr, month:month[1]} : null;
}

// ── Trouver les en-têtes de mois ─────────────────────────
function findMonthHeaders(items) {
  const headers = [];
  for (const item of items) {
    const ym = parseMonthPDF(item.text);
    if (ym) headers.push({x: item.x + item.w/2, y: item.y, ym});
  }
  return headers.sort((a,b) => a.x - b.x);
}

// ── Trouver les lignes Lundi/Mardi/etc. (format ASCA) ────
const PDF_DAYS = {lundi:0,mardi:1,mercredi:2,jeudi:3,vendredi:4};
function findDayRows(items) {
  return items.filter(i => PDF_DAYS[i.text.toLowerCase()] !== undefined)
              .map(i => ({...i, dayOffset: PDF_DAYS[i.text.toLowerCase()]}));
}

// ── Catégoriser une cellule ───────────────────────────────
function pdfCategorize(text, fileColor) {
  if (!text) return null;
  const s = text.trim();
  const su = s.toUpperCase();
  if (!s || s === '-') return null;
  if (su === 'F') return {cat:'Fermeture', color:'#94a3b8', label:'Fermeture'};
  if (su === 'TPG') return {cat:'TPG', color:'#e879f9', label:'TPG'};
  if (/API/.test(su)) return {cat:'API', color:'#22b8d4', label:'API'};
  if (/^B[12345]/.test(su) || /^CFA/.test(su)) return {cat:'Cours', color:fileColor, label:s};
  if (/^M\d/.test(su)) return {cat:'Cours', color:fileColor, label:s};
  if (/^S[12345]/.test(su) || /STAGE/i.test(s)) return {cat:'Stage', color:fileColor, label:s};
  if (su === 'E' || /EMPLOY/i.test(s)) return {cat:'Employeur', color:fileColor, label:'Employeur'};
  if (/INSTIT/i.test(s)) return {cat:'Cours', color:fileColor, label:'Institut'};
  return null;
}

// ── Couleur PDF → catégorie ───────────────────────────────
function pdfColorToCat(rgb, fileColor) {
  if (!rgb || rgb.length < 3) return null;
  const [r,g,b] = rgb;
  if (r>0.85 && g>0.85 && b<0.3) return {cat:'Employeur',label:'Employeur',color:fileColor};
  if (r>0.9 && g>0.6 && g<0.85 && b<0.2) return {cat:'Employeur',label:'Employeur',color:fileColor};
  if (b>0.75 && r<0.4) return {cat:'Cours',label:'Institut',color:fileColor};
  if (g>0.7 && r>0.5 && b<0.75) return {cat:'Stage',label:'Stage',color:fileColor};
  return null;
}

// ── Format ASCA : semaines en colonnes ───────────────────
function parseASCAFormat(items, monthHeaders, dayRows, baseYear, filename, fileColor) {
  const events = [];
  if (!monthHeaders.length || !dayRows.length) return events;

  // Y de la ligne d'en-têtes (mois)
  const headerY = monthHeaders[0].y;

  // Trouver les colonnes de dates depuis la ligne d'en-tête
  const weekCols = {}; // x → Date lundi
  let prevDate = null, prevYear = baseYear;

  monthHeaders.forEach(mh => {
    const {year, month} = mh.ym;
    // Chercher le numéro de jour associé (items près du header)
    // Pour ASCA les dates de semaine sont les en-têtes eux-mêmes
    try {
      const d = new Date(year, month-1, 1);
      // Trouver le lundi de cette semaine
      weekCols[Math.round(mh.x)] = d;
    } catch {}
  });

  // Reconstituer à partir des items textuels de dates (ex: "5-janv.")
  const dateItems = items.filter(item => /\d{1,2}[\-\.](?:janv|jan|fév|fevr|mars|avr|mai|juin|juil|aout|août|sept|oct|nov|déc|dec)/i.test(item.text));
  let py = baseYear, pd = null;
  const colDates = {};
  dateItems.sort((a,b) => a.x - b.x).forEach(item => {
    const m = item.text.match(/(\d{1,2})[\-\.]([a-záàâéèêôùûü]+)/i);
    if (!m) return;
    const day = parseInt(m[1]);
    const monKey = m[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').slice(0,4);
    const month = Object.entries(PDF_MONTHS).find(([k]) => monKey.startsWith(k) || k.startsWith(monKey))?.[1];
    if (!month) return;
    try {
      let d = new Date(py, month-1, day);
      if (pd && d < pd) { py++; d = new Date(py, month-1, day); }
      colDates[Math.round(item.x + item.w/2)] = d;
      pd = d;
    } catch {}
  });

  if (!Object.keys(colDates).length) return events;

  // Pour chaque ligne de jour, trouver les activités par position X
  dayRows.forEach(dayRow => {
    const rowY = dayRow.y;
    const offset = dayRow.dayOffset;

    Object.entries(colDates).forEach(([xStr, monday]) => {
      const x = parseInt(xStr);
      // Chercher les items textuels près de cette colonne et cette ligne
      const nearby = items.filter(item =>
        Math.abs(item.x + item.w/2 - x) < 40 &&
        Math.abs(item.y - rowY) < 12 &&
        item.text !== dayRow.text
      );
      nearby.forEach(item => {
        const cat = pdfCategorize(item.text, fileColor);
        if (!cat) return;
        const evDate = new Date(monday);
        evDate.setDate(evDate.getDate() + offset);
        const dateStr = dateToStr(evDate);
        events.push({
          id: 'pdf_'+Date.now()+'_'+Math.random().toString(36).substr(2,4),
          title: cat.label, start: dateStr,
          end: dateToStr(new Date(evDate.getFullYear(),evDate.getMonth(),evDate.getDate()+1)),
          allDay: true,
          backgroundColor: fileColor, borderColor: fileColor, textColor: getContrast(fileColor),
          extendedProps: { fileId:'', filename, color:fileColor, category:cat.cat, resource:'', description:'' }
        });
      });
    });
  });
  return events;
}

// ── Format coloré : EMEIS/Nouveau Planning ───────────────
function parseColoredFormat(items, monthHeaders, coloredRects, filename, fileColor) {
  const events = [];
  if (!monthHeaders.length) return events;

  const monthY = Math.min(...monthHeaders.map(h=>h.y));

  // Plages X de chaque mois
  const ranges = monthHeaders.map((mh,i) => {
    const x0 = i>0 ? (monthHeaders[i-1].x+mh.x)/2 : mh.x-60;
    const x1 = i<monthHeaders.length-1 ? (mh.x+monthHeaders[i+1].x)/2 : mh.x+60;
    return {x0, x1, ym: mh.ym};
  });

  // Numéros de jours (items numériques sous la ligne des mois)
  const dayNums = items.filter(i => /^\d{1,2}$/.test(i.text) && i.y > monthY+5)
                       .map(i => ({...i, xc: i.x+i.w/2, day: parseInt(i.text)}));

  const seen = new Set();

  // Rectangles colorés → événements
  coloredRects.forEach(rect => {
    const cat = pdfColorToCat(rect.color, fileColor);
    if (!cat) return;
    if (rect.w > 200 || rect.h > 50) return;
    const cx = rect.x + rect.w/2, cy = rect.y + rect.h/2;
    if (cy < monthY) return;
    const mois = ranges.find(r => r.x0<=cx && cx<=r.x1);
    if (!mois) return;
    const nearby = dayNums.filter(d => Math.abs(d.xc-cx)<45 && Math.abs(d.y-cy)<22);
    if (!nearby.length) return;
    const dayItem = nearby.reduce((a,b) => Math.abs(a.y-cy)<Math.abs(b.y-cy)?a:b);
    const {year, month} = mois.ym;
    try {
      const d = new Date(year, month-1, dayItem.day);
      if (d.getMonth() !== month-1) return;
      const dateStr = dateToStr(d);
      const k = dateStr+'|'+cat.cat;
      if (seen.has(k)) return;
      seen.add(k);
      const endDate = new Date(year, month-1, dayItem.day+1);
      events.push({
        id:'pdf_'+Date.now()+'_'+Math.random().toString(36).substr(2,4),
        title:cat.label, start:dateStr, end:dateToStr(endDate), allDay:true,
        backgroundColor:fileColor, borderColor:fileColor, textColor:getContrast(fileColor),
        extendedProps:{fileId:'',filename,color:fileColor,category:cat.cat,resource:'',description:''}
      });
    } catch {}
  });

  // Compléter avec TPG/API/F depuis le texte
  items.filter(i => ['TPG','API','F'].includes(i.text.toUpperCase()) && i.y > monthY).forEach(item => {
    const cx=item.x+item.w/2, cy=item.y;
    const mois=ranges.find(r=>r.x0<=cx&&cx<=r.x1);
    if(!mois)return;
    const nearby=dayNums.filter(d=>Math.abs(d.xc-cx)<45&&Math.abs(d.y-cy)<22);
    if(!nearby.length)return;
    const dayItem=nearby.reduce((a,b)=>Math.abs(a.y-cy)<Math.abs(b.y-cy)?a:b);
    const {year,month}=mois.ym;
    try{
      const d=new Date(year,month-1,dayItem.day);
      if(d.getMonth()!==month-1)return;
      const dateStr=dateToStr(d);
      const CAT_MAP={'TPG':{cat:'TPG',color:'#e879f9',label:'TPG'},'API':{cat:'API',color:'#22b8d4',label:'API'},'F':{cat:'Fermeture',color:'#94a3b8',label:'Fermeture'}};
      const cat=CAT_MAP[item.text.toUpperCase()];if(!cat)return;
      const k=dateStr+'|'+cat.cat;if(seen.has(k))return;seen.add(k);
      events.push({id:'pdf_'+Date.now()+'_'+Math.random().toString(36).substr(2,4),
        title:cat.label,start:dateStr,end:dateToStr(new Date(year,month-1,dayItem.day+1)),allDay:true,
        backgroundColor:fileColor,borderColor:fileColor,textColor:getContrast(fileColor),
        extendedProps:{fileId:'',filename,color:fileColor,category:cat.cat,resource:'',description:''}});
    }catch{}
  });

  return events;
}


// ═══════════════════════════════════════════════════════════
// SIDEBAR / THEME
// ═══════════════════════════════════════════════════════════
function initSidebar(){
  document.getElementById('sidebarClose').onclick=()=>{document.getElementById('sidebar').classList.toggle('closed');document.getElementById('sidebar').classList.toggle('open');};
  document.getElementById('sidebarOpen').onclick=()=>{document.getElementById('sidebar').classList.toggle('closed');document.getElementById('sidebar').classList.toggle('open');};
}
function initTheme(){
  const btn=document.getElementById('themeBtn'),root=document.documentElement;
  const saved=localStorage.getItem('pv-theme')||'dark';root.dataset.theme=saved;btn.textContent=saved==='dark'?'☀ Mode clair':'☾ Mode sombre';
  btn.onclick=()=>{const next=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=next;btn.textContent=next==='dark'?'☀ Mode clair':'☾ Mode sombre';localStorage.setItem('pv-theme',next);updateDashIfOpen();};
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
// Nettoyer un nom de fichier pour affichage dans les couches
function cleanFileName(name) {
  return name
    .replace(/\.[^.]+$/, '')        // supprimer extension
    .replace(/[_\-]+/g, ' ')         // underscores/tirets → espaces
    .replace(/\s+/g, ' ')            // espaces multiples
    .trim()
    .substring(0, 26);               // tronquer
}

// Convertir un Date LOCAL en YYYY-MM-DD sans passer par UTC
function dateToStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

// Convertir un Date FullCalendar en YYYY-MM-DD
// FullCalendar fournit des dates UTC midnight pour les événements allDay
// → utiliser getUTC* pour éviter le décalage timezone (ex: UTC+2 en été)
function fcDateToStr(d) {
  if (!d) return '';
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth()+1).padStart(2,'0') + '-' +
    String(d.getUTCDate()).padStart(2,'0');
}

function getContrast(hex){try{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return(0.299*r+0.587*g+0.114*b)/255>.55?'#1a1a2e':'#fff';}catch{return'#fff';}}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3200);}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ═══════════════════════════════════════════════════════════
// GOMME, COPIE RAPIDE, UNDO, SAVE/LOAD
// ═══════════════════════════════════════════════════════════

// ── GOMME ────────────────────────────────────────────────
function toggleEraser() {
  if (S.eraserMode) {
    app_cancelEraser();
  } else {
    // Annuler le mode copie si actif
    if (S.pasteMode) cancelPaste();
    S.eraserMode = true;
    document.getElementById('eraserBtn').classList.add('active');
    document.getElementById('eraserBar').classList.remove('hide');
    document.getElementById('calWrap').classList.add('eraser-active');
    toast('🧹 Mode gomme — cliquez sur un événement pour le supprimer');
  }
}

function app_cancelEraser() {
  S.eraserMode = false;
  document.getElementById('eraserBtn')?.classList.remove('active');
  document.getElementById('eraserBar')?.classList.add('hide');
  document.getElementById('calWrap')?.classList.remove('eraser-active');
}

// ── BOUTON COPIER (barre d'outils) ───────────────────────
// Mode : 1er clic → attente de clic sur événement pour copier
//        Si clipboard déjà rempli → reste en mode collage
function toggleCopyMode() {
  if (S.pasteMode && S.clipboard) {
    // Déjà en mode collage → annuler
    cancelPaste();
    toast('Mode copie annulé');
  } else if (S.pasteMode && !S.clipboard) {
    // En attente de copie → annuler
    cancelPaste();
    toast('Mode copie annulé');
  } else {
    // Activer le mode : prochain clic sur événement = copier
    S.pasteMode = true;
    S.clipboard  = null;
    document.getElementById('copyToolBtn').classList.add('active');
    document.getElementById('pb-name').textContent = '…';
    document.getElementById('pastebar').classList.remove('hide');
    document.getElementById('calWrap').classList.add('cal-paste-mode');
    toast('📋 Cliquez sur un événement à copier, puis sur les dates pour coller');
  }
}

// ── UNDO (annulation) ─────────────────────────────────────
const MAX_UNDO = 50;

function pushUndo(type, data) {
  S.undoStack.push({ type, data, ts: Date.now() });
  if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();
  updateUndoBtn();
}

function updateUndoBtn() {
  const btn = document.getElementById('undoBtn');
  if (!btn) return;
  btn.disabled = S.undoStack.length === 0;
  if (S.undoStack.length > 0) {
    const t = S.undoStack[S.undoStack.length-1].type;
    const labels = { delete:'suppression', add:'ajout', edit:'modification', rename:'renommage' };
    btn.title = 'Annuler : ' + (labels[t] || t) + ' (Ctrl+Z)';
    btn.textContent = '↩';
  } else {
    btn.title = 'Rien à annuler';
    btn.textContent = '↩';
  }
}

function undoLast() {
  if (!S.undoStack.length) { toast('Rien à annuler'); return; }
  const action = S.undoStack.pop();
  updateUndoBtn();

  if (action.type === 'delete') {
    // Restaurer l'événement supprimé
    const snap = action.data;
    const layer = S.layers.find(l => l.id === snap.extendedProps.fileId);

    // S'assurer que la couche manuelle existe si besoin
    if (snap.extendedProps.fileId === 'manual') ensureManualLayer(snap.backgroundColor);

    S.calendar.addEvent({
      id: snap.id, title: snap.title,
      start: snap.start, end: snap.end, allDay: snap.allDay,
      backgroundColor: snap.backgroundColor,
      borderColor:     snap.borderColor,
      textColor:       snap.textColor,
      extendedProps:   snap.extendedProps
    });

    const l2 = S.layers.find(l => l.id === snap.extendedProps.fileId);
    if (l2 && !l2.events.find(e => e.id === snap.id)) l2.events.push({ id: snap.id });
    renderLayers(); updateDashIfOpen();
    toast('↩ Suppression annulée');

  } else if (action.type === 'add') {
    const ev = S.calendar.getEventById(action.data.id);
    if (ev) doDeleteEvent(ev);
    toast('↩ Ajout annulé');
  } else if (action.type === 'rename') {
    const ev = S.calendar.getEventById(action.data.id);
    if (ev) { ev.setProp('title', action.data.oldTitle); toast('↩ Renommage annulé'); }

  } else if (action.type === 'edit') {
    // Restaurer tous les champs de l'état précédent
    const snap = action.data;
    const ev   = S.calendar.getEventById(snap.id);
    if (ev) {
      ev.setProp('title',           snap.title);
      ev.setProp('backgroundColor', snap.backgroundColor);
      ev.setProp('borderColor',     snap.borderColor);
      ev.setProp('textColor',       snap.textColor);
      ev.setExtendedProp('category',    snap.extendedProps.category);
      ev.setExtendedProp('resource',    snap.extendedProps.resource);
      ev.setExtendedProp('description', snap.extendedProps.description);
      ev.setExtendedProp('color',       snap.extendedProps.color);
      // Restaurer les dates
      if (snap.allDay) {
        ev.setAllDay(true);
        ev.setStart(snap.start);
        ev.setEnd(snap.end);
      } else {
        ev.setAllDay(false);
        ev.setStart(new Date(snap.start));
        ev.setEnd(new Date(snap.end));
      }
      toast('↩ Modification annulée');
    }
  }
}

// Enregistrer les ajouts dans la pile undo
// createManualEvent remplacé par pasteOnDate inline
// Note: on ne peut pas override une fonction déclarée avec function,
// on patche plutôt le endroit où l'event est ajouté au calendrier
// → fait directement dans saveEvent et pasteOnDate ci-dessous

// ── SAVE / LOAD PROJET ───────────────────────────────────
function saveProject() {
  // Capturer tous les événements du calendrier
  const events = S.calendar.getEvents().map(ev => ({
    id:    ev.id,
    title: ev.title,
    start: ev.allDay ? fcDateToStr(ev.start) : ev.start?.toISOString(),
    end:   ev.end ? (ev.allDay ? fcDateToStr(ev.end) : ev.end.toISOString()) : null,
    allDay: ev.allDay,
    backgroundColor: ev.backgroundColor,
    borderColor:     ev.borderColor,
    textColor:       ev.textColor,
    extendedProps:   { ...ev.extendedProps }
  }));

  const project = {
    version: '2',
    savedAt: new Date().toISOString(),
    appName: 'PlanViz',
    layers: S.layers.map(l => ({
      id:      l.id,
      name:    l.name,
      color:   l.color,
      visible: l.visible,
      manual:  l.manual || false
    })),
    events,
    theme: document.documentElement.dataset.theme || 'dark'
  };

  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);

  // Nom de fichier avec date
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  a.download = `planviz_${stamp}.planviz`;
  a.click();
  URL.revokeObjectURL(a.href);

  toast(`💾 Projet sauvegardé (${events.length} événements)`);
}

function loadProject(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const project = JSON.parse(e.target.result);
      if (project.appName !== 'PlanViz' || !project.layers || !project.events) {
        alert('Fichier invalide — ce n\'est pas un projet PlanViz.');
        return;
      }

      if (S.layers.length > 0 || S.calendar.getEvents().length > 0) {
        if (!confirm(`Ouvrir "${file.name}" ?\n\nCela remplacera le planning actuel.`)) return;
      }

      // Effacer le calendrier actuel
      S.calendar.getEvents().forEach(ev => ev.remove());
      S.layers = [];
      S.allCategories = new Set();
      S.activeCategories = new Set();
      S.undoStack = [];
      renderLayers();
      updateBadge();
      updateUndoBtn();

      // Restaurer le thème
      if (project.theme) {
        document.documentElement.dataset.theme = project.theme;
        const btn = document.getElementById('themeBtn');
        if (btn) btn.textContent = project.theme === 'dark' ? '☀ Mode clair' : '☾ Mode sombre';
        localStorage.setItem('pv-theme', project.theme);
      }

      // Restaurer les couches (sans les événements encore)
      project.layers.forEach(l => {
        S.layers.push({ id:l.id, name:l.name, color:l.color, visible:l.visible, events:[], manual:l.manual||false });
      });

      // Restaurer les événements
      const eventsAdded = [];
      project.events.forEach(evData => {
        const layer = S.layers.find(l => l.id === evData.extendedProps?.fileId);

        S.calendar.addEvent({
          id:    evData.id,
          title: evData.title,
          start: evData.start,
          end:   evData.end,
          allDay: evData.allDay,
          backgroundColor: evData.backgroundColor,
          borderColor:     evData.borderColor,
          textColor:       evData.textColor,
          extendedProps:   evData.extendedProps || {}
        });

        if (layer) layer.events.push({ id: evData.id });
        if (evData.extendedProps?.category) S.allCategories.add(evData.extendedProps.category);
        eventsAdded.push(evData);
      });

      // Afficher/masquer selon visibilité sauvegardée
      project.layers.forEach(l => {
        if (!l.visible) {
          S.calendar.getEvents()
            .filter(ev => ev.extendedProps.fileId === l.id)
            .forEach(ev => ev.setProp('display', 'none'));
        }
      });

      renderLayers();
      updateBadge();
      renderCategoryChips();
      updateDashIfOpen();

      // Aller à la première date
      if (eventsAdded.length > 0) {
        const dates = eventsAdded.map(e => new Date(e.start)).filter(d => !isNaN(d)).sort((a,b)=>a-b);
        if (dates.length) S.calendar.gotoDate(dates[0]);
      }

      toast(`📂 Projet chargé — ${eventsAdded.length} événements, ${project.layers.length} couches`);

    } catch(err) {
      alert(`Erreur lors de l'ouverture du fichier:\n${err.message}`);
      console.error(err);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// undo intégré directement dans pasteOnDate et saveEvent

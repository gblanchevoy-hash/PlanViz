/**
 * app.js
 * Main application orchestrator
 */

// ── COLOR MANAGER ─────────────────────────────────────────────
class ColorManager {
  constructor() {
    this.usedColors = new Set();
    this.fileColors = {};
    this.categoryColors = {
      'formation':    '#6c8cf5',
      'congés':       '#4caf82',
      'congé':        '#4caf82',
      'holiday':      '#4caf82',
      'réunion':      '#f5a742',
      'meeting':      '#f5a742',
      'maintenance':  '#f56060',
      'projet':       '#a78bfa',
      'project':      '#a78bfa',
      'support':      '#38bdf8',
      'formation':    '#6c8cf5',
      'training':     '#6c8cf5',
      'absence':      '#fb7185',
      'atelier':      '#fbbf24',
      'workshop':     '#fbbf24',
    };
    this.keywordColors = {
      'formation': '#6c8cf5',
      'congé': '#4caf82',
      'réunion': '#f5a742',
      'maintenance': '#f56060',
      'urgence': '#ef4444',
      'urgent': '#ef4444',
      'formation': '#6c8cf5',
      'training': '#6c8cf5',
    };

    this.palette = [
      '#6c8cf5', '#4caf82', '#f5a742', '#f56060',
      '#a78bfa', '#38bdf8', '#fb7185', '#34d399',
      '#fbbf24', '#60a5fa', '#c084fc', '#4ade80',
      '#f472b6', '#22d3ee', '#a3e635', '#facc15',
    ];
  }

  assignColor(fileId) {
    if (this.fileColors[fileId]) return this.fileColors[fileId];
    const used = Object.values(this.fileColors);
    const available = this.palette.filter(c => !used.includes(c));
    const color = available.length > 0
      ? available[0]
      : this.palette[Object.keys(this.fileColors).length % this.palette.length];
    this.fileColors[fileId] = color;
    return color;
  }

  updateColor(fileId, color) {
    this.fileColors[fileId] = color;
  }

  colorForString(str) {
    if (!str) return this.palette[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return this.palette[Math.abs(hash) % this.palette.length];
  }
}

// ── MAIN APP ──────────────────────────────────────────────────
class PlanVizApp {
  constructor() {
    this.layers = [];
    this.colorManager = new ColorManager();
    this.importer = new ExcelImporter(this);
    this.calendarManager = new CalendarManager(this);
    this.exportManager = new ExportManager(this);
    this.dashboard = new Dashboard(this);
    this.filters = new Filters(this);
    this.pasteImporter = new PasteImporter(this);
    this.contextMenu = new EventContextMenu(this);
    this.colorMode = 'file';
  }

  init() {
    this.calendarManager.init();
    this.eventEditor = new EventEditor(this);
    this.filters.init();
    this.setupDropZone();
    this.setupSidebar();
    this.setupTheme();
    this.setupColorMode();
    this.setupConflictDetection();
    this.setupDashboard();
    this.addProgressBar();
    setTimeout(() => { this.eventEditor.init(); this.contextMenu.init(); }, 150);
  }

  // ── LAYER MANAGEMENT ──────────────────────────────────────
  addLayer(layer) {
    this.layers.push(layer);
    this.calendarManager.addEvents(layer.events);
    this.filters.registerEvents(layer.events);
    this.renderLayerList();
    this.updateBadge();
    this.dashboard.update();
    this.calendarManager.applyColorMode(this.colorMode, this.layers);

    // Jump to first event if calendar is empty before
    if (layer.events.length > 0 && this.layers.length === 1) {
      const firstDate = layer.events
        .map(e => new Date(e.start))
        .sort((a,b) => a-b)[0];
      if (firstDate) this.calendarManager.goToDate(firstDate);
    }
  }

  removeLayer(layerId) {
    this.layers = this.layers.filter(l => l.id !== layerId);
    this.calendarManager.removeLayerEvents(layerId);
    this.renderLayerList();
    this.updateBadge();
    this.dashboard.update();
  }

  toggleLayer(layerId) {
    const layer = this.layers.find(l => l.id === layerId);
    if (!layer) return;
    layer.visible = !layer.visible;
    this.calendarManager.toggleLayerVisibility(layerId, layer.visible);
    this.renderLayerList();
    this.dashboard.update();
  }

  updateLayerColor(layerId, color) {
    const layer = this.layers.find(l => l.id === layerId);
    if (!layer) return;
    layer.color = color;
    this.colorManager.updateColor(layerId, color);
    this.calendarManager.updateLayerColor(layerId, color);
    this.renderLayerList();
  }

  // ── LAYER UI ──────────────────────────────────────────────
  renderLayerList() {
    const list = document.getElementById('layerList');
    if (this.layers.length === 0) {
      list.innerHTML = '<div class="empty-layers">Aucun fichier importé</div>';
      return;
    }

    list.innerHTML = this.layers.map(layer => `
      <div class="layer-item" data-id="${layer.id}">
        <input type="checkbox" class="layer-toggle"
          style="accent-color:${layer.color}"
          ${layer.visible ? 'checked' : ''}
          onchange="app.toggleLayer('${layer.id}')"
          title="${layer.visible ? 'Masquer' : 'Afficher'}">
        <div class="layer-color color-picker-wrapper" title="Changer la couleur"
          style="background:${layer.color}">
          <input type="color" value="${layer.color}"
            oninput="app.updateLayerColor('${layer.id}', this.value)">
        </div>
        <span class="layer-name" title="${layer.name}">${this.truncate(layer.name.replace(/\.[^.]+$/, ''), 22)}</span>
        <span class="layer-count">${layer.events.length}</span>
        <button class="layer-remove" onclick="app.removeLayer('${layer.id}')" title="Supprimer">✕</button>
      </div>
    `).join('');
  }

  updateBadge() {
    document.getElementById('layerCount').textContent = this.layers.length;
  }

  // ── DROP ZONE ─────────────────────────────────────────────
  setupDropZone() {
    const zone = document.getElementById('dropZone');
    const input = document.getElementById('fileInput');

    input.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      this.importer.importFiles(files);
      input.value = '';
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files)
        .filter(f => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (files.length === 0) {
        alert('Formats acceptés : .xlsx, .xls, .csv');
        return;
      }
      this.importer.importFiles(files);
    });
  }

  // ── SIDEBAR ───────────────────────────────────────────────
  setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebarToggle');
    const mobileBtn = document.getElementById('mobileSidebarToggle');

    btn.addEventListener('click', () => {
      const open = sidebar.classList.toggle('open');
      btn.textContent = open ? '‹' : '›';
    });

    mobileBtn?.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 900 &&
          sidebar.classList.contains('open') &&
          !sidebar.contains(e.target) &&
          e.target !== mobileBtn) {
        sidebar.classList.remove('open');
      }
    });
  }

  // ── THEME ─────────────────────────────────────────────────
  setupTheme() {
    const btn = document.getElementById('themeToggle');
    const html = document.documentElement;

    // Load saved preference
    const saved = localStorage.getItem('planviz-theme') || 'dark';
    html.dataset.theme = saved;
    btn.textContent = saved === 'dark' ? '☀ Mode clair' : '☾ Mode sombre';

    btn.addEventListener('click', () => {
      const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
      html.dataset.theme = next;
      btn.textContent = next === 'dark' ? '☀ Mode clair' : '☾ Mode sombre';
      localStorage.setItem('planviz-theme', next);
      // Re-render charts with new theme
      if (this.dashboard.visible) this.dashboard.update();
    });
  }

  // ── COLOR MODE ────────────────────────────────────────────
  setupColorMode() {
    document.querySelectorAll('.radio-option').forEach(label => {
      label.addEventListener('click', () => {
        document.querySelectorAll('.radio-option').forEach(l => l.classList.remove('active'));
        label.classList.add('active');
        this.colorMode = label.dataset.mode;
        this.calendarManager.applyColorMode(this.colorMode, this.layers);
      });
    });
  }

  // ── CONFLICT DETECTION ────────────────────────────────────
  setupConflictDetection() {
    document.getElementById('conflictToggle').addEventListener('click', () => {
      const panel = document.getElementById('conflictPanel');
      const conflicts = this.calendarManager.detectConflicts(this.layers);

      const list = document.getElementById('conflictList');
      if (conflicts.length === 0) {
        list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px">Aucun conflit détecté ✓</div>';
      } else {
        list.innerHTML = conflicts.slice(0, 50).map(c => `
          <div class="conflict-item">
            <strong>${c.label}</strong>
            ${c.events.map(e => `• ${e.title} (${e.start ? e.start.toLocaleDateString('fr-FR') : ''})`).join('<br>')}
          </div>
        `).join('');
      }

      panel.classList.toggle('hidden');
    });
  }

  // ── DASHBOARD ─────────────────────────────────────────────
  setupDashboard() {
    document.getElementById('dashboardToggle').addEventListener('click', () => {
      this.dashboard.toggle();
    });
  }

  // ── PROGRESS BAR ─────────────────────────────────────────
  addProgressBar() {
    const wrap = document.createElement('div');
    wrap.className = 'progress-bar-wrap';
    wrap.id = 'progressBar';
    wrap.innerHTML = '<div class="progress-bar" style="width:0%"></div>';
    document.body.appendChild(wrap);
  }

  showProgress(show) {
    const bar = document.querySelector('#progressBar .progress-bar');
    if (!bar) return;
    if (show) {
      bar.style.width = '70%';
    } else {
      bar.style.width = '100%';
      setTimeout(() => { bar.style.width = '0%'; }, 400);
    }
  }

  // ── UTILS ─────────────────────────────────────────────────
  truncate(str, n) {
    return str.length > n ? str.substring(0, n) + '…' : str;
  }
}

// ── BOOT ──────────────────────────────────────────────────────
const app = new PlanVizApp();
document.addEventListener('DOMContentLoaded', () => app.init());

/**
 * dashboard.js
 * Statistics panel with Chart.js charts
 */
class Dashboard {
  constructor(app) {
    this.app = app;
    this.charts = {};
    this.visible = false;
  }

  toggle() {
    const el = document.getElementById('dashboard');
    this.visible = !this.visible;
    el.classList.toggle('hidden', !this.visible);
    if (this.visible) this.update();
  }

  update() {
    if (!this.visible) return;
    const events = this.app.calendarManager.getAllEvents();
    const layers = this.app.layers;

    // Stats
    const totalTasks = events.length;
    const totalFiles = layers.length;
    const conflicts = this.app.calendarManager.detectConflicts(layers);

    document.getElementById('statTasks').textContent = totalTasks;
    document.getElementById('statFiles').textContent = totalFiles;
    document.getElementById('statConflicts').textContent = conflicts.length;

    // Occupancy: % of days in current view that have events
    const occupancy = this.calcOccupancy(events);
    document.getElementById('statOccupancy').textContent = occupancy + '%';

    // Charts
    this.updateCategoryChart(events);
    this.updateWeeklyChart(events);
    this.updateFileChart(events, layers);
  }

  calcOccupancy(events) {
    if (events.length === 0) return 0;
    const dates = new Set();
    events.forEach(ev => {
      if (ev.start) dates.add(ev.start.toISOString().slice(0,10));
    });
    const view = this.app.calendarManager.calendar.view;
    if (!view) return 0;
    const start = view.currentStart;
    const end = view.currentEnd;
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    return Math.round((dates.size / totalDays) * 100);
  }

  updateCategoryChart(events) {
    const counts = {};
    events.forEach(ev => {
      const cat = ev.extendedProps.category || 'Sans catégorie';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 8);
    const labels = sorted.map(e => e[0]);
    const data = sorted.map(e => e[1]);
    const colors = labels.map((_, i) => this.palette(i));

    this.renderChart('categoryChart', 'doughnut', {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0 }]
    });
  }

  updateWeeklyChart(events) {
    const weekCounts = {};
    events.forEach(ev => {
      if (!ev.start) return;
      const week = this.getWeekKey(ev.start);
      weekCounts[week] = (weekCounts[week] || 0) + 1;
    });

    const sorted = Object.entries(weekCounts).sort((a,b) => a[0].localeCompare(b[0])).slice(-16);
    const labels = sorted.map(e => {
      const [y, w] = e[0].split('-W');
      return `S${w}`;
    });
    const data = sorted.map(e => e[1]);

    this.renderChart('weeklyChart', 'bar', {
      labels,
      datasets: [{
        label: 'Tâches',
        data,
        backgroundColor: this.app.layers[0]?.color || '#6c8cf5',
        borderRadius: 4
      }]
    });
  }

  updateFileChart(events, layers) {
    const fileCounts = {};
    events.forEach(ev => {
      const fid = ev.extendedProps.fileId;
      fileCounts[fid] = (fileCounts[fid] || 0) + 1;
    });

    const labels = layers.map(l => l.name.replace(/\.[^.]+$/, '').substring(0, 20));
    const data = layers.map(l => fileCounts[l.id] || 0);
    const colors = layers.map(l => l.color);

    this.renderChart('fileChart', 'bar', {
      labels,
      datasets: [{
        label: 'Événements',
        data,
        backgroundColor: colors,
        borderRadius: 4
      }]
    }, { indexAxis: 'y' });
  }

  renderChart(canvasId, type, data, extraOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#8b90a0' : '#5a6080';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    this.charts[canvasId] = new Chart(canvas, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: {
            display: type === 'doughnut',
            position: 'right',
            labels: {
              color: textColor,
              font: { size: 10 },
              boxWidth: 10,
              padding: 8
            }
          },
          tooltip: {
            backgroundColor: isDark ? '#1c2030' : '#ffffff',
            titleColor: isDark ? '#e8eaf0' : '#1a1d2e',
            bodyColor: textColor,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            borderWidth: 1
          }
        },
        scales: type !== 'doughnut' ? {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } }
          }
        } : {},
        ...extraOptions
      }
    });
  }

  getWeekKey(date) {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2,'0')}`;
  }

  palette(i) {
    const colors = ['#6c8cf5','#4caf82','#f5a742','#f56060','#a78bfa','#38bdf8','#fb7185','#34d399'];
    return colors[i % colors.length];
  }
}

/**
 * excelImporter.js — v2
 * Fixes: _EMPTY headers, merged cells, blank top rows
 * Adds: always-show mapping modal with real column names
 */
class ExcelImporter {
  constructor(app) {
    this.app = app;
    this.pendingFile = null;
    this.pendingData = null;
    this.pendingColumns = null;
    this.pendingAutoMapping = {};
  }

  // ── PARSE FILE ────────────────────────────────────────────
  async parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const result = this.smartParse(sheet);
          resolve(result);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async parseCSV(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'string' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const result = this.smartParse(sheet);
          resolve(result);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ── SMART PARSE: handles _EMPTY, merged cells, skip blank rows ──
  smartParse(sheet) {
    // Get all rows as arrays first (no header assumption)
    const allRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,       // returns array of arrays
      raw: false,
      defval: ''
    });

    if (!allRows || allRows.length === 0) return [];

    // Find the first non-empty row (= header row)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const row = allRows[i];
      const nonEmpty = row.filter(c => String(c).trim() !== '').length;
      if (nonEmpty >= 2) { headerRowIdx = i; break; }
    }

    const rawHeaders = allRows[headerRowIdx];

    // Clean headers: replace empty/null with positional names
    const headers = rawHeaders.map((h, i) => {
      const clean = String(h).trim();
      if (!clean || clean === '' || clean.startsWith('_EMPTY') || clean === 'undefined') {
        return `Colonne_${i + 1}`;
      }
      return clean;
    });

    // Build rows from remaining data rows
    const dataRows = allRows.slice(headerRowIdx + 1);
    const result = [];
    for (const rawRow of dataRows) {
      // Skip fully empty rows
      if (rawRow.every(c => String(c).trim() === '')) continue;
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = rawRow[i] !== undefined ? String(rawRow[i]) : '';
      });
      result.push(obj);
    }

    return result;
  }

  // ── AUTO-DETECT COLUMNS ──────────────────────────────────
  detectColumns(headers) {
    const mapping = {};
    const fields = {
      startDate: ['date début', 'start date', 'début', 'start', 'date_debut', 'from', 'de', 'date de début', 'startdate', 'date_start', 'date'],
      endDate:   ['date fin', 'end date', 'fin', 'end', 'date_fin', 'to', 'au', 'date de fin', 'enddate', 'date_end'],
      startTime: ['heure début', 'heure de début', 'start time', 'heure_debut', 'time start', 'début heure', 'starttime', 'heure'],
      endTime:   ['heure fin', 'heure de fin', 'end time', 'heure_fin', 'time end', 'fin heure', 'endtime'],
      title:     ['titre', 'title', 'tâche', 'tache', 'task', 'nom', 'name', 'libellé', 'label', 'sujet', 'subject', 'activité', 'activite', 'activity', 'description courte'],
      category:  ['catégorie', 'categorie', 'category', 'type', 'groupe', 'group', 'famille', 'tag'],
      resource:  ['ressource', 'resource', 'intervenant', 'personne', 'person', 'employé', 'employe', 'employee', 'assigné', 'assigned', 'responsable'],
      description: ['description', 'détail', 'detail', 'note', 'notes', 'commentaire', 'comment', 'remarque']
    };

    const normalise = s => s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ').trim();

    for (const [field, keywords] of Object.entries(fields)) {
      for (const header of headers) {
        if (header.startsWith('Colonne_')) continue;
        const h = normalise(header);
        if (keywords.some(k => h.includes(normalise(k)) || normalise(k).includes(h))) {
          if (!mapping[field]) mapping[field] = header;
        }
      }
    }
    return mapping;
  }

  // ── PARSE DATE ───────────────────────────────────────────
  parseDate(value, timeValue = '') {
    if (!value || String(value).trim() === '') return null;
    if (value instanceof Date && !isNaN(value)) {
      const d = new Date(value);
      if (timeValue) this.applyTime(d, timeValue);
      return d;
    }

    const str = String(value).trim();

    // ISO YYYY-MM-DD
    let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const d = new Date(+m[1], +m[2]-1, +m[3]);
      if (timeValue) this.applyTime(d, timeValue); else this.applyTimeFromStr(d, str);
      return isNaN(d.getTime()) ? null : d;
    }

    // European DD/MM/YYYY or DD.MM.YYYY
    m = str.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/);
    if (m) {
      const d = new Date(+m[3], +m[2]-1, +m[1]);
      if (timeValue) this.applyTime(d, timeValue); else this.applyTimeFromStr(d, str);
      return isNaN(d.getTime()) ? null : d;
    }

    // Excel serial
    const num = parseFloat(str);
    if (!isNaN(num) && num > 1000 && num < 100000) {
      const d = new Date((num - 25569) * 86400 * 1000);
      if (timeValue) this.applyTime(d, timeValue);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(str);
    if (timeValue) this.applyTime(d, timeValue);
    return isNaN(d.getTime()) ? null : d;
  }

  applyTime(date, timeStr) {
    const t = this.parseTime(timeStr);
    if (t) date.setHours(t.hours, t.minutes, 0, 0);
  }

  applyTimeFromStr(date, str) {
    const m = str.match(/(\d{1,2}):(\d{2})/);
    if (m) date.setHours(+m[1], +m[2], 0, 0);
  }

  parseTime(value) {
    if (!value) return null;
    const str = String(value).trim();
    const m = str.match(/(\d{1,2}):(\d{2})/);
    if (m) return { hours: +m[1], minutes: +m[2] };
    const h = str.match(/^(\d{1,2})h(\d{0,2})$/i);
    if (h) return { hours: +h[1], minutes: +(h[2] || 0) };
    return null;
  }

  // ── ROWS → EVENTS ─────────────────────────────────────────
  rowsToEvents(rows, mapping, fileId, color, filename) {
    const events = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const startRaw    = mapping.startDate ? row[mapping.startDate] : null;
      const endRaw      = mapping.endDate   ? row[mapping.endDate]   : null;
      const startTimeRaw = mapping.startTime ? row[mapping.startTime] : '';
      const endTimeRaw   = mapping.endTime   ? row[mapping.endTime]   : '';

      const startDate = this.parseDate(startRaw, startTimeRaw);
      if (!startDate) { skipped++; continue; }

      let endDate = endRaw ? this.parseDate(endRaw, endTimeRaw) : null;
      if (!endDate || endDate <= startDate) {
        endDate = new Date(startDate);
        endDate.setHours(endDate.getHours() + 1);
      }

      const title = mapping.title && row[mapping.title]
        ? String(row[mapping.title]).trim()
        : `Tâche ${i + 1}`;

      events.push({
        id: `${fileId}_${i}`,
        title,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        backgroundColor: color,
        borderColor: color,
        textColor: this.getContrastColor(color),
        extendedProps: {
          fileId, filename, color,
          category:    mapping.category    ? String(row[mapping.category]    || '').trim() : '',
          resource:    mapping.resource    ? String(row[mapping.resource]    || '').trim() : '',
          description: mapping.description ? String(row[mapping.description] || '').trim() : '',
          rawRow: row
        }
      });
    }

    if (skipped > 0)
      console.warn(`[PlanViz] ${skipped} lignes ignorées dans "${filename}" (dates invalides)`);

    return events;
  }

  getContrastColor(hex) {
    try {
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);
      return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.5 ? '#1a1a2e' : '#ffffff';
    } catch { return '#ffffff'; }
  }

  // ── IMPORT FLOW ──────────────────────────────────────────
  async importFiles(files) {
    for (const file of files) await this.importSingleFile(file);
  }

  async importSingleFile(file) {
    this.app.showProgress(true);
    try {
      let rows;
      if (file.name.toLowerCase().endsWith('.csv')) {
        rows = await this.parseCSV(file);
      } else {
        rows = await this.parseFile(file);
      }

      if (!rows || rows.length === 0) {
        alert(`Le fichier "${file.name}" est vide ou illisible.`);
        return;
      }

      const headers = Object.keys(rows[0]);
      const autoMapping = this.detectColumns(headers);

      this.pendingFile = file;
      this.pendingData = rows;
      this.pendingColumns = headers;
      this.pendingAutoMapping = autoMapping;

      // Always show mapping modal so user can verify/adjust
      this.showMappingModal(file.name, headers, rows, autoMapping);

    } catch (err) {
      alert(`Erreur lors de la lecture de "${file.name}": ${err.message}`);
      console.error(err);
    } finally {
      this.app.showProgress(false);
    }
  }

  // ── MAPPING MODAL ────────────────────────────────────────
  showMappingModal(filename, headers, rows, autoMapping) {
    const modal = document.getElementById('mappingModal');
    document.getElementById('mappingFileName').textContent = filename;

    // Preview table (first 4 rows)
    const preview = document.getElementById('mappingPreview');
    const previewRows = rows.slice(0, 4);
    const colW = Math.max(12, Math.floor(78 / Math.min(headers.length, 6)));
    const visHeaders = headers.slice(0, 6);

    let previewText = visHeaders.map(h => h.substring(0,colW).padEnd(colW)).join(' │ ') + '\n';
    previewText += visHeaders.map(() => '─'.repeat(colW)).join('─┼─') + '\n';
    previewRows.forEach(row => {
      previewText += visHeaders.map(h => String(row[h]||'').substring(0,colW).padEnd(colW)).join(' │ ') + '\n';
    });
    if (headers.length > 6) previewText += `… (${headers.length - 6} colonnes supplémentaires)`;
    preview.textContent = previewText;

    // Mapping selects
    const fields = {
      startDate:   'Date de début ★',
      endDate:     'Date de fin',
      startTime:   'Heure de début',
      endTime:     'Heure de fin',
      title:       'Nom de la tâche',
      category:    'Catégorie',
      resource:    'Ressource / Intervenant',
      description: 'Description'
    };

    const container = document.getElementById('mappingFields');
    container.innerHTML = '';

    for (const [field, label] of Object.entries(fields)) {
      const div = document.createElement('div');
      div.className = 'mapping-row';

      const lbl = document.createElement('label');
      lbl.textContent = label;

      const sel = document.createElement('select');
      sel.id = `map_${field}`;

      // Empty option
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '— Ignorer —';
      sel.appendChild(emptyOpt);

      // All real headers as options
      headers.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        // Show a sample value for clarity
        const sample = rows[0] ? String(rows[0][h] || '').substring(0, 20) : '';
        opt.textContent = sample ? `${h}  [ex: ${sample}]` : h;
        if (autoMapping[field] === h) opt.selected = true;
        sel.appendChild(opt);
      });

      div.appendChild(lbl);
      div.appendChild(sel);
      container.appendChild(div);
    }

    modal.classList.remove('hidden');
  }

  confirmMapping() {
    const fields = ['startDate','endDate','startTime','endTime','title','category','resource','description'];
    const mapping = {};
    fields.forEach(f => {
      const sel = document.getElementById(`map_${f}`);
      if (sel && sel.value) mapping[f] = sel.value;
    });

    if (!mapping.startDate) {
      alert('Veuillez sélectionner au minimum la colonne "Date de début ★".');
      return;
    }

    document.getElementById('mappingModal').classList.add('hidden');
    this.finalizeImport(mapping);
  }

  cancelMapping() {
    document.getElementById('mappingModal').classList.add('hidden');
    this.pendingFile = null;
    this.pendingData = null;
  }

  finalizeImport(mapping) {
    if (!this.pendingData) return;
    const fileId = 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
    const color = this.app.colorManager.assignColor(fileId);
    const events = this.rowsToEvents(this.pendingData, mapping, fileId, color, this.pendingFile.name);

    if (events.length === 0) {
      alert(`Aucun événement importé depuis "${this.pendingFile.name}".\nVérifiez que la colonne "Date de début" contient des dates valides.`);
      this.pendingFile = null;
      this.pendingData = null;
      return;
    }

    this.app.addLayer({ id: fileId, name: this.pendingFile.name, color, events, visible: true, mapping });
    this.pendingFile = null;
    this.pendingData = null;
  }
}

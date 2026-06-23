/**
 * pasteImporter.js
 * Parses TSV data pasted directly from Excel (Ctrl+C / Ctrl+V)
 */
class PasteImporter {
  constructor(app) {
    this.app = app;
    this.parsedRows = [];
    this.parsedHeaders = [];
  }

  // ── OPEN PASTE MODAL ──────────────────────────────────────
  open() {
    document.getElementById('pasteArea').value = '';
    document.getElementById('pastePreviewWrap').classList.add('hidden');
    document.getElementById('pasteImportBtn').disabled = true;
    this.parsedRows = [];
    this.parsedHeaders = [];
    document.getElementById('pasteModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('pasteArea').focus(), 100);

    // Listen for paste
    const area = document.getElementById('pasteArea');
    area.oninput = () => this.onPasteInput(area.value);
    area.onpaste = (e) => {
      setTimeout(() => this.onPasteInput(area.value), 50);
    };
  }

  close() {
    document.getElementById('pasteModal').classList.add('hidden');
  }

  // ── PARSE PASTED TSV ──────────────────────────────────────
  onPasteInput(raw) {
    const result = this.parseTSV(raw);
    if (!result || result.rows.length === 0) {
      document.getElementById('pastePreviewWrap').classList.add('hidden');
      document.getElementById('pasteImportBtn').disabled = true;
      return;
    }

    this.parsedHeaders = result.headers;
    this.parsedRows = result.rows;

    // Show preview
    document.getElementById('pasteRowCount').textContent = result.rows.length;
    this.renderPreview(result.headers, result.rows);
    document.getElementById('pastePreviewWrap').classList.remove('hidden');
    document.getElementById('pasteImportBtn').disabled = false;
  }

  parseTSV(raw) {
    if (!raw || !raw.trim()) return null;

    // Split into lines, filter blank
    const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return null;

    // Split each line by TAB (Excel default copy separator)
    const allCells = lines.map(l => l.split('\t').map(c => c.trim()));

    // Find header row: first row with at least 2 non-empty cells
    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, allCells.length); i++) {
      if (allCells[i].filter(c => c !== '').length >= 2) { headerIdx = i; break; }
    }

    const rawHeaders = allCells[headerIdx];
    const headers = rawHeaders.map((h, i) => {
      const clean = h.replace(/[""]/g, '').trim();
      return clean || `Col ${i + 1}`;
    });

    const rows = [];
    for (let i = headerIdx + 1; i < allCells.length; i++) {
      const cells = allCells[i];
      if (cells.every(c => c === '')) continue;
      const obj = {};
      headers.forEach((h, j) => { obj[h] = cells[j] || ''; });
      rows.push(obj);
    }

    return rows.length > 0 ? { headers, rows } : null;
  }

  renderPreview(headers, rows) {
    const container = document.getElementById('pastePreviewTable');
    const preview = rows.slice(0, 5);

    let html = '<table class="preview-table"><thead><tr>';
    headers.forEach(h => { html += `<th>${this.esc(h)}</th>`; });
    html += '</tr></thead><tbody>';
    preview.forEach(row => {
      html += '<tr>';
      headers.forEach(h => { html += `<td>${this.esc(String(row[h] || ''))}</td>`; });
      html += '</tr>';
    });
    if (rows.length > 5) {
      html += `<tr><td colspan="${headers.length}" style="text-align:center;opacity:0.5;font-style:italic">… ${rows.length - 5} lignes supplémentaires</td></tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  // ── IMPORT: show mapping modal ────────────────────────────
  importPasted() {
    if (!this.parsedRows.length) return;
    this.close();
    this.showMappingModal();
  }

  showMappingModal() {
    const headers = this.parsedHeaders;
    const rows = this.parsedRows;
    const autoMap = this.app.importer.detectColumns(headers);

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

    const container = document.getElementById('pasteMappingFields');
    container.innerHTML = '';

    for (const [field, label] of Object.entries(fields)) {
      const div = document.createElement('div');
      div.className = 'mapping-row';
      const lbl = document.createElement('label');
      lbl.textContent = label;
      const sel = document.createElement('select');
      sel.id = `pasteMap_${field}`;

      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '— Ignorer —';
      sel.appendChild(emptyOpt);

      headers.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        const sample = rows[0] ? String(rows[0][h] || '').substring(0, 18) : '';
        opt.textContent = sample ? `${h}  [ex: ${sample}]` : h;
        if (autoMap[field] === h) opt.selected = true;
        sel.appendChild(opt);
      });

      div.appendChild(lbl);
      div.appendChild(sel);
      container.appendChild(div);
    }

    document.getElementById('pasteMappingModal').classList.remove('hidden');
  }

  closeMapping() {
    document.getElementById('pasteMappingModal').classList.add('hidden');
  }

  confirmMapping() {
    const fields = ['startDate','endDate','startTime','endTime','title','category','resource','description'];
    const mapping = {};
    fields.forEach(f => {
      const sel = document.getElementById(`pasteMap_${f}`);
      if (sel && sel.value) mapping[f] = sel.value;
    });

    if (!mapping.startDate) {
      alert('Veuillez sélectionner la colonne "Date de début ★".');
      return;
    }

    this.closeMapping();

    const fileId = 'paste_' + Date.now();
    const color = this.app.colorManager.assignColor(fileId);
    const importer = this.app.importer;
    const events = importer.rowsToEvents(this.parsedRows, mapping, fileId, color, 'Données collées');

    if (events.length === 0) {
      alert('Aucun événement détecté. Vérifiez que la colonne "Date de début" contient des dates valides.');
      return;
    }

    this.app.addLayer({
      id: fileId,
      name: 'Données collées',
      color,
      events,
      visible: true,
      mapping
    });

    this.parsedRows = [];
    this.parsedHeaders = [];
  }

  esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}

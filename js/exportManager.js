/**
 * exportManager.js
 * Handles PDF, PNG, Excel, and CSV exports
 */
class ExportManager {
  constructor(app) {
    this.app = app;
  }

  // ── PDF ───────────────────────────────────────────────────
  async exportPDF() {
    const { jsPDF } = window.jspdf;
    const calendarEl = document.getElementById('calendarWrapper');

    try {
      this.app.showProgress(true);
      const canvas = await html2canvas(calendarEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-base').trim() || '#0d0f14'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const availW = pageW - 2 * margin;
      const availH = pageH - 2 * margin - 20;

      const ratio = canvas.width / canvas.height;
      let imgW = availW;
      let imgH = imgW / ratio;
      if (imgH > availH) { imgH = availH; imgW = imgH * ratio; }

      // Title
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('PlanViz — Export du planning', margin, margin + 8);

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Exporté le ${new Date().toLocaleString('fr-FR')}`, margin, margin + 14);

      // Legend
      const layers = this.app.layers;
      let legendX = margin;
      layers.forEach(layer => {
        if (legendX + 50 > pageW - margin) return;
        pdf.setFillColor(...this.hexToRgb(layer.color));
        pdf.rect(legendX, margin + 17, 4, 4, 'F');
        pdf.setFontSize(7);
        pdf.text(layer.name.substring(0, 20), legendX + 6, margin + 21);
        legendX += layer.name.substring(0, 20).length * 2 + 12;
      });

      pdf.addImage(imgData, 'PNG', margin, margin + 22, imgW, imgH);
      pdf.save(`planviz_${this.dateStamp()}.pdf`);
    } catch (err) {
      alert('Erreur lors de l\'export PDF: ' + err.message);
      console.error(err);
    } finally {
      this.app.showProgress(false);
    }
  }

  // ── PNG ───────────────────────────────────────────────────
  async exportPNG() {
    const calendarEl = document.getElementById('calendarWrapper');
    try {
      this.app.showProgress(true);
      const canvas = await html2canvas(calendarEl, {
        scale: 3,
        useCORS: true,
        allowTaint: true
      });
      const link = document.createElement('a');
      link.download = `planviz_${this.dateStamp()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      alert('Erreur lors de l\'export PNG: ' + err.message);
    } finally {
      this.app.showProgress(false);
    }
  }

  // ── EXCEL ─────────────────────────────────────────────────
  exportExcel() {
    const events = this.app.calendarManager.getAllEvents();
    const rows = events.map(ev => ({
      'Titre': ev.title,
      'Début': ev.start ? ev.start.toLocaleString('fr-FR') : '',
      'Fin': ev.end ? ev.end.toLocaleString('fr-FR') : '',
      'Catégorie': ev.extendedProps.category || '',
      'Ressource': ev.extendedProps.resource || '',
      'Description': ev.extendedProps.description || '',
      'Source': ev.extendedProps.filename || '',
      'Couleur': ev.extendedProps.color || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planning fusionné');

    // Layer sheets
    this.app.layers.forEach(layer => {
      const layerEvents = events.filter(ev => ev.extendedProps.fileId === layer.id);
      if (layerEvents.length === 0) return;
      const sheetRows = layerEvents.map(ev => ({
        'Titre': ev.title,
        'Début': ev.start ? ev.start.toLocaleString('fr-FR') : '',
        'Fin': ev.end ? ev.end.toLocaleString('fr-FR') : '',
        'Catégorie': ev.extendedProps.category || '',
        'Ressource': ev.extendedProps.resource || '',
        'Description': ev.extendedProps.description || ''
      }));
      const ws2 = XLSX.utils.json_to_sheet(sheetRows);
      const sheetName = layer.name.substring(0, 31).replace(/[:\\\/\?\*\[\]]/g, '_');
      XLSX.utils.book_append_sheet(wb, ws2, sheetName);
    });

    XLSX.writeFile(wb, `planviz_export_${this.dateStamp()}.xlsx`);
  }

  // ── CSV ───────────────────────────────────────────────────
  exportCSV() {
    const events = this.app.calendarManager.getAllEvents();
    const headers = ['Titre','Début','Fin','Catégorie','Ressource','Description','Source'];
    const rows = events.map(ev => [
      `"${(ev.title || '').replace(/"/g, '""')}"`,
      `"${ev.start ? ev.start.toLocaleString('fr-FR') : ''}"`,
      `"${ev.end ? ev.end.toLocaleString('fr-FR') : ''}"`,
      `"${(ev.extendedProps.category || '').replace(/"/g, '""')}"`,
      `"${(ev.extendedProps.resource || '').replace(/"/g, '""')}"`,
      `"${(ev.extendedProps.description || '').replace(/"/g, '""')}"`,
      `"${(ev.extendedProps.filename || '').replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `planviz_${this.dateStamp()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── HELPERS ───────────────────────────────────────────────
  dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return [r, g, b];
  }
}

/**
 * filters.js
 * Manages filter state and UI
 */
class Filters {
  constructor(app) {
    this.app = app;
    this.state = {
      search: '',
      categories: new Set(),
      dateFrom: null,
      dateTo: null
    };
    this.allCategories = new Set();
    this._debounceTimer = null;
  }

  init() {
    // Search
    document.getElementById('searchFilter').addEventListener('input', (e) => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this.state.search = e.target.value.trim();
        this.apply();
      }, 200);
    });

    // Dates
    document.getElementById('dateFrom').addEventListener('change', (e) => {
      this.state.dateFrom = e.target.value ? new Date(e.target.value) : null;
      this.apply();
    });

    document.getElementById('dateTo').addEventListener('change', (e) => {
      this.state.dateTo = e.target.value ? new Date(e.target.value + 'T23:59:59') : null;
      this.apply();
    });

    document.getElementById('clearDates').addEventListener('click', () => {
      document.getElementById('dateFrom').value = '';
      document.getElementById('dateTo').value = '';
      this.state.dateFrom = null;
      this.state.dateTo = null;
      this.apply();
    });
  }

  registerEvents(events) {
    events.forEach(ev => {
      const cat = ev.extendedProps.category;
      if (cat) this.allCategories.add(cat);
    });
    this.renderCategoryChips();
  }

  renderCategoryChips() {
    const container = document.getElementById('categoryFilters');
    container.innerHTML = '';

    this.allCategories.forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (this.state.categories.has(cat) ? ' active' : '');
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        if (this.state.categories.has(cat)) {
          this.state.categories.delete(cat);
          chip.classList.remove('active');
        } else {
          this.state.categories.add(cat);
          chip.classList.add('active');
        }
        this.apply();
      });
      container.appendChild(chip);
    });
  }

  apply() {
    this.app.calendarManager.applyFilters(this.state, this.app.layers);
  }

  reset() {
    this.state = { search: '', categories: new Set(), dateFrom: null, dateTo: null };
    document.getElementById('searchFilter').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    this.renderCategoryChips();
    this.apply();
  }
}

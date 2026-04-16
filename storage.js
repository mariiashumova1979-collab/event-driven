// storage.js — Persistence layer. localStorage + JSON import/export.
'use strict';

const Storage = (() => {

  const KEY = 'impulse_swing_v1';

  function defaultData() {
    return {
      setups: [],
      trades: [],
      app_settings: {
        default_account_size:  25000,
        default_risk_percent:  1
      }
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      // Merge with defaults to handle schema additions
      return {
        ...defaultData(),
        ...parsed,
        app_settings: { ...defaultData().app_settings, ...(parsed.app_settings || {}) }
      };
    } catch (e) {
      console.warn('Storage.loadData failed:', e);
      return defaultData();
    }
  }

  function saveData(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Storage.saveData failed:', e);
      return false;
    }
  }

  function exportJSON(data) {
    const payload = JSON.stringify(data, null, 2);
    const blob    = new Blob([payload], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    const date    = new Date().toISOString().slice(0, 10);
    a.href        = url;
    a.download    = `impulse_swing_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data || typeof data !== 'object') throw new Error('Invalid structure');
          resolve(data);
        } catch (err) {
          reject(new Error('Invalid JSON: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsText(file);
    });
  }

  function clearAll() {
    localStorage.removeItem(KEY);
    return defaultData();
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  return { loadData, saveData, exportJSON, importJSON, clearAll, generateId, defaultData };

})();

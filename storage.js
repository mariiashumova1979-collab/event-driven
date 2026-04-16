// storage.js — Persistence layer. localStorage + JSON import/export + GitHub sync.
'use strict';

const Storage = (() => {

  const KEY        = 'impulse_swing_v1';
  const GITHUB_KEY = 'impulse_swing_github_cfg';

  function defaultData() {
    return {
      setups: [],
      trades: [],
      app_settings: {
        default_account_size: 25000,
        default_risk_percent: 1
      }
    };
  }

  // ─── Local Storage ────────────────────────────────────────────────────────────

  function loadData() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
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

  function clearAll() {
    localStorage.removeItem(KEY);
    return defaultData();
  }

  // ─── GitHub Config ───────────────────────────────────────────────────────────

  function loadGitHubConfig() {
    try {
      const raw = localStorage.getItem(GITHUB_KEY);
      if (!raw) return { token: '', owner: '', repo: '', path: 'data.json' };
      return { path: 'data.json', ...JSON.parse(raw) };
    } catch (e) {
      return { token: '', owner: '', repo: '', path: 'data.json' };
    }
  }

  function saveGitHubConfig(cfg) {
    localStorage.setItem(GITHUB_KEY, JSON.stringify(cfg));
  }

  function hasGitHubConfig() {
    const cfg = loadGitHubConfig();
    return !!(cfg.token && cfg.owner && cfg.repo);
  }

  // ─── GitHub Sync ─────────────────────────────────────────────────────────────

  /**
   * Push data.json to GitHub.
   * Returns { ok: true } or { ok: false, error: string }
   */
  async function syncToGitHub(data) {
    const cfg = loadGitHubConfig();
    if (!cfg.token || !cfg.owner || !cfg.repo) {
      return { ok: false, error: 'GitHub not configured' };
    }

    const url     = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
    const headers = {
      'Authorization': `token ${cfg.token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/vnd.github.v3+json'
    };

    // Get current SHA (required for update)
    let sha = null;
    try {
      const getRes = await fetch(url, { headers });
      if (getRes.ok) {
        const getJson = await getRes.json();
        sha = getJson.sha;
      } else if (getRes.status !== 404) {
        const err = await getRes.json().catch(() => ({}));
        return { ok: false, error: err.message || `GET failed: ${getRes.status}` };
      }
    } catch (e) {
      return { ok: false, error: 'Network error: ' + e.message };
    }

    // Encode content as base64
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body    = {
      message: `sync: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      content,
      ...(sha ? { sha } : {})
    };

    try {
      const putRes = await fetch(url, {
        method:  'PUT',
        headers,
        body:    JSON.stringify(body)
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        return { ok: false, error: err.message || `PUT failed: ${putRes.status}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Network error: ' + e.message };
    }
  }

  /**
   * Pull data.json from GitHub.
   * Returns { ok: true, data } or { ok: false, error: string }
   */
  async function syncFromGitHub() {
    const cfg = loadGitHubConfig();
    if (!cfg.token || !cfg.owner || !cfg.repo) {
      return { ok: false, error: 'GitHub not configured' };
    }

    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
    const headers = {
      'Authorization': `token ${cfg.token}`,
      'Accept':        'application/vnd.github.v3+json'
    };

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 404) return { ok: false, error: 'File not found in repo' };
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.message || `GET failed: ${res.status}` };
      }
      const json    = await res.json();
      const decoded = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
      const data    = JSON.parse(decoded);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: 'Parse error: ' + e.message };
    }
  }

  // ─── JSON Export / Import ────────────────────────────────────────────────────

  function exportJSON(data) {
    const payload = JSON.stringify(data, null, 2);
    const blob    = new Blob([payload], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `impulse_swing_${new Date().toISOString().slice(0, 10)}.json`;
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

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  return {
    loadData, saveData, clearAll, defaultData, generateId,
    exportJSON, importJSON,
    loadGitHubConfig, saveGitHubConfig, hasGitHubConfig,
    syncToGitHub, syncFromGitHub
  };

})();

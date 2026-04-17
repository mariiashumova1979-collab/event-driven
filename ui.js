// ui.js — All rendering and DOM manipulation. Reads state, writes DOM.
'use strict';

const UI = (() => {

  // ─── Init ────────────────────────────────────────────────────────────────────

  function init(appState) {
    _prefillFormDefaults(appState.data.app_settings);
    _bindCommaAsDot();
    _bindCsvImport();
  }

  // ─── CSV Import ──────────────────────────────────────────────────────────────

  function _bindCsvImport() {
    const input = document.getElementById('csv-file-input');
    if (!input) { console.warn('[CSV] csv-file-input not found'); return; }
    input.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById('csv-filename').textContent = file.name;
      const reader = new FileReader();
      reader.onerror = () => showToast('Failed to read file', 'error');
      reader.onload = function(ev) {
        try {
          _parseCsvAndPreview(ev.target.result);
        } catch(err) {
          console.error('[CSV] parse error:', err);
          showToast('CSV parse error: ' + err.message, 'error');
        }
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  function _parseCsvAndPreview(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) { showToast('CSV is empty or unreadable', 'error'); return; }

    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('date') || header.includes('open') || header.includes('symbol');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const rows = [];
    for (const line of dataLines) {
      const cols = line.split(',');
      let row = null;
      // Symbol,Date,Time,Open,High,Low,Close,Volume  (8 cols)
      if (cols.length >= 8) {
        row = {
          symbol: cols[0].replace(/\..*$/, '').toUpperCase(),
          date:   cols[1].trim(),
          open:   parseFloat(cols[3]),
          high:   parseFloat(cols[4]),
          low:    parseFloat(cols[5]),
          close:  parseFloat(cols[6]),
          volume: parseFloat(cols[7]) || 0
        };
      // Date,Open,High,Low,Close,Volume  (6 cols, no symbol/time)
      } else if (cols.length >= 6) {
        row = {
          symbol: '',
          date:   cols[0].trim(),
          open:   parseFloat(cols[1]),
          high:   parseFloat(cols[2]),
          low:    parseFloat(cols[3]),
          close:  parseFloat(cols[4]),
          volume: parseFloat(cols[5]) || 0
        };
      }
      if (row && row.date && !isNaN(row.open) && !isNaN(row.close)) rows.push(row);
    }

    if (rows.length === 0) { showToast('No valid rows found in CSV', 'error'); return; }
    rows.sort((a, b) => a.date < b.date ? -1 : 1);
    _renderCsvPreview(rows);
  }

  function _renderCsvPreview(rows) {
    const el = document.getElementById('csv-preview');
    if (!el) return;

    const rowsHtml = rows.map((r, i) => `
      <tr data-idx="${i}">
        <td class="mono text-sm">${r.date}</td>
        <td class="mono text-sm">${r.symbol || '—'}</td>
        <td class="mono text-sm">${r.open}</td>
        <td class="mono text-sm">${r.high}</td>
        <td class="mono text-sm">${r.low}</td>
        <td class="mono text-sm">${r.close}</td>
        <td class="mono text-sm">${r.volume > 0 ? r.volume.toLocaleString() : '—'}</td>
        <td class="csv-btns">
          <button type="button" class="btn btn-xs btn-outline csv-set-d0" data-idx="${i}">D0</button>
          <button type="button" class="btn btn-xs btn-ghost csv-set-d1" data-idx="${i}">D+1</button>
        </td>
      </tr>`).join('');

    el.innerHTML = `
      <table class="csv-table">
        <thead><tr>
          <th>Date</th><th>Symbol</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th></th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
    el.classList.remove('hidden');

    // Remove old listener by replacing element clone
    const tbody = el.querySelector('tbody');
    tbody.addEventListener('click', function(e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      if (isNaN(idx) || idx < 0 || idx >= rows.length) return;
      const r = rows[idx];
      const f = document.getElementById('setup-form');
      const set = (name, val) => {
        const inp = f ? f.querySelector(`[name="${name}"]`) : null;
        if (inp) inp.value = val;
      };

      if (btn.classList.contains('csv-set-d0')) {
        set('date_d0',  r.date);
        set('open_d0',  r.open);
        set('high_d0',  r.high);
        set('low_d0',   r.low);
        set('close_d0', r.close);
        set('volume_d0', r.volume || '');
        if (idx > 0) set('close_prev_day', rows[idx - 1].close);
        if (r.symbol) {
          const t = f ? f.querySelector('[name="ticker"]') : null;
          if (t && !t.value) t.value = r.symbol;
        }
        el.querySelectorAll('tbody tr').forEach(tr => tr.classList.remove('csv-row-d0'));
        e.target.closest('tr').classList.add('csv-row-d0');
        showToast('D0 filled — enter ATR14 and RelVol manually', 'info');
      }

      if (btn.classList.contains('csv-set-d1')) {
        set('date_d1',  r.date);
        set('open_d1',  r.open);
        set('high_d1',  r.high);
        set('low_d1',   r.low);
        set('close_d1', r.close);
        el.querySelectorAll('tbody tr').forEach(tr => tr.classList.remove('csv-row-d1'));
        e.target.closest('tr').classList.add('csv-row-d1');
        showToast('D+1 filled', 'success');
      }
    });
  }

  /** Allow comma as decimal separator on all number inputs. */
  function _bindCommaAsDot() {
    document.addEventListener('keydown', e => {
      if (e.key !== ',') return;
      const el = e.target;
      if (el.tagName !== 'INPUT' || el.type !== 'number') return;
      e.preventDefault();
      const start = el.selectionStart;
      const end   = el.selectionEnd;
      // Insert dot at cursor position via execCommand (works in most browsers)
      // Fallback: manipulate value directly
      if (!document.execCommand('insertText', false, '.')) {
        el.value = el.value.slice(0, start) + '.' + el.value.slice(end);
        el.setSelectionRange(start + 1, start + 1);
      }
    }, true);
  }

  function _prefillFormDefaults(settings) {
    const acct = document.getElementById('account_size');
    const risk = document.getElementById('risk_percent_per_trade');
    if (acct && settings.default_account_size) acct.value = settings.default_account_size;
    if (risk && settings.default_risk_percent)  risk.value = settings.default_risk_percent;

    // Default dates: D0 = today, D+1 = tomorrow
    const today    = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const fmt = d => d.toISOString().slice(0, 10);
    const d0  = document.getElementById('date_d0');
    const d1  = document.getElementById('date_d1');
    if (d0 && !d0.value) d0.value = fmt(today);
    if (d1 && !d1.value) d1.value = fmt(tomorrow);
  }

  // ─── Tabs ─────────────────────────────────────────────────────────────────────

  function renderTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === 'tab-' + tabId);
    });
  }

  // ─── Form Helpers ────────────────────────────────────────────────────────────

  function collectFormInputs() {
    const f = document.getElementById('setup-form');
    const v = name => f.querySelector(`[name="${name}"]`)?.value?.trim();
    const n = name => parseFloat(v(name));

    const ticker = v('ticker');
    if (!ticker) { showToast('Ticker is required', 'error'); return null; }

    // Detect if D1 data was entered (all 4 OHLC fields filled)
    const d1_vals = ['open_d1','high_d1','low_d1','close_d1'].map(k => v(k));
    const has_d1  = d1_vals.every(val => val !== '' && val != null && !isNaN(parseFloat(val)));

    const inputs = {
      ticker:               ticker.toUpperCase(),
      direction:            v('direction'),
      date_d0:              v('date_d0'),
      open_d0:              n('open_d0'),
      high_d0:              n('high_d0'),
      low_d0:               n('low_d0'),
      close_d0:             n('close_d0'),
      volume_d0:            n('volume_d0'),
      relative_volume_d0:   n('relative_volume_d0'),
      close_prev_day:       n('close_prev_day'),
      atr14:                n('atr14'),
      has_d1,
      date_d1:              has_d1 ? v('date_d1')   : null,
      open_d1:              has_d1 ? n('open_d1')   : null,
      high_d1:              has_d1 ? n('high_d1')   : null,
      low_d1:               has_d1 ? n('low_d1')    : null,
      close_d1:             has_d1 ? n('close_d1')  : null,
      account_size:         n('account_size'),
      risk_percent_per_trade: n('risk_percent_per_trade')
    };

    // D0 required fields only
    const required = ['open_d0','high_d0','low_d0','close_d0','relative_volume_d0',
                       'close_prev_day','atr14','account_size','risk_percent_per_trade'];
    for (const k of required) {
      if (isNaN(inputs[k]) || inputs[k] == null) {
        showToast(`Missing or invalid value: ${k.replace(/_/g,' ')}`, 'error');
        return null;
      }
    }
    return inputs;
  }

  // ─── Setup Result ────────────────────────────────────────────────────────────

  function renderSetupResult(result, saved, savedId, history) {
    const el = document.getElementById('result-container');
    if (!result) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">🔎</span><p>Run an analysis in <strong>New Setup</strong> first</p></div>`;
      return;
    }

    const { inputs, metrics, d0_valid, d0_invalid_reasons, d1_pattern, trade_plan, trade_valid, invalid_reasons } = result;
    const dir = inputs.direction;

    const badge = (ok, label) => `<span class="badge ${ok ? 'badge-ok' : 'badge-fail'}">${ok ? '✓' : '✗'} ${label}</span>`;

    // ── D0-only mode ──────────────────────────────────────────────────────────
    if (!inputs.has_d1) {
      console.log('[D0-only] rendering D0-only mode', { entry: result.trade_plan?.entry, d1_conditions: result.d1_conditions });
      const d0StatusClass = d0_valid ? 'valid' : 'invalid';
      const d0Verdict = d0_valid ? 'D0 PASS — ADD D+1' : 'D0 FAIL';
      const entry = result.trade_plan?.entry;
      const cond  = result.d1_conditions || {};

      const saveBtn = saved
        ? `<button class="btn btn-ghost" disabled>✓ Saved to Journal</button>`
        : `<button class="btn btn-primary" id="btn-save-only">Save to Journal</button>`;

      const d1Btn = saved && d0_valid
        ? `<button class="btn btn-success" id="btn-add-d1-data">+ Add D+1 Data</button>`
        : '';

      const reasonsHtml = d0_invalid_reasons.length
        ? `<div class="invalid-reasons"><strong>Issues:</strong><ul>${d0_invalid_reasons.map(r => `<li>${_esc(r)}</li>`).join('')}</ul></div>`
        : '';

      const condRows = Object.values(cond).map(v =>
        `<tr><td class="mono text-sm d1-cond-row">${_esc(v)}</td></tr>`
      ).join('');

      el.innerHTML = `
        <div class="result-header">
          <div class="result-title">
            <span class="ticker-tag">${_esc(inputs.ticker)}</span>
            <span class="dir-badge dir-${dir}">${dir.toUpperCase()}</span>
            <span class="verdict-badge verdict-${d0StatusClass}">${d0Verdict}</span>
          </div>
          <div class="result-actions">${saveBtn} ${d1Btn}</div>
        </div>

        ${reasonsHtml}

        <div class="result-grid">
          <div class="result-card">
            <div class="card-title">D0 — Candle Metrics</div>
            <table class="metrics-table">
              <tr><td>Date</td><td class="mono">${inputs.date_d0 || '—'}</td></tr>
              <tr><td>OHLC</td><td class="mono">${inputs.open_d0} / ${inputs.high_d0} / ${inputs.low_d0} / ${inputs.close_d0}</td></tr>
              <tr><td>Range D0</td><td class="mono">${metrics.range_d0}</td></tr>
              <tr><td>Mid D0</td><td class="mono">${metrics.mid_d0}</td></tr>
              <tr><td>Prev Close</td><td class="mono">${inputs.close_prev_day}</td></tr>
              <tr><td>ATR14</td><td class="mono">${inputs.atr14}</td></tr>
              <tr><td>Relative Volume</td><td class="mono ${inputs.relative_volume_d0 >= 1.5 ? 'text-ok' : 'text-fail'}">${inputs.relative_volume_d0}x</td></tr>
            </table>
          </div>

          <div class="result-card">
            <div class="card-title">D0 — Validation ${badge(d0_valid, d0_valid ? 'Pass' : 'Fail')}</div>
            <table class="metrics-table">
              <tr><td>Impulse</td><td class="mono ${_impulseClass(metrics.impulse, dir)}">${Strategy.r2(metrics.impulse * 100)}%</td></tr>
              <tr><td>Body Ratio</td><td class="mono ${metrics.body > 0.5 ? 'text-ok' : 'text-fail'}">${Strategy.r2(metrics.body * 100)}%</td></tr>
              <tr><td>${dir === 'long' ? 'CLV Long' : 'CLV Short'}</td>
                  <td class="mono ${(dir === 'long' ? metrics.clv_long : metrics.clv_short) > 0.7 ? 'text-ok' : 'text-fail'}">
                    ${Strategy.r2((dir === 'long' ? metrics.clv_long : metrics.clv_short) * 100)}%
                  </td></tr>
              <tr><td>Price ≥ $20</td><td class="mono ${inputs.close_d0 >= 20 ? 'text-ok' : 'text-fail'}">${inputs.close_d0 >= 20 ? '✓' : '✗'}</td></tr>
            </table>
            ${d0_invalid_reasons.length
              ? `<div class="sub-reasons">${d0_invalid_reasons.map(r => `<div class="reason-item">↳ ${_esc(r)}</div>`).join('')}</div>`
              : ''}
          </div>

          <div class="result-card ${d0_valid ? '' : 'card-muted'}">
            <div class="card-title">D+1 — Conditions to Watch</div>
            <table class="metrics-table">${condRows}</table>
          </div>

          <div class="result-card highlight-card ${d0_valid ? '' : 'card-muted'}">
            <div class="card-title">Entry Price</div>
            <table class="metrics-table">
              <tr><td>${dir === 'long' ? 'Buy Stop' : 'Sell Stop'}</td>
                  <td class="mono text-entry text-lg">$${entry}</td></tr>
              <tr><td>${dir === 'long' ? 'H0' : 'L0'}</td>
                  <td class="mono">${dir === 'long' ? '$'+inputs.high_d0 : '$'+inputs.low_d0}</td></tr>
              <tr><td>Stop est. (1×ATR)</td>
                  <td class="mono text-stop">$${trade_plan.stop_est}</td></tr>
              <tr><td>Risk / share est.</td>
                  <td class="mono">$${trade_plan.rps_est}</td></tr>
              <tr><td>Risk amount</td>
                  <td class="mono">$${trade_plan.risk_amount}</td></tr>
              <tr><td>Position est.</td>
                  <td class="mono text-highlight">${trade_plan.pos_est} sh <span class="text-muted text-xs">est.</span></td></tr>
              <tr><td>Final size</td>
                  <td class="mono text-muted">after D+1</td></tr>
            </table>
          </div>
        </div>
      ${_renderResultHistory(history)}`;
      return;
    }
    const validClass = trade_valid ? 'valid' : 'invalid';

    const patternBadges = d1_pattern.entry_type
      ? `<span class="badge badge-pattern">${d1_pattern.entry_type}</span>`
      : `<span class="badge badge-fail">No Entry Signal</span>`;

    const reasonsHtml = invalid_reasons.length
      ? `<div class="invalid-reasons"><strong>Issues:</strong><ul>${invalid_reasons.map(r => `<li>${_esc(r)}</li>`).join('')}</ul></div>`
      : '';

    const saveBtn = saved
      ? `<button class="btn btn-ghost" disabled>✓ Saved to Journal</button>`
      : `<button class="btn btn-primary" id="btn-save-only">Save to Journal</button>`;

    const tradeBtn = saved && trade_valid
      ? `<button class="btn btn-success" id="btn-save-setup">+ Create Trade</button>`
      : (!saved && trade_valid
        ? `<button class="btn btn-success" id="btn-save-setup">Save &amp; Create Trade</button>`
        : '');

    el.innerHTML = `
      <div class="result-header">
        <div class="result-title">
          <span class="ticker-tag">${_esc(inputs.ticker)}</span>
          <span class="dir-badge dir-${dir}">${dir.toUpperCase()}</span>
          <span class="verdict-badge verdict-${validClass}">${trade_valid ? 'VALID SETUP' : 'INVALID SETUP'}</span>
        </div>
        <div class="result-actions">${saveBtn} ${tradeBtn}</div>
      </div>

      ${reasonsHtml}

      <div class="result-grid">

        <div class="result-card">
          <div class="card-title">D0 — Candle Metrics</div>
          <table class="metrics-table">
            <tr><td>Date</td><td class="mono">${inputs.date_d0 || '—'}</td></tr>
            <tr><td>OHLC</td><td class="mono">${inputs.open_d0} / ${inputs.high_d0} / ${inputs.low_d0} / ${inputs.close_d0}</td></tr>
            <tr><td>Range D0</td><td class="mono">${metrics.range_d0}</td></tr>
            <tr><td>Mid D0</td><td class="mono">${metrics.mid_d0}</td></tr>
            <tr><td>Prev Close</td><td class="mono">${inputs.close_prev_day}</td></tr>
            <tr><td>ATR14</td><td class="mono">${inputs.atr14}</td></tr>
            <tr><td>Volume</td><td class="mono">${_fmtVol(inputs.volume_d0)}</td></tr>
            <tr><td>Relative Volume</td><td class="mono ${inputs.relative_volume_d0 >= 1.5 ? 'text-ok' : 'text-fail'}">${inputs.relative_volume_d0}x</td></tr>
          </table>
        </div>

        <div class="result-card">
          <div class="card-title">D0 — Validation ${badge(d0_valid, d0_valid ? 'Pass' : 'Fail')}</div>
          <table class="metrics-table">
            <tr><td>Impulse</td><td class="mono ${_impulseClass(metrics.impulse, dir)}">${Strategy.r2(metrics.impulse * 100)}%</td></tr>
            <tr><td>Body Ratio</td><td class="mono ${metrics.body > 0.5 ? 'text-ok' : 'text-fail'}">${Strategy.r2(metrics.body * 100)}%</td></tr>
            <tr><td>${dir === 'long' ? 'CLV Long' : 'CLV Short'}</td>
                <td class="mono ${(dir === 'long' ? metrics.clv_long : metrics.clv_short) > 0.7 ? 'text-ok' : 'text-fail'}">
                  ${Strategy.r2((dir === 'long' ? metrics.clv_long : metrics.clv_short) * 100)}%
                </td></tr>
            <tr><td>Price ≥ $20</td><td class="mono ${inputs.close_d0 >= 20 ? 'text-ok' : 'text-fail'}">${inputs.close_d0 >= 20 ? '✓' : '✗'}</td></tr>
          </table>
          ${d0_invalid_reasons.length
            ? `<div class="sub-reasons">${d0_invalid_reasons.map(r => `<div class="reason-item">↳ ${_esc(r)}</div>`).join('')}</div>`
            : ''}
        </div>

        <div class="result-card">
          <div class="card-title">D+1 — Structure ${badge(d1_pattern.structure_valid, d1_pattern.structure_valid ? 'Valid' : 'Invalid')}</div>
          <table class="metrics-table">
            <tr><td>Date D+1</td><td class="mono">${inputs.date_d1 || '—'}</td></tr>
            <tr><td>OHLC D+1</td><td class="mono">${inputs.open_d1} / ${inputs.high_d1} / ${inputs.low_d1} / ${inputs.close_d1}</td></tr>
            <tr><td>${dir === 'long' ? 'Low > Mid0' : 'Close < Mid0'}</td>
                <td class="mono ${d1_pattern.price_above_mid ? 'text-ok' : 'text-fail'}">${d1_pattern.price_above_mid ? '✓' : '✗'}</td></tr>
            <tr><td>${dir === 'long' ? 'Pullback < 50%' : 'Rebound < 50%'}</td>
                <td class="mono ${d1_pattern.pullback_ok ? 'text-ok' : 'text-fail'}">${d1_pattern.pullback_ok ? '✓' : '✗'}</td></tr>
            <tr><td>${dir === 'long' ? 'Breakout H0' : 'Breakdown L0'}</td>
                <td class="mono ${d1_pattern.breakout ? 'text-ok' : 'text-neutral'}">${d1_pattern.breakout ? '✓ Yes' : 'No'}</td></tr>
            <tr><td>Retest ${dir === 'long' ? 'H0' : 'L0'}</td>
                <td class="mono ${d1_pattern.retest ? 'text-ok' : 'text-neutral'}">${d1_pattern.retest ? '✓ Yes' : 'No'}</td></tr>
            ${dir === 'short' ? `<tr><td>Not too far</td>
                <td class="mono ${d1_pattern.not_too_far ? 'text-ok' : 'text-fail'}">${d1_pattern.not_too_far ? '✓' : '✗'}</td></tr>` : ''}
          </table>
          <div class="pattern-badges">${patternBadges}</div>
        </div>

        <div class="result-card highlight-card">
          <div class="card-title">Trade Plan ${badge(trade_plan.stop_valid, trade_plan.stop_valid ? 'Stop OK' : 'Stop Wide')}</div>
          <table class="metrics-table">
            <tr><td>Entry</td><td class="mono text-entry">$${trade_plan.entry}</td></tr>
            <tr><td>Stop</td><td class="mono text-stop">$${trade_plan.stop}</td></tr>
            <tr><td>TP1 (1R)</td><td class="mono text-tp">$${trade_plan.tp1}</td></tr>
            <tr><td>TP2 (2R)</td><td class="mono text-tp">$${trade_plan.tp2}</td></tr>
            <tr><td>Risk / Share</td><td class="mono">$${trade_plan.risk_per_share}</td></tr>
            <tr><td>Stop × ATR</td><td class="mono ${trade_plan.stop_valid ? 'text-ok' : 'text-fail'}">${trade_plan.stop_ratio != null ? trade_plan.stop_ratio + '×' : '—'}</td></tr>
            <tr><td>Risk Amount</td><td class="mono">$${trade_plan.risk_amount}</td></tr>
            <tr><td>Position Size</td><td class="mono text-highlight">${trade_plan.position_size} shares</td></tr>
          </table>
        </div>

      </div>
      ${_renderResultHistory(history)}`;
  }

  function _renderResultHistory(history) {
    if (!history || history.length === 0) return '';
    const items = history.map((entry, i) => {
      const r   = entry.result;
      const dir = r.inputs?.direction || '';
      const ticker = r.inputs?.ticker || '—';
      const d0ok = r.d0_valid;
      const full = r.inputs?.has_d1;
      const valid = r.trade_valid;
      const verdict = !full ? (d0ok ? 'D0 ✓' : 'D0 ✗') : (valid ? '✓' : '✗');
      const cls = !full ? (d0ok ? 'hist-d0ok' : 'hist-fail') : (valid ? 'hist-ok' : 'hist-fail');
      return `<button class="history-item ${cls}" data-history-index="${i}" title="Load ${ticker} ${dir}">
        <span class="hist-ticker">${_esc(ticker)}</span>
        <span class="hist-dir">${dir}</span>
        <span class="hist-verdict">${verdict}</span>
      </button>`;
    }).join('');
    return `<div class="result-history"><span class="history-label">History</span>${items}</div>`;
  }

  function _impulseClass(impulse, dir) {
    if (dir === 'long')  return (impulse >= 0.05 && impulse <= 0.12) ? 'text-ok' : 'text-fail';
    if (dir === 'short') return (impulse <= -0.05 && impulse >= -0.12) ? 'text-ok' : 'text-fail';
    return '';
  }

  // ─── Active Trades ───────────────────────────────────────────────────────────

  function renderTrades(data) {
    const el = document.getElementById('trades-container');
    const trades = data.trades.filter(t => t.status !== 'closed');
    const closed = data.trades.filter(t => t.status === 'closed');

    let html = '';

    if (trades.length === 0 && closed.length === 0) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span><p>No trades yet. Create one from a valid setup.</p></div>`;
      return;
    }

    if (trades.length > 0) {
      html += `<div class="section-label">Active &amp; Planned (${trades.length})</div>`;
      html += trades.map(t => _tradeCard(t, data.setups)).join('');
    }

    if (closed.length > 0) {
      html += `<div class="section-label" style="margin-top:2rem">Recently Closed (${closed.length})</div>`;
      html += closed.slice(-5).reverse().map(t => _tradeCard(t, data.setups)).join('');
    }

    el.innerHTML = html;
  }

  function _tradeCard(trade, setups) {
    const setup = setups.find(s => s.id === trade.setup_id);
    const pats = setup?.d1_pattern?.detected?.join(', ') || '—';
    const statusCls = { planned: 'status-planned', active: 'status-active', closed: 'status-closed' }[trade.status] || '';

    const pnlHtml = trade.pnl != null
      ? `<span class="pnl ${trade.pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">${trade.pnl >= 0 ? '+' : ''}$${trade.pnl}</span>
         <span class="pnl-r ${trade.pnl_r >= 0 ? 'pnl-pos' : 'pnl-neg'}">${trade.pnl_r >= 0 ? '+' : ''}${trade.pnl_r}R</span>`
      : '<span class="pnl text-neutral">—</span>';

    const resultHtml = trade.result_type
      ? `<span class="result-badge result-${trade.result_type}">${_resultLabel(trade.result_type)}</span>` : '';

    const currentStopHtml = trade.tp1_hit
      ? `<tr><td>Current Stop (BE)</td><td class="mono">$${trade.current_stop}</td></tr>` : '';

    const updatesHtml = (trade.daily_updates || []).length > 0
      ? `<div class="updates-list">
          <div class="updates-header">Daily Updates</div>
          <table class="updates-table">
            <thead><tr><th>Date</th><th>O</th><th>H</th><th>L</th><th>C</th><th>Flag</th><th></th></tr></thead>
            <tbody>
              ${(trade.daily_updates || []).map(u => `
                <tr>
                  <td class="mono">${u.date}</td>
                  <td class="mono">${u.open}</td>
                  <td class="mono">${u.high}</td>
                  <td class="mono">${u.low}</td>
                  <td class="mono">${u.close}</td>
                  <td>${u.is_time_exit ? '<span class="badge badge-time">T-Exit</span>' : ''}</td>
                  <td><button class="btn-icon btn-delete-update" data-update-id="${u.id}" title="Remove">✕</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '';

    const addUpdateBtn = trade.status !== 'closed'
      ? `<button class="btn btn-sm btn-outline btn-add-update">+ Add Update</button>` : '';

    const tpHitBadge = trade.tp1_hit ? `<span class="badge badge-tp1">TP1 Hit</span>` : '';

    return `
      <div class="trade-card ${statusCls}" data-trade-id="${trade.id}">
        <div class="trade-card-header">
          <div class="trade-card-title">
            <span class="ticker-tag">${_esc(trade.ticker)}</span>
            <span class="dir-badge dir-${trade.direction}">${trade.direction.toUpperCase()}</span>
            <span class="status-badge ${statusCls}">${trade.status.toUpperCase()}</span>
            ${tpHitBadge}
            ${resultHtml}
            <span class="pattern-tag">${_esc(pats)}</span>
          </div>
          <div class="trade-card-meta">
            ${pnlHtml}
            <button class="btn-icon btn-delete-trade" title="Delete trade">🗑</button>
          </div>
        </div>
        <div class="trade-card-body">
          <div class="trade-levels">
            <table class="metrics-table">
              <tr><td>Entry</td><td class="mono text-entry">$${trade.entry}</td>
                  <td>TP1</td><td class="mono text-tp">$${trade.tp1}</td></tr>
              <tr><td>Stop</td><td class="mono text-stop">$${trade.stop}</td>
                  <td>TP2</td><td class="mono text-tp">$${trade.tp2}</td></tr>
              ${currentStopHtml}
              <tr><td>Size</td><td class="mono">${trade.position_size} sh</td>
                  <td>Risk</td><td class="mono">$${trade.risk_per_share}/sh</td></tr>
              ${trade.open_date ? `<tr><td>Opened</td><td class="mono">${trade.open_date}</td>
                  <td>${trade.close_date ? 'Closed' : ''}</td><td class="mono">${trade.close_date || ''}</td></tr>` : ''}
              ${trade.closed_price ? `<tr><td>Exit Price</td><td class="mono">$${trade.closed_price}</td><td></td><td></td></tr>` : ''}
            </table>
          </div>
          ${updatesHtml}
        </div>
        ${trade.status !== 'closed' ? `<div class="trade-card-footer">${addUpdateBtn}</div>` : ''}
      </div>`;
  }

  // ─── Update Modal ─────────────────────────────────────────────────────────────

  function showUpdateModal(tradeId, onSubmit) {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('modal-content').innerHTML = `
      <div class="modal-header">Add Daily Update</div>
      <form id="update-form" class="modal-form">
        <div class="form-row">
          <label>Date<input type="date" name="date" value="${today}" required></label>
          <label>Open<input type="number" name="open" step="0.01" placeholder="0.00" required></label>
        </div>
        <div class="form-row">
          <label>High<input type="number" name="high" step="0.01" placeholder="0.00" required></label>
          <label>Low<input type="number" name="low" step="0.01" placeholder="0.00" required></label>
        </div>
        <div class="form-row">
          <label>Close<input type="number" name="close" step="0.01" placeholder="0.00" required></label>
          <label class="checkbox-label"><input type="checkbox" name="is_time_exit"> Time Exit (D+3)</label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Update</button>
        </div>
      </form>`;

    openModal();

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('update-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      onSubmit({
        date:         fd.get('date'),
        open:         parseFloat(fd.get('open')),
        high:         parseFloat(fd.get('high')),
        low:          parseFloat(fd.get('low')),
        close:        parseFloat(fd.get('close')),
        is_time_exit: !!fd.get('is_time_exit')
      });
      closeModal();
    });
  }

  function showD1Modal(existingInputs, onSubmit) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDate = (existingInputs.date_d1) || tomorrow.toISOString().slice(0, 10);

    openModal(`
      <div class="modal-header">Add D+1 Data — ${_esc(existingInputs.ticker)}</div>
      <form id="d1-form" class="modal-form">
        <div class="form-row">
          <label>Date D+1<input type="date" name="date_d1" value="${defaultDate}" required></label>
          <label>Open<input type="number" name="open_d1" step="0.01" placeholder="0.00" required></label>
        </div>
        <div class="form-row">
          <label>High<input type="number" name="high_d1" step="0.01" placeholder="0.00" required></label>
          <label>Low<input type="number" name="low_d1" step="0.01" placeholder="0.00" required></label>
        </div>
        <div class="form-row">
          <label>Close<input type="number" name="close_d1" step="0.01" placeholder="0.00" required></label>
          <label class="span-empty"></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="d1-modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Analyze D+1</button>
        </div>
      </form>`);

    document.getElementById('d1-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('d1-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const n  = k => parseFloat(fd.get(k));
      onSubmit({
        date_d1:  fd.get('date_d1'),
        open_d1:  n('open_d1'),
        high_d1:  n('high_d1'),
        low_d1:   n('low_d1'),
        close_d1: n('close_d1'),
      });
      closeModal();
    });
  }


    if (html) document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal').classList.remove('hidden');
    document.getElementById('modal-backdrop').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('modal-backdrop').classList.add('hidden');
  }

  // ─── Journal ─────────────────────────────────────────────────────────────────

  function renderJournal(data, filters, sort) {
    const setupsEl = document.getElementById('journal-setups');
    const tradesEl = document.getElementById('journal-trades');

    // --- Setups table ---
    let setups = [...data.setups];
    if (filters.ticker)  setups = setups.filter(s => s.inputs?.ticker?.toUpperCase().includes(filters.ticker.toUpperCase()));
    if (filters.pattern && filters.pattern !== '') {
      setups = setups.filter(s => s.d1_pattern?.detected?.includes(filters.pattern));
    }

    // Sort
    setups.sort((a, b) => {
      let va = a.created_at, vb = b.created_at;
      if (sort.col === 'ticker') { va = a.inputs?.ticker; vb = b.inputs?.ticker; }
      if (sort.col === 'valid')  { va = a.trade_valid ? 1 : 0; vb = b.trade_valid ? 1 : 0; }
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });

    const sortIcon = (col) => sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';

    if (setups.length === 0) {
      setupsEl.innerHTML = `<div class="empty-state compact"><p>No setups match the current filters.</p></div>`;
    } else {
      setupsEl.innerHTML = `
        <table class="journal-table">
          <thead>
            <tr>
              <th data-sort-col="ticker" class="sortable">Ticker${sortIcon('ticker')}</th>
              <th>Dir</th>
              <th data-sort-col="created_at" class="sortable">Date${sortIcon('created_at')}</th>
              <th>Impulse</th>
              <th>Pattern</th>
              <th data-sort-col="valid" class="sortable">Valid${sortIcon('valid')}</th>
              <th>Entry</th>
              <th>Stop</th>
              <th>TP1</th>
              <th>Size</th>
              <th>Trade</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${setups.map(s => `
              <tr class="${s.trade_valid ? 'row-valid' : 'row-invalid'}">
                <td class="mono font-bold">${_esc(s.inputs?.ticker || '—')}</td>
                <td><span class="dir-badge dir-${s.inputs?.direction}">${(s.inputs?.direction || '').toUpperCase()}</span></td>
                <td class="mono text-sm">${(s.created_at || '').slice(0,10)}</td>
                <td class="mono">${s.metrics?.impulse != null ? Strategy.r2(s.metrics.impulse * 100) + '%' : '—'}</td>
                <td>${(s.d1_pattern?.detected || []).map(p => `<span class="badge badge-pattern-sm">${p}</span>`).join(' ') || '<span class="text-muted">—</span>'}</td>
                <td>${s.trade_valid
                  ? '<span class="badge badge-ok">Valid</span>'
                  : `<span class="badge badge-fail" title="${_esc((s.invalid_reasons||[]).join('; '))}">Invalid</span>`}</td>
                <td class="mono">${s.trade_plan?.entry != null ? '$'+s.trade_plan.entry : '—'}</td>
                <td class="mono text-stop">${s.trade_plan?.stop != null ? '$'+s.trade_plan.stop : '—'}</td>
                <td class="mono text-tp">${s.trade_plan?.tp1 != null ? '$'+s.trade_plan.tp1 : '—'}</td>
                <td class="mono">${s.trade_plan?.position_size != null ? s.trade_plan.position_size+'sh' : '—'}</td>
                <td>${s.trade_id
                  ? '<span class="badge badge-linked">Linked</span>'
                  : (s.trade_valid ? `<button class="btn btn-xs btn-success btn-create-trade-from-journal" data-setup-id="${s.id}">+ Trade</button>` : '<span class="text-muted">—</span>')}</td>
                <td><button class="btn btn-xs btn-outline btn-view-setup" data-setup-id="${s.id}" title="View in Result tab">View</button></td>
                <td><button class="btn-icon btn-delete-setup" data-setup-id="${s.id}" title="Delete">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }

    // --- Trades table ---
    let trades = [...data.trades];
    if (filters.ticker)      trades = trades.filter(t => t.ticker?.toUpperCase().includes(filters.ticker.toUpperCase()));
    if (filters.status)      trades = trades.filter(t => t.status === filters.status);
    if (filters.result_type) trades = trades.filter(t => t.result_type === filters.result_type);

    if (trades.length === 0) {
      tradesEl.innerHTML = `<div class="empty-state compact"><p>No trades match filters.</p></div>`;
    } else {
      tradesEl.innerHTML = `
        <table class="journal-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Dir</th>
              <th>Status</th>
              <th>Entry</th>
              <th>Stop</th>
              <th>TP1</th>
              <th>Size</th>
              <th>Opened</th>
              <th>Closed</th>
              <th>Exit</th>
              <th>Result</th>
              <th class="text-right">P&amp;L $</th>
              <th class="text-right">P&amp;L R</th>
            </tr>
          </thead>
          <tbody>
            ${trades.map(t => `
              <tr>
                <td class="mono font-bold">${_esc(t.ticker)}</td>
                <td><span class="dir-badge dir-${t.direction}">${t.direction.toUpperCase()}</span></td>
                <td><span class="status-badge status-${t.status}">${t.status}</span></td>
                <td class="mono">$${t.entry}</td>
                <td class="mono text-stop">$${t.stop}</td>
                <td class="mono text-tp">$${t.tp1}</td>
                <td class="mono">${t.position_size}sh</td>
                <td class="mono text-sm">${t.open_date || '—'}</td>
                <td class="mono text-sm">${t.close_date || '—'}</td>
                <td class="mono">${t.closed_price ? '$'+t.closed_price : '—'}</td>
                <td>${t.result_type ? `<span class="result-badge result-${t.result_type}">${_resultLabel(t.result_type)}</span>` : '—'}</td>
                <td class="mono text-right ${t.pnl >= 0 ? 'text-ok' : (t.pnl < 0 ? 'text-fail' : '')}">${t.pnl != null ? (t.pnl >= 0 ? '+' : '') + '$'+t.pnl : '—'}</td>
                <td class="mono text-right ${t.pnl_r >= 0 ? 'text-ok' : (t.pnl_r < 0 ? 'text-fail' : '')}">${t.pnl_r != null ? (t.pnl_r >= 0 ? '+' : '') + t.pnl_r + 'R' : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  function renderStats(stats) {
    const el = document.getElementById('stats-container');

    const card = (label, value, sub='', cls='') =>
      `<div class="stat-card ${cls}">
         <div class="stat-label">${label}</div>
         <div class="stat-value">${value}</div>
         ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
       </div>`;

    const resultRows = Object.entries(stats.by_result).map(([k, v]) =>
      `<tr>
        <td><span class="result-badge result-${k}">${_resultLabel(k)}</span></td>
        <td class="mono">${v.count}</td>
        <td class="mono">${v.count > 0 ? Math.round(v.wins/v.count*100) : 0}%</td>
        <td class="mono ${v.total_r >= 0 ? 'text-ok':'text-fail'}">${v.total_r >= 0?'+':''}${v.total_r}R</td>
      </tr>`).join('');

    const patternRows = Object.entries(stats.by_pattern).map(([k, v]) =>
      `<tr>
        <td><span class="badge badge-pattern">${_esc(k)}</span></td>
        <td class="mono">${v.count}</td>
        <td class="mono">${v.count > 0 ? Math.round(v.wins/v.count*100) : 0}%</td>
        <td class="mono ${v.total_r >= 0 ? 'text-ok':'text-fail'}">${v.total_r >= 0?'+':''}${v.total_r}R</td>
      </tr>`).join('');

    el.innerHTML = `
      <div class="stats-summary-grid">
        ${card('Total Setups',   stats.total_setups)}
        ${card('Valid Setups',   stats.valid_setups,   `${stats.invalid_setups} invalid`)}
        ${card('Total Trades',   stats.total_trades,   `${stats.active_trades} active · ${stats.planned_trades} planned`)}
        ${card('Closed Trades',  stats.closed_trades)}
        ${card('Win Rate',       stats.closed_trades ? stats.win_rate + '%' : '—',  '', stats.win_rate >= 50 ? 'card-ok' : 'card-warn')}
        ${card('Avg R',          stats.closed_trades ? (stats.avg_r >= 0 ? '+' : '') + stats.avg_r + 'R' : '—', '', stats.avg_r > 0 ? 'card-ok' : 'card-warn')}
        ${card('Median R',       stats.closed_trades ? (stats.median_r >= 0?'+':'') + stats.median_r + 'R' : '—')}
        ${card('Total P&L',      stats.closed_trades ? (stats.total_pnl >= 0?'+':'') + '$' + stats.total_pnl : '—', '', stats.total_pnl >= 0 ? 'card-ok' : 'card-warn')}
        ${card('Avg Hold (days)', stats.avg_hold || '—')}
        ${card('Max Drawdown',   stats.max_dd > 0 ? '-$' + stats.max_dd : '$0', '', stats.max_dd > 0 ? 'card-warn' : '')}
      </div>

      <div class="stats-tables">
        <div class="stats-table-block">
          <div class="section-label">Results by Exit Type</div>
          ${resultRows ? `<table class="journal-table">
            <thead><tr><th>Exit Type</th><th>Count</th><th>Win%</th><th>Total R</th></tr></thead>
            <tbody>${resultRows}</tbody>
          </table>` : '<div class="empty-state compact"><p>No closed trades yet.</p></div>'}
        </div>
        <div class="stats-table-block">
          <div class="section-label">Results by Pattern</div>
          ${patternRows ? `<table class="journal-table">
            <thead><tr><th>Pattern</th><th>Count</th><th>Win%</th><th>Total R</th></tr></thead>
            <tbody>${patternRows}</tbody>
          </table>` : '<div class="empty-state compact"><p>No closed trades yet.</p></div>'}
        </div>
      </div>`;
  }

  // ─── Toast ────────────────────────────────────────────────────────────────────

  function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className   = `toast toast-${type} visible`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _fmtVol(v) {
    if (!v) return '—';
    if (v >= 1e6) return (v/1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v/1e3).toFixed(0) + 'K';
    return String(v);
  }

  function _resultLabel(r) {
    return { stop: 'Stop', tp1_only: 'TP1 Only', tp2: 'TP2', time_exit: 'Time Exit', unknown: 'Unknown' }[r] || r;
  }

  return {
    init, renderTab, collectFormInputs,
    renderSetupResult, renderTrades, renderJournal, renderStats,
    showUpdateModal, showD1Modal, openModal, closeModal, showToast
  };

})();

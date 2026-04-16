// ui.js — All rendering and DOM manipulation. Reads state, writes DOM.
'use strict';

const UI = (() => {

  // ─── Init ────────────────────────────────────────────────────────────────────

  function init(appState) {
    _prefillFormDefaults(appState.data.app_settings);
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

  function renderSetupResult(result, saved, savedId) {
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
      const d0StatusClass = d0_valid ? 'valid' : 'invalid';
      const d0Verdict = d0_valid ? 'D0 PASS — ADD D+1' : 'D0 FAIL';

      const saveBtn = saved
        ? `<button class="btn btn-ghost" disabled>✓ Saved to Journal</button>`
        : `<button class="btn btn-primary" id="btn-save-only">Save to Journal</button>`;

      const reasonsHtml = d0_invalid_reasons.length
        ? `<div class="invalid-reasons"><strong>Issues:</strong><ul>${d0_invalid_reasons.map(r => `<li>${_esc(r)}</li>`).join('')}</ul></div>`
        : '';

      el.innerHTML = `
        <div class="result-header">
          <div class="result-title">
            <span class="ticker-tag">${_esc(inputs.ticker)}</span>
            <span class="dir-badge dir-${dir}">${dir.toUpperCase()}</span>
            <span class="verdict-badge verdict-${d0StatusClass}">${d0Verdict}</span>
          </div>
          <div class="result-actions">${saveBtn}</div>
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

          <div class="result-card d1-pending-card ${d0_valid ? '' : 'card-muted'}">
            <div class="card-title">D+1 — Pending</div>
            <div class="d1-pending-body">
              ${d0_valid
                ? `<div class="d1-pending-icon">⏳</div>
                   <p class="d1-pending-msg">D0 validated. Return after market close tomorrow and add D+1 data to complete the setup analysis and generate a trade plan.</p>`
                : `<div class="d1-pending-icon muted">✗</div>
                   <p class="d1-pending-msg muted">D0 failed validation. D+1 analysis is not required.</p>`
              }
            </div>
          </div>
        </div>`;
      return;
    }

    // ── Full mode (D0 + D1) ────────────────────────────────────────────────────
    const validClass = trade_valid ? 'valid' : 'invalid';

    const patternBadges = d1_pattern.detected.length > 0
      ? d1_pattern.detected.map(p => `<span class="badge badge-pattern">${p}</span>`).join(' ')
      : `<span class="badge badge-fail">No Pattern</span>`;

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
            <tr><td>Inside Day</td><td class="mono ${d1_pattern.inside_day ? 'text-ok' : 'text-neutral'}">${d1_pattern.inside_day ? '✓ Yes' : 'No'}</td></tr>
            <tr><td>Weak Pullback</td><td class="mono ${d1_pattern.weak_pullback ? 'text-ok' : 'text-neutral'}">${d1_pattern.weak_pullback ? '✓ Yes' : 'No'}</td></tr>
            <tr><td>Compression</td><td class="mono ${d1_pattern.compression ? 'text-ok' : 'text-neutral'}">${d1_pattern.compression ? '✓ Yes' : 'No'}</td></tr>
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

      </div>`;
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

  function openModal(html) {
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
    showUpdateModal, openModal, closeModal, showToast
  };

})();

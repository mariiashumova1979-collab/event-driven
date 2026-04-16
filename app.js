// app.js — Application state, initialization, and event orchestration.
'use strict';

const App = (() => {

  // ─── State ──────────────────────────────────────────────────────────────────

  let state = {
    data:             null,   // full data object from storage
    lastResult:       null,   // most recent evaluateSetup() output + inputs
    lastResultSaved:  false,
    lastSavedSetupId: null,   // ID of the last setup persisted
    activeTab:        'setup',
    journalFilters:   { ticker: '', status: '', pattern: '', result_type: '' },
    journalSort:      { col: 'created_at', dir: 'desc' }
  };

  function save() { Storage.saveData(state.data); }

  // ─── Init ────────────────────────────────────────────────────────────────────

  function init() {
    state.data = Storage.loadData();
    _replayAllTrades();
    UI.init(state);
    _bindGlobalEvents();
    UI.renderTab(state.activeTab);
  }

  /** After load/import, replay all trade lifecycles so computed state is current. */
  function _replayAllTrades() {
    state.data.trades = state.data.trades.map(trade => {
      const r = Strategy.replayTrade(trade, trade.daily_updates || []);
      return {
        ...trade,
        status:           r.status,
        tp1_hit:          r.tp1_hit,
        current_stop:     r.current_stop,
        shares_remaining: r.shares_remaining,
        pnl:              r.pnl,
        pnl_r:            r.pnl_r,
        open_date:        r.open_date,
        close_date:       r.close_date,
        result_type:      r.result_type,
        closed_price:     r.closed_price
      };
    });
  }

  // ─── Setup Actions ────────────────────────────────────────────────────────────

  function analyzeSetup(inputs) {
    const result       = Strategy.evaluateSetup(inputs);
    state.lastResult   = { inputs, ...result };
    state.lastResultSaved  = false;
    state.lastSavedSetupId = null;
    _switchTab('result');
    UI.renderSetupResult(state.lastResult, false, null);
  }

  function saveSetup() {
    if (!state.lastResult) return null;
    if (state.lastResultSaved) return state.lastSavedSetupId; // idempotent

    const id = Storage.generateId();
    const setup = {
      id,
      created_at: new Date().toISOString(),
      inputs:     state.lastResult.inputs,
      metrics:    state.lastResult.metrics,
      d0_valid:   state.lastResult.d0_valid,
      d0_invalid_reasons: state.lastResult.d0_invalid_reasons,
      d1_pattern: state.lastResult.d1_pattern,
      trade_plan: state.lastResult.trade_plan,
      trade_valid: state.lastResult.trade_valid,
      invalid_reasons: state.lastResult.invalid_reasons,
      trade_id: null
    };

    state.data.setups.push(setup);
    state.lastResultSaved  = true;
    state.lastSavedSetupId = id;
    save();
    UI.renderSetupResult(state.lastResult, true, id);
    UI.showToast('Setup saved to journal', 'success');
    return id;
  }

  function createTradeFromSetup(setupId) {
    if (!setupId) return;
    const setup = state.data.setups.find(s => s.id === setupId);
    if (!setup) { UI.showToast('Setup not found', 'error'); return; }
    if (!setup.trade_valid) { UI.showToast('Setup is invalid — cannot create trade', 'error'); return; }
    if (setup.trade_id) {
      UI.showToast(`Trade for ${setup.inputs?.ticker} already exists`, 'info');
      _switchTab('trades');
      UI.renderTrades(state.data);
      return;
    }

    const tp = setup.trade_plan;
    const tradeId = Storage.generateId();
    const trade = {
      id:              tradeId,
      setup_id:        setupId,
      ticker:          (setup.inputs.ticker || '').toUpperCase(),
      direction:       setup.inputs.direction,
      entry:           tp.entry,
      stop:            tp.stop,
      tp1:             tp.tp1,
      tp2:             tp.tp2,
      position_size:   tp.position_size,
      risk_per_share:  tp.risk_per_share,
      risk_amount:     tp.risk_amount,
      // Computed lifecycle state
      status:          'planned',
      tp1_hit:         false,
      current_stop:    tp.stop,
      shares_remaining: tp.position_size,
      pnl:             null,
      pnl_r:           null,
      open_date:       null,
      close_date:      null,
      result_type:     null,
      closed_price:    null,
      daily_updates:   [],
      created_at:      new Date().toISOString()
    };

    state.data.trades.push(trade);
    setup.trade_id = tradeId; // link in place

    save();
    UI.showToast(`Trade created for ${trade.ticker}`, 'success');
    _switchTab('trades');
    UI.renderTrades(state.data);
    return tradeId;
  }

  // ─── Trade Actions ───────────────────────────────────────────────────────────

  function addDailyUpdate(tradeId, updateInputs) {
    const idx = state.data.trades.findIndex(t => t.id === tradeId);
    if (idx === -1) return;

    const trade  = state.data.trades[idx];
    const update = {
      id:           Storage.generateId(),
      date:         updateInputs.date,
      open:         +updateInputs.open,
      high:         +updateInputs.high,
      low:          +updateInputs.low,
      close:        +updateInputs.close,
      is_time_exit: !!updateInputs.is_time_exit
    };

    trade.daily_updates = trade.daily_updates || [];
    trade.daily_updates.push(update);

    // Full deterministic replay
    const r = Strategy.replayTrade(trade, trade.daily_updates);
    Object.assign(trade, {
      status:           r.status,
      tp1_hit:          r.tp1_hit,
      current_stop:     r.current_stop,
      shares_remaining: r.shares_remaining,
      pnl:              r.pnl,
      pnl_r:            r.pnl_r,
      open_date:        r.open_date,
      close_date:       r.close_date,
      result_type:      r.result_type,
      closed_price:     r.closed_price
    });

    state.data.trades[idx] = trade;
    save();
    UI.renderTrades(state.data);

    const msg = r.status === 'closed'
      ? `Trade closed — ${r.result_type?.replace('_',' ')}`
      : (r.tp1_hit ? 'TP1 hit — stop moved to breakeven' : 'Update added');
    UI.showToast(msg, r.status === 'closed' ? 'success' : 'info');
  }

  function deleteDailyUpdate(tradeId, updateId) {
    const idx = state.data.trades.findIndex(t => t.id === tradeId);
    if (idx === -1) return;
    const trade = state.data.trades[idx];
    trade.daily_updates = (trade.daily_updates || []).filter(u => u.id !== updateId);

    const r = Strategy.replayTrade(trade, trade.daily_updates);
    Object.assign(trade, {
      status:           r.status,
      tp1_hit:          r.tp1_hit,
      current_stop:     r.current_stop,
      shares_remaining: r.shares_remaining,
      pnl:              r.pnl,
      pnl_r:            r.pnl_r,
      open_date:        r.open_date,
      close_date:       r.close_date,
      result_type:      r.result_type,
      closed_price:     r.closed_price
    });

    state.data.trades[idx] = trade;
    save();
    UI.renderTrades(state.data);
    UI.showToast('Update removed — trade replayed', 'info');
  }

  function deleteTrade(tradeId) {
    const trade = state.data.trades.find(t => t.id === tradeId);
    if (!trade) return;
    if (!confirm(`Delete trade for ${trade.ticker}? This cannot be undone.`)) return;

    state.data.trades = state.data.trades.filter(t => t.id !== tradeId);
    // Unlink from setup
    const setup = state.data.setups.find(s => s.trade_id === tradeId);
    if (setup) setup.trade_id = null;

    save();
    UI.renderTrades(state.data);
    UI.showToast('Trade deleted', 'info');
  }

  function deleteSetup(setupId) {
    const setup = state.data.setups.find(s => s.id === setupId);
    if (!setup) return;
    const ticker = setup.inputs?.ticker || setupId;
    if (!confirm(`Delete setup for ${ticker}? This cannot be undone.`)) return;

    state.data.setups = state.data.setups.filter(s => s.id !== setupId);
    save();
    UI.renderJournal(state.data, state.journalFilters, state.journalSort);
    UI.showToast('Setup deleted', 'info');
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  function _switchTab(tab) {
    state.activeTab = tab;
    UI.renderTab(tab);
    if (tab === 'result')  UI.renderSetupResult(state.lastResult, state.lastResultSaved, state.lastSavedSetupId);
    if (tab === 'trades')  UI.renderTrades(state.data);
    if (tab === 'journal') UI.renderJournal(state.data, state.journalFilters, state.journalSort);
    if (tab === 'stats')   UI.renderStats(Strategy.computeStats(state.data.setups, state.data.trades));
  }

  // ─── Global Events ────────────────────────────────────────────────────────────

  function _bindGlobalEvents() {

    // ── Tab navigation ──
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
    });

    // ── Export ──
    document.getElementById('btn-export').addEventListener('click', () => {
      Storage.exportJSON(state.data);
      UI.showToast('Data exported', 'success');
    });

    // ── Import ──
    document.getElementById('import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const imported = await Storage.importJSON(file);
        state.data = { ...Storage.defaultData(), ...imported };
        state.lastResult      = null;
        state.lastResultSaved = false;
        state.lastSavedSetupId = null;
        _replayAllTrades();
        save();
        _switchTab(state.activeTab);
        UI.showToast('Data imported successfully', 'success');
      } catch (err) {
        UI.showToast('Import failed: ' + err.message, 'error');
      }
      e.target.value = '';
    });

    // ── Clear all ──
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (!confirm('Delete ALL setups and trades? This cannot be undone.')) return;
      state.data = Storage.clearAll();
      state.lastResult       = null;
      state.lastResultSaved  = false;
      state.lastSavedSetupId = null;
      _switchTab('setup');
      UI.showToast('All data cleared', 'info');
    });

    // ── Setup form submit ──
    document.getElementById('setup-form').addEventListener('submit', e => {
      e.preventDefault();
      const inputs = UI.collectFormInputs();
      if (inputs) analyzeSetup(inputs);
    });

    // ── Result tab actions (delegated) ──
    document.getElementById('tab-result').addEventListener('click', e => {
      // "Save & Create Trade" OR "+ Create Trade" (after already saved)
      if (e.target.id === 'btn-save-setup') {
        if (!state.lastResultSaved) {
          // First click: save and create
          const sid = saveSetup();
          if (sid) createTradeFromSetup(sid);
        } else {
          // Already saved, just create trade
          createTradeFromSetup(state.lastSavedSetupId);
        }
      }
      // "Save to Journal" only (no trade)
      if (e.target.id === 'btn-save-only') {
        saveSetup();
      }
    });

    // ── Trades tab (delegated) ──
    document.getElementById('tab-trades').addEventListener('click', e => {
      const tradeCard = e.target.closest('[data-trade-id]');
      const tradeId   = tradeCard?.dataset.tradeId;

      if (e.target.classList.contains('btn-add-update') && tradeId) {
        UI.showUpdateModal(tradeId, data => addDailyUpdate(tradeId, data));
      }
      if (e.target.classList.contains('btn-delete-trade') && tradeId) {
        deleteTrade(tradeId);
      }
      if (e.target.classList.contains('btn-delete-update') && tradeId) {
        const updateId = e.target.dataset.updateId;
        if (updateId && confirm('Remove this update and replay lifecycle?')) {
          deleteDailyUpdate(tradeId, updateId);
        }
      }
    });

    // ── Journal filters — select/text change ──
    document.getElementById('tab-journal').addEventListener('change', e => {
      if (e.target.closest('#journal-filters')) {
        state.journalFilters[e.target.name] = e.target.value;
        UI.renderJournal(state.data, state.journalFilters, state.journalSort);
      }
    });
    document.getElementById('tab-journal').addEventListener('input', e => {
      if (e.target.name === 'ticker' && e.target.closest('#journal-filters')) {
        state.journalFilters.ticker = e.target.value.toUpperCase();
        UI.renderJournal(state.data, state.journalFilters, state.journalSort);
      }
    });

    // ── Journal — sort & row actions ──
    document.getElementById('tab-journal').addEventListener('click', e => {
      if (e.target.dataset.sortCol) {
        const col = e.target.dataset.sortCol;
        state.journalSort = {
          col,
          dir: (state.journalSort.col === col && state.journalSort.dir === 'asc') ? 'desc' : 'asc'
        };
        UI.renderJournal(state.data, state.journalFilters, state.journalSort);
      }
      if (e.target.classList.contains('btn-delete-setup')) {
        deleteSetup(e.target.dataset.setupId);
      }
      if (e.target.classList.contains('btn-create-trade-from-journal')) {
        createTradeFromSetup(e.target.dataset.setupId);
      }
    });

    // ── Modal close ──
    document.getElementById('modal-backdrop').addEventListener('click', UI.closeModal);
    document.getElementById('modal-close-btn').addEventListener('click',  UI.closeModal);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  return { init, analyzeSetup, saveSetup, createTradeFromSetup, addDailyUpdate };

})();

document.addEventListener('DOMContentLoaded', App.init);

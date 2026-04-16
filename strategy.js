// strategy.js — Pure strategy logic. No DOM. No side effects.
'use strict';

const Strategy = (() => {

  // ─── Utilities ───────────────────────────────────────────────────────────────

  const r4 = n => Math.round(n * 10000) / 10000;
  const r2 = n => Math.round(n * 100) / 100;
  const safe = (a, b) => (b === 0 || b == null ? 0 : a / b);
  const pct  = n => r2(n * 100);

  // ─── Core Calculations ───────────────────────────────────────────────────────

  function calculateMetrics(inp) {
    const range_d0 = inp.high_d0 - inp.low_d0;
    if (range_d0 <= 0) {
      return {
        range_d0: 0, mid_d0: r4(inp.close_d0 || 0),
        impulse: 0, body: 0, clv_long: 0, clv_short: 0,
        error: 'D0 range is zero — high must be greater than low'
      };
    }
    if (inp.close_prev_day <= 0) {
      return {
        range_d0: r4(range_d0), mid_d0: r4((inp.high_d0 + inp.low_d0) / 2),
        impulse: 0, body: 0, clv_long: 0, clv_short: 0,
        error: 'Previous close must be > 0'
      };
    }
    return {
      range_d0:  r4(range_d0),
      mid_d0:    r4((inp.high_d0 + inp.low_d0) / 2),
      impulse:   r4(safe(inp.close_d0 - inp.close_prev_day, inp.close_prev_day)),
      body:      r4(Math.abs(inp.close_d0 - inp.open_d0) / range_d0),
      clv_long:  r4((inp.close_d0 - inp.low_d0)  / range_d0),
      clv_short: r4((inp.high_d0  - inp.close_d0) / range_d0),
    };
  }

  function validateD0(inp, metrics, dir) {
    const reasons = [];
    const { close_d0, relative_volume_d0 } = inp;
    const { impulse, body, clv_long, clv_short } = metrics;
    const clv = dir === 'long' ? clv_long : clv_short;

    if (close_d0 < 20)
      reasons.push(`Price $${close_d0} < $20 minimum`);
    if (relative_volume_d0 < 1.5)
      reasons.push(`RelVol ${r2(relative_volume_d0)}x < 1.5x required`);
    if (body <= 0.5)
      reasons.push(`Body ratio ${pct(body)}% ≤ 50% — weak candle`);

    if (dir === 'long') {
      if (impulse < 0.05 || impulse > 0.12)
        reasons.push(`Impulse ${pct(impulse)}% outside [+5%, +12%]`);
      if (clv <= 0.70)
        reasons.push(`CLV_long ${pct(clv)}% ≤ 70% — close too low in range`);
    } else {
      if (impulse > -0.05 || impulse < -0.12)
        reasons.push(`Impulse ${pct(impulse)}% outside [−12%, −5%]`);
      if (clv <= 0.70)
        reasons.push(`CLV_short ${pct(clv)}% ≤ 70% — close too high in range`);
    }

    return { valid: reasons.length === 0, reasons };
  }

  function detectD1Pattern(inp, metrics, dir) {
    const { high_d0, low_d0, high_d1, low_d1, close_d1, close_d0 } = inp;
    const { range_d0, mid_d0 } = metrics;

    const inside_day = high_d1 <= high_d0 && low_d1 >= low_d0;

    let weak_pullback, compression;

    if (dir === 'long') {
      weak_pullback =
        low_d1  > mid_d0 &&
        safe(high_d0 - low_d1, range_d0) < 0.5 &&
        close_d1 > mid_d0;
      compression =
        safe(high_d1 - low_d1, range_d0) < 0.5 &&
        Math.abs(close_d1 - close_d0) < 0.3 * range_d0 &&
        close_d1 > mid_d0;
    } else {
      weak_pullback =
        high_d1  < mid_d0 &&
        safe(high_d1 - low_d0, range_d0) < 0.5 &&
        close_d1 < mid_d0;
      compression =
        safe(high_d1 - low_d1, range_d0) < 0.5 &&
        Math.abs(close_d1 - close_d0) < 0.3 * range_d0 &&
        close_d1 < mid_d0;
    }

    const detected = [];
    if (inside_day)    detected.push('Inside Day');
    if (weak_pullback) detected.push('Weak Pullback');
    if (compression)   detected.push('Compression');

    return {
      inside_day,
      weak_pullback,
      compression,
      structure_valid: inside_day || weak_pullback || compression,
      detected
    };
  }

  function calculateTradePlan(inp, metrics, dir) {
    const { atr14, account_size, risk_percent_per_trade, high_d0, low_d0, low_d1, high_d1 } = inp;

    const entry = r4(dir === 'long'
      ? high_d0 + 0.1 * atr14
      : low_d0  - 0.1 * atr14);

    const stop = r4(dir === 'long'
      ? low_d1  - 0.2 * atr14
      : high_d1 + 0.2 * atr14);

    const rps = r4(dir === 'long' ? entry - stop : stop - entry);
    const risk_amount = r2(account_size * (risk_percent_per_trade / 100));
    const position_size = (rps > 0) ? Math.floor(risk_amount / rps) : 0;
    const tp1 = r4(dir === 'long' ? entry + rps       : entry - rps);
    const tp2 = r4(dir === 'long' ? entry + 2 * rps   : entry - 2 * rps);
    const stop_ratio = (atr14 > 0) ? r2(rps / atr14) : null;
    const stop_valid = (atr14 > 0) ? (rps / atr14) <= 1.5 : false;

    return {
      entry, stop,
      risk_per_share: rps,
      risk_amount,
      position_size,
      tp1, tp2,
      stop_valid,
      stop_ratio
    };
  }

  // ─── Full Setup Evaluation ────────────────────────────────────────────────────

  function evaluateSetup(inputs) {
    const dir = inputs.direction;
    const metrics = calculateMetrics(inputs);

    if (metrics.error) {
      return {
        metrics,
        d0_valid: false,
        d0_invalid_reasons: [metrics.error],
        d1_pattern: { detected: [], structure_valid: false, inside_day: false, weak_pullback: false, compression: false },
        trade_plan: { entry: 0, stop: 0, tp1: 0, tp2: 0, position_size: 0, risk_per_share: 0, stop_valid: false },
        trade_valid: false,
        invalid_reasons: [metrics.error]
      };
    }

    const d0_res     = validateD0(inputs, metrics, dir);
    const d1_pattern = detectD1Pattern(inputs, metrics, dir);
    const trade_plan = calculateTradePlan(inputs, metrics, dir);

    const invalid_reasons = [
      ...d0_res.reasons,
      ...(!d1_pattern.structure_valid ? ['No valid D+1 structure (Inside Day / Weak Pullback / Compression)'] : []),
      ...(!trade_plan.stop_valid && trade_plan.stop_ratio != null
        ? [`Stop too wide: ${trade_plan.stop_ratio}× ATR > 1.5× max`] : []),
      ...(trade_plan.risk_per_share <= 0 ? ['Risk per share ≤ 0 — check entry/stop calculation'] : [])
    ];

    return {
      metrics,
      d0_valid: d0_res.valid,
      d0_invalid_reasons: d0_res.reasons,
      d1_pattern,
      trade_plan,
      trade_valid: d0_res.valid && d1_pattern.structure_valid && trade_plan.stop_valid && trade_plan.risk_per_share > 0,
      invalid_reasons
    };
  }

  // ─── Trade Lifecycle ─────────────────────────────────────────────────────────

  function _closeTrade(state, exit_price, date, result_type) {
    const { direction, entry, stop: init_stop, position_size, tp1_hit, tp1, shares_remaining } = state;
    const rps = Math.abs(entry - init_stop);
    const mult = direction === 'long' ? 1 : -1;

    let pnl_dollars;
    if (!tp1_hit) {
      pnl_dollars = mult * (exit_price - entry) * position_size;
    } else {
      const closed_at_tp1 = position_size - (shares_remaining || 0);
      pnl_dollars =
        mult * (tp1   - entry) * closed_at_tp1 +
        mult * (exit_price - entry) * (shares_remaining || 0);
    }

    const total_risk = rps * position_size;
    const pnl_r = (total_risk > 0) ? r2(pnl_dollars / total_risk) : 0;

    return {
      ...state,
      status:       'closed',
      close_date:   date,
      result_type,
      closed_price: r4(exit_price),
      pnl:          r2(pnl_dollars),
      pnl_r
    };
  }

  function applySingleUpdate(state, update) {
    if (state.status === 'closed') return state;

    const { high, low, close, date, is_time_exit } = update;
    const { direction, entry, tp1, tp2, position_size } = state;

    const current_stop     = (state.current_stop     != null) ? state.current_stop     : state.stop;
    const tp1_hit          = state.tp1_hit || false;
    const shares_remaining = (state.shares_remaining != null) ? state.shares_remaining : position_size;

    let s = { ...state, current_stop, tp1_hit, shares_remaining };

    // Activate planned trade
    if (s.status === 'planned') {
      const activated = direction === 'long' ? high >= entry : low <= entry;
      if (!activated) return s;
      s.status    = 'active';
      s.open_date = date;
    }

    // Manual time exit
    if (is_time_exit) {
      return _closeTrade(s, close, date, 'time_exit');
    }

    const stop_hit    = direction === 'long' ? low  <= current_stop : high >= current_stop;
    const tp1_reached = direction === 'long' ? high >= tp1          : low  <= tp1;
    const tp2_reached = direction === 'long' ? high >= tp2          : low  <= tp2;

    if (!tp1_hit) {
      if (stop_hit) {
        return _closeTrade(s, current_stop, date, 'stop');
      }
      if (tp1_reached) {
        s = {
          ...s,
          tp1_hit:          true,
          current_stop:     entry,        // move to breakeven
          shares_remaining: Math.floor(position_size / 2)
        };
        if (tp2_reached) {
          return _closeTrade(s, tp2, date, 'tp2');
        }
        return s;
      }
    } else {
      if (stop_hit) {
        // Stopped at breakeven
        return _closeTrade(s, entry, date, 'tp1_only');
      }
      if (tp2_reached) {
        return _closeTrade(s, tp2, date, 'tp2');
      }
    }

    return s;
  }

  /**
   * Deterministically replay all daily updates against the base trade definition.
   * Returns the fully computed current trade state.
   */
  function replayTrade(baseTrade, updates) {
    const initial = {
      ...baseTrade,
      status:          'planned',
      tp1_hit:         false,
      current_stop:    baseTrade.stop,
      shares_remaining: baseTrade.position_size,
      pnl:             null,
      pnl_r:           null,
      open_date:       null,
      close_date:      null,
      result_type:     null,
      closed_price:    null
    };

    const sorted = [...(updates || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted.reduce((st, upd) => applySingleUpdate(st, upd), initial);
  }

  // ─── Statistics ──────────────────────────────────────────────────────────────

  function computeStats(setups, trades) {
    const closed  = trades.filter(t => t.status === 'closed');
    const winners = closed.filter(t => (t.pnl_r || 0) > 0);

    const r_vals  = closed.map(t => t.pnl_r || 0);
    const avg_r   = r_vals.length ? r2(r_vals.reduce((a, b) => a + b, 0) / r_vals.length) : 0;
    const srt     = [...r_vals].sort((a, b) => a - b);
    const median_r = srt.length ? r2(srt[Math.floor(srt.length / 2)]) : 0;
    const total_pnl = r2(closed.reduce((a, t) => a + (t.pnl || 0), 0));

    const hold_days = closed
      .filter(t => t.open_date && t.close_date)
      .map(t => (new Date(t.close_date) - new Date(t.open_date)) / 86400000);
    const avg_hold = hold_days.length
      ? r2(hold_days.reduce((a, b) => a + b, 0) / hold_days.length) : 0;

    // By result type
    const by_result = {};
    closed.forEach(t => {
      const k = t.result_type || 'unknown';
      if (!by_result[k]) by_result[k] = { count: 0, wins: 0, total_r: 0 };
      by_result[k].count++;
      by_result[k].total_r = r2(by_result[k].total_r + (t.pnl_r || 0));
      if ((t.pnl_r || 0) > 0) by_result[k].wins++;
    });

    // By pattern
    const by_pattern = {};
    closed.forEach(t => {
      const setup = setups.find(s => s.id === t.setup_id);
      const pats = (setup?.d1_pattern?.detected?.length > 0)
        ? setup.d1_pattern.detected : ['Unknown'];
      pats.forEach(p => {
        if (!by_pattern[p]) by_pattern[p] = { count: 0, wins: 0, total_r: 0 };
        by_pattern[p].count++;
        by_pattern[p].total_r = r2(by_pattern[p].total_r + (t.pnl_r || 0));
        if ((t.pnl_r || 0) > 0) by_pattern[p].wins++;
      });
    });

    // Max drawdown over equity curve
    let equity = 0, peak = 0, max_dd = 0;
    [...closed]
      .sort((a, b) => new Date(a.close_date || 0) - new Date(b.close_date || 0))
      .forEach(t => {
        equity += (t.pnl || 0);
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > max_dd) max_dd = dd;
      });

    return {
      total_setups:  setups.length,
      valid_setups:  setups.filter(s => s.trade_valid).length,
      invalid_setups: setups.filter(s => !s.trade_valid).length,
      total_trades:  trades.length,
      closed_trades: closed.length,
      active_trades: trades.filter(t => t.status === 'active').length,
      planned_trades: trades.filter(t => t.status === 'planned').length,
      win_rate:      closed.length ? r2(winners.length / closed.length * 100) : 0,
      avg_r, median_r, total_pnl, avg_hold,
      by_result, by_pattern,
      max_dd: r2(max_dd)
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  return {
    calculateMetrics,
    validateD0,
    detectD1Pattern,
    calculateTradePlan,
    evaluateSetup,
    applySingleUpdate,
    replayTrade,
    computeStats,
    r2, r4
  };

})();

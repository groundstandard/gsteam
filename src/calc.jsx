// calc.jsx — scoring math (mirrors the Sheet's formulas in the UI for live readback).
// Source of truth is still the Sheet — this is for instant display while the prototype
// is detached from the live workbook.

const monthsBetween = (from, to) => {
  const a = new Date(from), b = new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
};

const fmtMoney = (n) => {
  if (n == null || isNaN(n)) return '$0';
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
};

const fmtPct = (n, decimals = 1) => {
  if (n == null || isNaN(n)) return '0%';
  return (n * 100).toFixed(decimals) + '%';
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtMonth = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const ymd = (d) => {
  const dt = (typeof d === 'string') ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
};

const firstOfMonth = (iso) => iso ? iso.slice(0, 7) + '-01' : '';
const todayIso = () => new Date().toISOString().slice(0, 10);
const currentMonthIso = () => firstOfMonth(todayIso());

// ── R/Y/G semantics ─────────────────────────────────────────────────────────
const STATUS_COLORS = {
  green:  '#43A047',
  yellow: '#F9A825',
  red:    '#E53935',
  gray:   '#94928C',
};

function scoreToStatus(score) {
  if (score == null || isNaN(score)) return 'gray';
  if (score >= 0.80) return 'green';
  if (score >= 0.60) return 'yellow';
  return 'red';
}

// Coerce-to-number with safe default. Live Supabase rows can have null/missing
// fields where local fixtures had real numbers — without this, math goes NaN.
const _n = (v, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

// ── Per-client sub-scores (simplified mirror of the Sheet) ─────────────────
function clientSubScores(client, metrics, surveys, config) {
  const cfg = config || {};
  const cMetrics = (metrics || [])
    .filter(m => m.clientId === client.id)
    .sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  const recent = cMetrics.slice(-3); // last 3 months

  if (recent.length === 0) {
    return { revenue: null, adEfficiency: null, funnel: null, attrition: null, satisfaction: null, growth: null, composite: null };
  }

  // Revenue: avg client MRR vs retainer
  const avgMRR = recent.reduce((s, m) => s + _n(m.clientMRR), 0) / recent.length;
  const revenue = clamp(avgMRR / Math.max(_n(client.monthlyRetainer), 1), 0, 1.2);

  // Ad Efficiency: spent within target band of gross revenue.
  // Per TICKET-4 (2026-04-30): clientGrossRevenue is now a real column with
  // default 0; we still fall back to clientMRR for legacy rows that have
  // gross_revenue == 0 (no one-time charges, gross == MRR for that month).
  const adRatios = recent.map(m => {
    const gross = _n(m.clientGrossRevenue) || _n(m.clientMRR);
    return _n(m.adSpend) / Math.max(gross, 1);
  });
  const avgAdRatio = adRatios.reduce((a, b) => a + b, 0) / adRatios.length;
  const target = _n(cfg.adSpendPctOfGross, 0.10);
  const adEfficiency = avgAdRatio === 0 ? 0
    : clamp(1 - Math.abs(avgAdRatio - target) / target, 0, 1);

  // Funnel: avg of 3 conversion floors
  const fScores = recent.map(m => {
    const booking = _n(m.apptsBooked) / Math.max(_n(m.leadsGenerated), 1);
    const show    = _n(m.leadsShowed) / Math.max(_n(m.apptsBooked),   1);
    const close   = _n(m.leadsSigned) / Math.max(_n(m.leadsShowed),   1);
    return (
      clamp(booking / Math.max(_n(cfg.bookingFloor, 0.30), 0.01), 0, 1) +
      clamp(show    / Math.max(_n(cfg.showFloor,    0.50), 0.01), 0, 1) +
      clamp(close   / Math.max(_n(cfg.closeFloor,   0.30), 0.01), 0, 1)
    ) / 3;
  });
  const funnel = fScores.reduce((a, b) => a + b, 0) / fScores.length;

  // Attrition: monthly cancel rate
  const attRates = recent.map(m => _n(m.studentsCancelled) / Math.max(_n(m.totalStudentsStart), 1));
  const avgAtt = attRates.reduce((a, b) => a + b, 0) / attRates.length;
  const greenFloor = _n(cfg.attritionGreenFloor, 0.85);
  const criticalCeil = _n(cfg.attritionCriticalCeiling, 0.70);
  let attrition;
  if (avgAtt <= greenFloor) attrition = 1;
  else if (avgAtt >= criticalCeil) attrition = 0.4;
  else attrition = 1 - (avgAtt - greenFloor) / Math.max((criticalCeil - greenFloor), 0.01) * 0.6;

  // Satisfaction: avg of recent (lookback) survey responses
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - _n(cfg.satisfactionLookbackMonths, 3));
  const recentSurveys = (surveys || []).filter(s =>
    s.clientId === client.id && s.date && new Date(s.date) >= cutoff
  );
  let satisfaction;
  if (recentSurveys.length === 0) {
    satisfaction = _n(cfg.noResponsePenalty, 0.5);
  } else {
    // Live schema: surveys.score is a single int 1–10. Local fixtures had
    // 4 sub-scores (overall / responsiveness / followThrough / communication
    // each on a 1–5 scale). Support both:
    //   - if r.score exists, use that on a 1–10 scale
    //   - else avg the 4 sub-scores on a 1–5 scale
    const total = recentSurveys.reduce((s, r) => {
      if (r.score != null) return s + _n(r.score) / 10;
      const sub = (_n(r.overall) + _n(r.responsiveness) + _n(r.followThrough) + _n(r.communication)) / 4;
      return s + sub / 5;
    }, 0);
    satisfaction = clamp(total / recentSurveys.length, 0, 1);
  }

  // Growth: based on MRR trajectory + add-on
  const first = _n(recent[0].clientMRR), last = _n(recent[recent.length - 1].clientMRR);
  const trend = (last - first) / Math.max(first, 1);
  let growth = clamp(0.6 + trend * 4, 0, 1);
  if (client.hasMembershipAddon) growth = Math.min(1, growth + 0.1);

  const composite = (revenue + adEfficiency + funnel + attrition + satisfaction + growth) / 6;

  return { revenue, adEfficiency, funnel, attrition, satisfaction, growth, composite };
}

// ── Per-CA scorecard ───────────────────────────────────────────────────────
function caScorecard(ca, state) {
  if (!ca) {
    return {
      composite: 0, finalPayout: 0, maxPayout: 7500,
      bookCompleteness: 1, performance: 0, retention: 0, growth: 0,
      clients: [],
    };
  }
  const cfg = (state && state.config) || {};
  const allClients = (state && state.clients) || [];
  const allMetrics = (state && state.monthlyMetrics) || [];
  const allSurveys = (state && state.surveys) || [];
  const allEvents  = (state && state.growthEvents) || [];

  const myClients = allClients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  if (myClients.length === 0) {
    return {
      composite: 0, finalPayout: 0, maxPayout: 7500,
      bookCompleteness: 1, performance: 0, retention: 0, growth: 0,
      clients: [],
    };
  }

  const subs = myClients.map(c => ({
    client: c,
    sub: clientSubScores(c, allMetrics, allSurveys, cfg),
  }));
  const validSubs = subs.filter(s => s.sub.composite != null);

  const avg = (arr, key) => {
    const vals = arr.map(s => s.sub[key]).filter(v => v != null && Number.isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const performance = (avg(validSubs, 'revenue') + avg(validSubs, 'adEfficiency') + avg(validSubs, 'funnel')) / 3;
  const retention = (avg(validSubs, 'attrition') + avg(validSubs, 'satisfaction')) / 2;

  // Quarter window — fall back to current quarter if config doesn't set one
  const qStartIso = cfg.quarterStart || `${new Date().getFullYear()}-${String(Math.floor(new Date().getMonth() / 3) * 3 + 1).padStart(2, '0')}-01`;
  const qEndIso   = cfg.quarterEnd   || qStartIso; // 1-month fallback if missing
  const qStart = new Date(qStartIso);
  const myEvents = allEvents.filter(e => {
    const c = allClients.find(cl => cl.id === e.clientId);
    return c && c.assignedCA === ca.id && e.date && new Date(e.date) >= qStart;
  });
  const eventBoost = clamp((myEvents.length || 0) / Math.max(myClients.length * 1.5, 1), 0, 1);
  const growth = (avg(validSubs, 'growth') + eventBoost) / 2;

  const monthsInQuarter = Math.max(monthsBetween(qStartIso, qEndIso) + 1, 1);
  const expected = myClients.length * monthsInQuarter;
  const filled = allMetrics.filter(m => {
    const c = allClients.find(cl => cl.id === m.clientId);
    return c && c.assignedCA === ca.id && m.month >= qStartIso && m.month <= qEndIso;
  }).length;
  const bookCompleteness = expected > 0 ? clamp(filled / expected, 0, 1) : 1;

  const composite = (performance * bookCompleteness + retention + growth) / 3;
  const maxPayout = 7500;
  const safeComposite = Number.isFinite(composite) ? composite : 0;
  const finalPayout = Math.round(safeComposite * maxPayout);

  return {
    composite: safeComposite,
    finalPayout, maxPayout,
    bookCompleteness: Number.isFinite(bookCompleteness) ? bookCompleteness : 1,
    performance: Number.isFinite(performance) ? performance : 0,
    retention:   Number.isFinite(retention)   ? retention   : 0,
    growth:      Number.isFinite(growth)      ? growth      : 0,
    clients: subs,
  };
}

// ── Sales commissions ───────────────────────────────────────────────────────
function salesRollup(repId, state) {
  const rep = state.sales.find(s => s.id === repId);
  if (!rep) return null;

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const myContracts = state.clients.filter(c => {
    if (rep.role === 'AE') return c.ae === repId;
    if (rep.role === 'SDR') return c.sdrBookedBy === repId;
    return false;
  });

  const milestones = [];
  myContracts.forEach(c => {
    const sign = new Date(c.signDate);
    const contractValue = c.monthlyRetainer * c.termMonths;

    if (rep.role === 'AE') {
      const upfrontDate = new Date(sign);
      const midDate = new Date(sign); midDate.setMonth(midDate.getMonth() + Math.floor(c.termMonths / 2));
      const endDate = new Date(sign); endDate.setMonth(endDate.getMonth() + c.termMonths);

      milestones.push({ clientId: c.id, label: 'Upfront', date: ymd(upfrontDate), amount: contractValue * c.upfrontPct, status: upfrontDate < new Date() ? 'paid' : 'pending' });
      milestones.push({ clientId: c.id, label: 'Midpoint', date: ymd(midDate),  amount: contractValue * c.midPct,     status: midDate < new Date() ? 'paid' : 'pending' });
      milestones.push({ clientId: c.id, label: 'End',      date: ymd(endDate),  amount: contractValue * c.endPct,     status: 'pending' });
    } else if (rep.role === 'SDR') {
      milestones.push({ clientId: c.id, label: 'Booking', date: ymd(sign), amount: state.config.sdrFlatFeePerBooking, status: 'paid' });
    }
  });

  const ytdMilestones = milestones.filter(m => new Date(m.date) >= yearStart);
  const paidYtd = ytdMilestones.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const pending = milestones.filter(m => m.status === 'pending').reduce((s, m) => s + m.amount, 0);

  // Adjustments
  const myAdj = state.adjustments.filter(a => a.repId === repId);
  const adjPaid = myAdj.filter(a => a.status === 'Paid').reduce((s, a) => {
    return s + (a.type === 'Clawback' ? -a.amount : a.amount);
  }, 0);
  const adjPending = myAdj.filter(a => a.status === 'Pending').reduce((s, a) => s + a.amount, 0);

  // Upcoming 30 days
  const today = new Date();
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const upcoming = milestones.filter(m => {
    const d = new Date(m.date);
    return d >= today && d <= in30 && m.status === 'pending';
  });

  return {
    rep,
    contracts: myContracts,
    milestones,
    paidYtd: paidYtd + adjPaid,
    pending: pending + adjPending,
    activeContracts: myContracts.filter(c => !c.cancelDate).length,
    upcoming,
  };
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

Object.assign(window, {
  CABT_clientSubScores: clientSubScores,
  CABT_caScorecard: caScorecard,
  CABT_salesRollup: salesRollup,
  CABT_scoreToStatus: scoreToStatus,
  CABT_STATUS_COLORS: STATUS_COLORS,
  CABT_fmtMoney: fmtMoney,
  CABT_fmtPct: fmtPct,
  CABT_fmtDate: fmtDate,
  CABT_fmtMonth: fmtMonth,
  CABT_currentMonthIso: currentMonthIso,
  CABT_firstOfMonth: firstOfMonth,
  CABT_todayIso: todayIso,
  CABT_clamp: clamp,
});

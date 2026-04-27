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

// ── Per-client sub-scores (simplified mirror of the Sheet) ─────────────────
function clientSubScores(client, metrics, surveys, config) {
  const cMetrics = metrics
    .filter(m => m.clientId === client.id)
    .sort((a, b) => a.month.localeCompare(b.month));
  const recent = cMetrics.slice(-3); // last 3 months

  if (recent.length === 0) {
    return { revenue: null, adEfficiency: null, funnel: null, attrition: null, satisfaction: null, growth: null, composite: null };
  }

  // Revenue: avg client MRR vs retainer
  const avgMRR = recent.reduce((s, m) => s + m.clientMRR, 0) / recent.length;
  const revenue = clamp(avgMRR / Math.max(client.monthlyRetainer, 1), 0, 1.2);

  // Ad Efficiency: spent within target band of gross revenue
  const adRatios = recent.map(m => m.adSpend / Math.max(m.clientGrossRevenue, 1));
  const avgAdRatio = adRatios.reduce((a, b) => a + b, 0) / adRatios.length;
  const target = config.adSpendPctOfGross;
  const adEfficiency = avgAdRatio === 0 ? 0
    : clamp(1 - Math.abs(avgAdRatio - target) / target, 0, 1);

  // Funnel: avg of 3 conversion floors
  const fScores = recent.map(m => {
    const booking = m.apptsBooked / Math.max(m.leadsGenerated, 1);
    const show = m.leadsShowed / Math.max(m.apptsBooked, 1);
    const close = m.leadsSigned / Math.max(m.leadsShowed, 1);
    return (
      clamp(booking / config.bookingFloor, 0, 1) +
      clamp(show / config.showFloor, 0, 1) +
      clamp(close / config.closeFloor, 0, 1)
    ) / 3;
  });
  const funnel = fScores.reduce((a, b) => a + b, 0) / fScores.length;

  // Attrition: monthly cancel rate
  const attRates = recent.map(m => m.studentsCancelled / Math.max(m.priorStudents, 1));
  const avgAtt = attRates.reduce((a, b) => a + b, 0) / attRates.length;
  let attrition;
  if (avgAtt <= config.attritionGreenFloor) attrition = 1;
  else if (avgAtt >= config.attritionCriticalCeiling) attrition = 0.4;
  else attrition = 1 - (avgAtt - config.attritionGreenFloor) /
    (config.attritionCriticalCeiling - config.attritionGreenFloor) * 0.6;

  // Satisfaction: avg of recent (lookback) survey responses
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - config.satisfactionLookbackMonths);
  const recentSurveys = surveys.filter(s =>
    s.clientId === client.id && new Date(s.date) >= cutoff
  );
  let satisfaction;
  if (recentSurveys.length === 0) {
    satisfaction = config.noResponsePenalty;
  } else {
    const avg = recentSurveys.reduce((s, r) =>
      s + (r.overall + r.responsiveness + r.followThrough + r.communication) / 4, 0
    ) / recentSurveys.length;
    satisfaction = clamp(avg / 5, 0, 1);
  }

  // Growth: based on MRR trajectory + add-on
  const first = recent[0].clientMRR, last = recent[recent.length - 1].clientMRR;
  const trend = (last - first) / Math.max(first, 1);
  let growth = clamp(0.6 + trend * 4, 0, 1);
  if (client.hasMembershipAddon) growth = Math.min(1, growth + 0.1);

  const composite = (revenue + adEfficiency + funnel + attrition + satisfaction + growth) / 6;

  return { revenue, adEfficiency, funnel, attrition, satisfaction, growth, composite };
}

// ── Per-CA scorecard ───────────────────────────────────────────────────────
function caScorecard(ca, state) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  if (myClients.length === 0) {
    return {
      composite: 0, finalPayout: 0, maxPayout: 0,
      bookCompleteness: 1, performance: 0, retention: 0, growth: 0,
      clients: [],
    };
  }

  const subs = myClients.map(c => ({
    client: c,
    sub: clientSubScores(c, state.monthlyMetrics, state.surveys, state.config),
  }));
  const validSubs = subs.filter(s => s.sub.composite != null);

  const avg = (arr, key) => {
    const vals = arr.map(s => s.sub[key]).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  // Performance bucket: avg of revenue/ad/funnel
  const performance = (avg(validSubs, 'revenue') + avg(validSubs, 'adEfficiency') + avg(validSubs, 'funnel')) / 3;
  // Retention bucket: avg of attrition + satisfaction
  const retention = (avg(validSubs, 'attrition') + avg(validSubs, 'satisfaction')) / 2;
  // Growth bucket: growth sub + count of growth events this quarter
  const qStart = new Date(state.config.quarterStart);
  const myEvents = state.growthEvents.filter(e => {
    const c = state.clients.find(cl => cl.id === e.clientId);
    return c && c.assignedCA === ca.id && new Date(e.date) >= qStart;
  });
  const eventBoost = clamp(myEvents.length / (myClients.length * 1.5), 0, 1);
  const growth = (avg(validSubs, 'growth') + eventBoost) / 2;

  // Book Data Completeness: how many client-months in current quarter are filled
  const monthsInQuarter = monthsBetween(state.config.quarterStart, state.config.quarterEnd) + 1;
  const expected = myClients.length * monthsInQuarter;
  const filled = state.monthlyMetrics.filter(m => {
    const c = state.clients.find(cl => cl.id === m.clientId);
    return c && c.assignedCA === ca.id &&
      m.month >= state.config.quarterStart && m.month <= state.config.quarterEnd;
  }).length;
  const bookCompleteness = expected > 0 ? clamp(filled / expected, 0, 1) : 1;

  // Composite: avg of buckets, gated by completeness on Performance
  const composite = (performance * bookCompleteness + retention + growth) / 3;

  // Payout: $750 per 0.10 of composite, max ~$7,500
  const maxPayout = 7500;
  const finalPayout = Math.round(composite * maxPayout);

  return {
    composite, finalPayout, maxPayout,
    bookCompleteness, performance, retention, growth,
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

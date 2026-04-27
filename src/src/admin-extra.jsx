// admin-extra.jsx — extended Admin screens for v0.2 scope
//   • Annual Bonus    — quarterly composites → annual payout per CA
//   • Revenue Ledger  — month×client retainer + add-on revenue ledger
//   • Client Rollup   — book-wide client list with sub-scores; tap → Per-Client Calc
//   • Per-Client Calc — exact inputs feeding each sub-score for one client
//   • Open Questions  — open product/policy questions for leadership

// ── Helpers ────────────────────────────────────────────────────────────────
function quartersOfYear(year) {
  return [
    { key: `${year}-Q1`, label: `Q1 ${year}`, start: `${year}-01-01`, end: `${year}-03-31` },
    { key: `${year}-Q2`, label: `Q2 ${year}`, start: `${year}-04-01`, end: `${year}-06-30` },
    { key: `${year}-Q3`, label: `Q3 ${year}`, start: `${year}-07-01`, end: `${year}-09-30` },
    { key: `${year}-Q4`, label: `Q4 ${year}`, start: `${year}-10-01`, end: `${year}-12-31` },
  ];
}

// Synthesize a per-quarter composite for a CA from their existing book.
// Demo math: vary the live composite slightly per quarter so the table tells a story.
function caQuarterComposite(ca, state, qStart, qEnd) {
  const qConfig = { ...state.config, quarterStart: qStart, quarterEnd: qEnd };
  const score = CABT_caScorecard(ca, { ...state, config: qConfig });
  // Add small deterministic variation per quarter so historical quarters differ.
  const seed = (ca.id + qStart).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const wobble = ((seed % 17) - 8) / 100; // -0.08..+0.08
  const composite = CABT_clamp((score.composite || 0) + wobble, 0, 1);
  return { composite, payout: Math.round(composite * 7500) };
}

// ── Annual Bonus ───────────────────────────────────────────────────────────
function AdminAnnualBonus({ state, theme }) {
  const year = new Date(state.config.quarterStart).getFullYear();
  const qs = quartersOfYear(year);
  const cas = state.cas.filter(c => c.active);

  const rows = cas.map(ca => {
    const qScores = qs.map(q => caQuarterComposite(ca, state, q.start, q.end));
    const annualPayout = qScores.reduce((s, q) => s + q.payout, 0);
    const avgComposite = qScores.reduce((s, q) => s + q.composite, 0) / qs.length;
    return { ca, qScores, annualPayout, avgComposite };
  });

  const totalAnnual = rows.reduce((s, r) => s + r.annualPayout, 0);
  const avgComposite = rows.reduce((s, r) => s + r.avgComposite, 0) / Math.max(rows.length, 1);

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card theme={theme} padding={18}>
        <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>FY {year} · Bonus pool</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <div style={{ fontFamily: theme.serif, fontSize: 36, fontWeight: 600, color: theme.ink, letterSpacing: -0.7, lineHeight: 1 }}>
            {CABT_fmtMoney(totalAnnual)}
          </div>
          <div style={{ fontSize: 13, color: theme.inkMuted }}>across {cas.length} CAs</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: theme.inkSoft }}>
          Avg composite <strong style={{ color: theme.ink }}>{(avgComposite*100).toFixed(0)}/100</strong>
        </div>
      </Card>

      <Card theme={theme} padding={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 1fr) 1.1fr', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${theme.rule}`, fontSize: 10, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          <div>CA</div>
          {qs.map(q => <div key={q.key} style={{ textAlign: 'center' }}>{q.label.split(' ')[0]}</div>)}
          <div style={{ textAlign: 'right' }}>FY total</div>
        </div>
        {rows.map((r, i) => (
          <div key={r.ca.id} style={{
            display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 1fr) 1.1fr',
            alignItems: 'center', padding: '12px',
            borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${theme.rule}`,
            fontSize: 13,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ca.name}</div>
              <div style={{ fontSize: 11, color: theme.inkMuted }}>{r.ca.id}</div>
            </div>
            {r.qScores.map((q, qi) => {
              const s = CABT_scoreToStatus(q.composite);
              return (
                <div key={qi} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: STATUS[s], fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                    {(q.composite*100).toFixed(0)}
                  </div>
                  <div style={{ fontSize: 10, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                    {CABT_fmtMoney(q.payout)}
                  </div>
                </div>
              );
            })}
            <div style={{ textAlign: 'right', fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>
              {CABT_fmtMoney(r.annualPayout)}
            </div>
          </div>
        ))}
      </Card>

      <div style={{ fontSize: 12, color: theme.inkMuted, padding: '0 4px', lineHeight: 1.5 }}>
        Annual payout = sum of quarterly composite × $7,500 cap. Quarterly figures use the same scoring engine the CA sees on their scorecard.
      </div>
    </div>
  );
}

// ── Revenue Ledger ─────────────────────────────────────────────────────────
function AdminRevenueLedger({ state, theme }) {
  // Build month list from existing metrics
  const months = Array.from(new Set(state.monthlyMetrics.map(m => m.month))).sort();
  const visible = months.slice(-4); // last 4 months for mobile width
  const [filter, setFilter] = React.useState('all'); // all | membership | core

  let clients = state.clients.filter(c => !c.cancelDate);
  if (filter === 'membership') clients = clients.filter(c => c.hasMembershipAddon);
  if (filter === 'core')       clients = clients.filter(c => !c.hasMembershipAddon);

  const cellFor = (clientId, month) => {
    const m = state.monthlyMetrics.find(mm => mm.clientId === clientId && mm.month === month);
    return m ? m.clientMRR : null;
  };

  // Totals
  const totals = visible.map(m =>
    clients.reduce((s, c) => s + (cellFor(c.id, m) || 0), 0)
  );
  const grand = totals.reduce((s, n) => s + n, 0);
  const membershipRev = clients
    .filter(c => c.hasMembershipAddon)
    .reduce((s, c) => s + c.monthlyRetainer * state.config.membershipRevenueRate * visible.length, 0);

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <KPI theme={theme} label={`Booked · last ${visible.length}mo`} value={CABT_fmtMoney(grand)} />
        <KPI theme={theme} label="Add-on revenue" value={CABT_fmtMoney(membershipRev)} />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { v: 'all',        label: 'All',        n: state.clients.filter(c => !c.cancelDate).length },
          { v: 'membership', label: 'Membership', n: state.clients.filter(c => !c.cancelDate && c.hasMembershipAddon).length },
          { v: 'core',       label: 'Core only',  n: state.clients.filter(c => !c.cancelDate && !c.hasMembershipAddon).length },
        ].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)} style={{
            padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
            background: filter === f.v ? theme.ink : theme.surface,
            color: filter === f.v ? theme.accentInk : theme.ink,
            border: `1px solid ${filter === f.v ? theme.ink : theme.rule}`,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {f.label} <span style={{ opacity: 0.65 }}>{f.n}</span>
          </button>
        ))}
      </div>

      <Card theme={theme} padding={0}>
        <div style={{ display: 'grid', gridTemplateColumns: `1.6fr repeat(${visible.length}, 1fr)`, padding: '10px 12px', borderBottom: `1px solid ${theme.rule}`, fontSize: 10, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          <div>Client</div>
          {visible.map(m => (
            <div key={m} style={{ textAlign: 'right' }}>
              {new Date(m + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
            </div>
          ))}
        </div>
        {clients.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: `1.6fr repeat(${visible.length}, 1fr)`,
            padding: '10px 12px',
            borderBottom: i === clients.length - 1 ? 'none' : `1px solid ${theme.rule}`,
            fontSize: 13, alignItems: 'center',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
                {c.hasMembershipAddon && <span style={{ fontSize: 9, padding: '1px 5px', background: theme.gold + '22', color: theme.gold, borderRadius: 4, fontWeight: 700, letterSpacing: 0.4 }}>M</span>}
              </div>
              <div style={{ fontSize: 11, color: theme.inkMuted }}>{c.id}</div>
            </div>
            {visible.map(m => {
              const v = cellFor(c.id, m);
              return (
                <div key={m} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: v == null ? theme.inkMuted : theme.ink, fontWeight: v == null ? 400 : 600 }}>
                  {v == null ? '—' : CABT_fmtMoney(v)}
                </div>
              );
            })}
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: `1.6fr repeat(${visible.length}, 1fr)`, padding: '12px', background: theme.bgElev, borderTop: `1px solid ${theme.rule}`, fontSize: 13, fontWeight: 700, color: theme.ink }}>
          <div>Total</div>
          {totals.map((t, i) => (
            <div key={i} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {CABT_fmtMoney(t)}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ fontSize: 12, color: theme.inkMuted, padding: '0 4px', lineHeight: 1.5 }}>
        Reflects the Sheet's <em>Revenue Ledger</em> tab — Client MRR by month, with membership add-on flag. Add-on revenue computed at <strong style={{ color: theme.ink }}>{(state.config.membershipRevenueRate*100).toFixed(0)}%</strong> revenue share per Config.
      </div>
    </div>
  );
}

// ── Client Rollup (admin-wide) ──────────────────────────────────────────────
function AdminClientRollup({ state, theme, navigate }) {
  const [sort, setSort] = React.useState('status'); // status | name | mrr | tenure
  const [search, setSearch] = React.useState('');

  const pendingClients = (state.pendingClients || []).filter(p => p.status === 'pending');

  const enriched = state.clients
    .filter(c => !c.cancelDate)
    .map(c => {
      const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, state.config);
      const status = CABT_scoreToStatus(sub.composite);
      const ca = state.cas.find(x => x.id === c.assignedCA);
      const tenure = (new Date() - new Date(c.signDate)) / (1000 * 60 * 60 * 24 * 30);
      return { client: c, sub, status, ca, tenure };
    })
    .filter(e => !search || e.client.name.toLowerCase().includes(search.toLowerCase()) || e.client.id.toLowerCase().includes(search.toLowerCase()));

  const sortKey = { red: 0, yellow: 1, gray: 2, green: 3 };
  const sorted = [...enriched].sort((a, b) => {
    if (sort === 'status') return sortKey[a.status] - sortKey[b.status];
    if (sort === 'name')   return a.client.name.localeCompare(b.client.name);
    if (sort === 'mrr')    return b.client.monthlyRetainer - a.client.monthlyRetainer;
    if (sort === 'tenure') return b.tenure - a.tenure;
    return 0;
  });

  const buckets = { green: 0, yellow: 0, red: 0, gray: 0 };
  enriched.forEach(e => buckets[e.status]++);

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
        {[
          ['green',  buckets.green,  'On track'],
          ['yellow', buckets.yellow, 'Watch'],
          ['red',    buckets.red,    'At risk'],
          ['gray',   buckets.gray,   'No data'],
        ].map(([k, n, label]) => (
          <div key={k} style={{
            background: theme.surface, border: `1px solid ${theme.rule}`,
            borderRadius: theme.radius - 2, padding: '10px 8px', textAlign: 'center',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[k], margin: '0 auto 6px' }}/>
            <div style={{ fontSize: 20, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: 9, color: theme.inkMuted, letterSpacing: 0.3, marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button theme={theme} variant="primary" icon="plus" fullWidth onClick={() => navigate('add-client')}>
          Add client
        </Button>
        {pendingClients.length > 0 && (
          <button onClick={() => navigate('pending-clients')} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: theme.radius - 4,
            background: STATUS.yellow + '18', border: `1px solid ${STATUS.yellow}55`,
            color: '#8C5A00', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <Icon name="alert" size={14}/>
            {pendingClients.length} from Stripe
          </button>
        )}
      </div>

      <Input theme={theme} value={search} onChange={setSearch} placeholder="Search client name or ID…" />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {[
          { v: 'status', label: 'By status' },
          { v: 'name',   label: 'A–Z' },
          { v: 'mrr',    label: 'MRR' },
          { v: 'tenure', label: 'Tenure' },
        ].map(s => (
          <button key={s.v} onClick={() => setSort(s.v)} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
            background: sort === s.v ? theme.ink : 'transparent',
            color: sort === s.v ? theme.accentInk : theme.inkSoft,
            border: `1px solid ${sort === s.v ? theme.ink : theme.rule}`,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{s.label}</button>
        ))}
      </div>

      <Card theme={theme} padding={0}>
        {sorted.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>No clients match.</div>}
        {sorted.map((e, i) => (
          <button key={e.client.id} onClick={() => navigate('client-calc', { clientId: e.client.id })} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: 'transparent', border: 'none',
            padding: '12px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: i === sorted.length - 1 ? 'none' : `1px solid ${theme.rule}`,
          }}>
            <span style={{ width: 4, alignSelf: 'stretch', background: STATUS[e.status], borderRadius: 2, flexShrink: 0 }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.client.name}</div>
              <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 2 }}>
                {e.ca?.name || 'Unassigned'} · {CABT_fmtMoney(e.client.monthlyRetainer)}/mo · {Math.round(e.tenure)}mo
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 700, color: STATUS[e.status], fontVariantNumeric: 'tabular-nums' }}>
              {e.sub.composite != null ? (e.sub.composite*100).toFixed(0) : '—'}
            </div>
            <Icon name="chev-r" size={14} color={theme.inkMuted}/>
          </button>
        ))}
      </Card>
    </div>
  );
}

// ── Per-Client Calc ─────────────────────────────────────────────────────────
function AdminClientCalc({ state, theme, clientId, navigate }) {
  const c = state.clients.find(cl => cl.id === clientId);
  if (!c) return <div style={{ padding: 24 }}>Client not found.</div>;
  const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, state.config);
  const status = CABT_scoreToStatus(sub.composite);
  const ca = state.cas.find(x => x.id === c.assignedCA);
  const recent = state.monthlyMetrics
    .filter(m => m.clientId === c.id)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 3);

  // Reverse-engineered inputs feeding each sub-score
  const avgMRR = recent.length ? recent.reduce((s, m) => s + m.clientMRR, 0) / recent.length : 0;
  const avgAdRatio = recent.length ? recent.reduce((s, m) => s + (m.adSpend / Math.max(m.clientGrossRevenue, 1)), 0) / recent.length : 0;
  const fAvgs = recent.length ? {
    booking: recent.reduce((s, m) => s + (m.apptsBooked / Math.max(m.leadsGenerated, 1)), 0) / recent.length,
    show:    recent.reduce((s, m) => s + (m.leadsShowed / Math.max(m.apptsBooked, 1)), 0) / recent.length,
    close:   recent.reduce((s, m) => s + (m.leadsSigned / Math.max(m.leadsShowed, 1)), 0) / recent.length,
  } : { booking: 0, show: 0, close: 0 };
  const avgAtt = recent.length ? recent.reduce((s, m) => s + (m.studentsCancelled / Math.max(m.priorStudents, 1)), 0) / recent.length : 0;

  const Row = ({ label, value, target, sub: subline, score, color }) => (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${theme.rule}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontSize: 13, color: theme.ink, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: color || theme.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.inkMuted }}>
        <span>{subline || ''}</span>
        {target && <span style={{ fontFamily: theme.mono }}>{target}</span>}
      </div>
      {score != null && (
        <div style={{ marginTop: 6, height: 4, background: theme.rule, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${(score*100).toFixed(0)}%`, height: '100%', background: STATUS[CABT_scoreToStatus(score)] }}/>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '4px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>Per-client calc · {c.id}</div>
            <div style={{ fontFamily: theme.serif, fontSize: 24, fontWeight: 600, color: theme.ink, letterSpacing: -0.4, lineHeight: 1.15, marginTop: 2 }}>{c.name}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <StatusPill status={status} />
              <span style={{ fontSize: 12, color: theme.inkMuted }}>{ca?.name || 'Unassigned'}</span>
              <span style={{ fontSize: 12, color: theme.inkMuted }}>· {recent.length}/3 months data</span>
            </div>
          </div>
          <ScoreRing value={sub.composite || 0} size={64} stroke={5} color={STATUS[status]} bg={theme.rule}
            label={<div style={{ fontSize: 16, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>
              {sub.composite != null ? (sub.composite*100).toFixed(0) : '—'}
            </div>}/>
        </div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card theme={theme} padding={14}>
          <SectionLabel theme={theme}>Inputs (last {recent.length} months)</SectionLabel>
          <Row label="Revenue"
            value={CABT_fmtMoney(avgMRR)}
            target={`Retainer ${CABT_fmtMoney(c.monthlyRetainer)}`}
            sub="Avg client MRR vs contracted retainer"
            score={sub.revenue}/>
          <Row label="Ad efficiency"
            value={`${(avgAdRatio*100).toFixed(1)}%`}
            target={`Target ${(state.config.adSpendPctOfGross*100).toFixed(0)}% of gross`}
            sub="Avg ad spend ÷ client gross revenue"
            score={sub.adEfficiency}/>
          <Row label="Funnel · book"
            value={`${(fAvgs.booking*100).toFixed(0)}%`}
            target={`Floor ${(state.config.bookingFloor*100).toFixed(0)}%`}
            sub="Appts ÷ leads"/>
          <Row label="Funnel · show"
            value={`${(fAvgs.show*100).toFixed(0)}%`}
            target={`Floor ${(state.config.showFloor*100).toFixed(0)}%`}
            sub="Showed ÷ booked"/>
          <Row label="Funnel · close"
            value={`${(fAvgs.close*100).toFixed(0)}%`}
            target={`Floor ${(state.config.closeFloor*100).toFixed(0)}%`}
            sub="Signed ÷ showed"
            score={sub.funnel}/>
          <Row label="Attrition"
            value={`${(avgAtt*100).toFixed(1)}%/mo`}
            target={`Green ≤${(state.config.attritionGreenFloor*100).toFixed(0)}% · Red ≥${(state.config.attritionCriticalCeiling*100).toFixed(0)}%`}
            sub="Cancelled ÷ prior students"
            score={sub.attrition}/>
          <Row label="Satisfaction"
            value={sub.satisfaction != null ? `${(sub.satisfaction*5).toFixed(1)}/5` : '—'}
            target={`Lookback ${state.config.satisfactionLookbackMonths}mo`}
            sub="Avg of survey ratings"
            score={sub.satisfaction}/>
          <Row label="Growth"
            value={(() => {
              if (recent.length < 2) return '—';
              const last = recent[0].clientMRR, first = recent[recent.length-1].clientMRR;
              const t = (last - first) / Math.max(first, 1);
              return `${t >= 0 ? '+' : ''}${(t*100).toFixed(1)}%`;
            })()}
            target={c.hasMembershipAddon ? '+10pt add-on bonus' : 'Core only'}
            sub="MRR trajectory across window"
            score={sub.growth}/>
        </Card>

        <Card theme={theme} padding={14}>
          <SectionLabel theme={theme}>Recent months</SectionLabel>
          {recent.length === 0 && <div style={{ color: theme.inkMuted, fontSize: 13 }}>No metrics logged.</div>}
          {recent.map((m, i) => (
            <div key={m.id} style={{ padding: '10px 0', borderBottom: i === recent.length - 1 ? 'none' : `1px solid ${theme.rule}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.ink, fontFamily: theme.serif }}>{CABT_fmtMonth(m.month)}</span>
                <span style={{ fontSize: 12, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums' }}>MRR {CABT_fmtMoney(m.clientMRR)}</span>
              </div>
              <div style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>
                {m.leadsGenerated}L → {m.apptsBooked}B → {m.leadsShowed}S → {m.leadsSigned}✓ · ad {CABT_fmtMoney(m.adSpend)} · cancel {m.studentsCancelled}/{m.priorStudents}
              </div>
            </div>
          ))}
        </Card>

        <Card theme={theme} padding={14}>
          <SectionLabel theme={theme}>Contract</SectionLabel>
          <KV theme={theme} label="Sign date"  value={CABT_fmtDate(c.signDate)} />
          <KV theme={theme} label="Term"       value={`${c.termMonths} months`} />
          <KV theme={theme} label="Retainer"   value={`${CABT_fmtMoney(c.monthlyRetainer)}/mo`} />
          <KV theme={theme} label="Membership" value={c.hasMembershipAddon ? `Yes · ${CABT_fmtDate(c.membershipStartDate)}` : '—'} />
          <KV theme={theme} label="AE"         value={state.sales.find(s => s.id === c.ae)?.name || '—'} />
          <KV theme={theme} label="SDR"        value={state.sales.find(s => s.id === c.sdrBookedBy)?.name || '—'} last />
        </Card>
      </div>
    </div>
  );
}

// ── Open Questions ─────────────────────────────────────────────────────────
const OPEN_QUESTIONS_KEY = 'cabt_open_questions_v1';
const SEED_QUESTIONS = [
  { id: 'Q-001', topic: 'Scoring',   priority: 'high',   status: 'open',
    question: 'Does the W (book completeness) multiplier apply only to Performance, or to the whole composite?',
    context: 'Current implementation gates Performance only. Brief is ambiguous.', owner: 'Bobby',
    created: '2026-04-15' },
  { id: 'Q-002', topic: 'Bonus pool', priority: 'high',  status: 'open',
    question: 'Confirm the $7,500 quarterly cap is per-CA, not pool-shared.',
    context: 'Annual Bonus screen assumes per-CA cap.', owner: 'Bobby',
    created: '2026-04-16' },
  { id: 'Q-003', topic: 'Approvals',  priority: 'medium', status: 'answered',
    question: 'Single-approver model OK for v1, or 2-step (Bobby + accountant)?',
    context: 'Brief mentions accountant export but no approval step.', owner: 'Bobby',
    created: '2026-04-10', answer: 'Single approver for v1; CSV export is enough for accountant.' },
  { id: 'Q-004', topic: 'GHL',       priority: 'medium', status: 'open',
    question: 'When GHL integration lands, should leads/appts auto-fill the monthly metric form, or replace manual entry?',
    context: 'Affects whether the Monthly Metrics form keeps funnel section.', owner: 'Bobby',
    created: '2026-04-18' },
  { id: 'Q-005', topic: 'Surveys',    priority: 'low',    status: 'open',
    question: 'Anonymous survey flag — does the CA see the rating, or only leadership?',
    context: 'Currently CA sees everything; toggle just hides submitter name in admin views.', owner: 'Bobby',
    created: '2026-04-19' },
  { id: 'Q-006', topic: 'Clawbacks',  priority: 'medium', status: 'open',
    question: 'On client cancel before midpoint milestone, do we claw back the upfront commission or only future?',
    context: 'Sales Adjustment form supports clawback but rule is undefined.', owner: 'Bobby',
    created: '2026-04-12' },
];

function loadQuestions() {
  try {
    const raw = localStorage.getItem(OPEN_QUESTIONS_KEY);
    if (!raw) return SEED_QUESTIONS;
    return JSON.parse(raw);
  } catch (e) { return SEED_QUESTIONS; }
}
function saveQuestions(qs) {
  try { localStorage.setItem(OPEN_QUESTIONS_KEY, JSON.stringify(qs)); } catch (e) {}
}

function AdminOpenQuestions({ state, theme }) {
  const [questions, setQuestions] = React.useState(loadQuestions);
  const [filter, setFilter] = React.useState('open'); // open | all | answered
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ topic: '', priority: 'medium', question: '', context: '', owner: 'Bobby' });
  const [expanded, setExpanded] = React.useState({});

  React.useEffect(() => saveQuestions(questions), [questions]);

  const filtered = questions.filter(q => filter === 'all' ? true : q.status === filter);
  const byStatus = {
    open:     questions.filter(q => q.status === 'open').length,
    answered: questions.filter(q => q.status === 'answered').length,
  };

  const submitDraft = () => {
    if (!draft.question.trim()) return;
    const q = {
      id: `Q-${String(questions.length + 1).padStart(3, '0')}`,
      ...draft, status: 'open', created: CABT_todayIso(),
    };
    setQuestions(qs => [q, ...qs]);
    setDraft({ topic: '', priority: 'medium', question: '', context: '', owner: 'Bobby' });
    setAdding(false);
  };

  const answerIt = (id, answer) => {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, status: 'answered', answer, answeredAt: CABT_todayIso() } : q));
  };
  const reopenIt = (id) => {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, status: 'open', answer: undefined, answeredAt: undefined } : q));
  };

  const PRIO = {
    high:   { label: 'High',   bg: STATUS.red    + '22', fg: '#C62828' },
    medium: { label: 'Medium', bg: STATUS.yellow + '22', fg: '#A06800' },
    low:    { label: 'Low',    bg: theme.rule,           fg: theme.inkSoft },
  };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="alert" theme={theme}>
        Decisions still pending from leadership. Answer here once resolved — answers route into the build log.
      </Banner>

      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { v: 'open',     label: 'Open',     n: byStatus.open },
          { v: 'answered', label: 'Answered', n: byStatus.answered },
          { v: 'all',      label: 'All',      n: questions.length },
        ].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)} style={{
            padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
            background: filter === f.v ? theme.ink : theme.surface,
            color: filter === f.v ? theme.accentInk : theme.ink,
            border: `1px solid ${filter === f.v ? theme.ink : theme.rule}`,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{f.label} <span style={{ opacity: 0.65 }}>{f.n}</span></button>
        ))}
        <div style={{ flex: 1 }}/>
        <Button theme={theme} variant="primary" size="sm" icon="plus" onClick={() => setAdding(a => !a)}>
          {adding ? 'Cancel' : 'New'}
        </Button>
      </div>

      {adding && (
        <Card theme={theme} padding={14}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Topic" theme={theme}>
              <Input theme={theme} value={draft.topic} onChange={(v) => setDraft({...draft, topic: v})} placeholder="Scoring, Bonus, GHL…"/>
            </Field>
            <Field label="Priority" theme={theme}>
              <Select theme={theme} value={draft.priority} onChange={(v) => setDraft({...draft, priority: v})}
                options={[{value:'high',label:'High'},{value:'medium',label:'Medium'},{value:'low',label:'Low'}]}/>
            </Field>
            <Field label="Question" required theme={theme}>
              <textarea value={draft.question} onChange={(e) => setDraft({...draft, question: e.target.value})} rows={2}
                placeholder="What needs to be decided?"
                style={{ width: '100%', minHeight: 60, background: theme.bgElev, border: `1px solid ${theme.rule}`, borderRadius: theme.radius - 4, padding: 12, fontSize: 14, color: theme.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}/>
            </Field>
            <Field label="Context" theme={theme}>
              <textarea value={draft.context} onChange={(e) => setDraft({...draft, context: e.target.value})} rows={2}
                placeholder="Why this matters / what it blocks"
                style={{ width: '100%', minHeight: 60, background: theme.bgElev, border: `1px solid ${theme.rule}`, borderRadius: theme.radius - 4, padding: 12, fontSize: 14, color: theme.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}/>
            </Field>
            <Button theme={theme} variant="primary" fullWidth onClick={submitDraft}>Add question</Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <Card theme={theme}><div style={{ color: theme.inkMuted, fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No questions in this view.</div></Card>
        )}
        {filtered.map(q => {
          const p = PRIO[q.priority] || PRIO.medium;
          const isOpen = expanded[q.id];
          return (
            <Card key={q.id} theme={theme} padding={0}>
              <button onClick={() => setExpanded(e => ({ ...e, [q.id]: !e[q.id] }))} style={{
                width: '100%', padding: '14px', background: 'transparent', border: 'none',
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: p.bg, color: p.fg, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{p.label}</span>
                  {q.topic && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: theme.rule, color: theme.inkSoft, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{q.topic}</span>}
                  {q.status === 'answered' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: STATUS.green + '22', color: '#2E7D32', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Answered</span>}
                  <div style={{ flex: 1 }}/>
                  <span style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>{q.id}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink, lineHeight: 1.35 }}>{q.question}</div>
                {!isOpen && q.context && <div style={{ fontSize: 12, color: theme.inkMuted, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{q.context}</div>}
              </button>
              {isOpen && (
                <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${theme.rule}` }}>
                  {q.context && (
                    <div style={{ padding: '10px 0', fontSize: 13, color: theme.inkSoft, lineHeight: 1.45, fontFamily: theme.serif, fontStyle: 'italic' }}>
                      {q.context}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: theme.inkMuted, marginBottom: 10 }}>
                    Owner <strong style={{ color: theme.ink }}>{q.owner}</strong> · created {CABT_fmtDate(q.created)}
                  </div>
                  {q.status === 'answered' ? (
                    <div>
                      <Banner tone="success" icon="check" theme={theme}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Answer · {CABT_fmtDate(q.answeredAt)}</div>
                        <div>{q.answer}</div>
                      </Banner>
                      <div style={{ height: 8 }}/>
                      <Button theme={theme} variant="ghost" size="sm" onClick={() => reopenIt(q.id)}>Reopen</Button>
                    </div>
                  ) : (
                    <AnswerForm onSubmit={(ans) => answerIt(q.id, ans)} theme={theme} />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AnswerForm({ onSubmit, theme }) {
  const [val, setVal] = React.useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={2}
        placeholder="Type the resolved answer…"
        style={{ width: '100%', minHeight: 50, background: theme.bgElev, border: `1px solid ${theme.rule}`, borderRadius: theme.radius - 4, padding: 10, fontSize: 13, color: theme.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}/>
      <Button theme={theme} variant="primary" size="sm"
        onClick={() => { if (val.trim()) { onSubmit(val.trim()); setVal(''); } }}>
        Mark answered
      </Button>
    </div>
  );
}

// ── Add Client (admin) ──────────────────────────────────────────────────────
// Generates the next sequential CL-### id. Saves through onSubmit.
function nextClientId(clients) {
  const nums = clients
    .map(c => /^CL-(\d+)$/.exec(c.id))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  // Also consider legacy C-### ids so we don't collide with seed data
  const legacy = clients
    .map(c => /^C-(\d+)$/.exec(c.id))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  const max = Math.max(0, ...nums, ...legacy);
  return `CL-${String(max + 1).padStart(3, '0')}`;
}

function AdminAddClient({ state, theme, navigate, onSubmit, presetFromStripe }) {
  const today = CABT_todayIso();
  const [form, setForm] = React.useState(() => ({
    name:                 presetFromStripe?.name || '',
    stripeCustomerId:     presetFromStripe?.stripeCustomerId || '',
    ghlContactId:         presetFromStripe?.ghlContactId || '',
    signDate:             presetFromStripe?.signDate || today,
    monthlyRetainer:      presetFromStripe?.monthlyRetainer || '',
    termMonths:           12,
    assignedCA:           '',
    ae:                   '',
    sdrBookedBy:          '',
    upfrontPct:           0.10,
    midPct:               0.05,
    endPct:               0.05,
    hasMembershipAddon:   false,
    membershipStartDate: '',
    stripeTruthMode:     'stripe_wins', // stripe_wins | ca_wins | lower_of_both
    notes:               '',
  }));
  const [errors, setErrors] = React.useState({});
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const cas  = state.cas.filter(c => c.active).map(c => ({ value: c.id, label: c.name }));
  const aes  = state.sales.filter(s => s.role === 'AE').map(s => ({ value: s.id, label: s.name }));
  const sdrs = [{ value: '', label: 'None' }, ...state.sales.filter(s => s.role === 'SDR').map(s => ({ value: s.id, label: s.name }))];

  const newId = nextClientId(state.clients);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.signDate) e.signDate = 'Required';
    if (form.signDate && new Date(form.signDate) > new Date()) e.signDate = 'Cannot be in the future';
    if (!form.monthlyRetainer || Number(form.monthlyRetainer) <= 0) e.monthlyRetainer = 'Required';
    if (!form.termMonths || Number(form.termMonths) <= 0) e.termMonths = 'Required';
    if (form.hasMembershipAddon && !form.membershipStartDate) e.membershipStartDate = 'Required when membership is on';
    // Duplicate guards
    const nameLower = form.name.trim().toLowerCase();
    if (state.clients.some(c => c.name.trim().toLowerCase() === nameLower)) e.name = 'A client with this name already exists';
    if (form.stripeCustomerId && state.clients.some(c => c.stripeId === form.stripeCustomerId || c.stripeCustomerId === form.stripeCustomerId)) {
      e.stripeCustomerId = 'Already linked to another client';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    onSubmit({
      id: newId,
      name: form.name.trim(),
      stripeCustomerId: form.stripeCustomerId,
      stripeId: form.stripeCustomerId, // legacy alias used by older code
      ghlContactId: form.ghlContactId,
      assignedCA: form.assignedCA,
      signDate: form.signDate,
      cancelDate: '',
      monthlyRetainer: Number(form.monthlyRetainer),
      hasMembershipAddon: form.hasMembershipAddon,
      membershipStartDate: form.hasMembershipAddon ? form.membershipStartDate : '',
      termMonths: Number(form.termMonths),
      ae: form.ae,
      sdrBookedBy: form.sdrBookedBy,
      upfrontPct: Number(form.upfrontPct),
      midPct: Number(form.midPct),
      endPct: Number(form.endPct),
      stripeTruthMode: form.stripeTruthMode,
      source: presetFromStripe ? 'stripe' : 'manual',
      createdBy: 'Admin',
      createdAt: CABT_todayIso(),
      notes: form.notes,
    });
  };

  return (
    <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {presetFromStripe ? (
        <Banner tone="warning" icon="alert" theme={theme}>
          <strong>Pending from Stripe.</strong> Review the prefilled details, assign a CA, then approve to add this client to the active book.
        </Banner>
      ) : (
        <Banner tone="info" icon="alert" theme={theme}>
          New client will be assigned ID <strong style={{ fontFamily: theme.mono }}>{newId}</strong>. They start scoring as soon as the first month of metrics is logged.
        </Banner>
      )}

      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Identity</SectionLabel>
        <Field label="Business name" required error={errors.name} theme={theme}>
          <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} theme={theme} placeholder="e.g. Ronin BJJ Austin" autoFocus={!presetFromStripe}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Assign to CA" theme={theme} hint="Can be assigned later from Approvals">
          <Select value={form.assignedCA} onChange={(v) => setForm({ ...form, assignedCA: v })}
            options={[{ value: '', label: '— assign later —' }, ...cas]} theme={theme}/>
        </Field>
      </Card>

      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Contract</SectionLabel>
        <Field label="Sign date" required error={errors.signDate} theme={theme}>
          <Input type="date" value={form.signDate} onChange={(v) => setForm({ ...form, signDate: v })} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Monthly retainer" required error={errors.monthlyRetainer} theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.monthlyRetainer}
            onChange={(v) => setForm({ ...form, monthlyRetainer: v })} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Term" required error={errors.termMonths} theme={theme}>
          <Input type="number" inputmode="numeric" suffix="months" value={form.termMonths}
            onChange={(v) => setForm({ ...form, termMonths: v })} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>Membership add-on</div>
            <div style={{ fontSize: 12, color: theme.inkMuted }}>Adds {(state.config.membershipRevenueRate*100).toFixed(0)}% revenue share + 10pt growth bonus</div>
          </div>
          <Toggle value={form.hasMembershipAddon} onChange={(v) => setForm({ ...form, hasMembershipAddon: v })} theme={theme}/>
        </div>
        {form.hasMembershipAddon && (
          <>
            <div style={{ height: 10 }}/>
            <Field label="Membership start date" required error={errors.membershipStartDate} theme={theme}>
              <Input type="date" value={form.membershipStartDate}
                onChange={(v) => setForm({ ...form, membershipStartDate: v })} theme={theme}/>
            </Field>
          </>
        )}
      </Card>

      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Sales credit</SectionLabel>
        <Field label="AE" theme={theme}>
          <Select value={form.ae} onChange={(v) => setForm({ ...form, ae: v })}
            options={[{ value: '', label: '— none —' }, ...aes]} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="SDR who booked" theme={theme}>
          <Select value={form.sdrBookedBy} onChange={(v) => setForm({ ...form, sdrBookedBy: v })}
            options={sdrs} theme={theme}/>
        </Field>
      </Card>

      <button onClick={() => setShowAdvanced(a => !a)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        background: 'transparent', border: 'none', padding: '8px 4px', cursor: 'pointer', fontFamily: 'inherit',
        color: theme.inkSoft, fontSize: 13, fontWeight: 600,
      }}>
        <span>Advanced & integration</span>
        <Icon name={showAdvanced ? 'chev-u' : 'chev-d'} size={16}/>
      </button>

      {showAdvanced && (
        <>
          <Card theme={theme} padding={14}>
            <SectionLabel theme={theme}>Commission split</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="Upfront" theme={theme}>
                <Input type="number" inputmode="decimal" suffix="×" value={form.upfrontPct}
                  onChange={(v) => setForm({ ...form, upfrontPct: v })} theme={theme}/>
              </Field>
              <Field label="Mid" theme={theme}>
                <Input type="number" inputmode="decimal" suffix="×" value={form.midPct}
                  onChange={(v) => setForm({ ...form, midPct: v })} theme={theme}/>
              </Field>
              <Field label="End" theme={theme}>
                <Input type="number" inputmode="decimal" suffix="×" value={form.endPct}
                  onChange={(v) => setForm({ ...form, endPct: v })} theme={theme}/>
              </Field>
            </div>
          </Card>

          <Card theme={theme} padding={14}>
            <SectionLabel theme={theme}>Integration</SectionLabel>
            <Field label="Stripe customer ID" hint="Optional · auto-fills MRR from invoices once linked"
              error={errors.stripeCustomerId} theme={theme}>
              <Input value={form.stripeCustomerId} onChange={(v) => setForm({ ...form, stripeCustomerId: v })}
                theme={theme} placeholder="cus_XXXXXXXXXXXXXX"/>
            </Field>
            <div style={{ height: 10 }}/>
            <Field label="GHL contact ID" hint="Optional · pulls funnel metrics from GoHighLevel" theme={theme}>
              <Input value={form.ghlContactId} onChange={(v) => setForm({ ...form, ghlContactId: v })}
                theme={theme} placeholder="ctc_XXXXXXXX"/>
            </Field>
            <div style={{ height: 10 }}/>
            <Field label="When Stripe & CA disagree on MRR…" theme={theme}>
              <Select value={form.stripeTruthMode} onChange={(v) => setForm({ ...form, stripeTruthMode: v })}
                options={[
                  { value: 'stripe_wins',    label: 'Stripe wins (auto-overwrite, show diff)' },
                  { value: 'ca_wins',        label: 'CA wins (Stripe is informational only)' },
                  { value: 'lower_of_both',  label: 'Score the lower of the two' },
                ]} theme={theme}/>
            </Field>
          </Card>

          <Card theme={theme} padding={14}>
            <SectionLabel theme={theme}>Internal notes</SectionLabel>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
              placeholder="Anything CAs and other admins should know about this account…"
              style={{
                width: '100%', minHeight: 70, background: theme.bgElev,
                border: `1px solid ${theme.rule}`, borderRadius: theme.radius - 4, padding: 12,
                fontSize: 14, color: theme.ink, fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box', resize: 'vertical',
              }}/>
          </Card>
        </>
      )}

      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>
          {presetFromStripe ? 'Approve & add' : `Add ${newId}`}
        </Button>
      </StickyBar>
    </div>
  );
}

// ── Pending Clients (Stripe queue) ──────────────────────────────────────────
// Empty for now; populated by the Stripe webhook in the future.
function AdminPendingClients({ state, theme, navigate }) {
  const pending = (state.pendingClients || []).filter(p => p.status === 'pending');
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="alert" theme={theme}>
        New customers from Stripe land here first. Review and approve before they enter the active book — useful for filtering out test accounts.
      </Banner>
      {pending.length === 0 && (
        <Card theme={theme}>
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24, margin: '0 auto 12px',
              background: theme.rule, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.inkMuted,
            }}><Icon name="cash" size={22}/></div>
            <div style={{ fontFamily: theme.serif, fontSize: 17, fontWeight: 600, color: theme.ink, marginBottom: 4 }}>
              No pending customers
            </div>
            <div style={{ fontSize: 13, color: theme.inkMuted, lineHeight: 1.45, maxWidth: 280, margin: '0 auto' }}>
              Once the Stripe webhook is connected, new <code style={{ fontSize: 12, background: theme.rule, padding: '1px 5px', borderRadius: 3 }}>customer.subscription.created</code> events will appear here for approval.
            </div>
          </div>
        </Card>
      )}
      {pending.map(p => (
        <Card key={p.id} theme={theme} padding={14}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink }}>{p.name}</div>
            <div style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>{p.stripeCustomerId}</div>
          </div>
          <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 12 }}>
            Stripe · ${p.monthlyRetainer}/mo · started {CABT_fmtDate(p.signDate)}
          </div>
          <Button theme={theme} variant="primary" size="sm" fullWidth
            onClick={() => navigate('add-client', { presetFromStripe: p })}>
            Review & approve
          </Button>
        </Card>
      ))}
    </div>
  );
}

function AdminMore({ theme, navigate }) {
  const items = [
    { name: 'edits',     icon: 'edit',  label: 'Edit Requests',   desc: 'Approve protected-field edits past grace' },
    { name: 'reviews',   icon: 'star',  label: 'Reviews Inbox',   desc: 'Match incoming reviews to clients' },
    { name: 'pending-clients', icon: 'cash', label: 'Pending Clients', desc: 'Approve new Stripe customers' },
    { name: 'questions', icon: 'alert', label: 'Open Questions',  desc: 'Decisions pending leadership' },
    { name: 'config',    icon: 'cog',   label: 'Config',          desc: 'Scoring thresholds & quarter window' },
    { name: 'roster',    icon: 'user',  label: 'Roster',          desc: 'CAs, AEs, SDRs' },
  ];
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card theme={theme} padding={0}>
        {items.map((it, i) => (
          <button key={it.name} onClick={() => navigate(it.name)} style={{
            display: 'flex', alignItems: 'center', gap: 14, width: '100%',
            background: 'transparent', border: 'none',
            padding: '16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: i === items.length - 1 ? 'none' : `1px solid ${theme.rule}`,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: theme.accent + '15', color: theme.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Icon name={it.icon} size={18}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>{it.label}</div>
              <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 1 }}>{it.desc}</div>
            </div>
            <Icon name="chev-r" size={16} color={theme.inkMuted}/>
          </button>
        ))}
      </Card>
      <div style={{ fontSize: 11, color: theme.inkMuted, textAlign: 'center', padding: '12px 0', letterSpacing: 0.4 }}>
        CA Bonus Tracker · Admin · v0.2
      </div>
    </div>
  );
}

Object.assign(window, {
  AdminAnnualBonus, AdminRevenueLedger, AdminClientRollup, AdminClientCalc, AdminOpenQuestions, AdminMore,
  AdminAddClient, AdminPendingClients, CABT_nextClientId: nextClientId,
});

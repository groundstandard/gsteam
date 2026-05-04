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

// Classify a quarter against "today" so the bonus surface never shows numeric
// payouts for quarters that haven't happened yet (TICKET-1, 2026-04-30 brief).
function quarterStatus(qStart, qEnd, today = new Date()) {
  const start = new Date(qStart + 'T00:00:00');
  const end = new Date(qEnd + 'T23:59:59');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'current';
  if (today < start) return 'future';
  if (today > end) return 'past';
  return 'current';
}

// Per-quarter composite for a CA. Calls the real scoring engine for the
// quarter window and uses the MRR-weighted pot from quarter_inputs.
// 2026-05-04: removed the demo "wobble" that varied composites by ±8pts
// and the hardcoded $7,500 payout cap. Numbers now reflect reality.
function caQuarterComposite(ca, state, qStart, qEnd, status) {
  if (status === 'future') return { composite: null, payout: null, status };
  const qConfig = { ...state.config, quarterStart: qStart, quarterEnd: qEnd };
  const score = CABT_caScorecard(ca, { ...state, config: qConfig });
  return {
    composite: score.composite || 0,
    payout: score.finalPayout || 0,
    status,
  };
}

// Per-quarter pot inputs (agency_gross_last_month + pot_pct). Owner enters
// these at quarter close so the bonus pot reflects real revenue, not a
// hardcoded cap. Module-scope for stable input focus.
function QuarterInputsCard({ theme, state, qs }) {
  const currentQ = qs.find(q => q.status === 'current') || qs[0];
  const allQI = state.allQuarterInputs || [];
  const existing = allQI.find(q => q.quarterStart === currentQ.start);
  const [editing, setEditing] = React.useState(false);
  const [agencyGross, setAgencyGross] = React.useState(existing ? String(existing.agencyGrossLastMonth) : '');
  const [potPct, setPotPct] = React.useState(existing ? String(existing.potPct) : '0.005');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    setAgencyGross(existing ? String(existing.agencyGrossLastMonth) : '');
    setPotPct(existing ? String(existing.potPct) : '0.005');
  }, [currentQ.start, existing && existing.agencyGrossLastMonth, existing && existing.potPct]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const sb = await CABT_sb();
      const { error } = await sb.from('quarter_inputs').upsert({
        quarter_start: currentQ.start,
        agency_gross_last_month: Number(agencyGross) || 0,
        pot_pct: Number(potPct) || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'quarter_start' });
      if (error) throw error;
      setEditing(false);
    } catch (e) {
      setErr(e?.message || 'Save failed');
    }
    setBusy(false);
  };

  const totalPot = (Number(agencyGross) || 0) * (Number(potPct) || 0);

  return (
    <Card theme={theme} padding={14}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <SectionLabel theme={theme}>Quarter inputs · {currentQ.label}</SectionLabel>
          {!editing && (
            <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2 }}>
              {existing
                ? <>Total pot: <strong style={{ color: theme.ink }}>{CABT_fmtMoney(totalPot)}</strong> ({CABT_fmtMoney(Number(agencyGross))} × {(Number(potPct)*100).toFixed(2)}%)</>
                : <span style={{ color: '#dc3c3c' }}>Not set yet — payouts display $0 until you set this.</span>}
            </div>
          )}
        </div>
        {!editing && (
          <Button theme={theme} variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {existing ? 'Edit' : 'Set'}
          </Button>
        )}
      </div>
      {editing && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Agency gross — last month of previous quarter" hint="Total agency gross revenue from the last month of the quarter before this one." theme={theme}>
            <Input type="number" inputmode="decimal" prefix="$" value={agencyGross} onChange={setAgencyGross} placeholder="e.g. 100000" theme={theme}/>
          </Field>
          <Field label="Pot percentage" hint="Fraction of agency gross that becomes the bonus pot. 0.005 = 0.5%." theme={theme}>
            <Input type="number" inputmode="decimal" value={potPct} onChange={setPotPct} placeholder="0.005" theme={theme}/>
          </Field>
          <div style={{ fontSize: 12, color: theme.inkMuted }}>
            Total pot preview: <strong style={{ color: theme.ink }}>{CABT_fmtMoney(totalPot)}</strong>
          </div>
          {err && <div style={{ color: '#dc3c3c', fontSize: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button theme={theme} variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
            <Button theme={theme} variant="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Annual Bonus ───────────────────────────────────────────────────────────
function AdminAnnualBonus({ state, theme }) {
  const today = new Date();
  // Config from Supabase may be empty {} or use snake_case keys; fall back to today's year.
  const cfgYear = new Date(state.config?.quarterStart || state.config?.quarter_start || '').getFullYear();
  const year = Number.isFinite(cfgYear) ? cfgYear : today.getFullYear();
  const qs = quartersOfYear(year).map(q => ({ ...q, status: quarterStatus(q.start, q.end, today) }));

  // Viewport-aware layout: desktop = table, mobile = card grid.
  const [vw, setVw] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  const isDesktop = vw >= 900;
  const cas = state.cas.filter(c => c.active);

  const rows = cas.map(ca => {
    const qScores = qs.map(q => caQuarterComposite(ca, state, q.start, q.end, q.status));
    const realized = qScores.filter(q => q.payout !== null);
    const annualPayout = realized.reduce((s, q) => s + q.payout, 0);
    const avgComposite = realized.length
      ? realized.reduce((s, q) => s + q.composite, 0) / realized.length
      : 0;
    return { ca, qScores, annualPayout, avgComposite };
  });

  const totalAnnual = rows.reduce((s, r) => s + r.annualPayout, 0);
  const avgComposite = rows.reduce((s, r) => s + r.avgComposite, 0) / Math.max(rows.length, 1);
  const hasFuture = qs.some(q => q.status === 'future');

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
          {hasFuture && <span style={{ marginLeft: 8, color: theme.inkMuted }}>· future quarters excluded until they begin</span>}
        </div>
      </Card>

      <QuarterInputsCard theme={theme} state={state} qs={qs} />


      {isDesktop ? (
        // ── Desktop: table layout (Bobby's preference) ───────────────────
        <Card theme={theme} padding={0}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr) 1.1fr', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${theme.rule}`, fontSize: 10, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            <div>CA</div>
            {qs.map(q => (
              <div key={q.key} style={{ textAlign: 'center', color: q.status === 'current' ? theme.ink : theme.inkMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>{q.label.split(' ')[0]}</span>
                {q.status === 'current' && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: theme.bg || '#0B0E14', background: theme.accent || '#D7FF3D', padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 }}>LIVE</span>
                )}
              </div>
            ))}
            <div style={{ textAlign: 'right' }}>FY total</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.ca.id} style={{
              display: 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr) 1.1fr',
              alignItems: 'center', padding: '14px 16px',
              borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${theme.rule}`,
              fontSize: 13, minHeight: 60,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ca.name}</div>
                <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 2 }}>{r.ca.id}</div>
              </div>
              {r.qScores.map((q, qi) => {
                if (q.status === 'future') {
                  return (
                    <div key={qi} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }} title="Not yet available — quarter has not started">
                      <div style={{ fontSize: 18, fontWeight: 500, color: theme.inkMuted, lineHeight: 1, opacity: 0.4 }}>—</div>
                    </div>
                  );
                }
                const s = CABT_scoreToStatus(q.composite);
                const isCurrent = q.status === 'current';
                return (
                  <div key={qi} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }} title={isCurrent ? 'Pace-to-date — quarter still in progress' : undefined}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: STATUS[s], fontVariantNumeric: 'tabular-nums', lineHeight: 1, fontStyle: isCurrent ? 'italic' : 'normal' }}>
                      {(q.composite*100).toFixed(0)}
                    </div>
                    <div style={{ fontSize: 10, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums', fontStyle: isCurrent ? 'italic' : 'normal', whiteSpace: 'nowrap' }}>
                      {CABT_fmtMoney(q.payout)}{isCurrent ? ' pace' : ''}
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
      ) : (
        // ── Mobile: per-CA card layout ───────────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {rows.map(r => (
            <Card key={r.ca.id} theme={theme} padding={16}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, color: theme.ink, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ca.name}</div>
                  <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.3, marginTop: 2 }}>{r.ca.id}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: theme.inkMuted, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>FY total</div>
                  <div style={{ fontFamily: theme.serif, fontSize: 22, fontWeight: 600, color: theme.ink, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4, lineHeight: 1, marginTop: 2 }}>
                    {CABT_fmtMoney(r.annualPayout)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {r.qScores.map((q, qi) => {
                  const qLabel = qs[qi].label.split(' ')[0];
                  if (q.status === 'future') {
                    return (
                      <div key={qi} style={{
                        borderRadius: 8, padding: '10px 4px', textAlign: 'center',
                        background: theme.bgSoft || 'rgba(255,255,255,0.03)',
                        border: `1px dashed ${theme.rule}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 64,
                      }} title="Not yet available — quarter has not started">
                        <div style={{ fontSize: 9, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5 }}>{qLabel}</div>
                        <div style={{ fontSize: 18, color: theme.inkMuted, opacity: 0.4, lineHeight: 1 }}>—</div>
                      </div>
                    );
                  }
                  const s = CABT_scoreToStatus(q.composite);
                  const isCurrent = q.status === 'current';
                  return (
                    <div key={qi} style={{
                      borderRadius: 8, padding: '10px 4px', textAlign: 'center',
                      background: isCurrent ? (theme.accentSoft || 'rgba(215,255,61,0.08)') : (theme.bgSoft || 'rgba(255,255,255,0.03)'),
                      border: isCurrent ? `1px solid ${theme.accent || '#D7FF3D'}` : `1px solid ${theme.rule}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 64,
                    }} title={isCurrent ? 'Pace-to-date — quarter still in progress' : undefined}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5 }}>{qLabel}</span>
                        {isCurrent && (
                          <span style={{ fontSize: 7, fontWeight: 800, color: theme.bg || '#0B0E14', background: theme.accent || '#D7FF3D', padding: '1px 4px', borderRadius: 2, letterSpacing: 0.5 }}>LIVE</span>
                        )}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: STATUS[s], fontVariantNumeric: 'tabular-nums', lineHeight: 1, fontStyle: isCurrent ? 'italic' : 'normal' }}>
                        {(q.composite*100).toFixed(0)}
                      </div>
                      <div style={{ fontSize: 9, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums', fontStyle: isCurrent ? 'italic' : 'normal', lineHeight: 1 }}>
                        {CABT_fmtMoney(q.payout)}{isCurrent ? ' pace' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: theme.inkMuted, padding: '0 4px', lineHeight: 1.5 }}>
        Quarterly payout = (CA's eligible-MRR ÷ all eligible-MRR) × Total Pot × Composite. Total Pot = previous quarter's last month agency gross × pot %, set in Admin → Quarter Inputs. Past quarters show actual; current quarter shows pace-to-date (italic); future quarters render "—" until they begin.
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
// Per-contract commission rate editor (Bobby 2026-05-01 — Item 4).
// Module-scope so parent re-renders don't remount it (otherwise inputs lose
// focus mid-typing — same SectionCard pitfall we fixed in TICKET-3 polish).
function RatesCard({ theme, clientId, initial, rep, onSave }) {
  const [up, setUp] = React.useState(initial.upfrontPct);
  const [mid, setMid] = React.useState(initial.midPct);
  const [end, setEnd] = React.useState(initial.endPct);
  const [busy, setBusy] = React.useState(false);
  // Reset draft when admin navigates to a different client
  React.useEffect(() => {
    setUp(initial.upfrontPct); setMid(initial.midPct); setEnd(initial.endPct);
  }, [clientId]);

  const num = (v) => v === '' ? null : Number(v);
  const dirty = num(up) !== (initial.upfrontPct === '' ? null : Number(initial.upfrontPct))
             || num(mid) !== (initial.midPct === '' ? null : Number(initial.midPct))
             || num(end) !== (initial.endPct === '' ? null : Number(initial.endPct));

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    await onSave({ upfrontPct: num(up), midPct: num(mid), endPct: num(end) });
    setBusy(false);
  };

  return (
    <Card theme={theme} padding={14}>
      <SectionLabel theme={theme}>Commission rates</SectionLabel>
      <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 10, lineHeight: 1.4 }}>
        {rep
          ? <>Inherited from <strong style={{ color: theme.ink }}>{rep.name}</strong>'s defaults at contract creation. Override here for this client only.</>
          : <>No Account Manager assigned; rates apply only if an AM is later linked.</>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Field label="Upfront %" theme={theme}>
          <Input type="number" inputmode="decimal" value={up} onChange={setUp} placeholder="0.10" theme={theme}/>
        </Field>
        <Field label="Mid %" theme={theme}>
          <Input type="number" inputmode="decimal" value={mid} onChange={setMid} placeholder="0.05" theme={theme}/>
        </Field>
        <Field label="End %" theme={theme}>
          <Input type="number" inputmode="decimal" value={end} onChange={setEnd} placeholder="0.05" theme={theme}/>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button theme={theme} variant="primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save rates'}
        </Button>
        {dirty && (
          <Button theme={theme} variant="secondary" disabled={busy}
                  onClick={() => { setUp(initial.upfrontPct); setMid(initial.midPct); setEnd(initial.endPct); }}>
            Reset
          </Button>
        )}
      </div>
    </Card>
  );
}

function AdminClientCalc({ state, theme, clientId, navigate, onSetCadence, onSetRates }) {
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
  const avgAtt = recent.length ? recent.reduce((s, m) => s + (m.studentsCancelled / Math.max(m.totalStudentsStart, 1)), 0) / recent.length : 0;

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
        {onSetRates && (() => {
          // Per-contract commission rate override (Bobby 2026-05-01).
          // Inherits from the rep's defaults at contract creation; admin can tweak any time.
          const rep = state.sales.find(s => s.id === c.ae);
          const initial = {
            upfrontPct: c.upfrontPct != null ? String(c.upfrontPct) : '',
            midPct:     c.midPct     != null ? String(c.midPct)     : '',
            endPct:     c.endPct     != null ? String(c.endPct)     : '',
          };
          // Local draft state via stable key (clientId) so realtime updates
          // don't clobber an in-progress edit.
          return <RatesCard theme={theme} clientId={c.id} initial={initial} rep={rep}
                            onSave={(p) => onSetRates(c.id, p)} />;
        })()}

        {onSetRates && (() => {
          // Tier + cancel reason controls — bundled here because both
          // require the same onUpdateClient handler (we reuse onSetRates).
          const tier = c.tier || 'standard';
          const eligible = tier === 'standard' || tier === 'vip';
          const cancelReasons = state.cancelReasons || [];
          return (
            <Card theme={theme} padding={14}>
              <SectionLabel theme={theme}>Tier &amp; status</SectionLabel>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>Tier</div>
                <Select
                  value={tier}
                  onChange={(v) => onSetRates(c.id, { tier: v })}
                  options={[
                    { value: 'standard',   label: 'Standard — eligible' },
                    { value: 'vip',        label: 'VIP — eligible (+1 Growth point)' },
                    { value: 'reach',      label: 'Reach — excluded from scoring' },
                    { value: 'a_la_carte', label: 'À la carte — excluded from scoring' },
                  ]}
                  theme={theme}
                />
                <div style={{ fontSize: 11, color: eligible ? theme.inkMuted : '#dc3c3c', marginTop: 6, lineHeight: 1.4 }}>
                  {eligible
                    ? 'Counts toward CA bonus scoring (Performance, Retention, Growth).'
                    : 'Excluded from CA scoring — tracked for revenue only.'}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {c.cancelDate ? 'Cancellation' : 'Status'}
                  </div>
                  {c.cancelDate ? (
                    <button
                      onClick={() => onSetRates(c.id, { cancelDate: null, cancelReason: null })}
                      style={{
                        background: 'transparent', border: `1px solid ${theme.rule}`,
                        color: theme.ink, fontSize: 11, fontWeight: 600,
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      Reactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => onSetRates(c.id, { cancelDate: CABT_todayIso() })}
                      style={{
                        background: 'transparent', border: `1px solid #dc3c3c66`,
                        color: '#dc3c3c', fontSize: 11, fontWeight: 600,
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      Cancel client
                    </button>
                  )}
                </div>
                {c.cancelDate && (
                  <Select
                    value={c.cancelReason || ''}
                    onChange={(v) => onSetRates(c.id, { cancelReason: v || null })}
                    options={[
                      { value: '', label: '— pick a reason —' },
                      ...cancelReasons.map(r => ({
                        value: r.code,
                        label: `${r.label}${r.countsAgainstCa ? '' : ' (does not count against CA)'}`,
                      })),
                    ]}
                    theme={theme}
                  />
                )}
                <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 6, lineHeight: 1.4 }}>
                  {c.cancelDate
                    ? `Cancelled ${CABT_fmtDate(c.cancelDate)}. Reason flagged "does not count against CA" excludes it from retention math.`
                    : 'Tap "Cancel client" when the client ends their contract. You\'ll set today as the cancel date and pick a reason.'}
                </div>
              </div>
            </Card>
          );
        })()}

        {onSetCadence && (() => {
          const cadence = c.loggingCadence || 'monthly';
          const wc = (state.weeklyCheckins  || []).filter(w => w.clientId === c.id).sort((a,b) => b.weekStart.localeCompare(a.weekStart));
          const mc = (state.monthlyCheckins || []).filter(m => m.clientId === c.id).sort((a,b) => b.month.localeCompare(a.month));
          const latest = cadence === 'weekly' ? wc[0] : mc[0];
          return (
            <Card theme={theme} padding={14}>
              <SectionLabel theme={theme}>Logging cadence</SectionLabel>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {['monthly', 'weekly'].map(opt => {
                  const active = cadence === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => !active && onSetCadence(c.id, opt)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        background: active ? (theme.accentSoft || 'rgba(215,255,61,0.12)') : 'transparent',
                        border: `1.5px solid ${active ? (theme.accent || '#D7FF3D') : theme.rule}`,
                        color: theme.ink, fontWeight: active ? 700 : 500, fontSize: 13,
                        cursor: active ? 'default' : 'pointer', textAlign: 'center',
                        fontFamily: 'inherit', textTransform: 'capitalize',
                      }}>
                      {opt}
                      {active && <span style={{ marginLeft: 6, fontSize: 10, color: theme.inkMuted, fontWeight: 600 }}>· current</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
                Controls only how often the CA logs <strong>narrative check-ins</strong> (concern, win, account-side, agency-side actions). Numeric metrics shown below (MRR, ad spend, etc.) always come from monthly_metrics regardless.
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.rule}`, fontSize: 11, color: theme.inkMuted }}>
                {cadence === 'weekly'
                  ? `Weekly check-ins logged: ${wc.length}`
                  : `Monthly check-ins logged: ${mc.length}`}
                {latest && (
                  <span style={{ marginLeft: 8 }}>
                    · last: {cadence === 'weekly' ? `week of ${CABT_fmtDate(latest.weekStart)}` : CABT_fmtMonth(latest.month)}
                  </span>
                )}
                {!latest && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>· none yet</span>}
              </div>
            </Card>
          );
        })()}

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
                {m.leadsGenerated}L → {m.apptsBooked}B → {m.leadsShowed}S → {m.leadsSigned}✓ · ad {CABT_fmtMoney(m.adSpend)} · cancel {m.studentsCancelled}/{m.totalStudentsStart}
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
          <KV theme={theme} label="Account Manager"           value={state.sales.find(s => s.id === c.ae)?.name || '—'} />
          <KV theme={theme} label="Relationship Dev Rep"      value={state.sales.find(s => s.id === c.sdrBookedBy)?.name || '—'} last />
        </Card>
      </div>
    </div>
  );
}

// ── Open Questions ─────────────────────────────────────────────────────────
// Demo seed used ONLY in local mode (apiMode === 'local' / state._live false).
// In supabase mode, AdminOpenQuestions reads state.openQuestions from the
// real open_questions table and writes via Supabase.
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

function AdminOpenQuestions({ state, theme }) {
  // Supabase mode reads from state.openQuestions (loaded by loadStateSupabase
  // and kept fresh by realtime). Local-only mode (no _live flag) falls back
  // to the SEED_QUESTIONS demo so the screen is reachable in dev.
  const isLive = !!state._live;
  const questions = isLive ? (state.openQuestions || []) : SEED_QUESTIONS;

  const [filter, setFilter] = React.useState('open'); // open | all | answered
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ topic: '', priority: 'medium', question: '', context: '', owner: 'Bobby' });
  const [expanded, setExpanded] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const filtered = questions.filter(q => filter === 'all' ? true : q.status === filter);
  const byStatus = {
    open:     questions.filter(q => q.status === 'open').length,
    answered: questions.filter(q => q.status === 'answered').length,
  };

  const submitDraft = async () => {
    if (!draft.question.trim() || busy) return;
    setBusy(true); setErr(null);
    const id = `Q-${String(questions.length + 1).padStart(3, '0')}`;
    try {
      if (isLive) {
        const sb = await CABT_sb();
        const { error } = await sb.from('open_questions').insert({
          id,
          topic: draft.topic || 'General',
          priority: draft.priority,
          status: 'open',
          question: draft.question,
          context: draft.context || null,
          owner: draft.owner || null,
          created_at: CABT_todayIso(),
        });
        if (error) throw error;
      }
      setDraft({ topic: '', priority: 'medium', question: '', context: '', owner: 'Bobby' });
      setAdding(false);
    } catch (e) { setErr(e?.message || 'Save failed'); }
    setBusy(false);
  };

  const answerIt = async (id, answer) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      if (isLive) {
        const sb = await CABT_sb();
        const { error } = await sb.from('open_questions').update({
          status: 'answered', answer, answered_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) throw error;
      }
    } catch (e) { setErr(e?.message || 'Save failed'); }
    setBusy(false);
  };
  const reopenIt = async (id) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      if (isLive) {
        const sb = await CABT_sb();
        const { error } = await sb.from('open_questions').update({
          status: 'open', answer: null, answered_at: null,
        }).eq('id', id);
        if (error) throw error;
      }
    } catch (e) { setErr(e?.message || 'Save failed'); }
    setBusy(false);
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
      {err && (
        <div style={{ background: STATUS.red + '15', color: STATUS.red, border: `1px solid ${STATUS.red}33`,
                     borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>{err}</div>
      )}

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
              <Textarea value={draft.question} onChange={(v) => setDraft({...draft, question: v})} rows={2}
                placeholder="What needs to be decided?" theme={theme}/>
            </Field>
            <Field label="Context" theme={theme}>
              <Textarea value={draft.context} onChange={(v) => setDraft({...draft, context: v})} rows={2}
                placeholder="Why this matters / what it blocks" theme={theme}/>
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
                    Owner <strong style={{ color: theme.ink }}>{q.owner}</strong> · created {CABT_fmtDate(q.createdAt || q.created)}
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
      <Textarea value={val} onChange={setVal} rows={2}
        placeholder="Type the resolved answer…" theme={theme}/>
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
    loggingCadence:      'monthly',     // weekly | monthly (TICKET-2)
    tier:                'standard',    // standard | vip | reach | a_la_carte (Phase 10)
    notes:               '',
  }));
  const [errors, setErrors] = React.useState({});
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const cas  = state.cas.filter(c => c.active).map(c => ({ value: c.id, label: c.name }));
  // Account Manager (legacy 'AE' kept for migration period)
  const aes  = state.sales.filter(s => s.role === 'AM' || s.role === 'AE')
                          .map(s => ({ value: s.id, label: s.name }));
  // Relationship Development Rep (legacy 'SDR' kept for migration period)
  const sdrs = [
    { value: '', label: 'None' },
    ...state.sales.filter(s => s.role === 'RDR' || s.role === 'SDR')
                  .map(s => ({ value: s.id, label: s.name })),
  ];

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

  const [busy, setBusy] = React.useState(false);
  const [rootErr, setRootErr] = React.useState(null);

  const submit = async () => {
    if (!validate() || busy) return;
    setBusy(true); setRootErr(null);

    // NOTE: keys are camelCase with single-cap-after-lowercase so api.jsx's
    // camelToSnake converts cleanly (e.g. assignedCa → assigned_ca, NOT
    // assignedCA → assigned_c_a). app-shell's local-mode submitClient mirrors
    // assignedCa back to assignedCA in state for legacy UI consumers.
    const row = {
      id: newId,
      name: form.name.trim(),
      stripeCustomerId: form.stripeCustomerId || null,
      ghlContactId:     form.ghlContactId || null,
      assignedCa:       form.assignedCA || null,    // canonical (camel→snake-safe)
      signDate:         form.signDate,
      cancelDate:       null,
      monthlyRetainer:  Number(form.monthlyRetainer),
      hasMembershipAddon: !!form.hasMembershipAddon,
      membershipStartDate: form.hasMembershipAddon ? form.membershipStartDate : null,
      termMonths:       Number(form.termMonths),
      ae:               form.ae || null,            // legacy column; UI = Account Manager
      sdrBookedBy:      form.sdrBookedBy || null,   // legacy column; UI = Relationship Dev Rep
      upfrontPct:       Number(form.upfrontPct),
      midPct:           Number(form.midPct),
      endPct:           Number(form.endPct),
      stripeTruthMode:  form.stripeTruthMode,
      loggingCadence:   form.loggingCadence,
      tier:             form.tier,
      notes:            form.notes,
    };

    try {
      let saved = row;
      if (CABT_getApiMode() === 'supabase') {
        // Insert the active client first
        saved = await CABT_api.submitClient(row);
        // If this came from the pending queue, mark the pending row as approved
        if (presetFromStripe && presetFromStripe.id) {
          const sb = await CABT_sb();
          const { data: { user } } = await sb.auth.getUser();
          await sb.from('pending_clients').update({
            status:      'approved',
            approved_as: saved.id || row.id,
            approved_at: new Date().toISOString(),
            approved_by: user?.id || null,
          }).eq('id', presetFromStripe.id);
        }
      }
      // Local-mode submitClient in app-shell already handles pending state mirror.
      onSubmit({ ...saved, source: presetFromStripe ? 'stripe' : 'manual' });
    } catch (e) {
      console.error('submitClient failed:', e);
      setRootErr(e?.message || 'Save failed');
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rootErr && <Banner tone="error" icon="alert" theme={theme}>{rootErr}</Banner>}
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
        <div style={{ height: 10 }}/>
        <Field label="Logging cadence" hint="How often does the CA log narrative check-ins? Monthly snapshots (MRR + students) stay monthly regardless." theme={theme}>
          <Select value={form.loggingCadence} onChange={(v) => setForm({ ...form, loggingCadence: v })}
            options={[
              { value: 'monthly', label: 'Monthly — one check-in per month' },
              { value: 'weekly',  label: 'Weekly — check-in every week' },
            ]} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Tier" hint="Bonus eligibility. Only Standard + VIP count toward CA scoring. Reach + à la carte are tracked but excluded." theme={theme}>
          <Select value={form.tier} onChange={(v) => setForm({ ...form, tier: v })}
            options={[
              { value: 'standard',   label: 'Standard — eligible' },
              { value: 'vip',        label: 'VIP — eligible (+1 Growth point)' },
              { value: 'reach',      label: 'Reach — excluded from scoring' },
              { value: 'a_la_carte', label: 'À la carte — excluded from scoring' },
            ]} theme={theme}/>
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
        <Field label="Account Manager" theme={theme}>
          <Select value={form.ae} onChange={(v) => setForm({ ...form, ae: v })}
            options={[{ value: '', label: '— none —' }, ...aes]} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Relationship Development Rep (booked by)" theme={theme}>
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
            <Textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={3}
              placeholder="Anything CAs and other admins should know about this account…" theme={theme}/>
          </Card>
        </>
      )}

      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : presetFromStripe ? 'Approve & add' : `Add ${newId}`}
        </Button>
      </StickyBar>
    </div>
  );
}

// ── Pending Clients (Stripe + manual queue) ────────────────────────────────
// Approve takes admin to AdminAddClient prefilled; Reject is one-click.
function AdminPendingClients({ state, theme, navigate }) {
  const [busy, setBusy] = React.useState(null);
  const [localStatus, setLocalStatus] = React.useState({}); // id -> 'rejected' for instant feedback
  const pending = (state.pendingClients || []).filter(p =>
    p.status === 'pending' && localStatus[p.id] !== 'rejected'
  );

  const reject = async (p) => {
    setBusy(p.id);
    try {
      if (CABT_getApiMode() === 'supabase') {
        const sb = await CABT_sb();
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from('pending_clients').update({
          status:       'rejected',
          rejected_at:  new Date().toISOString(),
          rejected_by:  user?.id || null,
        }).eq('id', p.id);
        if (error) throw error;
      }
      setLocalStatus(s => ({ ...s, [p.id]: 'rejected' }));
    } catch (e) {
      console.error('reject failed:', e);
      alert(e?.message || 'Reject failed');
    }
    setBusy(null);
  };

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
            {p.stripeCustomerId && (
              <div style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>{p.stripeCustomerId}</div>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 12 }}>
            {(p.source || 'stripe')} · {CABT_fmtMoney(p.monthlyRetainer)}/mo · started {CABT_fmtDate(p.signDate)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button theme={theme} variant="secondary" size="sm" disabled={busy === p.id}
                    onClick={() => reject(p)}>Reject</Button>
            <Button theme={theme} variant="primary" size="sm" fullWidth disabled={busy === p.id}
                    onClick={() => navigate('add-client', { presetFromStripe: p })}>
              Review &amp; approve
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Audit Log (F1.1.3) ─────────────────────────────────────────────────────
// Read-only chronological browser of audit_log rows. Filter chips for actor,
// table, action, and date range. Tap a row to expand the diff JSON.
const AUDIT_PAGE = 50;
const AUDIT_ACTIONS = ['insert', 'update', 'delete', 'approve', 'reject'];

function actionTone(a) {
  if (a === 'insert' || a === 'approve') return 'green';
  if (a === 'update') return 'blue';
  if (a === 'delete' || a === 'reject') return 'red';
  return 'gray';
}

function AdminAuditLog({ state, theme }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null); // row id
  const [filters, setFilters] = React.useState({ actorId: '', tableName: '', action: '', fromDate: '', toDate: '' });

  // Build actor + table option lists from data we already loaded for the app.
  const actors = React.useMemo(() => {
    const m = new Map();
    (state.cas || []).forEach(c => { if (c.userId) m.set(c.userId, c.name); });
    (state.sales || []).forEach(s => { if (s.userId) m.set(s.userId, s.name); });
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [state]);

  const tables = ['profiles', 'cas', 'sales_team', 'clients', 'monthly_metrics',
    'growth_events', 'surveys', 'adjustments', 'edit_requests', 'config'];

  const load = React.useCallback(async (reset = true) => {
    const offset = reset ? 0 : rows.length;
    if (reset) { setLoading(true); setRows([]); setExpanded(null); }
    else setLoadingMore(true);
    setError(null);
    try {
      const res = await CABT_api.fetchAuditLog({ ...filters, limit: AUDIT_PAGE, offset });
      setRows(reset ? res.rows : [...rows, ...res.rows]);
      setHasMore(res.hasMore);
    } catch (e) {
      setError(e.message || 'load_failed');
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [filters, rows]);

  React.useEffect(() => { load(true); /* eslint-disable-next-line */ }, [filters]);

  const updateFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({ actorId: '', tableName: '', action: '', fromDate: '', toDate: '' });
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <Card theme={theme} padding={14}>
        <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>Audit Log</div>
        <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 4 }}>
          Read-only history of changes. {rows.length} {rows.length === 1 ? 'entry' : 'entries'}{hasMore ? '+' : ''} loaded.
        </div>
      </Card>

      {/* Filter chips */}
      <Card theme={theme} padding={12}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Select theme={theme} value={filters.actorId}
            onChange={(v) => updateFilter('actorId', v)}
            placeholder="All actors"
            options={[{ value: '', label: 'All actors' }, ...actors.map(a => ({ value: a.id, label: a.name }))]}/>
          <Select theme={theme} value={filters.tableName}
            onChange={(v) => updateFilter('tableName', v)}
            placeholder="All tables"
            options={[{ value: '', label: 'All tables' }, ...tables.map(t => ({ value: t, label: t }))]}/>
          <Select theme={theme} value={filters.action}
            onChange={(v) => updateFilter('action', v)}
            placeholder="All actions"
            options={[{ value: '', label: 'All actions' }, ...AUDIT_ACTIONS.map(a => ({ value: a, label: a }))]}/>
          <div style={{ display: 'flex', gap: 6 }}>
            <Input type="date" value={filters.fromDate}
              onChange={(v) => updateFilter('fromDate', v)} theme={theme}/>
            <Input type="date" value={filters.toDate}
              onChange={(v) => updateFilter('toDate', v)} theme={theme}/>
          </div>
        </div>
        {anyFilter && (
          <button onClick={clearFilters} style={{
            marginTop: 8, fontSize: 11, fontWeight: 600, color: theme.accent,
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
          }}>Clear filters</button>
        )}
      </Card>

      {/* Body */}
      {loading && <Card theme={theme} padding={20}><div style={{ fontSize: 13, color: theme.inkMuted, textAlign: 'center' }}>Loading…</div></Card>}

      {!loading && error && (
        <Card theme={theme} padding={20}>
          <div style={{ fontSize: 13, color: '#C62828' }}>Failed to load audit log: {error}</div>
        </Card>
      )}

      {!loading && !error && rows.length === 0 && (
        <Card theme={theme} padding={20}>
          <div style={{ fontSize: 13, color: theme.inkMuted, textAlign: 'center' }}>
            {anyFilter ? 'No entries match these filters.' : 'No audit entries yet.'}
          </div>
        </Card>
      )}

      {!loading && rows.length > 0 && (
        <Card theme={theme} padding={0}>
          {rows.map((r, i) => {
            const isOpen = expanded === r.id;
            const ts = r.at ? new Date(r.at) : null;
            const tsStr = ts ? ts.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            const actorName = (actors.find(a => a.id === r.actorId) || {}).name || r.actorEmail || 'unknown';
            return (
              <div key={r.id} style={{ borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${theme.rule}` }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none', padding: '12px 14px',
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <Pill tone={actionTone(r.action)} theme={theme}>{r.action || '—'}</Pill>
                    <span style={{ fontSize: 12, color: theme.ink, fontWeight: 600 }}>{r.tableName}</span>
                    {r.rowId && <span style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>#{r.rowId}</span>}
                    <span style={{ fontSize: 11, color: theme.inkMuted, marginLeft: 'auto' }}>{tsStr}</span>
                  </div>
                  <div style={{ fontSize: 12, color: theme.inkSoft }}>{actorName}</div>
                </button>
                {isOpen && (
                  <div style={{
                    padding: '4px 14px 14px',
                    fontSize: 11, fontFamily: theme.mono || 'ui-monospace, monospace',
                    color: theme.ink,
                  }}>
                    <pre style={{
                      background: theme.rule, padding: 10, borderRadius: 8,
                      overflow: 'auto', maxHeight: 280, margin: 0,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>{r.diff ? JSON.stringify(r.diff, null, 2) : '(no diff captured)'}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* Load more */}
      {!loading && hasMore && (
        <button
          onClick={() => load(false)}
          disabled={loadingMore}
          style={{
            padding: '12px', fontSize: 13, fontWeight: 600,
            color: theme.accent, background: 'transparent',
            border: `1px solid ${theme.rule}`, borderRadius: 12,
            cursor: loadingMore ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}>
          {loadingMore ? 'Loading…' : `Load ${AUDIT_PAGE} more`}
        </button>
      )}
    </div>
  );
}

function AdminMore({ theme, navigate, profile, onSignOut }) {
  const items = [
    { name: 'edits',     icon: 'edit',  label: 'Edit Requests',   desc: 'Approve protected-field edits past grace' },
    { name: 'reviews',   icon: 'star',  label: 'Reviews Inbox',   desc: 'Match incoming reviews to clients' },
    { name: 'pending-clients', icon: 'cash', label: 'Pending Clients', desc: 'Approve new Stripe customers' },
    { name: 'formula-inspector', icon: 'chart', label: 'Formula Inspector', desc: 'See exactly how every score is computed' },
    { name: 'bulk-cadence', icon: 'cal', label: 'Bulk cadence', desc: 'Set weekly/monthly for many clients at once' },
    { name: 'questions', icon: 'alert', label: 'Open Questions',  desc: 'Decisions pending leadership' },
    { name: 'audit-log', icon: 'shield', label: 'Audit Log',       desc: 'Read-only history of changes' },
    { name: 'config',    icon: 'cog',   label: 'Config',          desc: 'Scoring thresholds & quarter window' },
    { name: 'roster',    icon: 'user',  label: 'Roster',          desc: 'CAs, Account Managers, Relationship Dev Reps' },
  ];
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {profile && (
        <Card theme={theme} padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22,
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}CC)`,
              color: theme.accentInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: theme.serif, fontWeight: 600, fontSize: 18, letterSpacing: -0.3,
              flexShrink: 0,
            }}>{((profile.displayName || profile.display_name || profile.email || 'A').split(/\s+/).map(s => s[0]).slice(0, 2).join('')).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.displayName || profile.display_name || 'Signed in'}
              </div>
              <div style={{ fontSize: 12, color: theme.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.email}
              </div>
            </div>
          </div>
        </Card>
      )}
      <Card theme={theme} padding={0}>
        {items.map((it, i) => (
          <button key={it.name} onClick={() => navigate(it.name)} className="cabt-btn-press" style={{
            display: 'flex', alignItems: 'center', gap: 14, width: '100%',
            background: 'transparent', border: 'none',
            padding: '16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: i === items.length - 1 ? 'none' : `1px solid ${theme.rule}`,
            WebkitTapHighlightColor: 'transparent',
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
      {onSignOut && (
        <button
          onClick={onSignOut}
          className="cabt-btn-press"
          style={{
            width: '100%', padding: '14px 16px',
            background: 'transparent', border: `1.5px solid ${theme.rule}`,
            borderRadius: 14, color: theme.ink,
            fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >Sign out</button>
      )}
      <div style={{ fontSize: 11, color: theme.inkMuted, textAlign: 'center', padding: '12px 0', letterSpacing: 0.4 }}>
        gsTeam Scoreboard · Admin · v0.2
      </div>
    </div>
  );
}

// ── Bulk Cadence Editor ────────────────────────────────────────────────────
// Bobby's 2026-05-05 ask: "I want to update [cadence] for ALL clients at the
// same time. Instead of going in ALL accounts to change one at a time."
//
// Multi-select all/by-cadence/individually + apply weekly OR monthly to the
// selection. Writes go through CABT_api.updateClient per client; realtime
// then propagates back. For a 50-client batch, ~5-10 sec end-to-end.
function AdminBulkCadence({ state, theme, navigate }) {
  const allClients = (state.clients || []).filter(c => !c.cancelDate)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const [selected, setSelected] = React.useState(() => new Set());
  const [filter, setFilter] = React.useState('all'); // all | weekly | monthly
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const [errMsg, setErrMsg] = React.useState(null);

  const filtered = allClients.filter(c => {
    const cad = c.loggingCadence || 'monthly';
    if (filter === 'all')     return true;
    if (filter === 'weekly')  return cad === 'weekly';
    if (filter === 'monthly') return cad === 'monthly';
    return true;
  });

  const counts = {
    all:     allClients.length,
    weekly:  allClients.filter(c => (c.loggingCadence || 'monthly') === 'weekly').length,
    monthly: allClients.filter(c => (c.loggingCadence || 'monthly') === 'monthly').length,
  };

  const toggle = (id) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(s => {
      if (filtered.every(c => s.has(c.id))) {
        const next = new Set(s);
        filtered.forEach(c => next.delete(c.id));
        return next;
      }
      const next = new Set(s);
      filtered.forEach(c => next.add(c.id));
      return next;
    });
  };

  const apply = async (cadence) => {
    if (busy) return;
    if (selected.size === 0) {
      setErrMsg('Select at least one client first.');
      return;
    }
    setBusy(true); setErrMsg(null); setDone(null);
    try {
      const sb = await CABT_sb();
      const ids = Array.from(selected);
      // Single bulk UPDATE — much faster than per-row when many clients.
      const { error } = await sb.from('clients')
        .update({ logging_cadence: cadence })
        .in('id', ids);
      if (error) throw error;
      setDone(`Set ${ids.length} client${ids.length === 1 ? '' : 's'} to ${cadence}`);
      setSelected(new Set());
    } catch (e) {
      setErrMsg(e?.message || 'Bulk update failed');
    }
    setBusy(false);
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Bulk cadence editor</SectionLabel>
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 10, lineHeight: 1.5 }}>
          Select multiple clients and apply weekly or monthly cadence in one shot. Cadence controls only how often CAs log narrative check-ins — monthly_metrics are always monthly regardless.
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { v: 'all',     label: `All · ${counts.all}` },
            { v: 'monthly', label: `Monthly · ${counts.monthly}` },
            { v: 'weekly',  label: `Weekly · ${counts.weekly}` },
          ].map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)} style={{
              padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
              background: filter === f.v ? theme.ink : theme.surface,
              color: filter === f.v ? (theme.accentInk || '#fff') : theme.ink,
              border: `1px solid ${filter === f.v ? theme.ink : theme.rule}`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{f.label}</button>
          ))}
        </div>
      </Card>

      {/* Action bar */}
      <Card theme={theme} padding={12}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={toggleAll} style={{
            background: 'transparent', border: `1px solid ${theme.rule}`,
            color: theme.ink, fontSize: 12, fontWeight: 600,
            padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {allFilteredSelected ? 'Clear filter selection' : `Select all in filter (${filtered.length})`}
          </button>
          <div style={{ flex: 1, fontSize: 12, color: theme.inkMuted, textAlign: 'right' }}>
            <strong style={{ color: theme.ink }}>{selected.size}</strong> selected
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Button theme={theme} variant="primary" disabled={busy || selected.size === 0} onClick={() => apply('monthly')}>
            Set selected → Monthly
          </Button>
          <Button theme={theme} variant="primary" disabled={busy || selected.size === 0} onClick={() => apply('weekly')}>
            Set selected → Weekly
          </Button>
        </div>
        {done && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: STATUS.green + '15',
                       border: `1px solid ${STATUS.green}33`, borderRadius: 6, fontSize: 12, color: '#1F6E1F' }}>
            ✓ {done}
          </div>
        )}
        {errMsg && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: STATUS.red + '15',
                       border: `1px solid ${STATUS.red}33`, borderRadius: 6, fontSize: 12, color: STATUS.red }}>
            {errMsg}
          </div>
        )}
      </Card>

      {/* Client list */}
      <Card theme={theme} padding={0}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, color: theme.inkMuted, fontSize: 13, textAlign: 'center' }}>
            No clients in this filter.
          </div>
        )}
        {filtered.map(c => {
          const cad = c.loggingCadence || 'monthly';
          const isSel = selected.has(c.id);
          return (
            <button key={c.id} onClick={() => toggle(c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '12px 14px',
              borderTop: `1px solid ${theme.rule}`,
              background: isSel ? (theme.accentSoft || 'rgba(215,255,61,0.08)') : 'transparent',
              border: 'none', borderTop: `1px solid ${theme.rule}`,
              fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: `1.5px solid ${isSel ? theme.accent : theme.rule}`,
                background: isSel ? theme.accent : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSel && <Icon name="check" size={12} color={theme.bg || '#0B0E14'} stroke={3}/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: theme.inkMuted }}>{c.id}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                background: cad === 'weekly' ? (theme.accent || '#D7FF3D') : theme.rule,
                color: cad === 'weekly' ? (theme.bg || '#0B0E14') : theme.ink,
                textTransform: 'uppercase', letterSpacing: 0.4,
              }}>{cad}</span>
            </button>
          );
        })}
      </Card>
    </div>
  );
}

// ── Formula Inspector ──────────────────────────────────────────────────────
// Bobby's 2026-05-05 request: "Can we create an admin page where I can check
// the formulas and calculations?" — full transparency into how every score
// is computed for a chosen CA. Pulls from the same calc.jsx the UI uses, so
// what's shown here matches what the CA sees. Drilldown: pick a CA → see
// each bucket's inputs, formula, and per-client breakdown.
function AdminFormulaInspector({ state, theme, navigate }) {
  const cas = (state.cas || []).filter(c => c.active);
  const [selectedCaId, setSelectedCaId] = React.useState(cas[0]?.id || '');
  const [expandedSection, setExpandedSection] = React.useState({ overview: true });

  const selectedCa = cas.find(c => c.id === selectedCaId);
  const score = selectedCa ? CABT_caScorecard(selectedCa, state) : null;
  const cfg = state.config || {};

  if (cas.length === 0) {
    return <div style={{ padding: 24, color: theme.inkMuted }}>No active CAs.</div>;
  }

  const toggle = (k) => setExpandedSection(s => ({ ...s, [k]: !s[k] }));

  const Section = ({ id, title, children }) => {
    const open = !!expandedSection[id];
    return (
      <Card theme={theme} padding={0}>
        <button onClick={() => toggle(id)} style={{
          width: '100%', padding: '12px 14px', background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: theme.ink, letterSpacing: -0.1 }}>{title}</span>
          <Icon name={open ? 'chev-u' : 'chev-d'} size={16} color={theme.inkMuted}/>
        </button>
        {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
      </Card>
    );
  };

  const KV = ({ k, v, mono }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: theme.inkMuted }}>{k}</span>
      <span style={{ color: theme.ink, fontWeight: 600, fontFamily: mono ? theme.mono : 'inherit', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );

  const Formula = ({ children }) => (
    <div style={{
      background: theme.bgSoft || 'rgba(255,255,255,0.04)',
      border: `1px solid ${theme.rule}`,
      borderRadius: 8, padding: '8px 12px', fontSize: 11, fontFamily: theme.mono,
      color: theme.ink, lineHeight: 1.5, marginTop: 6, marginBottom: 8,
      wordBreak: 'break-word',
    }}>{children}</div>
  );

  const myClients = (state.clients || []).filter(c => c.assignedCA === selectedCa?.id && !c.cancelDate);
  const eligibleClients = myClients.filter(c => (c.tier || 'standard') === 'standard' || c.tier === 'vip');
  const eligibleAtStart = (state.clients || []).filter(c =>
    c.assignedCA === selectedCa?.id &&
    ((c.tier || 'standard') === 'standard' || c.tier === 'vip') &&
    c.signDate && new Date(c.signDate) < new Date(cfg.quarterStart || cfg.quarter_start || new Date())
  );

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Formula Inspector</SectionLabel>
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 10, lineHeight: 1.5 }}>
          Pick a CA to see how their composite + each bucket is computed. Inputs, intermediate values, and formulas are all shown so any number can be cross-checked against the legacy Bonus Tracker Sheet.
        </div>
        <Field label="CA" theme={theme}>
          <Select value={selectedCaId} onChange={setSelectedCaId} theme={theme}
            options={cas.map(c => ({ value: c.id, label: `${c.id} · ${c.name}` }))}/>
        </Field>
      </Card>

      {score && (
        <>
          <Section id="overview" title={`Composite — ${(score.composite*100).toFixed(0)}/100`}>
            <Formula>
              composite = (Performance + Retention + Growth) ÷ 3<br/>
              = ({(score.performance*100).toFixed(1)} + {(score.retention*100).toFixed(1)} + {(score.growth*100).toFixed(1)}) ÷ 3<br/>
              = {(score.composite*100).toFixed(1)}
            </Formula>
            <KV k="Performance bucket" v={(score.performance*100).toFixed(1)} mono/>
            <KV k="Retention bucket" v={(score.retention*100).toFixed(1)} mono/>
            <KV k="Growth bucket" v={(score.growth*100).toFixed(1)} mono/>
            <div style={{ borderTop: `1px solid ${theme.rule}`, marginTop: 6, paddingTop: 6 }}/>
            <KV k="Book completeness gate" v={(score.bookCompleteness*100).toFixed(1) + '%'} mono/>
            <KV k="Eligible clients (Standard + VIP)" v={score.eligibleClientCount || eligibleClients.length} mono/>
            <KV k="Clients with perf data" v={score.perfDataClientCount || 0} mono/>
          </Section>

          <Section id="performance" title={`Performance bucket — ${(score.performance*100).toFixed(0)}/100`}>
            <Formula>
              performance = (avg of per-client performance, skip nulls) × bookCompleteness<br/>
              <br/>
              per-client performance = avg of 5 sub-scores (skip nulls):<br/>
              &nbsp;&nbsp;MRR Growth · Lead Cost · Ad Spend · Funnel · Attrition
            </Formula>
            <KV k="Raw perf avg (clients with data)" v={(score.performanceRaw*100).toFixed(1)} mono/>
            <KV k="× Book completeness gate" v={(score.bookCompleteness*100).toFixed(1) + '%'} mono/>
            <KV k="= Performance bucket" v={(score.performance*100).toFixed(1)} mono/>
            <div style={{ marginTop: 10, fontSize: 11, color: theme.inkMuted, lineHeight: 1.5 }}>
              Per-client breakdown (only clients with at least one sub-score):
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              {(score.clients || []).filter(s => s.sub && s.sub.performance != null).slice(0, 20).map(s => (
                <div key={s.client.id} style={{ display: 'flex', gap: 6, padding: '4px 0', borderBottom: `1px solid ${theme.rule}` }}>
                  <span style={{ flex: 1, color: theme.ink, fontWeight: 600 }}>{s.client.name}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.mrrGrowth != null ? (s.sub.mrrGrowth*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.leadCost != null ? (s.sub.leadCost*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.adSpend != null ? (s.sub.adSpend*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.funnel != null ? (s.sub.funnel*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.attrition != null ? (s.sub.attrition*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.ink, fontWeight: 700, fontFamily: theme.mono }}>{(s.sub.performance*100).toFixed(0)}</span>
                </div>
              ))}
              {(score.clients || []).filter(s => s.sub && s.sub.performance != null).length === 0 && (
                <div style={{ padding: 8, color: theme.inkMuted, fontStyle: 'italic' }}>
                  No clients have monthly metrics logged yet for this CA.
                </div>
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 9, color: theme.inkMuted, fontFamily: theme.mono, display: 'flex', gap: 6 }}>
              <span style={{ flex: 1 }}>CLIENT</span>
              <span style={{ width: 60, textAlign: 'right' }}>MRR↑</span>
              <span style={{ width: 60, textAlign: 'right' }}>LEAD$</span>
              <span style={{ width: 60, textAlign: 'right' }}>AD$</span>
              <span style={{ width: 60, textAlign: 'right' }}>FUNNEL</span>
              <span style={{ width: 60, textAlign: 'right' }}>ATTR</span>
              <span style={{ width: 60, textAlign: 'right' }}>PERF</span>
            </div>
          </Section>

          <Section id="retention" title={`Retention bucket — ${(score.retention*100).toFixed(0)}/100`}>
            <Formula>
              retention = (eligible_at_quarter_start − cancellations_counts_against_ca) ÷ eligible_at_quarter_start<br/>
              <br/>
              Linear from cliff ({((cfg.retentionCliff || cfg.retention_cliff || 0.97)*100).toFixed(0)}%) to 100%.<br/>
              Below cliff = 0; at 100% retained = 1.0.
            </Formula>
            <KV k="Eligible at quarter start" v={score.eligibleAtQuarterStart || eligibleAtStart.length} mono/>
            <KV k="Cancellations counted against CA" v={score.cancelledThisQuarter || 0} mono/>
            <KV k="= Retention rate" v={
              score.eligibleAtQuarterStart > 0
                ? `${(((score.eligibleAtQuarterStart - score.cancelledThisQuarter) / score.eligibleAtQuarterStart)*100).toFixed(1)}%`
                : '—'
            } mono/>
            <KV k="Retention cliff (config)" v={`${((cfg.retentionCliff || cfg.retention_cliff || 0.97)*100).toFixed(0)}%`} mono/>
            <KV k="= Retention bucket" v={(score.retention*100).toFixed(1)} mono/>
          </Section>

          <Section id="growth" title={`Growth bucket — ${(score.growth*100).toFixed(0)}/100`}>
            <Formula>
              growth = total_points ÷ max_points<br/>
              max_points = 8 × eligible_clients (90+ days old, Standard or VIP)<br/>
              <br/>
              Per client (1pt each, max 8):<br/>
              &nbsp;&nbsp;• Review obtained this quarter<br/>
              &nbsp;&nbsp;• Testimonial obtained<br/>
              &nbsp;&nbsp;• Case study obtained<br/>
              &nbsp;&nbsp;• ≥1 referral this quarter<br/>
              &nbsp;&nbsp;• On VIP tier<br/>
              &nbsp;&nbsp;• Has membership add-on<br/>
              &nbsp;&nbsp;• Has gear / products<br/>
              &nbsp;&nbsp;• +0.25 per extra referral, capped at +1
            </Formula>
            <KV k="Eligible 90+ day clients" v={score.growthEligibleCount || 0} mono/>
            <KV k="Max possible points" v={(score.growthEligibleCount || 0) * 8} mono/>
            <KV k="= Growth bucket" v={(score.growth*100).toFixed(1)} mono/>
          </Section>

          <Section id="payout" title={`Bonus Payout — ${CABT_fmtMoney(score.finalPayout)}`}>
            <Formula>
              final_payout = total_pot × mrr_share × composite<br/>
              total_pot = agency_gross_last_month × pot_pct (from quarter_inputs)<br/>
              mrr_share = CA's eligible-MRR ÷ all eligible-MRR (across active CAs)
            </Formula>
            <KV k="Total pot" v={CABT_fmtMoney(score.totalPot || 0)} mono/>
            <KV k="CA's eligible MRR" v={CABT_fmtMoney(score.caEligibleMrr || 0)} mono/>
            <KV k="MRR share" v={`${((score.mrrShare || 0)*100).toFixed(2)}%`} mono/>
            <KV k="× Composite" v={(score.composite*100).toFixed(1) + '%'} mono/>
            <KV k="= Final payout" v={CABT_fmtMoney(score.finalPayout)} mono/>
            <KV k="Max payout (at 100% composite)" v={CABT_fmtMoney(score.maxPayout)} mono/>
            {(score.totalPot || 0) === 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef0f0', border: '1px solid #d9535380', borderRadius: 6, fontSize: 11, color: '#7d2828' }}>
                Total pot = $0 because <strong>quarter_inputs</strong> for this quarter is not set. Open <strong>Admin → Bonus</strong> and enter agency gross + pot %.
              </div>
            )}
          </Section>

          <Section id="config" title="Config thresholds (live)">
            <KV k="Performance · MRR Growth full credit" v={`$${cfg.fullCreditMrrGrowth || 750}/mo`} mono/>
            <KV k="Performance · Lead Cost best" v={`≤ $${cfg.leadCostBest || 5}`} mono/>
            <KV k="Performance · Lead Cost great" v={`≤ $${cfg.leadCostGreat || 10}`} mono/>
            <KV k="Performance · Lead Cost OK" v={`≤ $${cfg.leadCostAcceptable || 20}`} mono/>
            <KV k="Performance · Ad Spend % of MRR" v={`${((cfg.adSpendPctOfGross || 0.10)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Ad Spend floor" v={`$${cfg.adSpendFloor || 1000}`} mono/>
            <KV k="Performance · Funnel booking floor" v={`${((cfg.bookingFloor || 0.30)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Funnel show floor" v={`${((cfg.showFloor || 0.50)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Funnel close floor" v={`${((cfg.closeFloor || 0.70)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Attrition green floor" v={`${((cfg.attritionGreenFloor || 0.03)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Attrition critical ceil" v={`${((cfg.attritionCriticalCeiling || 0.05)*100).toFixed(0)}%`} mono/>
            <KV k="Retention · Cliff" v={`${((cfg.retentionCliff || 0.97)*100).toFixed(0)}%`} mono/>
            <KV k="Grace period (days)" v={cfg.gracePeriodDays || 90} mono/>
            <KV k="Pot · Default %" v={`${((cfg.potPercentage || 0.005)*100).toFixed(2)}%`} mono/>
          </Section>
        </>
      )}
    </div>
  );
}

Object.assign(window, {
  AdminAnnualBonus, AdminRevenueLedger, AdminClientRollup, AdminClientCalc, AdminOpenQuestions, AdminAuditLog, AdminMore,
  AdminAddClient, AdminPendingClients, AdminFormulaInspector, AdminBulkCadence, CABT_nextClientId: nextClientId,
});

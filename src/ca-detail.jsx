// ca-detail.jsx — Client Detail screen with Overview/Metrics/Events/Surveys tabs

function ClientDetail({ state, ca, theme, clientId, navigate }) {
  const [tab, setTab] = React.useState('overview');
  // Bobby 2026-05-05: history view consolidates every log type for a client
  // and groups them by month or week. Toggle persists per-session per-client.
  const [historyGroup, setHistoryGroup] = React.useState('month'); // 'month' | 'week'
  const client = state.clients.find(c => c.id === clientId);
  if (!client) return <div style={{ padding: 24 }}>Client not found.</div>;

  const sub = CABT_clientSubScores(client, state.monthlyMetrics, state.surveys, state.config);
  const status = CABT_scoreToStatus(sub.composite);
  const tenureMonths = Math.max(1, Math.round(
    (new Date() - new Date(client.signDate)) / (1000 * 60 * 60 * 24 * 30)
  ));
  // Metrics — show monthly AND weekly entries for this client, newest first.
  // Weekly entries are sorted by weekStart; monthly by month. Both are tappable
  // for editing via LogMetricsForm (which auto-detects kind from the row id).
  const cMonthlyMetrics = (state.monthlyMetrics || [])
    .filter(m => m.clientId === client.id)
    .map(m => ({ ...m, _kind: 'monthly', _periodKey: m.month }));
  const cWeeklyMetrics = (state.weeklyMetrics || [])
    .filter(w => w.clientId === client.id)
    .map(w => ({ ...w, _kind: 'weekly', _periodKey: w.weekStart }));
  const cMetrics = [...cMonthlyMetrics, ...cWeeklyMetrics]
    .sort((a, b) => (b._periodKey || '').localeCompare(a._periodKey || ''));
  const cEvents = state.growthEvents.filter(e => e.clientId === client.id).sort((a,b) => b.date.localeCompare(a.date));
  const cSurveys = state.surveys.filter(s => s.clientId === client.id).sort((a,b) => b.date.localeCompare(a.date));
  const cWeekly  = (state.weeklyCheckins  || []).filter(w => w.clientId === client.id);
  const cMonthly = (state.monthlyCheckins || []).filter(m => m.clientId === client.id);
  const cTimeline = [
    ...cWeekly.map(w => ({ kind: 'weekly',  date: w.weekStart, item: w })),
    ...cMonthly.map(m => ({ kind: 'monthly', date: m.month,    item: m })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const lastMetric = cMonthlyMetrics.sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0];
  const cadence = client.loggingCadence || 'monthly';

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Hero */}
      <div style={{ padding: '4px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>
              Client · {client.id}
            </div>
            <div style={{ fontFamily: theme.serif, fontSize: 26, fontWeight: 600, color: theme.ink, letterSpacing: -0.4, lineHeight: 1.15, marginTop: 2 }}>
              {client.name}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <StatusPill status={status} />
              <span style={{ fontSize: 12, color: theme.inkMuted }}>{tenureMonths}mo tenure</span>
              <span style={{ fontSize: 12, color: theme.inkMuted }}>· {CABT_fmtMoney(client.monthlyRetainer)}/mo</span>
            </div>
          </div>
          <ScoreRing
            value={sub.composite}
            size={64} stroke={5}
            color={STATUS[status]}
            bg={theme.rule}
            label={
              <div style={{ fontSize: 16, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>
                {sub.composite != null ? (sub.composite*100).toFixed(0) : '—'}
              </div>
            }
          />
        </div>
      </div>
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'history',  label: 'History' },
          { value: 'timeline', label: `Timeline · ${cTimeline.length}` },
          { value: 'metrics',  label: `Metrics · ${cMetrics.length}` },
          { value: 'events',   label: `Events · ${cEvents.length}` },
          { value: 'surveys',  label: `Surveys · ${cSurveys.length}` },
        ]}
        value={tab} onChange={setTab} theme={theme}
      />

      {tab === 'overview' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={theme}>
            <SectionLabel theme={theme}>Sub-scores</SectionLabel>
            {/* 5 Performance sub-scores per Formula Guide. Aggregated over the
                quarter (3 months together) — not last-month-only. Empty data
                renders as '—' (gray) instead of showing legacy synthetic
                baselines (the "Growth 60 / Satisfaction 70 with no data" bug
                Bobby flagged 2026-05-04). */}
            {[
              ['mrrGrowth', 'MRR Growth'],
              ['leadCost',  'Lead Cost'],
              ['adSpend',   'Ad Spend'],
              ['funnel',    'Funnel'],
              ['attrition', 'Attrition'],
            ].map(([k, label]) => {
              const v = sub[k];
              const s = CABT_scoreToStatus(v);
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.rule}`, gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: STATUS[s], flexShrink: 0 }}/>
                  <span style={{ flex: 1, fontSize: 14, color: theme.ink }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {v != null ? (v*100).toFixed(0) : '—'}
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 8, lineHeight: 1.4 }}>
              "—" means no data yet for that metric this quarter. Empty data is skipped, not penalized.
            </div>
          </Card>

          {sub.satisfaction != null && (
            <Card theme={theme}>
              <SectionLabel theme={theme}>Satisfaction (display only)</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: STATUS[CABT_scoreToStatus(sub.satisfaction)], flexShrink: 0 }}/>
                <span style={{ flex: 1, fontSize: 14, color: theme.ink }}>From {state.surveys.filter(s => s.clientId === client.id).length} survey(s)</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {(sub.satisfaction*100).toFixed(0)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
                Satisfaction is a separate display metric per the Formula Guide — not part of the 5 Performance sub-scores above.
              </div>
            </Card>
          )}
          <Card theme={theme}>
            <SectionLabel theme={theme}>Contract</SectionLabel>
            <KV theme={theme} label="Sign date"  value={CABT_fmtDate(client.signDate)} />
            <KV theme={theme} label="Term"       value={`${client.termMonths} months`} />
            <KV theme={theme} label="Retainer"   value={`${CABT_fmtMoney(client.monthlyRetainer)}/mo`} />
            <KV theme={theme} label="Membership" value={client.hasMembershipAddon ? 'Yes' : '—'} />
            <KV theme={theme} label="AE"         value={state.sales.find(s => s.id === client.ae)?.name || '—'} last />
          </Card>
        </div>
      )}

      {tab === 'history' && (() => {
        // Aggregate every log type for this client into one stream, then group
        // by month or week. Each item carries kind + date + display payload.
        // Bobby 2026-05-05 ("yung week data at month maiiba ah"): month view
        // hides weekly entries; week view hides monthly entries — so the
        // numbers you see in each view actually correspond to that period.
        const allItems = [
          ...cMonthlyMetrics.map(m => ({ id: m.id, kind: 'monthly-metrics', date: m.month,     sortDate: m.month,     payload: m })),
          ...cWeeklyMetrics .map(w => ({ id: w.id, kind: 'weekly-metrics',  date: w.weekStart, sortDate: w.weekStart, payload: w })),
          ...cEvents        .map(e => ({ id: e.id, kind: 'event',           date: e.date,      sortDate: e.date,      payload: e })),
          ...cSurveys       .map(s => ({ id: s.id, kind: 'survey',          date: s.date,      sortDate: s.date,      payload: s })),
          ...cWeekly        .map(w => ({ id: w.id, kind: 'weekly-checkin',  date: w.weekStart, sortDate: w.weekStart, payload: w })),
          ...cMonthly       .map(m => ({ id: m.id, kind: 'monthly-checkin', date: m.month,     sortDate: m.month,     payload: m })),
        ];
        // Period-bound items only show in their matching grouping mode.
        // Events + surveys are date-based (not period-bound) so they appear
        // in both views, bucketed by whichever grouping is active.
        const items = allItems.filter(it => {
          if (historyGroup === 'week') {
            return it.kind !== 'monthly-metrics' && it.kind !== 'monthly-checkin';
          }
          return it.kind !== 'weekly-metrics' && it.kind !== 'weekly-checkin';
        });

        // Group key — first-of-month or ISO Monday of week
        const isoMondayOf = (iso) => {
          if (!iso) return '—';
          const d = new Date(iso + 'T12:00:00');
          const day = d.getDay() || 7;
          if (day !== 1) d.setDate(d.getDate() - (day - 1));
          return d.toISOString().slice(0, 10);
        };
        const groupKey = (it) =>
          historyGroup === 'week' ? isoMondayOf(it.date) : (it.date ? it.date.slice(0, 7) + '-01' : '—');

        const groupsMap = new Map();
        items.forEach(it => {
          const k = groupKey(it);
          if (!groupsMap.has(k)) groupsMap.set(k, []);
          groupsMap.get(k).push(it);
        });
        const groups = Array.from(groupsMap.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([key, list]) => ({
            key,
            label: historyGroup === 'week'
              ? `Week of ${CABT_fmtDate(key)}`
              : CABT_fmtMonth(key),
            items: [...list].sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || '')),
          }));

        const KIND_META = {
          'monthly-metrics': { label: 'Monthly metrics', accent: '#43A047', route: 'log-metrics' },
          'weekly-metrics':  { label: 'Weekly metrics',  accent: '#43A047', route: 'log-metrics' },
          'event':           { label: 'Growth event',    accent: '#7C4DFF', route: 'log-event' },
          'survey':          { label: 'Survey',          accent: '#FFB300', route: 'log-survey' },
          'weekly-checkin':  { label: 'Weekly check-in', accent: '#039BE5', route: null },
          'monthly-checkin': { label: 'Monthly check-in', accent: '#039BE5', route: null },
        };

        const renderItem = (it) => {
          const meta = KIND_META[it.kind] || { label: it.kind, accent: theme.inkMuted };
          const p = it.payload;
          const isMetric = it.kind === 'monthly-metrics' || it.kind === 'weekly-metrics';
          const isCheckin = it.kind === 'weekly-checkin' || it.kind === 'monthly-checkin';
          const dateLabel = it.kind === 'weekly-metrics' || it.kind === 'weekly-checkin'
            ? `Week of ${CABT_fmtDate(it.date)}`
            : (it.kind === 'monthly-metrics' || it.kind === 'monthly-checkin'
                ? CABT_fmtMonth(it.date)
                : CABT_fmtDate(it.date));
          const editable = !!meta.route;
          return (
            <div key={it.id} style={{
              padding: '12px 14px', borderTop: `1px solid ${theme.rule}`,
              cursor: editable ? 'pointer' : 'default',
            }}
              onClick={editable ? () => navigate(meta.route, { clientId, editingId: it.id }) : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: meta.accent, flexShrink: 0 }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>{meta.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{dateLabel}</span>
              </div>
              {isMetric && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 11 }}>
                  <Stat theme={theme} k="MRR"      v={CABT_fmtMoney(p.clientMRR)} />
                  <Stat theme={theme} k="Ad spend" v={CABT_fmtMoney(p.adSpend)} />
                  <Stat theme={theme} k="Leads"    v={p.leadsGenerated || 0} />
                  <Stat theme={theme} k="Booked"   v={p.apptsBooked || 0} />
                  <Stat theme={theme} k="Showed"   v={p.leadsShowed || 0} />
                  <Stat theme={theme} k="Signed"   v={p.leadsSigned || 0} />
                  <Stat theme={theme} k="Cancel"   v={p.studentsCancelled || 0} />
                  <Stat theme={theme} k="Lead $"   v={CABT_fmtMoney(p.leadCost)} />
                </div>
              )}
              {it.kind === 'event' && (
                <div style={{ fontSize: 13, color: theme.ink }}>
                  <strong>{p.eventType}</strong>
                  {p.notes && <span style={{ color: theme.inkSoft }}> · {p.notes}</span>}
                  {p.saleTotal > 0 && <span style={{ color: theme.inkMuted }}> · Sale {CABT_fmtMoney(p.saleTotal)}</span>}
                </div>
              )}
              {it.kind === 'survey' && (() => {
                const avg = (p.overall + p.responsiveness + p.followThrough + p.communication) / 4;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1,2,3,4,5].map(n => (
                        <Icon key={n} name={n <= Math.round(avg) ? 'star-fill' : 'star'} size={12} color={theme.gold || '#FFB300'} />
                      ))}
                    </div>
                    {p.comment && <div style={{ flex: 1, fontFamily: theme.serif, fontSize: 13, fontStyle: 'italic', color: theme.inkSoft, lineHeight: 1.4 }}>"{p.comment}"</div>}
                  </div>
                );
              })()}
              {isCheckin && (
                <div style={{ fontSize: 12, color: theme.ink, lineHeight: 1.5 }}>
                  {[
                    ['concern',       'Concern'],
                    ['win',           'Win'],
                    ['accountAction', 'Account-side'],
                    ['agencyAction',  'Agency-side'],
                  ].map(([k, label]) => p[k] ? (
                    <div key={k} style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: theme.inkMuted, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginRight: 6 }}>{label}</span>
                      <span style={{ whiteSpace: 'pre-wrap' }}>{p[k]}</span>
                    </div>
                  ) : null)}
                  {!p.concern && !p.win && !p.accountAction && !p.agencyAction && p.notes && (
                    <div style={{ color: theme.inkMuted, fontStyle: 'italic' }}>{p.notes}</div>
                  )}
                </div>
              )}
            </div>
          );
        };

        return (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Group toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: theme.inkMuted, fontWeight: 600 }}>Group by</span>
              {[
                { v: 'month', label: 'Month' },
                { v: 'week',  label: 'Week' },
              ].map(g => (
                <button key={g.v} onClick={() => setHistoryGroup(g.v)} style={{
                  padding: '6px 12px', fontSize: 12, fontWeight: 700,
                  background: historyGroup === g.v ? theme.ink : theme.surface,
                  color: historyGroup === g.v ? (theme.accentInk || '#fff') : theme.ink,
                  border: `1px solid ${historyGroup === g.v ? theme.ink : theme.rule}`,
                  borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                }}>{g.label}</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.inkMuted }}>{items.length} log{items.length === 1 ? '' : 's'} across {groups.length} {historyGroup}{groups.length === 1 ? '' : 's'}</span>
            </div>

            {groups.length === 0 && <EmptyState theme={theme} text="No history yet for this client." />}

            {groups.map(g => (
              <Card theme={theme} key={g.key} padding={0}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink, fontFamily: theme.serif, letterSpacing: -0.2 }}>{g.label}</div>
                  <div style={{ fontSize: 11, color: theme.inkMuted }}>{g.items.length} entr{g.items.length === 1 ? 'y' : 'ies'}</div>
                </div>
                {g.items.map(renderItem)}
              </Card>
            ))}
          </div>
        );
      })()}

      {tab === 'timeline' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 12, background: theme.bgSoft || 'rgba(255,255,255,0.04)', border: `1px solid ${theme.rule}` }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: theme.inkMuted, textTransform: 'uppercase' }}>Cadence</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, textTransform: 'capitalize' }}>{cadence}</span>
            </div>
            <Button theme={theme} icon="plus" size="sm" onClick={() => navigate('log-checkin', { clientId })}>Log check-in</Button>
          </div>
          {cTimeline.length === 0 && <EmptyState theme={theme} text="No check-ins logged yet." />}
          {cTimeline.map(t => {
            const it = t.item;
            const periodLabel = t.kind === 'weekly'
              ? `Week of ${CABT_fmtDate(t.date)}`
              : CABT_fmtMonth(t.date);
            return (
              <Card theme={theme} key={it.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, fontFamily: theme.serif, letterSpacing: -0.2 }}>{periodLabel}</div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: theme.bg || '#0B0E14', background: theme.accent || '#D7FF3D', padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.kind}</span>
                </div>
                {[
                  ['concern',       'Concern'],
                  ['win',           'Win'],
                  ['accountAction', 'Account-side action'],
                  ['agencyAction',  'Agency-side action'],
                ].map(([k, label]) => (
                  it[k] ? (
                    <div key={k} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, color: theme.ink, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{it[k]}</div>
                    </div>
                  ) : null
                ))}
                {it.notes && (
                  <div style={{ fontSize: 12, color: theme.inkMuted, lineHeight: 1.4, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${theme.rule}`, whiteSpace: 'pre-wrap' }}>{it.notes}</div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'metrics' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button theme={theme} icon="plus" fullWidth size="md"
                  onClick={() => navigate('log-metrics', { clientId })}>
            {cadence === 'weekly' ? 'Log a week' : 'Log a month'}
          </Button>
          {cMetrics.length === 0 && <EmptyState theme={theme} text="No metrics yet." />}
          {cMetrics.map(m => {
            const isWeekly = m._kind === 'weekly';
            const periodLabel = isWeekly ? `Week of ${CABT_fmtDate(m.weekStart)}` : CABT_fmtMonth(m.month);
            return (
              <Card theme={theme} key={m.id} padding={14}
                    onClick={() => navigate('log-metrics', { clientId, editingId: m.id })}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    aria-label={`Edit ${periodLabel}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, fontFamily: theme.serif, letterSpacing: -0.2 }}>{periodLabel}</div>
                    {isWeekly && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                        padding: '2px 6px', borderRadius: 8,
                        background: theme.bgSoft || 'rgba(255,255,255,0.05)',
                        color: theme.inkMuted, textTransform: 'uppercase',
                      }}>weekly</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.4 }}>
                      Rev <span style={{ color: theme.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtMoney(m.clientGrossRevenue || m.clientMRR)}</span>
                    </div>
                    <Icon name="edit" size={14} color={theme.inkMuted} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
                  <Stat theme={theme} k="Leads" v={m.leadsGenerated} />
                  <Stat theme={theme} k="Booked" v={m.apptsBooked} />
                  <Stat theme={theme} k="Showed" v={m.leadsShowed} />
                  <Stat theme={theme} k="Signed" v={m.leadsSigned} />
                  <Stat theme={theme} k="Ad spend" v={CABT_fmtMoney(m.adSpend)} />
                  <Stat theme={theme} k="Lead $" v={CABT_fmtMoney(m.leadCost)} />
                  <Stat theme={theme} k="Students" v={m.totalStudentsStart} />
                  <Stat theme={theme} k="Cancel" v={m.studentsCancelled} />
                </div>
                <div style={{ fontSize: 10, color: theme.inkMuted, marginTop: 8, textAlign: 'right', letterSpacing: 0.3 }}>
                  Tap to edit
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'events' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button theme={theme} icon="plus" fullWidth size="md"
                  onClick={() => navigate('log-event', { clientId })}>Log an event</Button>
          {cEvents.length === 0 && <EmptyState theme={theme} text="No growth events yet." />}
          {cEvents.map(e => (
            <Card theme={theme} key={e.id} padding={14}
                  onClick={() => navigate('log-event', { clientId, editingId: e.id })}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  aria-label={`Edit ${e.eventType}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{e.eventType}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtDate(e.date)}</span>
                  <Icon name="edit" size={14} color={theme.inkMuted} />
                </div>
              </div>
              {e.notes && <div style={{ fontSize: 13, color: theme.inkSoft, lineHeight: 1.4 }}>{e.notes}</div>}
              {e.saleTotal > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: theme.inkMuted }}>
                  Sale {CABT_fmtMoney(e.saleTotal)} · Cost {CABT_fmtMoney(e.costToUs)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'surveys' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button theme={theme} icon="plus" fullWidth size="md"
                  onClick={() => navigate('log-survey', { clientId })}>Log a survey</Button>
          {cSurveys.length === 0 && <EmptyState theme={theme} text="No surveys yet." />}
          {cSurveys.map(s => {
            const avg = (s.overall + s.responsiveness + s.followThrough + s.communication) / 4;
            return (
              <Card theme={theme} key={s.id} padding={14}
                    onClick={() => navigate('log-survey', { clientId, editingId: s.id })}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    aria-label="Edit survey">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1,2,3,4,5].map(n => (
                      <Icon key={n} name={n <= Math.round(avg) ? 'star-fill' : 'star'} size={14} color={theme.gold} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtDate(s.date)}{s.anonymous && ' · anon'}</span>
                    <Icon name="edit" size={14} color={theme.inkMuted} />
                  </div>
                </div>
                {s.comment && <div style={{ fontFamily: theme.serif, fontSize: 14, fontStyle: 'italic', color: theme.inkSoft, lineHeight: 1.4 }}>"{s.comment}"</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KV({ theme, label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${theme.rule}`, fontSize: 14 }}>
      <span style={{ color: theme.inkMuted }}>{label}</span>
      <span style={{ color: theme.ink, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function Stat({ theme, k, v }) {
  return (
    <div style={{ background: theme.bgElev, border: `1px solid ${theme.rule}`, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: theme.inkMuted, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.ink, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{v}</div>
    </div>
  );
}

function EmptyState({ theme, text }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: theme.inkMuted, fontSize: 14 }}>
      <Icon name="doc" size={32} />
      <div style={{ marginTop: 8 }}>{text}</div>
    </div>
  );
}

Object.assign(window, { ClientDetail, KV, Stat, EmptyState });

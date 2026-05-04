// ca-detail.jsx — Client Detail screen with Overview/Metrics/Events/Surveys tabs

function ClientDetail({ state, ca, theme, clientId, navigate }) {
  const [tab, setTab] = React.useState('overview');
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

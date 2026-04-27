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
  const cMetrics = state.monthlyMetrics.filter(m => m.clientId === client.id).sort((a,b) => b.month.localeCompare(a.month));
  const cEvents = state.growthEvents.filter(e => e.clientId === client.id).sort((a,b) => b.date.localeCompare(a.date));
  const cSurveys = state.surveys.filter(s => s.clientId === client.id).sort((a,b) => b.date.localeCompare(a.date));
  const lastMetric = cMetrics[0];

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
            {[
              ['revenue',      'Revenue'],
              ['adEfficiency', 'Ad efficiency'],
              ['funnel',       'Funnel'],
              ['attrition',    'Attrition'],
              ['satisfaction', 'Satisfaction'],
              ['growth',       'Growth'],
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
          </Card>
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

      {tab === 'metrics' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button theme={theme} icon="plus" fullWidth size="md"
                  onClick={() => navigate('log-metrics', { clientId })}>Log a month</Button>
          {cMetrics.length === 0 && <EmptyState theme={theme} text="No monthly metrics yet." />}
          {cMetrics.map(m => (
            <Card theme={theme} key={m.id} padding={14}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, fontFamily: theme.serif, letterSpacing: -0.2 }}>{CABT_fmtMonth(m.month)}</div>
                <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.4 }}>MRR <span style={{ color: theme.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtMoney(m.clientMRR)}</span></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
                <Stat theme={theme} k="Leads" v={m.leadsGenerated} />
                <Stat theme={theme} k="Booked" v={m.apptsBooked} />
                <Stat theme={theme} k="Showed" v={m.leadsShowed} />
                <Stat theme={theme} k="Signed" v={m.leadsSigned} />
                <Stat theme={theme} k="Ad spend" v={CABT_fmtMoney(m.adSpend)} />
                <Stat theme={theme} k="Lead $" v={CABT_fmtMoney(m.leadCost)} />
                <Stat theme={theme} k="Gross" v={CABT_fmtMoney(m.clientGrossRevenue)} />
                <Stat theme={theme} k="Cancel" v={m.studentsCancelled} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'events' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button theme={theme} icon="plus" fullWidth size="md"
                  onClick={() => navigate('log-event', { clientId })}>Log an event</Button>
          {cEvents.length === 0 && <EmptyState theme={theme} text="No growth events yet." />}
          {cEvents.map(e => (
            <Card theme={theme} key={e.id} padding={14}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{e.eventType}</span>
                <span style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtDate(e.date)}</span>
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
              <Card theme={theme} key={s.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1,2,3,4,5].map(n => (
                      <Icon key={n} name={n <= Math.round(avg) ? 'star-fill' : 'star'} size={14} color={theme.gold} />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtDate(s.date)}{s.anonymous && ' · anon'}</span>
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

// ca-app.jsx — CA persona screens

// ── CA Home ─────────────────────────────────────────────────────────────────
function CAHome({ state, ca, theme, density, navigate }) {
  const score = CABT_caScorecard(ca, state);
  const status = CABT_scoreToStatus(score.composite);
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);

  // Health distribution
  const buckets = { green: 0, yellow: 0, red: 0, gray: 0 };
  myClients.forEach(c => {
    const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, state.config);
    const s = CABT_scoreToStatus(sub.composite);
    buckets[s]++;
  });

  // Today's prompts
  const currentMonth = CABT_currentMonthIso();
  const missingThisMonth = myClients.filter(c =>
    !state.monthlyMetrics.some(m => m.clientId === c.id && m.month === currentMonth)
  );
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
  const noRecentSurvey = myClients.filter(c =>
    !state.surveys.some(s => s.clientId === c.id && new Date(s.date) >= cutoff)
  );

  // Cadence-aware narrative check-in prompts (TICKET-2c)
  const isoMondayOf = (d) => {
    const x = new Date(d); const day = x.getDay() || 7;
    if (day !== 1) x.setDate(x.getDate() - (day - 1));
    return x.toISOString().slice(0, 10);
  };
  const thisWeekStart = isoMondayOf(new Date());
  const weeklyCheckins = state.weeklyCheckins || [];
  const monthlyCheckins = state.monthlyCheckins || [];
  const missingCheckin = myClients
    .filter(c => {
      const cadence = c.loggingCadence || 'monthly';
      if (cadence === 'weekly') {
        return !weeklyCheckins.some(w => w.clientId === c.id && w.weekStart === thisWeekStart);
      }
      return !monthlyCheckins.some(m => m.clientId === c.id && m.month === currentMonth);
    })
    // Weekly clients first (more time-sensitive than monthly)
    .sort((a, b) => {
      const ca = (a.loggingCadence || 'monthly') === 'weekly' ? 0 : 1;
      const cb = (b.loggingCadence || 'monthly') === 'weekly' ? 0 : 1;
      return ca - cb || a.name.localeCompare(b.name);
    });

  // Recent activity (logged by this CA)
  const recentActivity = [
    ...state.monthlyMetrics
      .filter(m => myClients.some(c => c.id === m.clientId))
      .map(m => ({ kind: 'metric', date: m.month, item: m, label: 'Monthly metrics', clientId: m.clientId })),
    ...state.growthEvents
      .filter(e => e.loggedBy === ca.id)
      .map(e => ({ kind: 'event', date: e.date, item: e, label: e.eventType, clientId: e.clientId })),
    ...state.surveys
      .filter(s => s.submittedBy === ca.id)
      .map(s => ({ kind: 'survey', date: s.date, item: s, label: 'Survey', clientId: s.clientId })),
    ...weeklyCheckins
      .filter(w => myClients.some(c => c.id === w.clientId))
      .map(w => ({ kind: 'checkin', date: w.weekStart, item: w, label: 'Weekly check-in', clientId: w.clientId })),
    ...monthlyCheckins
      .filter(m => myClients.some(c => c.id === m.clientId))
      .map(m => ({ kind: 'checkin', date: m.month, item: m, label: 'Monthly check-in', clientId: m.clientId })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const bonusColor = STATUS[status];
  const projected = score.finalPayout;

  // Empty state: no clients assigned to this CA AND nothing logged yet.
  // Show a friendly prompt instead of an all-zero scorecard. Points the user
  // at the Log button so they know how to start.
  const isEmpty = myClients.length === 0 && recentActivity.length === 0;
  if (isEmpty) {
    return (
      <div style={{ padding: '24px 16px 120px', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: theme.accent + '22',
          border: `1px solid ${theme.accent}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 32,
        }}>
          <Icon name="plus" size={32} color={theme.accent} stroke={2.4}/>
        </div>
        <div>
          <div style={{
            fontFamily: theme.serif, fontSize: 24, fontWeight: 600, color: theme.ink,
            letterSpacing: -0.4, marginBottom: 6,
          }}>Welcome, {ca && ca.name ? ca.name.split(' ')[0] : 'there'}</div>
          <div style={{
            fontSize: 14.5, color: theme.inkMuted, lineHeight: 1.5, maxWidth: 360, margin: '0 auto',
          }}>
            Your scorecard will fill in as you start logging. Tap the
            <strong style={{ color: theme.accent, fontWeight: 700 }}> Log <span aria-hidden="true">＋</span> </strong>
            button below to record monthly metrics, growth events, or client surveys.
          </div>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          marginTop: 8, width: '100%', maxWidth: 380,
        }}>
          {[
            { icon: 'chart', label: 'Monthly metrics', desc: 'Leads, ad spend, MRR, attrition' },
            { icon: 'cal',   label: 'Growth event',    desc: 'Workshop, gear sale, milestone' },
            { icon: 'star',  label: 'Client survey',   desc: 'Satisfaction snapshot' },
          ].map((it) => (
            <div key={it.label} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: theme.surface, border: `1px solid ${theme.rule}`,
              borderRadius: 14, padding: '12px 14px', textAlign: 'left',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: theme.accent + '15', color: theme.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon name={it.icon} size={18}/></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{it.label}</div>
                <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 1 }}>{it.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 24, fontSize: 11, color: theme.inkMuted,
          letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600,
        }}>↓ Use the Log button below to start</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Greeting + bonus card */}
      <div style={{
        background: theme.accent, color: theme.accentInk,
        borderRadius: theme.radius + 4, padding: '22px 22px 20px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 180, height: 180,
          borderRadius: '50%', background: theme.gold, opacity: 0.18,
        }} />
        <div style={{ fontFamily: theme.serif, fontSize: 13, opacity: 0.7, letterSpacing: 0.3, marginBottom: 4 }}>
          Hey {ca.name.split(' ')[0]} — Q2 2026
        </div>
        <div style={{ fontFamily: theme.serif, fontSize: 22, fontWeight: 400, lineHeight: 1.25, letterSpacing: -0.3, marginBottom: 14, maxWidth: 320 }}>
          {(() => {
            // Make the headline truthful when projection = $0. Don't say
            // "on track for $0" — explain *why* it's $0 (Bobby 2026-05-04).
            if (projected > 0) {
              return <>You're on track for <em style={{ color: theme.gold, fontStyle: 'normal', fontWeight: 600 }}>{CABT_fmtMoney(projected)}</em> this quarter.</>;
            }
            if (!score.totalPot || score.totalPot <= 0) {
              return <>Bonus pot for Q2 2026 isn't set yet. Admin → Quarter inputs.</>;
            }
            if (!score.mrrShare || score.mrrShare <= 0) {
              return <>No bonus-eligible MRR on your book yet — log monthly metrics to qualify.</>;
            }
            if (!score.composite || score.composite <= 0) {
              return <>Projected payout: <em style={{ color: theme.gold, fontStyle: 'normal', fontWeight: 600 }}>$0</em> — composite at zero. Log data to lift Performance / Growth.</>;
            }
            return <>Projected payout: <em style={{ color: theme.gold, fontStyle: 'normal', fontWeight: 600 }}>$0</em> this quarter.</>;
          })()}
        </div>

        {/* Score cards row — Bobby 2026-05-06: circular rings (not bars).
            Composite leads, then the three buckets that compose it. */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        }}>
          {[
            { key: 'composite',   label: 'Composite',   value: score.composite,   primary: true },
            { key: 'performance', label: 'Performance', value: score.performance },
            { key: 'retention',   label: 'Retention',   value: score.retention   },
            { key: 'growth',      label: 'Growth',      value: score.growth      },
          ].map((s) => {
            const v = s.value;
            const display = (v != null && Number.isFinite(v)) ? (v * 100).toFixed(0) : '—';
            const statusKey = CABT_scoreToStatus(v);
            const ringColor = statusKey === 'gray' ? 'rgba(0,0,0,0.20)' : STATUS[statusKey];
            return (
              <div key={s.key} style={{
                background: s.primary ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: theme.radius - 2,
                padding: '12px 8px 10px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                color: theme.accentInk,
                boxShadow: s.primary ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>
                <ScoreRing
                  value={v}
                  size={72}
                  stroke={5}
                  color={ringColor}
                  bg="rgba(0,0,0,0.08)"
                  label={
                    <div style={{ textAlign: 'center', lineHeight: 1 }}>
                      <div style={{
                        fontFamily: theme.serif, fontSize: 22, fontWeight: 700,
                        color: theme.accentInk, fontVariantNumeric: 'tabular-nums',
                        letterSpacing: -0.5,
                      }}>{display}</div>
                      <div style={{
                        fontSize: 8, fontWeight: 800, letterSpacing: 0.6,
                        marginTop: 3, textTransform: 'uppercase',
                        color: theme.accentInk, opacity: 0.65,
                      }}>{s.label}</div>
                    </div>
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Book health chips — 4 buckets so the counts add up to the full
          client total. Bobby 2026-05-04: "On track / Watch / At risk only
          have 1, 1, 5 but there are about 50 active accounts." Clients
          with no scoreable data this quarter were silently dropping into
          the gray bucket and disappearing from the chip row. Now they
          surface as "No data — needs logging" so the math is transparent. */}
      <div>
        <SectionLabel theme={theme}>Book health · {myClients.length} clients</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          {[
            { key: 'green',  count: buckets.green,  label: 'On track' },
            { key: 'yellow', count: buckets.yellow, label: 'Watch' },
            { key: 'red',    count: buckets.red,    label: 'At risk' },
            { key: 'gray',   count: buckets.gray,   label: 'No data' },
          ].map(b => (
            <button
              key={b.key}
              onClick={() => navigate('book', { filter: b.key })}
              style={{
                background: theme.surface, border: `1px solid ${theme.rule}`,
                borderRadius: theme.radius, padding: '14px 12px', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[b.key] }} />
                <span style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>{b.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{b.count}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Data completeness alert */}
      {score.bookCompleteness < 0.80 && (
        <Banner
          tone="warning"
          icon="alert"
          title="Book data incomplete"
          action="Log now"
          onAction={() => navigate('book', { filter: 'needs-data' })}
          theme={theme}
        >
          You're at {CABT_fmtPct(score.bookCompleteness)} for Q2. Performance bonus reduces proportionally.
        </Banner>
      )}

      {/* Today's prompts — HERO */}
      <div>
        <SectionLabel theme={theme}>
          <span>Today's prompts</span>
          <span style={{ fontWeight: 500, color: theme.inkMuted, textTransform: 'none', letterSpacing: 0 }}>
            {missingThisMonth.length + noRecentSurvey.length + missingCheckin.length} open
          </span>
        </SectionLabel>
        <Card theme={theme} padding={0}>
          {missingThisMonth.length === 0 && noRecentSurvey.length === 0 && missingCheckin.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: theme.inkMuted, fontSize: 14 }}>
              <Icon name="check" size={28} color={STATUS.green} />
              <div style={{ marginTop: 6 }}>You're caught up. Nice work.</div>
            </div>
          )}
          {missingCheckin.slice(0, 4).map((c, i) => {
            const cadence = c.loggingCadence || 'monthly';
            return (
              <PromptRow
                key={'k-' + c.id}
                theme={theme}
                icon="edit"
                tone="info"
                title={`Log ${cadence === 'weekly' ? "this week's" : "this month's"} check-in for ${c.name}`}
                detail={cadence === 'weekly' ? 'Weekly cadence · narrative' : 'Monthly cadence · narrative'}
                onClick={() => navigate('log-checkin', { clientId: c.id })}
                isLast={false}
              />
            );
          })}
          {missingCheckin.length > 4 && (
            <PromptRow
              key="more-checkins"
              theme={theme}
              icon="chev-r"
              tone="info"
              title={`+ ${missingCheckin.length - 4} more check-ins to log`}
              detail="View all"
              onClick={() => navigate('book', { filter: 'needs-data' })}
              isLast={false}
            />
          )}
          {missingThisMonth.slice(0, 4).map((c, i) => (
            <PromptRow
              key={c.id}
              theme={theme}
              icon="cal"
              tone="warning"
              title={`Log April for ${c.name}`}
              detail="Monthly metrics due"
              onClick={() => navigate('log-metrics', { clientId: c.id })}
              isLast={i === Math.min(missingThisMonth.length, 4) - 1 && noRecentSurvey.length === 0}
            />
          ))}
          {missingThisMonth.length > 4 && (
            <PromptRow
              key="more-metrics"
              theme={theme}
              icon="chev-r"
              tone="info"
              title={`+ ${missingThisMonth.length - 4} more clients missing data`}
              detail="View all"
              onClick={() => navigate('book', { filter: 'needs-data' })}
              isLast={noRecentSurvey.length === 0}
            />
          )}
          {noRecentSurvey.slice(0, 2).map((c, i) => (
            <PromptRow
              key={'s-' + c.id}
              theme={theme}
              icon="star"
              tone="info"
              title={`Collect a survey from ${c.name}`}
              detail={`No response in 6+ months`}
              onClick={() => navigate('log-survey', { clientId: c.id })}
              isLast={i === Math.min(noRecentSurvey.length, 2) - 1}
            />
          ))}
        </Card>
      </div>

      {/* Recent activity */}
      <div>
        <SectionLabel theme={theme}>Recent activity</SectionLabel>
        <Card theme={theme} padding={0}>
          {recentActivity.length === 0 && (
            <div style={{ padding: 16, color: theme.inkMuted, fontSize: 13 }}>Nothing logged yet.</div>
          )}
          {recentActivity.map((a, i) => {
            const c = state.clients.find(cl => cl.id === a.clientId);
            return (
              <ActivityRow
                key={i}
                theme={theme}
                title={`${a.label} · ${c?.name || 'Unknown'}`}
                date={a.kind === 'metric' ? CABT_fmtMonth(a.date) : CABT_fmtDate(a.date)}
                kind={a.kind}
                isLast={i === recentActivity.length - 1}
              />
            );
          })}
        </Card>
      </div>
    </div>
  );
}

function SectionLabel({ theme, children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: theme.inkMuted,
      letterSpacing: 0.6, textTransform: 'uppercase',
      padding: '0 4px 8px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    }}>{children}</div>
  );
}

function PromptRow({ theme, icon, tone, title, detail, onClick, isLast }) {
  const toneColors = {
    warning: STATUS.yellow,
    info:    theme.accent,
    success: STATUS.green,
  };
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', border: 'none', background: 'transparent',
        borderBottom: isLast ? 'none' : `1px solid ${theme.rule}`,
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        minHeight: 56,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: toneColors[tone] + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={16} color={toneColors[tone]} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, lineHeight: 1.3, letterSpacing: -0.1 }}>{title}</div>
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2 }}>{detail}</div>
      </div>
      <Icon name="chev-r" size={16} color={theme.inkMuted} />
    </button>
  );
}

function ActivityRow({ theme, title, date, kind, isLast }) {
  const iconMap = { metric: 'chart', event: 'tag', survey: 'star' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${theme.rule}`,
    }}>
      <Icon name={iconMap[kind]} size={16} color={theme.inkMuted} />
      <div style={{ flex: 1, fontSize: 14, color: theme.ink }}>{title}</div>
      <div style={{ fontSize: 12, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{date}</div>
    </div>
  );
}

// ── My Book ─────────────────────────────────────────────────────────────────
// Bobby 2026-05-05 (final): Dashboard moved out of the Accounts sub-tabs and
// into the left sidebar between Today and Accounts. Accounts is now a plain
// list view again — no internal view toggle.
function CABook({ state, ca, theme, navigate, initialFilter }) {
  const [filter, setFilter] = React.useState(initialFilter || 'all');
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const currentMonth = CABT_currentMonthIso();

  const enriched = myClients.map(c => {
    const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, state.config);
    const lastMetric = state.monthlyMetrics
      .filter(m => m.clientId === c.id)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    const needsData = !state.monthlyMetrics.some(m => m.clientId === c.id && m.month === currentMonth);
    return { client: c, sub, lastMetric, needsData, status: CABT_scoreToStatus(sub.composite) };
  });

  let filtered = enriched;
  if (filter === 'green' || filter === 'yellow' || filter === 'red' || filter === 'gray') {
    filtered = enriched.filter(e => e.status === filter);
  } else if (filter === 'needs-data') {
    filtered = enriched.filter(e => e.needsData);
  }

  // Sort: red > yellow > gray > green
  const sortKey = { red: 0, yellow: 1, gray: 2, green: 3 };
  filtered.sort((a, b) => sortKey[a.status] - sortKey[b.status]);

  const filters = [
    { value: 'all',         label: 'All',        count: enriched.length },
    { value: 'red',         label: 'At risk',    count: enriched.filter(e => e.status === 'red').length },
    { value: 'yellow',      label: 'Watch',      count: enriched.filter(e => e.status === 'yellow').length },
    { value: 'green',       label: 'On track',   count: enriched.filter(e => e.status === 'green').length },
    { value: 'needs-data',  label: 'Needs data', count: enriched.filter(e => e.needsData).length },
  ];

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: theme.bg + 'EE', backdropFilter: 'blur(8px)',
        padding: '8px 16px 12px',
        borderBottom: `1px solid ${theme.rule}`,
      }}>
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none', margin: '0 -16px', padding: '0 16px',
        }}>
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: '8px 14px', height: 36, fontSize: 13, fontWeight: 600,
                background: filter === f.value ? theme.ink : theme.surface,
                color: filter === f.value ? theme.accentInk : theme.ink,
                border: `1px solid ${filter === f.value ? theme.ink : theme.rule}`,
                borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              {f.label} <span style={{ opacity: 0.65, marginLeft: 4 }}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '4px 16px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '60px 0', textAlign: 'center', color: theme.inkMuted }}>
            <Icon name="check" size={36} />
            <div style={{ marginTop: 8, fontSize: 14 }}>No clients match this filter.</div>
          </div>
        )}
        {filtered.map((e, i) => (
          <ClientRow
            key={e.client.id}
            client={e.client}
            sub={e.sub}
            lastMetric={e.lastMetric}
            needsData={e.needsData}
            status={e.status}
            theme={theme}
            onClick={() => navigate('client-detail', { clientId: e.client.id })}
            isLast={i === filtered.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function ClientRow({ client, sub, lastMetric, needsData, status, theme, onClick, isLast }) {
  const score = sub.composite;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 4px', width: '100%',
        background: 'transparent', border: 'none', textAlign: 'left',
        borderBottom: isLast ? 'none' : `1px solid ${theme.rule}`,
        cursor: 'pointer', fontFamily: 'inherit', minHeight: 64,
      }}
    >
      <div style={{
        width: 6, alignSelf: 'stretch', background: STATUS[status],
        borderRadius: 3, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: theme.ink,
          letterSpacing: -0.15, lineHeight: 1.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{client.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: theme.inkMuted }}>
          {needsData ? (
            <span style={{ color: STATUS.yellow, fontWeight: 600 }}>⚠ No data this month</span>
          ) : (
            <span>Last: {lastMetric ? CABT_fmtMonth(lastMetric.month) : '—'}</span>
          )}
          <span>·</span>
          <span>{CABT_fmtMoney(client.monthlyRetainer)}/mo</span>
        </div>
      </div>
      <div style={{
        textAlign: 'right', flexShrink: 0,
        fontSize: 18, fontWeight: 700, color: STATUS[status],
        fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3,
      }}>
        {score != null ? (score * 100).toFixed(0) : '—'}
      </div>
      <Icon name="chev-r" size={16} color={theme.inkMuted} />
    </button>
  );
}

// ── CA Profile / Me tab ────────────────────────────────────────────────────
// Shown when the user taps the "Me" tab in the floating nav. Displays a
// concise summary of the signed-in CA: avatar, name, role badge, email, a
// few book stats, and a sign-out button.
function CAProfile({ state, ca, theme, navigate, profile, onSignOut }) {
  // The active CA might come from local state.cas (demo) or from the joined
  // Supabase profile. Prefer the live profile if present for name/email.
  const displayName = (profile && (profile.display_name || profile.displayName)) || (ca && ca.name) || 'You';
  const email = (profile && profile.email) || (ca && ca.email) || '';
  const role = (profile && profile.role) || 'ca';
  const initials = (displayName || 'YOU').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  // Book stats (only meaningful for CAs with assigned clients).
  // Bobby 2026-05-04: was using snake_case `cancel_date` here while the API
  // serves camelCase `cancelDate`, so the !cancelled filter was a no-op and
  // the count included cancelled clients. Use cancelDate.
  const myClients = ca ? (state.clients || []).filter(c => c.assignedCA === ca.id && !c.cancelDate) : [];
  const totalRetainer = myClients.reduce((s, c) => s + (c.monthlyRetainer || c.monthly_retainer || 0), 0);
  const recentSurveys = ca ? (state.surveys || []).filter(s => s.caId === ca.id || s.ca_id === ca.id).length : 0;

  const roleLabel = (typeof CABT_roleLabel === 'function')
    ? CABT_roleLabel(role, profile && profile.sales_role)
    : role;

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header card with avatar + name + role */}
      <Card theme={theme} padding={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}CC)`,
            color: theme.accentInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: theme.serif, fontWeight: 600, fontSize: 24, letterSpacing: -0.5,
            boxShadow: `0 6px 16px ${theme.accent}55, inset 0 1px 0 rgba(255,255,255,0.3)`,
            flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: theme.serif, fontSize: 22, fontWeight: 600,
              color: theme.ink, letterSpacing: -0.3, lineHeight: 1.15,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{displayName}</div>
            <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{email}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: theme.accent + '18', color: theme.accent,
                padding: '3px 10px', borderRadius: 999,
                fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: theme.accent }}/>
                {roleLabel}
              </span>
              {ca && ca.id && (
                <span style={{
                  marginLeft: 6,
                  fontFamily: theme.mono || 'monospace', fontSize: 11, fontWeight: 600,
                  color: theme.inkSoft, padding: '3px 8px',
                  background: theme.bgElev, borderRadius: 6,
                }}>{ca.id}</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Stats grid — only meaningful when CA has a book */}
      {ca && (
        <Card theme={theme} padding={0}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[
              { label: 'Active clients', value: myClients.length },
              { label: 'Monthly retainer', value: totalRetainer ? '$' + totalRetainer.toLocaleString() : '—' },
              { label: 'Surveys logged', value: recentSurveys },
            ].map((s, i) => (
              <div key={s.label} style={{
                padding: '16px 12px', textAlign: 'center',
                borderRight: i < 2 ? `1px solid ${theme.rule}` : 'none',
              }}>
                <div style={{
                  fontFamily: theme.serif, fontSize: 22, fontWeight: 600,
                  color: theme.ink, letterSpacing: -0.3, lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums',
                }}>{s.value}</div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: theme.inkMuted,
                  marginTop: 4, letterSpacing: 0.5, textTransform: 'uppercase',
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick links */}
      <Card theme={theme} padding={0}>
        {[
          { icon: 'book', label: 'My accounts', desc: 'View all clients in your book', to: 'book' },
          { icon: 'chart', label: 'Scorecard', desc: 'Quarterly composite + sub-scores', to: 'scorecard' },
        ].map((it, i, arr) => (
          <button
            key={it.to}
            onClick={() => navigate(it.to)}
            className="cabt-btn-press"
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              width: '100%', padding: '14px 16px',
              background: 'transparent', border: 'none',
              borderBottom: i < arr.length - 1 ? `1px solid ${theme.rule}` : 'none',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: theme.accent + '15', color: theme.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Icon name={it.icon} size={18}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{it.label}</div>
              <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 1 }}>{it.desc}</div>
            </div>
            <Icon name="chev-r" size={16} color={theme.inkMuted}/>
          </button>
        ))}
      </Card>

      {/* Sign out */}
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

      <div style={{
        textAlign: 'center', fontSize: 11, color: theme.inkMuted,
        letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600,
        marginTop: 4,
      }}>
        gsTeam Scoreboard
      </div>
    </div>
  );
}

Object.assign(window, { CAHome, CABook, CAProfile, ClientRow, SectionLabel });

// ca-app.jsx — CA persona screens

// ── Helpers ─────────────────────────────────────────────────────────────────

// Composite score history per client — last N months, monotonic windowed.
// For each month, we recompute clientSubScores using only metrics ending at that month.
function caClientHistory(client, metrics, surveys, config, monthsBack = 6) {
  const today = new Date();
  const points = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthIso = d.toISOString().slice(0, 7) + '-01';
    const restricted = metrics.filter(m => m.month <= monthIso);
    const restrictedSurveys = surveys.filter(s => s.date <= monthIso + 'T23:59:59');
    const sub = CABT_clientSubScores(client, restricted, restrictedSurveys, config);
    points.push({ month: monthIso, score: sub.composite });
  }
  return points;
}

// Book-health distribution over the last N months for a set of clients.
// Returns array of { month, green, yellow, red, gray } counts.
function caBookHistory(clients, metrics, surveys, config, monthsBack = 6) {
  const today = new Date();
  const out = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthIso = d.toISOString().slice(0, 7) + '-01';
    const restricted = metrics.filter(m => m.month <= monthIso);
    const restrictedSurveys = surveys.filter(s => s.date <= monthIso + 'T23:59:59');
    const buckets = { green: 0, yellow: 0, red: 0, gray: 0 };
    clients.forEach(c => {
      const sub = CABT_clientSubScores(c, restricted, restrictedSurveys, config);
      buckets[CABT_scoreToStatus(sub.composite)]++;
    });
    out.push({ month: monthIso, ...buckets });
  }
  return out;
}

// Cadence-driven prompts for Today.
// Returns sorted array of { key, icon, tone, title, detail, onClick, urgency }.
function caTodayPrompts({ clients, state, navigate }) {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const currentMonth = CABT_currentMonthIso();
  const monthLabel = today.toLocaleDateString('en-US', { month: 'long' });

  const prompts = [];

  // Rule 1: monthly metrics due
  clients.forEach(c => {
    const has = state.monthlyMetrics.some(m => m.clientId === c.id && m.month === currentMonth);
    if (has) return;
    const escalate = dayOfMonth >= 25;
    prompts.push({
      key: `metric-${c.id}`,
      icon: 'cal',
      tone: escalate ? 'warning' : 'info',
      title: `Log ${monthLabel} for ${c.name}`,
      detail: escalate ? `Due in ${daysInMonth - dayOfMonth + 1}d` : 'Monthly metrics',
      onClick: () => navigate('log-metrics', { clientId: c.id }),
      urgency: escalate ? 100 + (dayOfMonth - 24) : 50,
    });
  });

  // Rule 2: quarterly survey (no survey in 90+ days)
  const surveyCutoff = new Date(today); surveyCutoff.setDate(surveyCutoff.getDate() - 90);
  clients.forEach(c => {
    const cSurveys = state.surveys
      .filter(s => s.clientId === c.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const last = cSurveys[0];
    if (last && new Date(last.date) >= surveyCutoff) return;
    const daysSince = last
      ? Math.floor((today - new Date(last.date)) / (1000 * 60 * 60 * 24))
      : null;
    prompts.push({
      key: `survey-${c.id}`,
      icon: 'star',
      tone: daysSince && daysSince > 180 ? 'warning' : 'info',
      title: `Collect a survey from ${c.name}`,
      detail: daysSince ? `Last survey ${daysSince}d ago` : 'No surveys yet',
      onClick: () => navigate('log-survey', { clientId: c.id }),
      urgency: daysSince === null ? 60 : Math.min(95, 60 + (daysSince - 90) / 4),
    });
  });

  // Rule 3: 30-day post-signup review (signDate 28-32 days ago, no event yet)
  clients.forEach(c => {
    if (!c.signDate) return;
    const signed = new Date(c.signDate);
    const daysSince = Math.floor((today - signed) / (1000 * 60 * 60 * 24));
    if (daysSince < 28 || daysSince > 32) return;
    const hasEvent = state.growthEvents.some(e => e.clientId === c.id);
    if (hasEvent) return;
    prompts.push({
      key: `signup-${c.id}`,
      icon: 'tag',
      tone: 'warning',
      title: `30-day check-in for ${c.name}`,
      detail: `Signed ${daysSince}d ago — log review event`,
      onClick: () => navigate('log-event', { clientId: c.id }),
      urgency: 90,
    });
  });

  return prompts.sort((a, b) => b.urgency - a.urgency);
}

// ── CA Home ─────────────────────────────────────────────────────────────────
function CAHome({ state, ca, theme, navigate }) {
  // Bonus + book health stay assigned-only (per-CA bonus separation).
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const score = CABT_caScorecard(ca, state);
  const status = CABT_scoreToStatus(score.composite);
  const hasData = myClients.length > 0;

  // Health distribution (assigned-only)
  const buckets = { green: 0, yellow: 0, red: 0, gray: 0 };
  myClients.forEach(c => {
    const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, state.config);
    buckets[CABT_scoreToStatus(sub.composite)]++;
  });

  // Cadence-driven prompts
  const prompts = caTodayPrompts({ clients: myClients, state, navigate });
  const visiblePrompts = prompts.slice(0, 6);

  // Recent activity (logged by this CA)
  const recentActivity = [
    ...state.monthlyMetrics
      .filter(m => myClients.some(c => c.id === m.clientId))
      .map(m => ({ kind: 'metric', date: m.month, item: m, label: 'Monthly metrics', clientId: m.clientId })),
    ...state.growthEvents
      .filter(e => e.loggedBy === ca.id)
      .map(e => ({ kind: 'event', date: e.date, item: e, label: e.eventType || 'Event', clientId: e.clientId })),
    ...state.surveys
      .filter(s => s.submittedBy === ca.id)
      .map(s => ({ kind: 'survey', date: s.date, item: s, label: 'Survey', clientId: s.clientId })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const bonusColor = STATUS[status];
  const projected = score.finalPayout;

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero card — restructured: greeting, big projected $, ring + breakdown */}
      <div style={{
        background: theme.accent, color: theme.accentInk,
        borderRadius: theme.radius + 4, padding: '20px 22px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -50, right: -50, width: 200, height: 200,
          borderRadius: '50%', background: theme.gold, opacity: 0.18,
        }} />
        <div style={{
          fontSize: 12, opacity: 0.75, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600,
          position: 'relative', zIndex: 1,
        }}>
          Hey {ca.name.split(' ')[0]} · Q2 2026
        </div>
        {hasData ? (
          <React.Fragment>
            <div style={{
              fontFamily: theme.serif, fontSize: 38, fontWeight: 600,
              color: theme.gold, letterSpacing: -0.8, lineHeight: 1.05,
              marginTop: 10, position: 'relative', zIndex: 1,
            }}>
              {CABT_fmtMoney(projected)}
            </div>
            <div style={{
              fontSize: 13, opacity: 0.85, marginTop: 4,
              position: 'relative', zIndex: 1,
            }}>
              projected this quarter · of {CABT_fmtMoney(score.maxPayout)} max
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16, marginTop: 16,
              position: 'relative', zIndex: 1,
            }}>
              <ScoreRing
                value={score.composite}
                size={84} stroke={6}
                color={bonusColor}
                bg="rgba(255,255,255,0.12)"
                label={
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: theme.accentInk, fontVariantNumeric: 'tabular-nums' }}>
                      {(score.composite * 100).toFixed(0)}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 0.6, marginTop: 2 }}>COMPOSITE</div>
                  </div>
                }
              />
              <div style={{ flex: 1, fontSize: 13, opacity: 0.9, lineHeight: 1.6 }}>
                <div>Performance <span style={{ float: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{(score.performance*100).toFixed(0)}</span></div>
                <div>Retention <span style={{ float: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{(score.retention*100).toFixed(0)}</span></div>
                <div>Growth <span style={{ float: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{(score.growth*100).toFixed(0)}</span></div>
              </div>
            </div>
          </React.Fragment>
        ) : (
          <div style={{ position: 'relative', zIndex: 1, marginTop: 12 }}>
            <div style={{
              fontFamily: theme.serif, fontSize: 22, fontWeight: 500,
              color: theme.accentInk, letterSpacing: -0.3, lineHeight: 1.25,
            }}>
              No clients assigned yet.
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6, lineHeight: 1.5 }}>
              When admin assigns accounts to you, your projected bonus + book health will show here.
            </div>
          </div>
        )}
      </div>

      {/* Book health chips (assigned-only) */}
      {hasData && (
        <div>
          <SectionLabel theme={theme}>Book health · {myClients.length} {myClients.length === 1 ? 'client' : 'clients'}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { key: 'green',  count: buckets.green,  label: 'On track' },
              { key: 'yellow', count: buckets.yellow, label: 'Watch' },
              { key: 'red',    count: buckets.red,    label: 'At risk' },
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
      )}

      {/* Data completeness alert */}
      {hasData && score.bookCompleteness < 0.80 && (
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

      {/* Today's prompts — cadence-driven */}
      {hasData && (
        <div>
          <SectionLabel theme={theme}>
            <span>Today's prompts</span>
            <span style={{ fontWeight: 500, color: theme.inkMuted, textTransform: 'none', letterSpacing: 0 }}>
              {prompts.length} open
            </span>
          </SectionLabel>
          <Card theme={theme} padding={0}>
            {prompts.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: theme.inkMuted, fontSize: 14 }}>
                <Icon name="check" size={28} color={STATUS.green} />
                <div style={{ marginTop: 6 }}>You're caught up. Nice work.</div>
              </div>
            )}
            {visiblePrompts.map((p, i) => (
              <PromptRow
                key={p.key}
                theme={theme}
                icon={p.icon}
                tone={p.tone}
                title={p.title}
                detail={p.detail}
                onClick={p.onClick}
                isLast={i === visiblePrompts.length - 1 && prompts.length <= 6}
              />
            ))}
            {prompts.length > 6 && (
              <PromptRow
                key="more"
                theme={theme}
                icon="chev-r"
                tone="info"
                title={`+ ${prompts.length - 6} more`}
                detail="View all in Accounts"
                onClick={() => navigate('book', { filter: 'needs-data' })}
                isLast={true}
              />
            )}
          </Card>
        </div>
      )}

      {/* Recent activity */}
      {hasData && (
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
      )}
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

// ── Sparkline (composite score history) ─────────────────────────────────────
function Sparkline({ points, width = 64, height = 22, color, theme }) {
  // points: [{ month, score }] — score may be null
  const valid = points.filter(p => p.score != null);
  if (valid.length < 2) {
    return (
      <div style={{
        width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: theme.inkMuted, fontWeight: 600, letterSpacing: 0.3,
      }}>—</div>
    );
  }
  const min = 0, max = 1;
  const stepX = width / (points.length - 1);
  const path = points.map((p, i) => {
    const x = i * stepX;
    const y = p.score == null ? height / 2 : height - ((p.score - min) / (max - min)) * height;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const lastValid = valid[valid.length - 1];
  const lastX = (points.length - 1) * stepX;
  const lastY = height - ((lastValid.score - min) / (max - min)) * height;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

// ── Book history stacked bar (over last N months) ───────────────────────────
function BookHistoryChart({ history, theme, totalLabel }) {
  const maxN = Math.max(1, ...history.map(h => h.green + h.yellow + h.red + h.gray));
  return (
    <Card theme={theme} padding={14}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.ink, letterSpacing: -0.1 }}>
          Book health · last 6 months
        </div>
        <div style={{ fontSize: 11, color: theme.inkMuted }}>{totalLabel}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 90 }}>
        {history.map((h, i) => {
          const total = h.green + h.yellow + h.red + h.gray;
          const fullH = total > 0 ? (total / maxN) * 80 + 4 : 4;
          const seg = (n) => total > 0 ? (n / total) * fullH : 0;
          const d = new Date(h.month + 'T12:00:00');
          const isCurrent = i === history.length - 1;
          return (
            <div key={h.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: '100%', height: fullH,
                display: 'flex', flexDirection: 'column-reverse',
                borderRadius: 3, overflow: 'hidden',
                opacity: total === 0 ? 0.3 : 1,
                outline: isCurrent ? `1px solid ${theme.ink}` : 'none',
              }}>
                {h.green  > 0 && <div style={{ height: seg(h.green),  background: STATUS.green }}  title={`${h.green} on track`}/>}
                {h.yellow > 0 && <div style={{ height: seg(h.yellow), background: STATUS.yellow }} title={`${h.yellow} watch`}/>}
                {h.red    > 0 && <div style={{ height: seg(h.red),    background: STATUS.red }}    title={`${h.red} at risk`}/>}
                {h.gray   > 0 && <div style={{ height: seg(h.gray),   background: STATUS.gray }}   title={`${h.gray} no data`}/>}
                {total === 0 && <div style={{ height: fullH, background: theme.rule }}/>}
              </div>
              <div style={{
                fontSize: 9, color: isCurrent ? theme.ink : theme.inkMuted,
                fontWeight: isCurrent ? 700 : 600, letterSpacing: 0.3,
              }}>
                {d.toLocaleDateString('en-US', { month: 'short' })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 10, color: theme.inkMuted }}>
        {[
          { label: 'On track', color: STATUS.green },
          { label: 'Watch',    color: STATUS.yellow },
          { label: 'At risk',  color: STATUS.red },
          { label: 'No data',  color: STATUS.gray },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color }}/>
            {l.label}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Accounts (formerly My Book) ─────────────────────────────────────────────
function CABook({ state, ca, theme, navigate, initialFilter }) {
  const [filter, setFilter] = React.useState(initialFilter || 'all');
  const [view, setView] = React.useState('all'); // 'all' | 'mine' | CA-id

  // Visibility scope (CAs see ALL accounts; bonus math elsewhere stays per-CA)
  const allActive = state.clients.filter(c => !c.cancelDate);
  const visibleClients = view === 'all'
    ? allActive
    : view === 'mine'
    ? allActive.filter(c => c.assignedCA === ca.id)
    : allActive.filter(c => c.assignedCA === view);

  const currentMonth = CABT_currentMonthIso();

  const enriched = visibleClients.map(c => {
    const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, state.config);
    const lastMetric = state.monthlyMetrics
      .filter(m => m.clientId === c.id)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    const needsData = !state.monthlyMetrics.some(m => m.clientId === c.id && m.month === currentMonth);
    const history = caClientHistory(c, state.monthlyMetrics, state.surveys, state.config, 6);
    const ownerCA = state.cas.find(x => x.id === c.assignedCA);
    return {
      client: c, sub, lastMetric, needsData, history,
      status: CABT_scoreToStatus(sub.composite),
      ownerName: ownerCA?.name || '—',
      isMine: c.assignedCA === ca.id,
    };
  });

  let filtered = enriched;
  if (filter === 'green' || filter === 'yellow' || filter === 'red') {
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

  // Book history chart over visible scope
  const bookHistory = caBookHistory(visibleClients, state.monthlyMetrics, state.surveys, state.config, 6);
  const totalLabel = view === 'all'
    ? `${visibleClients.length} accounts`
    : view === 'mine'
    ? `Your book · ${visibleClients.length}`
    : `${state.cas.find(c => c.id === view)?.name || ''} · ${visibleClients.length}`;

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Sticky filter row */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: theme.bg + 'EE', backdropFilter: 'blur(8px)',
        padding: '8px 16px 12px',
        borderBottom: `1px solid ${theme.rule}`,
      }}>
        {/* View selector — All / My book / per-CA */}
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none', margin: '0 -16px 8px', padding: '0 16px',
        }}>
          {[
            { value: 'all',  label: 'All accounts' },
            { value: 'mine', label: 'My book' },
            ...state.cas.filter(c => c.id !== ca.id && c.active).map(c => ({ value: c.id, label: c.name.split(' ')[0] + "'s" })),
          ].map(v => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              style={{
                padding: '6px 12px', height: 30, fontSize: 12, fontWeight: 600,
                background: view === v.value ? theme.accent : 'transparent',
                color: view === v.value ? theme.accentInk : theme.inkSoft,
                border: `1px solid ${view === v.value ? theme.accent : theme.rule}`,
                borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Status filter row */}
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

      {/* Book history chart */}
      <div style={{ padding: '12px 16px 4px' }}>
        <BookHistoryChart history={bookHistory} theme={theme} totalLabel={totalLabel} />
      </div>

      {/* Account list */}
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
            history={e.history}
            ownerName={e.ownerName}
            isMine={e.isMine}
            theme={theme}
            onClick={() => navigate('client-detail', { clientId: e.client.id })}
            isLast={i === filtered.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function ClientRow({ client, sub, lastMetric, needsData, status, history, ownerName, isMine, theme, onClick, isLast }) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            fontSize: 15, fontWeight: 600, color: theme.ink,
            letterSpacing: -0.15, lineHeight: 1.25,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>{client.name}</div>
          {!isMine && ownerName !== '—' && (
            <span style={{
              fontSize: 9, color: theme.inkMuted, background: theme.rule,
              padding: '2px 6px', borderRadius: 4, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0,
            }}>{ownerName.split(' ')[0]}</span>
          )}
        </div>
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
      <Sparkline points={history} color={STATUS[status]} theme={theme} />
      <div style={{
        textAlign: 'right', flexShrink: 0,
        fontSize: 18, fontWeight: 700, color: STATUS[status],
        fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3,
        minWidth: 28,
      }}>
        {score != null ? (score * 100).toFixed(0) : '—'}
      </div>
      <Icon name="chev-r" size={16} color={theme.inkMuted} />
    </button>
  );
}

// ── Me / Profile ────────────────────────────────────────────────────────────
function CAProfile({ state, ca, theme, navigate, profile, onSignOut }) {
  if (!ca) {
    return (
      <div style={{ padding: 24, color: theme.inkMuted, fontSize: 14 }}>
        No CA profile loaded.
      </div>
    );
  }

  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const myMetrics = state.monthlyMetrics.filter(m => myClients.some(c => c.id === m.clientId));
  const mySurveys = state.surveys.filter(s => s.submittedBy === ca.id);
  const myEvents = state.growthEvents.filter(e => e.loggedBy === ca.id);
  const score = CABT_caScorecard(ca, state);
  const status = CABT_scoreToStatus(score.composite);

  // Display values — prefer authed Supabase profile when available
  const displayEmail = (profile && profile.email) || ca.email || '—';
  const displayName  = (profile && profile.full_name) || ca.name;
  const initials = displayName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Identity card */}
      <Card theme={theme} padding={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28, background: theme.accent, color: theme.accentInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: theme.serif, fontWeight: 700, fontSize: 22, letterSpacing: -0.5,
            flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: theme.serif, fontSize: 22, fontWeight: 600, color: theme.ink, letterSpacing: -0.3, lineHeight: 1.15 }}>{displayName}</div>
            <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayEmail}</div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StatusPill status={status} size="sm" />
              <span style={{ fontSize: 11, color: theme.inkMuted, fontWeight: 600 }}>Composite {(score.composite*100).toFixed(0)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Account details */}
      <div>
        <SectionLabel theme={theme}>Account</SectionLabel>
        <Card theme={theme} padding={0}>
          <ProfileRow theme={theme} label="ID" value={ca.id} />
          <ProfileRow theme={theme} label="Role" value={ca.role || 'CA'} />
          <ProfileRow theme={theme} label="Pay structure" value={ca.payStructure || '—'} />
          <ProfileRow theme={theme} label="Annual equiv." value={ca.annualEquivalent ? CABT_fmtMoney(ca.annualEquivalent) : '—'} />
          <ProfileRow theme={theme} label="Last reviewed" value={ca.lastReviewed ? CABT_fmtDate(ca.lastReviewed) : '—'} />
          <ProfileRow theme={theme} label="Next review" value={ca.nextReview ? CABT_fmtDate(ca.nextReview) : '—'} isLast />
        </Card>
      </div>

      {/* Activity stats */}
      <div>
        <SectionLabel theme={theme}>Activity</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <KPI theme={theme} label="Assigned clients" value={myClients.length} />
          <KPI theme={theme} label="Metrics rows" value={myMetrics.length} />
          <KPI theme={theme} label="Surveys" value={mySurveys.length} />
          <KPI theme={theme} label="Events" value={myEvents.length} />
        </div>
      </div>

      {/* Bonus snapshot */}
      <Card theme={theme} padding={20}>
        <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>Q2 2026 · Projected payout</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <div style={{ fontFamily: theme.serif, fontSize: 32, fontWeight: 600, color: theme.ink, letterSpacing: -0.6, lineHeight: 1 }}>
            {CABT_fmtMoney(score.finalPayout)}
          </div>
          <div style={{ fontSize: 13, color: theme.inkMuted }}>of {CABT_fmtMoney(score.maxPayout)} max</div>
        </div>
        <div style={{ marginTop: 12, height: 6, background: theme.rule, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${score.maxPayout > 0 ? (score.finalPayout / score.maxPayout * 100) : 0}%`,
            height: '100%', background: STATUS[status],
          }}/>
        </div>
        <button
          onClick={() => navigate('scorecard')}
          style={{
            marginTop: 12, background: 'transparent', border: 'none', padding: 0,
            color: theme.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', textDecoration: 'underline',
          }}
        >See full scorecard →</button>
      </Card>

      {onSignOut && (
        <Button theme={theme} variant="secondary" fullWidth onClick={onSignOut}>Sign out</Button>
      )}
    </div>
  );
}

function ProfileRow({ theme, label, value, isLast }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${theme.rule}`,
      gap: 12,
    }}>
      <span style={{ fontSize: 12, color: theme.inkMuted, fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 14, color: theme.ink, fontWeight: 500, textAlign: 'right',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</span>
    </div>
  );
}

Object.assign(window, {
  CAHome, CABook, CAProfile,
  ClientRow, SectionLabel, PromptRow, ActivityRow,
  Sparkline, BookHistoryChart, ProfileRow,
  caClientHistory, caBookHistory, caTodayPrompts,
});

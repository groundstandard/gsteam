// app-shell.jsx — top-level App: role switcher, navigation, sync banner, tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "athletic",
  "accentColor": "#E8FF5A",
  "scorecardViz": "bars",
  "showFrame": true,
  "density": "regular",
  "fontScale": 1.0,
  "demoOffline": false,
  "showSavedToast": true,
  "apiMode": "local",
  "apiUrl": ""
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [state, setState] = React.useState(() => CABT_loadState());
  const [authedSession, setAuthedSession] = React.useState(null);
  const [authedProfile, setAuthedProfile] = React.useState(null);
  const [loadingLive, setLoadingLive] = React.useState(false);
  const [role, setRole] = React.useState('CA'); // 'CA' | 'Sales' | 'Admin'
  const [activeUserId, setActiveUserId] = React.useState('CA-01');
  const [route, setRoute] = React.useState({ name: 'home', params: {} });
  const [history, setHistory] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [pendingSync, setPendingSync] = React.useState(0);
  const [isOffline, setIsOffline] = React.useState(false);
  const [logSheet, setLogSheet] = React.useState(false);

  React.useEffect(() => { if (t.apiMode === 'local') CABT_saveState(state); }, [state, t.apiMode]);
  React.useEffect(() => { setIsOffline(t.demoOffline); }, [t.demoOffline]);

  // Sync apiMode tweak → api.jsx mode key
  React.useEffect(() => { CABT_setApiMode(t.apiMode); }, [t.apiMode]);

  // When in supabase mode and authed, fetch real state
  React.useEffect(() => {
    if (t.apiMode !== 'supabase' || !authedSession) return;
    let cancelled = false;
    setLoadingLive(true);
    CABT_api.loadState().then(s => {
      if (cancelled) return;
      setState(prev => ({ ...prev, ...s }));
      // Promote profile role into UI role
      if (s.role === 'owner' || s.role === 'admin') setRole('Admin');
      else if (s.role === 'sales') setRole('Sales');
      else setRole('CA');
      setLoadingLive(false);
    }).catch(err => {
      console.error('Live load failed:', err);
      setLoadingLive(false);
    });
    return () => { cancelled = true; };
  }, [t.apiMode, authedSession]);

  // Theme override: clone selected theme and override accent
  const baseTheme = THEMES[t.theme] || THEMES.editorial;
  const theme = { ...baseTheme, accent: t.accentColor || baseTheme.accent };

  const navigate = (name, params = {}) => {
    if (name === 'back') {
      setHistory(h => {
        if (h.length === 0) { setRoute({ name: 'home', params: {} }); return h; }
        const prev = h[h.length - 1];
        setRoute(prev);
        return h.slice(0, -1);
      });
      return;
    }
    setHistory(h => [...h, route]);
    setRoute({ name, params });
  };

  const showToast = (msg) => {
    if (!t.showSavedToast) return;
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const queueOrApply = (mutator, msg) => {
    if (isOffline) {
      setPendingSync(n => n + 1);
      // Still apply locally
      setState(mutator);
      showToast('Saved locally · will sync');
    } else {
      setState(mutator);
      showToast(msg || 'Saved ✓');
    }
    navigate('back');
  };

  // Action handlers
  const submitMetrics = (row, isEdit) => queueOrApply(s => ({
    ...s, monthlyMetrics: isEdit ? s.monthlyMetrics.map(m => m.id === row.id ? row : m) : [...s.monthlyMetrics, row],
  }), 'Monthly metrics saved');
  const submitEvent = (row) => queueOrApply(s => ({ ...s, growthEvents: [...s.growthEvents, row] }), 'Event saved');
  const submitSurvey = (row) => queueOrApply(s => ({ ...s, surveys: [...s.surveys, row] }), 'Survey saved');
  const submitContract = (row) => queueOrApply(s => ({ ...s, clients: [...s.clients, row] }), 'Contract logged');
  const submitClient = (row) => queueOrApply(s => ({
    ...s,
    clients: [...s.clients, row],
    // If this was approved from a Stripe-pending row, mark it approved
    pendingClients: (s.pendingClients || []).map(p =>
      p.stripeCustomerId && p.stripeCustomerId === row.stripeCustomerId
        ? { ...p, status: 'approved', approvedAt: CABT_todayIso(), approvedAs: row.id }
        : p
    ),
  }), 'Client added');
  const submitAdjustment = (row) => queueOrApply(s => ({ ...s, adjustments: [...s.adjustments, row] }), 'Adjustment submitted');
  const approveAdj = (id) => { setState(s => ({ ...s, adjustments: s.adjustments.map(a => a.id === id ? { ...a, status: 'Paid' } : a) })); showToast('Approved'); };
  const rejectAdj = (id) => { setState(s => ({ ...s, adjustments: s.adjustments.map(a => a.id === id ? { ...a, status: 'Rejected' } : a) })); showToast('Rejected'); };
  const assignCA = (cid, caId) => { setState(s => ({ ...s, clients: s.clients.map(c => c.id === cid ? { ...c, assignedCA: caId } : c) })); showToast('CA assigned'); };
  const updateConfig = (cfg) => { setState(s => ({ ...s, config: cfg })); showToast('Config saved'); navigate('back'); };
  const syncNow = () => { setPendingSync(0); setIsOffline(false); setTweak('demoOffline', false); showToast('Synced ✓'); };
  const resetData = () => { CABT_resetState(); setState(CABT_loadState()); showToast('Reset to seed'); };

  // Active user
  const activeCA = state.cas.find(c => c.id === activeUserId);
  const activeRep = state.sales.find(s => s.id === activeUserId);

  // Resolve when role changes
  React.useEffect(() => {
    if (role === 'CA' && !state.cas.some(c => c.id === activeUserId)) setActiveUserId('CA-01');
    if (role === 'Sales' && !state.sales.some(s => s.id === activeUserId)) setActiveUserId('AE-01');
    setRoute({ name: 'home', params: {} });
    setHistory([]);
  }, [role]);

  // Title
  const titleFor = (r) => {
    if (role === 'CA') {
      return ({
        'home': 'Today',
        'book': 'Accounts',
        'profile': 'Me',
        'client-detail': 'Client',
        'log-metrics': 'Log Metrics',
        'log-event': 'Log Event',
        'log-survey': 'Survey',
        'scorecard': 'Scorecard',
      })[r.name] || 'CA';
    }
    if (role === 'Sales') {
      return ({
        'home': 'Sales',
        'commissions': 'Commissions',
        'log-contract': 'New Contract',
        'log-adjustment': 'Adjustment',
      })[r.name] || 'Sales';
    }
    return ({
      'home': 'Approvals',
      'edits': 'Edit Requests',
      'reviews': 'Reviews Inbox',
      'bonus': 'Annual Bonus',
      'revenue': 'Revenue Ledger',
      'clients': 'Client Rollup',
      'client-calc': 'Client Calc',
      'add-client': 'Add Client',
      'pending-clients': 'Pending Clients',
      'questions': 'Open Questions',
      'config': 'Config',
      'roster': 'Roster',
      'more': 'More',
    })[r.name] || 'Admin';
  };

  // Render content
  const renderContent = () => {
    if (role === 'CA') {
      const ca = activeCA || state.cas[0];
      switch (route.name) {
        case 'home': return <CAHome state={state} ca={ca} theme={theme} navigate={navigate} />;
        case 'book': return <CABook state={state} ca={ca} theme={theme} navigate={navigate} initialFilter={route.params.filter}/>;
        case 'client-detail': return <ClientDetail state={state} ca={ca} theme={theme} clientId={route.params.clientId} navigate={navigate}/>;
        case 'log-metrics': return <LogMetricsForm state={state} ca={ca} theme={theme} presetClientId={route.params.clientId} editingId={route.params.editingId} navigate={navigate} onSubmit={submitMetrics}/>;
        case 'log-event': return <LogEventForm state={state} ca={ca} theme={theme} presetClientId={route.params.clientId} navigate={navigate} onSubmit={submitEvent}/>;
        case 'log-survey': return <LogSurveyForm state={state} ca={ca} theme={theme} presetClientId={route.params.clientId} navigate={navigate} onSubmit={submitSurvey}/>;
        case 'scorecard': return <CAScorecard state={state} ca={ca} theme={theme} viz={t.scorecardViz}/>;
        case 'profile': return <CAProfile state={state} ca={ca} theme={theme} navigate={navigate} profile={authedProfile} onSignOut={t.apiMode === 'supabase' && authedProfile ? async () => { await CABT_signOut(); setAuthedSession(null); setAuthedProfile(null); } : null}/>;
        default: return null;
      }
    }
    if (role === 'Sales') {
      const rep = activeRep || state.sales[0];
      switch (route.name) {
        case 'home': return <SalesHome state={state} rep={rep} theme={theme} navigate={navigate}/>;
        case 'commissions': return <SalesCommissions state={state} rep={rep} theme={theme}/>;
        case 'log-contract': return <LogContractForm state={state} rep={rep} theme={theme} navigate={navigate} onSubmit={submitContract}/>;
        case 'log-adjustment': return <LogAdjustmentForm state={state} rep={rep} theme={theme} isAdmin={false} navigate={navigate} onSubmit={submitAdjustment}/>;
        default: return null;
      }
    }
    // Admin
    switch (route.name) {
      case 'home':        return <AdminApprovals state={state} theme={theme} onApprove={approveAdj} onReject={rejectAdj} onAssignCA={assignCA}/>;
      case 'edits':       return <AdminEditApprovals state={state} theme={theme}/>;
      case 'reviews':     return <AdminReviewsInbox state={state} theme={theme}/>;
      case 'bonus':       return <AdminAnnualBonus state={state} theme={theme}/>;
      case 'revenue':     return <AdminRevenueLedger state={state} theme={theme}/>;
      case 'clients':         return <AdminClientRollup state={state} theme={theme} navigate={navigate}/>;
      case 'client-calc':      return <AdminClientCalc state={state} theme={theme} clientId={route.params.clientId} navigate={navigate}/>;
      case 'add-client':       return <AdminAddClient state={state} theme={theme} navigate={navigate} onSubmit={submitClient} presetFromStripe={route.params.presetFromStripe}/>;
      case 'pending-clients':  return <AdminPendingClients state={state} theme={theme} navigate={navigate}/>;
      case 'questions':   return <AdminOpenQuestions state={state} theme={theme}/>;
      case 'config':      return <AdminConfig state={state} theme={theme} onUpdate={updateConfig}/>;
      case 'roster':      return <AdminRoster state={state} theme={theme}/>;
      case 'more':        return <AdminMore theme={theme} navigate={navigate}/>;
      default: return null;
    }
  };

  // Tab bar
  const tabs = role === 'CA'
    ? [
        { name: 'home', icon: 'home', label: 'Today' },
        { name: 'book', icon: 'book', label: 'Accounts' },
        { name: 'log-picker', icon: 'plus', label: 'Log', primary: true },
        { name: 'scorecard', icon: 'chart', label: 'Score' },
        { name: 'profile', icon: 'user', label: 'Me' },
      ]
    : role === 'Sales'
    ? [
        { name: 'home', icon: 'home', label: 'Home' },
        { name: 'commissions', icon: 'cash', label: 'Commissions' },
        { name: 'log-contract', icon: 'plus', label: 'Contract', primary: true },
        { name: 'log-adjustment', icon: 'edit', label: 'Adjust' },
      ]
    : [
        { name: 'home',    icon: 'shield', label: 'Approvals' },
        { name: 'bonus',   icon: 'cash',   label: 'Bonus' },
        { name: 'revenue', icon: 'chart',  label: 'Revenue' },
        { name: 'clients', icon: 'book',   label: 'Clients' },
        { name: 'more',    icon: 'cog',    label: 'More' },
      ];

  // App body — used both inside and outside the iPhone frame
  const Body = ({ width, height, isPhone }) => (
    <div style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.ink,
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: theme.sans, fontSize: 14 * t.fontScale,
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        flexShrink: 0, padding: isPhone ? '54px 16px 8px' : '14px 18px 10px',
        background: theme.bg,
        borderBottom: `1px solid ${theme.rule}`,
        position: 'relative', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: theme.accent, color: theme.accentInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: theme.serif, fontWeight: 700, fontSize: 14, letterSpacing: -0.5,
          }}>G</div>
          <div style={{ flex: 1, fontSize: 12, color: theme.inkMuted, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            CA Bonus Tracker
          </div>
          <ThemeToggle
            isDark={t.theme === 'athletic'}
            theme={theme}
            onToggle={() => {
              const next = t.theme === 'athletic' ? 'fintech' : 'athletic';
              setTweak({ theme: next, accentColor: THEMES[next].accent });
            }}
          />
          <RoleSwitcher role={role} onChange={setRole} theme={theme}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{
            fontFamily: theme.serif, fontSize: 28, fontWeight: 600, color: theme.ink,
            letterSpacing: -0.5, lineHeight: 1.1,
          }}>
            {history.length > 0 && (
              <button onClick={() => navigate('back')} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                marginRight: 6, color: theme.inkMuted, verticalAlign: -2,
              }}><Icon name="chev-l" size={22}/></button>
            )}
            {titleFor(route)}
          </div>
          {role === 'CA' && (
            <UserPicker
              value={activeUserId}
              onChange={setActiveUserId}
              users={state.cas.filter(c => c.active)}
              theme={theme}
            />
          )}
          {role === 'Sales' && (
            <UserPicker
              value={activeUserId}
              onChange={setActiveUserId}
              users={state.sales}
              theme={theme}
            />
          )}
        </div>
      </div>

      {/* Sync banner */}
      {(isOffline || pendingSync > 0) && (
        <div style={{
          padding: '8px 16px', background: STATUS.yellow + '20', color: '#8C5A00',
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <Icon name={isOffline ? 'wifi-off' : 'sync'} size={14}/>
          <span style={{ flex: 1 }}>
            {isOffline ? `Offline · ${pendingSync || 0} pending sync` : `${pendingSync} pending sync`}
          </span>
          {!isOffline && pendingSync > 0 && (
            <button onClick={syncNow} style={{ background: 'transparent', border: 'none', color: '#8C5A00', fontWeight: 700, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>Sync now</button>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {renderContent()}
      </div>

      {/* Tab bar */}
      <div style={{
        flexShrink: 0, display: 'flex', justifyContent: 'space-around',
        background: theme.bgElev, borderTop: `1px solid ${theme.rule}`,
        padding: isPhone ? '6px 8px 24px' : '6px 8px 8px',
        position: 'relative', zIndex: 10,
      }}>
        {tabs.map(tb => {
          const active = route.name === tb.name
            || (tb.name === 'log-picker' && (route.name === 'log-metrics' || route.name === 'log-event' || route.name === 'log-survey'));
          return (
            <button
              key={tb.name}
              onClick={() => {
                if (tb.name === 'log-picker') { setLogSheet(true); return; }
                setHistory([]); setRoute({ name: tb.name, params: {} });
              }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '6px 0', background: 'transparent', border: 'none', cursor: 'pointer',
                color: active ? theme.accent : theme.inkMuted, fontFamily: 'inherit',
              }}
            >
              {tb.primary ? (
                <div style={{
                  width: 36, height: 36, borderRadius: 18,
                  background: theme.accent, color: theme.accentInk,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 2,
                }}><Icon name={tb.icon} size={20} stroke={2.2}/></div>
              ) : <Icon name={tb.icon} size={22}/>}
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.2 }}>{tb.label}</span>
            </button>
          );
        })}
      </div>

      {/* Log picker sheet (CA) */}
      {logSheet && role === 'CA' && (
        <LogPickerSheet
          theme={theme}
          onClose={() => setLogSheet(false)}
          onPick={(name) => {
            setLogSheet(false);
            setHistory([]);
            setRoute({ name, params: {} });
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 100, transform: 'translateX(-50%)',
          background: theme.ink, color: theme.bg,
          padding: '10px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 6,
          animation: 'toastIn .25s ease',
        }}>
          <Icon name="check" size={14}/>{toast}
        </div>
      )}
    </div>
  );

  // Layout: phone frame on desktop with margins, full-bleed on small screens
  const [vw, setVw] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  const useFrame = t.showFrame && vw >= 720;
  const isTablet = vw >= 720 && vw < 1100;

  // Supabase mode requires a signed-in session before rendering the app
  if (t.apiMode === 'supabase' && !authedSession) {
    return (
      <AuthGate
        theme={theme}
        onAuthed={(sess, prof) => { setAuthedSession(sess); setAuthedProfile(prof); }}
      />
    );
  }
  if (t.apiMode === 'supabase' && loadingLive) {
    return (
      <div style={{
        minHeight: '100vh', background: theme.bg, color: theme.inkMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: theme.sans, fontSize: 13,
      }}>Loading your book…</div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: useFrame
        ? (t.theme === 'athletic' ? '#06080C' : t.theme === 'fintech' ? '#EEF1F5' : '#E8E2D5')
        : theme.bg,
      backgroundImage: useFrame
        ? (t.theme === 'athletic'
            ? `radial-gradient(circle at 30% 20%, rgba(232,255,90,0.05), transparent 55%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.03), transparent 60%)`
            : t.theme === 'fintech'
            ? `radial-gradient(circle at 30% 20%, rgba(79,70,229,0.05), transparent 55%), radial-gradient(circle at 80% 80%, rgba(15,23,42,0.04), transparent 60%)`
            : `radial-gradient(circle at 30% 20%, rgba(14,26,53,0.04), transparent 50%), radial-gradient(circle at 80% 80%, rgba(181,137,74,0.06), transparent 60%)`)
        : 'none',
      display: 'flex', alignItems: useFrame ? 'center' : 'stretch',
      justifyContent: 'center',
      fontFamily: theme.sans,
      padding: useFrame ? '40px 20px' : 0,
    }}>
      <style>{`
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes sheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes scrimIn { from { opacity: 0; } to { opacity: 1; } }
        body { margin: 0; }
        * { box-sizing: border-box; }
        input, select, button, textarea { font-family: inherit; }
      `}</style>

      {useFrame ? (
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexDirection: isTablet ? 'column' : 'row' }}>
          <IOSDevice width={402} height={874} dark={t.theme === 'athletic'}>
            <Body width={402} height={874} isPhone={true}/>
          </IOSDevice>
          <DesktopAside theme={theme} state={state} role={role} onResetData={resetData}/>
        </div>
      ) : (
        <div style={{ width: '100%', height: '100vh', maxHeight: '100vh' }}>
          <Body width="100%" height="100vh" isPhone={false}/>
        </div>
      )}

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand"/>
        <TweakRadio label="Direction" value={t.theme} options={[
          { value: 'editorial', label: 'Editorial' },
          { value: 'athletic',  label: 'Athletic' },
          { value: 'fintech',   label: 'Fintech' },
        ]} onChange={(v) => {
          // Reset accent to theme default when switching
          setTweak({ theme: v, accentColor: THEMES[v].accent });
        }}/>
        <TweakColor label="Accent" value={t.accentColor} onChange={(v) => setTweak('accentColor', v)}/>
        <TweakSection label="Layout"/>
        <TweakToggle label="Show iPhone frame" value={t.showFrame} onChange={(v) => setTweak('showFrame', v)}/>
        <TweakSlider label="Font scale" value={t.fontScale} min={0.85} max={1.2} step={0.05} unit="×" onChange={(v) => setTweak('fontScale', v)}/>
        <TweakSection label="Scorecard viz"/>
        <TweakRadio label="Style" value={t.scorecardViz} options={[
          { value: 'rings',   label: 'Rings' },
          { value: 'bars',    label: 'Bars' },
          { value: 'compose', label: 'Composite' },
        ]} onChange={(v) => setTweak('scorecardViz', v)}/>
        <TweakSection label="Data source"/>
        <TweakRadio label="Mode" value={t.apiMode} options={[
          { value: 'local',    label: 'Local demo' },
          { value: 'sheet',    label: 'Sheet' },
          { value: 'supabase', label: 'Supabase' },
        ]} onChange={(v) => {
          setTweak('apiMode', v); CABT_setApiMode(v);
          showToast(v === 'supabase' ? 'Supabase mode — sign in' : v === 'sheet' ? 'Sheet mode' : 'Local mode');
        }}/>
        {t.apiMode === 'sheet' && (
          <TweakText label="Apps Script URL" value={t.apiUrl} placeholder="https://script.google.com/macros/s/.../exec" onChange={(v) => { setTweak('apiUrl', v); CABT_setApiUrl(v); }}/>
        )}
        {t.apiMode === 'supabase' && authedProfile && (
          <TweakButton label={`Sign out (${authedProfile.email})`} onClick={async () => { await CABT_signOut(); setAuthedSession(null); setAuthedProfile(null); }} secondary/>
        )}
        <TweakSection label="Demo"/>
        <TweakToggle label="Simulate offline" value={t.demoOffline} onChange={(v) => setTweak('demoOffline', v)}/>
        <TweakToggle label='"Saved" toast' value={t.showSavedToast} onChange={(v) => setTweak('showSavedToast', v)}/>
        <TweakButton label="Reset sample data" onClick={resetData} secondary/>
      </TweaksPanel>
    </div>
  );
}

function LogPickerSheet({ theme, onClose, onPick }) {
  const items = [
    { name: 'log-metrics', icon: 'chart',     label: 'Monthly metrics', desc: 'Leads, ad spend, MRR, attrition' },
    { name: 'log-event',   icon: 'cal',       label: 'Growth event',    desc: 'Workshop, gear sale, milestone' },
    { name: 'log-survey',  icon: 'star',      label: 'Client survey',   desc: 'Satisfaction snapshot' },
  ];
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 90,
      background: 'rgba(8, 12, 24, 0.45)',
      animation: 'scrimIn .18s ease',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', background: theme.surface, color: theme.ink,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '12px 0 92px', // sits above tab bar
        boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
        animation: 'sheetIn .22s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}>
        <div style={{
          width: 38, height: 4, borderRadius: 2,
          background: theme.rule, margin: '4px auto 14px',
        }}/>
        <div style={{
          padding: '0 20px 12px',
          fontSize: 11, color: theme.inkMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700,
        }}>
          What are you logging?
        </div>
        {items.map((it, i) => (
          <button key={it.name} onClick={() => onPick(it.name)} style={{
            display: 'flex', alignItems: 'center', gap: 14, width: '100%',
            background: 'transparent', border: 'none',
            padding: '14px 20px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            borderTop: i === 0 ? `1px solid ${theme.rule}` : 'none',
            borderBottom: `1px solid ${theme.rule}`,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: theme.accent + '15', color: theme.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name={it.icon} size={20}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>{it.label}</div>
              <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 1 }}>{it.desc}</div>
            </div>
            <Icon name="chev-r" size={16} color={theme.inkMuted}/>
          </button>
        ))}
        <button onClick={onClose} style={{
          display: 'block', width: 'calc(100% - 40px)', margin: '14px 20px 0',
          padding: '12px', background: 'transparent', border: `1px solid ${theme.rule}`,
          borderRadius: 12, color: theme.inkSoft, fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
      </div>
    </div>
  );
}

function ThemeToggle({ isDark, theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: 30, height: 28, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        border: `1px solid ${theme.rule}`,
        borderRadius: 999,
        color: theme.inkSoft,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background .15s, color .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = theme.ink; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = theme.inkSoft; }}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={14} stroke={1.8}/>
    </button>
  );
}

function RoleSwitcher({ role, onChange, theme }) {
  return (
    <div style={{ display: 'flex', background: theme.rule, borderRadius: 999, padding: 2, gap: 0 }}>
      {['CA', 'Sales', 'Admin'].map(r => (
        <button key={r} onClick={() => onChange(r)} style={{
          padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 999,
          background: role === r ? theme.surface : 'transparent',
          color: role === r ? theme.ink : theme.inkMuted,
          cursor: 'pointer', fontFamily: 'inherit', boxShadow: role === r ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}>{r}</button>
      ))}
    </div>
  );
}

function UserPicker({ value, onChange, users, theme }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      background: theme.surface, color: theme.ink, border: `1px solid ${theme.rule}`,
      borderRadius: 999, padding: '5px 26px 5px 10px', fontSize: 11, fontWeight: 600,
      fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${encodeURIComponent(theme.inkMuted)}' d='M0 0h10L5 6z'/></svg>")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
    }}>
      {users.map(u => <option key={u.id} value={u.id}>{u.id} · {u.name}</option>)}
    </select>
  );
}

function DesktopAside({ theme, state, role, onResetData }) {
  return (
    <div style={{
      width: 320, padding: 24, fontFamily: theme.sans, color: theme.ink,
      maxWidth: 320,
    }}>
      <div style={{ fontFamily: theme.serif, fontSize: 32, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.1, color: theme.ink }}>
        CA Bonus<br/>Tracker
      </div>
      <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 10, lineHeight: 1.55, fontFamily: theme.serif, fontStyle: 'italic' }}>
        A mobile-first front for the GroundStandard scorecard sheet. Same app, three roles. Real validation, optimistic saves, offline tolerance.
      </div>
      <div style={{ height: 1, background: theme.rule, margin: '24px 0' }}/>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: theme.inkMuted, marginBottom: 10 }}>
        Live data
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Stat theme={theme} k="Clients" v={state.clients.length}/>
        <Stat theme={theme} k="CAs" v={state.cas.length}/>
        <Stat theme={theme} k="Reps" v={state.sales.length}/>
        <Stat theme={theme} k="Metrics rows" v={state.monthlyMetrics.length}/>
        <Stat theme={theme} k="Events" v={state.growthEvents.length}/>
        <Stat theme={theme} k="Surveys" v={state.surveys.length}/>
      </div>
      <div style={{ height: 1, background: theme.rule, margin: '24px 0' }}/>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: theme.inkMuted, marginBottom: 10 }}>
        Try it
      </div>
      <ul style={{ fontSize: 13, color: theme.inkSoft, paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
        <li>Switch role at top-right</li>
        <li>Switch CA — see different books</li>
        <li>Tap "Today's prompts" → log a month</li>
        <li>Try logging the same month twice</li>
        <li>Toggle offline in Tweaks → save → sync</li>
      </ul>
      <div style={{ height: 1, background: theme.rule, margin: '24px 0' }}/>
      <button onClick={onResetData} style={{
        background: 'transparent', border: `1px solid ${theme.rule}`, padding: '8px 14px',
        borderRadius: 8, color: theme.inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'inherit',
      }}>Reset sample data</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

// app-shell.jsx — top-level App: role switcher, navigation, sync banner, tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "athletic",
  "accentColor": "#E8FF5A",
  "scorecardViz": "bars",
  "showFrame": false,
  "density": "regular",
  "fontScale": 1.0,
  "demoOffline": false,
  "showSavedToast": true,
  "apiMode": "supabase",
  "apiUrl": ""
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [state, setState] = React.useState(() => CABT_loadState());
  const [authedSession, setAuthedSession] = React.useState(null);
  const [authedProfile, setAuthedProfile] = React.useState(null);
  const [loadingLive, setLoadingLive] = React.useState(false);
  const [role, setRole] = React.useState('CA');
  const [activeUserId, setActiveUserId] = React.useState('CA-01');
  const [route, setRoute] = React.useState({ name: 'home', params: {} });
  const [history, setHistory] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [pendingSync, setPendingSync] = React.useState(0);
  const [isOffline, setIsOffline] = React.useState(false);
  const [logSheet, setLogSheet] = React.useState(false);

  React.useEffect(() => { if (t.apiMode === 'local') CABT_saveState(state); }, [state, t.apiMode]);
  React.useEffect(() => { setIsOffline(t.demoOffline); }, [t.demoOffline]);
  React.useEffect(() => { CABT_setApiMode(t.apiMode); }, [t.apiMode]);

  React.useEffect(() => {
    if (t.apiMode !== 'supabase' || !authedSession) return;
    let cancelled = false;
    setLoadingLive(true);
    CABT_api.loadState().then(s => {
      if (cancelled) return;
      setState(prev => ({ ...prev, ...s }));
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
      setState(mutator);
      showToast('Saved locally · will sync');
    } else {
      setState(mutator);
      showToast(msg || 'Saved ✓');
    }
    navigate('back');
  };

  const submitMetrics = (row, isEdit) => queueOrApply(s => ({
    ...s, monthlyMetrics: isEdit ? s.monthlyMetrics.map(m => m.id === row.id ? row : m) : [...s.monthlyMetrics, row],
  }), 'Monthly metrics saved');
  const submitEvent = (row) => queueOrApply(s => ({ ...s, growthEvents: [...s.growthEvents, row] }), 'Event saved');
  const submitSurvey = (row) => queueOrApply(s => ({ ...s, surveys: [...s.surveys, row] }), 'Survey saved');
  const submitContract = (row) => queueOrApply(s => ({ ...s, clients: [...s.clients, row] }), 'Contract logged');
  const submitClient = (row) => queueOrApply(s => ({
    ...s,
    clients: [...s.clients, row],
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

  const activeCA = state.cas.find(c => c.id === activeUserId);
  const activeRep = state.sales.find(s => s.id === activeUserId);

  React.useEffect(() => {
    if (role === 'CA' && !state.cas.some(c => c.id === activeUserId)) setActiveUserId('CA-01');
    if (role === 'Sales' && !state.sales.some(s => s.id === activeUserId)) setActiveUserId('AM-01');
    setRoute({ name: 'home', params: {} });
    setHistory([]);
  }, [role]);

  const titleFor = (r) => {
    if (role === 'CA') {
      return ({ 'home': 'Today', 'book': 'My Book', 'client-detail': 'Client',
        'log-metrics': 'Log Metrics', 'log-event': 'Log Event', 'log-survey': 'Survey',
        'scorecard': 'Scorecard' })[r.name] || 'CA';
    }
    if (role === 'Sales') {
      return ({ 'home': 'Sales', 'commissions': 'Commissions',
        'log-contract': 'New Contract', 'log-adjustment': 'Adjustment' })[r.name] || 'Sales';
    }
    return ({ 'home': 'Approvals', 'edits': 'Edit Requests', 'reviews': 'Reviews Inbox',
      'bonus': 'Annual Bonus', 'revenue': 'Revenue Ledger', 'clients': 'Client Rollup',
      'client-calc': 'Client Calc', 'add-client': 'Add Client', 'pending-clients': 'Pending Clients',
      'questions': 'Open Questions', 'config': 'Config', 'roster': 'Roster',
      'more': 'More' })[r.name] || 'Admin';
  };

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

  const tabs = role === 'CA'
    ? [
        { name: 'home', icon: 'home', label: 'Today' },
        { name: 'book', icon: 'book', label: 'Book' },
        { name: 'log-picker', icon: 'plus', label: 'Log', primary: true },
        { name: 'scorecard', icon: 'chart', label: 'Score' },
        { name: 'profile', icon: 'user', label: 'Me' },
      ]
    : role === 'Sales'
    ? [
        { name: 'home', icon: 'home', label: 'Home' },
        { name: 'commissions', icon: 'cash', label: 'Commissions' },
        { name: 'log-adjustment', icon: 'edit', label: 'Adjust' },
        { name: 'log-contract', icon: 'plus', label: 'Contract', primary: true },
      ]
    : [
        { name: 'home',    icon: 'shield', label: 'Approvals' },
        { name: 'bonus',   icon: 'cash',   label: 'Bonus' },
        { name: 'revenue', icon: 'chart',  label: 'Revenue' },
        { name: 'clients', icon: 'book',   label: 'Clients' },
        { name: 'more',    icon: 'cog',    label: 'More' },
      ];

  const Body = ({ width, height, isPhone }) => (
    <div style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.ink,
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: theme.sans, fontSize: 14 * t.fontScale, overflow: 'hidden',
    }}>
      <div style={{
        flexShrink: 0, padding: isPhone ? '54px 16px 8px' : '14px 18px 10px',
        background: theme.bg, borderBottom: `1px solid ${theme.rule}`,
        position: 'relative', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: theme.accent, color: theme.accentInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: theme.serif, fontWeight: 700, fontSize: 14, letterSpacing: -0.5,
          }}>G</div>
          <div style={{ flex: 1, fontSize: 12, color: theme.inkMuted, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            gsTeam Scoreboard
          </div>
          <ThemeToggle isDark={t.theme === 'athletic'} theme={theme} onToggle={() => {
            const next = t.theme === 'athletic' ? 'fintech' : 'athletic';
            setTweak({ theme: next, accentColor: THEMES[next].accent });
          }}/>
          {(state.me?.role === 'owner' || t.apiMode === 'local') && (
            <RoleSwitcher role={role} onChange={setRole} theme={theme}/>
          )}
          {state.me?.role && state.me.role !== 'owner' && (
            <div style={{
              padding: '5px 10px', fontSize: 11, fontWeight: 700,
              borderRadius: 999, background: theme.surface, color: theme.ink,
              border: `1px solid ${theme.rule}`, whiteSpace: 'nowrap',
            }}>
              {CABT_roleShort(state.me.role, state.me.salesRole)}
            </div>
          )}
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
          {role === 'CA' && (state.me?.role === 'owner' || t.apiMode === 'local') && (
            <UserPicker value={activeUserId} onChange={setActiveUserId} users={state.cas.filter(c => c.active)} theme={theme}/>
          )}
          {role === 'Sales' && (state.me?.role === 'owner' || t.apiMode === 'local') && (
            <UserPicker value={activeUserId} onChange={setActiveUserId} users={state.sales} theme={theme}/>
          )}
        </div>
      </div>

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

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {renderContent()}
      </div>

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
            <button key={tb.name} onClick={() => {
              if (tb.name === 'log-picker') { setLogSheet(true); return; }
              setHistory([]); setRoute({ name: tb.name, params: {} });
            }} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '6px 0', background: 'transparent', border: 'none', cursor: 'pointer',
              color: active ? theme.accent : theme.inkMuted, fontFamily: 'inherit',
            }}>
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

      {logSheet && role === 'CA' && (
        <LogPickerSheet theme={theme} onClose={() => setLogSheet(false)} onPick={(name) => {
          setLogSheet(false); setHistory([]); setRoute({ name, params: {} });
        }}/>
      )}

      {toast && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 100, transform: 'translateX(-50%)',
          background: theme.ink, color: theme.bg,
          padding: '10px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 6, animation: 'toastIn .25s ease',
        }}>
          <Icon name="check" size={14}/>{toast}
        </div>
      )}
    </div>
  );

  const [vw, setVw] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  const useFrame = t.showFrame && vw >= 720;
  const isTablet = vw >= 720 && vw < 1100;

  if (t.apiMode === 'supabase' && !authedSession) {
    return (
      <AuthGate theme={theme} onAuthed={(sess, prof) => { setAuthedSession(sess); setAuthedProfile(prof); }}/>
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
      display: 'flex', alignItems: useFrame ? 'center' : 'stretch',
      justifyContent: 'center', fontFamily: theme.sans,
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
        </div>
      ) : (
        <div style={{ width: '100%', height: '100vh', maxHeight: '100vh' }}>
          <Body width="100%" height="100vh" isPhone={false}/>
        </div>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand"/>
        <TweakRadio label="Direction" value={t.theme} options={[
          { value: 'editorial', label: 'Editorial' },
          { value: 'athletic',  label: 'Athletic' },
          { value: 'fintech',   label: 'Fintech' },
        ]} onChange={(v) => { setTweak({ theme: v, accentColor: THEMES[v].accent }); }}/>
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
      background: 'rgba(8, 12, 24, 0.45)', animation: 'scrimIn .18s ease',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', background: theme.surface, color: theme.ink,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '12px 0 92px',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
        animation: 'sheetIn .22s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}>

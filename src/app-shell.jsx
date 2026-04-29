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
  "apiMode": "supabase",
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
  // Initialize from navigator.onLine immediately so OfflineScreen renders on
  // first paint when offline — no flicker, no waiting for useEffect to fire.
  const [isOffline, setIsOffline] = React.useState(
    typeof navigator !== 'undefined' && navigator.onLine === false
  );
  const [logSheet, setLogSheet] = React.useState(false);
  const [updateWorker, setUpdateWorker] = React.useState(null); // PWA new version
  const [installable, setInstallable] = React.useState(!!window.CABT_INSTALL_PROMPT);
  const [installed, setInstalled] = React.useState(false);

  // Listen for "new version available" event dispatched by index.html SW handler.
  React.useEffect(() => {
    const onUpdate = (e) => setUpdateWorker(e.detail?.worker || true);
    const onInstallable = () => setInstallable(true);
    const onInstalled = () => { setInstallable(false); setInstalled(true); };
    window.addEventListener('cabt-update-available', onUpdate);
    window.addEventListener('cabt-install-available', onInstallable);
    window.addEventListener('cabt-install-completed', onInstalled);
    return () => {
      window.removeEventListener('cabt-update-available', onUpdate);
      window.removeEventListener('cabt-install-available', onInstallable);
      window.removeEventListener('cabt-install-completed', onInstalled);
    };
  }, []);

  const acceptUpdate = () => {
    if (updateWorker && updateWorker.postMessage) {
      updateWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  const promptInstall = async () => {
    const p = window.CABT_INSTALL_PROMPT;
    if (!p) return;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    window.CABT_INSTALL_PROMPT = null;
    setInstallable(false);
  };

  // Detect already-installed PWA (display-mode: standalone)
  const isStandalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true);

  // Handle PWA manifest shortcuts on launch (?shortcut=ca-today, etc.)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shortcut = params.get('shortcut');
    if (!shortcut) return;
    if (shortcut === 'ca-today')           { setRole('CA');    setRoute({ name: 'home', params: {} }); }
    else if (shortcut === 'admin-approvals') { setRole('Admin'); setRoute({ name: 'home', params: {} }); }
    else if (shortcut === 'sales-commissions') { setRole('Sales'); setRoute({ name: 'commissions', params: {} }); }
    // Clear param so reload doesn't re-trigger
    if (window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('shortcut');
      url.searchParams.delete('source');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }, []);

  React.useEffect(() => { if (t.apiMode === 'local') CABT_saveState(state); }, [state, t.apiMode]);

  // Real offline detection — listen to browser online/offline events.
  // Tweak `demoOffline` overrides for testing (forces offline state).
  React.useEffect(() => {
    if (t.demoOffline) { setIsOffline(true); return; }
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [t.demoOffline]);

  // Sync apiMode tweak → api.jsx mode key
  React.useEffect(() => { CABT_setApiMode(t.apiMode); }, [t.apiMode]);

  // When in supabase mode and authed, fetch real state
  const reloadLive = React.useCallback(() => {
    if (t.apiMode !== 'supabase') return Promise.resolve();
    setLoadingLive(true);
    return CABT_api.loadState().then(s => {
      setState(prev => ({ ...prev, ...s }));
      if (s.role === 'owner' || s.role === 'admin') setRole('Admin');
      else if (s.role === 'sales') setRole('Sales');
      else setRole('CA');
      setLoadingLive(false);
    }).catch(err => {
      console.error('Live load failed:', err);
      setLoadingLive(false);
    });
  }, [t.apiMode]);

  React.useEffect(() => {
    if (t.apiMode !== 'supabase' || !authedSession) return;
    reloadLive();
  }, [t.apiMode, authedSession, reloadLive]);

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
      case 'audit-log':   return <AdminAuditLog state={state} theme={theme}/>;
      case 'config':      return <AdminConfig state={state} theme={theme} onUpdate={updateConfig}/>;
      case 'roster':      return <AdminRoster state={state} theme={theme} onReload={reloadLive} onToast={showToast}/>;
      case 'more':        return <AdminMore theme={theme} navigate={navigate}/>;
      default: return null;
    }
  };

  // Tab bar
  // Tabs use the gsTeam custom nav-* icon set (defined in ui.jsx). They
  // share a consistent style — line stroke, optional accent dot — so the
  // bar reads as a single family.
  const tabs = role === 'CA'
    ? [
        { name: 'home', icon: 'nav-today', label: 'Today' },
        { name: 'book', icon: 'nav-accounts', label: 'Accounts' },
        { name: 'log-picker', icon: 'nav-log', label: 'Log', primary: true },
        { name: 'scorecard', icon: 'nav-score', label: 'Score' },
        { name: 'profile', icon: 'nav-me', label: 'Me' },
      ]
    : role === 'Sales'
    ? [
        { name: 'home', icon: 'nav-today', label: 'Home' },
        { name: 'commissions', icon: 'cash', label: 'Commissions' },
        { name: 'log-contract', icon: 'nav-log', label: 'Contract', primary: true },
        { name: 'log-adjustment', icon: 'edit', label: 'Adjust' },
      ]
    : [
        { name: 'home',    icon: 'shield',     label: 'Approvals' },
        { name: 'bonus',   icon: 'cash',       label: 'Bonus' },
        { name: 'revenue', icon: 'nav-score',  label: 'Revenue' },
        { name: 'clients', icon: 'nav-accounts', label: 'Clients' },
        { name: 'more',    icon: 'cog',        label: 'More' },
      ];

  // App body — used both inside and outside the iPhone frame
  const Body = ({ width, height, isPhone }) => (
    <div style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.ink,
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: theme.sans, fontSize: 14 * t.fontScale,
      overflow: 'hidden',
    }}>
      {/* Top bar — uses env(safe-area-inset-top) so the iPhone status bar /
         Dynamic Island doesn't overlap content in standalone PWA mode. */}
      <div style={{
        flexShrink: 0,
        padding: isPhone
          ? '54px 16px 8px'
          : 'calc(env(safe-area-inset-top, 0px) + 14px) 18px 10px',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 18px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 18px)',
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
            gsTeam Scoreboard
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

      {/* PWA "New version available" banner */}
      {updateWorker && (
        <div style={{
          padding: '8px 16px', background: theme.accent + '20', color: theme.ink,
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          borderBottom: `1px solid ${theme.rule}`,
        }}>
          <Icon name="sync" size={14}/>
          <span style={{ flex: 1 }}>New version available</span>
          <button onClick={acceptUpdate} style={{
            background: theme.accent, color: theme.accentInk, border: 'none',
            fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Update</button>
        </div>
      )}

      {/* PWA "Install app" banner — only when installable + not already installed */}
      {installable && !installed && !isStandalone && (
        <div style={{
          padding: '8px 16px', background: '#0E1A35' + '15', color: theme.ink,
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          borderBottom: `1px solid ${theme.rule}`,
        }}>
          <Icon name="plus" size={14}/>
          <span style={{ flex: 1 }}>Install gsTeam to your home screen</span>
          <button onClick={() => setInstallable(false)} style={{
            background: 'transparent', border: 'none', color: theme.inkMuted,
            fontWeight: 600, fontSize: 11, padding: '4px 6px', cursor: 'pointer', fontFamily: 'inherit',
          }}>Later</button>
          <button onClick={promptInstall} style={{
            background: theme.accent, color: theme.accentInk, border: 'none',
            fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Install</button>
        </div>
      )}

      {/* Content — extra bottom padding so last items aren't hidden behind floating nav.
         Adds env(safe-area-inset-bottom) so the home indicator on iOS PWA standalone
         doesn't overlap the last item. */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
      }}>
        <div style={{ maxWidth: !isPhone && role === 'Admin' && vw >= 1100 ? 1024 : '100%', margin: '0 auto' }}>
          {renderContent()}
        </div>
      </div>

      {/* Premium floating island tab bar.
         Glassmorphism: layered semi-transparent bg + heavy backdrop blur.
         Inner highlight at top + drop shadow + accent-tinted glow.
         Position fixed on real mobile / desktop, absolute inside iOS frame. */}
      <div style={{
        position: isPhone ? 'absolute' : 'fixed',
        ...(!isPhone && role === 'Admin' && vw >= 1100
          ? { left: '50%', transform: 'translateX(-50%)', width: 'min(560px, calc(100% - 32px))' }
          : { left: 12, right: 12 }),
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        // Layered glass: theme bg at 78% opacity + saturate-blur for depth
        background: t.theme === 'athletic'
          ? 'linear-gradient(180deg, rgba(28,32,42,0.92), rgba(20,24,32,0.88))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,246,238,0.88))',
        border: `1px solid ${t.theme === 'athletic' ? 'rgba(255,255,255,0.06)' : 'rgba(14,26,53,0.06)'}`,
        borderRadius: 999,
        padding: '8px 10px',
        boxShadow: t.theme === 'athletic'
          ? '0 18px 48px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 18px 48px rgba(14,26,53,0.18), 0 2px 6px rgba(14,26,53,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        zIndex: 100,
      }}>
        {tabs.map(tb => {
          const active = route.name === tb.name
            || (tb.name === 'log-picker' && (route.name === 'log-metrics' || route.name === 'log-event' || route.name === 'log-survey'));
          return (
            <button
              key={tb.name}
              className="cabt-tab-btn"
              onClick={() => {
                if (tb.name === 'log-picker') { setLogSheet(true); return; }
                setHistory([]); setRoute({ name: tb.name, params: {} });
              }}
              aria-label={tb.label}
              aria-current={active ? 'page' : undefined}
              style={{
                position: 'relative', flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '8px 0 6px',
                minHeight: 48,
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderRadius: 18,
                color: active ? theme.accent : theme.inkMuted, fontFamily: 'inherit',
                transition: 'color 0.18s ease, transform 0.08s ease',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              {/* Animated gradient pill highlight behind active non-primary tab */}
              {active && !tb.primary && (
                <span aria-hidden="true" style={{
                  position: 'absolute', inset: '4px 6px',
                  background: `linear-gradient(180deg, ${theme.accent}28, ${theme.accent}14)`,
                  borderRadius: 14, zIndex: 0,
                  animation: 'tabPillIn 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: `inset 0 1px 0 ${theme.accent}33`,
                }}/>
              )}
              {/* Tiny gold accent bar indicator above active label */}
              {active && !tb.primary && (
                <span aria-hidden="true" style={{
                  position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)',
                  width: 16, height: 2.5, borderRadius: 2,
                  background: theme.accent,
                  boxShadow: `0 0 8px ${theme.accent}99`,
                  zIndex: 2,
                  animation: 'tabPillIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                }}/>
              )}
              {tb.primary ? (
                <div style={{
                  width: 46, height: 46, borderRadius: 23,
                  background: `linear-gradient(180deg, ${theme.accent} 0%, ${theme.accent}E0 100%)`,
                  color: theme.accentInk,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 2,
                  boxShadow: active
                    ? `0 8px 22px ${theme.accent}77, 0 2px 4px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.35)`
                    : `0 6px 16px ${theme.accent}55, 0 2px 4px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.3)`,
                  transform: active ? 'translateY(-3px) scale(1.04)' : 'translateY(-1px) scale(1)',
                  transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease',
                  position: 'relative', zIndex: 1,
                }}><Icon name={tb.icon} size={22} stroke={2.4}/></div>
              ) : (
                <span style={{
                  position: 'relative', zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: active ? 'translateY(-1px)' : 'translateY(0)',
                  transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                  filter: active ? `drop-shadow(0 0 6px ${theme.accent}55)` : 'none',
                }}>
                  <Icon name={tb.icon} size={22} stroke={active ? 2.2 : 1.85}/>
                </span>
              )}
              <span style={{
                position: 'relative', zIndex: 1,
                fontSize: 10.5, fontWeight: active ? 700 : 600, letterSpacing: 0.2,
                transition: 'font-weight 0.15s ease, color 0.18s ease',
              }}>{tb.label}</span>
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
  // Desktop admin mode: wide screen + admin role → full-bleed wide layout (no iPhone frame).
  // Bobby explicitly asked for desktop-friendly admin (2026-04-29).
  const isDesktop = vw >= 1100;
  const isDesktopAdmin = isDesktop && role === 'Admin';
  const useFrame = t.showFrame && vw >= 720 && !isDesktopAdmin;
  const isTablet = vw >= 720 && vw < 1100;

  // No internet on initial open → show dedicated offline screen IMMEDIATELY.
  // Render before auth-gate so we don't waste 5+ seconds on Supabase timeouts
  // before showing the offline UI. Once authed and connection drops, the
  // inline sync banner (lower) handles it instead so user keeps cached data.
  if (t.apiMode === 'supabase' && isOffline && !authedSession) {
    return <OfflineScreen onRetry={() => window.location.reload()}/>;
  }

  // Supabase mode requires a signed-in session before rendering the app.
  // Skip auth-gate entirely if offline — already handled above.
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
      minHeight: '100vh', minHeight: '100dvh',
      backgroundColor: useFrame
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
        @keyframes tabPillIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes modalIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        body { margin: 0; }
        * { box-sizing: border-box; }
        input, select, button, textarea { font-family: inherit; }
        .cabt-tab-btn:active { transform: scale(0.94); }
        .cabt-input-wrap { position: relative; }
        .cabt-input { transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease; }
        .cabt-input:focus { outline: none; box-shadow: 0 0 0 3px var(--cabt-accent-soft, rgba(232,255,90,0.18)); }
        .cabt-btn-press { transition: transform 0.08s ease, opacity 0.15s ease; }
        .cabt-btn-press:active { transform: scale(0.97); }
        .cabt-btn-press:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.001ms !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      {useFrame ? (
        <IOSDevice width={402} height={874} dark={t.theme === 'athletic'}>
          <Body width={402} height={874} isPhone={true}/>
        </IOSDevice>
      ) : isDesktopAdmin ? (
        <div style={{
          width: '100%', maxWidth: 1280,
          height: '100dvh', maxHeight: '100dvh',
          margin: '0 auto', boxShadow: '0 0 0 1px ' + theme.rule,
        }}>
          <Body width="100%" height="100dvh" isPhone={false}/>
        </div>
      ) : (
        <div style={{ width: '100%', height: '100dvh', maxHeight: '100dvh' }}>
          <Body width="100%" height="100dvh" isPhone={false}/>
        </div>
      )}
    </div>
  );
}

// "No Internet Connection" full-screen page shown when the app opens
// without connectivity (PWA or browser, iOS or Android).
// On-brand: navy + cream + gold accent. Auto-redirects on reconnect.
function OfflineScreen({ onRetry }) {
  const [reconnecting, setReconnecting] = React.useState(false);

  React.useEffect(() => {
    const back = () => {
      setReconnecting(true);
      setTimeout(() => window.location.replace('/'), 600);
    };
    window.addEventListener('online', back);
    const id = setInterval(() => {
      if (!navigator.onLine) return;
      fetch('/manifest.webmanifest', { method: 'HEAD', cache: 'no-store' })
        .then((r) => { if (r && r.ok) back(); })
        .catch(() => {});
    }, 4000);
    return () => { window.removeEventListener('online', back); clearInterval(id); };
  }, []);

  const closeApp = () => {
    window.close();
    setTimeout(() => { window.location.href = 'about:blank'; }, 100);
  };

  return (
    <div style={{
      minHeight: '100vh', minHeight: '100dvh',
      background: '#F5EFE4', color: '#0E1A35',
      fontFamily: '-apple-system, "Segoe UI", "Helvetica Neue", system-ui, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'max(env(safe-area-inset-top), 24px) max(env(safe-area-inset-right), 24px) max(env(safe-area-inset-bottom), 24px) max(env(safe-area-inset-left), 24px)',
    }}>
      {reconnecting && (
        <div style={{
          position: 'fixed', left: '50%', top: 'calc(env(safe-area-inset-top, 0px) + 24px)',
          transform: 'translateX(-50%)',
          background: '#0E1A35', color: '#F5EFE4',
          padding: '12px 20px', borderRadius: 999,
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 100,
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#B5894A' }}/>
          Back online · reloading…
        </div>
      )}
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{
          width: 132, height: 132, borderRadius: '50%',
          background: 'rgba(14, 26, 53, 0.08)',
          border: '1px solid rgba(14, 26, 53, 0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 28,
        }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#0E1A35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 015.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0122.58 9"/>
            <path d="M1.42 9a15.91 15.91 0 014.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 016.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>
        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 24, fontWeight: 600, color: '#0E1A35',
          margin: '0 0 12px', letterSpacing: -0.4,
        }}>No Internet Connection</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#5C6478', margin: '0 0 36px', padding: '0 8px' }}>
          Please check your Wi-Fi or mobile data and try again.
        </p>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={onRetry || (() => window.location.reload())} style={{
            width: '100%', padding: 16, borderRadius: 14,
            background: '#0E1A35', color: '#F5EFE4', border: 'none',
            boxShadow: '0 4px 12px rgba(14, 26, 53, 0.18)',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            letterSpacing: 0.1,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/>
              <path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
            </svg>
            Refresh
          </button>
          <button onClick={closeApp} style={{
            width: '100%', padding: 16, borderRadius: 14,
            background: 'transparent', color: '#0E1A35', border: '1.5px solid rgba(14, 26, 53, 0.18)',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            letterSpacing: 0.1,
          }}>
            Close App
          </button>
        </div>
        <div style={{
          fontSize: 11, color: '#B5894A', marginTop: 28,
          letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600,
        }}>gsTeam</div>
        <div style={{ width: 28, height: 2, background: '#B5894A', marginTop: 14 }}/>
      </div>
    </div>
  );
}

function LogPickerSheet({ theme, onClose, onPick }) {
  const items = [
    { name: 'log-metrics', icon: 'chart',     label: 'Monthly metrics', desc: 'Leads, ad spend, MRR, attrition' },
    { name: 'log-event',   icon: 'cal',       label: 'Growth event',    desc: 'Workshop, gear sale, milestone' },
    { name: 'log-survey',  icon: 'star',      label: 'Client survey',   desc: 'Satisfaction snapshot' },
  ];
  // Sheet must sit ABOVE the floating tab bar. Tab bar height ~60px + 14px gap
  // + safe-area-inset-bottom = the clearance we need below the Cancel button.
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 90,
      background: 'rgba(8, 12, 24, 0.45)',
      animation: 'scrimIn .18s ease',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', background: theme.surface, color: theme.ink,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        // Bottom padding clears the floating tab bar (~60px height + 14px gap
        // + safe-area-inset-bottom) plus a 16px breathing buffer.
        padding: '12px 0 calc(env(safe-area-inset-bottom, 0px) + 102px)',
        boxShadow: '0 -16px 48px rgba(0,0,0,0.22), 0 -2px 8px rgba(0,0,0,0.08)',
        animation: 'sheetIn .22s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 2,
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
          <button key={it.name} onClick={() => onPick(it.name)} className="cabt-btn-press" style={{
            display: 'flex', alignItems: 'center', gap: 14, width: '100%',
            background: 'transparent', border: 'none',
            padding: '14px 20px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            borderTop: i === 0 ? `1px solid ${theme.rule}` : 'none',
            borderBottom: `1px solid ${theme.rule}`,
            WebkitTapHighlightColor: 'transparent',
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
        <button onClick={onClose} className="cabt-btn-press" style={{
          display: 'block', width: 'calc(100% - 40px)', margin: '16px 20px 0',
          padding: '14px', background: 'transparent', border: `1.5px solid ${theme.rule}`,
          borderRadius: 12, color: theme.ink, fontSize: 15, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
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


ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

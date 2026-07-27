// calls-board.jsx — Weekly Client Calls board.
//
// A live, shared status grid over the weekly call schedule. Click any account
// to cycle its performance status; the change saves to Supabase and syncs to
// every other viewer in real time (via the app's existing realtime channel).
// Kurt 2026-07-27: "keep it in the gs team app so I can stay in one place."

// Vivid status colors are fixed (they read fine on both light and dark
// backgrounds). "No status" is theme-aware (resolved at render), so account
// names stay legible in either theme.
const CALL_STATUSES = [
  { key: 'none',      label: 'No status' },
  { key: 'healthy',   label: 'Healthy',   bg: '#2f9e5f', fg: '#ffffff' },
  { key: 'watch',     label: 'Watch',     bg: '#d9a520', fg: '#241a00' },
  { key: 'at_risk',   label: 'At risk',   bg: '#d0392c', fg: '#ffffff' },
  { key: 'escalated', label: 'Escalated', bg: '#7c4dc4', fg: '#ffffff' },
];
const CALL_STATUS_KEYS = CALL_STATUSES.map(s => s.key);

// Fixed dark header — legible in both themes (matches the original navy
// schedule graphic).
const CALLS_HEADER_BG = '#211a3a';

const CALLS_DAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const CALLS_TIMES = [
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM',
];
// grid[time] = [Mon, Tue, Wed, Thu, Fri] account label or null.
const CALLS_GRID = {
  '9:30 AM':  ['All Hands (GSA)', 'All in Jiu-Jitsu', null, null, null],
  '10:00 AM': [null, 'Simpleman', null, null, 'Bodega'],
  '11:00 AM': [null, null, null, 'Royal', 'Cobrinha SW'],
  '11:30 AM': [null, 'Hamptons JJ', 'GFV', 'Signature', 'Tetris Orlando'],
  '12:00 PM': ['Soulcraft', 'San Jose', 'Mason Dixon JJ', 'Killer B', 'Jiu Jitsu Modern'],
  '12:30 PM': ['Modernman', 'almighty', 'Riptide', 'Breathe', 'Champion'],
  '1:00 PM':  ['Fresno', 'JJ Hub', 'Vacaville', null, 'Edgar'],
  '1:30 PM':  [null, null, 'Infinity', 'Scottsdale', null],
  '2:00 PM':  ['Miami', null, 'Hammer', null, null],
  '2:30 PM':  ['Longos', 'OM BJJ', 'Orlando 10P', 'Inverted Gear', 'Miguel'],
  '3:00 PM':  [null, 'Sugoi', 'Universal', 'Artistry', 'Champion Chiro'],
  '3:30 PM':  ['Range', 'WNK', 'Grit', 'Mythuc', null],
  '4:00 PM':  ['Academy Eden Prarier', 'Granite Bay', 'Verde Valley', 'Centerline', 'Robby'],
};

function CallsBoard({ state, theme, navigate, isAdmin, onSetStatus }) {
  const [busy, setBusy] = React.useState(null);
  const [errKey, setErrKey] = React.useState(null);

  // Current status per account label, from live state.
  const byId = React.useMemo(() => {
    const m = {};
    (state.callStatuses || []).forEach(s => { if (s && s.id) m[s.id] = s.status || 'none'; });
    return m;
  }, [state.callStatuses]);

  // Theme-aware colors for a status key. "No status" tracks the theme so text
  // stays readable on light and dark backgrounds.
  const colorsFor = (key) => {
    if (!key || key === 'none') return { bg: theme.bgElev, fg: theme.ink };
    const s = CALL_STATUSES.find(x => x.key === key) || CALL_STATUSES[0];
    return { bg: s.bg, fg: s.fg };
  };

  const cycle = async (label) => {
    const cur = byId[label] || 'none';
    const next = CALL_STATUS_KEYS[(CALL_STATUS_KEYS.indexOf(cur) + 1) % CALL_STATUS_KEYS.length];
    setBusy(label); setErrKey(null);
    try {
      await onSetStatus(label, next);
    } catch (e) {
      console.error('[callStatus]', e);
      setErrKey(label);
    }
    setBusy(null);
  };

  const headCell = {
    padding: '11px 8px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
    textTransform: 'uppercase', color: '#f4f2fa', background: CALLS_HEADER_BG,
    whiteSpace: 'nowrap', borderBottom: '2px solid rgba(255,255,255,0.10)',
  };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontFamily: theme.serif, fontSize: 24, fontWeight: 700, color: theme.ink, letterSpacing: -0.4 }}>
          Weekly Client Calls
        </div>
        <div style={{ fontSize: 13, color: theme.inkMuted, marginTop: 2 }}>
          Click any account to cycle its status. Changes save live for everyone viewing this board.
        </div>
      </div>

      {/* Legend */}
      <Card theme={theme} padding={12}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: theme.inkMuted }}>Status</span>
          {CALL_STATUSES.map(s => {
            const c = colorsFor(s.key);
            return (
              <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: theme.ink }}>
                <span style={{ width: 13, height: 13, borderRadius: 4, background: c.bg, border: `1px solid ${theme.rule}` }}/>
                {s.label}
              </span>
            );
          })}
        </div>
      </Card>

      {errKey && (
        <div style={{ background: '#d0392c22', color: '#d0392c', border: '1px solid #d0392c55', borderRadius: 8, padding: '9px 13px', fontSize: 13 }}>
          <strong>Save failed for {errKey}.</strong> Click it again to retry.
        </div>
      )}

      {/* Grid */}
      <div style={{ overflowX: 'auto', border: `1px solid ${theme.rule}`, borderRadius: theme.radius, background: theme.surface }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', width: 76, minWidth: 76 }}>Time</th>
              {CALLS_DAYS.map(d => (
                <th key={d} style={{ ...headCell, textAlign: 'center' }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CALLS_TIMES.map(time => {
              const rowCells = CALLS_GRID[time] || [null, null, null, null, null];
              return (
                <tr key={time}>
                  <td style={{
                    padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#f4f2fa',
                    background: CALLS_HEADER_BG, whiteSpace: 'nowrap', textAlign: 'center',
                    position: 'sticky', left: 0, zIndex: 1,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>{time}</td>
                  {rowCells.map((label, di) => {
                    if (!label) {
                      return <td key={di} style={{ borderBottom: `1px solid ${theme.rule}`, borderLeft: `1px solid ${theme.rule}`, background: theme.surface, height: 42 }}/>;
                    }
                    const c = colorsFor(byId[label]);
                    const isBusy = busy === label;
                    const st = byId[label] || 'none';
                    return (
                      <td key={di} style={{ borderBottom: `1px solid ${theme.rule}`, borderLeft: `1px solid ${theme.rule}`, padding: 0 }}>
                        <button
                          onClick={() => cycle(label)}
                          disabled={isBusy}
                          title={`${label} — ${(CALL_STATUSES.find(s => s.key === st) || {}).label}. Click to change.`}
                          style={{
                            width: '100%', minHeight: 42, padding: '8px 10px',
                            border: 'none', cursor: isBusy ? 'wait' : 'pointer',
                            background: c.bg, color: c.fg,
                            fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                            textAlign: 'center', lineHeight: 1.25,
                            opacity: isBusy ? 0.6 : 1, transition: 'background .15s',
                          }}
                        >{label}</button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11.5, color: theme.inkMuted, textAlign: 'center', lineHeight: 1.5 }}>
        Statuses are shared and stored live — everyone opening this board sees the same colors.
      </div>
    </div>
  );
}

Object.assign(window, { CallsBoard });

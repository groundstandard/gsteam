// calls-board.jsx — Weekly Client Calls board.
//
// A live, shared status grid over the weekly call schedule. Click any account
// to cycle its performance status; the change saves to Supabase and syncs to
// every other viewer in real time (via the app's existing realtime channel).
// Kurt 2026-07-27: "keep it in the gs team app so I can stay in one place."

// Status cycle + colors (matches the original schedule graphic).
const CALL_STATUSES = [
  { key: 'none',      label: 'No status', bg: '#e6e8ec', fg: '#6b7280' },
  { key: 'healthy',   label: 'Healthy',   bg: '#2f9e5f', fg: '#ffffff' },
  { key: 'watch',     label: 'Watch',     bg: '#d4a017', fg: '#3a2c00' },
  { key: 'at_risk',   label: 'At risk',   bg: '#c0392b', fg: '#ffffff' },
  { key: 'escalated', label: 'Escalated', bg: '#6b3fa0', fg: '#ffffff' },
];
const CALL_STATUS_KEYS = CALL_STATUSES.map(s => s.key);
const CALL_STATUS_BY_KEY = Object.fromEntries(CALL_STATUSES.map(s => [s.key, s]));

const CALLS_DAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const CALLS_TIMES = [
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM',
];
// grid[time] = [Mon, Tue, Wed, Thu, Fri] account label or null.
// Editing the schedule is a code change for now (F5 admin-editing is a v1.1
// follow-up); this mirrors the current static schedule exactly.
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
  if (!isAdmin) {
    return <div style={{ padding: 24, color: theme.inkMuted }}>Not authorized.</div>;
  }
  const [busy, setBusy] = React.useState(null);
  const [errKey, setErrKey] = React.useState(null);

  // Current status per account label, from live state.
  const byId = React.useMemo(() => {
    const m = {};
    (state.callStatuses || []).forEach(s => { if (s && s.id) m[s.id] = s.status || 'none'; });
    return m;
  }, [state.callStatuses]);

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

  const th = {
    padding: '10px 8px', fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
    textTransform: 'uppercase', color: '#fff', background: theme.ink,
    whiteSpace: 'nowrap',
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
          {CALL_STATUSES.map(s => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: theme.ink }}>
              <span style={{ width: 13, height: 13, borderRadius: 4, background: s.bg, border: `1px solid ${theme.rule}` }}/>
              {s.label}
            </span>
          ))}
        </div>
      </Card>

      {errKey && (
        <div style={{ background: '#c0392b15', color: '#c0392b', border: '1px solid #c0392b33', borderRadius: 8, padding: '9px 13px', fontSize: 13 }}>
          <strong>Save failed for {errKey}.</strong> Try again.
        </div>
      )}

      {/* Grid */}
      <div style={{ overflowX: 'auto', border: `1px solid ${theme.rule}`, borderRadius: theme.radius, background: theme.surface }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...th, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', width: 74, minWidth: 74 }}>Time</th>
              {CALLS_DAYS.map(d => (
                <th key={d} style={{ ...th, textAlign: 'center' }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CALLS_TIMES.map(time => {
              const rowCells = CALLS_GRID[time] || [null, null, null, null, null];
              return (
                <tr key={time}>
                  <td style={{
                    padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#fff',
                    background: theme.ink, whiteSpace: 'nowrap', textAlign: 'center',
                    position: 'sticky', left: 0, zIndex: 1,
                    borderBottom: `1px solid ${theme.bg}`,
                  }}>{time}</td>
                  {rowCells.map((label, di) => {
                    if (!label) {
                      return <td key={di} style={{ borderBottom: `1px solid ${theme.rule}`, borderLeft: `1px solid ${theme.rule}`, background: theme.bgElev, height: 42 }}/>;
                    }
                    const st = CALL_STATUS_BY_KEY[byId[label] || 'none'];
                    const isBusy = busy === label;
                    return (
                      <td key={di} style={{ borderBottom: `1px solid ${theme.rule}`, borderLeft: `1px solid ${theme.rule}`, padding: 0 }}>
                        <button
                          onClick={() => cycle(label)}
                          disabled={isBusy}
                          title={`${label} — ${st.label}. Click to change.`}
                          style={{
                            width: '100%', minHeight: 42, padding: '8px 10px',
                            border: 'none', cursor: isBusy ? 'wait' : 'pointer',
                            background: st.bg, color: st.fg,
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

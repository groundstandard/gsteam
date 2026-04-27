// auth-gate.jsx — Magic-link email login screen for Supabase mode.

function AuthGate({ theme, onAuthed }) {
  const [phase, setPhase] = React.useState('checking');
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy]   = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    // Timeout fallback so a hung Supabase call never strands the user
    // on "Verifying session…".
    const timeoutId = setTimeout(() => {
      if (!cancelled) setPhase('needs-login');
    }, 4000);
    (async () => {
      try {
        const session = await CABT_currentSession();
        if (cancelled) return;
        clearTimeout(timeoutId);
        if (!session) { setPhase('needs-login'); return; }
        const prof = await CABT_currentProfile();
        if (cancelled) return;
        onAuthed && onAuthed(session, prof);
      } catch (e) {
        if (!cancelled) { clearTimeout(timeoutId); setError(e.message); setPhase('error'); }
      }
    })();
    let unsub = null;
    CABT_sb().then(sb => {
      const { data } = sb.auth.onAuthStateChange(async (_evt, session) => {
        if (session && !cancelled) {
          clearTimeout(timeoutId);
          const prof = await CABT_currentProfile();
          onAuthed && onAuthed(session, prof);
        }
      });
      unsub = data?.subscription;
    }).catch(() => {});
    return () => { cancelled = true; clearTimeout(timeoutId); if (unsub) unsub.unsubscribe(); };
  }, []);

  const onSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!email || !email.includes('@')) { setError('Enter a valid email.'); return; }
    setBusy(true); setError(null);
    try {
      await CABT_signInWithEmail(email);
      setPhase('sent');
    } catch (e2) {
      setError(e2.message || 'Could not send sign-in link.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'checking') {
    return (
      <div style={{
        minHeight: '100vh', background: theme.bg, color: theme.inkMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: theme.sans, fontSize: 13,
      }}>Verifying session…</div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: theme.bg, color: theme.ink,
      fontFamily: theme.sans, padding: '0 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 24,
    }}>
      <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: theme.accent, color: theme.accentInk,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.serif, fontWeight: 700, fontSize: 28, letterSpacing: -0.5,
          margin: '0 auto 18px',
        }}>G</div>
        <div style={{
          fontFamily: theme.serif, fontSize: 32, fontWeight: 600, letterSpacing: -0.5,
          lineHeight: 1.1, marginBottom: 10,
        }}>gsTeam Scoreboard</div>

        {phase === 'sent' ? (
          <>
            <div style={{
              fontSize: 14, color: theme.ink, lineHeight: 1.55,
              fontFamily: theme.serif, marginBottom: 18,
            }}>
              If <strong>{email}</strong> is invited, a sign-in link is on the way.<br/>
              Click it from this device to come back here signed in.
            </div>
            <button onClick={() => setPhase('needs-login')} style={{
              fontSize: 13, color: theme.inkMuted, background: 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
            }}>Use a different email</button>
          </>
        ) : (
          <>
            <div style={{
              fontSize: 13, color: theme.inkSoft, lineHeight: 1.55,
              fontFamily: theme.serif, fontStyle: 'italic', marginBottom: 24,
            }}>
              Invite-only. Enter your email — if you're invited, we'll send you a sign-in link.
            </div>

            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  background: theme.bgElev || theme.surface, color: theme.ink,
                  border: `1px solid ${theme.rule}`, fontFamily: 'inherit',
                  fontSize: 15, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button type="submit" disabled={busy} style={{
                width: '100%', padding: '14px 18px', borderRadius: 12,
                background: theme.accent, color: theme.accentInk, border: 'none',
                fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}>
                {busy ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>

            {error && (
              <div style={{
                marginTop: 16, padding: '10px 14px', borderRadius: 8,
                background: '#FFE5E5', color: '#9B1B1B', fontSize: 12, textAlign: 'left',
              }}>
                <strong>Couldn't send link.</strong> {error}
              </div>
            )}

            <div style={{ marginTop: 36, fontSize: 11, color: theme.inkMuted, lineHeight: 1.6 }}>
              Not invited? Ping Bobby — he can add your email in Admin → Roster.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { AuthGate });

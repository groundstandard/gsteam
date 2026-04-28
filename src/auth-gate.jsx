// auth-gate.jsx — Email + password sign-in for Supabase mode.
// Dead simple: type email + password, hit Sign in. No magic link, no OAuth.
// Account creation happens in Supabase Studio (owner is the gatekeeper).

function AuthGate({ theme, onAuthed }) {
  const [phase, setPhase] = React.useState('checking');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [showReset, setShowReset] = React.useState(false);
  const [resetEmail, setResetEmail] = React.useState('');
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetError, setResetError] = React.useState(null);
  const [resetSent, setResetSent] = React.useState(false);

  const openReset = () => {
    setResetEmail(email || '');
    setResetError(null);
    setResetSent(false);
    setShowReset(true);
  };
  const closeReset = () => {
    setShowReset(false);
    setResetBusy(false);
  };
  const onResetSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) { setResetError('Enter a valid email.'); return; }
    setResetBusy(true); setResetError(null);
    try {
      await CABT_resetPassword(resetEmail);
      setResetSent(true);
    } catch (e2) {
      setResetError(e2.message || 'Could not send reset link.');
    } finally {
      setResetBusy(false);
    }
  };

  // On mount: check for existing session; fall back to login form after 4s
  React.useEffect(() => {
    let cancelled = false;
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
        if (!cancelled) {
          clearTimeout(timeoutId);
          setError(e.message || String(e));
          setPhase('needs-login');
        }
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
    if (!password) { setError('Enter your password.'); return; }
    setBusy(true); setError(null);
    try {
      const { session, profile } = await CABT_signInWithPassword(email, password);
      if (session) onAuthed && onAuthed(session, profile);
    } catch (e2) {
      setError(e2.message || 'Sign-in failed.');
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
        <div style={{
          fontSize: 13, color: theme.inkSoft, lineHeight: 1.55,
          fontFamily: theme.serif, fontStyle: 'italic', marginBottom: 24,
        }}>
          Sign in with your email and password.
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
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
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={openReset}
            disabled={busy}
            style={{
              background: 'none', border: 'none', padding: '6px 0', marginTop: 2,
              fontFamily: 'inherit', fontSize: 12, color: theme.inkMuted,
              textDecoration: 'underline', cursor: busy ? 'wait' : 'pointer',
              alignSelf: 'center',
            }}
          >
            Forgot password?
          </button>
        </form>

        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: '#FFE5E5', color: '#9B1B1B', fontSize: 12, textAlign: 'left',
          }}>
            <strong>Couldn't sign in.</strong> {error}
          </div>
        )}

        <div style={{ marginTop: 36, fontSize: 11, color: theme.inkMuted, lineHeight: 1.6 }}>
          No account? Ask Bobby to create one for you.
        </div>
      </div>

      {showReset && (
        <div
          onClick={closeReset}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.surface || theme.bg, color: theme.ink,
              borderRadius: 16, padding: '22px 22px 20px', width: '100%', maxWidth: 360,
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)', position: 'relative',
              fontFamily: theme.sans,
            }}
          >
            <button
              type="button"
              onClick={closeReset}
              aria-label="Close"
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'none', border: 'none', color: theme.inkMuted,
                fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 6,
              }}
            >×</button>

            {!resetSent ? (
              <>
                <div style={{
                  fontFamily: theme.serif, fontSize: 20, fontWeight: 600,
                  letterSpacing: -0.3, marginBottom: 6,
                }}>Reset your password</div>
                <div style={{
                  fontSize: 12, color: theme.inkSoft, lineHeight: 1.5, marginBottom: 16,
                }}>
                  Enter your email and we'll send you a link to set a new password.
                </div>
                <form onSubmit={onResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    disabled={resetBusy}
                    autoFocus
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 10,
                      background: theme.bgElev || theme.bg, color: theme.ink,
                      border: `1px solid ${theme.rule}`, fontFamily: 'inherit',
                      fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <button type="submit" disabled={resetBusy} style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    background: theme.accent, color: theme.accentInk, border: 'none',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                    cursor: resetBusy ? 'wait' : 'pointer', opacity: resetBusy ? 0.6 : 1,
                  }}>
                    {resetBusy ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
                {resetError && (
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 8,
                    background: '#FFE5E5', color: '#9B1B1B', fontSize: 12, lineHeight: 1.45,
                  }}>{resetError}</div>
                )}
              </>
            ) : (
              <>
                <div style={{
                  fontFamily: theme.serif, fontSize: 20, fontWeight: 600,
                  letterSpacing: -0.3, marginBottom: 8,
                }}>Check your email</div>
                <div style={{
                  fontSize: 13, color: theme.inkSoft, lineHeight: 1.55, marginBottom: 18,
                }}>
                  If an account exists for <strong style={{ color: theme.ink }}>{resetEmail}</strong>,
                  we sent a link to reset your password. The link expires in 1 hour.
                </div>
                <button
                  type="button"
                  onClick={closeReset}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    background: theme.accent, color: theme.accentInk, border: 'none',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AuthGate });

// auth-gate.jsx — Google SSO login screen for Supabase mode.
// Renders when apiMode='supabase' AND no session.
// On successful auth, the parent App re-loads state from Supabase.

function AuthGate({ theme, onAuthed }) {
  const [phase, setPhase] = React.useState('checking'); // checking | needs-login | error
  const [error, setError] = React.useState(null);
  const [profile, setProfile] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await CABT_currentSession();
        if (cancelled) return;
        if (!session) { setPhase('needs-login'); return; }
        const prof = await CABT_currentProfile();
        if (cancelled) return;
        setProfile(prof);
        onAuthed && onAuthed(session, prof);
      } catch (e) {
        if (!cancelled) { setError(e.message); setPhase('error'); }
      }
    })();
    // Listen for auth changes (post-redirect)
    let unsub = null;
    CABT_sb().then(sb => {
      const { data } = sb.auth.onAuthStateChange(async (_evt, session) => {
        if (session && !cancelled) {
          const prof = await CABT_currentProfile();
          setProfile(prof);
          onAuthed && onAuthed(session, prof);
        }
      });
      unsub = data?.subscription;
    });
    return () => { cancelled = true; if (unsub) unsub.unsubscribe(); };
  }, []);

  const onSignIn = async () => {
    try { await CABT_signInWithGoogle(); }
    catch (e) { setError(e.message); setPhase('error'); }
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
        }}>CA Bonus Tracker</div>
        <div style={{
          fontSize: 13, color: theme.inkSoft, lineHeight: 1.55,
          fontFamily: theme.serif, fontStyle: 'italic', marginBottom: 28,
        }}>
          GroundStandard internal. Sign in with your <strong>@groundstandard.com</strong> Google account.
        </div>

        <button onClick={onSignIn} style={{
          width: '100%', padding: '14px 18px', borderRadius: 12,
          background: '#fff', color: '#1F1F1F', border: '1px solid #DADCE0',
          fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>

        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: '#FFE5E5', color: '#9B1B1B', fontSize: 12, textAlign: 'left',
          }}>
            <strong>Sign-in failed.</strong> {error}
          </div>
        )}

        <div style={{ marginTop: 36, fontSize: 11, color: theme.inkMuted, lineHeight: 1.6 }}>
          Trouble signing in? Confirm your email is on the <a style={{ color: theme.accent }}>roster</a> in Admin → Roster, or ping Bobby.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AuthGate });

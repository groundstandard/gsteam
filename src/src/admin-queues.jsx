// admin-queues.jsx — Edit Approvals queue + Reviews Inbox.
// Both queues live in Supabase (edit_requests + reviews tables); in local
// mode we show empty/seed states so the UI is reachable for design review.

// Lightweight inline pill (different shape than StatusPill in ui.jsx, which
// hard-codes R/Y/G semantics — this one accepts arbitrary text).
function Pill({ tone = 'gray', theme, children }) {
  const tones = {
    green:  { bg: 'rgba(67,160,71,0.12)',  fg: '#2E7D32' },
    yellow: { bg: 'rgba(249,168,37,0.14)', fg: '#A06800' },
    red:    { bg: 'rgba(229,57,53,0.12)',  fg: '#C62828' },
    blue:   { bg: 'rgba(14,26,53,0.10)',   fg: '#0E1A35' },
    gray:   { bg: theme.rule,              fg: theme.inkSoft },
  };
  const c = tones[tone] || tones.gray;
  return (
    <span style={{
      display: 'inline-block', background: c.bg, color: c.fg,
      borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700,
      letterSpacing: 0.2, textTransform: 'capitalize', lineHeight: 1.4,
    }}>{children}</span>
  );
}

// ── Edit Approvals ──────────────────────────────────────────────────────
function AdminEditApprovals({ state, theme }) {
  const [requests, setRequests] = React.useState(() => state.editRequests || SEED_EDIT_REQUESTS(state));
  const [filter, setFilter] = React.useState('pending'); // pending | approved | rejected
  const [busy, setBusy] = React.useState(null);

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const pending = requests.filter(r => r.status === 'pending').length;

  const decide = async (req, status) => {
    setBusy(req.id);
    if (CABT_getApiMode() === 'supabase') {
      try {
        if (status === 'approved') await CABT_api.approveEditRequest(req.id);
        else {
          const sb = await CABT_sb();
          await sb.from('edit_requests').update({ status: 'rejected' }).eq('id', req.id);
        }
      } catch (e) { console.error(e); }
    }
    setRequests(rs => rs.map(r => r.id === req.id ? { ...r, status, decidedAt: CABT_todayIso() } : r));
    setBusy(null);
  };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="shield" theme={theme}>
        Edits to fields tagged in <strong>Config → edit_fields_requiring_approval</strong> arrive here when made past the {state.config.editGraceDays || state.config.edit_grace_days || 7}-day grace window.
      </Banner>

      <SegBar theme={theme} value={filter} onChange={setFilter} options={[
        { value: 'pending',  label: `Pending${pending ? ` · ${pending}` : ''}` },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'all',      label: 'All' },
      ]}/>

      {filtered.length === 0 && (
        <Card theme={theme}>
          <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24, margin: '0 auto 12px',
              background: theme.rule, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="check" size={22}/></div>
            Queue is clear.
          </div>
        </Card>
      )}

      {filtered.map(r => <EditReqCard key={r.id} req={r} theme={theme}
        onApprove={() => decide(r, 'approved')}
        onReject={() => decide(r, 'rejected')}
        busy={busy === r.id}
      />)}
    </div>
  );
}

function EditReqCard({ req, theme, onApprove, onReject, busy }) {
  const isPending = req.status === 'pending';
  const tone = req.status === 'approved' ? 'green' : req.status === 'rejected' ? 'red' : 'yellow';
  const fields = Object.keys(req.fieldChanges || {});
  return (
    <Card theme={theme} padding={14}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink }}>
          {req.tableName} · {req.rowId}
        </div>
        <Pill tone={tone} theme={theme}>{req.status}</Pill>
      </div>
      <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 10 }}>
        Requested by {req.requestedByName || req.requestedBy} · {CABT_fmtDate(req.createdAt || CABT_todayIso())}
      </div>

      <div style={{ background: theme.bg, borderRadius: 8, padding: 10, marginBottom: 10 }}>
        {fields.map(f => {
          const change = req.fieldChanges[f];
          return (
            <div key={f} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '4px 0', alignItems: 'baseline' }}>
              <div style={{ width: 110, color: theme.inkMuted, fontFamily: theme.mono, fontSize: 11 }}>{f}</div>
              <div style={{ color: '#9B1B1B', textDecoration: 'line-through', fontFamily: theme.mono, fontSize: 12 }}>
                {String(change.from ?? '—')}
              </div>
              <div style={{ color: theme.inkMuted }}>→</div>
              <div style={{ color: '#1F6E1F', fontFamily: theme.mono, fontSize: 12, fontWeight: 600 }}>
                {String(change.to ?? '—')}
              </div>
            </div>
          );
        })}
      </div>

      {req.reason && (
        <div style={{
          fontSize: 12, color: theme.inkSoft, fontStyle: 'italic',
          fontFamily: theme.serif, marginBottom: 12, lineHeight: 1.4,
        }}>"{req.reason}"</div>
      )}

      {isPending && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button theme={theme} variant="primary" size="sm" fullWidth onClick={onApprove} disabled={busy}>Approve</Button>
          <Button theme={theme} variant="ghost" size="sm" fullWidth onClick={onReject} disabled={busy}>Reject</Button>
        </div>
      )}
    </Card>
  );
}

// Seed data for local mode — so the screen is reachable in demo
function SEED_EDIT_REQUESTS(state) {
  if (state._live) return [];
  return [
    {
      id: 'ER-001', tableName: 'monthly_metrics', rowId: 'MM-2026-01-CL-003',
      requestedBy: 'CA-02', requestedByName: 'Mike Chen',
      createdAt: '2026-04-08',
      fieldChanges: {
        client_mrr:  { from: 4500, to: 4750 },
        ad_spend:    { from: 380,  to: 420  },
      },
      reason: 'Stripe invoice was paid late, originally logged at draft amount. Corrected against the actual deposit.',
      status: 'pending',
    },
    {
      id: 'ER-002', tableName: 'surveys', rowId: 'SV-018',
      requestedBy: 'CA-01', requestedByName: 'Sarah Greenfield',
      createdAt: '2026-04-05',
      fieldChanges: { score: { from: 6, to: 8 } },
      reason: 'Client originally rated 6, called back to clarify they meant 8. Voicemail saved.',
      status: 'pending',
    },
    {
      id: 'ER-003', tableName: 'growth_events', rowId: 'GE-024',
      requestedBy: 'CA-03', requestedByName: 'Devon Marsh',
      createdAt: '2026-03-28',
      fieldChanges: { date: { from: '2026-03-15', to: '2026-03-22' } },
      reason: 'Wrong date entered.', status: 'approved', decidedAt: '2026-03-29',
    },
  ];
}

// ── Reviews Inbox ───────────────────────────────────────────────────────
function AdminReviewsInbox({ state, theme }) {
  const [reviews, setReviews] = React.useState(() => state.reviews || SEED_REVIEWS(state));
  const [filter, setFilter] = React.useState('unmatched');

  const counts = {
    unmatched: reviews.filter(r => !r.clientId).length,
    matched:   reviews.filter(r => r.clientId).length,
    flagged:   reviews.filter(r => r.flagged).length,
  };
  const list = reviews.filter(r => {
    if (filter === 'unmatched') return !r.clientId;
    if (filter === 'matched')   return r.clientId;
    if (filter === 'flagged')   return r.flagged;
    return true;
  });

  const assign = async (reviewId, clientId) => {
    if (CABT_getApiMode() === 'supabase') {
      try {
        const sb = await CABT_sb();
        await sb.from('reviews').update({ client_id: clientId, link_method: 'manual' }).eq('id', reviewId);
      } catch (e) { console.error(e); }
    }
    setReviews(rs => rs.map(r => r.id === reviewId ? { ...r, clientId } : r));
  };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="star" theme={theme}>
        Google, Facebook, Yelp, and Trustpilot reviews are polled every 6 hours. Anything that didn't auto-match a client lands here.
      </Banner>

      <SegBar theme={theme} value={filter} onChange={setFilter} options={[
        { value: 'unmatched', label: `Unmatched${counts.unmatched ? ` · ${counts.unmatched}` : ''}` },
        { value: 'matched',   label: 'Matched' },
        { value: 'flagged',   label: 'Flagged' },
      ]}/>

      {list.length === 0 && (
        <Card theme={theme}>
          <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24, margin: '0 auto 12px',
              background: theme.rule, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="check" size={22}/></div>
            {filter === 'unmatched' ? 'All reviews are matched.' : 'Nothing here.'}
          </div>
        </Card>
      )}

      {list.map(r => (
        <ReviewCard key={r.id} review={r} state={state} theme={theme}
          onAssign={(cid) => assign(r.id, cid)}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review, state, theme, onAssign }) {
  const [picking, setPicking] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const sourceLogo = ({
    google:     { label: 'Google',     color: '#4285F4' },
    facebook:   { label: 'Facebook',   color: '#1877F2' },
    yelp:       { label: 'Yelp',       color: '#D32323' },
    trustpilot: { label: 'Trustpilot', color: '#00B67A' },
  })[review.source] || { label: review.source, color: theme.accent };
  const matchedClient = review.clientId && state.clients.find(c => c.id === review.clientId);

  const candidates = state.clients.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase()) || c.id.toLowerCase().includes(filter.toLowerCase())
  ).slice(0, 6);

  return (
    <Card theme={theme} padding={14}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 4, background: sourceLogo.color, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
          }}>{sourceLogo.label[0]}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.ink }}>{review.sourceBusinessName}</div>
        </div>
        <Stars n={review.rating} theme={theme}/>
      </div>
      <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 10 }}>
        {review.reviewerName || 'Anonymous'} · {CABT_fmtDate(review.reviewedAt)}
      </div>
      {review.body && (
        <div style={{
          fontSize: 13, color: theme.inkSoft, fontFamily: theme.serif, fontStyle: 'italic',
          lineHeight: 1.5, marginBottom: 12,
        }}>"{review.body}"</div>
      )}

      {matchedClient ? (
        <div style={{
          fontSize: 12, color: theme.inkSoft, padding: '8px 10px',
          background: theme.bg, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="check" size={12} color={STATUS.green}/>
          Matched to <strong>{matchedClient.name}</strong>
          <span style={{ flex: 1 }}/>
          <button onClick={() => onAssign(null)} style={{
            background: 'transparent', border: 'none', color: theme.inkMuted, fontSize: 11,
            cursor: 'pointer', textDecoration: 'underline',
          }}>Change</button>
        </div>
      ) : !picking ? (
        <Button theme={theme} variant="primary" size="sm" fullWidth onClick={() => setPicking(true)}>
          Assign to client
        </Button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="text" placeholder="Search clients…" autoFocus
            value={filter} onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.rule}`,
              fontSize: 13, fontFamily: 'inherit', background: theme.surface, color: theme.ink,
            }}/>
          {candidates.map(c => (
            <button key={c.id} onClick={() => { onAssign(c.id); setPicking(false); }} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: theme.bg, border: `1px solid ${theme.rule}`,
              borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, color: theme.ink, textAlign: 'left',
            }}>
              <span>{c.name}</span>
              <span style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>{c.id}</span>
            </button>
          ))}
          <button onClick={() => setPicking(false)} style={{
            background: 'transparent', border: 'none', color: theme.inkMuted, fontSize: 11,
            cursor: 'pointer', padding: 4,
          }}>Cancel</button>
        </div>
      )}
    </Card>
  );
}

function Stars({ n, theme }) {
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{
          color: i <= Math.round(n) ? '#F4C430' : theme.rule, fontSize: 13,
        }}>★</span>
      ))}
      <span style={{ fontSize: 11, color: theme.inkMuted, marginLeft: 4 }}>{n.toFixed(1)}</span>
    </div>
  );
}

function SegBar({ value, onChange, options, theme }) {
  return (
    <div style={{
      display: 'flex', background: theme.rule + '60', borderRadius: 999, padding: 2, gap: 0,
    }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 999,
          background: value === o.value ? theme.surface : 'transparent',
          color: value === o.value ? theme.ink : theme.inkMuted,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: value === o.value ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function SEED_REVIEWS(state) {
  if (state._live) return [];
  const today = new Date();
  const dt = (offset) => { const d = new Date(today); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };
  return [
    { id: 'RV-001', source: 'google', sourceReviewId: 'g_aH7x', sourceBusinessName: 'Iron Lake Tactical',
      rating: 5, body: 'Brought my whole family for the carry course. Patient instructors, well-run range. Will be back.',
      reviewerName: 'M. Clark', reviewedAt: dt(2), clientId: null, flagged: false },
    { id: 'RV-002', source: 'facebook', sourceReviewId: 'fb_4421', sourceBusinessName: 'Greenline Defense',
      rating: 4, body: 'Solid intro class. Wish there was more time on draw work but overall good.',
      reviewerName: 'Jamie Rosen', reviewedAt: dt(4), clientId: null, flagged: false },
    { id: 'RV-003', source: 'yelp', sourceReviewId: 'y_8821', sourceBusinessName: 'Cottonwood Range',
      rating: 5, body: 'Booked the private bay for a birthday — instructor stayed late to help my dad get comfortable.',
      reviewerName: 'A. Patel', reviewedAt: dt(7),
      clientId: state.clients[1]?.id || null, flagged: false },
    { id: 'RV-004', source: 'google', sourceReviewId: 'g_kj99', sourceBusinessName: 'Range 22 (closed account)',
      rating: 2, body: 'Membership rates went up without notice. Disappointed.',
      reviewerName: 'Anonymous', reviewedAt: dt(11), clientId: null, flagged: true },
  ];
}

Object.assign(window, { AdminEditApprovals, AdminReviewsInbox });

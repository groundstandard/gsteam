// admin-app.jsx — Admin persona screens

function AdminApprovals({ state, theme, onApprove, onReject, onAssignCA }) {
  const pending = state.adjustments.filter(a => a.status === 'Pending');
  const unassigned = state.clients.filter(c => !c.assignedCA && !c.cancelDate);
  const cas = state.cas.filter(c => c.active);

  // Diagnostics
  const missingMonth = state.monthlyMetrics.filter(m => !m.month).length;
  const noRetainer = state.clients.filter(c => c.signDate && !c.monthlyRetainer).length;
  const eventsNoAmount = state.growthEvents.filter(e => e.eventType === 'Gear Sale' && !e.saleTotal).length;

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionLabel theme={theme}>
          <span>Adjustments · {pending.length}</span>
        </SectionLabel>
        {pending.length === 0 && <Card theme={theme}><div style={{ color: theme.inkMuted, fontSize: 13 }}>No pending adjustments.</div></Card>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map(a => {
            const r = state.sales.find(s => s.id === a.repId);
            return (
              <Card theme={theme} key={a.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink }}>{r?.name} · {a.type}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtMoney(a.amount)}</div>
                </div>
                <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 8 }}>
                  {CABT_fmtDate(a.date)} · {a.period} · {a.role}
                </div>
                <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 12, lineHeight: 1.4 }}>{a.reason}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button theme={theme} variant="secondary" size="sm" onClick={() => onReject(a.id)}>Reject</Button>
                  <Button theme={theme} variant="primary" size="sm" fullWidth onClick={() => onApprove(a.id)}>Approve</Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <SectionLabel theme={theme}>Unassigned clients · {unassigned.length}</SectionLabel>
        {unassigned.length === 0 && <Card theme={theme}><div style={{ color: theme.inkMuted, fontSize: 13 }}>All clients assigned.</div></Card>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unassigned.map(c => (
            <Card theme={theme} key={c.id} padding={14}>
              <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, marginBottom: 4 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 10 }}>
                Signed {CABT_fmtDate(c.signDate)} · {CABT_fmtMoney(c.monthlyRetainer)}/mo
              </div>
              <Field label="Assign CA" theme={theme}>
                <Select value="" onChange={(v) => onAssignCA(c.id, v)}
                        options={cas.map(ca => ({ value: ca.id, label: `${ca.id} · ${ca.name}` }))} theme={theme}/>
              </Field>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel theme={theme}>Diagnostics</SectionLabel>
        <Card theme={theme} padding={0}>
          <DiagRow theme={theme} label="Monthly metrics missing month" value={missingMonth} status={missingMonth ? 'red' : 'green'}/>
          <DiagRow theme={theme} label="Clients with sign date but no retainer" value={noRetainer} status={noRetainer ? 'yellow' : 'green'}/>
          <DiagRow theme={theme} label="Gear Sale events without amount" value={eventsNoAmount} status={eventsNoAmount ? 'yellow' : 'green'} last/>
        </Card>
      </div>
    </div>
  );
}

function DiagRow({ theme, label, value, status, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: last ? 'none' : `1px solid ${theme.rule}`, gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[status] }}/>
      <span style={{ flex: 1, fontSize: 14, color: theme.ink }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function AdminConfig({ state, theme, onUpdate }) {
  const cfg = state.config;
  const [local, setLocal] = React.useState(cfg);
  const update = (k, v) => setLocal(l => ({ ...l, [k]: v }));
  const save = () => onUpdate(local);
  return (
    <div style={{ padding: '8px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Grace & quarter</SectionLabel>
        <Field label="Grace period (days)" theme={theme}><Input type="number" value={local.gracePeriodDays} onChange={(v) => update('gracePeriodDays', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Quarter start" theme={theme}><Input type="date" value={local.quarterStart} onChange={(v) => update('quarterStart', v)} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Quarter end" theme={theme}><Input type="date" value={local.quarterEnd} onChange={(v) => update('quarterEnd', v)} theme={theme}/></Field>
      </Card>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Ad spend targets</SectionLabel>
        <Field label="Ad spend floor" theme={theme}><Input type="number" prefix="$" value={local.adSpendFloor} onChange={(v) => update('adSpendFloor', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="% of gross" theme={theme}><Input type="number" suffix="×" value={local.adSpendPctOfGross} onChange={(v) => update('adSpendPctOfGross', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Over-delivery cap" theme={theme}><Input type="number" suffix="×" value={local.adSpendOverDeliveryCap} onChange={(v) => update('adSpendOverDeliveryCap', Number(v))} theme={theme}/></Field>
      </Card>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Funnel floors</SectionLabel>
        <Field label="Booking floor" theme={theme}><Input type="number" suffix="×" value={local.bookingFloor} onChange={(v) => update('bookingFloor', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Show floor" theme={theme}><Input type="number" suffix="×" value={local.showFloor} onChange={(v) => update('showFloor', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Close floor" theme={theme}><Input type="number" suffix="×" value={local.closeFloor} onChange={(v) => update('closeFloor', Number(v))} theme={theme}/></Field>
      </Card>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Attrition & satisfaction</SectionLabel>
        <Field label="Green attrition floor" theme={theme}><Input type="number" suffix="×" value={local.attritionGreenFloor} onChange={(v) => update('attritionGreenFloor', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Critical attrition ceiling" theme={theme}><Input type="number" suffix="×" value={local.attritionCriticalCeiling} onChange={(v) => update('attritionCriticalCeiling', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Satisfaction lookback (months)" theme={theme}><Input type="number" value={local.satisfactionLookbackMonths} onChange={(v) => update('satisfactionLookbackMonths', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="No-response penalty" theme={theme}><Input type="number" suffix="×" value={local.noResponsePenalty} onChange={(v) => update('noResponsePenalty', Number(v))} theme={theme}/></Field>
      </Card>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Commission rates</SectionLabel>
        <Field label="Membership revenue rate" theme={theme}><Input type="number" suffix="×" value={local.membershipRevenueRate} onChange={(v) => update('membershipRevenueRate', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="SDR flat fee per booking" theme={theme}><Input type="number" prefix="$" value={local.sdrFlatFeePerBooking} onChange={(v) => update('sdrFlatFeePerBooking', Number(v))} theme={theme}/></Field>
      </Card>
      <StickyBar theme={theme}>
        <Button theme={theme} variant="primary" fullWidth onClick={save}>Save config</Button>
      </StickyBar>
    </div>
  );
}

function AdminRoster({ state, theme, onReload, onToast }) {
  const [showInvite, setShowInvite] = React.useState(false);
  const callerRole = state.me?.role;
  const canInvite = callerRole === 'owner' || callerRole === 'admin';
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {canInvite && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button theme={theme} variant="primary" size="sm" icon="plus" onClick={() => setShowInvite(true)}>
            Invite
          </Button>
        </div>
      )}
      {showInvite && (
        <InviteTeammateModal
          theme={theme}
          state={state}
          onClose={() => setShowInvite(false)}
          onSuccess={(msg) => {
            setShowInvite(false);
            if (typeof onToast === 'function') onToast(msg || 'Invited ✓');
            if (typeof onReload === 'function') onReload();
          }}
        />
      )}
      <div>
        <SectionLabel theme={theme}>Client Associates · {state.cas.length}</SectionLabel>
        <Card theme={theme} padding={0}>
          {state.cas.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i === state.cas.length - 1 ? 'none' : `1px solid ${theme.rule}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: theme.accent + '15', color: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                {c.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{c.id} · {c.name}</div>
                <div style={{ fontSize: 12, color: theme.inkMuted }}>{c.email}</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: c.active ? STATUS.green + '22' : theme.rule, color: c.active ? '#2E7D32' : theme.inkMuted, fontWeight: 600 }}>
                {c.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </Card>
      </div>
      <div>
        <SectionLabel theme={theme}>Sales Team · {state.sales.length}</SectionLabel>
        <Card theme={theme} padding={0}>
          {state.sales.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i === state.sales.length - 1 ? 'none' : `1px solid ${theme.rule}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: theme.gold + '22', color: theme.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                {s.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{s.id} · {s.name}</div>
                <div style={{ fontSize: 12, color: theme.inkMuted }}>{s.role} · since {CABT_fmtDate(s.startDate)}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ── F1.1.1 — Invite Teammate modal ──────────────────────────────────────────
const INVITE_ERROR_COPY = {
  forbidden: 'You don\'t have permission to invite teammates.',
  bad_email: 'That doesn\'t look like a valid email.',
  missing_display_name: 'Display name is required.',
  bad_role: 'Pick a role.',
  weak_password: 'Password must be at least 8 characters.',
  ca_id_required: 'CA id is required for the Client Associate role.',
  sales_role_required: 'Pick AM or RDR for sales hires.',
  sales_id_required: 'Sales id (e.g. AM-02) is required.',
  create_user_failed: 'Could not create the auth user — email may already exist.',
  profile_insert_failed: 'Could not create the profile row.',
  ca_insert_failed: 'Could not create the CA roster row — id may be taken.',
  sales_insert_failed: 'Could not create the sales-team row — id may be taken.',
  not_signed_in: 'Your session expired. Sign in again.',
  invalid_token: 'Your session expired. Sign in again.',
};

// Compute next sequential id like 'CA-03' / 'AM-04' / 'RDR-01'.
// Strategy: max numeric suffix + 1 (avoids reusing IDs even if rows were deleted).
function CABT_nextSeqId(prefix, existingIds) {
  let max = 0;
  const re = new RegExp('^' + prefix + '-(\\d+)$');
  for (const id of existingIds || []) {
    const m = re.exec(String(id || ''));
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return prefix + '-' + String(max + 1).padStart(2, '0');
}

function InviteTeammateModal({ theme, state, onClose, onSuccess }) {
  // formRole is the UI selection; we map AM/RDR back to role='sales' at submit.
  const [formRole, setFormRole] = React.useState('ca');
  const [email, setEmail] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState(null);

  // Auto-assigned id, computed from existing roster — recomputed on role change.
  const autoId = React.useMemo(() => {
    if (formRole === 'ca')  return CABT_nextSeqId('CA',  (state?.cas   || []).map(c => c.id));
    if (formRole === 'am')  return CABT_nextSeqId('AM',  (state?.sales || []).filter(s => s.role === 'AM' ).map(s => s.id));
    if (formRole === 'rdr') return CABT_nextSeqId('RDR', (state?.sales || []).filter(s => s.role === 'RDR').map(s => s.id));
    return null; // owner/admin/integrator have no roster id
  }, [formRole, state]);

  // Owner is intentionally not in this list — there's only one Owner (Bobby)
  // and it's never created via the Invite flow. Admin is selectable for FIs
  // who should have full-privilege access.
  const ROLE_OPTIONS = [
    { value: 'admin',      label: 'Admin' },
    { value: 'integrator', label: 'Fractional Integrator' },
    { value: 'ca',         label: 'Client Associate' },
    { value: 'am',         label: 'Account Manager' },
    { value: 'rdr',        label: 'Relationship Development Rep' },
  ];

  // Translate UI role → DB role + salesRole
  const dbRoleFor = (fr) => {
    if (fr === 'am' || fr === 'rdr') return 'sales';
    return fr;
  };
  const dbSalesRoleFor = (fr) => {
    if (fr === 'am')  return 'AM';
    if (fr === 'rdr') return 'RDR';
    return null;
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrMsg(null);
    if (!email.trim()) return setErrMsg('Email is required.');
    if (!displayName.trim()) return setErrMsg('Display name is required.');
    if (!password || password.length < 8) return setErrMsg('Password must be at least 8 characters.');
    setSubmitting(true);
    try {
      await CABT_inviteUser({
        email: email.trim(),
        displayName: displayName.trim(),
        role: dbRoleFor(formRole),
        password,
        caId:      formRole === 'ca'                       ? autoId : null,
        salesRole: dbSalesRoleFor(formRole),
        salesId:   (formRole === 'am' || formRole === 'rdr') ? autoId : null,
      });
      onSuccess('Invited ' + email.trim());
    } catch (err) {
      const code = err && err.message;
      setErrMsg(INVITE_ERROR_COPY[code] || (err.detail ? `${code}: ${err.detail}` : code) || 'Invite failed.');
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bg, width: '100%', maxWidth: 520, maxHeight: '92vh',
          borderTopLeftRadius: theme.radius, borderTopRightRadius: theme.radius,
          padding: '20px 18px 24px', overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.ink }}>Invite teammate</div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', color: theme.inkMuted,
              fontSize: 22, cursor: 'pointer', padding: 4,
            }}
          >×</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Email" required theme={theme}>
            <Input value={email} onChange={setEmail} type="email" placeholder="person@example.com" theme={theme} autoFocus/>
          </Field>
          <Field label="Display name" required theme={theme}>
            <Input value={displayName} onChange={setDisplayName} placeholder="Full name" theme={theme}/>
          </Field>
          <Field label="Role" required theme={theme}>
            <Select value={formRole} onChange={setFormRole} options={ROLE_OPTIONS} theme={theme}/>
          </Field>

          {autoId && (
            <Field label="Assigned ID" hint="Auto-assigned, next in sequence." theme={theme}>
              <div style={{
                display: 'flex', alignItems: 'center', height: 48,
                background: theme.bgElev, border: `1px solid ${theme.rule}`,
                borderRadius: theme.radius - 4, padding: '0 14px',
                color: theme.ink, fontSize: 16, fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {autoId}
              </div>
            </Field>
          )}

          <Field label="Initial password" required hint="Min 8 chars. Teammate can change later." theme={theme}>
            <Input value={password} onChange={setPassword} type="password" placeholder="••••••••" theme={theme}/>
          </Field>

          {errMsg && (
            <div style={{
              background: STATUS.red + '15', color: STATUS.red, border: `1px solid ${STATUS.red}33`,
              borderRadius: theme.radius - 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.4,
            }}>
              {errMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Button theme={theme} variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button theme={theme} variant="primary" fullWidth type="submit" disabled={submitting} onClick={submit}>
              {submitting ? 'Inviting…' : 'Send invite'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

Object.assign(window, { AdminApprovals, AdminConfig, AdminRoster, DiagRow, InviteTeammateModal });

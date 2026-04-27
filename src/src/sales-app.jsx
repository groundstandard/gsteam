// sales-app.jsx — Sales persona screens

function SalesHome({ state, rep, theme, navigate }) {
  const r = CABT_salesRollup(rep.id, state);
  if (!r) return null;
  const pendingAdj = state.adjustments.filter(a => a.repId === rep.id && a.status === 'Pending').length;
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: theme.accent, color: theme.accentInk,
        borderRadius: theme.radius + 4, padding: '22px',
      }}>
        <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>{rep.role} · {rep.name}</div>
        <div style={{ fontFamily: theme.serif, fontSize: 42, fontWeight: 600, marginTop: 6, letterSpacing: -1, lineHeight: 1 }}>
          {CABT_fmtMoney(r.paidYtd)}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>YTD earned · <span style={{ color: theme.gold, fontWeight: 600 }}>{CABT_fmtMoney(r.pending)}</span> pending</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Card theme={theme}>
          <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>Active contracts</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: theme.ink, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{r.activeContracts}</div>
        </Card>
        <Card theme={theme}>
          <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>Pending adj</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: theme.ink, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{pendingAdj}</div>
        </Card>
      </div>
      <div>
        <SectionLabel theme={theme}>Upcoming · next 30 days</SectionLabel>
        <Card theme={theme} padding={0}>
          {r.upcoming.length === 0 && <div style={{ padding: 16, color: theme.inkMuted, fontSize: 13 }}>Nothing coming up.</div>}
          {r.upcoming.map((m, i) => {
            const c = state.clients.find(cl => cl.id === m.clientId);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: i === r.upcoming.length - 1 ? 'none' : `1px solid ${theme.rule}` }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: theme.gold + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="cash" size={16} color={theme.gold}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{c?.name} · {m.label}</div>
                  <div style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtDate(m.date)}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtMoney(m.amount)}</div>
              </div>
            );
          })}
        </Card>
      </div>
      <Button theme={theme} icon="plus" fullWidth onClick={() => navigate('log-contract')}>Log new contract</Button>
      <Button theme={theme} icon="edit" variant="secondary" fullWidth onClick={() => navigate('log-adjustment')}>Log adjustment</Button>
    </div>
  );
}

function LogContractForm({ state, rep, theme, navigate, onSubmit }) {
  const [form, setForm] = React.useState({
    name: '',
    stripeId: '',
    signDate: CABT_todayIso(),
    monthlyRetainer: '',
    termMonths: 12,
    ae: rep.role === 'AE' ? rep.id : '',
    sdrBookedBy: '',
    upfrontPct: rep.upfrontRate || 0.10,
    midPct: rep.midRate || 0.05,
    endPct: rep.endRate || 0.05,
    hasMembershipAddon: false,
    membershipStartDate: '',
    notes: '',
  });
  const [errors, setErrors] = React.useState({});
  const aes = state.sales.filter(s => s.role === 'AE').map(s => ({ value: s.id, label: s.name }));
  const sdrs = [{ value: '', label: 'None' }, ...state.sales.filter(s => s.role === 'SDR').map(s => ({ value: s.id, label: s.name }))];

  const validate = () => {
    const e = {};
    if (!form.name) e.name = 'Required';
    if (!form.signDate) e.signDate = 'Required';
    if (new Date(form.signDate) > new Date()) e.signDate = 'Cannot be in the future';
    if (!form.monthlyRetainer) e.monthlyRetainer = 'Required';
    if (!form.termMonths) e.termMonths = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const submit = () => {
    if (!validate()) return;
    onSubmit({
      id: `C-${Date.now()}`,
      name: form.name, stripeId: form.stripeId,
      signDate: form.signDate, cancelDate: '',
      monthlyRetainer: Number(form.monthlyRetainer),
      hasMembershipAddon: form.hasMembershipAddon,
      termMonths: Number(form.termMonths),
      ae: form.ae, sdrBookedBy: form.sdrBookedBy,
      upfrontPct: Number(form.upfrontPct), midPct: Number(form.midPct), endPct: Number(form.endPct),
      membershipStartDate: form.hasMembershipAddon ? form.membershipStartDate : '',
      assignedCA: '', // Bobby assigns later
    });
  };
  return (
    <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="alert" theme={theme}>
        CA assignment is left blank — admin will assign after you submit.
      </Banner>
      <Field label="Business name" required error={errors.name} theme={theme}>
        <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} theme={theme} placeholder="e.g. Ronin BJJ Austin"/>
      </Field>
      <Field label="Stripe customer ID" hint="Optional — for future automation" theme={theme}>
        <Input value={form.stripeId} onChange={(v) => setForm({ ...form, stripeId: v })} theme={theme} placeholder="cus_..."/>
      </Field>
      <Field label="Sign date" required error={errors.signDate} theme={theme}>
        <Input type="date" value={form.signDate} onChange={(v) => setForm({ ...form, signDate: v })} theme={theme}/>
      </Field>
      <Field label="Monthly retainer" required error={errors.monthlyRetainer} theme={theme}>
        <Input type="number" inputmode="decimal" prefix="$" value={form.monthlyRetainer} onChange={(v) => setForm({ ...form, monthlyRetainer: v })} theme={theme}/>
      </Field>
      <Field label="Term (months)" required error={errors.termMonths} theme={theme}>
        <Input type="number" inputmode="numeric" value={form.termMonths} onChange={(v) => setForm({ ...form, termMonths: v })} theme={theme}/>
      </Field>
      <Field label="AE" theme={theme}>
        <Select value={form.ae} onChange={(v) => setForm({ ...form, ae: v })} options={aes} theme={theme}/>
      </Field>
      <Field label="SDR who booked" theme={theme}>
        <Select value={form.sdrBookedBy} onChange={(v) => setForm({ ...form, sdrBookedBy: v })} options={sdrs} theme={theme}/>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Field label="Upfront %" theme={theme}>
          <Input type="number" inputmode="decimal" suffix="×" value={form.upfrontPct} onChange={(v) => setForm({ ...form, upfrontPct: v })} theme={theme}/>
        </Field>
        <Field label="Mid %" theme={theme}>
          <Input type="number" inputmode="decimal" suffix="×" value={form.midPct} onChange={(v) => setForm({ ...form, midPct: v })} theme={theme}/>
        </Field>
        <Field label="End %" theme={theme}>
          <Input type="number" inputmode="decimal" suffix="×" value={form.endPct} onChange={(v) => setForm({ ...form, endPct: v })} theme={theme}/>
        </Field>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>Membership add-on?</div>
          <div style={{ fontSize: 12, color: theme.inkMuted }}>Adds 5% revenue share</div>
        </div>
        <Toggle value={form.hasMembershipAddon} onChange={(v) => setForm({ ...form, hasMembershipAddon: v })} theme={theme}/>
      </div>
      {form.hasMembershipAddon && (
        <Field label="Membership start date" theme={theme}>
          <Input type="date" value={form.membershipStartDate} onChange={(v) => setForm({ ...form, membershipStartDate: v })} theme={theme}/>
        </Field>
      )}
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>Save contract</Button>
      </StickyBar>
    </div>
  );
}

function SalesCommissions({ state, rep, theme }) {
  const r = CABT_salesRollup(rep.id, state);
  if (!r) return null;
  const aeYtd = state.sales.filter(s => s.role === 'AE').reduce((s, ae) => s + (CABT_salesRollup(ae.id, state)?.paidYtd || 0), 0);
  const sdrYtd = state.sales.filter(s => s.role === 'SDR').reduce((s, sd) => s + (CABT_salesRollup(sd.id, state)?.paidYtd || 0), 0);

  // 12-month calendar
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    months.push({ key: d.toISOString().slice(0,7), label: d.toLocaleDateString('en-US', { month: 'short' }), year: d.getFullYear() });
  }
  const monthTotals = months.map(m => {
    const total = r.milestones.filter(ms => ms.date.slice(0,7) === m.key).reduce((s, ms) => s + ms.amount, 0);
    return { ...m, total };
  });
  const maxMonth = Math.max(1, ...monthTotals.map(m => m.total));

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <KPI theme={theme} label="AE Paid YTD" value={CABT_fmtMoney(aeYtd)} />
        <KPI theme={theme} label="AE Pending" value={CABT_fmtMoney(r.pending)} />
        <KPI theme={theme} label="SDR YTD" value={CABT_fmtMoney(sdrYtd)} />
        <KPI theme={theme} label="Active contracts" value={r.activeContracts} />
      </div>

      <Card theme={theme}>
        <SectionLabel theme={theme}>12-month calendar</SectionLabel>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90, marginTop: 4 }}>
          {monthTotals.map((m, i) => {
            const isCurrent = m.key === now.toISOString().slice(0,7);
            const h = m.total > 0 ? (m.total / maxMonth * 64) + 8 : 4;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%', height: h, background: isCurrent ? theme.accent : theme.gold,
                  opacity: m.total === 0 ? 0.18 : 1,
                  borderRadius: 3, transition: 'height .3s',
                }}/>
                <div style={{ fontSize: 9, color: theme.inkMuted, fontWeight: 600 }}>{m.label}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <SectionLabel theme={theme}>Contracts · {r.contracts.length}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {r.contracts.map(c => {
            const ms = r.milestones.filter(m => m.clientId === c.id);
            const value = c.monthlyRetainer * c.termMonths;
            return (
              <Card theme={theme} key={c.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, letterSpacing: -0.15 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtMoney(value)} value</div>
                </div>
                <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 8 }}>
                  {CABT_fmtMoney(c.monthlyRetainer)}/mo · {c.termMonths}mo · Signed {CABT_fmtDate(c.signDate)}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ms.map((m, i) => {
                    const colors = { paid: STATUS.green, pending: STATUS.yellow, clawed: STATUS.red };
                    return (
                      <div key={i} style={{ flex: 1, padding: '6px 8px', background: colors[m.status] + '14', borderRadius: 6, border: `1px solid ${colors[m.status]}33` }}>
                        <div style={{ fontSize: 10, color: theme.inkMuted, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>{m.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtMoney(m.amount)}</div>
                        <div style={{ fontSize: 10, color: colors[m.status], textTransform: 'capitalize', fontWeight: 600 }}>{m.status}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KPI({ theme, label, value }) {
  return (
    <Card theme={theme} padding={14}>
      <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: theme.ink, marginTop: 4, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3 }}>{value}</div>
    </Card>
  );
}

function LogAdjustmentForm({ state, rep, theme, isAdmin, navigate, onSubmit }) {
  const [form, setForm] = React.useState({
    date: CABT_todayIso(), repId: rep.id, role: rep.role, type: '',
    amount: '', reason: '', linkedClient: '', period: 'Q2 2026',
    status: 'Pending',
  });
  const [errors, setErrors] = React.useState({});
  const validate = () => {
    const e = {};
    if (!form.repId) e.repId = 'Required';
    if (!form.type) e.type = 'Required';
    if (!form.amount) e.amount = 'Required';
    if (!form.reason) e.reason = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const submit = () => {
    if (!validate()) return;
    onSubmit({ id: `CA-${Date.now()}`, ...form, amount: Number(form.amount) });
  };
  const reps = state.sales.map(s => ({ value: s.id, label: `${s.name} · ${s.role}` }));
  return (
    <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Date" theme={theme}>
        <Input type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} theme={theme}/>
      </Field>
      <Field label="Rep" required error={errors.repId} theme={theme}>
        <Select value={form.repId} onChange={(v) => {
          const r = state.sales.find(s => s.id === v);
          setForm({ ...form, repId: v, role: r?.role || form.role });
        }} options={reps} theme={theme}/>
      </Field>
      <Field label="Type" required error={errors.type} theme={theme}>
        <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={['Draw', 'Bonus', 'Correction', 'Clawback']} theme={theme}/>
      </Field>
      <Field label="Amount" required error={errors.amount} theme={theme}>
        <Input type="number" inputmode="decimal" prefix="$" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} theme={theme}/>
      </Field>
      <Field label="Reason" required error={errors.reason} theme={theme}>
        <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3}
          style={{ width: '100%', minHeight: 70, background: theme.bgElev, border: `1px solid ${theme.rule}`, borderRadius: theme.radius - 4, padding: 12, fontSize: 15, color: theme.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}/>
      </Field>
      <Field label="Linked client" theme={theme}>
        <Select value={form.linkedClient} onChange={(v) => setForm({ ...form, linkedClient: v })}
          options={[{ value: '', label: 'None' }, ...state.clients.map(c => ({ value: c.id, label: c.name }))]} theme={theme}/>
      </Field>
      <Field label="Period" theme={theme}>
        <Select value={form.period} onChange={(v) => setForm({ ...form, period: v })} options={['Q1 2026','Q2 2026','Q3 2026','Q4 2026']} theme={theme}/>
      </Field>
      {isAdmin && (
        <Field label="Status" hint="Admin only — sales submissions default to Pending" theme={theme}>
          <Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={['Pending', 'Paid', 'Rejected']} theme={theme}/>
        </Field>
      )}
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>Submit adjustment</Button>
      </StickyBar>
    </div>
  );
}

Object.assign(window, { SalesHome, LogContractForm, SalesCommissions, LogAdjustmentForm, KPI });

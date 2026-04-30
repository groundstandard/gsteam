// ca-forms.jsx — Log Monthly Metrics, Log Growth Event, Log Survey

// Defined at module scope so parent re-renders don't recreate the component
// reference. If declared inside LogMetricsForm, every keystroke remounts the
// whole section + Inputs lose focus mid-typing.
function SectionCard({ id, title, doneLabel, children, theme, isOpen, done, onToggle }) {
  return (
    <Card theme={theme} padding={0}>
      <button
        onClick={() => onToggle(id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', width: '100%', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 11,
          background: done ? STATUS.green : 'transparent',
          border: `1.5px solid ${done ? STATUS.green : theme.rule}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {done && <Icon name="check" size={13} color="#fff" stroke={2.5}/>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, letterSpacing: -0.15 }}>{title}</div>
          {!isOpen && doneLabel && <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2 }}>{doneLabel}</div>}
        </div>
        <Icon name={isOpen ? 'chev-u' : 'chev-d'} size={18} color={theme.inkMuted} />
      </button>
      {isOpen && (
        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
      )}
    </Card>
  );
}

// ── Smart-card form for Monthly Metrics ────────────────────────────────────
function LogMetricsForm({ state, ca, theme, presetClientId, navigate, onSubmit, editingId }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const editing = editingId ? state.monthlyMetrics.find(m => m.id === editingId) : null;

  // Prefill from last month's row for this client
  const getLastForClient = (cid) => {
    if (!cid) return null;
    return state.monthlyMetrics
      .filter(m => m.clientId === cid)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
  };

  const initialClient = editing?.clientId || presetClientId || (myClients[0]?.id ?? '');
  const lastForInit = getLastForClient(initialClient);

  const [form, setForm] = React.useState(editing ? { ...editing } : {
    clientId: initialClient,
    month: CABT_currentMonthIso(),
    clientMRR: lastForInit?.clientMRR ?? '',
    leadCost: lastForInit?.leadCost ?? '',
    adSpend: lastForInit?.adSpend ?? '',
    clientGrossRevenue: lastForInit?.clientGrossRevenue ?? '',
    leadsGenerated: '',
    apptsBooked: '',
    leadsShowed: '',
    leadsSigned: '',
    totalStudentsStart: lastForInit?.totalStudentsStart ?? '',
    studentsCancelled: '',
    notes: '',
  });

  const [open, setOpen] = React.useState({ ident: true, money: true, funnel: false, attrition: false, notes: false });
  const [errors, setErrors] = React.useState({});
  const [warnings, setWarnings] = React.useState({});
  const [duplicateBlock, setDuplicateBlock] = React.useState(null);

  const updateForm = (key, value) => {
    setForm(f => {
      const next = { ...f, [key]: value };
      // Re-prefill when client changes (only if not editing)
      if (!editing && key === 'clientId') {
        const last = getLastForClient(value);
        if (last) {
          next.clientMRR = next.clientMRR || last.clientMRR;
          next.leadCost = next.leadCost || last.leadCost;
          next.adSpend = next.adSpend || last.adSpend;
          next.clientGrossRevenue = next.clientGrossRevenue || last.clientGrossRevenue;
          next.totalStudentsStart = next.totalStudentsStart || last.totalStudentsStart;
        }
      }
      return next;
    });
  };

  const validate = () => {
    const e = {};
    const w = {};
    if (!form.clientId) e.clientId = 'Required';
    if (!form.month) e.month = 'Required';
    if (form.clientMRR === '' || form.clientMRR == null) e.clientMRR = 'Required';

    // Duplicate check
    if (form.clientId && form.month) {
      const monthIso = CABT_firstOfMonth(form.month);
      const dupe = state.monthlyMetrics.find(m =>
        m.clientId === form.clientId &&
        m.month === monthIso &&
        m.id !== editingId
      );
      if (dupe) {
        setDuplicateBlock(dupe);
        return false;
      }
    }
    setDuplicateBlock(null);

    // Soft warnings
    const monthDate = new Date(form.month);
    const now = new Date();
    const monthsOff = Math.abs((monthDate.getFullYear() - now.getFullYear()) * 12 + (monthDate.getMonth() - now.getMonth()));
    if (monthsOff > 1) w.month = `That's ${monthsOff} months from today — typo?`;

    ['leadsGenerated', 'apptsBooked', 'leadsShowed', 'leadsSigned'].forEach(k => {
      if (form[k] === 0 || form[k] === '0') w[k] = 'Confirm zero is real';
    });

    setErrors(e);
    setWarnings(w);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const monthIso = CABT_firstOfMonth(form.month);
    const num = (v) => v === '' || v == null ? 0 : Number(v);
    const row = {
      id: editingId || `MM-${Date.now()}`,
      clientId: form.clientId,
      month: monthIso,
      clientMRR: num(form.clientMRR),
      leadCost: num(form.leadCost),
      adSpend: num(form.adSpend),
      clientGrossRevenue: num(form.clientGrossRevenue),
      leadsGenerated: num(form.leadsGenerated),
      apptsBooked: num(form.apptsBooked),
      leadsShowed: num(form.leadsShowed),
      leadsSigned: num(form.leadsSigned),
      totalStudentsStart: num(form.totalStudentsStart),
      studentsCancelled: num(form.studentsCancelled),
      notes: form.notes || '',
    };
    onSubmit(row, !!editing);
  };

  // Section completion indicators
  const sectionDone = {
    ident: !!form.clientId && !!form.month,
    money: form.clientMRR !== '' && form.adSpend !== '' && form.clientGrossRevenue !== '',
    funnel: ['leadsGenerated','apptsBooked','leadsShowed','leadsSigned'].every(k => form[k] !== ''),
    attrition: form.totalStudentsStart !== '' && form.studentsCancelled !== '',
  };

  if (duplicateBlock) {
    const dupClient = state.clients.find(c => c.id === duplicateBlock.clientId);
    return (
      <div style={{ padding: '16px 16px 100px' }}>
        <Banner tone="error" icon="alert" title={`${CABT_fmtMonth(duplicateBlock.month)} already logged`} theme={theme}>
          You already logged {CABT_fmtMonth(duplicateBlock.month)} for {dupClient?.name}. Edit the existing row instead?
        </Banner>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button theme={theme} variant="secondary" fullWidth onClick={() => setDuplicateBlock(null)}>Cancel</Button>
          <Button theme={theme} variant="primary" fullWidth
                  onClick={() => navigate('log-metrics', { clientId: duplicateBlock.clientId, editingId: duplicateBlock.id })}>
            Edit existing
          </Button>
        </div>
      </div>
    );
  }

  const toggleSection = React.useCallback((id) => setOpen(o => ({ ...o, [id]: !o[id] })), []);
  const sectionProps = (id) => ({
    id, theme, isOpen: open[id], done: sectionDone[id], onToggle: toggleSection,
  });

  return (
    <FormShell theme={theme} gap={12}>
      <div style={{ fontSize: 13, color: theme.inkSoft, padding: '0 4px' }}>
        Prefilled from last month where possible. Tap a section to edit.
      </div>

      <SectionCard {...sectionProps('ident')} title="Client & month"
        doneLabel={form.clientId && form.month ? `${state.clients.find(c => c.id === form.clientId)?.name} · ${CABT_fmtMonth(form.month)}` : 'Required'}>
        <Field label="Client" required error={errors.clientId} theme={theme}>
          <Select
            value={form.clientId}
            onChange={(v) => updateForm('clientId', v)}
            options={myClients.map(c => ({ value: c.id, label: c.name }))}
            theme={theme}
          />
        </Field>
        <Field label="Month" required error={errors.month} hint={warnings.month} theme={theme}>
          <Input type="month" value={form.month?.slice(0,7)} onChange={(v) => updateForm('month', v + '-01')} theme={theme}/>
        </Field>
      </SectionCard>

      <SectionCard {...sectionProps('money')} title="Revenue & spend"
        doneLabel={sectionDone.money ? `MRR ${CABT_fmtMoney(form.clientMRR)} · Ad ${CABT_fmtMoney(form.adSpend)}` : 'Tap to fill'}>
        <Field label="Client MRR" hint="Recurring monthly subscription only (Stripe MRR). Excludes setup, one-time, add-ons." required error={errors.clientMRR} theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.clientMRR} onChange={(v) => updateForm('clientMRR', v)} theme={theme} />
        </Field>
        <Field label="Lead cost" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.leadCost} onChange={(v) => updateForm('leadCost', v)} theme={theme} />
        </Field>
        <Field label="Ad spend" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.adSpend} onChange={(v) => updateForm('adSpend', v)} theme={theme} />
        </Field>
        <Field label="Client gross revenue" hint="Total monthly billings INCLUDING setup, one-time fees, and add-ons. Drives ad-spend efficiency calc. May equal MRR for clients with no one-time charges." theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.clientGrossRevenue} onChange={(v) => updateForm('clientGrossRevenue', v)} theme={theme} />
        </Field>
      </SectionCard>

      <SectionCard {...sectionProps('funnel')} title="Funnel counts"
        doneLabel={sectionDone.funnel ? `${form.leadsGenerated} → ${form.apptsBooked} → ${form.leadsShowed} → ${form.leadsSigned}` : 'Tap to fill'}>
        <Field label="Leads generated" hint={warnings.leadsGenerated} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.leadsGenerated} onChange={(v) => updateForm('leadsGenerated', v)} theme={theme} />
        </Field>
        <Field label="Appts booked" hint={warnings.apptsBooked} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.apptsBooked} onChange={(v) => updateForm('apptsBooked', v)} theme={theme} />
        </Field>
        <Field label="Leads showed" hint={warnings.leadsShowed} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.leadsShowed} onChange={(v) => updateForm('leadsShowed', v)} theme={theme} />
        </Field>
        <Field label="Leads signed" hint={warnings.leadsSigned} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.leadsSigned} onChange={(v) => updateForm('leadsSigned', v)} theme={theme} />
        </Field>
      </SectionCard>

      <SectionCard {...sectionProps('attrition')} title="Attrition"
        doneLabel={sectionDone.attrition ? `${form.studentsCancelled} of ${form.totalStudentsStart} cancelled` : 'Tap to fill'}>
        <Field label="Total Students (Start)" hint="Total student count at start of the month. Used as attrition denominator." theme={theme}>
          <Input type="number" inputmode="numeric" value={form.totalStudentsStart} onChange={(v) => updateForm('totalStudentsStart', v)} theme={theme} />
        </Field>
        <Field label="Students cancelled" theme={theme}>
          <Input type="number" inputmode="numeric" value={form.studentsCancelled} onChange={(v) => updateForm('studentsCancelled', v)} theme={theme} />
        </Field>
      </SectionCard>

      <SectionCard {...sectionProps('notes')} title="Notes (optional)"
        doneLabel={form.notes ? form.notes.slice(0, 50) + (form.notes.length > 50 ? '…' : '') : 'No notes'}>
        <textarea
          value={form.notes}
          onChange={(e) => updateForm('notes', e.target.value)}
          placeholder="Anything worth flagging…"
          rows={4}
          style={{
            width: '100%', resize: 'vertical', minHeight: 80,
            background: theme.bgElev, border: `1px solid ${theme.rule}`,
            borderRadius: theme.radius - 4, padding: 12, fontSize: 15,
            color: theme.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </SectionCard>

      {/* Sticky save */}
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={handleSubmit}>
          {editing ? 'Save changes' : 'Save monthly metrics'}
        </Button>
      </StickyBar>
    </FormShell>
  );
}

function StickyBar({ theme, children }) {
  // Sticky to viewport bottom while scrolling. Honors safe-area on iOS PWA
  // and respects the form's max-width so the buttons don't stretch full-bleed
  // on desktop. position: sticky keeps it inside the form layout (no overlap
  // with the floating bottom nav, which is z-index 100 + position: fixed).
  return (
    <div style={{
      position: 'sticky',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      marginTop: 12,
      padding: '12px 0 4px',
      background: `linear-gradient(to top, ${theme.bg} 75%, ${theme.bg}E0 90%, transparent)`,
      display: 'flex', gap: 10,
      zIndex: 5,
    }}>{children}</div>
  );
}

// Form container — caps width on desktop so labels + inputs stay grouped
// instead of stretching across a 1900px monitor. Mobile fills available width.
function FormShell({ theme, children, gap = 14 }) {
  return (
    <div style={{
      padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 100px)',
      maxWidth: 640, margin: '0 auto',
      display: 'flex', flexDirection: 'column', gap,
    }}>
      {children}
    </div>
  );
}

// ── Log Growth Event ───────────────────────────────────────────────────────
function LogEventForm({ state, ca, theme, presetClientId, navigate, onSubmit }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const [form, setForm] = React.useState({
    date: CABT_todayIso(),
    clientId: presetClientId || '',
    eventType: '',
    saleTotal: '',
    costToUs: '',
    notes: '',
  });
  const [errors, setErrors] = React.useState({});
  const types = ['Review','Testimonial','Case Study','Membership Add-on','Gear Sale','Referral 1+','VIP Upgrade'];
  const showSale = form.eventType === 'Gear Sale';

  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Required';
    if (!form.clientId) e.clientId = 'Required';
    if (!form.eventType) e.eventType = 'Required';
    if (new Date(form.date) > new Date()) e.date = 'Cannot be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const submit = () => {
    if (!validate()) return;
    onSubmit({
      id: `GE-${Date.now()}`,
      date: form.date,
      clientId: form.clientId,
      eventType: form.eventType,
      saleTotal: showSale ? Number(form.saleTotal || 0) : 0,
      costToUs: showSale ? Number(form.costToUs || 0) : 0,
      notes: form.notes,
      loggedBy: ca.id,
    });
  };
  return (
    <FormShell theme={theme}>
      <Field label="Event date" required error={errors.date} theme={theme}>
        <Input type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} theme={theme}/>
      </Field>
      <Field label="Client" required error={errors.clientId} theme={theme}>
        <Select value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })}
                options={myClients.map(c => ({ value: c.id, label: c.name }))} theme={theme} />
      </Field>
      <Field label="Event type" required error={errors.eventType} theme={theme}>
        <Select value={form.eventType} onChange={(v) => setForm({ ...form, eventType: v })} options={types} theme={theme} />
      </Field>
      {showSale && (
        <>
          <Field label="Sale total" theme={theme}>
            <Input type="number" inputmode="decimal" prefix="$" value={form.saleTotal} onChange={(v) => setForm({ ...form, saleTotal: v })} theme={theme} />
          </Field>
          <Field label="Cost to us" theme={theme}>
            <Input type="number" inputmode="decimal" prefix="$" value={form.costToUs} onChange={(v) => setForm({ ...form, costToUs: v })} theme={theme} />
          </Field>
        </>
      )}
      <Field label="Notes" theme={theme}>
        <Textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={3} theme={theme}/>
      </Field>
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>Save event</Button>
      </StickyBar>
    </FormShell>
  );
}

// ── Log Survey Response ────────────────────────────────────────────────────
function LogSurveyForm({ state, ca, theme, presetClientId, navigate, onSubmit }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const [form, setForm] = React.useState({
    date: CABT_todayIso(),
    clientId: presetClientId || '',
    overall: 0,
    responsiveness: 0,
    followThrough: 0,
    communication: 0,
    anonymous: false,
    comment: '',
  });
  const [errors, setErrors] = React.useState({});
  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Required';
    if (!form.clientId) e.clientId = 'Required';
    ['overall', 'responsiveness', 'followThrough', 'communication'].forEach(k => {
      if (!form[k]) e[k] = 'Required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const submit = () => {
    if (!validate()) return;
    onSubmit({ id: `SR-${Date.now()}`, ...form, submittedBy: ca.id });
  };
  return (
    <FormShell theme={theme}>
      <Field label="Date" required theme={theme}>
        <Input type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} theme={theme}/>
      </Field>
      <Field label="Client" required error={errors.clientId} theme={theme}>
        <Select value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })}
                options={myClients.map(c => ({ value: c.id, label: c.name }))} theme={theme} />
      </Field>
      {[
        ['overall', 'Overall rating'],
        ['responsiveness', 'Responsiveness'],
        ['followThrough', 'Follow-through'],
        ['communication', 'Communication'],
      ].map(([k, label]) => (
        <Field key={k} label={label} required error={errors[k]} theme={theme}>
          <StarRating value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} theme={theme} />
        </Field>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>Anonymous?</div>
          <div style={{ fontSize: 12, color: theme.inkMuted }}>Hide submitter from leadership view</div>
        </div>
        <Toggle value={form.anonymous} onChange={(v) => setForm({ ...form, anonymous: v })} theme={theme} />
      </div>
      <Field label="Comment" theme={theme}>
        <Textarea value={form.comment} onChange={(v) => setForm({ ...form, comment: v })} rows={3} theme={theme}/>
      </Field>
      <Field label="Submitted by" theme={theme}>
        <Input value={ca.name} onChange={() => {}} theme={theme} />
      </Field>
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>Save survey</Button>
      </StickyBar>
    </FormShell>
  );
}

Object.assign(window, { LogMetricsForm, LogEventForm, LogSurveyForm, StickyBar, FormShell });

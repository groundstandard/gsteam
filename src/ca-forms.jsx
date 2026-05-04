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

// ── Smart-card form for Metrics (monthly OR weekly per client cadence) ────
//
// Phase 11 (Bobby 2026-05-05): clients can be on weekly or monthly cadence.
// This form auto-detects the selected client's cadence and:
//   - shows a `weekStart` date picker (ISO Monday) when weekly
//   - shows a `month` picker when monthly
// Numeric fields are identical either way; the backend rolls weekly entries
// up to monthly via v_monthly_metrics_effective for scoring.
function LogMetricsForm({ state, ca, theme, presetClientId, navigate, onSubmit, editingId }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);

  // Editing: try weekly first (since IDs are prefixed differently); fall back
  // to monthly. Pre-existing callers still navigate with monthly IDs and that
  // path keeps working.
  const editing = editingId
    ? ((state.weeklyMetrics || []).find(m => m.id === editingId)
       || (state.monthlyMetrics || []).find(m => m.id === editingId))
    : null;
  const editingKind = editing
    ? (editing.weekStart ? 'weekly' : 'monthly')
    : null;

  const initialClient = editing?.clientId || presetClientId || (myClients[0]?.id ?? '');
  const initialClientObj = state.clients.find(c => c.id === initialClient);
  const initialCadence = editingKind || (initialClientObj?.loggingCadence || 'monthly');

  // ISO Monday of current week (used for weekly default + week picker prefill)
  const isoMondayOf = (d = new Date()) => {
    const x = new Date(d);
    const day = x.getDay() || 7;
    if (day !== 1) x.setDate(x.getDate() - (day - 1));
    return x.toISOString().slice(0, 10);
  };

  // Prefill from last entry. Prefer same-cadence; fall back to other.
  const getLastForClient = (cid, cadence) => {
    if (!cid) return null;
    if (cadence === 'weekly') {
      const w = (state.weeklyMetrics || [])
        .filter(m => m.clientId === cid)
        .sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || ''))[0];
      if (w) return w;
      // Fall back to last monthly so MRR / studentsStart prefill works on first weekly entry
      return (state.monthlyMetrics || [])
        .filter(m => m.clientId === cid)
        .sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0] || null;
    }
    return (state.monthlyMetrics || [])
      .filter(m => m.clientId === cid)
      .sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0] || null;
  };

  const lastForInit = getLastForClient(initialClient, initialCadence);

  // Bobby 2026-05-04: "Client MRR" and "Client gross revenue" were the same
  // thing in his head ("Total money collected, recurring or not"). Form now
  // exposes ONE field — totalRevenue — that writes to BOTH columns on submit
  // so scoring (which still references both internally) keeps working.
  const initialRevenue = editing
    ? (editing.clientGrossRevenue || editing.clientMRR || '')
    : (lastForInit?.clientGrossRevenue || lastForInit?.clientMRR || '');

  const [form, setForm] = React.useState(editing ? { ...editing, totalRevenue: initialRevenue } : {
    clientId: initialClient,
    cadence: initialCadence,
    // Use the right period field for this cadence; the other stays empty.
    month:     initialCadence === 'monthly' ? CABT_currentMonthIso() : '',
    weekStart: initialCadence === 'weekly'  ? isoMondayOf()          : '',
    totalRevenue: initialRevenue,
    leadCost: lastForInit?.leadCost ?? '',
    adSpend: lastForInit?.adSpend ?? '',
    leadsGenerated: '',
    apptsBooked: '',
    leadsShowed: '',
    leadsSigned: '',
    totalStudentsStart: lastForInit?.totalStudentsStart ?? '',
    studentsCancelled: '',
    notes: '',
  });

  // Re-derive cadence whenever client changes; the form's behavior depends on it.
  const selectedClient = state.clients.find(c => c.id === form.clientId);
  const activeCadence = (editingKind || form.cadence || selectedClient?.loggingCadence || 'monthly');

  const [open, setOpen] = React.useState({ ident: true, money: true, funnel: false, attrition: false, notes: false });
  const [errors, setErrors] = React.useState({});
  const [warnings, setWarnings] = React.useState({});
  const [duplicateBlock, setDuplicateBlock] = React.useState(null);

  const updateForm = (key, value) => {
    setForm(f => {
      const next = { ...f, [key]: value };
      // Re-prefill + re-pick cadence when client changes (only if not editing)
      if (!editing && key === 'clientId') {
        const newClient = state.clients.find(c => c.id === value);
        const newCadence = newClient?.loggingCadence || 'monthly';
        next.cadence = newCadence;
        // Match the period field to the new cadence
        if (newCadence === 'weekly') {
          next.weekStart = next.weekStart || isoMondayOf();
          next.month = '';
        } else {
          next.month = next.month || CABT_currentMonthIso();
          next.weekStart = '';
        }
        const last = getLastForClient(value, newCadence);
        if (last) {
          next.totalRevenue = next.totalRevenue || last.clientGrossRevenue || last.clientMRR;
          next.leadCost = next.leadCost || last.leadCost;
          next.adSpend = next.adSpend || last.adSpend;
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
    const periodField = activeCadence === 'weekly' ? 'weekStart' : 'month';
    if (!form[periodField]) e[periodField] = 'Required';
    if (form.totalRevenue === '' || form.totalRevenue == null) e.totalRevenue = 'Required';

    // Duplicate check (same client + same period, in the matching table)
    if (form.clientId && form[periodField]) {
      if (activeCadence === 'weekly') {
        const dupe = (state.weeklyMetrics || []).find(m =>
          m.clientId === form.clientId &&
          m.weekStart === form.weekStart &&
          m.id !== editingId
        );
        if (dupe) { setDuplicateBlock(dupe); return false; }
      } else {
        const monthIso = CABT_firstOfMonth(form.month);
        const dupe = (state.monthlyMetrics || []).find(m =>
          m.clientId === form.clientId &&
          m.month === monthIso &&
          m.id !== editingId
        );
        if (dupe) { setDuplicateBlock(dupe); return false; }
      }
    }
    setDuplicateBlock(null);

    // Soft warnings
    if (activeCadence === 'monthly' && form.month) {
      const monthDate = new Date(form.month);
      const now = new Date();
      const monthsOff = Math.abs((monthDate.getFullYear() - now.getFullYear()) * 12 + (monthDate.getMonth() - now.getMonth()));
      if (monthsOff > 1) w.month = `That's ${monthsOff} months from today — typo?`;
    } else if (activeCadence === 'weekly' && form.weekStart) {
      const dt = new Date(form.weekStart + 'T12:00:00');
      const daysOff = Math.abs(Math.round((dt - new Date()) / 86400000));
      if (daysOff > 60) w.weekStart = `That's ${daysOff} days from today — typo?`;
    }

    ['leadsGenerated', 'apptsBooked', 'leadsShowed', 'leadsSigned'].forEach(k => {
      if (form[k] === 0 || form[k] === '0') w[k] = 'Confirm zero is real';
    });

    setErrors(e);
    setWarnings(w);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const num = (v) => v === '' || v == null ? 0 : Number(v);
    const isWeekly = activeCadence === 'weekly';
    const idPrefix = isWeekly ? 'WM' : 'MM';
    const periodFields = isWeekly
      ? { weekStart: form.weekStart }
      : { month: CABT_firstOfMonth(form.month) };
    // Single revenue value writes to BOTH client_mrr AND client_gross_revenue
    // so backend scoring (pot share uses MRR; ad-spend efficiency uses gross)
    // stays consistent without two confusing fields in the UI. Bobby 2026-05-04.
    const revenue = num(form.totalRevenue);
    const row = {
      id: editingId || `${idPrefix}-${Date.now()}`,
      caId: ca.id,
      clientId: form.clientId,
      ...periodFields,
      clientMRR: revenue,
      clientGrossRevenue: revenue,
      leadCost: num(form.leadCost),
      adSpend: num(form.adSpend),
      leadsGenerated: num(form.leadsGenerated),
      apptsBooked: num(form.apptsBooked),
      leadsShowed: num(form.leadsShowed),
      leadsSigned: num(form.leadsSigned),
      totalStudentsStart: num(form.totalStudentsStart),
      studentsCancelled: num(form.studentsCancelled),
      notes: form.notes || '',
    };
    onSubmit(row, !!editing, activeCadence);
  };

  // Section completion indicators
  const periodFilled = activeCadence === 'weekly' ? !!form.weekStart : !!form.month;
  const sectionDone = {
    ident: !!form.clientId && periodFilled,
    money: form.totalRevenue !== '' && form.adSpend !== '',
    funnel: ['leadsGenerated','apptsBooked','leadsShowed','leadsSigned'].every(k => form[k] !== ''),
    attrition: form.totalStudentsStart !== '' && form.studentsCancelled !== '',
  };

  if (duplicateBlock) {
    const dupClient = state.clients.find(c => c.id === duplicateBlock.clientId);
    const dupePeriodLabel = duplicateBlock.weekStart
      ? `Week of ${CABT_fmtDate(duplicateBlock.weekStart)}`
      : CABT_fmtMonth(duplicateBlock.month);
    return (
      <div style={{ padding: '16px 16px 100px' }}>
        <Banner tone="error" icon="alert" title={`${dupePeriodLabel} already logged`} theme={theme}>
          You already logged {dupePeriodLabel} for {dupClient?.name}. Edit the existing row instead?
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

  const periodLabel  = activeCadence === 'weekly' ? 'Week starting (Mon)' : 'Month';
  const periodDone = activeCadence === 'weekly'
    ? (form.weekStart ? `Week of ${CABT_fmtDate(form.weekStart)}` : 'Required')
    : (form.month ? CABT_fmtMonth(form.month) : 'Required');
  const cadenceHint = activeCadence === 'weekly'
    ? 'This client is on weekly cadence — your numbers roll up into the month for scoring.'
    : 'Prefilled from last month where possible. Tap a section to edit.';

  return (
    <FormShell theme={theme} gap={12}>
      <div style={{ fontSize: 13, color: theme.inkSoft, padding: '0 4px' }}>
        {cadenceHint}
      </div>

      <SectionCard {...sectionProps('ident')} title={activeCadence === 'weekly' ? 'Client & week' : 'Client & month'}
        doneLabel={form.clientId && periodFilled
          ? `${state.clients.find(c => c.id === form.clientId)?.name} · ${periodDone}`
          : 'Required'}>
        <Field label="Client" required error={errors.clientId} theme={theme}>
          <Select
            value={form.clientId}
            onChange={(v) => updateForm('clientId', v)}
            options={myClients.map(c => ({
              value: c.id,
              label: `${c.name} · ${(c.loggingCadence || 'monthly')}`,
            }))}
            theme={theme}
          />
        </Field>
        <Field label={periodLabel} required
               error={activeCadence === 'weekly' ? errors.weekStart : errors.month}
               hint={activeCadence === 'weekly' ? warnings.weekStart : warnings.month}
               theme={theme}>
          {activeCadence === 'weekly'
            ? <Input type="date" value={form.weekStart} onChange={(v) => updateForm('weekStart', v)} theme={theme}/>
            : <Input type="month" value={form.month?.slice(0,7)} onChange={(v) => updateForm('month', v + '-01')} theme={theme}/>}
        </Field>
        <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 12,
                      background: theme.bgSoft || 'rgba(255,255,255,0.04)',
                      border: `1px solid ${theme.rule}` }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: theme.inkMuted, textTransform: 'uppercase' }}>Cadence</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, textTransform: 'capitalize' }}>{activeCadence}</span>
        </div>
      </SectionCard>

      <SectionCard {...sectionProps('money')} title="Revenue & spend"
        doneLabel={sectionDone.money ? `Rev ${CABT_fmtMoney(form.totalRevenue)} · Ad ${CABT_fmtMoney(form.adSpend)}` : 'Tap to fill'}>
        <Field label={activeCadence === 'weekly' ? 'Total revenue this week' : 'Total monthly revenue'}
               hint="Total money collected this period — recurring + one-time + add-ons. Drives both bonus-pot share and ad-spend efficiency."
               required error={errors.totalRevenue} theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.totalRevenue} onChange={(v) => updateForm('totalRevenue', v)} theme={theme} />
        </Field>
        <Field label="Lead cost" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.leadCost} onChange={(v) => updateForm('leadCost', v)} theme={theme} />
        </Field>
        <Field label="Ad spend" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.adSpend} onChange={(v) => updateForm('adSpend', v)} theme={theme} />
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
        <Field label="Total Students (Start)" hint={activeCadence === 'weekly' ? 'Student count at start of this week. Used as attrition denominator.' : 'Total student count at start of the month. Used as attrition denominator.'} theme={theme}>
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
          {editing ? 'Save changes' : (activeCadence === 'weekly' ? 'Save weekly metrics' : 'Save monthly metrics')}
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
function LogEventForm({ state, ca, theme, presetClientId, navigate, onSubmit, editingId }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const editing = editingId ? (state.growthEvents || []).find(e => e.id === editingId) : null;
  const [form, setForm] = React.useState(editing ? {
    date: editing.date,
    clientId: editing.clientId,
    eventType: editing.eventType,
    saleTotal: editing.saleTotal != null ? String(editing.saleTotal) : '',
    costToUs:  editing.costToUs  != null ? String(editing.costToUs)  : '',
    notes:     editing.notes || '',
  } : {
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
      id: editingId || `GE-${Date.now()}`,
      date: form.date,
      clientId: form.clientId,
      eventType: form.eventType,
      saleTotal: showSale ? Number(form.saleTotal || 0) : 0,
      costToUs: showSale ? Number(form.costToUs || 0) : 0,
      notes: form.notes,
      loggedBy: ca.id,
    }, !!editing);
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
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>{editing ? 'Save changes' : 'Save event'}</Button>
      </StickyBar>
    </FormShell>
  );
}

// ── Log Survey Response ────────────────────────────────────────────────────
function LogSurveyForm({ state, ca, theme, presetClientId, navigate, onSubmit, editingId }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const editing = editingId ? (state.surveys || []).find(s => s.id === editingId) : null;
  const [form, setForm] = React.useState(editing ? {
    date: editing.date,
    clientId: editing.clientId,
    overall: editing.overall || 0,
    responsiveness: editing.responsiveness || 0,
    followThrough: editing.followThrough || 0,
    communication: editing.communication || 0,
    anonymous: !!editing.anonymous,
    comment: editing.comment || '',
  } : {
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
    onSubmit({ id: editingId || `SR-${Date.now()}`, ...form, submittedBy: ca.id }, !!editing);
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
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>{editing ? 'Save changes' : 'Save survey'}</Button>
      </StickyBar>
    </FormShell>
  );
}

// ── Smart-card form for Check-in (TICKET-2) ────────────────────────────────
// Narrative-only check-in. Routes to weekly_checkins or monthly_checkins
// based on the picked client's logging_cadence. Same 4 narrative fields
// regardless of cadence.
function LogCheckinForm({ state, ca, theme, presetClientId, navigate, onSubmit }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const initialClient = presetClientId || (myClients[0]?.id ?? '');
  const initialClientObj = state.clients.find(c => c.id === initialClient);
  const cadence = initialClientObj?.loggingCadence || 'monthly';

  // Compute current period start: ISO Monday of the current week, or first-of-month
  const today = new Date();
  const isoMonday = (() => {
    const d = new Date(today);
    const day = d.getDay() || 7;            // Sun = 7
    if (day !== 1) d.setDate(d.getDate() - (day - 1));
    return d.toISOString().slice(0, 10);
  })();
  const firstOfMonth = today.toISOString().slice(0, 7) + '-01';

  const [form, setForm] = React.useState({
    clientId: initialClient,
    period: cadence === 'weekly' ? isoMonday : firstOfMonth,
    concern: '',
    win: '',
    accountAction: '',
    agencyAction: '',
    notes: '',
  });
  const [errors, setErrors] = React.useState({});

  const updateForm = (key, value) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // If switching client, reset period to match the new client's cadence
      if (key === 'clientId') {
        const c = state.clients.find(cl => cl.id === value);
        const newCadence = c?.loggingCadence || 'monthly';
        next.period = newCadence === 'weekly' ? isoMonday : firstOfMonth;
      }
      return next;
    });
    if (errors[key]) setErrors(e => ({ ...e, [key]: null }));
  };

  const selectedClient = state.clients.find(c => c.id === form.clientId);
  const activeCadence = selectedClient?.loggingCadence || 'monthly';

  const validate = () => {
    const e = {};
    if (!form.clientId) e.clientId = 'Required';
    if (!form.period)   e.period   = 'Required';
    // At least ONE narrative field must be filled (otherwise why log?)
    if (!form.concern && !form.win && !form.accountAction && !form.agencyAction) {
      e.body = 'Fill at least one of: concern, win, account-side, agency-side.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const idPrefix = activeCadence === 'weekly' ? 'WC' : 'MC';
    const periodKey = activeCadence === 'weekly' ? 'weekStart' : 'month';
    const row = {
      id: `${idPrefix}-${Date.now()}`,
      caId: ca.id,
      clientId: form.clientId,
      [periodKey]: form.period,
      concern: form.concern || null,
      win: form.win || null,
      accountAction: form.accountAction || null,
      agencyAction: form.agencyAction || null,
      notes: form.notes || null,
    };
    onSubmit(row, activeCadence);
  };

  const periodLabel = activeCadence === 'weekly' ? 'Week starting (Mon)' : 'Month';

  return (
    <FormShell theme={theme} gap={12}>
      <div style={{ fontSize: 13, color: theme.inkSoft, padding: '0 4px' }}>
        Narrative check-in. Routes to {activeCadence === 'weekly' ? 'weekly' : 'monthly'} log based on the client's cadence.
      </div>

      <Card theme={theme} padding={14}>
        <Field label="Client" required error={errors.clientId} theme={theme}>
          <Select
            value={form.clientId}
            onChange={(v) => updateForm('clientId', v)}
            options={myClients.map(c => ({
              value: c.id,
              label: `${c.name} · ${c.loggingCadence || 'monthly'}`,
            }))}
            theme={theme}
          />
        </Field>
        <div style={{ height: 10 }}/>
        <Field label={periodLabel} required error={errors.period} theme={theme}>
          {activeCadence === 'weekly'
            ? <Input type="date" value={form.period} onChange={(v) => updateForm('period', v)} theme={theme}/>
            : <Input type="month" value={form.period?.slice(0,7)} onChange={(v) => updateForm('period', v + '-01')} theme={theme}/>
          }
        </Field>
        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 12, background: theme.bgSoft || 'rgba(255,255,255,0.04)', border: `1px solid ${theme.rule}` }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: theme.inkMuted, textTransform: 'uppercase' }}>Cadence</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, textTransform: 'capitalize' }}>{activeCadence}</span>
        </div>
      </Card>

      <Card theme={theme} padding={14}>
        <Field label="Concern" hint="Anything blocking results, churn risk, escalations" theme={theme}>
          <Textarea value={form.concern} onChange={(v) => updateForm('concern', v)} rows={3} placeholder="What's worrying you about this account?" theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Win" hint="Wins worth flagging — milestone, member feedback, growth" theme={theme}>
          <Textarea value={form.win} onChange={(v) => updateForm('win', v)} rows={3} placeholder="What went right?" theme={theme}/>
        </Field>
      </Card>

      <Card theme={theme} padding={14}>
        <Field label="Account-side action" hint="What the client owner/staff needs to do" theme={theme}>
          <Textarea value={form.accountAction} onChange={(v) => updateForm('accountAction', v)} rows={3} placeholder="What does the client need to do?" theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Agency-side action" hint="What you / the agency need to do next" theme={theme}>
          <Textarea value={form.agencyAction} onChange={(v) => updateForm('agencyAction', v)} rows={3} placeholder="What's our next move?" theme={theme}/>
        </Field>
      </Card>

      <Card theme={theme} padding={14}>
        <Field label="Notes (optional)" theme={theme}>
          <Textarea value={form.notes} onChange={(v) => updateForm('notes', v)} rows={2} placeholder="Anything else worth flagging…" theme={theme}/>
        </Field>
      </Card>

      {errors.body && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(220, 60, 60, 0.08)', border: `1px solid rgba(220, 60, 60, 0.3)`, color: '#dc3c3c', fontSize: 13 }}>
          {errors.body}
        </div>
      )}

      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={handleSubmit}>
          Save {activeCadence} check-in
        </Button>
      </StickyBar>
    </FormShell>
  );
}

Object.assign(window, { LogMetricsForm, LogEventForm, LogSurveyForm, LogCheckinForm, StickyBar, FormShell });

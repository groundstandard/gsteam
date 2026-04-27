// ca-forms.jsx — Log Monthly Metrics, Log Growth Event, Log Survey

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
    priorStudents: lastForInit?.priorStudents ?? '',
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
          next.priorStudents = next.priorStudents || last.priorStudents;
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
      priorStudents: num(form.priorStudents),
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
    attrition: form.priorStudents !== '' && form.studentsCancelled !== '',
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

  const SectionCard = ({ id, title, doneLabel, children }) => {
    const isOpen = open[id];
    const done = sectionDone[id];
    return (
      <Card theme={theme} padding={0}>
        <button
          onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
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
  };

  return (
    <div style={{ padding: '8px 16px 120px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: theme.inkSoft, padding: '0 4px' }}>
        Prefilled from last month where possible. Tap a section to edit.
      </div>

      <SectionCard id="ident" title="Client & month"
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

      <SectionCard id="money" title="Revenue & spend"
        doneLabel={sectionDone.money ? `MRR ${CABT_fmtMoney(form.clientMRR)} · Ad ${CABT_fmtMoney(form.adSpend)}` : 'Tap to fill'}>
        <Field label="Client MRR" required error={errors.clientMRR} theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.clientMRR} onChange={(v) => updateForm('clientMRR', v)} theme={theme} />
        </Field>
        <Field label="Lead cost" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.leadCost} onChange={(v) => updateForm('leadCost', v)} theme={theme} />
        </Field>
        <Field label="Ad spend" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.adSpend} onChange={(v) => updateForm('adSpend', v)} theme={theme} />
        </Field>
        <Field label="Client gross revenue" hint="Used for ad spend target calc" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.clientGrossRevenue} onChange={(v) => updateForm('clientGrossRevenue', v)} theme={theme} />
        </Field>
      </SectionCard>

      <SectionCard id="funnel" title="Funnel counts"
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

      <SectionCard id="attrition" title="Attrition"
        doneLabel={sectionDone.attrition ? `${form.studentsCancelled} of ${form.priorStudents} cancelled` : 'Tap to fill'}>
        <Field label="Prior students" theme={theme}>
          <Input type="number" inputmode="numeric" value={form.priorStudents} onChange={(v) => updateForm('priorStudents', v)} theme={theme} />
        </Field>
        <Field label="Students cancelled" theme={theme}>
          <Input type="number" inputmode="numeric" value={form.studentsCancelled} onChange={(v) => updateForm('studentsCancelled', v)} theme={theme} />
        </Field>
      </SectionCard>

      <SectionCard id="notes" title="Notes (optional)"
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
    </div>
  );
}

function StickyBar({ theme, children }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '12px 16px 28px',
      background: `linear-gradient(to top, ${theme.bg} 60%, transparent)`,
      display: 'flex', gap: 8,
    }}>{children}</div>
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
    <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
          style={{ width: '100%', minHeight: 70, background: theme.bgElev, border: `1px solid ${theme.rule}`, borderRadius: theme.radius - 4, padding: 12, fontSize: 15, color: theme.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
        />
      </Field>
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>Save event</Button>
      </StickyBar>
    </div>
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
    <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={3}
          style={{ width: '100%', minHeight: 70, background: theme.bgElev, border: `1px solid ${theme.rule}`, borderRadius: theme.radius - 4, padding: 12, fontSize: 15, color: theme.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
        />
      </Field>
      <Field label="Submitted by" theme={theme}>
        <Input value={ca.name} onChange={() => {}} theme={theme} />
      </Field>
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>Save survey</Button>
      </StickyBar>
    </div>
  );
}

Object.assign(window, { LogMetricsForm, LogEventForm, LogSurveyForm, StickyBar });

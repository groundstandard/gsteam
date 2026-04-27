// api.jsx — data layer abstraction. Three backends:
//   - 'local':    in-browser fixtures persisted to localStorage (demo / dev)
//   - 'sheet':    legacy Google Apps Script Web App (CABT_API_URL)
//   - 'supabase': production backend (CABT_SUPABASE_URL + CABT_SUPABASE_ANON_KEY)
//
// All UI components keep using the same camelCase shape; this file maps
// between the persistence column names and the UI keys.

// ── Project credentials ──────────────────────────────────────────────────
const CABT_SUPABASE_URL      = 'https://wlaebsifygvnoyridobr.supabase.co';
const CABT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsYWVic2lmeWd2bm95cmlkb2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzE4MDgsImV4cCI6MjA5MDkwNzgwOH0.QxNBZWVf7_uA8WQFxSsJbFCqt26bUHOioQXfLt_4zLY';

const CABT_API_KEY = 'cabt_api_v1';

function CABT_getApiMode() {
  return localStorage.getItem(CABT_API_KEY + '_mode') || (window.CABT_API_MODE || 'local');
}
function CABT_setApiMode(m) { localStorage.setItem(CABT_API_KEY + '_mode', m); }
function CABT_getApiUrl() {
  return localStorage.getItem(CABT_API_KEY + '_url') || window.CABT_API_URL || '';
}
function CABT_setApiUrl(u) { localStorage.setItem(CABT_API_KEY + '_url', u); }

// ── Supabase client (lazy-loaded so demo mode has zero overhead) ────────
let _sb = null;
async function CABT_sb() {
  if (_sb) return _sb;
  // Use the ESM build for in-browser script-tag setups
  const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
  _sb = mod.createClient(CABT_SUPABASE_URL, CABT_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _sb;
}

// ── Auth helpers (Supabase mode) ────────────────────────────────────────
async function CABT_signInWithGoogle() {
  const sb = await CABT_sb();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href,
      queryParams: { hd: 'groundstandard.com' }, // hint Workspace domain
    },
  });
  if (error) throw error;
  return data;
}

async function CABT_signOut() {
  const sb = await CABT_sb();
  await sb.auth.signOut();
}

async function CABT_currentSession() {
  const sb = await CABT_sb();
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function CABT_currentProfile() {
  const sb = await CABT_sb();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

// ── Snake_case (Postgres) ↔ camelCase (UI) adapters ─────────────────────
const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const camelToSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

const reshape = (obj, transform) => {
  if (Array.isArray(obj)) return obj.map(o => reshape(o, transform));
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[transform(k)] = v;
  return out;
};
const toUI = (obj)  => reshape(obj, snakeToCamel);
const toDB = (obj)  => reshape(obj, camelToSnake);

// ── Legacy Sheet transport (kept for fallback/migration period) ─────────
async function CABT_callSheet(action, payload) {
  const url = CABT_getApiUrl();
  if (!url) throw new Error('CABT_API_URL not set');
  const res = await fetch(url, {
    method: 'POST', body: JSON.stringify({ action, payload }),
    headers: { 'Content-Type': 'text/plain' }, redirect: 'follow',
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'request_failed');
  return json.data;
}

// ── Public API the UI calls ─────────────────────────────────────────────
const CABT_api = {
  // ── Bootstrap ────────────────────────────────────────────────────────
  async loadState() {
    const mode = CABT_getApiMode();
    if (mode === 'local')    return window.CABT_loadState();
    if (mode === 'sheet')    return loadStateSheet();
    if (mode === 'supabase') return loadStateSupabase();
  },

  // ── Mutations (each returns the saved row in UI shape) ───────────────
  async submitMonthlyMetrics(row) { return route('submitMonthlyMetrics', row, 'monthly_metrics'); },
  async submitEvent(row)          { return route('submitEvent',          row, 'growth_events'); },
  async submitSurvey(row)         { return route('submitSurvey',         row, 'surveys'); },
  async submitContract(row)       { return route('submitContract',       row, 'clients'); },
  async submitAdjustment(row)     { return route('submitAdjustment',     row, 'adjustments'); },
  async submitClient(row)         { return route('submitClient',         row, 'clients'); },

  async approve(id) {
    const mode = CABT_getApiMode();
    if (mode === 'local')    return { id };
    if (mode === 'sheet')    return CABT_callSheet('approveAdjustment', { id });
    const sb = await CABT_sb();
    const { error } = await sb.from('adjustments')
      .update({ status: 'Paid', approved_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { id };
  },
  async reject(id) {
    const mode = CABT_getApiMode();
    if (mode === 'local')    return { id };
    if (mode === 'sheet')    return CABT_callSheet('rejectAdjustment', { id });
    const sb = await CABT_sb();
    const { error } = await sb.from('adjustments')
      .update({ status: 'Rejected', rejected_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { id };
  },
  async assignCA(clientId, caId) {
    const mode = CABT_getApiMode();
    if (mode === 'local')    return { clientId, caId };
    if (mode === 'sheet')    return CABT_callSheet('assignCA', { clientId, caId });
    const sb = await CABT_sb();
    const { error } = await sb.from('clients').update({ assigned_ca: caId }).eq('id', clientId);
    if (error) throw error;
    return { clientId, caId };
  },

  // ── Edit requests (CA edits an approved log) ────────────────────────
  async submitEditRequest({ tableName, rowId, fieldChanges, reason }) {
    const mode = CABT_getApiMode();
    if (mode !== 'supabase') return { id: 'local-' + Date.now() };
    const sb = await CABT_sb();
    const { data: { user } } = await sb.auth.getUser();
    const { data, error } = await sb.from('edit_requests').insert({
      table_name: tableName, row_id: rowId,
      field_changes: fieldChanges, reason, requested_by: user.id,
    }).select().single();
    if (error) throw error;
    return toUI(data);
  },
  async approveEditRequest(id) {
    if (CABT_getApiMode() !== 'supabase') return { id };
    const sb = await CABT_sb();
    const { error } = await sb.from('edit_requests')
      .update({ status: 'approved' }).eq('id', id);
    if (error) throw error;
    return { id };
  },

  // ── Server-computed scorecards (Option C: SQL views) ────────────────
  async caScorecard(caId, { quarterStart, quarterEnd } = {}) {
    if (CABT_getApiMode() !== 'supabase') return null; // fall through to client calc
    const sb = await CABT_sb();
    const { data, error } = await sb.rpc('fn_ca_scorecard', {
      p_ca_id: caId,
      p_quarter_start: quarterStart || null,
      p_quarter_end:   quarterEnd   || null,
    });
    if (error) throw error;
    return toUI(data);
  },
  async clientSubScores(clientId) {
    if (CABT_getApiMode() !== 'supabase') return null;
    const sb = await CABT_sb();
    const { data, error } = await sb.rpc('fn_client_sub_scores', { p_client_id: clientId });
    if (error) throw error;
    return toUI(data);
  },

  // ── Real-time (Supabase channels) ───────────────────────────────────
  subscribe(table, callback) {
    if (CABT_getApiMode() !== 'supabase') return { unsubscribe: () => {} };
    let chan = null;
    CABT_sb().then(sb => {
      chan = sb.channel('public:' + table)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (p) => callback(toUI(p)))
        .subscribe();
    });
    return { unsubscribe: () => chan && chan.unsubscribe() };
  },
};

// ── Mode-routed mutation helper ─────────────────────────────────────────
async function route(sheetAction, row, supabaseTable) {
  const mode = CABT_getApiMode();
  if (mode === 'local') return row;
  if (mode === 'sheet') return CABT_callSheet(sheetAction, row);
  const sb = await CABT_sb();
  const { data, error } = await sb.from(supabaseTable).insert(toDB(row)).select().single();
  if (error) throw error;
  return toUI(data);
}

// ── Bootstrap implementations ───────────────────────────────────────────
async function loadStateSheet() {
  const boot = await CABT_callSheet('getBootstrap', {});
  return {
    _live: true,
    me: boot.me, role: boot.me.kind,
    cas: (boot.cas || []).map(toUI),
    sales: (boot.sales || []).map(toUI),
    config: boot.config,
    clients: [], monthlyMetrics: [], growthEvents: [], surveys: [], adjustments: [],
    pendingClients: [],
  };
}

async function loadStateSupabase() {
  const sb = await CABT_sb();
  const [profile, cas, sales, clients, mm, ge, sv, adj, cfg, pending, oq] = await Promise.all([
    CABT_currentProfile(),
    sb.from('cas').select('*').order('id'),
    sb.from('sales_team').select('*').order('id'),
    sb.from('clients').select('*'),
    sb.from('monthly_metrics').select('*'),
    sb.from('growth_events').select('*'),
    sb.from('surveys').select('*'),
    sb.from('adjustments').select('*'),
    sb.from('config').select('values').eq('id', 1).maybeSingle(),
    sb.from('pending_clients').select('*').eq('status', 'pending'),
    sb.from('open_questions').select('*'),
  ]);

  return {
    _live: true,
    me: profile,
    role: profile?.role,
    cas:            toUI(cas.data || []),
    sales:          toUI(sales.data || []),
    clients:        toUI(clients.data || []),
    monthlyMetrics: toUI(mm.data || []),
    growthEvents:   toUI(ge.data || []),
    surveys:        toUI(sv.data || []),
    adjustments:    toUI(adj.data || []),
    config:         cfg.data?.values || {},
    pendingClients: toUI(pending.data || []),
    openQuestions:  toUI(oq.data || []),
  };
}

Object.assign(window, {
  CABT_api, CABT_getApiMode, CABT_setApiMode, CABT_getApiUrl, CABT_setApiUrl,
  CABT_signInWithGoogle, CABT_signOut, CABT_currentSession, CABT_currentProfile,
  CABT_sb, CABT_SUPABASE_URL, CABT_SUPABASE_ANON_KEY,
});

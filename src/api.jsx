// api.jsx — data layer abstraction. Three backends:
//   - 'local':    in-browser fixtures persisted to localStorage (demo / dev)
//   - 'sheet':    legacy Google Apps Script Web App (CABT_API_URL)
//   - 'supabase': production backend (CABT_SUPABASE_URL + CABT_SUPABASE_ANON_KEY)

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

let _sb = null;
async function CABT_sb() {
  if (_sb) return _sb;
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Supabase UMD bundle did not load (check index.html).');
  }
  _sb = window.supabase.createClient(CABT_SUPABASE_URL, CABT_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _sb;
}

async function CABT_signInWithGoogle() {
  const sb = await CABT_sb();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
  if (error) throw error;
  return data;
}

async function CABT_signInWithEmail(email) {
  const sb = await CABT_sb();
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: window.location.origin + '/' },
  });
  if (error) throw error;
  return { ok: true };
}

async function CABT_signInWithPassword(email, password) {
  const sb = await CABT_sb();
  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: password,
  });
  if (error) throw error;
  // Fetch profile after sign-in so caller has the role immediately
  let profile = null;
  try { profile = await CABT_currentProfile(); } catch (_e) { /* non-fatal */ }
  return { session: data.session, profile };
}

async function CABT_resetPassword(email) {
  const sb = await CABT_sb();
  const { error } = await sb.auth.resetPasswordForEmail(
    (email || '').trim().toLowerCase(),
    { redirectTo: window.location.origin + '/' }
  );
  if (error) throw error;
  return { ok: true };
}

async function CABT_signOut() {
  const sb = await CABT_sb();
  await sb.auth.signOut();
}

// Race a promise against a timeout so a hung Supabase call can never wedge sign-in.
// 2026-04-29: Bobby reported "stuck on Verifying session" on reload while logged in.
// Returns the FALLBACK on timeout instead of throwing — throwing was bubbling up
// through Supabase's onAuthStateChange listeners and surfacing in the console.
function _withTimeout(promise, ms, label, fallback = null) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn('[CABT] timeout_' + label + ' after ' + ms + 'ms — using fallback');
      resolve({ __timedOut: true, data: fallback });
    }, ms);
  });
  return Promise.race([
    promise.then((v) => { clearTimeout(timer); return v; }),
    timeoutPromise,
  ]);
}

// ── Web Push subscription helpers (PWA) ─────────────────────────────────────
// VAPID public key is set on the server side; this is the matching client key.
// When empty, push registration is disabled (graceful degradation).
const CABT_VAPID_PUBLIC_KEY = ''; // TODO: set when web-push VAPID keys are generated

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function CABT_pushPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function CABT_pushSubscribe() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('push_unsupported');
  }
  const reg = await navigator.serviceWorker.ready;
  // Already subscribed?
  let sub = await reg.pushManager.getSubscription();
  if (sub) return sub;
  if (!CABT_VAPID_PUBLIC_KEY) throw new Error('vapid_key_not_configured');
  sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: _urlBase64ToUint8Array(CABT_VAPID_PUBLIC_KEY),
  });
  // Persist to push_subscriptions table (service handles upsert by token uniqueness)
  if (CABT_getApiMode() === 'supabase') {
    try {
      const sb = await CABT_sb();
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        await sb.from('push_subscriptions').upsert({
          profile_id: user.id,
          platform: 'web',
          token: JSON.stringify(sub.toJSON()),
          last_seen: new Date().toISOString(),
          revoked_at: null,
        }, { onConflict: 'token' });
      }
    } catch (e) { console.warn('[CABT] push subscribe persist failed', e); }
  }
  return sub;
}

async function CABT_pushUnsubscribe() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const token = JSON.stringify(sub.toJSON());
  await sub.unsubscribe();
  if (CABT_getApiMode() === 'supabase') {
    try {
      const sb = await CABT_sb();
      await sb.from('push_subscriptions').update({ revoked_at: new Date().toISOString() }).eq('token', token);
    } catch (e) { /* non-fatal */ }
  }
}

async function CABT_pushIsSubscribed() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch (_e) { return false; }
}

async function CABT_currentSession() {
  const sb = await CABT_sb();
  const result = await _withTimeout(sb.auth.getSession(), 2500, 'getSession', null);
  if (result && result.__timedOut) return null;
  return result?.data?.session || null;
}

async function CABT_currentProfile() {
  const sb = await CABT_sb();
  const result = await _withTimeout(sb.auth.getUser(), 2500, 'getUser', null);
  if (result && result.__timedOut) return null;
  const user = result?.data?.user;
  if (!user) return null;
  const profileResult = await _withTimeout(
    sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    3000, 'profile_query', null
  );
  if (profileResult && profileResult.__timedOut) return null;
  if (profileResult?.error) throw profileResult.error;
  return profileResult?.data || null;
}

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

const CABT_api = {
  async loadState() {
    const mode = CABT_getApiMode();
    if (mode === 'local')    return window.CABT_loadState();
    if (mode === 'sheet')    return loadStateSheet();
    if (mode === 'supabase') return loadStateSupabase();
  },
  async submitMonthlyMetrics(row) { return route('submitMonthlyMetrics', row, 'monthly_metrics'); },
  async submitEvent(row)          { return route('submitEvent',          row, 'growth_events'); },
  async submitSurvey(row)         { return route('submitSurvey',         row, 'surveys'); },
  async submitContract(row)       { return route('submitContract',       row, 'clients'); },
  async submitAdjustment(row)     { return route('submitAdjustment',     row, 'adjustments'); },
  async submitClient(row)         { return route('submitClient',         row, 'clients'); },
  async updateMonthlyMetrics(id, row) { return updateRoute(row, 'monthly_metrics', id); },
  async updateEvent(id, row)          { return updateRoute(row, 'growth_events',   id); },
  async updateSurvey(id, row)         { return updateRoute(row, 'surveys',         id); },
  async updateClient(id, row)         { return updateRoute(row, 'clients',         id); },
  async deleteRow(table, id) {
    const mode = CABT_getApiMode();
    if (mode !== 'supabase') return { id };
    const sb = await CABT_sb();
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
    return { id };
  },
  async approve(id) {
    const mode = CABT_getApiMode();
    if (mode === 'local')    return { id };
    if (mode === 'sheet')    return CABT_callSheet('approveAdjustment', { id });
    const sb = await CABT_sb();
    const { error } = await sb.from('adjustments').update({ status: 'Paid', approved_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { id };
  },
  async reject(id) {
    const mode = CABT_getApiMode();
    if (mode === 'local')    return { id };
    if (mode === 'sheet')    return CABT_callSheet('rejectAdjustment', { id });
    const sb = await CABT_sb();
    const { error } = await sb.from('adjustments').update({ status: 'Rejected', rejected_at: new Date().toISOString() }).eq('id', id);
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
  async submitEditRequest({ tableName, rowId, fieldChanges, reason }) {
    const mode = CABT_getApiMode();
    if (mode !== 'supabase') return { id: 'local-' + Date.now() };
    const sb = await CABT_sb();
    const { data: { user } } = await sb.auth.getUser();
    const { data, error } = await sb.from('edit_requests').insert({
      table_name: tableName, row_id: rowId, field_changes: fieldChanges, reason, requested_by: user.id,
    }).select().single();
    if (error) throw error;
    return toUI(data);
  },
  async approveEditRequest(id) {
    if (CABT_getApiMode() !== 'supabase') return { id };
    const sb = await CABT_sb();
    const { error } = await sb.from('edit_requests').update({ status: 'approved' }).eq('id', id);
    if (error) throw error;
    return { id };
  },
  async caScorecard(caId, { quarterStart, quarterEnd } = {}) {
    if (CABT_getApiMode() !== 'supabase') return null;
    const sb = await CABT_sb();
    const { data, error } = await sb.rpc('fn_ca_scorecard', { p_ca_id: caId, p_quarter_start: quarterStart || null, p_quarter_end: quarterEnd || null });
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
  // F1.1.3 — paginated audit_log fetch with optional filters.
  async fetchAuditLog({ actorId, tableName, action, fromDate, toDate, limit = 50, offset = 0 } = {}) {
    if (CABT_getApiMode() !== 'supabase') return { rows: [], hasMore: false };
    const sb = await CABT_sb();
    let q = sb.from('audit_log').select('*').order('at', { ascending: false });
    if (actorId)   q = q.eq('actor_id', actorId);
    if (tableName) q = q.eq('table_name', tableName);
    if (action)    q = q.eq('action', action);
    if (fromDate)  q = q.gte('at', new Date(fromDate).toISOString());
    if (toDate)    q = q.lt('at',  new Date(new Date(toDate).getTime() + 86400000).toISOString());
    q = q.range(offset, offset + limit); // fetch one extra to detect hasMore
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    const hasMore = rows.length > limit;
    return { rows: toUI(hasMore ? rows.slice(0, limit) : rows), hasMore };
  },
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

async function route(sheetAction, row, supabaseTable) {
  const mode = CABT_getApiMode();
  if (mode === 'local') return row;
  if (mode === 'sheet') return CABT_callSheet(sheetAction, row);
  const sb = await CABT_sb();
  const payload = toDB(row);
  if (!payload.created_by) {
    const { data: { user } } = await sb.auth.getUser();
    if (user?.id) payload.created_by = user.id;
  }
  const { data, error } = await sb.from(supabaseTable).insert(payload).select().single();
  if (error) throw error;
  return toUI(data);
}

async function updateRoute(row, supabaseTable, id) {
  const mode = CABT_getApiMode();
  if (mode === 'local') return { ...row, id };
  if (mode === 'sheet') throw new Error('updateRoute not supported in sheet mode');
  const sb = await CABT_sb();
  const payload = toDB(row);
  delete payload.id; delete payload.created_at; delete payload.created_by;
  const { data, error } = await sb.from(supabaseTable).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return toUI(data);
}

async function loadStateSheet() {
  const boot = await CABT_callSheet('getBootstrap', {});
  return {
    _live: true, me: boot.me, role: boot.me.kind,
    cas: (boot.cas || []).map(toUI), sales: (boot.sales || []).map(toUI),
    config: boot.config,
    clients: [], monthlyMetrics: [], growthEvents: [], surveys: [], adjustments: [], pendingClients: [],
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
    _live: true, me: profile, role: profile?.role,
    cas: toUI(cas.data || []), sales: toUI(sales.data || []),
    clients: toUI(clients.data || []), monthlyMetrics: toUI(mm.data || []),
    growthEvents: toUI(ge.data || []), surveys: toUI(sv.data || []),
    adjustments: toUI(adj.data || []), config: cfg.data?.values || {},
    pendingClients: toUI(pending.data || []), openQuestions: toUI(oq.data || []),
  };
}

const CABT_ROLE_LABELS  = { owner:'Owner', admin:'Admin', integrator:'Fractional Integrator', ca:'Client Associate', sales:'Sales' };
const CABT_ROLE_SHORT   = { owner:'Owner', admin:'Admin', integrator:'FI', ca:'CA', sales:'Sales' };
const CABT_SALES_ROLE_LABELS = { AM:'Account Manager', RDR:'Relationship Development Rep' };
const CABT_SALES_ROLE_SHORT  = { AM:'AM', RDR:'RDR' };

function CABT_roleLabel(role, salesRole) {
  if (role === 'sales' && salesRole) return CABT_SALES_ROLE_LABELS[salesRole] || 'Sales';
  return CABT_ROLE_LABELS[role] || role || 'Unknown';
}
function CABT_roleShort(role, salesRole) {
  if (role === 'sales' && salesRole) return CABT_SALES_ROLE_SHORT[salesRole] || 'Sales';
  return CABT_ROLE_SHORT[role] || role || '?';
}

// F1.1.1 — calls the admin-invite-user Edge Function (server-side service role).
// Caller must be signed in as owner/admin; integrator + others are rejected with 403.
async function CABT_inviteUser({ email, displayName, role, password, caId, salesRole, salesId }) {
  const sb = await CABT_sb();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('not_signed_in');
  const res = await fetch(`${CABT_SUPABASE_URL}/functions/v1/admin-invite-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': CABT_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      display_name: displayName,
      role,
      password,
      ca_id: caId || null,
      sales_role: salesRole || null,
      sales_id: salesId || null,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    const err = new Error(json.error || ('invite_failed_' + res.status));
    err.detail = json.detail; err.status = res.status;
    throw err;
  }
  return json;
}

// F1.1.2 — calls the admin-edit-user Edge Function.
// action='update_profile' or 'reset_password'. Caller must be owner/admin.
async function CABT_editUser({ action, userId, ...rest }) {
  const sb = await CABT_sb();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('not_signed_in');
  // Convert camelCase fields to snake_case for the EF.
  const body = { action, user_id: userId };
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    body[camelToSnake(k)] = v;
  }
  const res = await fetch(`${CABT_SUPABASE_URL}/functions/v1/admin-edit-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': CABT_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    const err = new Error(json.error || ('edit_failed_' + res.status));
    err.detail = json.detail; err.status = res.status;
    throw err;
  }
  return json;
}

Object.assign(window, {
  CABT_api, CABT_getApiMode, CABT_setApiMode, CABT_getApiUrl, CABT_setApiUrl,
  CABT_signInWithGoogle, CABT_signInWithEmail, CABT_signInWithPassword,
  CABT_resetPassword,
  CABT_signOut, CABT_currentSession, CABT_currentProfile,
  CABT_sb, CABT_SUPABASE_URL, CABT_SUPABASE_ANON_KEY,
  CABT_ROLE_LABELS, CABT_ROLE_SHORT, CABT_SALES_ROLE_LABELS, CABT_SALES_ROLE_SHORT,
  CABT_roleLabel, CABT_roleShort, CABT_inviteUser, CABT_editUser,
  CABT_pushPermissionState, CABT_pushSubscribe, CABT_pushUnsubscribe, CABT_pushIsSubscribed,
});

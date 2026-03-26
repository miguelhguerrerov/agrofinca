// ============================================
// AgroFinca - Supabase Client (Lightweight)
// Cloud sync layer using REST API
// Uses centralized AppConfig
// ============================================

const SupabaseClient = (() => {
  // Use centralized configuration
  const SUPABASE_URL = AppConfig.SUPABASE_URL;
  const SUPABASE_ANON_KEY = AppConfig.SUPABASE_ANON_KEY;
  let accessToken = localStorage.getItem('agrofinca_access_token') || '';
  let refreshToken = localStorage.getItem('agrofinca_refresh_token') || '';

  function getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Prefer': 'return=representation'
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
  }

  // Auth functions
  async function signUp(email, password, name) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({
        email,
        password,
        data: { nombre: name }
      })
    });
    const data = await res.json();
    // Supabase returns errors in different formats: {error, error_description}, {error_code, msg}, or HTTP status
    if (!res.ok || data.error || data.error_code || data.msg === 'Invalid login credentials') {
      const msg = data.error_description || data.msg || data.error?.message || data.error || `Error HTTP ${res.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    if (data.access_token) {
      setTokens(data.access_token, data.refresh_token);
    }
    return data;
  }

  async function signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    // Supabase returns errors in different formats: {error, error_description}, {error_code, msg}, or HTTP status
    if (!res.ok || data.error || data.error_code) {
      const msg = data.error_description || data.msg || data.error?.message || data.error || `Error HTTP ${res.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    if (!data.access_token) {
      throw new Error('No se recibió token de acceso del servidor');
    }
    setTokens(data.access_token, data.refresh_token);
    return data;
  }

  async function signOut() {
    if (accessToken) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: getHeaders()
        });
      } catch (e) { /* ignore */ }
    }
    clearTokens();
  }

  async function getUser() {
    if (!accessToken) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: getHeaders()
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function refreshSession() {
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      const data = await res.json();
      if (data.access_token) {
        setTokens(data.access_token, data.refresh_token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function setTokens(access, refresh) {
    accessToken = access;
    refreshToken = refresh;
    localStorage.setItem('agrofinca_access_token', access);
    localStorage.setItem('agrofinca_refresh_token', refresh);
  }

  function clearTokens() {
    accessToken = '';
    refreshToken = '';
    localStorage.removeItem('agrofinca_access_token');
    localStorage.removeItem('agrofinca_refresh_token');
  }

  function hasSession() {
    return !!accessToken;
  }

  // REST API calls (for sync)
  // Convention: all REST methods return {ok, data} or {ok, error, code, permanent}
  async function select(table, filters = {}) {
    if (!accessToken) return {ok: true, data: []};
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    for (const [key, value] of Object.entries(filters)) {
      url += `&${key}=eq.${encodeURIComponent(value)}`;
    }
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const records = await res.json();
        return {ok: true, data: records};
      }
      const errText = await res.text().catch(() => res.statusText);
      const permanent = res.status >= 400 && res.status < 500;
      return {ok: false, error: `HTTP ${res.status}: ${errText}`, code: res.status, permanent};
    } catch (err) {
      return {ok: false, error: err.message, code: null, permanent: false};
    }
  }

  async function upsert(table, record) {
    if (!accessToken) return {ok: false, error: 'No session', code: null, permanent: false};
    try {
      const headers = getHeaders();
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(record)
      });
      if (res.ok) {
        const data = await res.json();
        return {ok: true, data: data[0] || record};
      }
      const errText = await res.text().catch(() => res.statusText);
      if (res.status === 400) {
        return {ok: false, error: errText, code: 400, permanent: true};
      }
      if (res.status === 401 || res.status === 403) {
        return {ok: false, error: 'Permission denied: ' + errText, code: res.status, permanent: true};
      }
      if (res.status === 404) {
        return {ok: false, error: 'Table not found', code: 404, permanent: true};
      }
      // For 409 conflict, try PATCH instead (some RLS configs block POST for existing records)
      if (res.status === 409) {
        return await patchRecord(table, record);
      }
      // 5xx server errors
      return {ok: false, error: errText, code: res.status, permanent: false};
    } catch (err) {
      return {ok: false, error: err.message, code: null, permanent: false};
    }
  }

  // Fallback: PATCH existing record
  async function patchRecord(table, record) {
    if (!record.id) return {ok: false, error: 'Record has no id', code: null, permanent: true};
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${record.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(record)
      });
      if (res.ok) {
        const data = await res.json();
        if (!data || data.length === 0) {
          return {ok: false, error: 'Record not found on server', code: 200, permanent: false};
        }
        return {ok: true, data: data[0]};
      }
      const errText = await res.text().catch(() => res.statusText);
      const permanent = res.status >= 400 && res.status < 500;
      return {ok: false, error: `HTTP ${res.status}: ${errText}`, code: res.status, permanent};
    } catch (err) {
      return {ok: false, error: err.message, code: null, permanent: false};
    }
  }

  async function deleteRecord(table, id) {
    if (!accessToken) return {ok: false, error: 'No session', code: null, permanent: false};
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        return {ok: true, data: null};
      }
      const errText = await res.text().catch(() => res.statusText);
      const permanent = res.status >= 400 && res.status < 500;
      return {ok: false, error: `HTTP ${res.status}: ${errText}`, code: res.status, permanent};
    } catch (err) {
      return {ok: false, error: err.message, code: null, permanent: false};
    }
  }

  // Upload photo to Supabase Storage
  async function uploadPhoto(bucket, filePath, fileData, contentType) {
    if (!accessToken) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': contentType
        },
        body: fileData
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`;
    } catch (err) {
      console.warn('Supabase upload error:', err);
      return null;
    }
  }

  // Get records updated after a timestamp
  // fincaId is optional - only added if the table has a finca_id column
  // The caller (SyncEngine) is responsible for NOT passing fincaId for tables like 'fincas'
  async function getUpdatedSince(table, since, fincaId) {
    if (!accessToken) return {ok: true, data: []};
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*&updated_at=gte.${encodeURIComponent(since)}`;
    if (fincaId) {
      url += `&finca_id=eq.${fincaId}`;
    }
    url += '&order=updated_at.asc&limit=500';
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const records = await res.json();
        return {ok: true, data: records};
      }
      const errText = await res.text().catch(() => res.statusText);
      const permanent = res.status < 500;
      return {ok: false, error: errText, code: res.status, permanent};
    } catch (err) {
      return {ok: false, error: err.message, code: null, permanent: false};
    }
  }

  // Call Supabase Edge Function
  async function callEdgeFunction(functionName, body = {}) {
    if (!accessToken) throw new Error('No authenticated');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Edge Function error ${res.status}: ${errText}`);
    }
    return await res.json();
  }

  // Fetch user profile (plan, admin status, rol)
  async function getUserProfile() {
    if (!accessToken) return null;
    try {
      // Must filter by own user ID since user_profiles_search policy allows seeing all profiles
      const user = await getUser();
      const uid = user?.id;
      const url = uid
        ? `${SUPABASE_URL}/rest/v1/user_profiles?select=*&id=eq.${uid}`
        : `${SUPABASE_URL}/rest/v1/user_profiles?select=*&limit=1`;
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) return null;
      const profiles = await res.json();
      return profiles[0] || null;
    } catch {
      return null;
    }
  }

  // Create or update user profile
  async function upsertUserProfile(profile) {
    return upsert('user_profiles', profile);
  }

  // ══════════════════════════════════════════
  // REALTIME (WebSocket for chat)
  // ══════════════════════════════════════════
  let _rtSocket = null;
  let _rtChannels = {};
  let _rtRef = 0;
  let _rtHeartbeatTimer = null;
  let _rtReconnectTimer = null;

  function connectRealtime() {
    if (_rtSocket && _rtSocket.readyState <= 1) return; // already open/connecting
    const token = localStorage.getItem('agrofinca_access_token');
    if (!token) return;

    const wsUrl = AppConfig.SUPABASE_URL.replace('https://', 'wss://')
      + '/realtime/v1/websocket?apikey=' + AppConfig.SUPABASE_ANON_KEY + '&vsn=1.0.0';

    _rtSocket = new WebSocket(wsUrl);

    _rtSocket.onopen = () => {
      console.log('[Realtime] Connected');
      // Authenticate
      _rtSend('realtime:*', 'phx_join', { access_token: token });
      // Start heartbeat
      _rtHeartbeatTimer = setInterval(() => {
        _rtSend('phoenix', 'heartbeat', {});
      }, 30000);
      // Re-subscribe existing channels
      for (const [name, ch] of Object.entries(_rtChannels)) {
        _rtJoinChannel(ch.topic);
      }
    };

    _rtSocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Route INSERT/UPDATE/DELETE events to callbacks
        if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
          const ch = Object.values(_rtChannels).find(c => c.topic === msg.topic);
          if (ch && ch.callback) ch.callback(msg.event, msg.payload?.record || msg.payload);
        }
      } catch (e) {}
    };

    _rtSocket.onclose = () => {
      console.log('[Realtime] Disconnected');
      clearInterval(_rtHeartbeatTimer);
      // Auto-reconnect after 5s
      _rtReconnectTimer = setTimeout(() => connectRealtime(), 5000);
    };

    _rtSocket.onerror = () => {};
  }

  function _rtSend(topic, event, payload) {
    if (!_rtSocket || _rtSocket.readyState !== 1) return;
    _rtSocket.send(JSON.stringify({
      topic, event, payload, ref: String(++_rtRef)
    }));
  }

  function _rtJoinChannel(topic) {
    _rtSend(topic, 'phx_join', { user_token: localStorage.getItem('agrofinca_access_token') });
  }

  function subscribeToChat(conversacionId, callback) {
    const topic = `realtime:public:chat_mensajes:conversacion_id=eq.${conversacionId}`;
    _rtChannels[conversacionId] = { topic, callback };
    if (_rtSocket && _rtSocket.readyState === 1) {
      _rtJoinChannel(topic);
    }
  }

  function unsubscribeChat(conversacionId) {
    const ch = _rtChannels[conversacionId];
    if (ch) {
      _rtSend(ch.topic, 'phx_leave', {});
      delete _rtChannels[conversacionId];
    }
  }

  function disconnectRealtime() {
    clearInterval(_rtHeartbeatTimer);
    clearTimeout(_rtReconnectTimer);
    _rtChannels = {};
    if (_rtSocket) {
      _rtSocket.close();
      _rtSocket = null;
    }
  }

  async function healthCheck() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
        headers: { 'apikey': SUPABASE_ANON_KEY },
        signal: controller.signal
      });
      clearTimeout(timeout);
      return res.ok || res.status === 404 || res.status === 400; // Server is responding
    } catch {
      return false;
    }
  }

  async function batchUpsert(table, records) {
    if (!records || records.length === 0) return {ok: true, data: []};
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(records) // Array body for bulk
      });
      if (res.ok) {
        const data = await res.json();
        return {ok: true, data};
      }
      const errText = await res.text().catch(() => res.statusText);
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 409;
      return {ok: false, error: `HTTP ${res.status}: ${errText}`, code: res.status, permanent};
    } catch (err) {
      return {ok: false, error: err.message, code: null, permanent: false};
    }
  }

  return {
    signUp,
    signIn,
    signOut,
    getUser,
    refreshSession,
    hasSession,
    select,
    upsert,
    deleteRecord,
    uploadPhoto,
    getUpdatedSince,
    clearTokens,
    callEdgeFunction,
    getUserProfile,
    upsertUserProfile,
    healthCheck,
    batchUpsert,
    connectRealtime,
    subscribeToChat,
    unsubscribeChat,
    disconnectRealtime
  };
})();

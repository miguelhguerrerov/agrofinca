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
  async function select(table, filters = {}) {
    if (!accessToken) return [];
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    for (const [key, value] of Object.entries(filters)) {
      url += `&${key}=eq.${encodeURIComponent(value)}`;
    }
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Supabase select error:', err);
      return [];
    }
  }

  async function upsert(table, record) {
    if (!accessToken) return null;
    try {
      const headers = getHeaders();
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(record)
      });
      if (!res.ok) {
        const errText = await res.text();
        // Log detailed error for debugging
        console.error(`[Supabase] Upsert ${table} failed (${res.status}):`, errText);
        // If table doesn't exist (404) or permission denied (403/401), throw to let caller handle
        if (res.status === 404) {
          throw new Error(`Table '${table}' not found in Supabase (404)`);
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Permission denied for '${table}' (${res.status}): ${errText}`);
        }
        // For 409 conflict, try PATCH instead (some RLS configs block POST for existing records)
        if (res.status === 409) {
          return await patchRecord(table, record);
        }
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const data = await res.json();
      return data[0] || record;
    } catch (err) {
      console.error(`[Supabase] Upsert error (${table}):`, err.message || err);
      return null;
    }
  }

  // Fallback: PATCH existing record
  async function patchRecord(table, record) {
    if (!record.id) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${record.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(record)
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data[0] || record;
    } catch {
      return null;
    }
  }

  async function deleteRecord(table, id) {
    if (!accessToken) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      return res.ok;
    } catch (err) {
      console.warn('Supabase delete error:', err);
      return false;
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
  async function getUpdatedSince(table, since, fincaId) {
    if (!accessToken) return [];
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*&updated_at=gte.${encodeURIComponent(since)}`;
    if (fincaId) {
      url += `&finca_id=eq.${fincaId}`;
    }
    url += '&order=updated_at.asc';
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
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

  // Fetch user profile (plan, admin status)
  async function getUserProfile() {
    if (!accessToken) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=*`, {
        headers: getHeaders()
      });
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
    upsertUserProfile
  };
})();

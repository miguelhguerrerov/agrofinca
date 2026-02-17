// ============================================
// AgroFinca - Supabase Client (Lightweight)
// Cloud sync layer using REST API
// ============================================

const SupabaseClient = (() => {
  // Configuration - user must set these in Configuración
  let SUPABASE_URL = localStorage.getItem('agrofinca_supabase_url') || '';
  let SUPABASE_ANON_KEY = localStorage.getItem('agrofinca_supabase_key') || '';
  let accessToken = localStorage.getItem('agrofinca_access_token') || '';
  let refreshToken = localStorage.getItem('agrofinca_refresh_token') || '';

  function isConfigured() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  function configure(url, key) {
    SUPABASE_URL = url;
    SUPABASE_ANON_KEY = key;
    localStorage.setItem('agrofinca_supabase_url', url);
    localStorage.setItem('agrofinca_supabase_key', key);
  }

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
    if (data.error) throw new Error(data.error.message || data.msg);
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
    if (data.error) throw new Error(data.error_description || data.error.message || data.msg);
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
    if (!isConfigured() || !accessToken) return [];
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
    if (!isConfigured() || !accessToken) return null;
    try {
      const headers = getHeaders();
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(record)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err}`);
      }
      const data = await res.json();
      return data[0] || record;
    } catch (err) {
      console.warn('Supabase upsert error:', err);
      return null;
    }
  }

  async function deleteRecord(table, id) {
    if (!isConfigured() || !accessToken) return false;
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
    if (!isConfigured() || !accessToken) return null;
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
    if (!isConfigured() || !accessToken) return [];
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

  return {
    isConfigured,
    configure,
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
    clearTokens
  };
})();

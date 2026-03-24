// ============================================
// AgroFinca - AI Cache Layer
// localStorage cache with TTL for AI responses
// ============================================

const AICache = (() => {
  const PREFIX = 'ai_cache_';

  function get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() > entry.expires) {
        localStorage.removeItem(PREFIX + key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  function set(key, data, ttlMinutes = 240) {
    try {
      const entry = {
        data,
        expires: Date.now() + ttlMinutes * 60 * 1000
      };
      localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch (e) {
      console.warn('[AICache] Storage full, clearing old entries');
      clearOldest();
    }
  }

  function invalidate(key) {
    localStorage.removeItem(PREFIX + key);
  }

  function invalidateAll(fincaId) {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith(PREFIX) && k.includes(fincaId)
    );
    keys.forEach(k => localStorage.removeItem(k));
  }

  function clearOldest() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
    for (const k of keys) {
      try {
        const entry = JSON.parse(localStorage.getItem(k));
        if (!entry || Date.now() > entry.expires) {
          localStorage.removeItem(k);
        }
      } catch {
        localStorage.removeItem(k);
      }
    }
  }

  return { get, set, invalidate, invalidateAll };
})();

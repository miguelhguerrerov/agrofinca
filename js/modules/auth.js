// ============================================
// AgroFinca - Auth Module
// User registration, login, offline mode
// With user profiles (plan, admin status)
// Security: online-only registration, 72h offline expiry,
// server-side plan/admin validation
// ============================================

const AuthModule = (() => {
  let currentUser = null;

  // Session keys
  const SESSION_KEY = 'agrofinca_user';
  const LAST_ONLINE_KEY = 'agrofinca_last_online_auth';
  const OFFLINE_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 hours

  function init() {
    // Login form
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-register').addEventListener('click', handleRegister);
    document.getElementById('btn-offline-mode').addEventListener('click', handleOfflineMode);
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
    });
    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
    });

    // Enter key on inputs
    ['login-email', 'login-password'].forEach(id => {
      document.getElementById(id).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
      });
    });
    ['reg-name', 'reg-email', 'reg-password', 'reg-password2'].forEach(id => {
      document.getElementById(id).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleRegister();
      });
    });
  }

  // ---- Input Validation ----

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function sanitizeText(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function validateName(name) {
    if (name.length < 2) return 'El nombre debe tener al menos 2 caracteres';
    if (name.length > 100) return 'El nombre es demasiado largo';
    return null;
  }

  // ---- Login ----

  async function handleLogin() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      App.showToast('Completa todos los campos', 'warning');
      return;
    }
    if (!validateEmail(email)) {
      App.showToast('Correo electrónico no válido', 'warning');
      return;
    }

    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    try {
      if (SyncEngine.isOnline()) {
        // Online login via Supabase
        await SupabaseClient.signIn(email, password);
        const supaUser = await SupabaseClient.getUser();

        // Fetch user profile from server (source of truth for plan/admin)
        const profile = await SupabaseClient.getUserProfile();

        // Save/update user locally
        let localUser = await findLocalUserByEmail(email);
        if (!localUser) {
          localUser = await AgroDB.add('usuarios', {
            id: supaUser.id,
            email: email,
            nombre: supaUser.user_metadata?.nombre || email.split('@')[0],
            rol: 'propietario',
            avatar_iniciales: Format.initials(supaUser.user_metadata?.nombre || email),
            plan: profile?.plan || AppConfig.PLAN_FREE,
            is_admin: profile?.is_admin || false,
            password_hash: simpleHash(password),
            created_at: new Date().toISOString()
          });
        } else {
          // Update local user with server profile (server is source of truth)
          localUser = await AgroDB.update('usuarios', localUser.id, {
            plan: profile?.plan || AppConfig.PLAN_FREE,
            is_admin: profile?.is_admin || false,
            password_hash: simpleHash(password)
          });
        }
        currentUser = localUser;

        // Mark online authentication timestamp
        markOnlineAuth();
      } else {
        // Offline login - only if user has logged in online before
        const localUser = await findLocalUserByEmail(email);
        if (!localUser) {
          throw new Error('Sin conexión. Debes iniciar sesión en línea al menos una vez.');
        }
        if (localUser.es_offline) {
          throw new Error('Sin conexión. Debes iniciar sesión en línea al menos una vez.');
        }
        // Check 72-hour offline expiry
        if (isOfflineSessionExpired()) {
          throw new Error('Tu sesión sin conexión ha expirado. Conéctate a internet para validar tu cuenta.');
        }
        // Check password
        if (localUser.password_hash !== simpleHash(password)) {
          throw new Error('Contraseña incorrecta');
        }
        currentUser = localUser;
      }

      saveSession(currentUser);
      App.showToast('¡Bienvenido!', 'success');
      App.onAuthSuccess(currentUser);
    } catch (err) {
      App.showToast(err.message || 'Error al iniciar sesión', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  }

  // ---- Registration (Online Only) ----

  async function handleRegister() {
    const name = sanitizeText(document.getElementById('reg-name').value.trim());
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;

    // Validations
    if (!name || !email || !password) {
      App.showToast('Completa todos los campos', 'warning');
      return;
    }
    const nameError = validateName(name);
    if (nameError) {
      App.showToast(nameError, 'warning');
      return;
    }
    if (!validateEmail(email)) {
      App.showToast('Correo electrónico no válido', 'warning');
      return;
    }
    if (password.length < 6) {
      App.showToast('La contraseña debe tener al menos 6 caracteres', 'warning');
      return;
    }
    if (password !== password2) {
      App.showToast('Las contraseñas no coinciden', 'warning');
      return;
    }

    // Registration requires internet
    if (!SyncEngine.isOnline()) {
      App.showToast('Se requiere conexión a internet para crear una cuenta', 'error');
      return;
    }

    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    try {
      // Register in Supabase (mandatory)
      const result = await SupabaseClient.signUp(email, password, name);
      const userId = result.user?.id || AgroDB.uuid();

      // If signup didn't return a session, auto-login
      if (!SupabaseClient.hasSession()) {
        await SupabaseClient.signIn(email, password);
      }

      // Verify we have a valid session
      if (!SupabaseClient.hasSession()) {
        throw new Error('No se pudo verificar la cuenta. Intenta iniciar sesión.');
      }

      // Create user profile in Supabase
      await SupabaseClient.upsertUserProfile({
        id: userId,
        email: email,
        nombre: name,
        plan: AppConfig.PLAN_FREE,
        is_admin: false,
        farm_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // Save locally (update if exists, add if new)
      let localUser = await findLocalUserByEmail(email);
      if (localUser) {
        localUser = await AgroDB.update('usuarios', localUser.id, {
          nombre: name,
          password_hash: simpleHash(password),
          plan: AppConfig.PLAN_FREE,
          is_admin: false
        });
      } else {
        localUser = await AgroDB.add('usuarios', {
          id: userId,
          email: email,
          nombre: name,
          rol: 'propietario',
          avatar_iniciales: Format.initials(name),
          password_hash: simpleHash(password),
          plan: AppConfig.PLAN_FREE,
          is_admin: false,
          created_at: new Date().toISOString()
        });
      }

      currentUser = localUser;
      markOnlineAuth();
      saveSession(currentUser);
      App.showToast('¡Cuenta creada exitosamente!', 'success');
      App.onAuthSuccess(currentUser);
    } catch (err) {
      App.showToast(err.message || 'Error al crear cuenta', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Crear Cuenta';
    }
  }

  // ---- Offline Mode ----
  // Only available if user has previously logged in online

  async function handleOfflineMode() {
    // Check if there's any previously authenticated user locally
    const users = await AgroDB.getAll('usuarios');
    const validUsers = users.filter(u => !u.es_offline && u.email !== 'offline@agrofinca.local');

    if (validUsers.length === 0) {
      App.showToast('Debes crear una cuenta e iniciar sesión en línea primero', 'warning');
      return;
    }

    // Check 72-hour expiry
    if (isOfflineSessionExpired()) {
      App.showToast('Tu sesión sin conexión ha expirado. Conéctate a internet para continuar.', 'error');
      return;
    }

    // Use the most recently authenticated user
    const lastUser = validUsers[0];
    currentUser = lastUser;
    // Force free plan in offline mode (server is source of truth)
    // We keep whatever was last synced from server
    saveSession(currentUser);
    App.showToast('Modo sin conexión activado', 'success');
    App.onAuthSuccess(currentUser);
  }

  // ---- Helper Functions ----

  async function findLocalUserByEmail(email) {
    const users = await AgroDB.getAll('usuarios');
    return users.find(u => u.email === email) || null;
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'h_' + Math.abs(hash).toString(36);
  }

  // ---- Session Management ----

  function markOnlineAuth() {
    localStorage.setItem(LAST_ONLINE_KEY, new Date().toISOString());
  }

  function isOfflineSessionExpired() {
    const lastOnline = localStorage.getItem(LAST_ONLINE_KEY);
    if (!lastOnline) return true; // Never authenticated online
    const elapsed = Date.now() - new Date(lastOnline).getTime();
    return elapsed > OFFLINE_EXPIRY_MS;
  }

  function saveSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      // plan and is_admin are saved but will be re-validated from server on restore
      plan: user.plan || AppConfig.PLAN_FREE,
      is_admin: user.is_admin || false
    }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LAST_ONLINE_KEY);
    currentUser = null;
    SupabaseClient.clearTokens();
  }

  async function restoreSession() {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      const localUser = await AgroDB.getById('usuarios', parsed.id);
      if (!localUser) {
        clearSession();
        return null;
      }

      currentUser = localUser;

      if (SyncEngine.isOnline() && SupabaseClient.hasSession()) {
        // Online: validate plan/admin from server (source of truth)
        const refreshed = await SupabaseClient.refreshSession();
        if (refreshed) {
          const profile = await SupabaseClient.getUserProfile();
          if (profile) {
            // Server is source of truth for plan and admin status
            currentUser.plan = profile.plan || AppConfig.PLAN_FREE;
            currentUser.is_admin = profile.is_admin === true;
            // Update local DB
            await AgroDB.update('usuarios', currentUser.id, {
              plan: currentUser.plan,
              is_admin: currentUser.is_admin
            });
            saveSession(currentUser);
          }
          markOnlineAuth();
        } else {
          // Token refresh failed - session invalid
          clearSession();
          return null;
        }
      } else {
        // Offline: check 72-hour expiry
        if (isOfflineSessionExpired()) {
          App.showToast('Tu sesión sin conexión ha expirado. Conéctate a internet.', 'warning');
          clearSession();
          return null;
        }
        // In offline mode, use locally cached plan/admin (last known from server)
        // but never trust localStorage directly - use IndexedDB value
        currentUser.plan = localUser.plan || AppConfig.PLAN_FREE;
        currentUser.is_admin = localUser.is_admin === true;
      }

      return currentUser;
    } catch (e) {
      console.warn('Session restore failed:', e);
      clearSession();
      return null;
    }
  }

  async function logout() {
    try {
      await SupabaseClient.signOut();
    } catch (e) { /* ignore */ }
    clearSession();
  }

  function getUser() {
    return currentUser;
  }

  function getUserId() {
    return currentUser ? currentUser.id : null;
  }

  function isPaid() {
    return currentUser?.plan === AppConfig.PLAN_PAID;
  }

  function isAdmin() {
    return currentUser?.is_admin === true;
  }

  // Get user role in a specific finca
  async function getUserRoleInFinca(fincaId) {
    if (!currentUser) return null;
    // Check if owner
    const finca = await AgroDB.getById('fincas', fincaId);
    if (finca && finca.propietario_id === currentUser.id) {
      return AppConfig.ROL_PROPIETARIO;
    }
    // Check membership
    const members = await AgroDB.getByIndex('finca_miembros', 'finca_id', fincaId);
    const membership = members.find(m => m.usuario_id === currentUser.id);
    return membership ? (membership.rol || AppConfig.ROL_TRABAJADOR) : null;
  }

  // Check if user can access financial features in a finca
  async function canAccessFinances(fincaId) {
    const role = await getUserRoleInFinca(fincaId);
    return role === AppConfig.ROL_PROPIETARIO;
  }

  // Check if user can manage members in a finca
  async function canManageMembers(fincaId) {
    const role = await getUserRoleInFinca(fincaId);
    return role === AppConfig.ROL_PROPIETARIO;
  }

  return {
    init, getUser, getUserId, logout, restoreSession, handleOfflineMode,
    isPaid, isAdmin, getUserRoleInFinca, canAccessFinances, canManageMembers,
    sanitizeText
  };
})();

// ============================================
// AgroFinca - Auth Module
// User registration, login, offline mode
// With user profiles (plan, admin status)
// ============================================

const AuthModule = (() => {
  let currentUser = null;

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
  }

  async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      App.showToast('Completa todos los campos', 'warning');
      return;
    }

    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    try {
      if (SyncEngine.isOnline()) {
        // Online login via Supabase
        const result = await SupabaseClient.signIn(email, password);
        const supaUser = await SupabaseClient.getUser();

        // Fetch user profile (plan, admin status)
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
            created_at: new Date().toISOString()
          });
        } else {
          // Update local user with latest profile info
          localUser = await AgroDB.update('usuarios', localUser.id, {
            plan: profile?.plan || localUser.plan || AppConfig.PLAN_FREE,
            is_admin: profile?.is_admin || false
          });
        }
        currentUser = localUser;
      } else {
        // Offline login - check local database
        const localUser = await findLocalUserByEmail(email);
        if (!localUser) {
          throw new Error('Sin conexión. Usuario no encontrado localmente.');
        }
        // Simple password check (hashed locally)
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

  async function handleRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;

    if (!name || !email || !password) {
      App.showToast('Completa todos los campos', 'warning');
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

    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    try {
      let userId = AgroDB.uuid();

      if (SyncEngine.isOnline()) {
        // Register in Supabase
        const result = await SupabaseClient.signUp(email, password, name);
        if (result.user) userId = result.user.id;

        // Create user profile with free plan
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
      }

      // Always save locally
      const localUser = await AgroDB.add('usuarios', {
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

      currentUser = localUser;
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

  async function handleOfflineMode() {
    // Create or find offline user
    let offlineUser = await findLocalUserByEmail('offline@agrofinca.local');
    if (!offlineUser) {
      offlineUser = await AgroDB.add('usuarios', {
        email: 'offline@agrofinca.local',
        nombre: 'Usuario Local',
        rol: 'propietario',
        avatar_iniciales: 'UL',
        es_offline: true,
        password_hash: simpleHash('offline'),
        plan: AppConfig.PLAN_FREE,
        is_admin: false
      });
    }
    currentUser = offlineUser;
    saveSession(currentUser);
    App.showToast('Modo sin conexión activado', 'success');
    App.onAuthSuccess(currentUser);
  }

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

  function saveSession(user) {
    localStorage.setItem('agrofinca_user', JSON.stringify({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      plan: user.plan || AppConfig.PLAN_FREE,
      is_admin: user.is_admin || false
    }));
  }

  function clearSession() {
    localStorage.removeItem('agrofinca_user');
    currentUser = null;
    SupabaseClient.clearTokens();
  }

  async function restoreSession() {
    const saved = localStorage.getItem('agrofinca_user');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      const localUser = await AgroDB.getById('usuarios', parsed.id);
      if (localUser) {
        currentUser = localUser;
        // Try to refresh Supabase session and update profile
        if (SyncEngine.isOnline() && SupabaseClient.hasSession()) {
          const refreshed = await SupabaseClient.refreshSession();
          if (refreshed) {
            const profile = await SupabaseClient.getUserProfile();
            if (profile) {
              currentUser.plan = profile.plan || currentUser.plan;
              currentUser.is_admin = profile.is_admin || false;
              saveSession(currentUser);
            }
          }
        }
        return currentUser;
      }
    } catch (e) {
      console.warn('Session restore failed:', e);
    }
    return null;
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
    isPaid, isAdmin, getUserRoleInFinca, canAccessFinances, canManageMembers
  };
})();

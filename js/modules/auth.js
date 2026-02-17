// ============================================
// AgroFinca - Auth Module
// User registration, login, offline mode
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
      if (SupabaseClient.isConfigured()) {
        // Online login
        const result = await SupabaseClient.signIn(email, password);
        const supaUser = await SupabaseClient.getUser();

        // Save/update user locally
        let localUser = await findLocalUserByEmail(email);
        if (!localUser) {
          localUser = await AgroDB.add('usuarios', {
            id: supaUser.id,
            email: email,
            nombre: supaUser.user_metadata?.nombre || email.split('@')[0],
            rol: 'propietario',
            avatar_iniciales: Format.initials(supaUser.user_metadata?.nombre || email),
            created_at: new Date().toISOString()
          });
        }
        currentUser = localUser;
      } else {
        // Offline login - check local database
        const localUser = await findLocalUserByEmail(email);
        if (!localUser) {
          throw new Error('Usuario no encontrado. Configura Supabase o usa modo sin conexión.');
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

      if (SupabaseClient.isConfigured()) {
        const result = await SupabaseClient.signUp(email, password, name);
        if (result.user) userId = result.user.id;
      }

      // Always save locally
      const localUser = await AgroDB.add('usuarios', {
        id: userId,
        email: email,
        nombre: name,
        rol: 'propietario',
        avatar_iniciales: Format.initials(name),
        password_hash: simpleHash(password),
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
        password_hash: simpleHash('offline')
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
      nombre: user.nombre
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
        // Try to refresh Supabase session
        if (SupabaseClient.isConfigured() && SupabaseClient.hasSession()) {
          await SupabaseClient.refreshSession();
        }
        return currentUser;
      }
    } catch (e) {
      console.warn('Session restore failed:', e);
    }
    return null;
  }

  async function logout() {
    if (SupabaseClient.isConfigured()) {
      await SupabaseClient.signOut();
    }
    clearSession();
  }

  function getUser() {
    return currentUser;
  }

  function getUserId() {
    return currentUser ? currentUser.id : null;
  }

  return {
    init, getUser, getUserId, logout, restoreSession, handleOfflineMode
  };
})();

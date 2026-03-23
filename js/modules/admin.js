// ============================================
// AgroFinca - Admin Module
// User management and system analytics
// Admin only access
// ============================================

const AdminModule = (() => {

  async function render(container, fincaId) {
    // Check admin access
    if (!AuthModule.isAdmin()) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔐</div>
          <h3>Acceso Denegado</h3>
          <p>No tienes permisos de administrador.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="admin-container">
        <!-- System Stats -->
        <div class="summary-grid" id="admin-stats">
          <div class="summary-card">
            <div class="summary-icon">👥</div>
            <div class="summary-value" id="stat-users">-</div>
            <div class="summary-label">Usuarios</div>
          </div>
          <div class="summary-card">
            <div class="summary-icon">🏡</div>
            <div class="summary-value" id="stat-fincas">-</div>
            <div class="summary-label">Fincas</div>
          </div>
          <div class="summary-card">
            <div class="summary-icon">⭐</div>
            <div class="summary-value" id="stat-premium">-</div>
            <div class="summary-label">Premium</div>
          </div>
          <div class="summary-card">
            <div class="summary-icon">💰</div>
            <div class="summary-value" id="stat-transactions">-</div>
            <div class="summary-label">Transacciones</div>
          </div>
        </div>

        <!-- User Management -->
        <div class="card">
          <div class="card-header">
            <h3>Gestión de Usuarios</h3>
            <button class="btn btn-sm btn-outline" id="admin-refresh">🔄 Actualizar</button>
          </div>
          <div class="card-body">
            <div class="admin-filters">
              <input type="text" id="admin-search" placeholder="Buscar por email o nombre..." class="form-input">
              <select id="admin-filter-plan" class="form-input" style="max-width:150px;">
                <option value="">Todos</option>
                <option value="free">Free</option>
                <option value="paid">Premium</option>
              </select>
            </div>
            <div id="admin-users-list" class="data-list">
              <div class="loading-text">Cargando usuarios...</div>
            </div>
          </div>
        </div>

        <!-- Upgrade Requests -->
        <div class="card">
          <div class="card-header">
            <h3>Solicitudes de Upgrade</h3>
          </div>
          <div class="card-body">
            <div id="admin-upgrade-requests" class="data-list">
              <div class="loading-text">Cargando...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    initEventListeners();
    await loadStats();
    await loadUsers();
    await loadUpgradeRequests();
  }

  function initEventListeners() {
    document.getElementById('admin-refresh')?.addEventListener('click', async () => {
      await loadStats();
      await loadUsers();
      await loadUpgradeRequests();
    });

    document.getElementById('admin-search')?.addEventListener('input', filterUsers);
    document.getElementById('admin-filter-plan')?.addEventListener('change', filterUsers);
  }

  async function loadStats() {
    try {
      const result = await SupabaseClient.callEdgeFunction('admin-api', { action: 'stats' });
      document.getElementById('stat-users').textContent = result.totalUsers || 0;
      document.getElementById('stat-fincas').textContent = result.totalFincas || 0;
      document.getElementById('stat-premium').textContent = result.premiumUsers || 0;
      document.getElementById('stat-transactions').textContent = result.totalTransactions || 0;
    } catch (err) {
      console.warn('Error loading admin stats:', err);
      // Fallback to local data
      const users = await AgroDB.getAll('usuarios');
      const fincas = await AgroDB.getAll('fincas');
      document.getElementById('stat-users').textContent = users.length;
      document.getElementById('stat-fincas').textContent = fincas.length;
      document.getElementById('stat-premium').textContent = users.filter(u => u.plan === 'paid').length;
      const ventas = await AgroDB.getAll('ventas');
      const costos = await AgroDB.getAll('costos');
      document.getElementById('stat-transactions').textContent = ventas.length + costos.length;
    }
  }

  let allUsers = [];

  async function loadUsers() {
    const listEl = document.getElementById('admin-users-list');
    try {
      const result = await SupabaseClient.callEdgeFunction('admin-api', { action: 'list-users' });
      allUsers = result.users || [];
    } catch {
      // Fallback to local
      allUsers = await AgroDB.getAll('usuarios');
    }
    renderUsersList(allUsers, listEl);
  }

  function filterUsers() {
    const search = (document.getElementById('admin-search')?.value || '').toLowerCase();
    const planFilter = document.getElementById('admin-filter-plan')?.value || '';
    const listEl = document.getElementById('admin-users-list');

    let filtered = allUsers;
    if (search) {
      filtered = filtered.filter(u =>
        (u.email || '').toLowerCase().includes(search) ||
        (u.nombre || '').toLowerCase().includes(search)
      );
    }
    if (planFilter) {
      filtered = filtered.filter(u => (u.plan || 'free') === planFilter);
    }
    renderUsersList(filtered, listEl);
  }

  function renderUsersList(users, container) {
    if (!container) return;
    if (users.length === 0) {
      container.innerHTML = '<div class="empty-text">No se encontraron usuarios</div>';
      return;
    }

    const esc = (s) => AuthModule.sanitizeText(s || '');
    container.innerHTML = users.map(user => `
      <div class="data-list-item admin-user-item">
        <div class="data-list-left">
          <div class="avatar-sm">${esc(Format.initials(user.nombre || user.email))}</div>
          <div>
            <div class="data-list-title">${esc(user.nombre) || 'Sin nombre'}</div>
            <div class="data-list-subtitle">${esc(user.email)}</div>
          </div>
        </div>
        <div class="data-list-right">
          <span class="badge ${(user.plan || 'free') === 'paid' ? 'badge-success' : 'badge-default'}">
            ${(user.plan || 'free') === 'paid' ? '⭐ Premium' : 'Free'}
          </span>
          <div class="admin-user-actions">
            <button class="btn btn-xs btn-outline admin-toggle-plan" data-user-id="${user.id}" data-current-plan="${user.plan || 'free'}">
              ${(user.plan || 'free') === 'paid' ? 'Quitar Premium' : 'Dar Premium'}
            </button>
            <button class="btn btn-xs ${user.disabled ? 'btn-primary' : 'btn-danger'} admin-toggle-status" data-user-id="${user.id}" data-disabled="${user.disabled || false}">
              ${user.disabled ? 'Activar' : 'Desactivar'}
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Event listeners
    container.querySelectorAll('.admin-toggle-plan').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.userId;
        const currentPlan = btn.dataset.currentPlan;
        const newPlan = currentPlan === 'paid' ? 'free' : 'paid';

        try {
          await SupabaseClient.callEdgeFunction('admin-api', {
            action: 'update-user',
            userId,
            updates: { plan: newPlan }
          });
          App.showToast(`Plan actualizado a ${newPlan}`, 'success');
          await loadUsers();
        } catch (err) {
          App.showToast('Error: ' + err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.admin-toggle-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.userId;
        const isDisabled = btn.dataset.disabled === 'true';

        try {
          await SupabaseClient.callEdgeFunction('admin-api', {
            action: 'update-user',
            userId,
            updates: { disabled: !isDisabled }
          });
          App.showToast(isDisabled ? 'Usuario activado' : 'Usuario desactivado', 'success');
          await loadUsers();
        } catch (err) {
          App.showToast('Error: ' + err.message, 'error');
        }
      });
    });
  }

  async function loadUpgradeRequests() {
    const container = document.getElementById('admin-upgrade-requests');
    if (!container) return;

    try {
      const result = await SupabaseClient.callEdgeFunction('admin-api', { action: 'upgrade-requests' });
      const requests = result.requests || [];

      if (requests.length === 0) {
        container.innerHTML = '<div class="empty-text">No hay solicitudes pendientes</div>';
        return;
      }

      container.innerHTML = requests.map(req => `
        <div class="data-list-item">
          <div class="data-list-left">
            <div>
              <div class="data-list-title">${req.email || req.user_id}</div>
              <div class="data-list-subtitle">${new Date(req.created_at).toLocaleDateString('es-EC')}</div>
            </div>
          </div>
          <div class="data-list-right">
            <button class="btn btn-xs btn-primary admin-approve-upgrade" data-user-id="${req.user_id}" data-request-id="${req.id}">
              Aprobar
            </button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.admin-approve-upgrade').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await SupabaseClient.callEdgeFunction('admin-api', {
              action: 'approve-upgrade',
              userId: btn.dataset.userId,
              requestId: btn.dataset.requestId
            });
            App.showToast('Upgrade aprobado', 'success');
            await loadUpgradeRequests();
            await loadUsers();
          } catch (err) {
            App.showToast('Error: ' + err.message, 'error');
          }
        });
      });
    } catch {
      container.innerHTML = '<div class="empty-text">No se pudieron cargar las solicitudes</div>';
    }
  }

  return { render };
})();

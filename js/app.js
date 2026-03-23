// ============================================
// AgroFinca - Main App Controller
// SPA Router, Navigation, Initialization
// ============================================

const App = (() => {
  let currentPage = 'dashboard';
  let currentFincaId = null;
  let moreMenuOpen = false;

  // Page modules registry
  const pages = {
    dashboard: () => DashboardModule,
    fincas: () => FincasModule,
    produccion: () => ProduccionModule,
    ventas: () => VentasModule,
    costos: () => CostosModule,
    finanzas: () => FinanzasModule,
    tareas: () => TareasModule,
    inspecciones: () => InspeccionesModule,
    fitosanitario: () => FitosanitarioModule,
    lombricompost: () => LombricompostModule,
    apicultura: () => ApiculturaModule,
    animales: () => AnimalesModule,
    configuracion: () => ConfiguracionModule,
    'asistente-ia': () => AsistenteIAModule,
    admin: () => AdminModule
  };

  const pageNames = {
    dashboard: 'Dashboard',
    fincas: 'Mis Fincas',
    produccion: 'Producción',
    ventas: 'Ventas',
    costos: 'Costos',
    finanzas: 'Análisis Financiero',
    tareas: 'Tareas',
    inspecciones: 'Inspecciones',
    fitosanitario: 'Fitosanitario',
    lombricompost: 'Lombricompost',
    apicultura: 'Apicultura',
    animales: 'Animales',
    configuracion: 'Configuración',
    'asistente-ia': 'Asistente IA',
    admin: 'Panel de Administración'
  };

  // Initialize the app
  async function init() {
    try {
      // 1. Init IndexedDB
      await AgroDB.init();

      // 2. Init auth module
      AuthModule.init();

      // 3. Try to restore session
      const user = await AuthModule.restoreSession();

      // 4. Hide loading
      setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
        setTimeout(() => {
          document.getElementById('loading-screen').style.display = 'none';
        }, 500);
      }, 800);

      if (user) {
        onAuthSuccess(user);
      } else {
        showScreen('auth');
      }

      // 5. Register Service Worker
      registerSW();

    } catch (err) {
      console.error('Init error:', err);
      document.getElementById('loading-screen').innerHTML = `
        <div class="loading-content">
          <div class="loading-icon">⚠️</div>
          <h1>Error</h1>
          <p>Error al iniciar la aplicación</p>
          <button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;background:white;border:none;border-radius:6px;cursor:pointer;">Reintentar</button>
        </div>`;
    }
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_REQUESTED') {
          SyncEngine.syncAll();
        }
      });
    }
  }

  // Auth success handler
  async function onAuthSuccess(user) {
    showScreen('app');
    updateUserUI(user);
    await loadUserFincas();
    initNavigation();
    initFAB();

    // Show/hide admin nav
    const adminNav = document.getElementById('admin-nav-item');
    if (adminNav) {
      adminNav.style.display = AuthModule.isAdmin() ? '' : 'none';
    }

    // Show premium badge if not paid
    const badgeIA = document.getElementById('badge-ia');
    if (badgeIA) {
      badgeIA.style.display = AuthModule.isPaid() ? 'none' : '';
    }

    // Start sync
    SyncEngine.setStatusCallback(updateSyncUI);
    SyncEngine.startAutoSync();

    // Navigate to dashboard
    navigateTo('dashboard');
  }

  function updateUserUI(user) {
    document.getElementById('sidebar-username').textContent = user.nombre || 'Usuario';
    document.getElementById('sidebar-email').textContent = user.email || '';
    document.getElementById('sidebar-avatar').textContent = Format.initials(user.nombre);
  }

  // Finca selector
  async function loadUserFincas() {
    const userId = AuthModule.getUserId();
    if (!userId) return;

    // Get fincas owned by user
    const ownedFincas = await AgroDB.getByIndex('fincas', 'propietario_id', userId);

    // Get fincas where user is member
    const memberships = await AgroDB.getByIndex('finca_miembros', 'usuario_id', userId);
    const memberFincaIds = memberships.map(m => m.finca_id);

    const allFincas = [...ownedFincas];
    for (const fId of memberFincaIds) {
      if (!allFincas.find(f => f.id === fId)) {
        const finca = await AgroDB.getById('fincas', fId);
        if (finca) allFincas.push(finca);
      }
    }

    const selector = document.getElementById('finca-selector');
    selector.innerHTML = '<option value="">-- Seleccionar finca --</option>';
    allFincas.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.nombre;
      selector.appendChild(opt);
    });

    // Auto-select if only one finca
    const savedFinca = localStorage.getItem('agrofinca_current_finca');
    if (savedFinca && allFincas.find(f => f.id === savedFinca)) {
      selector.value = savedFinca;
      currentFincaId = savedFinca;
    } else if (allFincas.length === 1) {
      selector.value = allFincas[0].id;
      currentFincaId = allFincas[0].id;
    } else if (allFincas.length === 0) {
      // No fincas - prompt to create one
      currentFincaId = null;
    }

    selector.addEventListener('change', (e) => {
      currentFincaId = e.target.value || null;
      if (currentFincaId) {
        localStorage.setItem('agrofinca_current_finca', currentFincaId);
      }
      refreshCurrentPage();
    });
  }

  // Navigation
  function initNavigation() {
    // Sidebar toggle
    document.getElementById('btn-menu').addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // Sidebar nav links
    document.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.page);
        closeSidebar();
      });
    });

    // Bottom nav links
    document.querySelectorAll('.bottom-nav-item[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page === 'more') {
          toggleMoreMenu();
        } else {
          closeMoreMenu();
          navigateTo(page);
        }
      });
    });

    // More menu links
    document.querySelectorAll('.more-menu a[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        closeMoreMenu();
        navigateTo(link.dataset.page);
      });
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async (e) => {
      e.preventDefault();
      await AuthModule.logout();
      SyncEngine.stopAutoSync();
      showScreen('auth');
      closeSidebar();
    });

    // Close more menu when clicking outside
    document.addEventListener('click', (e) => {
      if (moreMenuOpen && !e.target.closest('.more-menu') && !e.target.closest('[data-page="more"]')) {
        closeMoreMenu();
      }
    });
  }

  function navigateTo(pageName) {
    if (!pages[pageName]) return;

    currentPage = pageName;
    document.getElementById('page-title').textContent = pageNames[pageName] || pageName;

    // Update active states
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach(a => a.classList.remove('active'));

    const sidebarLink = document.querySelector(`.sidebar-nav a[data-page="${pageName}"]`);
    if (sidebarLink) sidebarLink.classList.add('active');

    const bottomLink = document.querySelector(`.bottom-nav-item[data-page="${pageName}"]`);
    if (bottomLink) bottomLink.classList.add('active');

    // Render page
    const module = pages[pageName]();
    if (module && module.render) {
      module.render(document.getElementById('main-content'), currentFincaId);
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  function refreshCurrentPage() {
    navigateTo(currentPage);
  }

  // FAB
  function initFAB() {
    const fab = document.getElementById('fab');
    const quickActions = document.getElementById('quick-actions');
    const closeBtn = document.getElementById('close-quick-actions');

    fab.addEventListener('click', () => {
      if (quickActions.style.display === 'none') {
        quickActions.style.display = 'block';
        fab.classList.add('rotated');
      } else {
        quickActions.style.display = 'none';
        fab.classList.remove('rotated');
      }
    });

    closeBtn.addEventListener('click', () => {
      quickActions.style.display = 'none';
      fab.classList.remove('rotated');
    });

    document.querySelectorAll('.action-item[data-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        quickActions.style.display = 'none';
        fab.classList.remove('rotated');
        handleQuickAction(btn.dataset.quick);
      });
    });
  }

  function handleQuickAction(action) {
    if (!currentFincaId) {
      showToast('Primero selecciona una finca', 'warning');
      navigateTo('fincas');
      return;
    }
    switch (action) {
      case 'cosecha': ProduccionModule.showQuickHarvest(currentFincaId); break;
      case 'venta': VentasModule.showQuickSale(currentFincaId); break;
      case 'costo': CostosModule.showQuickCost(currentFincaId); break;
      case 'inspeccion': InspeccionesModule.showQuickInspection(currentFincaId); break;
      case 'fitosanitario': FitosanitarioModule.showQuickApplication(currentFincaId); break;
      case 'tarea': TareasModule.showQuickTask(currentFincaId); break;
    }
  }

  // Sidebar
  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
  }

  // More menu
  function toggleMoreMenu() {
    moreMenuOpen = !moreMenuOpen;
    document.getElementById('more-menu').style.display = moreMenuOpen ? 'block' : 'none';
  }
  function closeMoreMenu() {
    moreMenuOpen = false;
    document.getElementById('more-menu').style.display = 'none';
  }

  // Screen management
  function showScreen(name) {
    document.getElementById('auth-screen').style.display = name === 'auth' ? 'flex' : 'none';
    document.getElementById('app-screen').style.display = name === 'app' ? 'block' : 'none';
  }

  // Sync UI
  function updateSyncUI(status, pendingCount) {
    const dot = document.querySelector('.sync-dot');
    const countEl = document.querySelector('.sync-count');

    dot.className = 'sync-dot';
    if (status === 'online') {
      dot.classList.add('online');
      countEl.textContent = pendingCount > 0 ? `(${pendingCount})` : '';
    } else if (status === 'offline') {
      dot.classList.add('offline');
      countEl.textContent = 'Sin conexión';
    } else if (status === 'syncing') {
      dot.classList.add('syncing');
      countEl.textContent = 'Sincronizando...';
    }
  }

  // Toast notifications
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Modal helper
  function showModal(title, bodyHTML, footerHTML = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML;
    document.getElementById('modal-overlay').style.display = 'flex';

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('modal-overlay').onclick = (e) => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    };
  }

  function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-footer').innerHTML = '';
  }

  // Getters
  function getCurrentFincaId() { return currentFincaId; }
  function getCurrentPage() { return currentPage; }

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    onAuthSuccess,
    navigateTo,
    refreshCurrentPage,
    showScreen,
    showToast,
    showModal,
    closeModal,
    getCurrentFincaId,
    getCurrentPage,
    loadUserFincas
  };
})();

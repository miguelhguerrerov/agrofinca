// ============================================
// AgroFinca - Configuración Module
// Settings, plan management, PayPal upgrade,
// sync status, export/import
// ============================================

const ConfiguracionModule = (() => {

  async function render(container, fincaId) {
    const user = AuthModule.getUser();
    const syncStatus = await SyncEngine.getStatus();
    const isPaid = AuthModule.isPaid();

    container.innerHTML = `
      <div class="page-header"><h2>⚙️ Configuración</h2></div>

      <!-- User info -->
      <div class="card">
        <div class="card-title">👤 Mi Cuenta</div>
        <div class="flex gap-1" style="align-items:center;">
          <div class="avatar" style="width:50px;height:50px;font-size:1.2rem;">${Format.initials(user?.nombre)}</div>
          <div>
            <div style="font-weight:600;">${user?.nombre || 'Usuario'}</div>
            <div class="text-sm text-muted">${user?.email || ''}</div>
            <div class="text-xs text-muted">ID: ${user?.id?.substring(0, 8) || ''}...</div>
          </div>
        </div>
      </div>

      <!-- Plan / Subscription -->
      <div class="card" id="upgrade-section">
        <div class="card-title">⭐ Mi Plan</div>
        <div class="plan-status">
          <div class="plan-badge ${isPaid ? 'plan-premium' : 'plan-free'}">
            ${isPaid ? '⭐ Premium' : '🆓 Plan Gratuito'}
          </div>
          ${isPaid ? `
            <p class="text-sm text-muted mt-1">Tienes acceso a todas las funcionalidades premium.</p>
          ` : `
            <p class="text-sm text-muted mt-1">Estás usando el plan gratuito con funcionalidades limitadas.</p>
            <div class="plan-comparison mt-1">
              <div class="plan-feature">
                <span>🏡 Fincas</span>
                <span>Máx. ${AppConfig.FREE_FARM_LIMIT}</span>
              </div>
              <div class="plan-feature">
                <span>📊 Dashboard básico</span>
                <span class="text-green">✓</span>
              </div>
              <div class="plan-feature">
                <span>💰 Ventas y costos</span>
                <span class="text-green">✓</span>
              </div>
              <div class="plan-feature">
                <span>🤖 Asistente IA</span>
                <span class="text-red">✗ Premium</span>
              </div>
              <div class="plan-feature">
                <span>📸 Análisis de fotos con IA</span>
                <span class="text-red">✗ Premium</span>
              </div>
              <div class="plan-feature">
                <span>🎤 Entrada por voz</span>
                <span class="text-red">✗ Premium</span>
              </div>
              <div class="plan-feature">
                <span>📈 Análisis financiero avanzado</span>
                <span class="text-red">✗ Premium</span>
              </div>
              <div class="plan-feature">
                <span>📄 Exportar reportes</span>
                <span class="text-red">✗ Premium</span>
              </div>
            </div>
            <div id="paypal-upgrade-container" class="mt-1">
              <button class="btn btn-primary btn-block" id="btn-upgrade-paypal">
                ⭐ Actualizar a Premium
              </button>
              <p class="text-xs text-muted text-center mt-05">Pago seguro con PayPal</p>
            </div>
          `}
        </div>
      </div>

      <!-- Sync Status -->
      <div class="card">
        <div class="card-title">☁️ Sincronización</div>
        <p class="text-sm text-muted mb-1">Tus datos se guardan localmente y se sincronizan automáticamente con la nube cuando hay conexión.</p>
        <div class="mt-1">
          <span class="text-sm">Estado: </span>
          <span class="badge ${syncStatus.online ? 'badge-green' : 'badge-red'}">${syncStatus.online ? 'En línea' : 'Sin conexión'}</span>
          ${syncStatus.lastSync ? `<span class="text-xs text-muted"> · Última sync: ${new Date(syncStatus.lastSync).toLocaleString('es-EC')}</span>` : ''}
          ${syncStatus.pendingCount > 0 ? `<span class="badge badge-amber">${syncStatus.pendingCount} pendientes</span>` : ''}
        </div>
        <div class="flex gap-1 mt-1">
          <button class="btn btn-outline btn-sm" id="btn-force-sync">🔄 Forzar Sincronización</button>
        </div>
      </div>

      <!-- Export/Import -->
      <div class="card">
        <div class="card-title">💾 Datos Locales</div>
        <p class="text-sm text-muted mb-1">Exporta o importa todos los datos como archivo JSON. Útil para respaldos manuales.</p>
        <div class="flex gap-1">
          <button class="btn btn-primary btn-sm" id="btn-export">📤 Exportar Datos</button>
          <button class="btn btn-outline btn-sm" id="btn-import">📥 Importar Datos</button>
          <input type="file" id="import-file" accept=".json" style="display:none;">
        </div>
      </div>

      <!-- Data stats -->
      <div class="card">
        <div class="card-title">📊 Estadísticas de Datos</div>
        <div id="data-stats">Cargando...</div>
      </div>

      <!-- About -->
      <div class="card">
        <div class="card-title">ℹ️ Acerca de AgroFinca</div>
        <p class="text-sm">Sistema de gestión agroforestal para plantaciones híbridas.</p>
        <p class="text-sm text-muted">Versión ${AppConfig.APP_VERSION} · PWA Offline-First</p>
        <p class="text-sm text-muted">Funciona con y sin conexión a internet.</p>
        <p class="text-sm text-muted mt-1">Tecnologías: HTML/CSS/JS, IndexedDB, Supabase, Leaflet Maps, Gemini AI</p>
      </div>

      <!-- Danger zone -->
      <div class="card" style="border:2px solid var(--red-500);">
        <div class="card-title text-red">⚠️ Zona de Peligro</div>
        <button class="btn btn-danger btn-sm" id="btn-clear-data">🗑 Borrar todos los datos locales</button>
      </div>
    `;

    loadStats();
    initEventListeners();
  }

  function initEventListeners() {
    // Force sync
    document.getElementById('btn-force-sync')?.addEventListener('click', async () => {
      App.showToast('Sincronizando...', 'info');
      await SyncEngine.forceSync();
      App.showToast('Sincronización completada', 'success');
      App.refreshCurrentPage();
    });

    // Export
    document.getElementById('btn-export')?.addEventListener('click', async () => {
      const data = await AgroDB.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'agrofinca-backup-' + DateUtils.today() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      App.showToast('Datos exportados', 'success');
    });

    // Import
    document.getElementById('btn-import')?.addEventListener('click', () => {
      document.getElementById('import-file')?.click();
    });
    document.getElementById('import-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (confirm('¿Importar datos? Esto reemplazará los datos actuales.')) {
          await AgroDB.importAll(data);
          App.showToast('Datos importados correctamente', 'success');
          await App.loadUserFincas();
          App.refreshCurrentPage();
        }
      } catch (err) {
        App.showToast('Error al importar: ' + err.message, 'error');
      }
    });

    // Clear data
    document.getElementById('btn-clear-data')?.addEventListener('click', async () => {
      if (confirm('⚠️ ¿Estás seguro? Esto eliminará TODOS los datos locales permanentemente.')) {
        if (confirm('Esta acción no se puede deshacer. ¿Continuar?')) {
          for (const store of AgroDB.STORES) {
            await AgroDB.clearStore(store);
          }
          localStorage.clear();
          App.showToast('Datos eliminados', 'success');
          location.reload();
        }
      }
    });

    // PayPal upgrade
    document.getElementById('btn-upgrade-paypal')?.addEventListener('click', () => {
      initPayPalCheckout();
    });
  }

  async function initPayPalCheckout() {
    const btn = document.getElementById('btn-upgrade-paypal');
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = 'Cargando PayPal...';

    // Load PayPal SDK dynamically
    if (!window.paypal) {
      try {
        await loadScript(`https://www.paypal.com/sdk/js?client-id=${AppConfig.PAYPAL_CLIENT_ID}&currency=USD`);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '⭐ Actualizar a Premium';
        App.showToast('Error al cargar PayPal. Verifica tu conexión.', 'error');
        return;
      }
    }

    // Replace button with PayPal buttons
    const container = document.getElementById('paypal-upgrade-container');
    container.innerHTML = `
      <div id="paypal-button-container" style="margin-top:1rem;"></div>
      <button class="btn btn-outline btn-sm btn-block mt-1" id="btn-cancel-paypal">Cancelar</button>
    `;

    document.getElementById('btn-cancel-paypal')?.addEventListener('click', () => {
      App.refreshCurrentPage();
    });

    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'subscribe' },
      createOrder: (data, actions) => {
        return actions.order.create({
          purchase_units: [{
            amount: { value: '9.99', currency_code: 'USD' },
            description: 'AgroFinca Premium - Plan Mensual'
          }]
        });
      },
      onApprove: async (data, actions) => {
        try {
          const details = await actions.order.capture();

          // Update plan via Edge Function
          await SupabaseClient.callEdgeFunction('payment-webhook', {
            order_id: data.orderID,
            payer_email: details.payer?.email_address,
            amount: '9.99',
            currency: 'USD'
          });

          // Update local user
          const user = AuthModule.getUser();
          if (user) {
            await AgroDB.update('usuarios', user.id, { plan: AppConfig.PLAN_PAID });
          }

          App.showToast('¡Bienvenido a Premium! 🎉', 'success');
          // Reload to reflect changes
          setTimeout(() => App.refreshCurrentPage(), 1000);
        } catch (err) {
          App.showToast('Error al procesar pago: ' + err.message, 'error');
        }
      },
      onCancel: () => {
        App.showToast('Pago cancelado', 'info');
        App.refreshCurrentPage();
      },
      onError: (err) => {
        App.showToast('Error de PayPal', 'error');
        console.error('PayPal error:', err);
      }
    }).render('#paypal-button-container');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function loadStats() {
    const statsEl = document.getElementById('data-stats');
    if (!statsEl) return;
    const stores = [
      'fincas', 'areas', 'cultivos_catalogo', 'ciclos_productivos', 'cosechas',
      'ventas', 'costos', 'colmenas', 'inspecciones_colmena', 'camas_lombricompost',
      'registros_lombricompost', 'tareas', 'inspecciones', 'aplicaciones_fitosanitarias',
      'lotes_animales', 'registros_animales'
    ];
    let html = '<ul class="data-list">';
    for (const store of stores) {
      try {
        const count = await AgroDB.count(store);
        html += '<li class="data-list-item" style="padding:0.3rem 0;"><span class="text-sm">' +
          store.replace(/_/g, ' ') + '</span><span class="badge badge-gray">' + count + '</span></li>';
      } catch (e) { /* ignore */ }
    }
    html += '</ul>';
    statsEl.innerHTML = html;
  }

  return { render };
})();

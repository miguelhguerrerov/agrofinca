// ============================================
// AgroFinca - Ingeniero Agricultores Module
// Manage affiliated farmers: list, affiliate,
// view farmer details, fincas, inspections
// ============================================

const IngAgricultoresModule = (() => {

  let currentFilter = 'todos';
  let searchQuery = '';

  // ── Render entry point ──────────────────────
  async function render(container) {
    const userId = AuthModule.getUserId();

    const afiliaciones = await AgroDB.query('ingeniero_agricultores',
      r => r.ingeniero_id === userId
    );

    // Load profiles and finca data for each agricultor
    const agricultoresData = [];
    for (const af of afiliaciones) {
      const profile = await AgroDB.getById('user_profiles', af.agricultor_id);
      const fincas = await AgroDB.getByIndex('fincas', 'propietario_id', af.agricultor_id);

      let superficieTotal = 0;
      let totalInspecciones = 0;
      let ultimaVisita = null;

      for (const finca of fincas) {
        const areas = await AgroDB.getByIndex('areas', 'finca_id', finca.id);
        superficieTotal += areas.reduce((sum, a) => sum + (a.area_m2 || 0), 0);

        const inspecciones = await AgroDB.query('inspecciones',
          r => r.finca_id === finca.id && r.ingeniero_id === userId
        );
        totalInspecciones += inspecciones.length;

        inspecciones.forEach(i => {
          if (!ultimaVisita || i.fecha > ultimaVisita) ultimaVisita = i.fecha;
        });
      }

      agricultoresData.push({
        id: af.agricultor_id,
        afiliacionId: af.id,
        estado: af.estado || 'activo',
        nombre: profile ? (profile.nombre || profile.full_name || profile.email) : (af.email || 'Sin nombre'),
        email: profile ? profile.email : (af.email || ''),
        fincas: fincas.length,
        superficie: superficieTotal / 10000,
        inspecciones: totalInspecciones,
        ultimaVisita,
        profile
      });
    }

    // Apply filters
    let filtered = agricultoresData;
    if (currentFilter !== 'todos') {
      filtered = filtered.filter(a => a.estado === currentFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.nombre.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      );
    }

    const countActivos = agricultoresData.filter(a => a.estado === 'activo').length;
    const countPendientes = agricultoresData.filter(a => a.estado === 'pendiente').length;

    container.innerHTML = `
      <div class="page-header">
        <h2>👨‍🌾 Mis Agricultores</h2>
        <button class="btn btn-primary btn-sm" id="btn-afiliar-agricultor">+ Afiliar agricultor</button>
      </div>

      <!-- Filters -->
      <div class="form-row" style="gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-sm ${currentFilter === 'todos' ? 'btn-primary' : 'btn-outline'}" data-filter="todos">
          Todos (${agricultoresData.length})
        </button>
        <button class="btn btn-sm ${currentFilter === 'activo' ? 'btn-primary' : 'btn-outline'}" data-filter="activo">
          Activos (${countActivos})
        </button>
        <button class="btn btn-sm ${currentFilter === 'pendiente' ? 'btn-primary' : 'btn-outline'}" data-filter="pendiente">
          Pendientes (${countPendientes})
        </button>
        <input type="text" class="form-input" id="ing-search-agricultor"
          placeholder="Buscar por nombre o email..." value="${searchQuery}"
          style="flex:1;min-width:180px;">
      </div>

      <!-- Agricultor cards -->
      ${filtered.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">👨‍🌾</div>
          <h3>Sin agricultores</h3>
          <p>${searchQuery || currentFilter !== 'todos' ? 'No se encontraron resultados con los filtros aplicados.' : 'Afilia a tu primer agricultor para comenzar.'}</p>
        </div>
      ` : `
        <div class="section">
          ${filtered.map(ag => `
            <div class="card" style="cursor:pointer;" data-agricultor-id="${ag.id}">
              <div class="flex-between">
                <div>
                  <div class="card-title">${ag.nombre}</div>
                  <div class="card-subtitle">${ag.email}</div>
                </div>
                <span class="badge ${ag.estado === 'activo' ? 'badge-green' : ag.estado === 'pendiente' ? 'badge-amber' : 'badge-gray'}">
                  ${ag.estado}
                </span>
              </div>
              <div class="form-row mt-1" style="gap:1rem;flex-wrap:wrap;">
                <span class="text-sm text-muted">🏡 ${ag.fincas} finca(s)</span>
                <span class="text-sm text-muted">📐 ${ag.superficie.toFixed(2)} ha</span>
                <span class="text-sm text-muted">📋 ${ag.inspecciones} inspecciones</span>
                <span class="text-sm text-muted">📅 ${ag.ultimaVisita ? Format.dateShort(ag.ultimaVisita) : 'Sin visitas'}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;

    // ── Event listeners ──
    document.getElementById('btn-afiliar-agricultor')?.addEventListener('click', () => showAfiliarForm(container));

    // Filter buttons
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        render(container);
      });
    });

    // Search
    document.getElementById('ing-search-agricultor')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      render(container);
    });

    // Card click -> ficha
    container.querySelectorAll('[data-agricultor-id]').forEach(card => {
      card.addEventListener('click', () => showFichaAgricultor(card.dataset.agricultorId, container));
    });
  }

  // =============================================
  // AFILIAR AGRICULTOR
  // =============================================
  function showAfiliarForm(parentContainer) {
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Correo electrónico del agricultor</label>
        <input type="email" class="form-input" id="afiliar-email" placeholder="agricultor@email.com">
        <div id="afiliar-email-status" class="text-sm mt-1"></div>
      </div>
      <div id="afiliar-extra" style="display:none;">
        <div class="form-group">
          <label class="form-label">Nombre (opcional para registro asistido)</label>
          <input type="text" class="form-input" id="afiliar-nombre" placeholder="Nombre del agricultor">
        </div>
      </div>
    `;
    const footerHTML = `
      <button class="btn btn-outline" id="afiliar-cancel">Cancelar</button>
      <button class="btn btn-primary" id="afiliar-confirm" disabled>Afiliar</button>
    `;

    App.showModal('👨‍🌾 Afiliar Agricultor', bodyHTML, footerHTML);

    let foundUserId = null;
    let emailValue = '';

    const emailInput = document.getElementById('afiliar-email');
    const statusDiv = document.getElementById('afiliar-email-status');
    const extraDiv = document.getElementById('afiliar-extra');
    const confirmBtn = document.getElementById('afiliar-confirm');

    emailInput?.addEventListener('blur', async () => {
      emailValue = (emailInput.value || '').trim().toLowerCase();
      if (!emailValue || !emailValue.includes('@')) {
        statusDiv.innerHTML = '<span style="color:var(--red-500);">Ingresa un email válido</span>';
        confirmBtn.disabled = true;
        return;
      }

      statusDiv.innerHTML = '<span class="text-muted">Buscando...</span>';

      // Search for existing user
      const profiles = await AgroDB.query('user_profiles', r => r.email === emailValue);

      if (profiles.length > 0) {
        foundUserId = profiles[0].id;
        statusDiv.innerHTML = `<span style="color:var(--green-700);">✅ Usuario encontrado: ${profiles[0].nombre || profiles[0].full_name || profiles[0].email}</span>`;
        extraDiv.style.display = 'none';
        confirmBtn.disabled = false;
      } else {
        foundUserId = null;
        statusDiv.innerHTML = `<span style="color:var(--amber-700);">⚠️ Usuario no encontrado. Se creará un registro asistido.</span>`;
        extraDiv.style.display = 'block';
        confirmBtn.disabled = false;
      }
    });

    document.getElementById('afiliar-cancel')?.addEventListener('click', () => App.closeModal());

    confirmBtn?.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      const userId = AuthModule.getUserId();
      const nombre = document.getElementById('afiliar-nombre')?.value || '';

      try {
        // Check if affiliation already exists
        const existing = await AgroDB.query('ingeniero_agricultores',
          r => r.ingeniero_id === userId && (r.agricultor_id === foundUserId || r.email === emailValue)
        );

        if (existing.length > 0) {
          App.showToast('Este agricultor ya está afiliado', 'warning');
          App.closeModal();
          return;
        }

        const record = {
          ingeniero_id: userId,
          agricultor_id: foundUserId || null,
          email: emailValue,
          nombre_referencia: nombre || null,
          estado: foundUserId ? 'pendiente' : 'pendiente',
          fecha_afiliacion: DateUtils.today(),
          created_at: new Date().toISOString()
        };

        await AgroDB.save('ingeniero_agricultores', record);

        App.showToast('Agricultor afiliado exitosamente', 'success');
        App.closeModal();
        render(parentContainer);
      } catch (err) {
        App.showToast('Error al afiliar: ' + err.message, 'error');
        confirmBtn.disabled = false;
      }
    });
  }

  // =============================================
  // FICHA AGRICULTOR (detail view)
  // =============================================
  async function showFichaAgricultor(agricultorId, parentContainer) {
    const userId = AuthModule.getUserId();
    const profile = await AgroDB.getById('user_profiles', agricultorId);
    const fincas = await AgroDB.getByIndex('fincas', 'propietario_id', agricultorId);

    // Load inspecciones by this ingeniero on agricultor's fincas
    let allInspecciones = [];
    let allPrescripciones = [];
    let allCompras = [];
    const fincaAreas = {};

    for (const finca of fincas) {
      const areas = await AgroDB.getByIndex('areas', 'finca_id', finca.id);
      fincaAreas[finca.id] = areas;

      const inspecciones = await AgroDB.query('inspecciones',
        r => r.finca_id === finca.id && r.ingeniero_id === userId
      );
      allInspecciones.push(...inspecciones);

      const prescripciones = await AgroDB.query('prescripciones',
        r => r.finca_id === finca.id && r.ingeniero_id === userId
      );
      allPrescripciones.push(...prescripciones);

      const compras = await AgroDB.query('ventas_insumos',
        r => r.agricultor_id === agricultorId && r.finca_id === finca.id
      );
      allCompras.push(...compras);
    }

    allInspecciones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    allPrescripciones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    allCompras.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const nombre = profile ? (profile.nombre || profile.full_name || profile.email) : 'Agricultor';

    const fichaBody = `
      <div style="max-height:70vh;overflow-y:auto;">
        <!-- Tabs -->
        <div class="form-row" style="gap:0;border-bottom:2px solid var(--gray-300);margin-bottom:1rem;">
          <button class="btn btn-sm btn-outline ficha-tab active" data-tab="info" style="border-radius:8px 8px 0 0;">Info</button>
          <button class="btn btn-sm btn-outline ficha-tab" data-tab="fincas" style="border-radius:8px 8px 0 0;">Fincas (${fincas.length})</button>
          <button class="btn btn-sm btn-outline ficha-tab" data-tab="inspecciones" style="border-radius:8px 8px 0 0;">Inspecciones (${allInspecciones.length})</button>
          <button class="btn btn-sm btn-outline ficha-tab" data-tab="prescripciones" style="border-radius:8px 8px 0 0;">Prescripciones (${allPrescripciones.length})</button>
          <button class="btn btn-sm btn-outline ficha-tab" data-tab="compras" style="border-radius:8px 8px 0 0;">Compras (${allCompras.length})</button>
        </div>

        <!-- Tab: Info -->
        <div class="ficha-panel" id="ficha-panel-info">
          <div class="data-list-item" style="padding:0.5rem 0;">
            <div class="data-list-title">Nombre</div>
            <div class="data-list-value">${profile?.nombre || profile?.full_name || 'N/A'}</div>
          </div>
          <div class="data-list-item" style="padding:0.5rem 0;">
            <div class="data-list-title">Email</div>
            <div class="data-list-value">${profile?.email || 'N/A'}</div>
          </div>
          <div class="data-list-item" style="padding:0.5rem 0;">
            <div class="data-list-title">Teléfono</div>
            <div class="data-list-value">${profile?.telefono || profile?.phone || 'N/A'}</div>
          </div>
          <div class="data-list-item" style="padding:0.5rem 0;">
            <div class="data-list-title">Ubicación</div>
            <div class="data-list-value">${profile?.ubicacion || profile?.direccion || 'N/A'}</div>
          </div>
        </div>

        <!-- Tab: Fincas -->
        <div class="ficha-panel" id="ficha-panel-fincas" style="display:none;">
          ${fincas.length === 0 ? '<p class="text-sm text-muted">Sin fincas registradas</p>' :
          fincas.map(f => {
            const areas = fincaAreas[f.id] || [];
            const supHa = areas.reduce((s, a) => s + (a.area_m2 || 0), 0) / 10000;
            return `
              <div class="card" style="cursor:pointer;" data-finca-afiliada="${f.id}">
                <div class="card-title">${f.nombre}</div>
                <div class="card-subtitle">${f.ubicacion || f.direccion || ''}</div>
                <div class="form-row mt-1" style="gap:0.8rem;flex-wrap:wrap;">
                  <span class="text-sm text-muted">📐 ${supHa.toFixed(2)} ha</span>
                  <span class="text-sm text-muted">🗺️ ${areas.length} áreas</span>
                </div>
                ${areas.length > 0 ? `
                  <div class="mt-1">
                    ${areas.map(a => `
                      <span class="badge badge-gray" style="margin:2px;">${a.nombre} (${(a.area_m2 / 10000).toFixed(2)} ha)</span>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Tab: Inspecciones -->
        <div class="ficha-panel" id="ficha-panel-inspecciones" style="display:none;">
          ${allInspecciones.length === 0 ? '<p class="text-sm text-muted">Sin inspecciones registradas</p>' :
          allInspecciones.slice(0, 20).map(insp => `
            <div class="data-list-item" style="padding:0.5rem 0;border-bottom:1px solid var(--gray-300);">
              <div class="data-list-left">
                <div class="data-list-title">${insp.titulo || 'Inspección'}</div>
                <div class="data-list-sub">${Format.dateShort(insp.fecha)} · ${insp.area_nombre || ''} · ${insp.cultivo_nombre || ''}</div>
              </div>
              <div class="data-list-right">
                <span class="badge ${insp.estado_general === 'bueno' ? 'badge-green' : insp.estado_general === 'regular' ? 'badge-amber' : insp.estado_general === 'malo' ? 'badge-red' : 'badge-gray'}">
                  ${insp.estado_general || 'N/A'}
                </span>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Tab: Prescripciones -->
        <div class="ficha-panel" id="ficha-panel-prescripciones" style="display:none;">
          ${allPrescripciones.length === 0 ? '<p class="text-sm text-muted">Sin prescripciones emitidas</p>' :
          allPrescripciones.slice(0, 20).map(p => `
            <div class="data-list-item" style="padding:0.5rem 0;border-bottom:1px solid var(--gray-300);">
              <div class="data-list-left">
                <div class="data-list-title">${p.producto || p.titulo || 'Prescripción'}</div>
                <div class="data-list-sub">${Format.dateShort(p.fecha)} · ${p.dosis || ''} ${p.unidad || ''}</div>
              </div>
              <div class="data-list-right">
                <span class="badge ${p.estado === 'completada' ? 'badge-green' : p.fecha_vencimiento && p.fecha_vencimiento < DateUtils.today() ? 'badge-red' : 'badge-amber'}">
                  ${p.estado || 'pendiente'}
                </span>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Tab: Compras -->
        <div class="ficha-panel" id="ficha-panel-compras" style="display:none;">
          ${allCompras.length === 0 ? '<p class="text-sm text-muted">Sin compras de insumos</p>' :
          allCompras.slice(0, 20).map(c => `
            <div class="data-list-item" style="padding:0.5rem 0;border-bottom:1px solid var(--gray-300);">
              <div class="data-list-left">
                <div class="data-list-title">${c.producto || c.insumo || 'Insumo'}</div>
                <div class="data-list-sub">${Format.dateShort(c.fecha)} · ${c.cantidad || ''} ${c.unidad || ''}</div>
              </div>
              <div class="data-list-right">
                <div class="data-list-value">${Format.money(c.total || 0)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    App.showModal(`👤 ${nombre}`, fichaBody, '<button class="btn btn-outline" id="ficha-close">Cerrar</button>');

    // Tab switching
    document.querySelectorAll('.ficha-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ficha-panel').forEach(p => p.style.display = 'none');
        tab.classList.add('active');
        const panel = document.getElementById(`ficha-panel-${tab.dataset.tab}`);
        if (panel) panel.style.display = 'block';
      });
    });

    // Finca click -> showFincaAfiliada
    document.querySelectorAll('[data-finca-afiliada]').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        App.closeModal();
        showFincaAfiliada(card.dataset.fincaAfiliada, agricultorId, parentContainer);
      });
    });

    document.getElementById('ficha-close')?.addEventListener('click', () => App.closeModal());
  }

  // =============================================
  // FINCA AFILIADA (read-only detail)
  // =============================================
  async function showFincaAfiliada(fincaId, agricultorId, parentContainer) {
    const userId = AuthModule.getUserId();
    const finca = await AgroDB.getById('fincas', fincaId);
    if (!finca) {
      App.showToast('Finca no encontrada', 'error');
      return;
    }

    const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
    const ciclos = await AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo');

    const month = DateUtils.currentMonthRange();
    const cosechas = await AgroDB.query('cosechas', r => r.finca_id === fincaId && r.fecha >= month.start && r.fecha <= month.end);

    const inspecciones = await AgroDB.query('inspecciones',
      r => r.finca_id === fincaId && r.ingeniero_id === userId
    );
    inspecciones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const lastInsp = inspecciones[0] || null;

    const prescPendientes = await AgroDB.query('prescripciones',
      r => r.finca_id === fincaId && r.ingeniero_id === userId && r.estado !== 'completada'
    );

    const supHa = areas.reduce((s, a) => s + (a.area_m2 || 0), 0) / 10000;

    const fincaBody = `
      <div style="max-height:70vh;overflow-y:auto;">
        <div class="card">
          <div class="card-title">Información general</div>
          <div class="data-list-item" style="padding:0.4rem 0;">
            <span class="text-sm">Ubicación:</span>
            <span class="text-sm text-muted">${finca.ubicacion || finca.direccion || 'N/A'}</span>
          </div>
          <div class="data-list-item" style="padding:0.4rem 0;">
            <span class="text-sm">Superficie:</span>
            <span class="text-sm text-muted">${supHa.toFixed(2)} ha</span>
          </div>
          <div class="data-list-item" style="padding:0.4rem 0;">
            <span class="text-sm">Áreas:</span>
            <span class="text-sm text-muted">${areas.length}</span>
          </div>
          <div class="data-list-item" style="padding:0.4rem 0;">
            <span class="text-sm">Ciclos activos:</span>
            <span class="text-sm text-muted">${ciclos.length}</span>
          </div>
        </div>

        <!-- Areas -->
        ${areas.length > 0 ? `
          <div class="card">
            <div class="card-title">🗺️ Áreas (${areas.length})</div>
            ${areas.map(a => `
              <div class="data-list-item" style="padding:0.4rem 0;">
                <div class="flex gap-1" style="align-items:center;">
                  <span class="area-color" style="background:${a.color || '#4CAF50'}"></span>
                  <span class="text-sm">${a.nombre}</span>
                  ${a.tipo ? `<span class="badge badge-gray">${a.tipo}</span>` : ''}
                </div>
                <span class="text-sm text-muted">${((a.area_m2 || 0) / 10000).toFixed(2)} ha</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Ciclos activos -->
        ${ciclos.length > 0 ? `
          <div class="card">
            <div class="card-title">🌱 Ciclos activos</div>
            ${ciclos.map(c => `
              <div class="data-list-item" style="padding:0.4rem 0;">
                <div class="data-list-left">
                  <div class="data-list-title">${c.cultivo_nombre || 'Cultivo'}</div>
                  <div class="data-list-sub">${c.area_nombre || ''} · Inicio: ${Format.dateShort(c.fecha_inicio)}</div>
                </div>
                <span class="badge badge-green">Activo</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Cosechas recientes -->
        ${cosechas.length > 0 ? `
          <div class="card">
            <div class="card-title">🌾 Cosechas recientes (este mes)</div>
            ${cosechas.slice(0, 5).map(c => `
              <div class="data-list-item" style="padding:0.4rem 0;">
                <div class="data-list-left">
                  <div class="data-list-title">${c.cultivo_nombre || 'Cosecha'}</div>
                  <div class="data-list-sub">${Format.dateShort(c.fecha)}</div>
                </div>
                <div class="data-list-right">
                  <div class="data-list-value">${Format.unit(c.cantidad, c.unidad)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Last inspection status -->
        <div class="card">
          <div class="card-title">📋 Estado de inspección</div>
          ${lastInsp ? `
            <div class="data-list-item" style="padding:0.5rem 0;">
              <div class="data-list-left">
                <div class="data-list-title">Última inspección</div>
                <div class="data-list-sub">${Format.dateShort(lastInsp.fecha)} · ${lastInsp.titulo || ''}</div>
              </div>
              <span class="badge ${lastInsp.estado_general === 'bueno' ? 'badge-green' : lastInsp.estado_general === 'regular' ? 'badge-amber' : 'badge-red'}">
                ${lastInsp.estado_general || 'N/A'}
              </span>
            </div>
          ` : '<p class="text-sm text-muted">Sin inspecciones previas en esta finca</p>'}
          ${prescPendientes.length > 0 ? `
            <div class="mt-1">
              <span class="badge badge-amber">⏰ ${prescPendientes.length} prescripción(es) pendiente(s)</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    const fincaFooter = `
      <button class="btn btn-outline" id="finca-afiliada-close">Cerrar</button>
      <button class="btn btn-primary" id="finca-afiliada-nueva-insp">📋 Nueva inspección en esta finca</button>
    `;

    App.showModal('🏡 ' + finca.nombre, fincaBody, fincaFooter);

    document.getElementById('finca-afiliada-close')?.addEventListener('click', () => App.closeModal());
    document.getElementById('finca-afiliada-nueva-insp')?.addEventListener('click', () => {
      App.closeModal();
      App.navigateTo('ing-inspecciones', { fincaId });
    });
  }

  return { render };
})();

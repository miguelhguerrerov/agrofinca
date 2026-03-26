// ============================================
// AgroFinca - Ing. Prescripciones Module
// Prescription management, tracking, and
// agricultor adherence monitoring
// ============================================

const IngPrescripcionesModule = (() => {

  // ---- Main render ----
  async function render(container) {
    const user = AuthModule.getUser();
    if (!user) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><h3>Inicia sesión</h3></div>';
      return;
    }

    const ingenieroId = user.id || user.ingeniero_id;

    container.innerHTML = `
      <div class="page-header">
        <h2>💊 Prescripciones Fitosanitarias</h2>
      </div>
      <div class="tabs">
        <button class="tab-btn active" data-tab="tab-presc-activas">Activas</button>
        <button class="tab-btn" data-tab="tab-presc-historial">Historial</button>
        <button class="tab-btn" data-tab="tab-presc-seguimiento">Seguimiento</button>
      </div>
      <div id="tab-presc-activas" class="tab-content active"></div>
      <div id="tab-presc-historial" class="tab-content" style="display:none;"></div>
      <div id="tab-presc-seguimiento" class="tab-content" style="display:none;"></div>
    `;

    // Tab switching
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        container.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) { target.classList.add('active'); target.style.display = ''; }
      });
    });

    await renderActivas(document.getElementById('tab-presc-activas'), ingenieroId);
    await renderHistorial(document.getElementById('tab-presc-historial'), ingenieroId);
    await renderSeguimiento(document.getElementById('tab-presc-seguimiento'), ingenieroId);
  }

  // ========================================
  // TAB: Activas
  // ========================================
  async function renderActivas(tab, ingenieroId) {
    const prescripciones = await AgroDB.query('prescripciones', r =>
      r.ingeniero_id === ingenieroId && (r.estado === 'pendiente' || r.estado === 'en_ejecucion')
    );
    const sorted = [...prescripciones].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    tab.innerHTML = `
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">${sorted.length} prescripciones activas</span>
        <button class="btn btn-primary btn-sm" id="btn-new-prescripcion">+ Nueva Prescripción</button>
      </div>
      ${sorted.length === 0
        ? '<div class="empty-state"><h3>Sin prescripciones activas</h3><p>No hay prescripciones pendientes o en ejecución.</p></div>'
        : sorted.map(p => prescripcionCard(p, true)).join('')}
    `;

    document.getElementById('btn-new-prescripcion')?.addEventListener('click', () => showPrescripcionForm(null, null, ingenieroId));
    wireCardButtons(tab, ingenieroId);
  }

  // ========================================
  // TAB: Historial
  // ========================================
  async function renderHistorial(tab, ingenieroId) {
    const todas = await AgroDB.query('prescripciones', r => r.ingeniero_id === ingenieroId);
    const sorted = [...todas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    // Collect unique values for filters
    const agricultores = [...new Set(sorted.map(p => p.agricultor_nombre).filter(Boolean))];
    const fincasSet = [...new Set(sorted.map(p => p.finca_nombre).filter(Boolean))];
    const productos = [...new Set(sorted.map(p => p.producto).filter(Boolean))];

    tab.innerHTML = `
      <div class="form-row mb-2">
        <div class="form-group">
          <label>Agricultor</label>
          <select id="filter-agricultor">
            <option value="">Todos</option>
            ${agricultores.map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Finca</label>
          <select id="filter-finca">
            <option value="">Todas</option>
            ${fincasSet.map(f => `<option value="${f}">${f}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Producto</label>
          <select id="filter-producto">
            <option value="">Todos</option>
            ${productos.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="historial-list">
        ${sorted.map(p => prescripcionCard(p, false)).join('')}
      </div>
    `;

    // Filter logic
    const filterFn = () => {
      const fAgr = document.getElementById('filter-agricultor').value;
      const fFin = document.getElementById('filter-finca').value;
      const fProd = document.getElementById('filter-producto').value;

      const filtered = sorted.filter(p =>
        (!fAgr || p.agricultor_nombre === fAgr) &&
        (!fFin || p.finca_nombre === fFin) &&
        (!fProd || p.producto === fProd)
      );

      document.getElementById('historial-list').innerHTML = filtered.length === 0
        ? '<div class="empty-state"><h3>Sin resultados</h3></div>'
        : filtered.map(p => prescripcionCard(p, false)).join('');
      wireCardButtons(document.getElementById('historial-list'), ingenieroId);
    };

    document.getElementById('filter-agricultor').addEventListener('change', filterFn);
    document.getElementById('filter-finca').addEventListener('change', filterFn);
    document.getElementById('filter-producto').addEventListener('change', filterFn);

    wireCardButtons(tab, ingenieroId);
  }

  // ========================================
  // TAB: Seguimiento
  // ========================================
  async function renderSeguimiento(tab, ingenieroId) {
    const prescripciones = await AgroDB.query('prescripciones', r => r.ingeniero_id === ingenieroId);
    const aplicaciones = await AgroDB.query('aplicaciones_fitosanitarias', () => true);

    // Group by agricultor
    const porAgricultor = {};
    for (const p of prescripciones) {
      const key = p.agricultor_id || p.agricultor_nombre || 'Sin agricultor';
      if (!porAgricultor[key]) {
        porAgricultor[key] = { nombre: p.agricultor_nombre || key, total: 0, completadas: 0, cumplidas: 0 };
      }
      porAgricultor[key].total++;
      if (p.estado === 'completada') porAgricultor[key].completadas++;

      // Cross-reference: check if any aplicacion references this prescripcion
      const aplicada = aplicaciones.find(a => a.prescripcion_id === p.id);
      if (aplicada) porAgricultor[key].cumplidas++;
    }

    const stats = Object.values(porAgricultor);

    tab.innerHTML = `
      <div class="section-title mb-2">📊 Adherencia por Agricultor</div>
      ${stats.length === 0
        ? '<div class="empty-state"><h3>Sin datos</h3><p>No hay prescripciones registradas para analizar.</p></div>'
        : stats.map(s => {
          const pctCompletadas = s.total > 0 ? Math.round((s.completadas / s.total) * 100) : 0;
          const pctCumplidas = s.total > 0 ? Math.round((s.cumplidas / s.total) * 100) : 0;
          const adherenceClass = pctCumplidas >= 80 ? 'badge-green' : pctCumplidas >= 50 ? 'badge-amber' : 'badge-red';
          return `
            <div class="card">
              <div class="flex-between">
                <div>
                  <div class="card-title">${s.nombre}</div>
                  <div class="card-subtitle">${s.total} prescripciones · ${s.completadas} completadas · ${s.cumplidas} aplicadas</div>
                </div>
                <span class="badge ${adherenceClass}">${pctCumplidas}% adherencia</span>
              </div>
              <div style="margin-top:8px;">
                <div class="text-sm text-muted mb-1">Completadas: ${pctCompletadas}%</div>
                <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;">
                  <div style="background:#10b981;height:100%;width:${pctCompletadas}%;border-radius:4px;"></div>
                </div>
                <div class="text-sm text-muted mb-1 mt-1">Aplicadas (verificadas): ${pctCumplidas}%</div>
                <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;">
                  <div style="background:#3b82f6;height:100%;width:${pctCumplidas}%;border-radius:4px;"></div>
                </div>
              </div>
            </div>`;
        }).join('')}
    `;
  }

  // ---- Prescripcion card template ----
  function prescripcionCard(p, showActions) {
    const estadoBadge = {
      'pendiente': 'badge-amber',
      'en_ejecucion': 'badge-blue',
      'completada': 'badge-green',
      'cancelada': 'badge-gray'
    };

    return `
      <div class="card">
        <div class="flex-between">
          <div>
            <div class="card-title">${p.producto || 'Prescripción'}</div>
            <div class="card-subtitle">
              ${p.finca_nombre || ''} · ${p.agricultor_nombre || ''} · ${Format.date(p.fecha)}
            </div>
          </div>
          <span class="badge ${estadoBadge[p.estado] || 'badge-gray'}">${p.estado || 'pendiente'}</span>
        </div>
        <div class="text-sm mt-1">
          ${p.ingrediente_activo ? `<b>I.A.:</b> ${p.ingrediente_activo} · ` : ''}
          <b>Dosis:</b> ${p.dosis || '-'} ${p.unidad_dosis || ''} · <b>Método:</b> ${p.metodo || '-'}
        </div>
        ${p.num_aplicaciones ? `<div class="text-sm">Aplicaciones: ${p.num_aplicaciones} cada ${p.intervalo_dias || '?'} días · Carencia: ${p.carencia_dias || '?'} días</div>` : ''}
        ${p.precauciones ? `<p class="text-sm text-muted mt-1">${Format.truncate(p.precauciones, 100)}</p>` : ''}
        ${showActions ? `
          <div class="flex gap-1 mt-1">
            ${p.estado !== 'completada' ? `<button class="btn btn-sm btn-outline btn-completar-presc" data-id="${p.id}">✅ Completar</button>` : ''}
            <button class="btn btn-sm btn-outline btn-edit-presc" data-id="${p.id}">✏️ Editar</button>
          </div>` : `
          <div class="flex gap-1 mt-1">
            <button class="btn btn-sm btn-outline btn-view-presc" data-id="${p.id}">👁️ Ver</button>
          </div>`}
      </div>`;
  }

  // ---- Wire card action buttons ----
  function wireCardButtons(container, ingenieroId) {
    container.querySelectorAll('.btn-completar-presc').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Marcar esta prescripción como completada?')) {
          await AgroDB.update('prescripciones', btn.dataset.id, { estado: 'completada', fecha_completada: DateUtils.today() });
          App.showToast('Prescripción completada', 'success');
          App.refreshCurrentPage();
        }
      });
    });

    container.querySelectorAll('.btn-edit-presc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const presc = await AgroDB.getById('prescripciones', btn.dataset.id);
        if (presc) showPrescripcionForm(presc.finca_id, presc.inspeccion_id, ingenieroId, presc);
      });
    });

    container.querySelectorAll('.btn-view-presc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const presc = await AgroDB.getById('prescripciones', btn.dataset.id);
        if (presc) showPrescripcionDetail(presc);
      });
    });
  }

  // ---- Prescripcion detail view ----
  function showPrescripcionDetail(p) {
    const body = `
      <div class="mb-2">
        <span class="badge ${p.estado === 'completada' ? 'badge-green' : p.estado === 'en_ejecucion' ? 'badge-blue' : 'badge-amber'}">${p.estado || 'pendiente'}</span>
        <span class="text-sm text-muted"> · ${Format.date(p.fecha)}</span>
      </div>
      <p class="text-sm"><b>Producto:</b> ${p.producto || '-'}</p>
      ${p.ingrediente_activo ? `<p class="text-sm"><b>Ingrediente activo:</b> ${p.ingrediente_activo}</p>` : ''}
      <p class="text-sm"><b>Dosis:</b> ${p.dosis || '-'} ${p.unidad_dosis || ''}</p>
      <p class="text-sm"><b>Método:</b> ${p.metodo || '-'}</p>
      ${p.intervalo_dias ? `<p class="text-sm"><b>Intervalo:</b> cada ${p.intervalo_dias} días</p>` : ''}
      ${p.num_aplicaciones ? `<p class="text-sm"><b>Num. aplicaciones:</b> ${p.num_aplicaciones}</p>` : ''}
      ${p.carencia_dias ? `<p class="text-sm"><b>Período de carencia:</b> ${p.carencia_dias} días</p>` : ''}
      <p class="text-sm"><b>Finca:</b> ${p.finca_nombre || '-'}</p>
      <p class="text-sm"><b>Agricultor:</b> ${p.agricultor_nombre || '-'}</p>
      ${p.inspeccion_id ? `<p class="text-sm"><b>Inspección asociada:</b> ${p.inspeccion_id}</p>` : ''}
      ${p.precauciones ? `<div class="mt-1"><b>Precauciones:</b><p class="text-sm">${p.precauciones}</p></div>` : ''}
    `;

    App.showModal('Detalle de Prescripción', body, '<button class="btn btn-secondary" onclick="App.closeModal()">Cerrar</button>');
  }

  // ---- Prescripcion form ----
  async function showPrescripcionForm(fincaId, inspeccionId, ingenieroId, presc = null) {
    const isEdit = !!presc;

    // Load fincas
    const relaciones = await AgroDB.query('ingeniero_agricultores', r => r.ingeniero_id === ingenieroId);
    const agricultorIds = relaciones.map(r => r.agricultor_id);
    let fincas = [];
    for (const agId of agricultorIds) {
      const f = await AgroDB.query('fincas', r => r.agricultor_id === agId || r.propietario_id === agId);
      fincas = fincas.concat(f);
    }
    const directFincas = await AgroDB.query('fincas', r => r.ingeniero_id === ingenieroId);
    fincas = fincas.concat(directFincas);
    const fincaMap = {};
    fincas.forEach(f => { fincaMap[f.id] = f; });
    fincas = Object.values(fincaMap);

    // Load productos_ingeniero if available
    let productosIng = [];
    try {
      productosIng = await AgroDB.query('productos_ingeniero', r => r.ingeniero_id === ingenieroId);
    } catch (e) {
      // Table may not exist
    }

    // Resolve finca info for auto-fill
    let autoFinca = null;
    if (fincaId) {
      autoFinca = fincas.find(f => f.id === fincaId);
    } else if (presc?.finca_id) {
      autoFinca = fincas.find(f => f.id === presc.finca_id);
    }

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>Finca *</label>
          <select id="presc-finca">
            <option value="">-- Seleccionar --</option>
            ${fincas.map(f => `<option value="${f.id}" data-nombre="${f.nombre}" data-agricultor="${f.agricultor_nombre || f.propietario_nombre || ''}" data-agricultor-id="${f.agricultor_id || f.propietario_id || ''}" ${(fincaId === f.id || presc?.finca_id === f.id) ? 'selected' : ''}>${f.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Agricultor</label>
          <input type="text" id="presc-agricultor" value="${presc?.agricultor_nombre || autoFinca?.agricultor_nombre || autoFinca?.propietario_nombre || ''}" readonly placeholder="Auto-llenado desde finca">
          <input type="hidden" id="presc-agricultor-id" value="${presc?.agricultor_id || autoFinca?.agricultor_id || autoFinca?.propietario_id || ''}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:2;">
          <label>Producto *</label>
          ${productosIng.length > 0 ? `
            <select id="presc-producto">
              <option value="">-- Seleccionar producto --</option>
              ${productosIng.map(pi => `<option value="${pi.nombre}" data-ia="${pi.ingrediente_activo || ''}" ${presc?.producto === pi.nombre ? 'selected' : ''}>${pi.nombre}</option>`).join('')}
              <option value="__otro__">Otro...</option>
            </select>
            <input type="text" id="presc-producto-text" value="${presc?.producto || ''}" placeholder="Nombre del producto" style="${presc && !productosIng.find(pi => pi.nombre === presc.producto) ? '' : 'display:none;'}">
          ` : `
            <input type="text" id="presc-producto-text" value="${presc?.producto || ''}" placeholder="Nombre del producto">
          `}
        </div>
        <div class="form-group">
          <label>Ingrediente activo</label>
          <input type="text" id="presc-ia" value="${presc?.ingrediente_activo || ''}" placeholder="Ej: Mancozeb">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Dosis *</label>
          <input type="number" id="presc-dosis" step="0.01" value="${presc?.dosis || ''}" placeholder="Cantidad">
        </div>
        <div class="form-group">
          <label>Unidad</label>
          <select id="presc-unidad">
            <option value="lt/ha" ${presc?.unidad_dosis === 'lt/ha' ? 'selected' : ''}>lt/ha</option>
            <option value="g/ha" ${presc?.unidad_dosis === 'g/ha' ? 'selected' : ''}>g/ha</option>
            <option value="ml/lt" ${presc?.unidad_dosis === 'ml/lt' ? 'selected' : ''}>ml/lt</option>
            <option value="g/lt" ${presc?.unidad_dosis === 'g/lt' ? 'selected' : ''}>g/lt</option>
            <option value="kg/ha" ${presc?.unidad_dosis === 'kg/ha' ? 'selected' : ''}>kg/ha</option>
            <option value="cc/lt" ${presc?.unidad_dosis === 'cc/lt' ? 'selected' : ''}>cc/lt</option>
          </select>
        </div>
        <div class="form-group">
          <label>Método *</label>
          <select id="presc-metodo">
            <option value="foliar" ${presc?.metodo === 'foliar' ? 'selected' : ''}>Foliar</option>
            <option value="drench" ${presc?.metodo === 'drench' ? 'selected' : ''}>Drench</option>
            <option value="inyeccion" ${presc?.metodo === 'inyeccion' ? 'selected' : ''}>Inyección</option>
            <option value="incorporacion" ${presc?.metodo === 'incorporacion' ? 'selected' : ''}>Incorporación</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Intervalo (días)</label>
          <input type="number" id="presc-intervalo" min="1" value="${presc?.intervalo_dias || ''}" placeholder="Días entre aplic.">
        </div>
        <div class="form-group">
          <label>Num. aplicaciones</label>
          <input type="number" id="presc-num-aplic" min="1" value="${presc?.num_aplicaciones || ''}" placeholder="Total aplicaciones">
        </div>
        <div class="form-group">
          <label>Carencia (días)</label>
          <input type="number" id="presc-carencia" min="0" value="${presc?.carencia_dias || ''}" placeholder="Días de carencia">
        </div>
      </div>

      <div class="form-group">
        <label>Precauciones</label>
        <textarea id="presc-precauciones" rows="2" placeholder="EPP requerido, restricciones de reingreso, etc.">${presc?.precauciones || ''}</textarea>
      </div>

      ${inspeccionId ? `<p class="text-sm text-muted">Vinculada a inspección: ${inspeccionId}</p>` : ''}
    `;

    App.showModal(isEdit ? 'Editar Prescripción' : 'Nueva Prescripción', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-presc">Guardar</button>`);

    // Auto-fill agricultor when finca changes
    const fincaSelect = document.getElementById('presc-finca');
    fincaSelect.addEventListener('change', () => {
      const opt = fincaSelect.selectedOptions[0];
      if (opt) {
        document.getElementById('presc-agricultor').value = opt.dataset.agricultor || '';
        document.getElementById('presc-agricultor-id').value = opt.dataset.agricultorId || '';
      }
    });

    // Product select logic (if select exists)
    const productoSelect = document.getElementById('presc-producto');
    const productoText = document.getElementById('presc-producto-text');
    if (productoSelect) {
      productoSelect.addEventListener('change', () => {
        if (productoSelect.value === '__otro__') {
          productoText.style.display = '';
          productoText.value = '';
          productoText.focus();
        } else {
          productoText.style.display = 'none';
          // Auto-fill ingrediente activo
          const opt = productoSelect.selectedOptions[0];
          if (opt?.dataset.ia) {
            document.getElementById('presc-ia').value = opt.dataset.ia;
          }
        }
      });
    }

    // Save
    document.getElementById('btn-save-presc').addEventListener('click', async () => {
      let producto = '';
      if (productoSelect && productoSelect.value && productoSelect.value !== '__otro__') {
        producto = productoSelect.value;
      } else {
        producto = productoText.value.trim();
      }

      const fId = fincaSelect.value;
      if (!fId || !producto) { App.showToast('Finca y producto son obligatorios', 'warning'); return; }

      const data = {
        finca_id: fId,
        finca_nombre: fincaSelect.selectedOptions[0]?.dataset.nombre || '',
        agricultor_id: document.getElementById('presc-agricultor-id').value || null,
        agricultor_nombre: document.getElementById('presc-agricultor').value || null,
        producto,
        ingrediente_activo: document.getElementById('presc-ia').value.trim() || null,
        dosis: parseFloat(document.getElementById('presc-dosis').value) || null,
        unidad_dosis: document.getElementById('presc-unidad').value,
        metodo: document.getElementById('presc-metodo').value,
        intervalo_dias: parseInt(document.getElementById('presc-intervalo').value) || null,
        num_aplicaciones: parseInt(document.getElementById('presc-num-aplic').value) || null,
        carencia_dias: parseInt(document.getElementById('presc-carencia').value) || null,
        precauciones: document.getElementById('presc-precauciones').value.trim() || null,
        inspeccion_id: inspeccionId || presc?.inspeccion_id || null,
        ingeniero_id: ingenieroId,
        estado: presc?.estado || 'pendiente',
        fecha: presc?.fecha || DateUtils.today(),
        created_at: presc?.created_at || new Date().toISOString()
      };

      if (isEdit) {
        await AgroDB.update('prescripciones', presc.id, data);
      } else {
        await AgroDB.add('prescripciones', data);
      }

      App.closeModal();
      App.showToast('Prescripción guardada', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render, showPrescripcionForm };
})();

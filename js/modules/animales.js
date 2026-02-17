// ============================================
// AgroFinca - Animales Module
// Broiler chickens, laying hens, fish
// Lot management, feeding, production tracking
// ============================================

const AnimalesModule = (() => {

  const TIPOS_ANIMAL = [
    { value: 'pollos_engorde', label: 'Pollos de Engorde', icon: '🐔', unidad: 'kg', ciclo_dias: 45 },
    { value: 'gallinas_ponedoras', label: 'Gallinas Ponedoras', icon: '🥚', unidad: 'huevos', ciclo_dias: 0 },
    { value: 'peces', label: 'Peces', icon: '🐟', unidad: 'kg', ciclo_dias: 180 },
    { value: 'otro', label: 'Otro', icon: '🐾', unidad: 'kg', ciclo_dias: 0 }
  ];

  const ESTADOS_LOTE = [
    { value: 'activo', label: 'Activo', color: 'badge-green' },
    { value: 'produciendo', label: 'Produciendo', color: 'badge-blue' },
    { value: 'engorde', label: 'En Engorde', color: 'badge-amber' },
    { value: 'vendido', label: 'Vendido', color: 'badge-gray' },
    { value: 'finalizado', label: 'Finalizado', color: 'badge-gray' }
  ];

  const TIPOS_REGISTRO = [
    { value: 'alimentacion', label: 'Alimentación', icon: '🌾' },
    { value: 'mortalidad', label: 'Mortalidad', icon: '💀' },
    { value: 'peso', label: 'Control de Peso', icon: '⚖️' },
    { value: 'produccion_huevos', label: 'Producción de Huevos', icon: '🥚' },
    { value: 'produccion_peces', label: 'Producción Peces', icon: '🐟' },
    { value: 'vacunacion', label: 'Vacunación', icon: '💉' },
    { value: 'medicacion', label: 'Medicación', icon: '💊' },
    { value: 'limpieza', label: 'Limpieza', icon: '🧹' },
    { value: 'venta_animales', label: 'Venta de Animales', icon: '💰' },
    { value: 'observacion', label: 'Observación', icon: '📝' }
  ];

  const TIPOS_ALIMENTO = [
    'Balanceado Inicio', 'Balanceado Crecimiento', 'Balanceado Engorde',
    'Balanceado Ponedoras', 'Alimento para Peces', 'Maíz', 'Soya',
    'Concentrado', 'Pasto', 'Residuos orgánicos', 'Otro'
  ];

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🐔</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const lotes = await AgroDB.getByIndex('lotes_animales', 'finca_id', fincaId);
    const registros = await AgroDB.query('registros_animales', r => r.finca_id === fincaId);

    const lotesActivos = lotes.filter(l => l.estado === 'activo' || l.estado === 'produciendo' || l.estado === 'engorde');
    const totalAnimales = lotesActivos.reduce((s, l) => s + (l.cantidad_actual || 0), 0);
    const mortalidadMes = (() => {
      const month = DateUtils.currentMonthRange();
      return registros.filter(r => r.tipo === 'mortalidad' && r.fecha >= month.start && r.fecha <= month.end)
        .reduce((s, r) => s + (r.cantidad || 0), 0);
    })();
    const alimentoMes = (() => {
      const month = DateUtils.currentMonthRange();
      return registros.filter(r => r.tipo === 'alimentacion' && r.fecha >= month.start && r.fecha <= month.end)
        .reduce((s, r) => s + (r.cantidad_kg || 0), 0);
    })();

    container.innerHTML = `
      <div class="page-header">
        <h2>🐔 Animales</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-lote">+ Nuevo Lote</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">🐔</div>
          <div class="s-data"><div class="s-value">${lotesActivos.length}</div><div class="s-label">Lotes activos</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">📊</div>
          <div class="s-data"><div class="s-value">${totalAnimales}</div><div class="s-label">Animales totales</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon red">💀</div>
          <div class="s-data"><div class="s-value">${mortalidadMes}</div><div class="s-label">Mortalidad (mes)</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">🌾</div>
          <div class="s-data"><div class="s-value">${Format.number(alimentoMes)} kg</div><div class="s-label">Alimento (mes)</div></div>
        </div>
      </div>

      <!-- Lotes -->
      ${lotes.length === 0 ? '<div class="empty-state"><h3>Sin lotes de animales</h3><p>Crea tu primer lote para gestionar tus animales.</p></div>' :
      lotes.sort((a, b) => {
        const order = { activo: 0, produciendo: 0, engorde: 0, vendido: 1, finalizado: 2 };
        return (order[a.estado] || 2) - (order[b.estado] || 2);
      }).map(lote => {
        const loteRegs = registros.filter(r => r.lote_id === lote.id);
        const totalAlimento = loteRegs.filter(r => r.tipo === 'alimentacion').reduce((s, r) => s + (r.cantidad_kg || 0), 0);
        const totalMortalidad = loteRegs.filter(r => r.tipo === 'mortalidad').reduce((s, r) => s + (r.cantidad || 0), 0);
        const ultimoPeso = loteRegs.filter(r => r.tipo === 'peso').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
        const tipoInfo = TIPOS_ANIMAL.find(t => t.value === lote.tipo_animal);
        const badge = ESTADOS_LOTE.find(e => e.value === lote.estado);
        const diasVida = DateUtils.daysBetween(lote.fecha_ingreso, DateUtils.today());

        // Producción para ponedoras/peces
        const produccion = loteRegs
          .filter(r => r.tipo === 'produccion_huevos' || r.tipo === 'produccion_peces')
          .reduce((s, r) => s + (r.cantidad || 0), 0);

        return `
          <div class="card">
            <div class="flex-between">
              <div>
                <div class="card-title">${tipoInfo?.icon || '🐾'} ${lote.nombre}</div>
                <div class="card-subtitle">
                  ${tipoInfo?.label || lote.tipo_animal} · ${lote.raza || ''} · Ingreso: ${Format.dateShort(lote.fecha_ingreso)} (${diasVida} días)
                </div>
              </div>
              <span class="badge ${badge?.color || 'badge-gray'}">${badge?.label || lote.estado}</span>
            </div>
            <div class="flex gap-1 mt-1" style="flex-wrap:wrap;">
              <span class="text-sm">🐔 Cant: <b>${lote.cantidad_actual || 0}</b>/${lote.cantidad_inicial || 0}</span>
              <span class="text-sm">🌾 Alimento: <b>${Format.number(totalAlimento)} kg</b></span>
              <span class="text-sm">💀 Mortalidad: <b>${totalMortalidad}</b> (${lote.cantidad_inicial > 0 ? ((totalMortalidad / lote.cantidad_inicial) * 100).toFixed(1) : 0}%)</span>
              ${ultimoPeso ? `<span class="text-sm">⚖️ Peso: <b>${ultimoPeso.peso_promedio_kg} kg</b></span>` : ''}
              ${produccion > 0 ? `<span class="text-sm">${lote.tipo_animal === 'gallinas_ponedoras' ? '🥚' : '🐟'} Producción: <b>${produccion} ${lote.tipo_animal === 'gallinas_ponedoras' ? 'huevos' : 'kg'}</b></span>` : ''}
            </div>
            ${lote.tipo_animal === 'pollos_engorde' && tipoInfo?.ciclo_dias > 0 ? `
              <div id="lote-prog-${lote.id}" class="mt-1"></div>` : ''}
            <div class="flex gap-1 mt-1">
              <button class="btn btn-sm btn-primary btn-add-reg-animal" data-id="${lote.id}" data-tipo="${lote.tipo_animal}">📝 Registro</button>
              <button class="btn btn-sm btn-outline btn-feed-animal" data-id="${lote.id}">🌾 Alimento</button>
              ${lote.tipo_animal === 'gallinas_ponedoras' ? `<button class="btn btn-sm btn-outline btn-prod-huevos" data-id="${lote.id}">🥚 Huevos</button>` : ''}
              ${lote.tipo_animal === 'peces' ? `<button class="btn btn-sm btn-outline btn-prod-peces" data-id="${lote.id}">🐟 Producción</button>` : ''}
              <button class="btn btn-sm btn-outline btn-weight-animal" data-id="${lote.id}">⚖️ Peso</button>
              <button class="btn btn-sm btn-secondary btn-edit-lote" data-id="${lote.id}">✏️</button>
              <button class="btn btn-sm btn-danger btn-del-lote" data-id="${lote.id}">🗑</button>
            </div>
          </div>`;
      }).join('')}

      <!-- Registros recientes -->
      <div class="card">
        <div class="card-header"><h3>Registros recientes</h3></div>
        ${registros.length === 0 ? '<p class="text-sm text-muted">Sin registros</p>' :
      [...registros].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 15).map(r => {
        const tipoReg = TIPOS_REGISTRO.find(t => t.value === r.tipo);
        return `
            <div class="data-list-item" style="padding:0.5rem 0;">
              <div class="data-list-left">
                <div class="data-list-title">${tipoReg?.icon || '📝'} ${tipoReg?.label || r.tipo}</div>
                <div class="data-list-sub">${Format.date(r.fecha)} · ${r.lote_nombre || ''} ${r.notas ? '· ' + r.notas.substring(0, 50) : ''}</div>
              </div>
              <div class="data-list-right">
                ${r.cantidad_kg ? `<div class="data-list-value">${r.cantidad_kg} kg</div>` :
                  r.cantidad ? `<div class="data-list-value">${r.cantidad}</div>` :
                  r.peso_promedio_kg ? `<div class="data-list-value">${r.peso_promedio_kg} kg</div>` :
                  '<span class="text-sm text-muted">-</span>'}
              </div>
            </div>`;
      }).join('')}
      </div>
    `;

    // Progress bars for broilers
    lotes.filter(l => l.tipo_animal === 'pollos_engorde' && (l.estado === 'activo' || l.estado === 'engorde')).forEach(lote => {
      const tipoInfo = TIPOS_ANIMAL.find(t => t.value === lote.tipo_animal);
      const progress = DateUtils.cycleProgress(lote.fecha_ingreso, tipoInfo?.ciclo_dias || 45);
      if (progress !== null) {
        Charts.progressBar(`lote-prog-${lote.id}`, progress, 100, {
          label: `Día ${DateUtils.daysBetween(lote.fecha_ingreso, DateUtils.today())} de ${tipoInfo?.ciclo_dias || 45}`,
          color: progress > 90 ? '#F44336' : progress > 70 ? '#FFA000' : '#4CAF50',
          height: 10
        });
      }
    });

    // Events
    document.getElementById('btn-new-lote')?.addEventListener('click', () => showLoteForm(fincaId));
    container.querySelectorAll('.btn-edit-lote').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lote = await AgroDB.getById('lotes_animales', btn.dataset.id);
        showLoteForm(fincaId, lote);
      });
    });
    container.querySelectorAll('.btn-del-lote').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este lote y todos sus registros?')) {
          // Delete associated records
          const regs = await AgroDB.query('registros_animales', r => r.lote_id === btn.dataset.id);
          for (const r of regs) {
            await AgroDB.remove('registros_animales', r.id);
          }
          await AgroDB.remove('lotes_animales', btn.dataset.id);
          App.showToast('Lote eliminado', 'success');
          App.refreshCurrentPage();
        }
      });
    });
    container.querySelectorAll('.btn-add-reg-animal').forEach(btn => {
      btn.addEventListener('click', () => showRegistroForm(fincaId, btn.dataset.id, btn.dataset.tipo));
    });
    container.querySelectorAll('.btn-feed-animal').forEach(btn => {
      btn.addEventListener('click', () => showAlimentacionForm(fincaId, btn.dataset.id));
    });
    container.querySelectorAll('.btn-prod-huevos').forEach(btn => {
      btn.addEventListener('click', () => showProduccionForm(fincaId, btn.dataset.id, 'produccion_huevos'));
    });
    container.querySelectorAll('.btn-prod-peces').forEach(btn => {
      btn.addEventListener('click', () => showProduccionForm(fincaId, btn.dataset.id, 'produccion_peces'));
    });
    container.querySelectorAll('.btn-weight-animal').forEach(btn => {
      btn.addEventListener('click', () => showPesoForm(fincaId, btn.dataset.id));
    });
  }

  async function showLoteForm(fincaId, lote = null) {
    const isEdit = !!lote;
    const user = AuthModule.getUser();
    const body = `
      <div class="form-group">
        <label>Nombre del lote *</label>
        <input type="text" id="lote-nombre" value="${lote?.nombre || ''}" placeholder="Ej: Lote Pollos 01, Estanque Norte...">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo de animal *</label>
          <select id="lote-tipo">
            ${TIPOS_ANIMAL.map(t => `<option value="${t.value}" ${lote?.tipo_animal === t.value ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Raza / Especie</label>
          <input type="text" id="lote-raza" value="${lote?.raza || ''}" placeholder="Ej: Ross 308, Hy-Line, Tilapia...">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cantidad inicial *</label>
          <input type="number" id="lote-cantidad" value="${lote?.cantidad_inicial || ''}" placeholder="0">
        </div>
        <div class="form-group">
          <label>Cantidad actual</label>
          <input type="number" id="lote-actual" value="${lote?.cantidad_actual || ''}" placeholder="Auto-calculada">
          <span class="form-hint">Se actualiza con mortalidad/ventas</span>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha de ingreso *</label>
          <input type="date" id="lote-fecha" value="${lote?.fecha_ingreso || DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select id="lote-estado">
            ${ESTADOS_LOTE.map(e => `<option value="${e.value}" ${lote?.estado === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Ubicación / Instalación</label>
        <input type="text" id="lote-ubicacion" value="${lote?.ubicacion || ''}" placeholder="Ej: Galpón 1, Estanque 2...">
      </div>
      <div class="form-group">
        <label>Proveedor</label>
        <input type="text" id="lote-proveedor" value="${lote?.proveedor || ''}" placeholder="Origen de los animales">
      </div>
      <div class="form-group">
        <label>Costo de adquisición ($)</label>
        <input type="number" step="0.01" id="lote-costo" value="${lote?.costo_adquisicion || ''}" placeholder="0.00">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="lote-notas" placeholder="Observaciones del lote">${lote?.notas || ''}</textarea>
      </div>
      ${isEdit ? `<div class="flex-between mt-1">
        <button class="btn btn-danger btn-sm" id="btn-delete-lote-modal">🗑 Eliminar Lote</button>
        <span></span>
      </div>` : ''}
    `;
    App.showModal(isEdit ? 'Editar Lote' : 'Nuevo Lote de Animales', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-lote">Guardar</button>`);

    document.getElementById('btn-save-lote').addEventListener('click', async () => {
      const nombre = document.getElementById('lote-nombre').value.trim();
      const cantidadInicial = parseInt(document.getElementById('lote-cantidad').value);
      if (!nombre) { App.showToast('El nombre es obligatorio', 'warning'); return; }
      if (!cantidadInicial) { App.showToast('La cantidad inicial es obligatoria', 'warning'); return; }

      const cantidadActual = parseInt(document.getElementById('lote-actual').value) || cantidadInicial;
      const data = {
        finca_id: fincaId,
        nombre,
        tipo_animal: document.getElementById('lote-tipo').value,
        raza: document.getElementById('lote-raza').value.trim(),
        cantidad_inicial: cantidadInicial,
        cantidad_actual: cantidadActual,
        fecha_ingreso: document.getElementById('lote-fecha').value,
        estado: document.getElementById('lote-estado').value,
        ubicacion: document.getElementById('lote-ubicacion').value.trim(),
        proveedor: document.getElementById('lote-proveedor').value.trim(),
        costo_adquisicion: parseFloat(document.getElementById('lote-costo').value) || 0,
        notas: document.getElementById('lote-notas').value.trim(),
        modificado_por: user?.nombre || user?.email || 'sistema'
      };

      if (isEdit) await AgroDB.update('lotes_animales', lote.id, data);
      else await AgroDB.add('lotes_animales', data);

      App.closeModal();
      App.showToast('Lote guardado', 'success');
      App.refreshCurrentPage();
    });

    document.getElementById('btn-delete-lote-modal')?.addEventListener('click', async () => {
      if (confirm('¿Eliminar este lote y todos sus registros?')) {
        const regs = await AgroDB.query('registros_animales', r => r.lote_id === lote.id);
        for (const r of regs) await AgroDB.remove('registros_animales', r.id);
        await AgroDB.remove('lotes_animales', lote.id);
        App.closeModal();
        App.showToast('Lote eliminado', 'success');
        App.refreshCurrentPage();
      }
    });
  }

  async function showAlimentacionForm(fincaId, loteId) {
    const lote = await AgroDB.getById('lotes_animales', loteId);
    const user = AuthModule.getUser();
    const body = `
      <div class="form-group">
        <label>Lote</label>
        <input type="text" value="${lote?.nombre || ''}" readonly style="background:#f5f5f5;">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="alim-fecha" value="${DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Cantidad (kg) *</label>
          <input type="number" step="0.1" id="alim-cantidad" placeholder="0">
        </div>
      </div>
      <div class="form-group">
        <label>Tipo de alimento</label>
        <select id="alim-tipo">
          ${TIPOS_ALIMENTO.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Costo ($)</label>
        <input type="number" step="0.01" id="alim-costo" placeholder="0.00">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="alim-notas" placeholder="Observaciones"></textarea>
      </div>
    `;
    App.showModal('🌾 Registrar Alimentación', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-alim">Guardar</button>`);

    document.getElementById('btn-save-alim').addEventListener('click', async () => {
      const cantidad = parseFloat(document.getElementById('alim-cantidad').value);
      if (!cantidad) { App.showToast('Ingresa la cantidad', 'warning'); return; }
      const data = {
        finca_id: fincaId,
        lote_id: loteId,
        lote_nombre: lote?.nombre,
        fecha: document.getElementById('alim-fecha').value,
        tipo: 'alimentacion',
        tipo_alimento: document.getElementById('alim-tipo').value,
        cantidad_kg: cantidad,
        costo: parseFloat(document.getElementById('alim-costo').value) || 0,
        notas: document.getElementById('alim-notas').value.trim(),
        registrado_por: user?.nombre || user?.email || 'sistema'
      };
      await AgroDB.add('registros_animales', data);
      App.closeModal();
      App.showToast('Alimentación registrada', 'success');
      App.refreshCurrentPage();
    });
  }

  async function showProduccionForm(fincaId, loteId, tipoProduccion) {
    const lote = await AgroDB.getById('lotes_animales', loteId);
    const user = AuthModule.getUser();
    const esHuevos = tipoProduccion === 'produccion_huevos';
    const body = `
      <div class="form-group">
        <label>Lote</label>
        <input type="text" value="${lote?.nombre || ''}" readonly style="background:#f5f5f5;">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="prod-fecha" value="${DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>${esHuevos ? 'Huevos recogidos' : 'Producción (kg)'} *</label>
          <input type="number" step="${esHuevos ? '1' : '0.1'}" id="prod-cantidad" placeholder="0">
        </div>
      </div>
      ${esHuevos ? `
      <div class="form-group">
        <label>Huevos rotos</label>
        <input type="number" id="prod-rotos" value="0" placeholder="0">
      </div>` : ''}
      <div class="form-group">
        <label>Notas</label>
        <textarea id="prod-notas" placeholder="Observaciones"></textarea>
      </div>
    `;
    App.showModal(esHuevos ? '🥚 Producción de Huevos' : '🐟 Producción Peces', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-prod">Guardar</button>`);

    document.getElementById('btn-save-prod').addEventListener('click', async () => {
      const cantidad = parseFloat(document.getElementById('prod-cantidad').value);
      if (!cantidad) { App.showToast('Ingresa la cantidad', 'warning'); return; }
      const data = {
        finca_id: fincaId,
        lote_id: loteId,
        lote_nombre: lote?.nombre,
        fecha: document.getElementById('prod-fecha').value,
        tipo: tipoProduccion,
        cantidad,
        huevos_rotos: esHuevos ? parseInt(document.getElementById('prod-rotos').value) || 0 : null,
        notas: document.getElementById('prod-notas').value.trim(),
        registrado_por: user?.nombre || user?.email || 'sistema'
      };
      await AgroDB.add('registros_animales', data);
      App.closeModal();
      App.showToast('Producción registrada', 'success');
      App.refreshCurrentPage();
    });
  }

  async function showPesoForm(fincaId, loteId) {
    const lote = await AgroDB.getById('lotes_animales', loteId);
    const user = AuthModule.getUser();
    const body = `
      <div class="form-group">
        <label>Lote</label>
        <input type="text" value="${lote?.nombre || ''}" readonly style="background:#f5f5f5;">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="peso-fecha" value="${DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Peso promedio (kg) *</label>
          <input type="number" step="0.01" id="peso-promedio" placeholder="0.00">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Muestra (animales pesados)</label>
          <input type="number" id="peso-muestra" placeholder="Ej: 10">
        </div>
        <div class="form-group">
          <label>Peso total muestra (kg)</label>
          <input type="number" step="0.01" id="peso-total" placeholder="Se calcula">
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="peso-notas" placeholder="Uniformidad, observaciones..."></textarea>
      </div>
    `;
    App.showModal('⚖️ Control de Peso', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-peso">Guardar</button>`);

    // Auto-calc average
    const calcAvg = () => {
      const muestra = parseInt(document.getElementById('peso-muestra').value) || 0;
      const total = parseFloat(document.getElementById('peso-total').value) || 0;
      if (muestra > 0 && total > 0) {
        document.getElementById('peso-promedio').value = (total / muestra).toFixed(2);
      }
    };
    document.getElementById('peso-muestra')?.addEventListener('input', calcAvg);
    document.getElementById('peso-total')?.addEventListener('input', calcAvg);

    document.getElementById('btn-save-peso').addEventListener('click', async () => {
      const pesoProm = parseFloat(document.getElementById('peso-promedio').value);
      if (!pesoProm) { App.showToast('Ingresa el peso promedio', 'warning'); return; }
      const data = {
        finca_id: fincaId,
        lote_id: loteId,
        lote_nombre: lote?.nombre,
        fecha: document.getElementById('peso-fecha').value,
        tipo: 'peso',
        peso_promedio_kg: pesoProm,
        muestra: parseInt(document.getElementById('peso-muestra').value) || null,
        notas: document.getElementById('peso-notas').value.trim(),
        registrado_por: user?.nombre || user?.email || 'sistema'
      };
      await AgroDB.add('registros_animales', data);
      App.closeModal();
      App.showToast('Peso registrado', 'success');
      App.refreshCurrentPage();
    });
  }

  async function showRegistroForm(fincaId, loteId, tipoAnimal) {
    const lote = await AgroDB.getById('lotes_animales', loteId);
    const user = AuthModule.getUser();

    // Filter registro types based on animal type
    const tiposDisponibles = TIPOS_REGISTRO.filter(t => {
      if (t.value === 'produccion_huevos' && tipoAnimal !== 'gallinas_ponedoras') return false;
      if (t.value === 'produccion_peces' && tipoAnimal !== 'peces') return false;
      return true;
    });

    const body = `
      <div class="form-group">
        <label>Lote</label>
        <input type="text" value="${lote?.nombre || ''}" readonly style="background:#f5f5f5;">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo de registro *</label>
          <select id="reg-tipo">
            ${tiposDisponibles.map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="reg-fecha" value="${DateUtils.today()}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cantidad</label>
          <input type="number" step="0.1" id="reg-cantidad" placeholder="0">
          <span class="form-hint">Mortalidad: unidades / Venta: animales</span>
        </div>
        <div class="form-group">
          <label>Costo / Valor ($)</label>
          <input type="number" step="0.01" id="reg-costo" placeholder="0.00">
        </div>
      </div>
      <div class="form-group">
        <label>Producto / Detalle</label>
        <input type="text" id="reg-producto" placeholder="Ej: Vacuna Newcastle, Antibiótico...">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="reg-notas" placeholder="Observaciones del registro"></textarea>
      </div>
    `;
    App.showModal('📝 Nuevo Registro', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-reg-animal">Guardar</button>`);

    document.getElementById('btn-save-reg-animal').addEventListener('click', async () => {
      const tipo = document.getElementById('reg-tipo').value;
      const cantidad = parseFloat(document.getElementById('reg-cantidad').value) || 0;
      const data = {
        finca_id: fincaId,
        lote_id: loteId,
        lote_nombre: lote?.nombre,
        fecha: document.getElementById('reg-fecha').value,
        tipo,
        cantidad,
        costo: parseFloat(document.getElementById('reg-costo').value) || 0,
        producto: document.getElementById('reg-producto').value.trim(),
        notas: document.getElementById('reg-notas').value.trim(),
        registrado_por: user?.nombre || user?.email || 'sistema'
      };
      await AgroDB.add('registros_animales', data);

      // Update lote quantity on mortality or sale
      if ((tipo === 'mortalidad' || tipo === 'venta_animales') && cantidad > 0 && lote) {
        const nuevaCantidad = Math.max(0, (lote.cantidad_actual || 0) - cantidad);
        await AgroDB.update('lotes_animales', loteId, { cantidad_actual: nuevaCantidad });
      }

      App.closeModal();
      App.showToast('Registro guardado', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render };
})();

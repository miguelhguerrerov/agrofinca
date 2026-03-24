// ============================================
// AgroFinca - Producción Module (v2)
// Crop catalog with emoji picker, rendimiento,
// production cycles, harvests
// ============================================

const ProduccionModule = (() => {
  let currentTab = 'ciclos';

  // Emoji picker categories for Ecuador agriculture
  const CROP_ICONS = {
    'Frutas': ['🍌', '🍊', '🍋', '🍉', '🍇', '🍓', '🍑', '🥭', '🍍', '🥝', '🍈', '🍒', '🍐', '🍎', '🥥', '🍅'],
    'Hortalizas': ['🫑', '🥒', '🥕', '🧅', '🧄', '🥬', '🥦', '🌶️', '🍆', '🥑', '🌽', '🫘'],
    'Granos': ['🌾', '🍚', '🌿'],
    'Tubérculos': ['🥔', '🍠'],
    'Tropicales': ['☕', '🍫', '🌴', '🌱', '🪴', '🎋'],
    'Ganadería': ['🐄', '🐖', '🐓', '🐑', '🐐', '🦆', '🐇', '🥚', '🥩', '🧀', '🥛'],
    'Apicultura': ['🐝', '🍯', '🌸', '🌺', '🌻'],
    'Otros': ['🪱', '🌳', '💧', '🪵', '📦', '🚜', '🟡', '🟢', '🔵']
  };

  // Rendimiento units
  const YIELD_UNITS = [
    { value: 't/ha', label: 't/ha (toneladas por hectárea)' },
    { value: 'kg/planta', label: 'kg/planta' },
    { value: 'kg/planta/año', label: 'kg/planta/año' },
    { value: 'kg/ha/año', label: 'kg/ha/año' },
    { value: 'racimos/planta/año', label: 'racimos/planta/año' },
    { value: 'litros/colmena/año', label: 'litros/colmena/año' },
    { value: 'kg/m²/ciclo', label: 'kg/m²/ciclo' }
  ];

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🌿</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const [cultivos, ciclos, cosechas, areas] = await Promise.all([
      AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId),
      AgroDB.getByIndex('ciclos_productivos', 'finca_id', fincaId),
      AgroDB.getByIndex('cosechas', 'finca_id', fincaId),
      AgroDB.getByIndex('areas', 'finca_id', fincaId)
    ]);

    const ciclosActivos = ciclos.filter(c => c.estado === 'activo');
    const totalCosechas = cosechas.reduce((s, c) => s + (c.cantidad || 0), 0);

    container.innerHTML = `
      <div class="page-header">
        <h2>🌿 Producción</h2>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">🌱</div>
          <div class="s-data"><div class="s-value">${ciclosActivos.length}</div><div class="s-label">Ciclos activos</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">🌾</div>
          <div class="s-data"><div class="s-value">${cosechas.length}</div><div class="s-label">Cosechas totales</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">📦</div>
          <div class="s-data"><div class="s-value">${cultivos.length}</div><div class="s-label">Tipos de cultivo</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon brown">🗺️</div>
          <div class="s-data"><div class="s-value">${areas.length}</div><div class="s-label">Áreas</div></div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab ${currentTab === 'ciclos' ? 'active' : ''}" data-tab="ciclos">Ciclos</button>
        <button class="tab ${currentTab === 'cosechas' ? 'active' : ''}" data-tab="cosechas">Cosechas</button>
        <button class="tab ${currentTab === 'cultivos' ? 'active' : ''}" data-tab="cultivos">Catálogo</button>
      </div>

      <div id="tab-content"></div>
    `;

    container.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderTab(document.getElementById('tab-content'), fincaId, cultivos, ciclos, cosechas, areas);
      });
    });

    renderTab(document.getElementById('tab-content'), fincaId, cultivos, ciclos, cosechas, areas);
  }

  function renderTab(el, fincaId, cultivos, ciclos, cosechas, areas) {
    switch (currentTab) {
      case 'ciclos': renderCiclos(el, fincaId, cultivos, ciclos, areas); break;
      case 'cosechas': renderCosechas(el, fincaId, cultivos, ciclos, cosechas); break;
      case 'cultivos': renderCatalogo(el, fincaId, cultivos); break;
    }
  }

  function renderCiclos(el, fincaId, cultivos, ciclos, areas) {
    const sorted = [...ciclos].sort((a, b) => (a.estado === 'activo' ? -1 : 1));
    el.innerHTML = `
      <div class="flex-between mb-1">
        <span class="text-sm text-muted">${ciclos.length} ciclos</span>
        <button class="btn btn-primary btn-sm" id="btn-new-ciclo">+ Nuevo Ciclo</button>
      </div>
      ${sorted.length === 0 ? '<div class="empty-state"><h3>Sin ciclos productivos</h3><p>Inicia un nuevo ciclo para registrar producción.</p></div>' :
      sorted.map(c => {
        const progress = DateUtils.cycleProgress(c.fecha_inicio, c.ciclo_dias);
        return `
          <div class="card">
            <div class="flex-between">
              <div>
                <div class="card-title">${c.cultivo_nombre || 'Cultivo'}</div>
                <div class="card-subtitle">${c.area_nombre || 'Sin área'} · ${Format.dateShort(c.fecha_inicio)}${c.fecha_fin_real ? ' → ' + Format.dateShort(c.fecha_fin_real) : ''}</div>
              </div>
              <span class="badge ${c.estado === 'activo' ? 'badge-green' : c.estado === 'cosechado' ? 'badge-amber' : 'badge-gray'}">${c.estado}</span>
            </div>
            ${progress !== null ? `<div id="ciclo-prog-${c.id}" class="mt-1"></div>` : ''}
            ${c.fecha_fin_estimada ? `<div class="text-xs text-muted mt-1">Cosecha estimada: ${Format.date(c.fecha_fin_estimada)}</div>` : ''}
            <div class="flex gap-1 mt-1">
              <button class="btn btn-sm btn-outline btn-harvest-ciclo" data-id="${c.id}" data-cultivo="${c.cultivo_id}">🌾 Cosechar</button>
              ${c.estado === 'activo' ? `<button class="btn btn-sm btn-secondary btn-close-ciclo" data-id="${c.id}">✅ Cerrar ciclo</button>` : ''}
              <button class="btn btn-sm btn-secondary btn-edit-ciclo" data-id="${c.id}">✏️</button>
              <button class="btn btn-sm btn-danger btn-del-ciclo" data-id="${c.id}">🗑</button>
            </div>
          </div>`;
      }).join('')}
    `;

    // Progress bars
    sorted.forEach(c => {
      const progress = DateUtils.cycleProgress(c.fecha_inicio, c.ciclo_dias);
      if (progress !== null) {
        Charts.progressBar(`ciclo-prog-${c.id}`, progress, 100, {
          label: `Día ${DateUtils.daysBetween(c.fecha_inicio, DateUtils.today())} de ${c.ciclo_dias}`,
          color: progress > 90 ? '#F44336' : progress > 70 ? '#FFA000' : '#4CAF50',
          height: 10
        });
      }
    });

    el.querySelector('#btn-new-ciclo')?.addEventListener('click', () => showCicloForm(fincaId, cultivos, areas));
    el.querySelectorAll('.btn-harvest-ciclo').forEach(btn => {
      btn.addEventListener('click', () => showQuickHarvest(fincaId, btn.dataset.id, btn.dataset.cultivo));
    });
    el.querySelectorAll('.btn-close-ciclo').forEach(btn => {
      btn.addEventListener('click', async () => {
        await AgroDB.update('ciclos_productivos', btn.dataset.id, {
          estado: 'cosechado', fecha_fin_real: DateUtils.today()
        });
        App.showToast('Ciclo cerrado', 'success');
        App.refreshCurrentPage();
      });
    });
    el.querySelectorAll('.btn-edit-ciclo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ciclo = await AgroDB.getById('ciclos_productivos', btn.dataset.id);
        showCicloForm(fincaId, cultivos, areas, ciclo);
      });
    });
    el.querySelectorAll('.btn-del-ciclo').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este ciclo productivo y sus cosechas asociadas?')) {
          const cosechasCiclo = await AgroDB.query('cosechas', c => c.ciclo_id === btn.dataset.id);
          for (const c of cosechasCiclo) await AgroDB.remove('cosechas', c.id);
          await AgroDB.remove('ciclos_productivos', btn.dataset.id);
          App.showToast('Ciclo eliminado', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  function renderCosechas(el, fincaId, cultivos, ciclos, cosechas) {
    const sorted = [...cosechas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    el.innerHTML = `
      <div class="flex-between mb-1">
        <span class="text-sm text-muted">${cosechas.length} cosechas registradas</span>
        <button class="btn btn-primary btn-sm" id="btn-new-cosecha">+ Cosecha</button>
      </div>
      ${sorted.length === 0 ? '<div class="empty-state"><h3>Sin cosechas</h3></div>' :
      `<ul class="data-list">
          ${sorted.map(c => `
            <li class="data-list-item">
              <div class="data-list-left">
                <div class="data-list-title">${c.cultivo_nombre || 'Cosecha'}</div>
                <div class="data-list-sub">${Format.date(c.fecha)} · Calidad: ${c.calidad || 'N/A'}${c.registrado_por ? ' · Por: ' + c.registrado_por : ''}</div>
              </div>
              <div class="data-list-right" style="display:flex;align-items:center;gap:0.5rem;">
                <div class="data-list-value">${Format.unit(c.cantidad, c.unidad)}</div>
                <button class="btn btn-sm btn-outline btn-edit-cosecha" data-id="${c.id}">✏️</button>
                <button class="btn btn-sm btn-danger btn-del-cosecha" data-id="${c.id}">🗑</button>
              </div>
            </li>
          `).join('')}
        </ul>`}
    `;
    el.querySelector('#btn-new-cosecha')?.addEventListener('click', () => showQuickHarvest(fincaId));
    el.querySelectorAll('.btn-edit-cosecha').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cosecha = await AgroDB.getById('cosechas', btn.dataset.id);
        showQuickHarvest(fincaId, cosecha?.ciclo_id, cosecha?.cultivo_id, cosecha);
      });
    });
    el.querySelectorAll('.btn-del-cosecha').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta cosecha?')) {
          await AgroDB.remove('cosechas', btn.dataset.id);
          App.showToast('Cosecha eliminada', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  function renderCatalogo(el, fincaId, cultivos) {
    el.innerHTML = `
      <div class="flex-between mb-1">
        <span class="text-sm text-muted">${cultivos.length} tipos de cultivo</span>
        <button class="btn btn-primary btn-sm" id="btn-new-cultivo">+ Nuevo Tipo</button>
      </div>
      ${cultivos.map(c => `
        <div class="card">
          <div class="flex-between">
            <div class="flex gap-1" style="align-items:center;">
              <span style="font-size:1.5rem;">${c.icono || '🌱'}</span>
              <div>
                <div class="card-title">${c.nombre}</div>
                <div class="card-subtitle">${Format.cropType(c.tipo)} · ${c.unidad_produccion} · ${c.ciclo_dias ? c.ciclo_dias + ' días' : 'Perenne'}</div>
              </div>
            </div>
            <div class="flex gap-1">
              <button class="btn btn-sm btn-outline btn-edit-cultivo" data-id="${c.id}">✏️</button>
              <button class="btn btn-sm btn-danger btn-del-cultivo" data-id="${c.id}">🗑</button>
            </div>
          </div>
          ${c.rendimiento_referencia ? `<div class="text-sm mt-1" style="color:var(--green-700);">📊 Rend. ref: ${c.rendimiento_referencia} ${c.unidad_rendimiento || 't/ha'}</div>` : ''}
          ${c.descripcion ? `<p class="text-sm text-muted mt-1">${c.descripcion}</p>` : ''}
        </div>
      `).join('')}
    `;

    el.querySelector('#btn-new-cultivo')?.addEventListener('click', () => showCultivoForm(fincaId));
    el.querySelectorAll('.btn-edit-cultivo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cultivo = await AgroDB.getById('cultivos_catalogo', btn.dataset.id);
        showCultivoForm(fincaId, cultivo);
      });
    });
    el.querySelectorAll('.btn-del-cultivo').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este tipo de cultivo?')) {
          await AgroDB.remove('cultivos_catalogo', btn.dataset.id);
          App.showToast('Cultivo eliminado', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function showCicloForm(fincaId, cultivos, areas, ciclo = null) {
    const isEdit = !!ciclo;
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>Cultivo *</label>
          <select id="ciclo-cultivo">
            <option value="">Seleccionar...</option>
            ${cultivos.filter(c => c.tipo !== 'apicola' && c.tipo !== 'compostaje').map(c => `<option value="${c.id}" data-dias="${c.ciclo_dias}" data-nombre="${c.nombre}" ${ciclo?.cultivo_id === c.id ? 'selected' : ''}>${c.icono || ''} ${c.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Área / Parcela</label>
          <select id="ciclo-area">
            <option value="">Sin área</option>
            ${areas.map(a => `<option value="${a.id}" data-nombre="${a.nombre}" ${ciclo?.area_id === a.id ? 'selected' : ''}>${a.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha de inicio *</label>
          <input type="date" id="ciclo-inicio" value="${ciclo?.fecha_inicio || DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Fecha fin estimada</label>
          <input type="date" id="ciclo-fin-est" value="${ciclo?.fecha_fin_estimada || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cantidad de plantas</label>
          <input type="number" id="ciclo-plantas" value="${ciclo?.cantidad_plantas || ''}" placeholder="0">
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select id="ciclo-estado">
            <option value="activo" ${ciclo?.estado === 'activo' ? 'selected' : ''}>Activo</option>
            <option value="cosechado" ${ciclo?.estado === 'cosechado' ? 'selected' : ''}>Cosechado</option>
            <option value="cancelado" ${ciclo?.estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="ciclo-notas" placeholder="Observaciones del ciclo">${ciclo?.notas || ''}</textarea>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Ciclo' : 'Nuevo Ciclo Productivo', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-ciclo">Guardar</button>`);

    // Auto-calculate end date
    document.getElementById('ciclo-cultivo').addEventListener('change', (e) => {
      const opt = e.target.selectedOptions[0];
      const dias = parseInt(opt?.dataset.dias) || 0;
      if (dias > 0) {
        const inicio = document.getElementById('ciclo-inicio').value;
        document.getElementById('ciclo-fin-est').value = DateUtils.addDays(inicio, dias);
      }
    });

    document.getElementById('btn-save-ciclo').addEventListener('click', async () => {
      const cultivoSel = document.getElementById('ciclo-cultivo');
      const areaSel = document.getElementById('ciclo-area');
      if (!cultivoSel.value) { App.showToast('Selecciona un cultivo', 'warning'); return; }

      const cultivoOpt = cultivoSel.selectedOptions[0];
      const areaOpt = areaSel.selectedOptions[0];
      const cultivoData = await AgroDB.getById('cultivos_catalogo', cultivoSel.value);

      const data = {
        finca_id: fincaId,
        cultivo_id: cultivoSel.value,
        cultivo_nombre: cultivoOpt.dataset.nombre || cultivoData?.nombre,
        area_id: areaSel.value || null,
        area_nombre: areaSel.value ? areaOpt.dataset.nombre : null,
        fecha_inicio: document.getElementById('ciclo-inicio').value,
        fecha_fin_estimada: document.getElementById('ciclo-fin-est').value || null,
        ciclo_dias: cultivoData?.ciclo_dias || 0,
        cantidad_plantas: parseInt(document.getElementById('ciclo-plantas').value) || 0,
        estado: document.getElementById('ciclo-estado').value,
        notas: document.getElementById('ciclo-notas').value.trim()
      };

      if (isEdit) {
        await AgroDB.update('ciclos_productivos', ciclo.id, data);
      } else {
        await AgroDB.add('ciclos_productivos', data);
        if (data.area_id) {
          await AgroDB.update('areas', data.area_id, {
            cultivo_actual_id: data.cultivo_id,
            cultivo_actual_nombre: data.cultivo_nombre
          });
        }
      }
      App.closeModal();
      App.showToast('Ciclo guardado', 'success');
      App.refreshCurrentPage();
    });
  }

  async function showQuickHarvest(fincaId, cicloId, cultivoId, cosechaEdit = null) {
    const ciclos = await AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo');
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);

    const isEditCosecha = !!cosechaEdit;
    const body = `
      <div class="form-group">
        <label>Ciclo productivo</label>
        <select id="cos-ciclo">
          <option value="">Seleccionar ciclo...</option>
          ${ciclos.map(c => `<option value="${c.id}" data-cultivo="${c.cultivo_id}" data-nombre="${c.cultivo_nombre}" ${c.id === cicloId ? 'selected' : ''}>${c.cultivo_nombre} - ${c.area_nombre || 'Sin área'}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" id="cos-fecha" value="${cosechaEdit?.fecha || DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Cantidad *</label>
          <input type="number" id="cos-cantidad" step="0.1" placeholder="0" value="${cosechaEdit?.cantidad || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Unidad</label>
          <select id="cos-unidad">
            <option value="kg">kg</option>
            <option value="racimos">racimos</option>
            <option value="atados">atados</option>
            <option value="litros">litros</option>
            <option value="unidades">unidades</option>
            <option value="sacos">sacos</option>
            <option value="quintales">quintales</option>
            <option value="libras">libras</option>
          </select>
        </div>
        <div class="form-group">
          <label>Calidad</label>
          <select id="cos-calidad">
            <option value="A">A - Primera</option>
            <option value="B">B - Segunda</option>
            <option value="C">C - Tercera</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="cos-notas" placeholder="Observaciones de la cosecha"></textarea>
      </div>
    `;
    App.showModal(isEditCosecha ? 'Editar Cosecha' : 'Registrar Cosecha', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-cosecha">Guardar</button>`);

    // Auto-set unit based on selected cycle's crop
    document.getElementById('cos-ciclo').addEventListener('change', async (e) => {
      const opt = e.target.selectedOptions[0];
      if (opt?.dataset.cultivo) {
        const cultivo = await AgroDB.getById('cultivos_catalogo', opt.dataset.cultivo);
        if (cultivo) {
          document.getElementById('cos-unidad').value = cultivo.unidad_produccion || 'kg';
        }
      }
    });
    if (cicloId) document.getElementById('cos-ciclo').dispatchEvent(new Event('change'));

    document.getElementById('btn-save-cosecha').addEventListener('click', async () => {
      const cantidad = parseFloat(document.getElementById('cos-cantidad').value);
      if (!cantidad) { App.showToast('Ingresa la cantidad', 'warning'); return; }

      const cicloSel = document.getElementById('cos-ciclo');
      const cicloOpt = cicloSel.selectedOptions[0];
      const selCicloId = cicloSel.value;
      let cultivoNombre = cicloOpt?.dataset.nombre || '';
      let selCultivoId = cicloOpt?.dataset.cultivo || cultivoId;

      const user = AuthModule.getUser();
      const data = {
        finca_id: fincaId,
        ciclo_id: selCicloId || null,
        cultivo_id: selCultivoId || null,
        cultivo_nombre: cultivoNombre,
        fecha: document.getElementById('cos-fecha').value,
        cantidad,
        unidad: document.getElementById('cos-unidad').value,
        calidad: document.getElementById('cos-calidad').value,
        notas: document.getElementById('cos-notas').value.trim(),
        registrado_por: user?.nombre || user?.email || 'sistema'
      };
      if (isEditCosecha) await AgroDB.update('cosechas', cosechaEdit.id, data);
      else await AgroDB.add('cosechas', data);
      App.closeModal();
      App.showToast('Cosecha registrada', 'success');
      App.refreshCurrentPage();
    });
  }

  // ---- Cultivo Form with Emoji Picker & Rendimiento ----

  async function showCultivoForm(fincaId, cultivo = null) {
    const isEdit = !!cultivo;
    const selectedIcon = cultivo?.icono || '🌱';

    const body = `
      <div class="form-row">
        <div class="form-group" style="flex:3;">
          <label>Nombre *</label>
          <input type="text" id="cult-nombre" value="${cultivo?.nombre || ''}" placeholder="Tomate, Cacao...">
        </div>
        <div class="form-group" style="flex:1; min-width:80px;">
          <label>Icono</label>
          <div class="emoji-picker-wrapper" style="position:relative;">
            <button type="button" class="emoji-picker-btn" id="emoji-picker-btn">${selectedIcon}</button>
            <input type="hidden" id="cult-icono" value="${selectedIcon}">
            <div class="emoji-picker-grid" id="emoji-picker-grid" style="display:none;">
              ${Object.entries(CROP_ICONS).map(([cat, emojis]) => `
                <div class="emoji-category-label">${cat}</div>
                <div class="emoji-options-row">
                  ${emojis.map(e => `<button type="button" class="emoji-option ${e === selectedIcon ? 'selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo *</label>
          <select id="cult-tipo">
            <option value="perenne" ${cultivo?.tipo === 'perenne' ? 'selected' : ''}>Perenne</option>
            <option value="estacional" ${cultivo?.tipo === 'estacional' ? 'selected' : ''}>Estacional</option>
            <option value="rotacion_rapida" ${cultivo?.tipo === 'rotacion_rapida' ? 'selected' : ''}>Rotación rápida</option>
            <option value="frutal" ${cultivo?.tipo === 'frutal' ? 'selected' : ''}>Frutal</option>
            <option value="hortaliza" ${cultivo?.tipo === 'hortaliza' ? 'selected' : ''}>Hortaliza</option>
            <option value="cereal" ${cultivo?.tipo === 'cereal' ? 'selected' : ''}>Cereal</option>
            <option value="leguminosa" ${cultivo?.tipo === 'leguminosa' ? 'selected' : ''}>Leguminosa</option>
            <option value="apicola" ${cultivo?.tipo === 'apicola' ? 'selected' : ''}>Apícola</option>
            <option value="compostaje" ${cultivo?.tipo === 'compostaje' ? 'selected' : ''}>Compostaje</option>
            <option value="otro" ${cultivo?.tipo === 'otro' ? 'selected' : ''}>Otro</option>
          </select>
        </div>
        <div class="form-group">
          <label>Unidad de producción</label>
          <select id="cult-unidad">
            ${['kg', 'racimos', 'atados', 'litros', 'unidades', 'sacos', 'quintales', 'libras', 'toneladas'].map(u =>
        `<option value="${u}" ${cultivo?.unidad_produccion === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Duración ciclo (días)</label>
          <input type="number" id="cult-dias" value="${cultivo?.ciclo_dias || ''}" placeholder="0 = perenne">
          <span class="form-hint">Dejar en 0 para cultivos perennes</span>
        </div>
        <div class="form-group">
          <label>Color</label>
          <input type="color" id="cult-color" value="${cultivo?.color || '#4CAF50'}">
        </div>
      </div>

      <div class="form-row" style="background:var(--green-50);padding:0.75rem;border-radius:var(--radius-sm);margin-bottom:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>📊 Rendimiento de referencia</label>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <input type="number" id="cult-rendimiento" step="0.01" value="${cultivo?.rendimiento_referencia || ''}" placeholder="0.00" style="flex:1;">
            <select id="cult-unidad-rend" style="flex:1.5;">
              ${YIELD_UNITS.map(u => `<option value="${u.value}" ${cultivo?.unidad_rendimiento === u.value ? 'selected' : ''}>${u.label}</option>`).join('')}
            </select>
          </div>
          <span class="form-hint">Promedio científico (ESPAC/INEC). Sirve de referencia para comparar tu producción.</span>
        </div>
      </div>

      <div class="form-group">
        <label>Descripción</label>
        <textarea id="cult-desc" placeholder="Características del cultivo">${cultivo?.descripcion || ''}</textarea>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Cultivo' : 'Nuevo Tipo de Cultivo', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-cultivo">Guardar</button>`);

    // Emoji picker logic
    const pickerBtn = document.getElementById('emoji-picker-btn');
    const pickerGrid = document.getElementById('emoji-picker-grid');
    const iconInput = document.getElementById('cult-icono');

    pickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = pickerGrid.style.display !== 'none';
      pickerGrid.style.display = isOpen ? 'none' : 'block';
    });

    pickerGrid.querySelectorAll('.emoji-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const emoji = opt.dataset.emoji;
        iconInput.value = emoji;
        pickerBtn.textContent = emoji;
        pickerGrid.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        pickerGrid.style.display = 'none';
      });
    });

    // Close picker when clicking outside
    document.addEventListener('click', function closePicker(e) {
      if (!pickerGrid.contains(e.target) && e.target !== pickerBtn) {
        pickerGrid.style.display = 'none';
      }
    });

    document.getElementById('btn-save-cultivo').addEventListener('click', async () => {
      const nombre = document.getElementById('cult-nombre').value.trim();
      if (!nombre) { App.showToast('El nombre es obligatorio', 'warning'); return; }

      const data = {
        finca_id: fincaId,
        nombre,
        icono: iconInput.value || '🌱',
        tipo: document.getElementById('cult-tipo').value,
        unidad_produccion: document.getElementById('cult-unidad').value,
        ciclo_dias: parseInt(document.getElementById('cult-dias').value) || 0,
        color: document.getElementById('cult-color').value,
        rendimiento_referencia: parseFloat(document.getElementById('cult-rendimiento').value) || null,
        unidad_rendimiento: document.getElementById('cult-unidad-rend').value || 't/ha',
        descripcion: document.getElementById('cult-desc').value.trim(),
        es_predeterminado: false
      };

      if (isEdit) await AgroDB.update('cultivos_catalogo', cultivo.id, data);
      else await AgroDB.add('cultivos_catalogo', data);

      App.closeModal();
      App.showToast('Cultivo guardado', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render, showQuickHarvest };
})();

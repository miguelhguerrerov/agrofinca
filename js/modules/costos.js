// ============================================
// AgroFinca - Costos Module
// Cost tracking: inputs, labor (hired+family),
// tools, infrastructure, transport, phytosanitary
// Smart defaults, repeat last cost
// Tabs: Costos, Proveedores, Activos
// ============================================

const CostosModule = (() => {

  const CATEGORIAS = [
    { value: 'insumo', label: 'Insumo', icon: '🌿' },
    { value: 'mano_obra_contratada', label: 'Mano de obra contratada', icon: '👷' },
    { value: 'mano_obra_familiar', label: 'Mano de obra familiar', icon: '👨‍🌾' },
    { value: 'herramienta', label: 'Herramienta', icon: '🔧' },
    { value: 'infraestructura', label: 'Infraestructura', icon: '🏗️' },
    { value: 'transporte', label: 'Transporte', icon: '🚛' },
    { value: 'fitosanitario', label: 'Fitosanitario', icon: '🧪' },
    { value: 'riego', label: 'Riego', icon: '💧' },
    { value: 'empaque', label: 'Empaque', icon: '📦' },
    { value: 'otro', label: 'Otro', icon: '📋' }
  ];

  // Variable vs Fixed cost mapping
  const VARIABLE_CATEGORIES = ['insumo', 'mano_obra_contratada', 'mano_obra_familiar', 'fitosanitario', 'empaque', 'transporte'];
  const FIXED_CATEGORIES = ['herramienta', 'infraestructura', 'riego'];

  let _lastCostDefaults = {};
  let _currentTab = 'costos';

  async function getLastCostDefaults(fincaId) {
    if (_lastCostDefaults[fincaId]) return _lastCostDefaults[fincaId];
    const costos = await AgroDB.query('costos', r => r.finca_id === fincaId);
    if (costos.length === 0) return null;
    const sorted = [...costos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const last = sorted[0];
    // Last cost per category
    const lastByCategory = {};
    sorted.forEach(c => {
      if (!lastByCategory[c.categoria]) lastByCategory[c.categoria] = c;
    });
    _lastCostDefaults[fincaId] = { last, lastByCategory };
    return _lastCostDefaults[fincaId];
  }

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📉</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    // Render tabs header
    container.innerHTML = `
      <div class="tabs-row" style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:1rem">
        <button class="tab-btn ${_currentTab === 'costos' ? 'active' : ''}" data-tab="costos">💰 Costos</button>
        <button class="tab-btn ${_currentTab === 'proveedores' ? 'active' : ''}" data-tab="proveedores">🏪 Proveedores</button>
        <button class="tab-btn ${_currentTab === 'activos' ? 'active' : ''}" data-tab="activos">🔧 Activos</button>
      </div>
      <div id="costos-tab-content"></div>
    `;

    // Bind tab clicks
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _currentTab = btn.dataset.tab;
        render(container, fincaId);
      });
    });

    const tabContent = document.getElementById('costos-tab-content');

    if (_currentTab === 'costos') {
      await renderCostosTab(tabContent, fincaId);
    } else if (_currentTab === 'proveedores') {
      await renderProveedores(tabContent, fincaId);
    } else if (_currentTab === 'activos') {
      if (typeof ActivosModule !== 'undefined' && ActivosModule.render) {
        await ActivosModule.render(tabContent, fincaId);
      } else {
        tabContent.innerHTML = '<div class="empty-state"><div class="empty-icon">🔧</div><h3>Activos</h3><p>El modulo de activos estara disponible proximamente.</p></div>';
      }
    }
  }

  async function renderCostosTab(container, fincaId) {
    const costos = await AgroDB.query('costos', r => r.finca_id === fincaId);
    const sorted = [...costos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const month = DateUtils.currentMonthRange();
    const prevMonth = DateUtils.previousMonthRange();
    const costosMes = costos.filter(c => c.fecha >= month.start && c.fecha <= month.end);
    const costosMesAnt = costos.filter(c => c.fecha >= prevMonth.start && c.fecha <= prevMonth.end);
    const totalMes = costosMes.reduce((s, c) => s + (c.total || 0), 0);
    const totalMesAnt = costosMesAnt.reduce((s, c) => s + (c.total || 0), 0);
    const totalGeneral = costos.reduce((s, c) => s + (c.total || 0), 0);

    // Delta (for costs, lower is better, so invert color)
    const delta = totalMesAnt > 0 ? ((totalMes - totalMesAnt) / totalMesAnt * 100) : (totalMes > 0 ? 100 : 0);
    const deltaIcon = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    const deltaColor = delta > 0 ? 'text-red' : delta < 0 ? 'text-green' : 'text-muted';

    // Family labor total
    const familiarTotal = costos.filter(c => c.categoria === 'mano_obra_familiar').reduce((s, c) => s + (c.total || 0), 0);
    const contratadoTotal = costos.filter(c => c.categoria === 'mano_obra_contratada').reduce((s, c) => s + (c.total || 0), 0);

    // By category
    const byCategory = {};
    costos.forEach(c => {
      const cat = c.categoria || 'otro';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += c.total || 0;
    });

    const defaults = await getLastCostDefaults(fincaId);
    const hasLastCost = !!defaults?.last;

    container.innerHTML = `
      <div class="page-header">
        <h2>📉 Costos</h2>
        <div style="display:flex;gap:8px;">
          ${hasLastCost ? `<button class="btn btn-outline btn-sm" id="btn-repeat-costo" title="Repetir último costo">🔄 Repetir</button>` : ''}
          <button class="btn btn-primary btn-sm" id="btn-new-costo">+ Nuevo Costo</button>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon red">📉</div>
          <div class="s-data">
            <div class="s-value">${Format.money(totalMes)}</div>
            <div class="s-label">Costos del mes</div>
            <div class="text-xs ${deltaColor}">${deltaIcon} ${Math.abs(delta).toFixed(0)}% vs mes anterior</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📊</div>
          <div class="s-data"><div class="s-value">${Format.money(totalGeneral)}</div><div class="s-label">Total acumulado</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">👷</div>
          <div class="s-data"><div class="s-value">${Format.money(contratadoTotal)}</div><div class="s-label">M.O. Contratada</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon brown">👨‍🌾</div>
          <div class="s-data"><div class="s-value">${Format.money(familiarTotal)}</div><div class="s-label">M.O. Familiar (valorada)</div></div>
        </div>
      </div>

      <!-- By category chart -->
      <div class="card">
        <div class="card-title">Distribución de costos</div>
        <div id="chart-costos-cat" class="chart-container"></div>
      </div>

      <!-- List with filter -->
      <div class="card">
        <div class="card-header">
          <h3>Historial de costos</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="costos-filter-cat" class="input-sm" style="width:130px;">
              <option value="">Todas</option>
              ${CATEGORIAS.map(c => `<option value="${c.value}">${c.icon} ${c.label}</option>`).join('')}
            </select>
            <input type="text" id="costos-search" placeholder="Buscar..." class="input-sm" style="width:120px;">
          </div>
        </div>
        ${sorted.length === 0 ? '<div class="empty-state"><div class="empty-icon">📉</div><h3>Sin costos registrados</h3><p>Registra tu primer costo para comenzar</p></div>' :
      `<ul class="data-list" id="costos-list">
            ${sorted.map(c => `
              <li class="data-list-item" data-cat="${c.categoria || 'otro'}" data-search="${(c.descripcion || '').toLowerCase()} ${(c.cultivo_nombre || '').toLowerCase()}">
                <div class="data-list-left">
                  <div class="data-list-title">${c.descripcion || Format.costCategory(c.categoria)}</div>
                  <div class="data-list-sub">
                    ${Format.date(c.fecha)} · ${Format.costCategory(c.categoria)}
                    ${c.cultivo_nombre ? ` · ${c.cultivo_nombre}` : ''}
                    ${c.categoria === 'mano_obra_familiar' ? ' <span class="badge badge-brown">Familiar</span>' : ''}
                  </div>
                </div>
                <div class="data-list-right">
                  <div class="data-list-value negative">${Format.money(c.total)}</div>
                  ${c.cantidad ? `<div class="text-xs text-muted">${c.cantidad} ${c.unidad || ''} × ${Format.money(c.costo_unitario)}</div>` : ''}
                  <div class="data-list-actions">
                    <button class="btn btn-sm btn-outline btn-edit-costo" data-id="${c.id}">✏️</button>
                    <button class="btn btn-sm btn-danger btn-del-costo" data-id="${c.id}">🗑</button>
                  </div>
                </div>
              </li>
            `).join('')}
          </ul>`}
      </div>
    `;

    // Chart
    const catLabels = Object.keys(byCategory).map(k => Format.costCategory(k));
    Charts.pieChart('chart-costos-cat', {
      labels: catLabels,
      values: Object.values(byCategory)
    }, { height: 200, donut: true });

    // Filters
    const filterList = () => {
      const catFilter = document.getElementById('costos-filter-cat')?.value || '';
      const q = (document.getElementById('costos-search')?.value || '').toLowerCase();
      document.querySelectorAll('#costos-list .data-list-item').forEach(li => {
        const catMatch = !catFilter || li.dataset.cat === catFilter;
        const searchMatch = !q || li.dataset.search.includes(q);
        li.style.display = (catMatch && searchMatch) ? '' : 'none';
      });
    };
    document.getElementById('costos-filter-cat')?.addEventListener('change', filterList);
    document.getElementById('costos-search')?.addEventListener('input', filterList);

    // Events
    document.getElementById('btn-new-costo')?.addEventListener('click', () => showQuickCost(fincaId));
    document.getElementById('btn-repeat-costo')?.addEventListener('click', () => repeatLastCost(fincaId));
    container.querySelectorAll('.btn-edit-costo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = await AgroDB.getById('costos', btn.dataset.id);
        showQuickCost(fincaId, c);
      });
    });
    container.querySelectorAll('.btn-del-costo').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este costo?')) {
          await AgroDB.remove('costos', btn.dataset.id);
          _lastCostDefaults[fincaId] = null;
          App.showToast('Costo eliminado', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function repeatLastCost(fincaId) {
    const defaults = await getLastCostDefaults(fincaId);
    if (!defaults?.last) { App.showToast('No hay costos previos', 'info'); return; }
    const last = defaults.last;
    const data = {
      finca_id: fincaId,
      categoria: last.categoria,
      descripcion: last.descripcion,
      cultivo_id: last.cultivo_id,
      cultivo_nombre: last.cultivo_nombre,
      ciclo_id: last.ciclo_id,
      fecha: DateUtils.today(),
      cantidad: last.cantidad,
      unidad: last.unidad,
      costo_unitario: last.costo_unitario,
      total: last.total,
      es_mano_obra_familiar: last.es_mano_obra_familiar,
      notas: '',
      registrado_por: (() => { const u = AuthModule.getUser(); return u?.nombre || u?.email || 'sistema'; })()
    };
    await AgroDB.add('costos', data);
    _lastCostDefaults[fincaId] = null;
    App.showToast('Costo repetido con fecha de hoy', 'success');
    App.refreshCurrentPage();
  }

  async function showQuickCost(fincaId, costo = null) {
    const isEdit = !!costo;
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
    const ciclos = await AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo');

    // Load areas and proveedores for the new fields
    let areas = [];
    try { areas = await AgroDB.query('areas', r => r.finca_id === fincaId); } catch(e) { /* store may not exist */ }
    let proveedores = [];
    try { proveedores = await AgroDB.query('proveedores', r => r.finca_id === fincaId && r.activo !== false); } catch(e) { /* store may not exist */ }

    // Determine default tipo_costo based on category
    const currentCat = costo?.categoria || CATEGORIAS[0].value;
    const defaultTipoCosto = costo?.tipo_costo || (FIXED_CATEGORIES.includes(currentCat) ? 'fijo' : 'variable');

    const body = `
      <div class="form-group">
        <label>Categoría *</label>
        <select id="costo-categoria">
          ${CATEGORIAS.map(c => `<option value="${c.value}" ${costo?.categoria === c.value ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
        </select>
      </div>

      <div id="labor-info" class="card" style="display:none;background:#FFF8E1;padding:0.75rem;margin-bottom:1rem;">
        <p class="text-sm">💡 <b>Mano de obra familiar:</b> Registra el valor estimado del jornal familiar aunque no se pague en efectivo. Esto es importante para conocer el costo real de producción.</p>
      </div>

      <div class="form-group">
        <label>Descripción *</label>
        <input type="text" id="costo-desc" value="${costo?.descripcion || ''}" placeholder="Ej: Compra de semillas, jornal sábado..." autofocus>
      </div>

      <!-- Quick date buttons -->
      <div class="form-group">
        <label>Fecha *</label>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <button type="button" class="btn btn-xs btn-outline date-quick" data-date="${DateUtils.today()}">Hoy</button>
          <button type="button" class="btn btn-xs btn-outline date-quick" data-date="${DateUtils.addDays(DateUtils.today(), -1)}">Ayer</button>
        </div>
        <input type="date" id="costo-fecha" value="${costo?.fecha || DateUtils.today()}">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Cantidad</label>
          <input type="number" id="costo-cantidad" step="0.1" value="${costo?.cantidad || ''}" placeholder="1">
        </div>
        <div class="form-group">
          <label>Unidad</label>
          <select id="costo-unidad">
            <option value="unidad" ${costo?.unidad === 'unidad' ? 'selected' : ''}>Unidad</option>
            <option value="jornal" ${costo?.unidad === 'jornal' ? 'selected' : ''}>Jornal (día)</option>
            <option value="hora" ${costo?.unidad === 'hora' ? 'selected' : ''}>Hora</option>
            <option value="kg" ${costo?.unidad === 'kg' ? 'selected' : ''}>kg</option>
            <option value="litro" ${costo?.unidad === 'litro' ? 'selected' : ''}>Litro</option>
            <option value="saco" ${costo?.unidad === 'saco' ? 'selected' : ''}>Saco</option>
            <option value="global" ${costo?.unidad === 'global' ? 'selected' : ''}>Global</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Costo unitario ($) *</label>
          <input type="number" id="costo-unitario" step="0.01" value="${costo?.costo_unitario || ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Total ($)</label>
          <input type="number" id="costo-total" step="0.01" value="${costo?.total || ''}" readonly style="background:#f5f5f5;">
        </div>
      </div>

      <!-- Collapsible optional fields -->
      <details id="costo-optional" ${(costo?.cultivo_id || costo?.ciclo_id || costo?.notas || costo?.tipo_costo || costo?.area_id || costo?.proveedor_id) ? 'open' : ''}>
        <summary style="cursor:pointer;font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">Campos opcionales (cultivo, ciclo, proveedor, tipo...)</summary>

        <div class="form-row">
          <div class="form-group">
            <label>Tipo de costo</label>
            <select id="costo-tipo-costo">
              <option value="variable" ${defaultTipoCosto === 'variable' ? 'selected' : ''}>Variable</option>
              <option value="fijo" ${defaultTipoCosto === 'fijo' ? 'selected' : ''}>Fijo</option>
            </select>
          </div>
          <div class="form-group">
            <label>Area</label>
            <select id="costo-area">
              <option value="">Sin area</option>
              ${areas.map(a => `<option value="${a.id}" ${costo?.area_id === a.id ? 'selected' : ''}>${a.nombre || a.id}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Proveedor</label>
          <select id="costo-proveedor">
            <option value="">Sin proveedor</option>
            ${proveedores.map(p => `<option value="${p.id}" data-nombre="${p.nombre}" ${costo?.proveedor_id === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
            <option value="__nuevo__">+ Nuevo proveedor...</option>
          </select>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Cultivo / Actividad</label>
            <select id="costo-cultivo">
              <option value="">General (toda la finca)</option>
              ${cultivos.map(c => `<option value="${c.id}" data-nombre="${c.nombre}" ${costo?.cultivo_id === c.id ? 'selected' : ''}>${c.icono || ''} ${c.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Ciclo productivo</label>
            <select id="costo-ciclo">
              <option value="">Sin ciclo específico</option>
              ${ciclos.map(c => `<option value="${c.id}" ${costo?.ciclo_id === c.id ? 'selected' : ''}>${c.cultivo_nombre} - ${c.area_nombre || ''}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Notas</label>
          <textarea id="costo-notas" placeholder="Observaciones">${costo?.notas || ''}</textarea>
        </div>
      </details>
    `;
    App.showModal(isEdit ? 'Editar Costo' : 'Registrar Costo', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-costo">Guardar</button>`);

    // Quick date buttons
    document.querySelectorAll('.date-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('costo-fecha').value = btn.dataset.date;
      });
    });

    // Show family labor info
    const catSel = document.getElementById('costo-categoria');
    const laborInfo = document.getElementById('labor-info');
    const tipoCostoSel = document.getElementById('costo-tipo-costo');

    const toggleLaborInfo = () => {
      const val = catSel.value;
      laborInfo.style.display = (val === 'mano_obra_familiar') ? 'block' : 'none';
      if (val === 'mano_obra_familiar' || val === 'mano_obra_contratada') {
        document.getElementById('costo-unidad').value = 'jornal';
      }
      // Auto-set tipo_costo based on category
      if (FIXED_CATEGORIES.includes(val)) {
        tipoCostoSel.value = 'fijo';
      } else if (VARIABLE_CATEGORIES.includes(val)) {
        tipoCostoSel.value = 'variable';
      }
    };
    catSel.addEventListener('change', toggleLaborInfo);
    toggleLaborInfo();

    // Proveedor select: handle "Nuevo proveedor" option
    const proveedorSel = document.getElementById('costo-proveedor');
    proveedorSel?.addEventListener('change', () => {
      if (proveedorSel.value === '__nuevo__') {
        proveedorSel.value = '';
        showProveedorForm(fincaId, null, async (newProv) => {
          // After creating, reload proveedores and select the new one
          let updatedProvs = [];
          try { updatedProvs = await AgroDB.query('proveedores', r => r.finca_id === fincaId && r.activo !== false); } catch(e) {}
          // Rebuild options
          let opts = '<option value="">Sin proveedor</option>';
          updatedProvs.forEach(p => {
            const sel = (newProv && p.id === newProv.id) ? 'selected' : '';
            opts += `<option value="${p.id}" data-nombre="${p.nombre}" ${sel}>${p.nombre}</option>`;
          });
          opts += '<option value="__nuevo__">+ Nuevo proveedor...</option>';
          proveedorSel.innerHTML = opts;
        });
      }
    });

    // Auto calc
    const calcTotal = () => {
      const cant = parseFloat(document.getElementById('costo-cantidad').value) || 1;
      const unit = parseFloat(document.getElementById('costo-unitario').value) || 0;
      document.getElementById('costo-total').value = (cant * unit).toFixed(2);
    };
    document.getElementById('costo-cantidad').addEventListener('input', calcTotal);
    document.getElementById('costo-unitario').addEventListener('input', calcTotal);

    document.getElementById('btn-save-costo').addEventListener('click', async () => {
      const desc = document.getElementById('costo-desc').value.trim();
      const costoUnit = parseFloat(document.getElementById('costo-unitario').value);
      if (!desc) { App.showToast('La descripción es obligatoria', 'warning'); return; }

      const cultivoSel = document.getElementById('costo-cultivo');
      const cultivoOpt = cultivoSel?.selectedOptions[0];
      const provSel = document.getElementById('costo-proveedor');
      const provOpt = provSel?.selectedOptions[0];

      const data = {
        finca_id: fincaId,
        categoria: document.getElementById('costo-categoria').value,
        descripcion: desc,
        cultivo_id: cultivoSel?.value || null,
        cultivo_nombre: cultivoSel?.value ? cultivoOpt?.dataset.nombre : null,
        ciclo_id: document.getElementById('costo-ciclo')?.value || null,
        fecha: document.getElementById('costo-fecha').value,
        cantidad: parseFloat(document.getElementById('costo-cantidad').value) || 1,
        unidad: document.getElementById('costo-unidad').value,
        costo_unitario: costoUnit || 0,
        total: parseFloat(document.getElementById('costo-total').value) || 0,
        es_mano_obra_familiar: document.getElementById('costo-categoria').value === 'mano_obra_familiar',
        tipo_costo: document.getElementById('costo-tipo-costo')?.value || 'variable',
        area_id: document.getElementById('costo-area')?.value || null,
        proveedor_id: (provSel?.value && provSel.value !== '__nuevo__') ? provSel.value : null,
        proveedor: (provSel?.value && provSel.value !== '__nuevo__' && provOpt) ? provOpt.dataset.nombre || provOpt.textContent.trim() : null,
        notas: document.getElementById('costo-notas')?.value.trim() || '',
        registrado_por: (() => { const u = AuthModule.getUser(); return u?.nombre || u?.email || 'sistema'; })()
      };

      if (isEdit) await AgroDB.update('costos', costo.id, data);
      else await AgroDB.add('costos', data);

      _lastCostDefaults[fincaId] = null;
      App.closeModal();
      App.showToast('Costo guardado', 'success');
      App.refreshCurrentPage();
    });
  }

  // ============================================
  // Proveedores
  // ============================================

  async function renderProveedores(container, fincaId) {
    let proveedores = [];
    try { proveedores = await AgroDB.query('proveedores', r => r.finca_id === fincaId && r.activo !== false); } catch(e) {}
    let costos = [];
    try { costos = await AgroDB.query('costos', r => r.finca_id === fincaId); } catch(e) {}

    const stats = proveedores.map(p => {
      const pCostos = costos.filter(c => c.proveedor_id === p.id || c.proveedor === p.nombre);
      const totalGastado = pCostos.reduce((s, c) => s + (c.total || 0), 0);
      const numCompras = pCostos.length;
      const ultimaCompra = pCostos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
      return { ...p, totalGastado, numCompras, ultimaCompra: ultimaCompra?.fecha };
    }).sort((a, b) => b.totalGastado - a.totalGastado);

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h3 style="margin:0">🏪 Proveedores</h3>
        <button class="btn btn-primary btn-sm" id="btn-new-proveedor">+ Nuevo proveedor</button>
      </div>
      ${stats.length === 0 ? '<div class="empty-state"><p>No hay proveedores registrados.</p></div>' :
        stats.map(p => `
          <div class="card" style="margin-bottom:0.5rem">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${p.nombre}</strong>
                <div class="card-subtitle">${p.tipo || 'General'} ${p.telefono ? '· 📞 ' + p.telefono : ''}</div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700">$${p.totalGastado.toFixed(2)}</div>
                <div class="card-subtitle">${p.numCompras} compras${p.ultimaCompra ? ' · Última: ' + p.ultimaCompra : ''}</div>
              </div>
            </div>
            <div style="margin-top:0.5rem">
              <button class="btn btn-xs btn-outline btn-edit-prov" data-id="${p.id}">✏️ Editar</button>
            </div>
          </div>
        `).join('')}`;

    document.getElementById('btn-new-proveedor')?.addEventListener('click', () => showProveedorForm(fincaId));
    container.querySelectorAll('.btn-edit-prov').forEach(btn => {
      btn.addEventListener('click', () => showProveedorForm(fincaId, btn.dataset.id));
    });
  }

  async function showProveedorForm(fincaId, proveedorId = null, onSaveCallback = null) {
    let prov = null;
    if (proveedorId) {
      try { prov = await AgroDB.getById('proveedores', proveedorId); } catch(e) {}
    }
    const isEdit = !!prov;

    const body = `
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" id="prov-nombre" value="${prov?.nombre || ''}" placeholder="Nombre del proveedor" autofocus>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Teléfono</label>
          <input type="tel" id="prov-telefono" value="${prov?.telefono || ''}" placeholder="Teléfono">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="prov-email" value="${prov?.email || ''}" placeholder="correo@ejemplo.com">
        </div>
      </div>
      <div class="form-group">
        <label>Ubicación</label>
        <input type="text" id="prov-ubicacion" value="${prov?.ubicacion || ''}" placeholder="Ciudad, dirección...">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="prov-tipo">
          <option value="insumos" ${prov?.tipo === 'insumos' ? 'selected' : ''}>Insumos</option>
          <option value="herramientas" ${prov?.tipo === 'herramientas' ? 'selected' : ''}>Herramientas</option>
          <option value="servicios" ${prov?.tipo === 'servicios' ? 'selected' : ''}>Servicios</option>
          <option value="transporte" ${prov?.tipo === 'transporte' ? 'selected' : ''}>Transporte</option>
          <option value="otro" ${prov?.tipo === 'otro' ? 'selected' : ''}>Otro</option>
        </select>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="prov-notas" placeholder="Observaciones sobre el proveedor">${prov?.notas || ''}</textarea>
      </div>
    `;

    App.showModal(isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-proveedor">Guardar</button>`);

    document.getElementById('btn-save-proveedor').addEventListener('click', async () => {
      const nombre = document.getElementById('prov-nombre').value.trim();
      if (!nombre) { App.showToast('El nombre es obligatorio', 'warning'); return; }

      const data = {
        finca_id: fincaId,
        nombre,
        telefono: document.getElementById('prov-telefono').value.trim() || null,
        email: document.getElementById('prov-email').value.trim() || null,
        ubicacion: document.getElementById('prov-ubicacion').value.trim() || null,
        tipo: document.getElementById('prov-tipo').value,
        notas: document.getElementById('prov-notas').value.trim() || '',
        activo: true
      };

      let saved = null;
      if (isEdit) {
        await AgroDB.update('proveedores', prov.id, data);
        saved = { ...prov, ...data };
      } else {
        const id = await AgroDB.add('proveedores', data);
        saved = { id, ...data };
      }

      App.closeModal();
      App.showToast('Proveedor guardado', 'success');

      if (onSaveCallback) {
        onSaveCallback(saved);
      } else {
        App.refreshCurrentPage();
      }
    });
  }

  // ============================================
  // Refresh active tab (for external calls)
  // ============================================
  function _refreshActiveTab() {
    App.refreshCurrentPage();
  }

  return {
    render,
    showQuickCost,
    showProveedorForm,
    get _currentTab() { return _currentTab; },
    set _currentTab(v) { _currentTab = v; },
    _refreshActiveTab
  };
})();

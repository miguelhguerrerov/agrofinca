// ============================================
// AgroFinca - Ventas Module
// Sales records, summaries, filters
// Smart defaults, repeat last sale
// Client management tab
// ============================================

const VentasModule = (() => {

  // Cache last sale per finca for smart defaults
  let _lastSaleDefaults = {};

  // Current tab state
  let _currentTab = 'ventas';

  async function getLastSaleDefaults(fincaId) {
    if (_lastSaleDefaults[fincaId]) return _lastSaleDefaults[fincaId];
    const ventas = await AgroDB.query('ventas', r => r.finca_id === fincaId);
    if (ventas.length === 0) return null;
    const sorted = [...ventas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const last = sorted[0];
    // Also get last price per product
    const priceByProduct = {};
    const buyerByProduct = {};
    sorted.forEach(v => {
      const key = v.cultivo_id || v.producto;
      if (key && !priceByProduct[key]) priceByProduct[key] = v.precio_unitario;
      if (key && !buyerByProduct[key]) buyerByProduct[key] = v.comprador;
    });
    _lastSaleDefaults[fincaId] = { last, priceByProduct, buyerByProduct, lastBuyer: last.comprador, lastPayMethod: last.forma_pago };
    return _lastSaleDefaults[fincaId];
  }

  // Get last price a specific client paid for a specific product
  async function getLastClientPrice(fincaId, clienteId, cultivoId) {
    if (!clienteId || !cultivoId) return null;
    const ventas = await AgroDB.query('ventas', r => r.finca_id === fincaId && r.cliente_id === clienteId && r.cultivo_id === cultivoId);
    if (ventas.length === 0) return null;
    const sorted = [...ventas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    return sorted[0]?.precio_unitario || null;
  }

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    container.innerHTML = `
      <div class="tabs-row" style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:1rem">
        <button class="tab-btn ${_currentTab === 'ventas' ? 'active' : ''}" data-tab="ventas">🛒 Ventas</button>
        <button class="tab-btn ${_currentTab === 'clientes' ? 'active' : ''}" data-tab="clientes">👥 Clientes</button>
      </div>
      <div id="ventas-tab-content"></div>
    `;

    // Tab switching
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _currentTab = btn.dataset.tab;
        render(container, fincaId);
      });
    });

    const tabContent = document.getElementById('ventas-tab-content');

    if (_currentTab === 'clientes') {
      await renderClientes(tabContent, fincaId);
    } else {
      await renderVentasTab(tabContent, fincaId);
    }
  }

  async function renderVentasTab(container, fincaId) {
    // Role check
    const canEdit = !AuthModule.getUserRoleInFinca || AuthModule.getUserRoleInFinca(fincaId) !== 'trabajador' || true;

    const ventas = await AgroDB.query('ventas', r => r.finca_id === fincaId);
    const sorted = [...ventas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);

    const month = DateUtils.currentMonthRange();
    const prevMonth = DateUtils.previousMonthRange();
    const ventasMes = ventas.filter(v => v.fecha >= month.start && v.fecha <= month.end);
    const ventasMesAnt = ventas.filter(v => v.fecha >= prevMonth.start && v.fecha <= prevMonth.end);
    const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
    const totalMesAnt = ventasMesAnt.reduce((s, v) => s + (v.total || 0), 0);
    const totalGeneral = ventas.reduce((s, v) => s + (v.total || 0), 0);

    // Group by product
    const byProduct = {};
    ventas.forEach(v => {
      const key = v.producto || v.cultivo_nombre || 'Otros';
      if (!byProduct[key]) byProduct[key] = { cantidad: 0, total: 0 };
      byProduct[key].cantidad += v.cantidad || 0;
      byProduct[key].total += v.total || 0;
    });

    // Delta calculation
    const delta = totalMesAnt > 0 ? ((totalMes - totalMesAnt) / totalMesAnt * 100) : (totalMes > 0 ? 100 : 0);
    const deltaIcon = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    const deltaColor = delta > 0 ? 'text-green' : delta < 0 ? 'text-red' : 'text-muted';

    // Last sale info for "repeat" button
    const defaults = await getLastSaleDefaults(fincaId);
    const hasLastSale = !!defaults?.last;

    container.innerHTML = `
      <div class="page-header">
        <h2>💰 Ventas</h2>
        <div style="display:flex;gap:8px;">
          ${hasLastSale ? `<button class="btn btn-outline btn-sm" id="btn-repeat-venta" title="Repetir última venta">🔄 Repetir</button>` : ''}
          <button class="btn btn-primary btn-sm" id="btn-new-venta">+ Nueva Venta</button>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data">
            <div class="s-value">${Format.money(totalMes)}</div>
            <div class="s-label">Ventas del mes</div>
            <div class="text-xs ${deltaColor}">${deltaIcon} ${Math.abs(delta).toFixed(0)}% vs mes anterior</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">📊</div>
          <div class="s-data"><div class="s-value">${Format.money(totalGeneral)}</div><div class="s-label">Total acumulado</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">🧾</div>
          <div class="s-data"><div class="s-value">${ventasMes.length}</div><div class="s-label">Ventas este mes</div></div>
        </div>
      </div>

      <!-- By product chart -->
      <div class="card">
        <div class="card-title">Ventas por producto</div>
        <div id="chart-ventas-producto" class="chart-container"></div>
      </div>

      <!-- Filter -->
      <div class="card">
        <div class="card-header">
          <h3>Historial de ventas</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="ventas-search" placeholder="Buscar..." class="input-sm" style="width:140px;">
          </div>
        </div>
        ${sorted.length === 0 ? '<div class="empty-state"><div class="empty-icon">💰</div><h3>Sin ventas registradas</h3><p>Registra tu primera venta para comenzar</p></div>' :
      `<ul class="data-list" id="ventas-list">
            ${sorted.map(v => `
              <li class="data-list-item" data-search="${(v.producto || v.cultivo_nombre || '').toLowerCase()} ${(v.comprador || '').toLowerCase()}">
                <div class="data-list-left">
                  <div class="data-list-title">${v.producto || v.cultivo_nombre || 'Venta'}</div>
                  <div class="data-list-sub">${Format.date(v.fecha)} · ${v.comprador || 'Sin comprador'} · ${v.forma_pago || ''}${v.cobrado === false ? ' · <span style="color:var(--danger)">Pendiente cobro</span>' : ''}</div>
                </div>
                <div class="data-list-right">
                  <div class="data-list-value positive">${Format.money(v.total)}</div>
                  <div class="text-xs text-muted">${Format.unit(v.cantidad, v.unidad)} × ${Format.money(v.precio_unitario)}</div>
                  <div class="data-list-actions">
                    <button class="btn btn-sm btn-outline btn-edit-venta" data-id="${v.id}">✏️</button>
                    <button class="btn btn-sm btn-danger btn-del-venta" data-id="${v.id}">🗑</button>
                  </div>
                </div>
              </li>
            `).join('')}
          </ul>`}
      </div>
    `;

    // Chart
    const prodLabels = Object.keys(byProduct);
    Charts.pieChart('chart-ventas-producto', {
      labels: prodLabels,
      values: prodLabels.map(k => byProduct[k].total)
    }, { title: '', height: 200, donut: true });

    // Search filter
    document.getElementById('ventas-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#ventas-list .data-list-item').forEach(li => {
        li.style.display = li.dataset.search.includes(q) ? '' : 'none';
      });
    });

    // Events
    document.getElementById('btn-new-venta')?.addEventListener('click', () => showQuickSale(fincaId));
    document.getElementById('btn-repeat-venta')?.addEventListener('click', () => repeatLastSale(fincaId));
    container.querySelectorAll('.btn-edit-venta').forEach(btn => {
      btn.addEventListener('click', async () => {
        const v = await AgroDB.getById('ventas', btn.dataset.id);
        showQuickSale(fincaId, v);
      });
    });
    container.querySelectorAll('.btn-del-venta').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta venta?')) {
          await AgroDB.remove('ventas', btn.dataset.id);
          _lastSaleDefaults[fincaId] = null;
          App.showToast('Venta eliminada', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function repeatLastSale(fincaId) {
    const defaults = await getLastSaleDefaults(fincaId);
    if (!defaults?.last) { App.showToast('No hay ventas previas', 'info'); return; }
    const last = defaults.last;
    const data = {
      finca_id: fincaId,
      cultivo_id: last.cultivo_id,
      producto: last.producto,
      cultivo_nombre: last.cultivo_nombre,
      fecha: DateUtils.today(),
      cantidad: last.cantidad,
      unidad: last.unidad,
      precio_unitario: last.precio_unitario,
      total: last.total,
      comprador: last.comprador,
      cliente_id: last.cliente_id || null,
      ciclo_id: last.ciclo_id || null,
      area_id: last.area_id || null,
      cosecha_id: last.cosecha_id || null,
      cobrado: last.cobrado !== undefined ? last.cobrado : true,
      fecha_cobro: last.fecha_cobro || null,
      forma_pago: last.forma_pago,
      notas: '',
      registrado_por: (() => { const u = AuthModule.getUser(); return u?.nombre || u?.email || 'sistema'; })()
    };
    await AgroDB.add('ventas', data);
    _lastSaleDefaults[fincaId] = null;
    App.showToast('Venta repetida con fecha de hoy', 'success');
    App.refreshCurrentPage();
  }

  async function showQuickSale(fincaId, venta = null) {
    const isEdit = !!venta;
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
    const defaults = await getLastSaleDefaults(fincaId);
    const clientes = await AgroDB.query('clientes', r => r.finca_id === fincaId && r.activo !== false);

    // Smart defaults
    const defBuyer = venta?.comprador || defaults?.lastBuyer || '';
    const defPayMethod = venta?.forma_pago || defaults?.lastPayMethod || 'efectivo';
    const defClienteId = venta?.cliente_id || '';
    const defCobrado = venta?.cobrado !== undefined ? venta.cobrado : true;
    const defFechaCobro = venta?.fecha_cobro || '';

    const body = `
      <!-- Quick date buttons -->
      <div class="form-group">
        <label>Fecha *</label>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <button type="button" class="btn btn-xs btn-outline date-quick" data-date="${DateUtils.today()}">Hoy</button>
          <button type="button" class="btn btn-xs btn-outline date-quick" data-date="${DateUtils.addDays(DateUtils.today(), -1)}">Ayer</button>
        </div>
        <input type="date" id="venta-fecha" value="${venta?.fecha || DateUtils.today()}">
      </div>
      <div class="form-group">
        <label>Cliente</label>
        <select id="venta-cliente">
          <option value="">-- Seleccionar cliente --</option>
          ${clientes.map(c => `<option value="${c.id}" ${defClienteId === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
          <option value="__nuevo__">+ Nuevo cliente</option>
        </select>
        <div id="venta-comprador-manual-group" style="display:${defClienteId ? 'none' : 'block'};margin-top:6px;">
          <input type="text" id="venta-comprador" value="${defBuyer}" placeholder="Nombre del comprador" list="compradores-list">
          <datalist id="compradores-list">${getUniqueBuyers(defaults).map(b => `<option value="${b}">`).join('')}</datalist>
        </div>
        <div id="venta-nuevo-cliente-group" style="display:none;margin-top:6px;">
          <input type="text" id="venta-nuevo-cliente-nombre" placeholder="Nombre del nuevo cliente">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Producto / Cultivo *</label>
          <select id="venta-cultivo">
            <option value="">Seleccionar...</option>
            ${cultivos.map(c => `<option value="${c.id}" data-nombre="${c.nombre}" data-unidad="${c.unidad_produccion}" ${venta?.cultivo_id === c.id ? 'selected' : ''}>${c.icono || ''} ${c.nombre}</option>`).join('')}
            <option value="otro">Otro producto...</option>
          </select>
        </div>
        <div class="form-group" id="venta-otro-group" style="display:none;">
          <label>Nombre del producto</label>
          <input type="text" id="venta-otro-nombre" value="${venta?.producto || ''}" placeholder="Nombre">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ciclo</label>
          <select id="venta-ciclo">
            <option value="">-- Sin ciclo --</option>
          </select>
        </div>
        <div class="form-group">
          <label>Área</label>
          <select id="venta-area">
            <option value="">-- Sin área --</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Cosecha vinculada</label>
        <select id="venta-cosecha">
          <option value="">-- Sin vincular --</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cantidad *</label>
          <input type="number" id="venta-cantidad" step="0.1" value="${venta?.cantidad || ''}" placeholder="0" autofocus>
        </div>
        <div class="form-group">
          <label>Unidad</label>
          <select id="venta-unidad">
            ${['kg', 'racimos', 'atados', 'litros', 'unidades', 'sacos', 'quintales', 'libras'].map(u =>
      `<option value="${u}" ${venta?.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Precio unitario ($) *</label>
          <input type="number" id="venta-precio" step="0.01" value="${venta?.precio_unitario || ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Total ($)</label>
          <input type="number" id="venta-total" step="0.01" value="${venta?.total || ''}" readonly style="background:#f5f5f5;">
        </div>
      </div>
      <!-- Payment and collection -->
      <div class="form-row">
        <div class="form-group">
          <label>Forma de pago</label>
          <select id="venta-pago">
            <option value="efectivo" ${defPayMethod === 'efectivo' ? 'selected' : ''}>Efectivo</option>
            <option value="transferencia" ${defPayMethod === 'transferencia' ? 'selected' : ''}>Transferencia</option>
            <option value="credito" ${defPayMethod === 'credito' ? 'selected' : ''}>Crédito</option>
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:1.5rem;">
          <input type="checkbox" id="venta-cobrado" ${defCobrado ? 'checked' : ''} style="width:auto;">
          <label for="venta-cobrado" style="margin:0;">Cobrado</label>
        </div>
      </div>
      <div class="form-group" id="venta-fecha-cobro-group" style="display:${defCobrado ? 'none' : 'block'};">
        <label>Fecha de cobro esperada</label>
        <input type="date" id="venta-fecha-cobro" value="${defFechaCobro}">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="venta-notas" placeholder="Observaciones">${venta?.notas || ''}</textarea>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Venta' : 'Registrar Venta', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-venta">Guardar</button>`);

    // Quick date buttons
    document.querySelectorAll('.date-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('venta-fecha').value = btn.dataset.date;
      });
    });

    // Cliente select logic
    const clienteSelect = document.getElementById('venta-cliente');
    const compradorManualGroup = document.getElementById('venta-comprador-manual-group');
    const nuevoClienteGroup = document.getElementById('venta-nuevo-cliente-group');

    clienteSelect.addEventListener('change', async () => {
      const val = clienteSelect.value;
      if (val === '__nuevo__') {
        compradorManualGroup.style.display = 'none';
        nuevoClienteGroup.style.display = 'block';
      } else if (val) {
        compradorManualGroup.style.display = 'none';
        nuevoClienteGroup.style.display = 'none';
        // Auto-fill last price for this client + selected product
        const cultivoId = document.getElementById('venta-cultivo').value;
        if (cultivoId && cultivoId !== 'otro') {
          const lastPrice = await getLastClientPrice(fincaId, val, cultivoId);
          if (lastPrice) {
            document.getElementById('venta-precio').value = lastPrice;
            calcTotal();
          }
        }
      } else {
        compradorManualGroup.style.display = 'block';
        nuevoClienteGroup.style.display = 'none';
      }
    });

    // Cobrado checkbox logic
    const cobradoCheck = document.getElementById('venta-cobrado');
    const fechaCobroGroup = document.getElementById('venta-fecha-cobro-group');

    cobradoCheck.addEventListener('change', () => {
      fechaCobroGroup.style.display = cobradoCheck.checked ? 'none' : 'block';
    });

    // Forma de pago -> auto-uncheck cobrado if credito
    document.getElementById('venta-pago').addEventListener('change', (e) => {
      if (e.target.value === 'credito') {
        cobradoCheck.checked = false;
        fechaCobroGroup.style.display = 'block';
      }
    });

    // Populate ciclos when cultivo changes
    async function populateCiclos(cultivoId) {
      const cicloSelect = document.getElementById('venta-ciclo');
      cicloSelect.innerHTML = '<option value="">-- Sin ciclo --</option>';
      if (!cultivoId || cultivoId === 'otro') return;
      try {
        const ciclos = await AgroDB.query('ciclos', r => r.finca_id === fincaId && r.cultivo_id === cultivoId && r.estado === 'activo');
        ciclos.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.nombre || `Ciclo ${c.fecha_inicio || ''}`;
          if (venta?.ciclo_id === c.id) opt.selected = true;
          cicloSelect.appendChild(opt);
        });
      } catch (e) { /* ciclos table may not exist */ }
    }

    // Populate areas
    async function populateAreas(areaIdToSelect) {
      const areaSelect = document.getElementById('venta-area');
      areaSelect.innerHTML = '<option value="">-- Sin área --</option>';
      try {
        const areas = await AgroDB.query('areas', r => r.finca_id === fincaId);
        areas.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = a.nombre || a.id;
          if (areaIdToSelect === a.id) opt.selected = true;
          areaSelect.appendChild(opt);
        });
      } catch (e) { /* areas table may not exist */ }
    }

    // Populate cosechas for selected cultivo/ciclo (last 30 days)
    async function populateCosechas(cultivoId, cicloId) {
      const cosechaSelect = document.getElementById('venta-cosecha');
      cosechaSelect.innerHTML = '<option value="">-- Sin vincular --</option>';
      if (!cultivoId || cultivoId === 'otro') return;
      try {
        const thirtyDaysAgo = DateUtils.addDays(DateUtils.today(), -30);
        const cosechas = await AgroDB.query('cosechas', r => {
          if (r.finca_id !== fincaId) return false;
          if (r.cultivo_id !== cultivoId) return false;
          if (cicloId && r.ciclo_id !== cicloId) return false;
          if (r.fecha && r.fecha < thirtyDaysAgo) return false;
          return true;
        });
        cosechas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        cosechas.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${Format.date(c.fecha)} - ${Format.unit(c.cantidad, c.unidad)}`;
          if (venta?.cosecha_id === c.id) opt.selected = true;
          cosechaSelect.appendChild(opt);
        });
      } catch (e) { /* cosechas table may not exist */ }
    }

    // Show "other product" input + smart price prefill
    document.getElementById('venta-cultivo').addEventListener('change', async (e) => {
      const show = e.target.value === 'otro';
      document.getElementById('venta-otro-group').style.display = show ? 'block' : 'none';
      if (!show) {
        const opt = e.target.selectedOptions[0];
        if (opt?.dataset.unidad) document.getElementById('venta-unidad').value = opt.dataset.unidad;
        // Prefill last price for this product
        if (defaults?.priceByProduct[e.target.value]) {
          const priceInput = document.getElementById('venta-precio');
          if (!priceInput.value) priceInput.value = defaults.priceByProduct[e.target.value];
          calcTotal();
        }
        // Prefill last buyer for this product
        if (defaults?.buyerByProduct[e.target.value]) {
          const buyerInput = document.getElementById('venta-comprador');
          if (buyerInput && !buyerInput.value) buyerInput.value = defaults.buyerByProduct[e.target.value];
        }
      }
      // Update ciclos, cosechas for new cultivo
      await populateCiclos(e.target.value);
      await populateCosechas(e.target.value, document.getElementById('venta-ciclo').value);

      // Also try client-specific price
      const clienteId = document.getElementById('venta-cliente').value;
      if (clienteId && clienteId !== '__nuevo__' && e.target.value && e.target.value !== 'otro') {
        const lastPrice = await getLastClientPrice(fincaId, clienteId, e.target.value);
        if (lastPrice) {
          document.getElementById('venta-precio').value = lastPrice;
          calcTotal();
        }
      }
    });

    // Ciclo change -> auto-set area + update cosechas
    document.getElementById('venta-ciclo').addEventListener('change', async (e) => {
      const cicloId = e.target.value;
      if (cicloId) {
        try {
          const ciclo = await AgroDB.getById('ciclos', cicloId);
          if (ciclo?.area_id) {
            await populateAreas(ciclo.area_id);
          }
        } catch (e) { /* ignore */ }
      }
      const cultivoId = document.getElementById('venta-cultivo').value;
      await populateCosechas(cultivoId, cicloId);
    });

    // Auto-calculate total
    const calcTotal = () => {
      const cant = parseFloat(document.getElementById('venta-cantidad').value) || 0;
      const precio = parseFloat(document.getElementById('venta-precio').value) || 0;
      document.getElementById('venta-total').value = (cant * precio).toFixed(2);
    };
    document.getElementById('venta-cantidad').addEventListener('input', calcTotal);
    document.getElementById('venta-precio').addEventListener('input', calcTotal);

    // Initialize dependent selects if editing
    const initialCultivo = document.getElementById('venta-cultivo').value;
    if (initialCultivo && initialCultivo !== 'otro') {
      await populateCiclos(initialCultivo);
      const initialCiclo = document.getElementById('venta-ciclo').value;
      await populateCosechas(initialCultivo, initialCiclo);
    }
    await populateAreas(venta?.area_id || '');

    document.getElementById('btn-save-venta').addEventListener('click', async () => {
      const cantidad = parseFloat(document.getElementById('venta-cantidad').value);
      const precio = parseFloat(document.getElementById('venta-precio').value);
      if (!cantidad || !precio) { App.showToast('Cantidad y precio son obligatorios', 'warning'); return; }

      const cultivoSel = document.getElementById('venta-cultivo');
      const cultivoOpt = cultivoSel.selectedOptions[0];
      const producto = cultivoSel.value === 'otro'
        ? document.getElementById('venta-otro-nombre').value.trim()
        : cultivoOpt?.dataset.nombre || '';

      // Resolve cliente and comprador
      const clienteVal = document.getElementById('venta-cliente').value;
      let cliente_id = null;
      let comprador = '';

      if (clienteVal === '__nuevo__') {
        // Create new client inline
        const nuevoNombre = document.getElementById('venta-nuevo-cliente-nombre').value.trim();
        if (nuevoNombre) {
          const nuevoCliente = await AgroDB.add('clientes', {
            finca_id: fincaId,
            nombre: nuevoNombre,
            tipo: 'General',
            activo: true
          });
          cliente_id = nuevoCliente.id || nuevoCliente;
          comprador = nuevoNombre;
        }
      } else if (clienteVal) {
        cliente_id = clienteVal;
        const clienteOpt = document.getElementById('venta-cliente').selectedOptions[0];
        comprador = clienteOpt?.textContent || '';
      } else {
        comprador = document.getElementById('venta-comprador').value.trim();
      }

      const cobrado = document.getElementById('venta-cobrado').checked;

      const user = AuthModule.getUser();
      const data = {
        finca_id: fincaId,
        cultivo_id: cultivoSel.value !== 'otro' ? cultivoSel.value : null,
        producto,
        cultivo_nombre: producto,
        fecha: document.getElementById('venta-fecha').value,
        cantidad,
        unidad: document.getElementById('venta-unidad').value,
        precio_unitario: precio,
        total: parseFloat(document.getElementById('venta-total').value) || cantidad * precio,
        cliente_id: cliente_id,
        comprador: comprador,
        forma_pago: document.getElementById('venta-pago').value,
        ciclo_id: document.getElementById('venta-ciclo').value || null,
        area_id: document.getElementById('venta-area').value || null,
        cosecha_id: document.getElementById('venta-cosecha').value || null,
        cobrado: cobrado,
        fecha_cobro: !cobrado ? (document.getElementById('venta-fecha-cobro').value || null) : null,
        notas: document.getElementById('venta-notas').value.trim(),
        registrado_por: user?.nombre || user?.email || 'sistema'
      };

      if (isEdit) await AgroDB.update('ventas', venta.id, data);
      else await AgroDB.add('ventas', data);

      _lastSaleDefaults[fincaId] = null; // invalidate cache
      App.closeModal();
      App.showToast('Venta guardada', 'success');
      App.refreshCurrentPage();
    });
  }

  function getUniqueBuyers(defaults) {
    if (!defaults?.last) return [];
    // Collect from cache - we'd need all ventas but we just use the buyer from last
    const buyers = new Set();
    if (defaults.lastBuyer) buyers.add(defaults.lastBuyer);
    Object.values(defaults.buyerByProduct || {}).forEach(b => { if (b) buyers.add(b); });
    return [...buyers];
  }

  // ============================================
  // Clientes Tab
  // ============================================

  async function renderClientes(container, fincaId) {
    const clientes = await AgroDB.query('clientes', r => r.finca_id === fincaId && r.activo !== false);
    const ventas = await AgroDB.query('ventas', r => r.finca_id === fincaId);

    const stats = clientes.map(c => {
      const cVentas = ventas.filter(v => v.cliente_id === c.id || v.comprador === c.nombre);
      const totalComprado = cVentas.reduce((s, v) => s + (v.total || 0), 0);
      const numCompras = cVentas.length;
      const ultimaCompra = cVentas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
      const pendienteCobro = cVentas.filter(v => v.cobrado === false).reduce((s, v) => s + (v.total || 0), 0);

      // Average price per unit (for "who pays best")
      const cantTotal = cVentas.reduce((s, v) => s + (v.cantidad || 0), 0);
      const precioPromedio = cantTotal > 0 ? totalComprado / cantTotal : 0;

      // Frequency (avg days between purchases)
      const fechas = cVentas.map(v => v.fecha).filter(f => f).sort();
      let frecuenciaDias = null;
      if (fechas.length >= 2) {
        const diffs = [];
        for (let i = 1; i < fechas.length; i++) {
          diffs.push((new Date(fechas[i]) - new Date(fechas[i - 1])) / 86400000);
        }
        frecuenciaDias = Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
      }

      return { ...c, totalComprado, numCompras, ultimaCompra: ultimaCompra?.fecha, pendienteCobro, precioPromedio, frecuenciaDias };
    }).sort((a, b) => b.totalComprado - a.totalComprado);

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h3 style="margin:0">👥 Clientes</h3>
        <button class="btn btn-primary btn-sm" id="btn-new-cliente">+ Nuevo cliente</button>
      </div>
      ${stats.length === 0 ? '<div class="empty-state"><p>No hay clientes registrados.</p></div>' :
        stats.map(c => `
          <div class="card" style="margin-bottom:0.5rem">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${c.nombre}</strong>
                <div class="card-subtitle">${c.tipo || 'General'} ${c.telefono ? '· 📞 ' + c.telefono : ''}${c.frecuenciaDias ? ' · Cada ~' + c.frecuenciaDias + ' días' : ''}</div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700">$${c.totalComprado.toFixed(2)}</div>
                <div class="card-subtitle">${c.numCompras} compras${c.pendienteCobro > 0 ? ' · <span style="color:var(--danger)">Debe: $' + c.pendienteCobro.toFixed(2) + '</span>' : ''}</div>
              </div>
            </div>
            <div style="margin-top:0.5rem">
              <button class="btn btn-xs btn-outline btn-edit-cliente" data-id="${c.id}">✏️ Editar</button>
            </div>
          </div>
        `).join('')}`;

    document.getElementById('btn-new-cliente')?.addEventListener('click', () => showClienteForm(fincaId));
    container.querySelectorAll('.btn-edit-cliente').forEach(btn => {
      btn.addEventListener('click', () => showClienteForm(fincaId, btn.dataset.id));
    });
  }

  async function showClienteForm(fincaId, clienteId = null) {
    const isEdit = !!clienteId;
    let cliente = null;
    if (isEdit) {
      cliente = await AgroDB.getById('clientes', clienteId);
    }

    const tiposCliente = ['mayorista', 'minorista', 'intermediario', 'consumidor_final', 'otro'];

    const body = `
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" id="cliente-nombre" value="${cliente?.nombre || ''}" placeholder="Nombre del cliente">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Teléfono</label>
          <input type="tel" id="cliente-telefono" value="${cliente?.telefono || ''}" placeholder="Teléfono">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="cliente-email" value="${cliente?.email || ''}" placeholder="Email">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ubicación</label>
          <input type="text" id="cliente-ubicacion" value="${cliente?.ubicacion || ''}" placeholder="Ciudad, zona...">
        </div>
        <div class="form-group">
          <label>Tipo</label>
          <select id="cliente-tipo">
            ${tiposCliente.map(t => `<option value="${t}" ${cliente?.tipo === t ? 'selected' : ''}>${t.replace('_', ' ')}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="cliente-notas" placeholder="Observaciones">${cliente?.notas || ''}</textarea>
      </div>
      ${isEdit ? `
        <div class="form-group" style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--gray-200);">
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="cliente-inactivo" style="width:auto;" ${cliente?.activo === false ? 'checked' : ''}>
            Marcar como inactivo
          </label>
        </div>
      ` : ''}
    `;

    App.showModal(isEdit ? 'Editar Cliente' : 'Nuevo Cliente', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-cliente">Guardar</button>`);

    document.getElementById('btn-save-cliente').addEventListener('click', async () => {
      const nombre = document.getElementById('cliente-nombre').value.trim();
      if (!nombre) { App.showToast('El nombre es obligatorio', 'warning'); return; }

      const data = {
        finca_id: fincaId,
        nombre,
        telefono: document.getElementById('cliente-telefono').value.trim(),
        email: document.getElementById('cliente-email').value.trim(),
        ubicacion: document.getElementById('cliente-ubicacion').value.trim(),
        tipo: document.getElementById('cliente-tipo').value,
        notas: document.getElementById('cliente-notas').value.trim(),
        activo: isEdit ? !document.getElementById('cliente-inactivo')?.checked : true
      };

      if (isEdit) await AgroDB.update('clientes', clienteId, data);
      else await AgroDB.add('clientes', data);

      App.closeModal();
      App.showToast(isEdit ? 'Cliente actualizado' : 'Cliente registrado', 'success');
      App.refreshCurrentPage();
    });
  }

  function _refreshActiveTab() {
    App.refreshCurrentPage();
  }

  return {
    render,
    showQuickSale,
    showClienteForm,
    get _currentTab() { return _currentTab; },
    _refreshActiveTab
  };
})();

// ============================================
// AgroFinca - Ventas Module
// Sales records, summaries, filters
// Smart defaults, repeat last sale
// ============================================

const VentasModule = (() => {

  // Cache last sale per finca for smart defaults
  let _lastSaleDefaults = {};

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

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><h3>Selecciona una finca</h3></div>';
      return;
    }

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
                  <div class="data-list-sub">${Format.date(v.fecha)} · ${v.comprador || 'Sin comprador'} · ${v.forma_pago || ''}</div>
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

    // Smart defaults
    const defBuyer = venta?.comprador || defaults?.lastBuyer || '';
    const defPayMethod = venta?.forma_pago || defaults?.lastPayMethod || 'efectivo';

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
      <!-- Collapsible optional fields -->
      <details id="venta-optional" ${(venta?.comprador || venta?.notas) ? 'open' : ''}>
        <summary style="cursor:pointer;font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">Campos opcionales (comprador, notas...)</summary>
        <div class="form-row">
          <div class="form-group">
            <label>Comprador</label>
            <input type="text" id="venta-comprador" value="${defBuyer}" placeholder="Nombre del comprador" list="compradores-list">
            <datalist id="compradores-list">${getUniqueBuyers(defaults).map(b => `<option value="${b}">`).join('')}</datalist>
          </div>
          <div class="form-group">
            <label>Forma de pago</label>
            <select id="venta-pago">
              <option value="efectivo" ${defPayMethod === 'efectivo' ? 'selected' : ''}>Efectivo</option>
              <option value="transferencia" ${defPayMethod === 'transferencia' ? 'selected' : ''}>Transferencia</option>
              <option value="credito" ${defPayMethod === 'credito' ? 'selected' : ''}>Crédito</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Notas</label>
          <textarea id="venta-notas" placeholder="Observaciones">${venta?.notas || ''}</textarea>
        </div>
      </details>
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

    // Show "other product" input + smart price prefill
    document.getElementById('venta-cultivo').addEventListener('change', (e) => {
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
          if (!buyerInput.value) buyerInput.value = defaults.buyerByProduct[e.target.value];
        }
      }
    });

    // Auto-calculate total
    const calcTotal = () => {
      const cant = parseFloat(document.getElementById('venta-cantidad').value) || 0;
      const precio = parseFloat(document.getElementById('venta-precio').value) || 0;
      document.getElementById('venta-total').value = (cant * precio).toFixed(2);
    };
    document.getElementById('venta-cantidad').addEventListener('input', calcTotal);
    document.getElementById('venta-precio').addEventListener('input', calcTotal);

    document.getElementById('btn-save-venta').addEventListener('click', async () => {
      const cantidad = parseFloat(document.getElementById('venta-cantidad').value);
      const precio = parseFloat(document.getElementById('venta-precio').value);
      if (!cantidad || !precio) { App.showToast('Cantidad y precio son obligatorios', 'warning'); return; }

      const cultivoSel = document.getElementById('venta-cultivo');
      const cultivoOpt = cultivoSel.selectedOptions[0];
      const producto = cultivoSel.value === 'otro'
        ? document.getElementById('venta-otro-nombre').value.trim()
        : cultivoOpt?.dataset.nombre || '';

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
        comprador: document.getElementById('venta-comprador').value.trim(),
        forma_pago: document.getElementById('venta-pago').value,
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

  return { render, showQuickSale };
})();

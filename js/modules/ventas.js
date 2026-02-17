// ============================================
// AgroFinca - Ventas Module
// Sales records, summaries, filters
// ============================================

const VentasModule = (() => {

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const ventas = await AgroDB.query('ventas', r => r.finca_id === fincaId);
    const sorted = [...ventas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);

    const month = DateUtils.currentMonthRange();
    const ventasMes = ventas.filter(v => v.fecha >= month.start && v.fecha <= month.end);
    const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
    const totalGeneral = ventas.reduce((s, v) => s + (v.total || 0), 0);

    // Group by product
    const byProduct = {};
    ventas.forEach(v => {
      const key = v.producto || v.cultivo_nombre || 'Otros';
      if (!byProduct[key]) byProduct[key] = { cantidad: 0, total: 0 };
      byProduct[key].cantidad += v.cantidad || 0;
      byProduct[key].total += v.total || 0;
    });

    container.innerHTML = `
      <div class="page-header">
        <h2>💰 Ventas</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-venta">+ Nueva Venta</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data"><div class="s-value">${Format.money(totalMes)}</div><div class="s-label">Ventas del mes</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">📊</div>
          <div class="s-data"><div class="s-value">${Format.money(totalGeneral)}</div><div class="s-label">Total acumulado</div></div>
        </div>
      </div>

      <!-- By product chart -->
      <div class="card">
        <div class="card-title">Ventas por producto</div>
        <div id="chart-ventas-producto" class="chart-container"></div>
      </div>

      <!-- List -->
      <div class="card">
        <div class="card-header"><h3>Historial de ventas</h3></div>
        ${sorted.length === 0 ? '<div class="empty-state"><h3>Sin ventas registradas</h3></div>' :
      `<ul class="data-list">
            ${sorted.map(v => `
              <li class="data-list-item">
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

    // Events
    document.getElementById('btn-new-venta')?.addEventListener('click', () => showQuickSale(fincaId));
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
          App.showToast('Venta eliminada', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function showQuickSale(fincaId, venta = null) {
    const isEdit = !!venta;
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);

    const body = `
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
      <div class="form-group">
        <label>Fecha *</label>
        <input type="date" id="venta-fecha" value="${venta?.fecha || DateUtils.today()}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cantidad *</label>
          <input type="number" id="venta-cantidad" step="0.1" value="${venta?.cantidad || ''}" placeholder="0">
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
      <div class="form-row">
        <div class="form-group">
          <label>Comprador</label>
          <input type="text" id="venta-comprador" value="${venta?.comprador || ''}" placeholder="Nombre del comprador">
        </div>
        <div class="form-group">
          <label>Forma de pago</label>
          <select id="venta-pago">
            <option value="efectivo" ${venta?.forma_pago === 'efectivo' ? 'selected' : ''}>Efectivo</option>
            <option value="transferencia" ${venta?.forma_pago === 'transferencia' ? 'selected' : ''}>Transferencia</option>
            <option value="credito" ${venta?.forma_pago === 'credito' ? 'selected' : ''}>Crédito</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="venta-notas" placeholder="Observaciones">${venta?.notas || ''}</textarea>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Venta' : 'Registrar Venta', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-venta">Guardar</button>`);

    // Show "other product" input
    document.getElementById('venta-cultivo').addEventListener('change', (e) => {
      const show = e.target.value === 'otro';
      document.getElementById('venta-otro-group').style.display = show ? 'block' : 'none';
      if (!show) {
        const opt = e.target.selectedOptions[0];
        if (opt?.dataset.unidad) document.getElementById('venta-unidad').value = opt.dataset.unidad;
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

      App.closeModal();
      App.showToast('Venta guardada', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render, showQuickSale };
})();

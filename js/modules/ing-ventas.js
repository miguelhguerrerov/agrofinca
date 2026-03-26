// ============================================
// AgroFinca - Ingeniero Ventas de Insumos Module
// Sales of products to affiliated farmers,
// credit tracking, collection management
// ============================================

const IngVentasModule = (() => {

  let _currentTab = 'ventas';
  let _filterAgricultor = '';
  let _filterFechaDesde = '';
  let _filterFechaHasta = '';

  // ── Render entry point ──────────────────────
  async function render(container) {
    const userId = AuthModule.getUserId();

    container.innerHTML = `
      <div class="tabs-row" style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:1rem">
        <button class="tab-btn ${_currentTab === 'ventas' ? 'active' : ''}" data-tab="ventas">🛒 Ventas</button>
        <button class="tab-btn ${_currentTab === 'pendientes' ? 'active' : ''}" data-tab="pendientes">⏳ Pendientes de cobro</button>
      </div>
      <div id="ing-ventas-tab-content"></div>
    `;

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _currentTab = btn.dataset.tab;
        render(container);
      });
    });

    const tabContent = document.getElementById('ing-ventas-tab-content');

    if (_currentTab === 'pendientes') {
      await renderPendientes(tabContent, userId);
    } else {
      await renderVentasTab(tabContent, userId);
    }
  }

  // ── Tab: Ventas ─────────────────────────────
  async function renderVentasTab(container, userId) {
    const ventas = await AgroDB.query('ventas_insumos', r => r.ingeniero_id === userId);
    const sorted = [...ventas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    // Load agricultor names
    const afiliaciones = await AgroDB.query('ingeniero_agricultores',
      r => r.ingeniero_id === userId && r.estado === 'activo'
    );
    const agricultorIds = [...new Set(afiliaciones.map(a => a.agricultor_id))];
    const agricultorNames = {};
    for (const agId of agricultorIds) {
      const profile = await AgroDB.getById('user_profiles', agId);
      if (profile) agricultorNames[agId] = profile.nombre || profile.email || agId;
    }

    // Monthly summary
    const month = DateUtils.currentMonthRange();
    const ventasMes = ventas.filter(v => v.fecha >= month.start && v.fecha <= month.end);
    const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
    const totalPendiente = ventas.filter(v => !v.cobrado).reduce((s, v) => s + (v.total || 0), 0);

    // Apply filters
    let filtered = sorted;
    if (_filterAgricultor) {
      filtered = filtered.filter(v => v.agricultor_id === _filterAgricultor);
    }
    if (_filterFechaDesde) {
      filtered = filtered.filter(v => v.fecha >= _filterFechaDesde);
    }
    if (_filterFechaHasta) {
      filtered = filtered.filter(v => v.fecha <= _filterFechaHasta);
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>🛒 Ventas de Insumos</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-ing-venta">+ Nueva venta</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data">
            <div class="s-value">${Format.money(totalMes)}</div>
            <div class="s-label">Vendido este mes</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">⏳</div>
          <div class="s-data">
            <div class="s-value">${Format.money(totalPendiente)}</div>
            <div class="s-label">Pendiente de cobro</div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card">
        <div class="card-header">
          <h3>Historial de ventas</h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <select id="ing-ventas-filter-agri" class="input-sm" style="width:160px;">
              <option value="">Todos los agricultores</option>
              ${agricultorIds.map(id => `<option value="${id}" ${_filterAgricultor === id ? 'selected' : ''}>${agricultorNames[id] || id}</option>`).join('')}
            </select>
            <input type="date" id="ing-ventas-desde" class="input-sm" style="width:130px;" value="${_filterFechaDesde}" placeholder="Desde">
            <input type="date" id="ing-ventas-hasta" class="input-sm" style="width:130px;" value="${_filterFechaHasta}" placeholder="Hasta">
          </div>
        </div>

        ${filtered.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🛒</div><h3>Sin ventas registradas</h3><p>Registra tu primera venta de insumos</p></div>'
          : `<ul class="data-list" id="ing-ventas-list">
              ${filtered.map(v => {
                const agrName = agricultorNames[v.agricultor_id] || 'Agricultor';
                return `
                  <li class="data-list-item">
                    <div class="data-list-left">
                      <div class="data-list-title">${agrName}</div>
                      <div class="data-list-sub">
                        ${Format.date(v.fecha)} &middot; ${v.forma_pago || 'efectivo'}
                        ${v.cobrado
                          ? ' &middot; <span class="badge" style="background:#e8f5e9;color:#2e7d32;">Cobrado</span>'
                          : ' &middot; <span class="badge" style="background:#fdecea;color:#c62828;">Pendiente</span>'}
                      </div>
                    </div>
                    <div class="data-list-right">
                      <div class="data-list-value">${Format.money(v.total || 0)}</div>
                      <div class="data-list-actions">
                        <button class="btn btn-sm btn-outline btn-view-venta" data-id="${v.id}" title="Ver detalle">👁</button>
                        <button class="btn btn-sm btn-danger btn-del-ing-venta" data-id="${v.id}">🗑</button>
                      </div>
                    </div>
                  </li>
                `;
              }).join('')}
            </ul>`
        }
      </div>
    `;

    // Filter events
    document.getElementById('ing-ventas-filter-agri')?.addEventListener('change', (e) => {
      _filterAgricultor = e.target.value;
      renderVentasTab(container, userId);
    });
    document.getElementById('ing-ventas-desde')?.addEventListener('change', (e) => {
      _filterFechaDesde = e.target.value;
      renderVentasTab(container, userId);
    });
    document.getElementById('ing-ventas-hasta')?.addEventListener('change', (e) => {
      _filterFechaHasta = e.target.value;
      renderVentasTab(container, userId);
    });

    // New venta
    document.getElementById('btn-new-ing-venta')?.addEventListener('click', () => showVentaForm(container, userId));

    // View detail
    container.querySelectorAll('.btn-view-venta').forEach(btn => {
      btn.addEventListener('click', async () => {
        const v = await AgroDB.getById('ventas_insumos', btn.dataset.id);
        if (v) await showVentaDetalle(v, agricultorNames);
      });
    });

    // Delete
    container.querySelectorAll('.btn-del-ing-venta').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta venta?')) {
          // Restore stock for each detail line
          try {
            const detalles = await AgroDB.query('ventas_insumos_detalle', r => r.venta_id === btn.dataset.id);
            for (const d of detalles) {
              if (d.producto_id) {
                const prod = await AgroDB.getById('productos_ingeniero', d.producto_id);
                if (prod) {
                  await AgroDB.update('productos_ingeniero', prod.id, { stock: (prod.stock || 0) + (d.cantidad || 0) });
                }
              }
              await AgroDB.remove('ventas_insumos_detalle', d.id);
            }
          } catch (e) { /* detalles store may not exist yet */ }

          await AgroDB.remove('ventas_insumos', btn.dataset.id);
          App.showToast('Venta eliminada', 'success');
          render(container);
        }
      });
    });
  }

  // ── View sale detail ────────────────────────
  async function showVentaDetalle(venta, agricultorNames) {
    let detalles = [];
    try { detalles = await AgroDB.query('ventas_insumos_detalle', r => r.venta_id === venta.id); } catch(e) {}

    const agrName = agricultorNames[venta.agricultor_id] || 'Agricultor';
    const body = `
      <div style="margin-bottom:1rem;">
        <strong>Agricultor:</strong> ${agrName}<br>
        <strong>Fecha:</strong> ${Format.date(venta.fecha)}<br>
        <strong>Forma de pago:</strong> ${venta.forma_pago || 'efectivo'}<br>
        <strong>Estado:</strong> ${venta.cobrado ? 'Cobrado' : 'Pendiente de cobro'}<br>
        ${venta.notas ? `<strong>Notas:</strong> ${venta.notas}` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
        <thead>
          <tr style="border-bottom:2px solid var(--gray-200);">
            <th style="text-align:left;padding:6px;">Producto</th>
            <th style="text-align:right;padding:6px;">Cant.</th>
            <th style="text-align:right;padding:6px;">P. Unit.</th>
            <th style="text-align:right;padding:6px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${detalles.map(d => `
            <tr style="border-bottom:1px solid var(--gray-100);">
              <td style="padding:6px;">${d.producto_nombre || 'Producto'}</td>
              <td style="text-align:right;padding:6px;">${d.cantidad || 0}</td>
              <td style="text-align:right;padding:6px;">${Format.money(d.precio_unitario || 0)}</td>
              <td style="text-align:right;padding:6px;">${Format.money(d.total || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--gray-300);font-weight:bold;">
            <td colspan="3" style="padding:6px;text-align:right;">Total:</td>
            <td style="text-align:right;padding:6px;">${Format.money(venta.total || 0)}</td>
          </tr>
        </tfoot>
      </table>
    `;

    App.showModal('Detalle de Venta', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cerrar</button>`
    );
  }

  // ── Tab: Pendientes de cobro ────────────────
  async function renderPendientes(container, userId) {
    const ventas = await AgroDB.query('ventas_insumos', r => r.ingeniero_id === userId && !r.cobrado);
    const sorted = [...ventas].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

    // Load agricultor names
    const agricultorNames = {};
    for (const v of ventas) {
      if (v.agricultor_id && !agricultorNames[v.agricultor_id]) {
        const profile = await AgroDB.getById('user_profiles', v.agricultor_id);
        if (profile) agricultorNames[v.agricultor_id] = profile.nombre || profile.email || v.agricultor_id;
      }
    }

    const totalPendiente = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const today = DateUtils.today();

    container.innerHTML = `
      <div class="page-header">
        <h2>⏳ Pendientes de cobro</h2>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon red">💸</div>
          <div class="s-data">
            <div class="s-value">${Format.money(totalPendiente)}</div>
            <div class="s-label">Total pendiente</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">🧾</div>
          <div class="s-data">
            <div class="s-value">${ventas.length}</div>
            <div class="s-label">Ventas pendientes</div>
          </div>
        </div>
      </div>

      <div class="card">
        ${sorted.length === 0
          ? '<div class="empty-state"><div class="empty-icon">✅</div><h3>Sin pendientes</h3><p>Todas las ventas estan cobradas</p></div>'
          : `<ul class="data-list" id="pendientes-list">
              ${sorted.map(v => {
                const agrName = agricultorNames[v.agricultor_id] || 'Agricultor';
                const diasTranscurridos = Math.floor((new Date(today) - new Date(v.fecha)) / (1000 * 60 * 60 * 24));
                const diasColor = diasTranscurridos > 30 ? 'color:var(--danger)' : diasTranscurridos > 15 ? 'color:#f9a825' : '';
                return `
                  <li class="data-list-item">
                    <div class="data-list-left">
                      <div class="data-list-title">${agrName}</div>
                      <div class="data-list-sub">
                        ${Format.date(v.fecha)} &middot;
                        <span style="${diasColor};font-weight:600;">${diasTranscurridos} dias</span>
                      </div>
                    </div>
                    <div class="data-list-right">
                      <div class="data-list-value" style="color:var(--danger)">${Format.money(v.total || 0)}</div>
                      <div class="data-list-actions">
                        <button class="btn btn-sm btn-primary btn-cobrar" data-id="${v.id}">✅ Cobrar</button>
                      </div>
                    </div>
                  </li>
                `;
              }).join('')}
            </ul>`
        }
      </div>
    `;

    // Mark as collected
    container.querySelectorAll('.btn-cobrar').forEach(btn => {
      btn.addEventListener('click', async () => {
        await AgroDB.update('ventas_insumos', btn.dataset.id, {
          cobrado: true,
          fecha_cobro: DateUtils.today()
        });
        App.showToast('Venta marcada como cobrada', 'success');
        render(container.closest('[id]')?.parentElement || container);
      });
    });
  }

  // ── Sale Form (modal) ──────────────────────
  async function showVentaForm(container, userId) {
    // Load affiliated farmers
    const afiliaciones = await AgroDB.query('ingeniero_agricultores',
      r => r.ingeniero_id === userId && r.estado === 'activo'
    );
    const agricultorIds = [...new Set(afiliaciones.map(a => a.agricultor_id))];
    const agricultores = [];
    for (const agId of agricultorIds) {
      const profile = await AgroDB.getById('user_profiles', agId);
      if (profile) agricultores.push({ id: agId, nombre: profile.nombre || profile.email || agId });
    }

    // Load products
    const productos = await AgroDB.query('productos_ingeniero', r => r.ingeniero_id === userId);

    let lineCount = 1;

    const buildLineHTML = (idx) => `
      <div class="venta-line" data-line="${idx}" style="display:flex;gap:6px;align-items:flex-end;margin-bottom:8px;padding:8px;background:var(--gray-50);border-radius:8px;">
        <div style="flex:2;">
          <label style="font-size:0.75rem;">Producto</label>
          <select class="line-producto" data-line="${idx}" style="width:100%;">
            <option value="">Seleccionar...</option>
            ${productos.map(p => `<option value="${p.id}" data-nombre="${p.nombre}" data-precio="${p.precio || 0}" data-stock="${p.stock || 0}">${p.nombre} (stock: ${p.stock || 0})</option>`).join('')}
          </select>
        </div>
        <div style="flex:1;">
          <label style="font-size:0.75rem;">Cantidad</label>
          <input type="number" class="line-cantidad" data-line="${idx}" step="0.1" min="0" placeholder="0" style="width:100%;">
        </div>
        <div style="flex:1;">
          <label style="font-size:0.75rem;">P. Unit.</label>
          <input type="number" class="line-precio" data-line="${idx}" step="0.01" placeholder="0.00" style="width:100%;">
        </div>
        <div style="flex:1;">
          <label style="font-size:0.75rem;">Total</label>
          <input type="number" class="line-total" data-line="${idx}" readonly style="width:100%;background:#f5f5f5;">
        </div>
        <button type="button" class="btn btn-sm btn-danger btn-remove-line" data-line="${idx}" style="margin-bottom:2px;" ${idx === 0 ? 'disabled' : ''}>✕</button>
      </div>
    `;

    const body = `
      <div class="form-group">
        <label>Agricultor *</label>
        <select id="ing-venta-agricultor">
          <option value="">-- Seleccionar agricultor --</option>
          ${agricultores.map(a => `<option value="${a.id}">${a.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Finca (opcional)</label>
        <select id="ing-venta-finca">
          <option value="">-- Sin finca --</option>
        </select>
      </div>
      <div class="form-group">
        <label>Fecha *</label>
        <input type="date" id="ing-venta-fecha" value="${DateUtils.today()}">
      </div>

      <div style="margin:1rem 0 0.5rem;font-weight:600;">Detalle de productos</div>
      <div id="ing-venta-lines">
        ${buildLineHTML(0)}
      </div>
      <button type="button" class="btn btn-outline btn-sm" id="btn-add-line" style="margin-bottom:1rem;">+ Agregar producto</button>

      <div class="form-row" style="align-items:center;">
        <div class="form-group" style="flex:1;">
          <label>Total general ($)</label>
          <input type="number" id="ing-venta-total" readonly style="background:#f5f5f5;font-weight:bold;font-size:1.1rem;" value="0.00">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Forma de pago</label>
          <select id="ing-venta-pago">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="credito">Credito</option>
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:1.5rem;">
          <input type="checkbox" id="ing-venta-cobrado" checked style="width:auto;">
          <label for="ing-venta-cobrado" style="margin:0;">Cobrado</label>
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="ing-venta-notas" placeholder="Observaciones"></textarea>
      </div>
    `;

    App.showModal('Nueva Venta de Insumos', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-ing-venta">Guardar</button>`
    );

    // Load fincas when agricultor changes
    document.getElementById('ing-venta-agricultor')?.addEventListener('change', async (e) => {
      const agId = e.target.value;
      const fincaSel = document.getElementById('ing-venta-finca');
      fincaSel.innerHTML = '<option value="">-- Sin finca --</option>';
      if (agId) {
        const fincas = await AgroDB.getByIndex('fincas', 'propietario_id', agId);
        fincas.forEach(f => {
          fincaSel.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
        });
      }
    });

    // Auto-set credito as not collected
    document.getElementById('ing-venta-pago')?.addEventListener('change', (e) => {
      if (e.target.value === 'credito') {
        document.getElementById('ing-venta-cobrado').checked = false;
      }
    });

    // Line calculation helper
    const recalcTotals = () => {
      let grandTotal = 0;
      document.querySelectorAll('.venta-line').forEach(line => {
        const idx = line.dataset.line;
        const cant = parseFloat(line.querySelector('.line-cantidad')?.value) || 0;
        const precio = parseFloat(line.querySelector('.line-precio')?.value) || 0;
        const lineTotal = cant * precio;
        const totalInput = line.querySelector('.line-total');
        if (totalInput) totalInput.value = lineTotal.toFixed(2);
        grandTotal += lineTotal;
      });
      const grandTotalInput = document.getElementById('ing-venta-total');
      if (grandTotalInput) grandTotalInput.value = grandTotal.toFixed(2);
    };

    // Bind line events (product select auto-fills price)
    const bindLineEvents = () => {
      document.querySelectorAll('.line-producto').forEach(sel => {
        sel.removeEventListener('change', onProductoChange);
        sel.addEventListener('change', onProductoChange);
      });
      document.querySelectorAll('.line-cantidad, .line-precio').forEach(inp => {
        inp.removeEventListener('input', recalcTotals);
        inp.addEventListener('input', recalcTotals);
      });
      document.querySelectorAll('.btn-remove-line').forEach(btn => {
        btn.addEventListener('click', () => {
          const lineEl = document.querySelector(`.venta-line[data-line="${btn.dataset.line}"]`);
          if (lineEl) { lineEl.remove(); recalcTotals(); }
        });
      });
    };

    function onProductoChange(e) {
      const opt = e.target.selectedOptions[0];
      const line = e.target.closest('.venta-line');
      if (opt && line) {
        const precioInput = line.querySelector('.line-precio');
        if (precioInput) precioInput.value = opt.dataset.precio || '';
        recalcTotals();
      }
    }

    bindLineEvents();

    // Add new line
    document.getElementById('btn-add-line')?.addEventListener('click', () => {
      const linesContainer = document.getElementById('ing-venta-lines');
      const div = document.createElement('div');
      div.innerHTML = buildLineHTML(lineCount++);
      linesContainer.appendChild(div.firstElementChild);
      bindLineEvents();
    });

    // Save
    document.getElementById('btn-save-ing-venta').addEventListener('click', async () => {
      const agricultorId = document.getElementById('ing-venta-agricultor').value;
      if (!agricultorId) { App.showToast('Selecciona un agricultor', 'warning'); return; }

      // Collect lines
      const lines = [];
      let valid = true;
      document.querySelectorAll('.venta-line').forEach(lineEl => {
        const productoSel = lineEl.querySelector('.line-producto');
        const productoId = productoSel?.value;
        const productoNombre = productoSel?.selectedOptions[0]?.dataset?.nombre || '';
        const cantidad = parseFloat(lineEl.querySelector('.line-cantidad')?.value) || 0;
        const precioUnitario = parseFloat(lineEl.querySelector('.line-precio')?.value) || 0;
        const total = parseFloat(lineEl.querySelector('.line-total')?.value) || 0;

        if (!productoId || cantidad <= 0) {
          valid = false;
          return;
        }
        lines.push({ producto_id: productoId, producto_nombre: productoNombre, cantidad, precio_unitario: precioUnitario, total });
      });

      if (!valid || lines.length === 0) {
        App.showToast('Agrega al menos un producto con cantidad', 'warning');
        return;
      }

      const fincaId = document.getElementById('ing-venta-finca').value || null;
      const grandTotal = parseFloat(document.getElementById('ing-venta-total').value) || 0;
      const formaPago = document.getElementById('ing-venta-pago').value;
      const cobrado = document.getElementById('ing-venta-cobrado').checked;

      // Create venta record
      const ventaData = {
        ingeniero_id: userId,
        agricultor_id: agricultorId,
        finca_id: fincaId,
        fecha: document.getElementById('ing-venta-fecha').value || DateUtils.today(),
        total: grandTotal,
        forma_pago: formaPago,
        cobrado,
        fecha_cobro: cobrado ? DateUtils.today() : null,
        notas: document.getElementById('ing-venta-notas').value.trim() || '',
        creado: DateUtils.today()
      };

      const ventaId = await AgroDB.add('ventas_insumos', ventaData);

      // Create detail records and update stock
      for (const line of lines) {
        await AgroDB.add('ventas_insumos_detalle', {
          venta_id: ventaId,
          producto_id: line.producto_id,
          producto_nombre: line.producto_nombre,
          cantidad: line.cantidad,
          precio_unitario: line.precio_unitario,
          total: line.total
        });

        // Subtract stock
        try {
          const prod = await AgroDB.getById('productos_ingeniero', line.producto_id);
          if (prod) {
            const newStock = Math.max(0, (prod.stock || 0) - line.cantidad);
            await AgroDB.update('productos_ingeniero', prod.id, { stock: newStock });
          }
        } catch (e) { /* product may not exist */ }
      }

      App.closeModal();
      App.showToast('Venta registrada correctamente', 'success');
      render(container);
    });
  }

  return { render };
})();

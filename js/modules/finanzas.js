// ============================================
// AgroFinca - Finanzas Module
// Financial analysis with 7-tab system:
// Resumen, Por Cultivo, Por Area, Rendimiento,
// Clientes, Proveedores, Punto de Equilibrio
// Period selector, premium gating, CSV export
// ============================================

const FinanzasModule = (() => {

  let _currentPeriod = 'year';
  let _currentTab = 'resumen';
  let _customStart = '';
  let _customEnd = '';

  function getPeriodRange(period) {
    switch (period) {
      case 'month': return DateUtils.currentMonthRange();
      case 'quarter': return DateUtils.lastMonths(3);
      case 'year': return DateUtils.currentYearRange();
      case 'all': return { start: '2000-01-01', end: '2099-12-31' };
      case 'custom': return { start: _customStart, end: _customEnd };
      default: return DateUtils.currentYearRange();
    }
  }

  function getPeriodLabel(period) {
    switch (period) {
      case 'month': return 'Este mes';
      case 'quarter': return 'Ultimos 3 meses';
      case 'year': return 'Este año';
      case 'all': return 'Todo el historial';
      case 'custom': return `${_customStart} a ${_customEnd}`;
      default: return 'Este año';
    }
  }

  // ── Utility functions ──

  function convertToKg(cantidad, unidad) {
    const conv = { kg: 1, toneladas: 1000, quintales: 45.36, libras: 0.4536, sacos: 50, gramos: 0.001 };
    return (cantidad || 0) * (conv[unidad] || 1);
  }

  function distribuirCostos(costos, areaCultivos, areas, cultivos) {
    const result = {};
    for (const c of cultivos) result[c.id] = { directos: 0, area: 0, generales: 0, depreciacion: 0, fijos: 0, variables: 0 };

    for (const costo of costos) {
      const tipo = costo.tipo_costo || 'variable';
      if (costo.cultivo_id && result[costo.cultivo_id]) {
        result[costo.cultivo_id].directos += (costo.total || 0);
        if (tipo === 'fijo') result[costo.cultivo_id].fijos += (costo.total || 0);
        else result[costo.cultivo_id].variables += (costo.total || 0);
      } else if (costo.area_id) {
        const shares = areaCultivos.filter(ac => ac.area_id === costo.area_id && ac.activo);
        if (shares.length > 0) {
          for (const sh of shares) {
            if (result[sh.cultivo_id]) {
              const monto = (costo.total || 0) * (sh.proporcion || 0);
              result[sh.cultivo_id].area += monto;
              if (tipo === 'fijo') result[sh.cultivo_id].fijos += monto;
              else result[sh.cultivo_id].variables += monto;
            }
          }
        }
      } else {
        const totalAreaM2 = areaCultivos.filter(ac => ac.activo).reduce((s, ac) => {
          const area = areas.find(a => a.id === ac.area_id);
          return s + ((area?.area_m2 || 0) * (ac.proporcion || 0));
        }, 0);
        if (totalAreaM2 > 0) {
          for (const ac of areaCultivos.filter(x => x.activo)) {
            const area = areas.find(a => a.id === ac.area_id);
            const areaM2 = (area?.area_m2 || 0) * (ac.proporcion || 0);
            const fraccion = areaM2 / totalAreaM2;
            if (result[ac.cultivo_id]) {
              const monto = (costo.total || 0) * fraccion;
              result[ac.cultivo_id].generales += monto;
              if (tipo === 'fijo') result[ac.cultivo_id].fijos += monto;
              else result[ac.cultivo_id].variables += monto;
            }
          }
        }
      }
    }

    for (const id of Object.keys(result)) {
      const r = result[id];
      r.total = r.directos + r.area + r.generales + r.depreciacion;
    }
    return result;
  }

  // ══════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    // Generate depreciation if module available
    if (typeof ActivosModule !== 'undefined') {
      try { await ActivosModule.generarDepreciacion(fincaId); } catch (e) {}
    }

    // Load ALL data once
    const [allVentas, allCostos, cosechas, ciclos, cultivos, areas, areaCultivos, depreciacion, activos, clientes, proveedores] = await Promise.all([
      AgroDB.query('ventas', r => r.finca_id === fincaId),
      AgroDB.query('costos', r => r.finca_id === fincaId),
      AgroDB.query('cosechas', r => r.finca_id === fincaId).catch(() => []),
      AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId),
      AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId),
      AgroDB.getByIndex('areas', 'finca_id', fincaId).catch(() => []),
      AgroDB.query('area_cultivos', r => r.finca_id === fincaId).catch(() => []),
      AgroDB.query('depreciacion_mensual', r => r.finca_id === fincaId).catch(() => []),
      AgroDB.query('activos_finca', r => r.finca_id === fincaId).catch(() => []),
      AgroDB.query('clientes', r => r.finca_id === fincaId && r.activo !== false).catch(() => []),
      AgroDB.query('proveedores', r => r.finca_id === fincaId && r.activo !== false).catch(() => [])
    ]);

    const range = getPeriodRange(_currentPeriod);
    const ventas = _currentPeriod === 'all' ? allVentas : allVentas.filter(v => v.fecha >= range.start && v.fecha <= range.end);
    const costos = _currentPeriod === 'all' ? allCostos : allCostos.filter(c => c.fecha >= range.start && c.fecha <= range.end);

    const totalIngresos = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const totalCostos = costos.reduce((s, c) => s + (c.total || 0), 0);
    const costosReales = costos.filter(c => c.categoria !== 'mano_obra_familiar').reduce((s, c) => s + (c.total || 0), 0);
    const costosFamiliares = costos.filter(c => c.categoria === 'mano_obra_familiar').reduce((s, c) => s + (c.total || 0), 0);
    const gananciaReal = totalIngresos - costosReales;
    const gananciaConFamiliar = totalIngresos - totalCostos;
    const roi = totalCostos > 0 ? ((totalIngresos - totalCostos) / totalCostos * 100) : 0;

    const isPaid = typeof PlanGuard !== 'undefined' && PlanGuard.isPaid();

    // Per-crop analysis (basic, for resumen)
    const cropAnalysis = [];
    for (const cultivo of cultivos) {
      const cVentas = ventas.filter(v => v.cultivo_id === cultivo.id).reduce((s, v) => s + (v.total || 0), 0);
      const cCostos = costos.filter(c => c.cultivo_id === cultivo.id).reduce((s, c) => s + (c.total || 0), 0);
      const cCostosReales = costos.filter(c => c.cultivo_id === cultivo.id && c.categoria !== 'mano_obra_familiar').reduce((s, c) => s + (c.total || 0), 0);
      cropAnalysis.push({
        nombre: cultivo.nombre, icono: cultivo.icono || '🌱',
        ingresos: cVentas, costos: cCostos, costosReales: cCostosReales,
        ganancia: cVentas - cCostos, gananciaReal: cVentas - cCostosReales,
        roi: cCostos > 0 ? ((cVentas - cCostos) / cCostos * 100) : 0
      });
    }

    // Per-cycle analysis
    const cycleAnalysis = [];
    for (const ciclo of ciclos) {
      const cVentas = ventas.filter(v => v.cultivo_id === ciclo.cultivo_id).reduce((s, v) => s + (v.total || 0), 0);
      const cCostos = costos.filter(c => c.ciclo_id === ciclo.id).reduce((s, c) => s + (c.total || 0), 0);
      cycleAnalysis.push({
        cultivo: ciclo.cultivo_nombre, area: ciclo.area_nombre, estado: ciclo.estado,
        inicio: ciclo.fecha_inicio, fin: ciclo.fecha_fin_real,
        ingresos: cVentas, costos: cCostos, ganancia: cVentas - cCostos
      });
    }

    // Monthly trends (last 12 months)
    const monthLabels = [];
    const ingMensual = [];
    const cosMensual = [];
    const ganMensual = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().substring(0, 7);
      monthLabels.push(DateUtils.monthName(d.toISOString().split('T')[0]).substring(0, 3));
      const mIng = allVentas.filter(v => v.fecha?.startsWith(key)).reduce((s, v) => s + (v.total || 0), 0);
      const mCos = allCostos.filter(c => c.fecha?.startsWith(key)).reduce((s, c) => s + (c.total || 0), 0);
      ingMensual.push(mIng);
      cosMensual.push(mCos);
      ganMensual.push(mIng - mCos);
    }

    // Monthly comparison table (current year)
    const monthlyComparison = [];
    const currentMonth = new Date().getMonth();
    for (let m = 0; m <= currentMonth; m++) {
      const d = new Date(new Date().getFullYear(), m, 1);
      const key = d.toISOString().substring(0, 7);
      const mIng = allVentas.filter(v => v.fecha?.startsWith(key)).reduce((s, v) => s + (v.total || 0), 0);
      const mCos = allCostos.filter(c => c.fecha?.startsWith(key)).reduce((s, c) => s + (c.total || 0), 0);
      monthlyComparison.push({
        mes: DateUtils.monthName(d.toISOString().split('T')[0]),
        ingresos: mIng, costos: mCos, ganancia: mIng - mCos
      });
    }

    // Price evolution data
    const productosConVentas = {};
    allVentas.forEach(v => {
      const key = v.cultivo_nombre || v.producto || 'Sin nombre';
      if (!productosConVentas[key]) productosConVentas[key] = [];
      productosConVentas[key].push(v);
    });

    const priceMonthLabels = [];
    const priceDatasets = [];
    const chartColors = ['#2E7D32', '#F44336', '#2196F3', '#FFA000', '#9C27B0', '#00BCD4', '#795548', '#FF5722'];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      priceMonthLabels.push(DateUtils.monthName(d.toISOString().split('T')[0]).substring(0, 3));
    }
    let colorIdx = 0;
    for (const [producto, ventasProd] of Object.entries(productosConVentas)) {
      if (ventasProd.length < 2) continue;
      const values = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const key = d.toISOString().substring(0, 7);
        const ventasMes = ventasProd.filter(v => v.fecha?.startsWith(key));
        if (ventasMes.length > 0) {
          const avgPrice = ventasMes.reduce((s, v) => s + (v.precio_unitario || 0), 0) / ventasMes.length;
          values.push(parseFloat(avgPrice.toFixed(2)));
        } else {
          values.push(null);
        }
      }
      if (values.some(v => v !== null)) {
        priceDatasets.push({ label: producto, values, color: chartColors[colorIdx % chartColors.length] });
        colorIdx++;
      }
    }

    const priceStats = [];
    for (const [producto, ventasProd] of Object.entries(productosConVentas)) {
      const precios = ventasProd.filter(v => v.precio_unitario > 0).map(v => v.precio_unitario);
      if (precios.length === 0) continue;
      const unidad = ventasProd[0]?.unidad || 'unidad';
      const avg = precios.reduce((s, p) => s + p, 0) / precios.length;
      const min = Math.min(...precios);
      const max = Math.max(...precios);
      const stdDev = precios.length > 1 ? Math.sqrt(precios.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / precios.length) : 0;
      const cv = avg > 0 ? (stdDev / avg * 100) : 0;
      priceStats.push({ producto, unidad, promedio: avg, minimo: min, maximo: max, variacion: cv, ventas: precios.length });
    }

    // Distributed costs (all 3 levels)
    const costosDistribuidos = distribuirCostos(costos, areaCultivos, areas, cultivos);

    // Depreciation totals for period
    const rangeStart = range.start?.substring(0, 7) || '2000-01';
    const rangeEnd = range.end?.substring(0, 7) || '2099-12';
    const depFiltered = depreciacion.filter(d => d.mes >= rangeStart && d.mes <= rangeEnd);
    const totalDepreciacion = depFiltered.reduce((s, d) => s + (d.monto || 0), 0);

    // Add depreciation to distributed costs
    for (const dep of depFiltered) {
      if (dep.cultivo_id && costosDistribuidos[dep.cultivo_id]) {
        costosDistribuidos[dep.cultivo_id].depreciacion += (dep.monto || 0);
        costosDistribuidos[dep.cultivo_id].total += (dep.monto || 0);
      }
    }

    // Pending collection
    const pendienteCobro = ventas.filter(v => v.cobrado === false).reduce((s, v) => s + (v.total || 0), 0);

    // Build main layout
    container.innerHTML = `
      <div class="page-header">
        <h2>📈 Análisis Financiero</h2>
        ${isPaid ? '<button class="btn btn-outline btn-sm" id="btn-export-csv">📄 Exportar CSV</button>' : ''}
      </div>

      <!-- Period Selector -->
      <div class="card" style="padding:0.75rem;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span class="text-sm text-muted" style="margin-right:4px;">Período:</span>
          <button class="btn btn-xs ${_currentPeriod === 'month' ? 'btn-primary' : 'btn-outline'} period-btn" data-period="month">Este mes</button>
          <button class="btn btn-xs ${_currentPeriod === 'quarter' ? 'btn-primary' : 'btn-outline'} period-btn" data-period="quarter">3 meses</button>
          <button class="btn btn-xs ${_currentPeriod === 'year' ? 'btn-primary' : 'btn-outline'} period-btn" data-period="year">Este año</button>
          <button class="btn btn-xs ${_currentPeriod === 'all' ? 'btn-primary' : 'btn-outline'} period-btn" data-period="all">Todo</button>
          <button class="btn btn-xs ${_currentPeriod === 'custom' ? 'btn-primary' : 'btn-outline'}" id="btn-custom-period">Personalizado</button>
        </div>
        <div id="custom-period-inputs" style="display:${_currentPeriod === 'custom' ? 'flex' : 'none'};gap:8px;margin-top:8px;align-items:center;">
          <input type="date" id="period-start" value="${_customStart}" class="input-sm">
          <span>a</span>
          <input type="date" id="period-end" value="${_customEnd}" class="input-sm">
          <button class="btn btn-xs btn-primary" id="btn-apply-period">Aplicar</button>
        </div>
      </div>

      <!-- Tab Bar -->
      <div class="tabs-row" style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:1rem;overflow-x:auto;flex-wrap:nowrap">
        <button class="tab-btn ${_currentTab === 'resumen' ? 'active' : ''}" data-ftab="resumen">📊 Resumen</button>
        <button class="tab-btn ${_currentTab === 'cultivo' ? 'active' : ''}" data-ftab="cultivo">🌿 Por Cultivo</button>
        <button class="tab-btn ${_currentTab === 'area' ? 'active' : ''}" data-ftab="area">📍 Por Área</button>
        <button class="tab-btn ${_currentTab === 'rendimiento' ? 'active' : ''}" data-ftab="rendimiento">📈 Rendimiento</button>
        <button class="tab-btn ${_currentTab === 'clientes' ? 'active' : ''}" data-ftab="clientes">👥 Clientes</button>
        <button class="tab-btn ${_currentTab === 'proveedores' ? 'active' : ''}" data-ftab="proveedores">🏪 Proveedores</button>
        <button class="tab-btn ${_currentTab === 'equilibrio' ? 'active' : ''}" data-ftab="equilibrio">⚖️ Punto Equilibrio</button>
      </div>

      <!-- Tab Content -->
      <div id="finanzas-tab-content"></div>
    `;

    // ── Event Listeners ──

    container.querySelectorAll('[data-ftab]').forEach(btn => {
      btn.addEventListener('click', () => {
        _currentTab = btn.dataset.ftab;
        render(container, fincaId);
      });
    });

    container.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => { _currentPeriod = btn.dataset.period; render(container, fincaId); });
    });
    document.getElementById('btn-custom-period')?.addEventListener('click', () => {
      const inputs = document.getElementById('custom-period-inputs');
      inputs.style.display = inputs.style.display === 'none' ? 'flex' : 'none';
    });
    document.getElementById('btn-apply-period')?.addEventListener('click', () => {
      _customStart = document.getElementById('period-start').value;
      _customEnd = document.getElementById('period-end').value;
      if (_customStart && _customEnd) { _currentPeriod = 'custom'; render(container, fincaId); }
    });

    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      if (!isPaid) { PlanGuard.showUpgradePrompt('Exportar CSV'); return; }
      exportCSV(allVentas, allCostos, cropAnalysis, monthlyComparison);
    });

    // ── Render Active Tab ──
    const tabContent = document.getElementById('finanzas-tab-content');
    if (!tabContent) return;

    switch (_currentTab) {
      case 'resumen':
        renderResumen(tabContent, {
          totalIngresos, totalCostos, costosReales, costosFamiliares,
          gananciaReal, gananciaConFamiliar, roi, isPaid, totalDepreciacion, pendienteCobro,
          cropAnalysis, cycleAnalysis, monthlyComparison,
          monthLabels, ingMensual, cosMensual, ganMensual,
          priceDatasets, priceMonthLabels, priceStats
        });
        break;
      case 'cultivo':
        renderPorCultivo(tabContent, { cultivos, ventas, costos, costosDistribuidos, depFiltered, areaCultivos, areas, isPaid });
        break;
      case 'area':
        renderPorArea(tabContent, { areas, areaCultivos, cultivos, ventas, costos });
        break;
      case 'rendimiento':
        renderRendimiento(tabContent, { ciclos, cosechas, cultivos, areas, areaCultivos });
        break;
      case 'clientes':
        renderClientes(tabContent, { clientes, ventas, allVentas });
        break;
      case 'proveedores':
        renderProveedores(tabContent, { proveedores, costos, allCostos });
        break;
      case 'equilibrio':
        renderPuntoEquilibrio(tabContent, { cultivos, ventas, costos, costosDistribuidos, areaCultivos, areas, ciclos, isPaid });
        break;
    }
  }

  // ══════════════════════════════════════════
  // TAB: Resumen
  // ══════════════════════════════════════════
  function renderResumen(el, d) {
    el.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data"><div class="s-value">${Format.money(d.totalIngresos)}</div><div class="s-label">Ingresos</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon red">📉</div>
          <div class="s-data"><div class="s-value">${Format.money(d.totalCostos)}</div><div class="s-label">Costos</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon ${d.gananciaConFamiliar >= 0 ? 'green' : 'red'}">📊</div>
          <div class="s-data">
            <div class="s-value ${d.gananciaConFamiliar >= 0 ? 'text-green' : 'text-red'}">${Format.money(d.gananciaConFamiliar)}</div>
            <div class="s-label">Ganancia neta</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📈</div>
          <div class="s-data"><div class="s-value">${Format.percent(d.roi)}</div><div class="s-label">ROI</div></div>
        </div>
      </div>

      <div class="card" style="background:#FFF8E1;">
        <div class="card-title">👨‍🌾 Impacto de la Mano de Obra Familiar</div>
        <div class="form-row" style="gap:1rem;">
          <div>
            <div class="text-sm text-muted">SIN M.O. familiar:</div>
            <div class="s-value text-green">${Format.money(d.gananciaReal)}</div>
          </div>
          <div>
            <div class="text-sm text-muted">CON M.O. familiar:</div>
            <div class="s-value ${d.gananciaConFamiliar >= 0 ? 'text-green' : 'text-red'}">${Format.money(d.gananciaConFamiliar)}</div>
          </div>
          <div>
            <div class="text-sm text-muted">Valor M.O. familiar:</div>
            <div class="s-value text-amber">${Format.money(d.costosFamiliares)}</div>
          </div>
        </div>
      </div>

      <div class="card" style="background:var(--yellow-50);border-left:4px solid var(--yellow-500)">
        <h4>👁️ Costos Ocultos</h4>
        <div>M.O. Familiar: $${d.costosFamiliares.toFixed(2)}</div>
        <div>Depreciación: $${d.totalDepreciacion.toFixed(2)}</div>
        <div style="font-weight:700;margin-top:0.5rem">Total ocultos: $${(d.costosFamiliares + d.totalDepreciacion).toFixed(2)}</div>
      </div>

      ${d.pendienteCobro > 0 ? `
      <div class="card" style="background:var(--yellow-50);border-left:4px solid var(--amber-500)">
        <h4>💸 Cuentas por Cobrar</h4>
        <div class="s-value text-amber">$${d.pendienteCobro.toFixed(2)}</div>
        <div class="text-sm text-muted">Ventas pendientes de cobro</div>
      </div>` : ''}

      ${d.isPaid ? `
      <div class="card">
        <div class="card-title">📅 Comparativa Mensual ${new Date().getFullYear()}</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Mes</th><th>Ingresos</th><th>Costos</th><th>Ganancia</th></tr>
            </thead>
            <tbody>
              ${d.monthlyComparison.map(m => `
                <tr>
                  <td style="text-transform:capitalize;">${m.mes}</td>
                  <td class="text-green">${Format.money(m.ingresos)}</td>
                  <td class="text-red">${Format.money(m.costos)}</td>
                  <td class="${m.ganancia >= 0 ? 'text-green' : 'text-red'}">${Format.money(m.ganancia)}</td>
                </tr>
              `).join('')}
              <tr style="font-weight:bold;border-top:2px solid var(--border);">
                <td>TOTAL</td>
                <td class="text-green">${Format.money(d.monthlyComparison.reduce((s, m) => s + m.ingresos, 0))}</td>
                <td class="text-red">${Format.money(d.monthlyComparison.reduce((s, m) => s + m.costos, 0))}</td>
                <td class="${d.monthlyComparison.reduce((s, m) => s + m.ganancia, 0) >= 0 ? 'text-green' : 'text-red'}">${Format.money(d.monthlyComparison.reduce((s, m) => s + m.ganancia, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>` : `
      <div class="card" style="text-align:center;padding:1.5rem;">
        <div style="font-size:1.5rem;margin-bottom:0.5rem;">📅</div>
        <h3>Comparativa Mensual Detallada</h3>
        <p class="text-sm text-muted">Disponible en el plan Premium</p>
        <button class="btn btn-primary btn-sm" onclick="PlanGuard.showUpgradePrompt('Comparativa Mensual')">Ver planes</button>
      </div>`}

      <div class="card">
        <div class="card-title">📊 Evolución de Precios Unitarios</div>
        <p class="text-sm text-muted mb-1">Precio unitario promedio por producto (12 meses)</p>
        ${d.priceDatasets.length > 0 ?
          '<div id="chart-precios-evolucion" class="chart-container"></div>' :
          '<p class="text-sm text-muted">Se necesitan al menos 2 ventas del mismo producto para mostrar tendencias.</p>'}
      </div>

      ${d.priceStats.length > 0 ? `
      <div class="card">
        <div class="card-title">📉 Variación de Precios</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Producto</th><th>Promedio</th><th>Mín.</th><th>Máx.</th><th>Variación</th><th>#</th></tr>
            </thead>
            <tbody>
              ${d.priceStats.map(p => `
                <tr>
                  <td>${p.producto}</td>
                  <td>${Format.money(p.promedio)}/${p.unidad}</td>
                  <td class="text-green">${Format.money(p.minimo)}</td>
                  <td class="text-red">${Format.money(p.maximo)}</td>
                  <td>
                    <span class="badge ${p.variacion > 20 ? 'badge-red' : p.variacion > 10 ? 'badge-amber' : 'badge-green'}">${p.variacion.toFixed(1)}%</span>
                    ${p.variacion > 20 ? ' <span class="text-xs">Estacional</span>' : ''}
                  </td>
                  <td>${p.ventas}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-title">Tendencia mensual (12 meses)</div>
        <div id="chart-tendencia" class="chart-container"></div>
      </div>

      <div class="card">
        <div class="card-title">Ganancia mensual</div>
        <div id="chart-ganancia" class="chart-container"></div>
      </div>

      <div class="card">
        <div class="card-title">Rentabilidad por Cultivo</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Cultivo</th><th>Ingresos</th><th>Costos</th><th>Ganancia</th><th>ROI</th></tr>
            </thead>
            <tbody>
              ${d.cropAnalysis.map(c => `
                <tr>
                  <td>${c.icono} ${c.nombre}</td>
                  <td class="text-green">${Format.money(c.ingresos)}</td>
                  <td class="text-red">${Format.money(c.costos)}</td>
                  <td class="${c.ganancia >= 0 ? 'text-green' : 'text-red'}">${Format.money(c.ganancia)}</td>
                  <td><span class="badge ${c.roi >= 0 ? 'badge-green' : 'badge-red'}">${Format.percent(c.roi)}</span></td>
                </tr>
              `).join('')}
              ${d.cropAnalysis.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">Sin datos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Análisis por Ciclo Productivo</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Cultivo</th><th>Área</th><th>Estado</th><th>Período</th><th>Ingresos</th><th>Costos</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              ${d.cycleAnalysis.map(c => `
                <tr>
                  <td>${c.cultivo}</td>
                  <td>${c.area || '-'}</td>
                  <td><span class="badge ${c.estado === 'activo' ? 'badge-green' : 'badge-gray'}">${c.estado}</span></td>
                  <td class="text-xs">${Format.dateShort(c.inicio)}${c.fin ? ' → ' + Format.dateShort(c.fin) : ''}</td>
                  <td class="text-green">${Format.money(c.ingresos)}</td>
                  <td class="text-red">${Format.money(c.costos)}</td>
                  <td class="${c.ganancia >= 0 ? 'text-green' : 'text-red'}">${Format.money(c.ganancia)}</td>
                </tr>
              `).join('')}
              ${d.cycleAnalysis.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">Sin ciclos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Ingresos vs Costos por Cultivo</div>
        <div id="chart-cultivo-compare" class="chart-container"></div>
      </div>

      ${d.cropAnalysis.length > 0 ? `
      <div class="card">
        <div class="card-title">Ranking de Rentabilidad</div>
        <div id="chart-ranking" class="chart-container"></div>
      </div>` : ''}
    `;

    // Charts
    if (d.priceDatasets.length > 0) {
      const filledDatasets = d.priceDatasets.map(ds => {
        const filled = [...ds.values];
        let lastVal = null;
        for (let i = 0; i < filled.length; i++) {
          if (filled[i] !== null) lastVal = filled[i];
          else if (lastVal !== null) filled[i] = lastVal;
        }
        let nextVal = null;
        for (let i = filled.length - 1; i >= 0; i--) {
          if (filled[i] !== null) nextVal = filled[i];
          else if (nextVal !== null) filled[i] = nextVal;
        }
        return { ...ds, values: filled.map(v => v || 0) };
      });
      Charts.lineChart('chart-precios-evolucion', {
        labels: d.priceMonthLabels,
        datasets: filledDatasets
      }, { height: 250, title: 'Precio unitario promedio ($)' });
    }

    Charts.lineChart('chart-tendencia', {
      labels: d.monthLabels,
      datasets: [
        { label: 'Ingresos', values: d.ingMensual, color: '#2E7D32' },
        { label: 'Costos', values: d.cosMensual, color: '#F44336' }
      ]
    }, { height: 220, title: '' });

    Charts.barChart('chart-ganancia', {
      labels: d.monthLabels,
      values: d.ganMensual,
      datasets: [{ values: d.ganMensual, color: '#2196F3' }]
    }, { height: 180 });

    if (d.cropAnalysis.length > 0) {
      Charts.barChart('chart-cultivo-compare', {
        labels: d.cropAnalysis.map(c => c.nombre),
        datasets: [
          { label: 'Ingresos', values: d.cropAnalysis.map(c => c.ingresos), color: '#2E7D32' },
          { label: 'Costos', values: d.cropAnalysis.map(c => c.costos), color: '#F44336' }
        ]
      }, { height: 220 });

      const sortedCrops = [...d.cropAnalysis].sort((a, b) => b.ganancia - a.ganancia);
      Charts.barChart('chart-ranking', {
        labels: sortedCrops.map(c => c.nombre),
        datasets: [{ label: 'Ganancia', values: sortedCrops.map(c => c.ganancia), color: '#2196F3' }]
      }, { height: 180, horizontal: true });
    }
  }

  // ══════════════════════════════════════════
  // TAB: Por Cultivo
  // ══════════════════════════════════════════
  function renderPorCultivo(el, d) {
    const { cultivos, ventas, costos, costosDistribuidos, depFiltered, areaCultivos, areas } = d;

    const cropRows = [];
    for (const cultivo of cultivos) {
      const dist = costosDistribuidos[cultivo.id] || { directos: 0, area: 0, generales: 0, depreciacion: 0, fijos: 0, variables: 0, total: 0 };
      const ingresos = ventas.filter(v => v.cultivo_id === cultivo.id).reduce((s, v) => s + (v.total || 0), 0);
      const ganancia = ingresos - dist.total;
      const roiVal = dist.total > 0 ? ((ingresos - dist.total) / dist.total * 100) : 0;

      cropRows.push({
        nombre: cultivo.nombre, icono: cultivo.icono || '🌱', ingresos,
        costosFijos: dist.fijos, costosVariables: dist.variables,
        depreciacion: dist.depreciacion, costoTotal: dist.total, ganancia, roi: roiVal
      });
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-title">🌿 Rentabilidad por Cultivo (costos distribuidos)</div>
        <p class="text-sm text-muted mb-1">Incluye costos directos, por área y generales distribuidos proporcionalmente</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Cultivo</th><th>Ingresos</th><th>C.Fijos</th><th>C.Variables</th><th>Depreciación</th><th>Ganancia</th><th>ROI</th></tr>
            </thead>
            <tbody>
              ${cropRows.map(c => `
                <tr>
                  <td>${c.icono} ${c.nombre}</td>
                  <td class="text-green">$${c.ingresos.toFixed(2)}</td>
                  <td class="text-red">$${c.costosFijos.toFixed(2)}</td>
                  <td class="text-red">$${c.costosVariables.toFixed(2)}</td>
                  <td class="text-muted">$${c.depreciacion.toFixed(2)}</td>
                  <td class="${c.ganancia >= 0 ? 'text-green' : 'text-red'}">$${c.ganancia.toFixed(2)}</td>
                  <td><span class="badge ${c.roi >= 0 ? 'badge-green' : 'badge-red'}">${c.roi.toFixed(1)}%</span></td>
                </tr>
              `).join('')}
              ${cropRows.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">Sin datos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      ${cropRows.length > 0 ? `
      <div class="card">
        <div class="card-title">Ingresos vs Costos por Cultivo</div>
        <div id="chart-cultivo-tab" class="chart-container"></div>
      </div>
      <div class="card">
        <div class="card-title">Ranking de Rentabilidad</div>
        <div id="chart-ranking-tab" class="chart-container"></div>
      </div>` : ''}
    `;

    if (cropRows.length > 0) {
      Charts.barChart('chart-cultivo-tab', {
        labels: cropRows.map(c => c.nombre),
        datasets: [
          { label: 'Ingresos', values: cropRows.map(c => c.ingresos), color: '#2E7D32' },
          { label: 'Costos', values: cropRows.map(c => c.costoTotal), color: '#F44336' }
        ]
      }, { height: 220 });

      const sorted = [...cropRows].sort((a, b) => b.ganancia - a.ganancia);
      Charts.barChart('chart-ranking-tab', {
        labels: sorted.map(c => c.nombre),
        datasets: [{ label: 'Ganancia', values: sorted.map(c => c.ganancia), color: '#2196F3' }]
      }, { height: 180, horizontal: true });
    }
  }

  // ══════════════════════════════════════════
  // TAB: Por Área
  // ══════════════════════════════════════════
  function renderPorArea(el, d) {
    const { areas, areaCultivos, cultivos, ventas, costos } = d;

    const areaRows = [];
    for (const area of areas) {
      const shares = areaCultivos.filter(ac => ac.area_id === area.id && ac.activo);
      if (shares.length === 0) continue;

      const cultivosEnArea = shares.map(sh => {
        const cult = cultivos.find(c => c.id === sh.cultivo_id);
        return { nombre: cult?.nombre || 'Desconocido', icono: cult?.icono || '🌱', proporcion: sh.proporcion || 0 };
      });

      const cultivoIds = shares.map(sh => sh.cultivo_id);
      const areaIngresos = ventas.filter(v => cultivoIds.includes(v.cultivo_id)).reduce((s, v) => s + (v.total || 0), 0);
      const areaCostosDir = costos.filter(c => c.area_id === area.id).reduce((s, c) => s + (c.total || 0), 0);
      const cultivoCostosDir = costos.filter(c => cultivoIds.includes(c.cultivo_id) && !c.area_id).reduce((s, c) => s + (c.total || 0), 0);
      const totalCostosArea = areaCostosDir + cultivoCostosDir;

      const ganancia = areaIngresos - totalCostosArea;
      const areaM2 = area.area_m2 || 0;
      const areaHa = areaM2 / 10000;

      areaRows.push({
        nombre: area.nombre, areaM2, areaHa, cultivos: cultivosEnArea,
        ingresos: areaIngresos, costos: totalCostosArea, ganancia,
        gananciaPorM2: areaM2 > 0 ? ganancia / areaM2 : 0,
        gananciaPorHa: areaHa > 0 ? ganancia / areaHa : 0
      });
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-title">📍 Análisis por Área</div>
        ${areaRows.length === 0 ? '<p class="text-sm text-muted">No hay áreas con cultivos activos asignados.</p>' : ''}
        ${areaRows.map(a => `
          <div class="card" style="margin-bottom:0.75rem;border:1px solid var(--gray-200);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
              <h4 style="margin:0;">📍 ${a.nombre}</h4>
              <span class="text-sm text-muted">${a.areaM2.toFixed(0)} m² (${a.areaHa.toFixed(2)} ha)</span>
            </div>
            <div class="text-sm" style="margin-bottom:0.5rem;">
              Cultivos: ${a.cultivos.map(c => `${c.icono} ${c.nombre} (${(c.proporcion * 100).toFixed(0)}%)`).join(' · ')}
            </div>
            <div class="form-row" style="gap:1rem;flex-wrap:wrap;">
              <div>
                <div class="text-sm text-muted">Ingresos</div>
                <div class="s-value text-green">$${a.ingresos.toFixed(2)}</div>
              </div>
              <div>
                <div class="text-sm text-muted">Costos</div>
                <div class="s-value text-red">$${a.costos.toFixed(2)}</div>
              </div>
              <div>
                <div class="text-sm text-muted">Ganancia</div>
                <div class="s-value ${a.ganancia >= 0 ? 'text-green' : 'text-red'}">$${a.ganancia.toFixed(2)}</div>
              </div>
              <div>
                <div class="text-sm text-muted">$/m²</div>
                <div class="s-value">$${a.gananciaPorM2.toFixed(2)}</div>
              </div>
              <div>
                <div class="text-sm text-muted">$/ha</div>
                <div class="s-value">$${a.gananciaPorHa.toFixed(2)}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ══════════════════════════════════════════
  // TAB: Rendimiento
  // ══════════════════════════════════════════
  function renderRendimiento(el, d) {
    const { ciclos, cosechas, cultivos, areas, areaCultivos } = d;

    const rendRows = [];
    for (const ciclo of ciclos) {
      const cultivo = cultivos.find(c => c.id === ciclo.cultivo_id);
      if (!cultivo) continue;
      const cicCosechas = cosechas.filter(c => c.ciclo_id === ciclo.id);
      if (cicCosechas.length === 0) continue;

      const totalKg = cicCosechas.reduce((s, c) => s + convertToKg(c.cantidad, c.unidad), 0);
      const share = areaCultivos.find(ac => ac.ciclo_id === ciclo.id);
      const proporcion = share?.proporcion || 1.0;
      const area = areas.find(a => a.id === ciclo.area_id);
      const areaM2 = (area?.area_m2 || 0) * proporcion;
      const areaHa = areaM2 / 10000;
      const tPorHa = areaHa > 0 ? totalKg / areaHa / 1000 : 0;
      const kgPorPlanta = ciclo.cantidad_plantas > 0 ? totalKg / ciclo.cantidad_plantas : null;

      const refTha = cultivo.rendimiento_ref_tha || null;
      const cumplimiento = refTha ? (tPorHa / refTha * 100) : null;

      rendRows.push({
        cultivo: cultivo.nombre, icono: cultivo.icono || '🌱',
        ciclo: ciclo.nombre || ciclo.id.substring(0, 8),
        estado: ciclo.estado, tPorHa, kgPorPlanta, refTha, cumplimiento
      });
    }

    // Quality distribution
    const calidadByCultivo = {};
    for (const cosecha of cosechas) {
      if (!cosecha.calidad || !cosecha.cultivo_id) continue;
      const cultivo = cultivos.find(c => c.id === cosecha.cultivo_id);
      const nombre = cultivo?.nombre || 'Desconocido';
      if (!calidadByCultivo[nombre]) calidadByCultivo[nombre] = {};
      calidadByCultivo[nombre][cosecha.calidad] = (calidadByCultivo[nombre][cosecha.calidad] || 0) + convertToKg(cosecha.cantidad, cosecha.unidad);
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-title">📈 Rendimiento por Ciclo</div>
        ${rendRows.length === 0 ? '<p class="text-sm text-muted">No hay cosechas registradas en ciclos productivos.</p>' : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Cultivo</th><th>Ciclo</th><th>Real (t/ha)</th><th>Ref. ESPAC</th><th>% Cumplimiento</th><th>kg/planta</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${rendRows.map(r => {
                let statusBadge;
                if (r.cumplimiento !== null) {
                  if (r.cumplimiento >= 100) statusBadge = '<span class="badge badge-green">Excelente</span>';
                  else if (r.cumplimiento >= 70) statusBadge = '<span class="badge badge-amber">Aceptable</span>';
                  else statusBadge = '<span class="badge badge-red">Bajo</span>';
                } else {
                  statusBadge = '<span class="badge badge-gray">Sin ref.</span>';
                }
                return `
                <tr>
                  <td>${r.icono} ${r.cultivo}</td>
                  <td>${r.ciclo} <span class="badge ${r.estado === 'activo' ? 'badge-green' : 'badge-gray'}">${r.estado}</span></td>
                  <td>${r.tPorHa.toFixed(2)}</td>
                  <td>${r.refTha !== null ? r.refTha.toFixed(2) : '-'}</td>
                  <td>${r.cumplimiento !== null ? `<span class="badge ${r.cumplimiento >= 100 ? 'badge-green' : r.cumplimiento >= 70 ? 'badge-amber' : 'badge-red'}">${r.cumplimiento.toFixed(1)}%</span>` : '-'}</td>
                  <td>${r.kgPorPlanta !== null ? r.kgPorPlanta.toFixed(2) : '-'}</td>
                  <td>${statusBadge}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
      </div>

      ${Object.keys(calidadByCultivo).length > 0 ? `
      <div class="card">
        <div class="card-title">🏅 Distribución de Calidad por Cultivo</div>
        ${Object.entries(calidadByCultivo).map(([nombre, calidades]) => {
          const totalKg = Object.values(calidades).reduce((s, v) => s + v, 0);
          return `
          <div style="margin-bottom:1rem;">
            <h4 style="margin:0 0 0.25rem 0;">${nombre}</h4>
            <div style="display:flex;gap:1rem;flex-wrap:wrap;">
              ${Object.entries(calidades).sort().map(([cal, kg]) => {
                const pct = totalKg > 0 ? (kg / totalKg * 100) : 0;
                const color = cal === 'A' ? 'green' : cal === 'B' ? 'amber' : 'red';
                return `<div><span class="badge badge-${color}">${cal}</span> <span class="text-sm">${kg.toFixed(1)} kg (${pct.toFixed(0)}%)</span></div>`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}
    `;
  }

  // ══════════════════════════════════════════
  // TAB: Clientes
  // ══════════════════════════════════════════
  function renderClientes(el, d) {
    const { clientes, allVentas } = d;

    const allWithPrice = allVentas.filter(v => v.precio_unitario > 0);
    const overallAvgPrice = allWithPrice.length > 0 ? allWithPrice.reduce((s, v) => s + v.precio_unitario, 0) / allWithPrice.length : 0;

    const clienteRows = [];
    for (const cliente of clientes) {
      const cVentas = allVentas.filter(v =>
        (v.cliente_id && v.cliente_id === cliente.id) ||
        (v.comprador && v.comprador.toLowerCase() === cliente.nombre.toLowerCase())
      );
      if (cVentas.length === 0) continue;

      const totalComprado = cVentas.reduce((s, v) => s + (v.total || 0), 0);
      const withPrice = cVentas.filter(v => v.precio_unitario > 0);
      const avgPrice = withPrice.length > 0 ? withPrice.reduce((s, v) => s + v.precio_unitario, 0) / withPrice.length : 0;

      const fechas = cVentas.map(v => v.fecha).filter(Boolean).sort();
      let frecuenciaDias = null;
      if (fechas.length >= 2) {
        const diffs = [];
        for (let i = 1; i < fechas.length; i++) diffs.push((new Date(fechas[i]) - new Date(fechas[i - 1])) / 86400000);
        frecuenciaDias = diffs.reduce((s, x) => s + x, 0) / diffs.length;
      }

      const pendiente = cVentas.filter(v => v.cobrado === false).reduce((s, v) => s + (v.total || 0), 0);

      const productoCount = {};
      cVentas.forEach(v => {
        const prod = v.cultivo_nombre || v.producto || 'Sin nombre';
        productoCount[prod] = (productoCount[prod] || 0) + (v.total || 0);
      });
      const topProductos = Object.entries(productoCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

      clienteRows.push({
        nombre: cliente.nombre, totalComprado, avgPrice,
        pagaMejor: avgPrice > overallAvgPrice, frecuenciaDias,
        pendiente, topProductos, numCompras: cVentas.length
      });
    }

    clienteRows.sort((a, b) => b.totalComprado - a.totalComprado);

    el.innerHTML = `
      <div class="card">
        <div class="card-title">👥 Análisis de Clientes</div>
        ${clienteRows.length === 0 ? '<p class="text-sm text-muted">No hay clientes con ventas registradas. Registra clientes y vincula ventas para ver este análisis.</p>' : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Cliente</th><th>Total Comprado</th><th>Precio Prom.</th><th>¿Paga Mejor?</th><th>Frecuencia</th><th>Pendiente</th><th>Productos Top</th></tr>
            </thead>
            <tbody>
              ${clienteRows.map(c => `
                <tr>
                  <td><strong>${c.nombre}</strong><br><span class="text-xs text-muted">${c.numCompras} compras</span></td>
                  <td class="text-green">$${c.totalComprado.toFixed(2)}</td>
                  <td>$${c.avgPrice.toFixed(2)}</td>
                  <td>${c.avgPrice > 0 ? (c.pagaMejor ? '<span class="badge badge-green">Sí ↑</span>' : '<span class="badge badge-red">No ↓</span>') : '-'}</td>
                  <td>${c.frecuenciaDias !== null ? `~${Math.round(c.frecuenciaDias)} días` : '-'}</td>
                  <td>${c.pendiente > 0 ? `<span class="text-red">$${c.pendiente.toFixed(2)}</span>` : '<span class="text-green">Al día</span>'}</td>
                  <td class="text-xs">${c.topProductos.map(([p]) => p).join(', ') || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    `;
  }

  // ══════════════════════════════════════════
  // TAB: Proveedores
  // ══════════════════════════════════════════
  function renderProveedores(el, d) {
    const { proveedores, allCostos } = d;

    const totalCostosGeneral = allCostos.reduce((s, c) => s + (c.total || 0), 0);

    const proveedorRows = [];
    for (const prov of proveedores) {
      const pCostos = allCostos.filter(c =>
        (c.proveedor_id && c.proveedor_id === prov.id) ||
        (c.proveedor && c.proveedor.toLowerCase() === prov.nombre.toLowerCase())
      );
      if (pCostos.length === 0) continue;

      const totalGastado = pCostos.reduce((s, c) => s + (c.total || 0), 0);
      const pctTotal = totalCostosGeneral > 0 ? (totalGastado / totalCostosGeneral * 100) : 0;

      const catCount = {};
      pCostos.forEach(c => {
        const cat = c.categoria || c.descripcion || 'General';
        catCount[cat] = (catCount[cat] || 0) + (c.total || 0);
      });
      const topCategorias = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

      let tendencia = null;
      if (pCostos.length >= 4) {
        const sorted = [...pCostos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
        const mid = Math.floor(sorted.length / 2);
        const avgFirst = sorted.slice(0, mid).reduce((s, c) => s + (c.costo_unitario || c.total || 0), 0) / mid;
        const avgSecond = sorted.slice(mid).reduce((s, c) => s + (c.costo_unitario || c.total || 0), 0) / (sorted.length - mid);
        if (avgFirst > 0) tendencia = ((avgSecond - avgFirst) / avgFirst) * 100;
      }

      proveedorRows.push({
        nombre: prov.nombre, totalGastado, pctTotal,
        numCompras: pCostos.length, topCategorias, tendencia,
        concentrado: pctTotal > 30
      });
    }

    proveedorRows.sort((a, b) => b.totalGastado - a.totalGastado);
    const hayConcentrado = proveedorRows.some(p => p.concentrado);

    el.innerHTML = `
      ${hayConcentrado ? `
      <div class="card" style="background:var(--yellow-50);border-left:4px solid var(--amber-500)">
        <h4>⚠️ Oportunidad de Negociación</h4>
        <p class="text-sm">Proveedores con más del 30% de tus costos totales representan riesgo de dependencia. Considera diversificar o negociar mejores condiciones.</p>
      </div>` : ''}

      <div class="card">
        <div class="card-title">🏪 Análisis de Proveedores</div>
        ${proveedorRows.length === 0 ? '<p class="text-sm text-muted">No hay proveedores con costos registrados. Registra proveedores y vincula costos para ver este análisis.</p>' : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Proveedor</th><th>Total Gastado</th><th>% del Total</th><th># Compras</th><th>Categorías Top</th><th>Tendencia Precio</th></tr>
            </thead>
            <tbody>
              ${proveedorRows.map(p => `
                <tr>
                  <td>
                    <strong>${p.nombre}</strong>
                    ${p.concentrado ? '<br><span class="badge badge-amber">Alta concentración</span>' : ''}
                  </td>
                  <td class="text-red">$${p.totalGastado.toFixed(2)}</td>
                  <td><span class="badge ${p.pctTotal > 30 ? 'badge-red' : p.pctTotal > 15 ? 'badge-amber' : 'badge-green'}">${p.pctTotal.toFixed(1)}%</span></td>
                  <td>${p.numCompras}</td>
                  <td class="text-xs">${p.topCategorias.map(([cat]) => cat).join(', ') || '-'}</td>
                  <td>${p.tendencia !== null
                    ? `<span class="badge ${p.tendencia > 5 ? 'badge-red' : p.tendencia < -5 ? 'badge-green' : 'badge-gray'}">${p.tendencia > 0 ? '↑' : '↓'} ${Math.abs(p.tendencia).toFixed(1)}%</span>`
                    : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    `;
  }

  // ══════════════════════════════════════════
  // TAB: Punto de Equilibrio (premium gated)
  // ══════════════════════════════════════════
  function renderPuntoEquilibrio(el, d) {
    const { cultivos, ventas, costos, costosDistribuidos, areaCultivos, areas, ciclos, isPaid } = d;

    if (!isPaid) {
      el.innerHTML = `
        <div class="card" style="text-align:center;padding:2rem;">
          <div style="font-size:2rem;margin-bottom:0.5rem;">⚖️</div>
          <h3>Punto de Equilibrio por Cultivo</h3>
          <p class="text-sm text-muted">Análisis avanzado disponible en el plan Premium</p>
          <p class="text-sm text-muted">Descubre cuántas unidades necesitas vender para cubrir tus costos, y cuánta área adicional necesitas.</p>
          <button class="btn btn-primary btn-sm" onclick="PlanGuard.showUpgradePrompt('Punto de Equilibrio')">Ver planes</button>
        </div>
      `;
      return;
    }

    const peRows = [];
    for (const cultivo of cultivos) {
      const dist = costosDistribuidos[cultivo.id];
      if (!dist || dist.total === 0) continue;

      const cVentas = ventas.filter(v => v.cultivo_id === cultivo.id);
      const cantidadVendida = cVentas.reduce((s, v) => s + (v.cantidad || 0), 0);
      const ingresoTotal = cVentas.reduce((s, v) => s + (v.total || 0), 0);
      if (cantidadVendida === 0) continue;

      let cFijos = dist.fijos;
      let cVariables = dist.variables;
      if (cFijos === 0 && cVariables === 0 && dist.total > 0) {
        cFijos = dist.total * 0.3;
        cVariables = dist.total * 0.7;
      }

      const precioPromedio = ingresoTotal / cantidadVendida;
      const costoVarUnitario = cVariables / cantidadVendida;
      const margenContribucion = precioPromedio - costoVarUnitario;
      if (margenContribucion <= 0) continue;

      const peUnidades = cFijos / margenContribucion;
      const peDolares = peUnidades * precioPromedio;
      const superaPE = cantidadVendida >= peUnidades;

      let brechaArea = null;
      if (!superaPE) {
        const brechaUnidades = peUnidades - cantidadVendida;
        const cultivoShares = areaCultivos.filter(ac => ac.cultivo_id === cultivo.id && ac.activo);
        let totalAreaM2 = 0;
        for (const sh of cultivoShares) {
          const area = areas.find(a => a.id === sh.area_id);
          totalAreaM2 += (area?.area_m2 || 0) * (sh.proporcion || 0);
        }
        const rendPorM2 = totalAreaM2 > 0 ? cantidadVendida / totalAreaM2 : 0;
        const areaAdicionalM2 = rendPorM2 > 0 ? brechaUnidades / rendPorM2 : 0;

        const ciclo = ciclos.find(c => c.cultivo_id === cultivo.id && c.estado === 'activo');
        const kgPlanta = ciclo?.cantidad_plantas > 0 ? cantidadVendida / ciclo.cantidad_plantas : 0;
        const plantasAdicionales = kgPlanta > 0 ? Math.ceil(brechaUnidades / kgPlanta) : null;

        brechaArea = { brechaUnidades, areaAdicionalM2, areaAdicionalHa: areaAdicionalM2 / 10000, plantasAdicionales };
      }

      peRows.push({
        nombre: cultivo.nombre, icono: cultivo.icono || '🌱',
        costosFijos: cFijos, costosVariables: cVariables, precioPromedio, costoVarUnitario,
        margenContribucion, peUnidades, peDolares, cantidadVendida, ingresoTotal, superaPE, brechaArea
      });
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-title">⚖️ Punto de Equilibrio por Cultivo</div>
        ${peRows.length === 0 ? '<p class="text-sm text-muted">No hay datos suficientes para calcular el punto de equilibrio. Se necesitan ventas y costos registrados.</p>' : ''}
        ${peRows.map(pe => {
          const pctDisplay = pe.peUnidades > 0 ? (pe.cantidadVendida / pe.peUnidades) * 100 : 0;
          const barWidth = Math.min(pctDisplay, 100);
          const barColor = pe.superaPE ? '#2E7D32' : (pctDisplay >= 70 ? '#FFA000' : '#F44336');

          return `
          <div class="card" style="margin-bottom:1rem;border:1px solid var(--gray-200);">
            <h4 style="margin:0 0 0.5rem 0;">${pe.icono} ${pe.nombre} — Punto de Equilibrio: ${Math.ceil(pe.peUnidades)} unidades ($${pe.peDolares.toFixed(2)})</h4>
            <div style="background:var(--gray-100);border-radius:8px;height:24px;overflow:hidden;margin-bottom:0.5rem;position:relative;">
              <div style="background:${barColor};height:100%;width:${barWidth}%;border-radius:8px;transition:width 0.3s;"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:0.75rem;font-weight:700;">${pctDisplay.toFixed(0)}% (${pe.cantidadVendida.toFixed(0)}/${Math.ceil(pe.peUnidades)} unidades)</div>
            </div>
            <div class="form-row" style="gap:1rem;flex-wrap:wrap;">
              <div><span class="text-sm text-muted">C.Fijos:</span> <span class="text-sm">$${pe.costosFijos.toFixed(2)}</span></div>
              <div><span class="text-sm text-muted">C.Variables:</span> <span class="text-sm">$${pe.costosVariables.toFixed(2)}</span></div>
              <div><span class="text-sm text-muted">Precio prom.:</span> <span class="text-sm">$${pe.precioPromedio.toFixed(2)}</span></div>
              <div><span class="text-sm text-muted">Margen contrib.:</span> <span class="text-sm">$${pe.margenContribucion.toFixed(2)}</span></div>
            </div>
            ${!pe.superaPE && pe.brechaArea ? `
            <div style="margin-top:0.5rem;padding:0.5rem;background:var(--red-50);border-radius:6px;">
              <div class="text-sm"><strong>Brecha:</strong> ${pe.brechaArea.brechaUnidades.toFixed(0)} unidades</div>
              <div class="text-sm">Necesitas: +${pe.brechaArea.areaAdicionalM2.toFixed(0)} m² (${pe.brechaArea.areaAdicionalHa.toFixed(2)} ha)${pe.brechaArea.plantasAdicionales ? ` · ~${pe.brechaArea.plantasAdicionales} plantas más` : ''}</div>
            </div>` : ''}
            ${pe.superaPE ? `
            <div style="margin-top:0.5rem;padding:0.5rem;background:var(--green-50);border-radius:6px;">
              <div class="text-sm text-green"><strong>✅ Supera el punto de equilibrio</strong> — Ingreso: $${pe.ingresoTotal.toFixed(2)}</div>
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
    `;
  }

  // ══════════════════════════════════════════
  // CSV EXPORT
  // ══════════════════════════════════════════
  function exportCSV(ventas, costos, cropAnalysis, monthlyComparison) {
    let csv = 'Tipo,Fecha,Producto,Categoría,Cantidad,Unidad,Precio Unitario,Total,Comprador/Descripción\n';

    ventas.forEach(v => {
      csv += `Venta,${v.fecha || ''},${escCSV(v.producto || v.cultivo_nombre || '')},,${v.cantidad || ''},${v.unidad || ''},${v.precio_unitario || ''},${v.total || ''},${escCSV(v.comprador || '')}\n`;
    });
    costos.forEach(c => {
      csv += `Costo,${c.fecha || ''},,${escCSV(Format.costCategory(c.categoria))},${c.cantidad || ''},${c.unidad || ''},${c.costo_unitario || ''},${c.total || ''},${escCSV(c.descripcion || '')}\n`;
    });

    csv += '\n\nResumen por Cultivo\nCultivo,Ingresos,Costos,Ganancia,ROI\n';
    cropAnalysis.forEach(c => {
      csv += `${escCSV(c.nombre)},${c.ingresos},${c.costos},${c.ganancia},${c.roi.toFixed(1)}%\n`;
    });

    if (monthlyComparison.length > 0) {
      csv += '\n\nComparativa Mensual\nMes,Ingresos,Costos,Ganancia\n';
      monthlyComparison.forEach(m => {
        csv += `${m.mes},${m.ingresos},${m.costos},${m.ganancia}\n`;
      });
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `agrofinca-finanzas-${DateUtils.today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    App.showToast('CSV exportado', 'success');
  }

  function escCSV(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  return { render };
})();

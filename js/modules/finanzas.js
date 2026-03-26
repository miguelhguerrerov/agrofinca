// ============================================
// AgroFinca - Finanzas Module
// Financial analysis, P&L per cycle,
// ROI, cost breakdown, trends,
// Unit price evolution (seasonality)
// Period selector, premium gating, CSV export
// ============================================

const FinanzasModule = (() => {

  let _currentPeriod = 'year';
  let _currentTab = 'resumen';
  let _customStart = '';
  let _customEnd = '';
  let _fincaId = null;
  let _container = null;

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
      case 'quarter': return 'Últimos 3 meses';
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

  function distribuirCostos(costos, areaCultivos, areas) {
    const result = {};
    for (const costo of costos) {
      const tipo = costo.tipo_costo || 'variable';
      if (costo.cultivo_id) {
        if (!result[costo.cultivo_id]) result[costo.cultivo_id] = { fijos: 0, variables: 0, total: 0 };
        if (tipo === 'fijo') result[costo.cultivo_id].fijos += (costo.total || 0);
        else result[costo.cultivo_id].variables += (costo.total || 0);
        result[costo.cultivo_id].total += (costo.total || 0);
      } else if (costo.area_id) {
        const shares = areaCultivos.filter(ac => ac.area_id === costo.area_id && ac.activo);
        for (const sh of shares) {
          if (!result[sh.cultivo_id]) result[sh.cultivo_id] = { fijos: 0, variables: 0, total: 0 };
          const monto = (costo.total || 0) * (sh.proporcion || 0);
          if (tipo === 'fijo') result[sh.cultivo_id].fijos += monto;
          else result[sh.cultivo_id].variables += monto;
          result[sh.cultivo_id].total += monto;
        }
      } else {
        const totalAreaM2 = areaCultivos.filter(ac => ac.activo).reduce((s, ac) => {
          const area = areas.find(a => a.id === ac.area_id);
          return s + ((area?.area_m2 || 0) * (ac.proporcion || 0));
        }, 0);
        if (totalAreaM2 > 0) {
          for (const ac of areaCultivos.filter(x => x.activo)) {
            const area = areas.find(a => a.id === ac.area_id);
            const fraccion = ((area?.area_m2 || 0) * (ac.proporcion || 0)) / totalAreaM2;
            if (!result[ac.cultivo_id]) result[ac.cultivo_id] = { fijos: 0, variables: 0, total: 0 };
            const monto = (costo.total || 0) * fraccion;
            if (tipo === 'fijo') result[ac.cultivo_id].fijos += monto;
            else result[ac.cultivo_id].variables += monto;
            result[ac.cultivo_id].total += monto;
          }
        }
      }
    }
    return result;
  }

  async function render(container, fincaId) {
    _fincaId = fincaId;
    _container = container;
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    // Generate depreciation
    if (typeof ActivosModule !== 'undefined') {
      try { await ActivosModule.generarDepreciacion(fincaId); } catch {}
    }

    const [allVentas, allCostos, ciclos, cultivos, areas, areaCultivos, depreciacion, cosechas, clientes, proveedores] = await Promise.all([
      AgroDB.query('ventas', r => r.finca_id === fincaId),
      AgroDB.query('costos', r => r.finca_id === fincaId),
      AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId),
      AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId),
      AgroDB.getByIndex('areas', 'finca_id', fincaId).catch(() => []),
      AgroDB.query('area_cultivos', r => r.finca_id === fincaId).catch(() => []),
      AgroDB.query('depreciacion_mensual', r => r.finca_id === fincaId).catch(() => []),
      AgroDB.query('cosechas', r => r.finca_id === fincaId).catch(() => []),
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

    // Check premium status for advanced features
    const isPaid = typeof PlanGuard !== 'undefined' && PlanGuard.isPaid();

    // Per-crop analysis
    const cropAnalysis = [];
    for (const cultivo of cultivos) {
      const cVentas = ventas.filter(v => v.cultivo_id === cultivo.id).reduce((s, v) => s + (v.total || 0), 0);
      const cCostos = costos.filter(c => c.cultivo_id === cultivo.id).reduce((s, c) => s + (c.total || 0), 0);
      const cCostosReales = costos.filter(c => c.cultivo_id === cultivo.id && c.categoria !== 'mano_obra_familiar').reduce((s, c) => s + (c.total || 0), 0);
      cropAnalysis.push({
        nombre: cultivo.nombre,
        icono: cultivo.icono || '🌱',
        ingresos: cVentas,
        costos: cCostos,
        costosReales: cCostosReales,
        ganancia: cVentas - cCostos,
        gananciaReal: cVentas - cCostosReales,
        roi: cCostos > 0 ? ((cVentas - cCostos) / cCostos * 100) : 0
      });
    }

    // Per-cycle analysis
    const cycleAnalysis = [];
    for (const ciclo of ciclos) {
      const cVentas = ventas.filter(v => v.cultivo_id === ciclo.cultivo_id).reduce((s, v) => s + (v.total || 0), 0);
      const cCostos = costos.filter(c => c.ciclo_id === ciclo.id).reduce((s, c) => s + (c.total || 0), 0);
      cycleAnalysis.push({
        cultivo: ciclo.cultivo_nombre,
        area: ciclo.area_nombre,
        estado: ciclo.estado,
        inicio: ciclo.fecha_inicio,
        fin: ciclo.fecha_fin_real,
        ingresos: cVentas,
        costos: cCostos,
        ganancia: cVentas - cCostos
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

    // Monthly comparison table data (current year)
    const yearRange = DateUtils.currentYearRange();
    const monthlyComparison = [];
    const currentMonth = new Date().getMonth();
    for (let m = 0; m <= currentMonth; m++) {
      const d = new Date(new Date().getFullYear(), m, 1);
      const key = d.toISOString().substring(0, 7);
      const mIng = allVentas.filter(v => v.fecha?.startsWith(key)).reduce((s, v) => s + (v.total || 0), 0);
      const mCos = allCostos.filter(c => c.fecha?.startsWith(key)).reduce((s, c) => s + (c.total || 0), 0);
      monthlyComparison.push({
        mes: DateUtils.monthName(d.toISOString().split('T')[0]),
        ingresos: mIng,
        costos: mCos,
        ganancia: mIng - mCos
      });
    }

    // ==== PRICE EVOLUTION DATA ====
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

    // Price statistics
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

    // Distributed costs (all levels)
    const costosDistribuidos = distribuirCostos(costos, areaCultivos, areas);

    // Depreciation totals
    const rangeStart = range.start?.substring(0, 7) || '2000-01';
    const rangeEnd = range.end?.substring(0, 7) || '2099-12';
    const depFiltered = depreciacion.filter(d => d.mes >= rangeStart && d.mes <= rangeEnd);
    const totalDepreciacion = depFiltered.reduce((s, d) => s + (d.monto || 0), 0);

    // Pending collection
    const pendienteCobro = ventas.filter(v => v.cobrado === false).reduce((s, v) => s + (v.total || 0), 0);

    container.innerHTML = `
      <div class="page-header">
        <h2>📈 Análisis Financiero</h2>
        ${isPaid ? `<button class="btn btn-outline btn-sm" id="btn-export-csv">📄 Exportar CSV</button>` : ''}
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
      <div class="tabs-row">
        <button class="tab-btn ${_currentTab === 'resumen' ? 'active' : ''}" data-ftab="resumen">📊 Resumen</button>
        <button class="tab-btn ${_currentTab === 'cultivo' ? 'active' : ''}" data-ftab="cultivo">🌿 Cultivo</button>
        <button class="tab-btn ${_currentTab === 'area' ? 'active' : ''}" data-ftab="area">📍 Área</button>
        <button class="tab-btn ${_currentTab === 'rendimiento' ? 'active' : ''}" data-ftab="rendimiento">📈 Rendimiento</button>
        <button class="tab-btn ${_currentTab === 'clientes' ? 'active' : ''}" data-ftab="clientes">👥 Clientes</button>
        <button class="tab-btn ${_currentTab === 'proveedores' ? 'active' : ''}" data-ftab="proveedores">🏪 Proveedores</button>
        <button class="tab-btn ${_currentTab === 'equilibrio' ? 'active' : ''}" data-ftab="equilibrio">⚖️ Equilibrio</button>
      </div>

      <div id="finanzas-tab-content"></div>
    `;

    // Tab switching
    container.querySelectorAll('[data-ftab]').forEach(btn => {
      btn.addEventListener('click', () => {
        _currentTab = btn.dataset.ftab;
        render(container, fincaId);
      });
    });

    // Period switching
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

    // Render active tab
    const tabContent = document.getElementById('finanzas-tab-content');
    switch (_currentTab) {
      case 'resumen':
        renderResumen(tabContent, { totalIngresos, totalCostos, costosReales, costosFamiliares, gananciaReal, gananciaConFamiliar, roi, totalDepreciacion, pendienteCobro, cropAnalysis, cycleAnalysis, monthlyComparison, allVentas, allCostos, monthLabels, ingMensual, cosMensual, ganMensual, priceDatasets, priceMonthLabels, priceStats, isPaid });
        break;
      case 'cultivo':
        renderPorCultivo(tabContent, { cultivos, ventas, costos, costosDistribuidos, depFiltered, areaCultivos, areas, isPaid });
        break;
      case 'area':
        renderPorArea(tabContent, { areas, areaCultivos, cultivos, ventas, costos, depFiltered });
        break;
      case 'rendimiento':
        renderRendimiento(tabContent, { ciclos, cosechas, cultivos, areas, areaCultivos, ventas });
        break;
      case 'clientes':
        renderClientes(tabContent, { clientes, ventas });
        break;
      case 'proveedores':
        renderProveedores(tabContent, { proveedores, costos: allCostos });
        break;
      case 'equilibrio':
        renderPuntoEquilibrio(tabContent, { cultivos, ventas, costos, costosDistribuidos, areaCultivos, areas, ciclos, cosechas, isPaid });
        break;
    }
  }

  // ══════════════════════════════════════════
  // TAB: Resumen
  // ══════════════════════════════════════════
  function renderResumen(el, d) {
    el.innerHTML = `
      <!-- Global KPIs -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data"><div class="s-value">${Format.money(d.totalIngresos)}</div><div class="s-label">Ingresos</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon red">📉</div>
          <div class="s-data"><div class="s-value">${Format.money(d.totalCostos + d.totalDepreciacion)}</div><div class="s-label">Costos + Dep.</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon ${d.gananciaConFamiliar >= 0 ? 'green' : 'red'}">📊</div>
          <div class="s-data">
            <div class="s-value ${d.gananciaConFamiliar >= 0 ? 'text-green' : 'text-red'}">${Format.money(d.gananciaConFamiliar - d.totalDepreciacion)}</div>
            <div class="s-label">Ganancia neta</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📈</div>
          <div class="s-data"><div class="s-value">${Format.percent(d.roi)}</div><div class="s-label">ROI</div></div>
        </div>
      </div>

      <!-- Hidden costs card -->
      <div class="hidden-costs-card">
        <div class="card-title">👁️ Costos Ocultos</div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:0.5rem">
          <div><div class="text-sm text-muted">M.O. Familiar</div><div style="font-weight:700">${Format.money(d.costosFamiliares)}</div></div>
          <div><div class="text-sm text-muted">Depreciación</div><div style="font-weight:700">${Format.money(d.totalDepreciacion)}</div></div>
          <div><div class="text-sm text-muted">Total ocultos</div><div style="font-weight:700;color:var(--red-500)">${Format.money(d.costosFamiliares + d.totalDepreciacion)}</div></div>
        </div>
      </div>

      ${d.pendienteCobro > 0 ? `
      <div class="card" style="background:#FFF3E0;border-left:4px solid var(--amber-500)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>💳 Cuentas por cobrar</strong><div class="text-sm text-muted">Ventas a crédito pendientes</div></div>
          <div style="font-size:1.2rem;font-weight:700;color:var(--amber-700)">${Format.money(d.pendienteCobro)}</div>
        </div>
      </div>` : ''}

      <!-- Labor comparison -->
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

      <!-- Monthly comparison table (premium or basic) -->
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

      <!-- Trends chart -->
      <div class="card">
        <div class="card-title">Tendencia mensual (12 meses)</div>
        <div id="chart-tendencia" class="chart-container"></div>
      </div>
      <div class="card">
        <div class="card-title">Ganancia mensual</div>
        <div id="chart-ganancia" class="chart-container"></div>
      </div>
    `;

    // Charts
    Charts.lineChart('chart-tendencia', {
      labels: d.monthLabels,
      datasets: [
        { label: 'Ingresos', values: d.ingMensual, color: '#2E7D32' },
        { label: 'Costos', values: d.cosMensual, color: '#F44336' }
      ]
    }, { height: 220 });
    Charts.barChart('chart-ganancia', {
      labels: d.monthLabels,
      values: d.ganMensual,
      datasets: [{ values: d.ganMensual, color: '#2196F3' }]
    }, { height: 180 });
  }

  // ══════════════════════════════════════════
  // TAB: Por Cultivo (with distributed costs)
  // ══════════════════════════════════════════
  function renderPorCultivo(el, d) {
    const rows = d.cultivos.map(c => {
      const dist = d.costosDistribuidos[c.id] || { fijos: 0, variables: 0, total: 0 };
      const depCultivo = d.depFiltered.filter(dep => dep.cultivo_id === c.id).reduce((s, dep) => s + (dep.monto || 0), 0);
      const ingresos = d.ventas.filter(v => v.cultivo_id === c.id).reduce((s, v) => s + (v.total || 0), 0);
      const costoTotal = dist.total + depCultivo;
      const ganancia = ingresos - costoTotal;
      const roi = costoTotal > 0 ? ((ingresos - costoTotal) / costoTotal * 100) : 0;
      return { nombre: c.nombre, icono: c.icono || '🌱', ingresos, fijos: dist.fijos, variables: dist.variables, depreciacion: depCultivo, costoTotal, ganancia, roi };
    }).filter(r => r.ingresos > 0 || r.costoTotal > 0).sort((a, b) => b.ganancia - a.ganancia);

    el.innerHTML = `
      <div class="card">
        <div class="card-title">🌿 Rentabilidad por Cultivo (costos distribuidos)</div>
        <p class="text-sm text-muted">Incluye costos directos + de área + generales (distribuidos por superficie)</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Cultivo</th><th>Ingresos</th><th>C.Fijos</th><th>C.Variables</th><th>Dep.</th><th>Ganancia</th><th>ROI</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td>${r.icono} ${r.nombre}</td>
                <td class="text-green">${Format.money(r.ingresos)}</td>
                <td>${Format.money(r.fijos)}</td>
                <td>${Format.money(r.variables)}</td>
                <td>${Format.money(r.depreciacion)}</td>
                <td class="${r.ganancia >= 0 ? 'text-green' : 'text-red'}">${Format.money(r.ganancia)}</td>
                <td><span class="badge ${r.roi >= 0 ? 'badge-green' : 'badge-red'}">${r.roi.toFixed(1)}%</span></td>
              </tr>`).join('')}
              ${rows.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">Sin datos. Vincula costos a cultivos para ver el análisis.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
      ${rows.length > 0 ? '<div class="card"><div class="card-title">Ranking de Rentabilidad</div><div id="chart-ranking-cultivo" class="chart-container"></div></div>' : ''}`;

    if (rows.length > 0) {
      Charts.barChart('chart-ranking-cultivo', {
        labels: rows.map(r => r.nombre),
        datasets: [{ label: 'Ganancia', values: rows.map(r => r.ganancia), color: '#2196F3' }]
      }, { height: 200, horizontal: true });
    }
  }

  // ══════════════════════════════════════════
  // TAB: Por Área
  // ══════════════════════════════════════════
  function renderPorArea(el, d) {
    const areaRows = d.areas.filter(a => a.tipo === 'productivo').map(a => {
      const shares = d.areaCultivos.filter(ac => ac.area_id === a.id && ac.activo);
      const cultivos = shares.map(sh => {
        const c = d.cultivos.find(x => x.id === sh.cultivo_id);
        return `${Math.round((sh.proporcion || 0) * 100)}% ${c?.nombre || '?'}`;
      }).join(' · ') || (a.cultivo_actual_nombre || 'Sin cultivo');
      const aCostos = d.costos.filter(c => c.area_id === a.id).reduce((s, c) => s + (c.total || 0), 0);
      const areaSharedCultivos = shares.map(sh => sh.cultivo_id);
      const aVentas = d.ventas.filter(v => areaSharedCultivos.includes(v.cultivo_id)).reduce((s, v) => s + (v.total || 0), 0);
      const ganancia = aVentas - aCostos;
      const areaHa = (a.area_m2 || 0) / 10000;
      const gananciaHa = areaHa > 0 ? ganancia / areaHa : 0;
      return { nombre: a.nombre, area_m2: a.area_m2, areaHa, cultivos, ingresos: aVentas, costos: aCostos, ganancia, gananciaHa };
    });

    el.innerHTML = `
      <div class="card">
        <div class="card-title">📍 Rentabilidad por Área</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Área</th><th>Cultivos</th><th>Superficie</th><th>Ingresos</th><th>Costos</th><th>Ganancia</th><th>$/ha</th></tr></thead>
            <tbody>
              ${areaRows.map(r => `<tr>
                <td><strong>${r.nombre}</strong></td>
                <td class="text-xs">${r.cultivos}</td>
                <td>${Format.area(r.area_m2)}</td>
                <td class="text-green">${Format.money(r.ingresos)}</td>
                <td class="text-red">${Format.money(r.costos)}</td>
                <td class="${r.ganancia >= 0 ? 'text-green' : 'text-red'}">${Format.money(r.ganancia)}</td>
                <td>${Format.money(r.gananciaHa)}</td>
              </tr>`).join('')}
              ${areaRows.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">Sin áreas productivas</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════
  // TAB: Rendimiento
  // ══════════════════════════════════════════
  function renderRendimiento(el, d) {
    const rows = [];
    for (const ciclo of d.ciclos.filter(c => c.estado === 'activo' || c.estado === 'cosechado')) {
      const cultivo = d.cultivos.find(c => c.id === ciclo.cultivo_id);
      if (!cultivo) continue;
      const cicCosechas = d.cosechas.filter(c => c.ciclo_id === ciclo.id);
      if (cicCosechas.length === 0) continue;
      const totalKg = cicCosechas.reduce((s, c) => s + convertToKg(c.cantidad, c.unidad), 0);
      const area = ciclo.area_id ? d.areas.find(a => a.id === ciclo.area_id) : null;
      const share = d.areaCultivos.find(ac => ac.ciclo_id === ciclo.id);
      const proporcion = share?.proporcion || 1.0;
      const areaM2 = area ? (area.area_m2 || 0) * proporcion : 0;
      const areaHa = areaM2 / 10000;
      const tHa = areaHa > 0 ? (totalKg / 1000) / areaHa : 0;
      const kgPlanta = ciclo.cantidad_plantas > 0 ? totalKg / ciclo.cantidad_plantas : null;
      const ref = cultivo.rendimiento_referencia || 0;
      const pct = ref > 0 ? (tHa / ref) * 100 : null;
      const status = pct === null ? 'N/A' : pct >= 100 ? 'superior' : pct >= 70 ? 'cercano' : 'bajo';
      rows.push({ cultivo: cultivo.nombre, icono: cultivo.icono || '🌱', ciclo: ciclo.fecha_inicio, totalKg, tHa, kgPlanta, ref, pct, status, areaHa });
    }

    // Quality analysis
    const qualityData = {};
    for (const v of d.ventas) {
      const key = v.cultivo_nombre || v.producto;
      if (!key) continue;
      const cal = v.calidad || 'Sin grado';
      if (!qualityData[key]) qualityData[key] = {};
      if (!qualityData[key][cal]) qualityData[key][cal] = { cantidad: 0, total: 0 };
      qualityData[key][cal].cantidad += (v.cantidad || 0);
      qualityData[key][cal].total += (v.total || 0);
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-title">📈 Rendimiento Real vs Referencia ESPAC</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Cultivo</th><th>Cosechado</th><th>Real (t/ha)</th><th>Ref. ESPAC</th><th>% Cumplimiento</th><th>kg/planta</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td>${r.icono} ${r.cultivo}</td>
                <td>${r.totalKg.toFixed(1)} kg</td>
                <td><strong>${r.tHa.toFixed(2)}</strong></td>
                <td>${r.ref > 0 ? r.ref.toFixed(2) : '-'}</td>
                <td>${r.pct !== null ? `<div class="pe-bar" style="width:120px;height:14px"><div class="pe-bar-fill ${r.status === 'superior' ? 'above' : r.status === 'cercano' ? 'near' : 'below'}" style="width:${Math.min(r.pct, 100)}%"></div></div><span class="text-xs">${r.pct.toFixed(0)}%</span>` : '-'}</td>
                <td>${r.kgPlanta !== null ? r.kgPlanta.toFixed(2) : '-'}</td>
              </tr>`).join('')}
              ${rows.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">Sin cosechas registradas en ciclos activos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
      ${Object.keys(qualityData).length > 0 ? `
      <div class="card">
        <div class="card-title">🏅 Impacto de Calidad en Precio</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Producto</th><th>Calidad</th><th>Cantidad</th><th>Precio Promedio</th></tr></thead>
            <tbody>
              ${Object.entries(qualityData).flatMap(([prod, grades]) =>
                Object.entries(grades).map(([grade, data]) => `<tr>
                  <td>${prod}</td>
                  <td><span class="badge ${grade === 'A' ? 'badge-green' : grade === 'B' ? 'badge-amber' : 'badge-gray'}">${grade}</span></td>
                  <td>${data.cantidad.toFixed(1)}</td>
                  <td>${data.cantidad > 0 ? Format.money(data.total / data.cantidad) : '-'}/unidad</td>
                </tr>`)
              ).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}`;
  }

  // ══════════════════════════════════════════
  // TAB: Clientes
  // ══════════════════════════════════════════
  function renderClientes(el, d) {
    const avgPrecioGeneral = d.ventas.reduce((s, v) => s + (v.cantidad || 0), 0) > 0
      ? d.ventas.reduce((s, v) => s + (v.total || 0), 0) / d.ventas.reduce((s, v) => s + (v.cantidad || 0), 0) : 0;

    const stats = d.clientes.map(c => {
      const cVentas = d.ventas.filter(v => v.cliente_id === c.id || v.comprador === c.nombre);
      const total = cVentas.reduce((s, v) => s + (v.total || 0), 0);
      const cant = cVentas.reduce((s, v) => s + (v.cantidad || 0), 0);
      const precioPromedio = cant > 0 ? total / cant : 0;
      const pagaMejor = precioPromedio > avgPrecioGeneral * 1.05;
      const pendiente = cVentas.filter(v => v.cobrado === false).reduce((s, v) => s + (v.total || 0), 0);
      const fechas = cVentas.map(v => v.fecha).filter(f => f).sort();
      let frecuencia = null;
      if (fechas.length >= 2) {
        const diffs = [];
        for (let i = 1; i < fechas.length; i++) diffs.push((new Date(fechas[i]) - new Date(fechas[i - 1])) / 86400000);
        frecuencia = Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
      }
      return { ...c, total, numCompras: cVentas.length, precioPromedio, pagaMejor, pendiente, frecuencia };
    }).sort((a, b) => b.total - a.total);

    el.innerHTML = `
      <div class="card">
        <div class="card-title">👥 Análisis de Clientes</div>
        ${stats.length === 0 ? '<p class="text-sm text-muted">Registra clientes en el módulo de Ventas para ver el análisis.</p>' : `
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Cliente</th><th>Total comprado</th><th>Precio prom.</th><th>¿Paga mejor?</th><th>Frecuencia</th><th>Pendiente</th></tr></thead>
            <tbody>
              ${stats.map(c => `<tr>
                <td><strong>${c.nombre}</strong><div class="text-xs text-muted">${c.tipo || ''} · ${c.numCompras} compras</div></td>
                <td>${Format.money(c.total)}</td>
                <td>${c.precioPromedio > 0 ? Format.money(c.precioPromedio) + '/u' : '-'}</td>
                <td>${c.precioPromedio > 0 ? (c.pagaMejor ? '<span class="badge badge-green">✅ Sí</span>' : '<span class="badge badge-gray">No</span>') : '-'}</td>
                <td>${c.frecuencia ? 'Cada ~' + c.frecuencia + ' días' : '-'}</td>
                <td>${c.pendiente > 0 ? '<span style="color:var(--red-500);font-weight:700">' + Format.money(c.pendiente) + '</span>' : '-'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
      </div>`;
  }

  // ══════════════════════════════════════════
  // TAB: Proveedores
  // ══════════════════════════════════════════
  function renderProveedores(el, d) {
    const totalGastoGeneral = d.costos.reduce((s, c) => s + (c.total || 0), 0);

    const stats = d.proveedores.map(p => {
      const pCostos = d.costos.filter(c => c.proveedor_id === p.id || c.proveedor === p.nombre);
      const total = pCostos.reduce((s, c) => s + (c.total || 0), 0);
      const concentracion = totalGastoGeneral > 0 ? (total / totalGastoGeneral * 100) : 0;
      const categorias = [...new Set(pCostos.map(c => c.categoria).filter(Boolean))];
      return { ...p, total, numCompras: pCostos.length, concentracion, categorias };
    }).sort((a, b) => b.total - a.total);

    el.innerHTML = `
      <div class="card">
        <div class="card-title">🏪 Análisis de Proveedores</div>
        ${stats.length === 0 ? '<p class="text-sm text-muted">Registra proveedores en el módulo de Costos para ver el análisis.</p>' : `
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Proveedor</th><th>Total gastado</th><th>Concentración</th><th>Categorías</th><th># Compras</th></tr></thead>
            <tbody>
              ${stats.map(p => `<tr>
                <td><strong>${p.nombre}</strong><div class="text-xs text-muted">${p.tipo || ''}</div></td>
                <td>${Format.money(p.total)}</td>
                <td>
                  <div class="pe-bar" style="width:80px;height:12px"><div class="pe-bar-fill ${p.concentracion > 30 ? 'below' : 'above'}" style="width:${Math.min(p.concentracion, 100)}%"></div></div>
                  <span class="text-xs">${p.concentracion.toFixed(1)}%</span>
                  ${p.concentracion > 30 ? ' <span class="text-xs" style="color:var(--amber-700)">⚠️ Negociar</span>' : ''}
                </td>
                <td class="text-xs">${p.categorias.join(', ') || '-'}</td>
                <td>${p.numCompras}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
      </div>`;
  }

  // ══════════════════════════════════════════
  // TAB: Punto de Equilibrio
  // ══════════════════════════════════════════
  function renderPuntoEquilibrio(el, d) {
    if (!d.isPaid) {
      el.innerHTML = `<div class="card" style="text-align:center;padding:2rem">
        <div style="font-size:2rem">⚖️</div>
        <h3>Punto de Equilibrio</h3>
        <p class="text-sm text-muted">Analiza cuánto debes producir y vender para cubrir tus costos. Disponible en Premium.</p>
        <button class="btn btn-primary btn-sm" onclick="PlanGuard.showUpgradePrompt('Punto de Equilibrio')">⭐ Ver planes</button>
      </div>`;
      return;
    }

    const rows = d.cultivos.map(c => {
      const dist = d.costosDistribuidos[c.id] || { fijos: 0, variables: 0, total: 0 };
      const depCultivo = d.depFiltered?.filter(dep => dep.cultivo_id === c.id).reduce((s, dep) => s + (dep.monto || 0), 0) || 0;
      const cVentas = d.ventas.filter(v => v.cultivo_id === c.id);
      const cantVendida = cVentas.reduce((s, v) => s + (v.cantidad || 0), 0);
      const ingresoTotal = cVentas.reduce((s, v) => s + (v.total || 0), 0);
      if (cantVendida === 0 && dist.total === 0) return null;

      const costosFijos = dist.fijos + depCultivo;
      const costosVariables = dist.variables;
      const precioPromedio = cantVendida > 0 ? ingresoTotal / cantVendida : 0;
      const costoVarUnit = cantVendida > 0 ? costosVariables / cantVendida : 0;
      const margenContrib = precioPromedio - costoVarUnit;
      const peUnidades = margenContrib > 0 ? costosFijos / margenContrib : Infinity;
      const peDolares = peUnidades * precioPromedio;
      const superaPE = cantVendida >= peUnidades;
      const pctPE = peUnidades > 0 && peUnidades !== Infinity ? Math.min((cantVendida / peUnidades) * 100, 150) : 0;

      // Area gap
      let brecha = null;
      if (!superaPE && peUnidades !== Infinity) {
        const brechaUn = peUnidades - cantVendida;
        const cultivoShares = d.areaCultivos.filter(ac => ac.cultivo_id === c.id && ac.activo);
        let totalAreaM2 = 0;
        cultivoShares.forEach(sh => {
          const area = d.areas.find(a => a.id === sh.area_id);
          totalAreaM2 += (area?.area_m2 || 0) * (sh.proporcion || 0);
        });
        const rendPorM2 = totalAreaM2 > 0 ? cantVendida / totalAreaM2 : 0;
        const areaAdicM2 = rendPorM2 > 0 ? brechaUn / rendPorM2 : 0;
        const ciclo = d.ciclos.find(ci => ci.cultivo_id === c.id && ci.estado === 'activo');
        const kgPlanta = ciclo?.cantidad_plantas > 0 ? cantVendida / ciclo.cantidad_plantas : 0;
        const plantasAd = kgPlanta > 0 ? Math.ceil(brechaUn / kgPlanta) : null;

        brecha = { brechaUn, areaAdicM2, areaAdicHa: areaAdicM2 / 10000, plantasAd };
      }

      return { nombre: c.nombre, icono: c.icono || '🌱', cantVendida, peUnidades, peDolares, superaPE, pctPE, margenContrib, costosFijos, costosVariables, brecha };
    }).filter(Boolean);

    el.innerHTML = `
      <div class="card">
        <div class="card-title">⚖️ Punto de Equilibrio por Cultivo</div>
        <p class="text-sm text-muted">Cuánto debes vender para cubrir todos tus costos (fijos + variables + depreciación)</p>
        ${rows.map(r => `
          <div class="card" style="margin:0.75rem 0;padding:1rem;${r.superaPE ? 'border-left:4px solid var(--green-500)' : 'border-left:4px solid var(--red-500)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
              <strong>${r.icono} ${r.nombre}</strong>
              <span class="badge ${r.superaPE ? 'badge-green' : 'badge-red'}">${r.superaPE ? '✅ Superado' : '❌ No alcanzado'}</span>
            </div>
            <div class="pe-bar"><div class="pe-bar-fill ${r.superaPE ? 'above' : r.pctPE >= 70 ? 'near' : 'below'}" style="width:${Math.min(r.pctPE, 100)}%"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--gray-600)">
              <span>Actual: ${r.cantVendida.toFixed(1)} u</span>
              <span>PE: ${r.peUnidades !== Infinity ? r.peUnidades.toFixed(1) + ' u ($' + r.peDolares.toFixed(2) + ')' : 'N/A'}</span>
            </div>
            <div style="font-size:0.8rem;margin-top:0.5rem;color:var(--gray-500)">
              Margen contribución: ${Format.money(r.margenContrib)}/u · C.Fijos: ${Format.money(r.costosFijos)} · C.Variables: ${Format.money(r.costosVariables)}
            </div>
            ${r.brecha ? `
            <div style="background:var(--yellow-50);padding:0.5rem;border-radius:6px;margin-top:0.5rem;font-size:0.82rem">
              <strong>📐 Brecha:</strong> ${r.brecha.brechaUn.toFixed(1)} unidades más
              ${r.brecha.areaAdicM2 > 0 ? `· Necesitas <strong>+${r.brecha.areaAdicM2.toFixed(0)} m²</strong> (${r.brecha.areaAdicHa.toFixed(3)} ha)` : ''}
              ${r.brecha.plantasAd ? ` · ~${r.brecha.plantasAd} plantas adicionales` : ''}
            </div>` : ''}
          </div>
        `).join('')}
        ${rows.length === 0 ? '<p class="text-sm text-muted">Registra ventas y costos vinculados a cultivos para ver el punto de equilibrio.</p>' : ''}
      </div>`;
  }

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

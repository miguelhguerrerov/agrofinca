// ============================================
// AgroFinca - Finanzas Module
// Financial analysis, P&L per cycle,
// ROI, cost breakdown, trends,
// Unit price evolution (seasonality)
// Period selector, premium gating, CSV export
// ============================================

const FinanzasModule = (() => {

  let _currentPeriod = 'year'; // month, quarter, year, custom
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
      case 'quarter': return 'Últimos 3 meses';
      case 'year': return 'Este año';
      case 'all': return 'Todo el historial';
      case 'custom': return `${_customStart} a ${_customEnd}`;
      default: return 'Este año';
    }
  }

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const [allVentas, allCostos, ciclos, cultivos] = await Promise.all([
      AgroDB.query('ventas', r => r.finca_id === fincaId),
      AgroDB.query('costos', r => r.finca_id === fincaId),
      AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId),
      AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId)
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

      <!-- Global KPIs -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data"><div class="s-value">${Format.money(totalIngresos)}</div><div class="s-label">Ingresos</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon red">📉</div>
          <div class="s-data"><div class="s-value">${Format.money(totalCostos)}</div><div class="s-label">Costos</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon ${gananciaConFamiliar >= 0 ? 'green' : 'red'}">📊</div>
          <div class="s-data">
            <div class="s-value ${gananciaConFamiliar >= 0 ? 'text-green' : 'text-red'}">${Format.money(gananciaConFamiliar)}</div>
            <div class="s-label">Ganancia neta</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📈</div>
          <div class="s-data"><div class="s-value">${Format.percent(roi)}</div><div class="s-label">ROI</div></div>
        </div>
      </div>

      <!-- Labor comparison -->
      <div class="card" style="background:#FFF8E1;">
        <div class="card-title">👨‍🌾 Impacto de la Mano de Obra Familiar</div>
        <div class="form-row" style="gap:1rem;">
          <div>
            <div class="text-sm text-muted">SIN M.O. familiar:</div>
            <div class="s-value text-green">${Format.money(gananciaReal)}</div>
          </div>
          <div>
            <div class="text-sm text-muted">CON M.O. familiar:</div>
            <div class="s-value ${gananciaConFamiliar >= 0 ? 'text-green' : 'text-red'}">${Format.money(gananciaConFamiliar)}</div>
          </div>
          <div>
            <div class="text-sm text-muted">Valor M.O. familiar:</div>
            <div class="s-value text-amber">${Format.money(costosFamiliares)}</div>
          </div>
        </div>
      </div>

      <!-- Monthly comparison table (premium or basic) -->
      ${isPaid ? `
      <div class="card">
        <div class="card-title">📅 Comparativa Mensual ${new Date().getFullYear()}</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Mes</th><th>Ingresos</th><th>Costos</th><th>Ganancia</th></tr>
            </thead>
            <tbody>
              ${monthlyComparison.map(m => `
                <tr>
                  <td style="text-transform:capitalize;">${m.mes}</td>
                  <td class="text-green">${Format.money(m.ingresos)}</td>
                  <td class="text-red">${Format.money(m.costos)}</td>
                  <td class="${m.ganancia >= 0 ? 'text-green' : 'text-red'}">${Format.money(m.ganancia)}</td>
                </tr>
              `).join('')}
              <tr style="font-weight:bold;border-top:2px solid var(--border);">
                <td>TOTAL</td>
                <td class="text-green">${Format.money(monthlyComparison.reduce((s, m) => s + m.ingresos, 0))}</td>
                <td class="text-red">${Format.money(monthlyComparison.reduce((s, m) => s + m.costos, 0))}</td>
                <td class="${monthlyComparison.reduce((s, m) => s + m.ganancia, 0) >= 0 ? 'text-green' : 'text-red'}">${Format.money(monthlyComparison.reduce((s, m) => s + m.ganancia, 0))}</td>
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

      <!-- Price evolution -->
      <div class="card">
        <div class="card-title">📊 Evolución de Precios Unitarios</div>
        <p class="text-sm text-muted mb-1">Precio unitario promedio por producto (12 meses)</p>
        ${priceDatasets.length > 0 ?
          `<div id="chart-precios-evolucion" class="chart-container"></div>` :
          '<p class="text-sm text-muted">Se necesitan al menos 2 ventas del mismo producto para mostrar tendencias.</p>'}
      </div>

      ${priceStats.length > 0 ? `
      <div class="card">
        <div class="card-title">📉 Variación de Precios</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Producto</th><th>Promedio</th><th>Mín.</th><th>Máx.</th><th>Variación</th><th>#</th></tr>
            </thead>
            <tbody>
              ${priceStats.map(p => `
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

      <!-- Trends chart (12 months) -->
      <div class="card">
        <div class="card-title">Tendencia mensual (12 meses)</div>
        <div id="chart-tendencia" class="chart-container"></div>
      </div>

      <!-- Profitability chart -->
      <div class="card">
        <div class="card-title">Ganancia mensual</div>
        <div id="chart-ganancia" class="chart-container"></div>
      </div>

      <!-- Per-crop analysis -->
      <div class="card">
        <div class="card-title">Rentabilidad por Cultivo</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Cultivo</th><th>Ingresos</th><th>Costos</th><th>Ganancia</th><th>ROI</th></tr>
            </thead>
            <tbody>
              ${cropAnalysis.map(c => `
                <tr>
                  <td>${c.icono} ${c.nombre}</td>
                  <td class="text-green">${Format.money(c.ingresos)}</td>
                  <td class="text-red">${Format.money(c.costos)}</td>
                  <td class="${c.ganancia >= 0 ? 'text-green' : 'text-red'}">${Format.money(c.ganancia)}</td>
                  <td><span class="badge ${c.roi >= 0 ? 'badge-green' : 'badge-red'}">${Format.percent(c.roi)}</span></td>
                </tr>
              `).join('')}
              ${cropAnalysis.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">Sin datos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per-cycle analysis -->
      <div class="card">
        <div class="card-title">Análisis por Ciclo Productivo</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Cultivo</th><th>Área</th><th>Estado</th><th>Período</th><th>Ingresos</th><th>Costos</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              ${cycleAnalysis.map(c => `
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
              ${cycleAnalysis.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">Sin ciclos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Stacked income by product -->
      <div class="card">
        <div class="card-title">Ingresos vs Costos por Cultivo</div>
        <div id="chart-cultivo-compare" class="chart-container"></div>
      </div>

      <!-- Horizontal ranking -->
      ${cropAnalysis.length > 0 ? `
      <div class="card">
        <div class="card-title">Ranking de Rentabilidad</div>
        <div id="chart-ranking" class="chart-container"></div>
      </div>` : ''}
    `;

    // ======= EVENT LISTENERS =======

    // Period selector
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _currentPeriod = btn.dataset.period;
        render(container, fincaId);
      });
    });
    document.getElementById('btn-custom-period')?.addEventListener('click', () => {
      const inputs = document.getElementById('custom-period-inputs');
      inputs.style.display = inputs.style.display === 'none' ? 'flex' : 'none';
    });
    document.getElementById('btn-apply-period')?.addEventListener('click', () => {
      _customStart = document.getElementById('period-start').value;
      _customEnd = document.getElementById('period-end').value;
      if (_customStart && _customEnd) {
        _currentPeriod = 'custom';
        render(container, fincaId);
      }
    });

    // CSV Export (premium)
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      if (!isPaid) { PlanGuard.showUpgradePrompt('Exportar CSV'); return; }
      exportCSV(allVentas, allCostos, cropAnalysis, monthlyComparison);
    });

    // ======= CHARTS =======

    // Price evolution
    if (priceDatasets.length > 0) {
      const filledDatasets = priceDatasets.map(ds => {
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
        labels: priceMonthLabels,
        datasets: filledDatasets
      }, { height: 250, title: 'Precio unitario promedio ($)' });
    }

    // Income vs costs trend (12 months)
    Charts.lineChart('chart-tendencia', {
      labels: monthLabels,
      datasets: [
        { label: 'Ingresos', values: ingMensual, color: '#2E7D32' },
        { label: 'Costos', values: cosMensual, color: '#F44336' }
      ]
    }, { height: 220, title: '' });

    // Monthly profit
    Charts.barChart('chart-ganancia', {
      labels: monthLabels,
      values: ganMensual,
      datasets: [{ values: ganMensual, color: '#2196F3' }]
    }, { height: 180 });

    // Crop comparison (stacked)
    if (cropAnalysis.length > 0) {
      Charts.barChart('chart-cultivo-compare', {
        labels: cropAnalysis.map(c => c.nombre),
        datasets: [
          { label: 'Ingresos', values: cropAnalysis.map(c => c.ingresos), color: '#2E7D32' },
          { label: 'Costos', values: cropAnalysis.map(c => c.costos), color: '#F44336' }
        ]
      }, { height: 220 });

      // Ranking horizontal
      const sortedCrops = [...cropAnalysis].sort((a, b) => b.ganancia - a.ganancia);
      Charts.barChart('chart-ranking', {
        labels: sortedCrops.map(c => c.nombre),
        datasets: [{ label: 'Ganancia', values: sortedCrops.map(c => c.ganancia), color: '#2196F3' }]
      }, { height: 180, horizontal: true });
    }
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

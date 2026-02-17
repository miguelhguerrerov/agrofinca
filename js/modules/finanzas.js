// ============================================
// AgroFinca - Finanzas Module
// Financial analysis, P&L per cycle,
// ROI, cost breakdown, trends,
// Unit price evolution (seasonality)
// ============================================

const FinanzasModule = (() => {

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const [ventas, costos, ciclos, cultivos] = await Promise.all([
      AgroDB.query('ventas', r => r.finca_id === fincaId),
      AgroDB.query('costos', r => r.finca_id === fincaId),
      AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId),
      AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId)
    ]);

    const totalIngresos = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const totalCostos = costos.reduce((s, c) => s + (c.total || 0), 0);
    const costosReales = costos.filter(c => c.categoria !== 'mano_obra_familiar').reduce((s, c) => s + (c.total || 0), 0);
    const costosFamiliares = costos.filter(c => c.categoria === 'mano_obra_familiar').reduce((s, c) => s + (c.total || 0), 0);
    const gananciaReal = totalIngresos - costosReales;
    const gananciaConFamiliar = totalIngresos - totalCostos;
    const roi = totalCostos > 0 ? ((totalIngresos - totalCostos) / totalCostos * 100) : 0;

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

    // Monthly trends (last 6 months)
    const monthLabels = [];
    const ingMensual = [];
    const cosMensual = [];
    const ganMensual = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().substring(0, 7);
      monthLabels.push(DateUtils.monthName(d.toISOString().split('T')[0]).substring(0, 3));
      const mIng = ventas.filter(v => v.fecha?.startsWith(key)).reduce((s, v) => s + (v.total || 0), 0);
      const mCos = costos.filter(c => c.fecha?.startsWith(key)).reduce((s, c) => s + (c.total || 0), 0);
      ingMensual.push(mIng);
      cosMensual.push(mCos);
      ganMensual.push(mIng - mCos);
    }

    // ==== PRICE EVOLUTION DATA ====
    // Group sales by product and month, calculate average unit price
    const productosConVentas = {};
    ventas.forEach(v => {
      const key = v.cultivo_nombre || v.producto || 'Sin nombre';
      if (!productosConVentas[key]) productosConVentas[key] = [];
      productosConVentas[key].push(v);
    });

    // Build monthly price data for last 12 months
    const priceMonthLabels = [];
    const priceDatasets = [];
    const chartColors = ['#2E7D32', '#F44336', '#2196F3', '#FFA000', '#9C27B0', '#00BCD4', '#795548', '#FF5722'];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().substring(0, 7);
      priceMonthLabels.push(DateUtils.monthName(d.toISOString().split('T')[0]).substring(0, 3));
    }

    let colorIdx = 0;
    for (const [producto, ventasProd] of Object.entries(productosConVentas)) {
      if (ventasProd.length < 2) continue; // Need at least 2 sales to show trend
      const values = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const key = d.toISOString().substring(0, 7);
        const ventasMes = ventasProd.filter(v => v.fecha?.startsWith(key));
        if (ventasMes.length > 0) {
          const avgPrice = ventasMes.reduce((s, v) => s + (v.precio_unitario || 0), 0) / ventasMes.length;
          values.push(parseFloat(avgPrice.toFixed(2)));
        } else {
          values.push(null); // No data for this month
        }
      }
      // Only add if we have some data points
      if (values.some(v => v !== null)) {
        priceDatasets.push({
          label: producto,
          values: values,
          color: chartColors[colorIdx % chartColors.length]
        });
        colorIdx++;
      }
    }

    // Price statistics table
    const priceStats = [];
    for (const [producto, ventasProd] of Object.entries(productosConVentas)) {
      const precios = ventasProd.filter(v => v.precio_unitario > 0).map(v => v.precio_unitario);
      if (precios.length === 0) continue;
      const unidad = ventasProd[0]?.unidad || 'unidad';
      const avg = precios.reduce((s, p) => s + p, 0) / precios.length;
      const min = Math.min(...precios);
      const max = Math.max(...precios);
      const stdDev = precios.length > 1 ? Math.sqrt(precios.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / precios.length) : 0;
      const cv = avg > 0 ? (stdDev / avg * 100) : 0; // Coefficient of variation (seasonality indicator)

      priceStats.push({
        producto,
        unidad,
        promedio: avg,
        minimo: min,
        maximo: max,
        variacion: cv,
        ventas: precios.length
      });
    }

    container.innerHTML = `
      <div class="page-header"><h2>📈 Análisis Financiero</h2></div>

      <!-- Global KPIs -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data"><div class="s-value">${Format.money(totalIngresos)}</div><div class="s-label">Ingresos totales</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon red">📉</div>
          <div class="s-data"><div class="s-value">${Format.money(totalCostos)}</div><div class="s-label">Costos totales</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon ${gananciaConFamiliar >= 0 ? 'green' : 'red'}">📊</div>
          <div class="s-data">
            <div class="s-value ${gananciaConFamiliar >= 0 ? 'text-green' : 'text-red'}">${Format.money(gananciaConFamiliar)}</div>
            <div class="s-label">Ganancia (con M.O. familiar)</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📈</div>
          <div class="s-data"><div class="s-value">${Format.percent(roi)}</div><div class="s-label">ROI General</div></div>
        </div>
      </div>

      <!-- Labor comparison -->
      <div class="card" style="background:#FFF8E1;">
        <div class="card-title">👨‍🌾 Impacto de la Mano de Obra Familiar</div>
        <div class="form-row" style="gap:1rem;">
          <div>
            <div class="text-sm text-muted">Ganancia SIN valorar M.O. familiar:</div>
            <div class="s-value text-green">${Format.money(gananciaReal)}</div>
          </div>
          <div>
            <div class="text-sm text-muted">Ganancia CON M.O. familiar valorada:</div>
            <div class="s-value ${gananciaConFamiliar >= 0 ? 'text-green' : 'text-red'}">${Format.money(gananciaConFamiliar)}</div>
          </div>
          <div>
            <div class="text-sm text-muted">Valor M.O. familiar:</div>
            <div class="s-value text-amber">${Format.money(costosFamiliares)}</div>
          </div>
        </div>
      </div>

      <!-- ====== PRICE EVOLUTION SECTION ====== -->
      <div class="card">
        <div class="card-title">📊 Evolución de Precios Unitarios (Estacionalidad)</div>
        <p class="text-sm text-muted mb-1">Precio unitario promedio por producto en los últimos 12 meses. Útil para detectar patrones estacionales.</p>
        ${priceDatasets.length > 0 ?
          `<div id="chart-precios-evolucion" class="chart-container"></div>` :
          '<p class="text-sm text-muted">No hay suficientes datos de ventas para mostrar tendencias. Se necesitan al menos 2 ventas del mismo producto.</p>'}
      </div>

      ${priceStats.length > 0 ? `
      <div class="card">
        <div class="card-title">📉 Análisis de Variación de Precios</div>
        <p class="text-sm text-muted mb-1">Coeficiente de variación alto (>20%) indica posible estacionalidad en el precio.</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Promedio</th>
                <th>Mín.</th>
                <th>Máx.</th>
                <th>Variación</th>
                <th># Ventas</th>
              </tr>
            </thead>
            <tbody>
              ${priceStats.map(p => `
                <tr>
                  <td>${p.producto}</td>
                  <td>${Format.money(p.promedio)}/${p.unidad}</td>
                  <td class="text-green">${Format.money(p.minimo)}</td>
                  <td class="text-red">${Format.money(p.maximo)}</td>
                  <td>
                    <span class="badge ${p.variacion > 20 ? 'badge-red' : p.variacion > 10 ? 'badge-amber' : 'badge-green'}">
                      ${p.variacion.toFixed(1)}%
                    </span>
                    ${p.variacion > 20 ? ' <span class="text-xs">⚠️ Estacional</span>' : ''}
                  </td>
                  <td>${p.ventas}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <!-- Trends chart -->
      <div class="card">
        <div class="card-title">Tendencia mensual (últimos 6 meses)</div>
        <div id="chart-tendencia" class="chart-container"></div>
      </div>

      <!-- Profitability chart -->
      <div class="card">
        <div class="card-title">Ganancia mensual</div>
        <div id="chart-ganancia" class="chart-container"></div>
      </div>

      <!-- Per-crop analysis -->
      <div class="card">
        <div class="card-title">Rentabilidad por Cultivo / Actividad</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Cultivo</th>
                <th>Ingresos</th>
                <th>Costos</th>
                <th>Ganancia</th>
                <th>ROI</th>
              </tr>
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
              <tr>
                <th>Cultivo</th>
                <th>Área</th>
                <th>Estado</th>
                <th>Período</th>
                <th>Ingresos</th>
                <th>Costos</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              ${cycleAnalysis.map(c => `
                <tr>
                  <td>${c.cultivo}</td>
                  <td>${c.area || '-'}</td>
                  <td><span class="badge ${c.estado === 'activo' ? 'badge-green' : 'badge-gray'}">${c.estado}</span></td>
                  <td class="text-xs">${Format.dateShort(c.inicio)}${c.fin ? '→' + Format.dateShort(c.fin) : ''}</td>
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

      <!-- Cost breakdown -->
      <div class="card">
        <div class="card-title">Comparativa: Ingresos vs Costos por Cultivo</div>
        <div id="chart-cultivo-compare" class="chart-container"></div>
      </div>
    `;

    // ======= CHARTS =======

    // Price evolution chart (12 months)
    if (priceDatasets.length > 0) {
      // Fill nulls with interpolation for smoother chart
      const filledDatasets = priceDatasets.map(ds => {
        const filled = [...ds.values];
        // Forward fill nulls
        let lastVal = null;
        for (let i = 0; i < filled.length; i++) {
          if (filled[i] !== null) lastVal = filled[i];
          else if (lastVal !== null) filled[i] = lastVal;
        }
        // Backward fill remaining
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

    // Income vs costs trend
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

    // Crop comparison
    if (cropAnalysis.length > 0) {
      Charts.barChart('chart-cultivo-compare', {
        labels: cropAnalysis.map(c => c.nombre),
        datasets: [
          { label: 'Ingresos', values: cropAnalysis.map(c => c.ingresos), color: '#2E7D32' },
          { label: 'Costos', values: cropAnalysis.map(c => c.costos), color: '#F44336' }
        ]
      }, { height: 220 });
    }
  }

  return { render };
})();

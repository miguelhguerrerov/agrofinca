// ============================================
// AgroFinca - Dashboard Module
// Main overview with KPIs, charts, alerts
// Monthly comparison, top products, trends
// ============================================

const DashboardModule = (() => {

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏡</div>
          <h3>Selecciona o crea una finca</h3>
          <p>Para ver el dashboard, primero selecciona una finca en el selector superior o crea una nueva.</p>
          <button class="btn btn-primary" id="dash-go-fincas">Ir a Mis Fincas</button>
        </div>
      `;
      document.getElementById('dash-go-fincas')?.addEventListener('click', () => App.navigateTo('fincas'));
      return;
    }

    const month = DateUtils.currentMonthRange();
    const prevMonth = DateUtils.previousMonthRange();

    const [cosechas, ventas, costos, tareas, ciclos, areas,
           ventasPrev, costosPrev] = await Promise.all([
      AgroDB.query('cosechas', r => r.finca_id === fincaId && r.fecha >= month.start && r.fecha <= month.end),
      AgroDB.query('ventas', r => r.finca_id === fincaId && r.fecha >= month.start && r.fecha <= month.end),
      AgroDB.query('costos', r => r.finca_id === fincaId && r.fecha >= month.start && r.fecha <= month.end),
      AgroDB.query('tareas', r => r.finca_id === fincaId && r.estado === 'pendiente'),
      AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo'),
      AgroDB.getByIndex('areas', 'finca_id', fincaId),
      AgroDB.query('ventas', r => r.finca_id === fincaId && r.fecha >= prevMonth.start && r.fecha <= prevMonth.end),
      AgroDB.query('costos', r => r.finca_id === fincaId && r.fecha >= prevMonth.start && r.fecha <= prevMonth.end)
    ]);

    const totalVentas = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const totalCostos = costos.reduce((s, c) => s + (c.total || 0), 0);
    const ganancia = totalVentas - totalCostos;

    const totalVentasPrev = ventasPrev.reduce((s, v) => s + (v.total || 0), 0);
    const totalCostosPrev = costosPrev.reduce((s, c) => s + (c.total || 0), 0);
    const gananciaPrev = totalVentasPrev - totalCostosPrev;

    // Overdue tasks
    const today = DateUtils.today();
    const tareasVencidas = tareas.filter(t => t.fecha_programada && t.fecha_programada < today);

    const weekend = DateUtils.nextWeekend();
    const tareasWeekend = tareas.filter(t =>
      t.fecha_programada === weekend.saturday || t.fecha_programada === weekend.sunday
    );

    // Top 3 products by revenue
    const productRevenue = {};
    ventas.forEach(v => {
      const key = v.cultivo_nombre || v.producto || 'Otro';
      productRevenue[key] = (productRevenue[key] || 0) + (v.total || 0);
    });
    const topProducts = Object.entries(productRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Get last 12 months data for chart
    const last12 = DateUtils.lastMonths(12);
    const ventasHist = await AgroDB.query('ventas', r => r.finca_id === fincaId && r.fecha >= last12.start);
    const costosHist = await AgroDB.query('costos', r => r.finca_id === fincaId && r.fecha >= last12.start);
    const monthLabels = [];
    const ventasMensuales = [];
    const costosMensuales = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().substring(0, 7);
      monthLabels.push(DateUtils.monthName(d.toISOString().split('T')[0]).substring(0, 3));
      ventasMensuales.push(ventasHist.filter(v => v.fecha?.startsWith(key)).reduce((s, v) => s + (v.total || 0), 0));
      costosMensuales.push(costosHist.filter(c => c.fecha?.startsWith(key)).reduce((s, c) => s + (c.total || 0), 0));
    }

    container.innerHTML = `
      <!-- KPIs -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data">
            <div class="s-value">${Format.money(totalVentas)}</div>
            <div class="s-label">Ventas del mes</div>
            ${renderDelta(totalVentas, totalVentasPrev)}
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon red">📉</div>
          <div class="s-data">
            <div class="s-value">${Format.money(totalCostos)}</div>
            <div class="s-label">Costos del mes</div>
            ${renderDelta(totalCostos, totalCostosPrev, true)}
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon ${ganancia >= 0 ? 'green' : 'red'}">📊</div>
          <div class="s-data">
            <div class="s-value ${ganancia >= 0 ? 'text-green' : 'text-red'}">${Format.money(ganancia)}</div>
            <div class="s-label">Ganancia del mes</div>
            ${renderDelta(ganancia, gananciaPrev)}
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">🌿</div>
          <div class="s-data">
            <div class="s-value">${ciclos.length}</div>
            <div class="s-label">Ciclos activos</div>
            ${tareasVencidas.length > 0 ? `<div class="text-xs text-red">${tareasVencidas.length} tareas vencidas</div>` : ''}
          </div>
        </div>
      </div>

      <!-- Top Products -->
      ${topProducts.length > 0 ? `
      <div class="card">
        <div class="card-header">
          <h3>🏆 Top Productos (este mes)</h3>
        </div>
        <div class="top-products">
          ${topProducts.map((p, i) => `
            <div class="data-list-item" style="padding:0.5rem 0;">
              <div class="data-list-left">
                <span class="top-rank">${i + 1}</span>
                <div class="data-list-title">${p[0]}</div>
              </div>
              <div class="data-list-right">
                <div class="data-list-value">${Format.money(p[1])}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Charts -->
      <div class="card">
        <div class="card-title">Ingresos vs Costos (últimos 12 meses)</div>
        <div id="chart-ingresos-costos" class="chart-container"></div>
      </div>

      <!-- Active Cycles -->
      <div class="card">
        <div class="card-header">
          <h3>🌱 Ciclos Activos</h3>
          <button class="btn btn-sm btn-outline" id="dash-go-prod">Ver todos</button>
        </div>
        ${ciclos.length === 0 ? '<p class="text-sm text-muted">No hay ciclos activos</p>' :
      ciclos.slice(0, 5).map(c => {
        const progress = DateUtils.cycleProgress(c.fecha_inicio, c.ciclo_dias);
        return `
              <div class="data-list-item" style="border-bottom:1px solid var(--gray-300);padding:0.6rem 0;">
                <div class="data-list-left">
                  <div class="data-list-title">${c.cultivo_nombre || 'Cultivo'}</div>
                  <div class="data-list-sub">${c.area_nombre || ''} · Inicio: ${Format.dateShort(c.fecha_inicio)}</div>
                  ${progress !== null ? `<div id="prog-${c.id}" style="margin-top:4px;"></div>` : '<span class="badge badge-green">Perenne</span>'}
                </div>
              </div>`;
      }).join('')}
      </div>

      <!-- Overdue Tasks -->
      ${tareasVencidas.length > 0 ? `
      <div class="card" style="border-left:3px solid var(--red-500);">
        <div class="card-header">
          <h3>⚠️ Tareas Vencidas (${tareasVencidas.length})</h3>
          <button class="btn btn-sm btn-outline" id="dash-go-tareas-overdue">Ver</button>
        </div>
        ${tareasVencidas.slice(0, 3).map(t => `
          <div class="data-list-item" style="padding:0.4rem 0;">
            <div class="data-list-title" style="color:var(--red-500);">${t.titulo}</div>
            <div class="data-list-sub">${Format.dateShort(t.fecha_programada)}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Weekend Tasks -->
      <div class="card">
        <div class="card-header">
          <h3>📅 Tareas este fin de semana</h3>
          <button class="btn btn-sm btn-outline" id="dash-go-tareas">Ver todas</button>
        </div>
        ${tareasWeekend.length === 0 ? '<p class="text-sm text-muted">No hay tareas programadas para este fin de semana</p>' :
      tareasWeekend.slice(0, 5).map(t => `
            <div class="data-list-item" style="padding:0.5rem 0;">
              <div class="data-list-left">
                <div class="data-list-title">${t.titulo}</div>
                <div class="data-list-sub">${DateUtils.weekdayName(t.fecha_programada)} · <span class="badge badge-${t.prioridad === 'alta' ? 'red' : t.prioridad === 'media' ? 'amber' : 'gray'}">${t.prioridad}</span></div>
              </div>
            </div>`).join('')}
      </div>

      <!-- Recent harvests -->
      <div class="card">
        <div class="card-header">
          <h3>🌾 Cosechas recientes</h3>
        </div>
        ${cosechas.length === 0 ? '<p class="text-sm text-muted">Sin cosechas este mes</p>' :
      cosechas.slice(0, 5).map(c => `
            <div class="data-list-item" style="padding:0.5rem 0;">
              <div class="data-list-left">
                <div class="data-list-title">${c.cultivo_nombre || 'Cosecha'}</div>
                <div class="data-list-sub">${Format.dateShort(c.fecha)}</div>
              </div>
              <div class="data-list-right">
                <div class="data-list-value">${Format.unit(c.cantidad, c.unidad)}</div>
              </div>
            </div>`).join('')}
      </div>

      <!-- Areas overview -->
      <div class="card">
        <div class="card-header">
          <h3>🗺️ Áreas (${areas.length})</h3>
          <button class="btn btn-sm btn-outline" id="dash-go-fincas2">Gestionar</button>
        </div>
        ${areas.map(a => `
          <div class="data-list-item" style="padding:0.4rem 0;">
            <div class="flex gap-1" style="align-items:center;">
              <span class="area-color" style="background:${a.color || '#4CAF50'}"></span>
              <span class="text-sm">${a.nombre}</span>
              <span class="badge badge-green">${a.cultivo_actual_nombre || 'Sin cultivo'}</span>
            </div>
            <span class="text-sm text-muted">${Format.area(a.area_m2)}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Render charts
    Charts.barChart('chart-ingresos-costos', {
      labels: monthLabels,
      datasets: [
        { label: 'Ingresos', values: ventasMensuales, color: '#2E7D32' },
        { label: 'Costos', values: costosMensuales, color: '#F44336' }
      ]
    }, { height: 220 });

    // Progress bars for cycles
    ciclos.slice(0, 5).forEach(c => {
      const progress = DateUtils.cycleProgress(c.fecha_inicio, c.ciclo_dias);
      if (progress !== null) {
        Charts.progressBar(`prog-${c.id}`, progress, 100, {
          label: `${Math.round(progress)}% del ciclo`,
          color: progress > 80 ? '#FFA000' : '#4CAF50',
          height: 8,
          showPercent: false
        });
      }
    });

    // Navigation buttons
    document.getElementById('dash-go-prod')?.addEventListener('click', () => App.navigateTo('produccion'));
    document.getElementById('dash-go-tareas')?.addEventListener('click', () => App.navigateTo('tareas'));
    document.getElementById('dash-go-tareas-overdue')?.addEventListener('click', () => App.navigateTo('tareas'));
    document.getElementById('dash-go-fincas')?.addEventListener('click', () => App.navigateTo('fincas'));
    document.getElementById('dash-go-fincas2')?.addEventListener('click', () => App.navigateTo('fincas'));
  }

  // Render delta comparison vs previous month
  function renderDelta(current, previous, invertColors = false) {
    if (previous === 0) return '';
    const delta = previous > 0 ? ((current - previous) / previous * 100) : 0;
    if (Math.abs(delta) < 0.5) return '';
    const isUp = delta > 0;
    const isGood = invertColors ? !isUp : isUp;
    const arrow = isUp ? '↑' : '↓';
    const color = isGood ? 'var(--green-700)' : 'var(--red-500)';
    return `<div class="text-xs" style="color:${color};">${arrow} ${Math.abs(delta).toFixed(0)}% vs mes anterior</div>`;
  }

  return { render };
})();

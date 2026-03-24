// ============================================
// AgroFinca - Dashboard Module (v2)
// Smart onboarding, KPIs, charts, alerts
// Guides new users through setup steps
// ============================================

const DashboardModule = (() => {

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏡</div>
          <h3>Bienvenido a AgroFinca</h3>
          <p>Para comenzar, crea tu primera finca. Desde ella podrás gestionar áreas, cultivos, producción y finanzas.</p>
          <button class="btn btn-primary" id="dash-go-fincas">
            <span style="font-size:1.2rem;">+</span> Crear mi primera finca
          </button>
        </div>
      `;
      document.getElementById('dash-go-fincas')?.addEventListener('click', () => App.navigateTo('fincas'));
      return;
    }

    // Load all data needed for dashboard + onboarding checks
    const month = DateUtils.currentMonthRange();
    const prevMonth = DateUtils.previousMonthRange();

    const [cosechas, ventas, costos, tareas, ciclos, areas, cultivos,
           ventasPrev, costosPrev] = await Promise.all([
      AgroDB.query('cosechas', r => r.finca_id === fincaId && r.fecha >= month.start && r.fecha <= month.end),
      AgroDB.query('ventas', r => r.finca_id === fincaId && r.fecha >= month.start && r.fecha <= month.end),
      AgroDB.query('costos', r => r.finca_id === fincaId && r.fecha >= month.start && r.fecha <= month.end),
      AgroDB.query('tareas', r => r.finca_id === fincaId && r.estado === 'pendiente'),
      AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo'),
      AgroDB.getByIndex('areas', 'finca_id', fincaId),
      AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId),
      AgroDB.query('ventas', r => r.finca_id === fincaId && r.fecha >= prevMonth.start && r.fecha <= prevMonth.end),
      AgroDB.query('costos', r => r.finca_id === fincaId && r.fecha >= prevMonth.start && r.fecha <= prevMonth.end)
    ]);

    // Determine onboarding status
    const hasAreas = areas.length > 0;
    const hasCultivos = cultivos.length > 0;
    const hasCiclos = ciclos.length > 0;
    const isNewUser = !hasAreas && !hasCultivos && !hasCiclos;
    const needsSetup = !hasAreas || !hasCultivos || !hasCiclos;

    // Build HTML
    let html = '';

    // ===== ONBOARDING WIZARD (only if setup incomplete) =====
    if (needsSetup) {
      html += renderOnboardingSteps(hasAreas, hasCultivos, hasCiclos, areas.length, cultivos.length, ciclos.length);
    }

    // ===== KPI CARDS =====
    const totalVentas = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const totalCostos = costos.reduce((s, c) => s + (c.total || 0), 0);
    const ganancia = totalVentas - totalCostos;
    const totalVentasPrev = ventasPrev.reduce((s, v) => s + (v.total || 0), 0);
    const totalCostosPrev = costosPrev.reduce((s, c) => s + (c.total || 0), 0);
    const gananciaPrev = totalVentasPrev - totalCostosPrev;

    html += `
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
          </div>
        </div>
      </div>
    `;

    // ===== AI PROACTIVE SECTION (Premium only) =====
    if (typeof PlanGuard !== 'undefined' && PlanGuard.isPaid()) {
      html += `
        <div class="card ai-tip-card" id="ai-tip-card">
          <div class="card-header">
            <h3>💡 Consejo del Día</h3>
            <button class="btn btn-sm btn-outline" id="ai-tip-refresh" title="Nuevo consejo">🔄</button>
          </div>
          <div id="ai-tip-content" class="ai-tip-content">
            <div class="ai-loading"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span> Pensando...</div>
          </div>
        </div>
        <div class="card ai-reminders-card" id="ai-reminders-card">
          <div class="card-header">
            <h3>🔔 Alertas Inteligentes</h3>
          </div>
          <div id="ai-reminders-content">
            <div class="ai-loading"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span> Analizando...</div>
          </div>
        </div>
      `;
    }

    // ===== OVERDUE TASKS ALERT =====
    const today = DateUtils.today();
    const tareasVencidas = tareas.filter(t => t.fecha_programada && t.fecha_programada < today);
    if (tareasVencidas.length > 0) {
      html += `
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
      `;
    }

    // ===== TOP PRODUCTS =====
    const productRevenue = {};
    ventas.forEach(v => {
      const key = v.cultivo_nombre || v.producto || 'Otro';
      productRevenue[key] = (productRevenue[key] || 0) + (v.total || 0);
    });
    const topProducts = Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 3);

    if (topProducts.length > 0) {
      html += `
        <div class="card">
          <div class="card-header"><h3>🏆 Top Productos (este mes)</h3></div>
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
      `;
    }

    // ===== CHART =====
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

    // Only show chart if there's financial data
    const hasFinancialData = ventasMensuales.some(v => v > 0) || costosMensuales.some(c => c > 0);
    if (hasFinancialData) {
      html += `
        <div class="card">
          <div class="card-title">Ingresos vs Costos (últimos 12 meses)</div>
          <div id="chart-ingresos-costos" class="chart-container"></div>
        </div>
      `;
    }

    // ===== ACTIVE CYCLES =====
    html += `
      <div class="card">
        <div class="card-header">
          <h3>🌱 Ciclos Activos</h3>
          <button class="btn btn-sm btn-outline" id="dash-go-prod">Ver todos</button>
        </div>
        ${ciclos.length === 0 ? `
          <div style="text-align:center;padding:1rem 0;">
            <p class="text-sm text-muted">No hay ciclos activos</p>
            ${hasCultivos ? '<button class="btn btn-sm btn-primary" id="dash-new-ciclo">+ Nuevo ciclo</button>' : ''}
          </div>
        ` : ciclos.slice(0, 5).map(c => {
          const progress = DateUtils.cycleProgress(c.fecha_inicio, c.ciclo_dias);
          return `
            <div class="data-list-item" style="border-bottom:1px solid var(--gray-300);padding:0.6rem 0;cursor:pointer;" data-goto-ciclo="${c.id}">
              <div class="data-list-left">
                <div class="data-list-title">${c.cultivo_nombre || 'Cultivo'}</div>
                <div class="data-list-sub">${c.area_nombre || ''} · Inicio: ${Format.dateShort(c.fecha_inicio)}</div>
                ${progress !== null ? `<div id="prog-${c.id}" style="margin-top:4px;"></div>` : '<span class="badge badge-green">Perenne</span>'}
              </div>
            </div>`;
        }).join('')}
      </div>
    `;

    // ===== WEEKEND TASKS =====
    const weekend = DateUtils.nextWeekend();
    const tareasWeekend = tareas.filter(t =>
      t.fecha_programada === weekend.saturday || t.fecha_programada === weekend.sunday
    );

    html += `
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
    `;

    // ===== RECENT HARVESTS =====
    html += `
      <div class="card">
        <div class="card-header"><h3>🌾 Cosechas recientes</h3></div>
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
    `;

    // ===== AREAS OVERVIEW =====
    html += `
      <div class="card">
        <div class="card-header">
          <h3>🗺️ Áreas (${areas.length})</h3>
          <button class="btn btn-sm btn-outline" id="dash-go-fincas2">Gestionar</button>
        </div>
        ${areas.length === 0 ? `
          <div style="text-align:center;padding:1rem 0;">
            <p class="text-sm text-muted">Sin áreas definidas</p>
            <button class="btn btn-sm btn-primary" id="dash-new-area">+ Crear área</button>
          </div>
        ` : areas.map(a => `
          <div class="data-list-item" style="padding:0.4rem 0;">
            <div class="flex gap-1" style="align-items:center;">
              <span class="area-color" style="background:${a.color || '#4CAF50'}"></span>
              <span class="text-sm">${a.nombre}</span>
              ${a.tipo ? `<span class="badge badge-${getAreaBadge(a.tipo)}">${a.tipo}</span>` : ''}
            </div>
            <span class="text-sm text-muted">${Format.area(a.area_m2)}</span>
          </div>
        `).join('')}
      </div>
    `;

    container.innerHTML = html;

    // ===== POST-RENDER: Charts + Events =====
    if (hasFinancialData) {
      Charts.barChart('chart-ingresos-costos', {
        labels: monthLabels,
        datasets: [
          { label: 'Ingresos', values: ventasMensuales, color: '#2E7D32' },
          { label: 'Costos', values: costosMensuales, color: '#F44336' }
        ]
      }, { height: 220 });
    }

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

    // Onboarding CTA buttons
    document.getElementById('dash-new-area')?.addEventListener('click', () => App.navigateTo('fincas'));
    document.getElementById('dash-new-ciclo')?.addEventListener('click', () => App.navigateTo('produccion'));

    // Onboarding step buttons
    document.getElementById('onboard-areas')?.addEventListener('click', () => App.navigateTo('fincas'));
    document.getElementById('onboard-cultivos')?.addEventListener('click', () => App.navigateTo('produccion'));
    document.getElementById('onboard-ciclo')?.addEventListener('click', () => App.navigateTo('produccion'));

    // Cycle cross-links
    container.querySelectorAll('[data-goto-ciclo]').forEach(el => {
      el.addEventListener('click', () => App.navigateTo('produccion'));
    });

    // ===== AI PROACTIVE LOADING (async, non-blocking) =====
    if (typeof PlanGuard !== 'undefined' && PlanGuard.isPaid() && typeof AIDataHelpers !== 'undefined') {
      loadDailyTip(fincaId);
      loadSmartReminders(fincaId);

      document.getElementById('ai-tip-refresh')?.addEventListener('click', () => {
        AICache.invalidate(`daily_tip_${fincaId}`);
        loadDailyTip(fincaId);
      });
    }
  }

  // Load daily AI tip
  async function loadDailyTip(fincaId) {
    const tipEl = document.getElementById('ai-tip-content');
    if (!tipEl) return;

    const cached = AICache.get(`daily_tip_${fincaId}`);
    if (cached) {
      tipEl.innerHTML = `<p class="ai-tip-text">${cached}</p>`;
      return;
    }

    try {
      const context = await AIDataHelpers.getDailyTipContext(fincaId);
      const result = await GeminiClient.dailyTip(context);
      const tip = result.response || result.text || '';
      if (tip) {
        AICache.set(`daily_tip_${fincaId}`, tip, 720); // 12 hours
        tipEl.innerHTML = `<p class="ai-tip-text">${tip}</p>`;
      } else {
        tipEl.innerHTML = '<p class="text-muted text-sm">No se pudo obtener el consejo.</p>';
      }
    } catch (err) {
      tipEl.innerHTML = `<p class="text-muted text-sm">Error: ${err.message}</p>`;
    }
  }

  // Load smart reminders
  async function loadSmartReminders(fincaId) {
    const remEl = document.getElementById('ai-reminders-content');
    if (!remEl) return;

    const cached = AICache.get(`reminders_${fincaId}`);
    if (cached) {
      renderReminders(remEl, cached);
      return;
    }

    try {
      const [issues, farm] = await Promise.all([
        AIDataHelpers.getPendingIssues(fincaId),
        AIDataHelpers.getFarmSummary(fincaId)
      ]);
      const result = await GeminiClient.smartReminders({ issues, farm });
      let reminders = [];
      try {
        const text = result.response || result.text || '[]';
        // Strip markdown code blocks if present
        const clean = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        reminders = JSON.parse(clean);
        if (!Array.isArray(reminders)) reminders = [];
      } catch {
        reminders = [];
      }

      if (reminders.length > 0) {
        AICache.set(`reminders_${fincaId}`, reminders, 360); // 6 hours
        renderReminders(remEl, reminders);
      } else {
        remEl.innerHTML = '<p class="text-sm text-muted">Todo parece en orden 👍</p>';
      }
    } catch (err) {
      remEl.innerHTML = `<p class="text-muted text-sm">Error: ${err.message}</p>`;
    }
  }

  function renderReminders(container, reminders) {
    const actionMap = {
      'crear_tarea': 'tareas',
      'ir_inspecciones': 'inspecciones',
      'ir_fitosanitario': 'fitosanitario',
      'ir_produccion': 'produccion',
      'ir_ventas': 'ventas',
      'ir_costos': 'costos',
      'ir_areas': 'fincas'
    };
    const priorityColors = { alta: 'red', media: 'amber', baja: 'blue' };

    container.innerHTML = reminders.slice(0, 3).map(r => `
      <div class="ai-reminder-item" data-action="${r.suggestedAction || ''}">
        <div class="ai-reminder-icon">${r.icon || '📌'}</div>
        <div class="ai-reminder-body">
          <div class="ai-reminder-title">${r.title || ''}</div>
          <div class="ai-reminder-desc">${r.description || ''}</div>
        </div>
        <span class="badge badge-${priorityColors[r.priority] || 'gray'}">${r.priority || ''}</span>
      </div>
    `).join('');

    container.querySelectorAll('.ai-reminder-item').forEach(el => {
      const action = el.dataset.action;
      if (action && actionMap[action]) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => App.navigateTo(actionMap[action]));
      }
    });
  }

  // Render onboarding stepper
  function renderOnboardingSteps(hasAreas, hasCultivos, hasCiclos, areaCount, cultivoCount, cicloCount) {
    const steps = [
      {
        done: true, // Finca already created (we have fincaId)
        icon: '🏡',
        title: 'Crear finca',
        desc: 'Finca creada ✓'
      },
      {
        done: hasAreas,
        icon: '🗺️',
        title: 'Definir áreas',
        desc: hasAreas ? `${areaCount} área(s) definida(s) ✓` : 'Dibuja tus parcelas en el mapa',
        btnId: 'onboard-areas',
        btnLabel: 'Crear áreas'
      },
      {
        done: hasCultivos,
        icon: '🌱',
        title: 'Agregar cultivos',
        desc: hasCultivos ? `${cultivoCount} cultivo(s) en catálogo ✓` : 'Define qué produces',
        btnId: 'onboard-cultivos',
        btnLabel: 'Ir a Producción'
      },
      {
        done: hasCiclos,
        icon: '🔄',
        title: 'Iniciar ciclo',
        desc: hasCiclos ? `${cicloCount} ciclo(s) activo(s) ✓` : 'Comienza a registrar producción',
        btnId: 'onboard-ciclo',
        btnLabel: 'Nuevo ciclo'
      }
    ];

    // Find first incomplete step
    const currentStep = steps.findIndex(s => !s.done);

    return `
      <div class="card" style="border-left:3px solid var(--primary-500);margin-bottom:1rem;">
        <div class="card-header">
          <h3>🚀 Configura tu finca</h3>
          <span class="badge badge-blue">${steps.filter(s => s.done).length}/4</span>
        </div>
        <div class="onboarding-steps">
          ${steps.map((step, i) => `
            <div class="onboarding-step ${step.done ? 'done' : ''} ${i === currentStep ? 'current' : ''}">
              <div class="step-indicator">
                ${step.done ? '<span style="color:var(--green-700);font-weight:700;">✓</span>' : `<span class="step-number">${i + 1}</span>`}
              </div>
              <div class="step-content">
                <div class="step-title">${step.icon} ${step.title}</div>
                <div class="step-desc">${step.desc}</div>
                ${!step.done && i === currentStep && step.btnId ? `
                  <button class="btn btn-sm btn-primary" id="${step.btnId}" style="margin-top:0.4rem;">${step.btnLabel}</button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function getAreaBadge(tipo) {
    const map = {
      'productivo': 'green', 'proteccion': 'blue', 'procesamiento': 'amber',
      'almacenamiento': 'brown', 'infraestructura': 'gray', 'otros': 'gray'
    };
    return map[tipo] || 'gray';
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

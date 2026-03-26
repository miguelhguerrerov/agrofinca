// ============================================
// AgroFinca - Ingeniero Calendario Module
// Calendar views: Mensual, Semanal, Hoy
// Visit scheduling, check-in/check-out with GPS
// ============================================

const IngCalendarioModule = (() => {
  let currentDate = new Date();
  let currentTab = 'mensual';
  let allProgramaciones = [];
  let allVisitas = [];
  let allFincas = [];
  let agricultorProfiles = {};

  // ── Render entry point ──────────────────────
  async function render(container) {
    const userId = AuthModule.getUserId();
    if (!userId) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔒</div>
          <h3>Inicia sesión</h3>
          <p>Debes iniciar sesión para ver el calendario.</p>
        </div>`;
      return;
    }

    await loadData(userId);

    container.innerHTML = `
      <div class="module-header">
        <h2>📅 Calendario de Visitas</h2>
        <button class="btn btn-primary" id="cal-btn-programar">+ Programar visita</button>
      </div>

      <!-- Tabs -->
      <div class="tab-bar" id="cal-tabs">
        <button class="tab-btn ${currentTab === 'mensual' ? 'active' : ''}" data-tab="mensual">Mensual</button>
        <button class="tab-btn ${currentTab === 'semanal' ? 'active' : ''}" data-tab="semanal">Semanal</button>
        <button class="tab-btn ${currentTab === 'hoy' ? 'active' : ''}" data-tab="hoy">Hoy</button>
      </div>

      <!-- Calendar content -->
      <div id="cal-content">
        ${renderTab()}
      </div>
    `;

    initEvents();
  }

  // ── Load data ─────────────────────────────
  async function loadData(userId) {
    try {
      // Load affiliated agricultores
      const afiliaciones = await AgroDB.query('ingeniero_agricultores',
        r => r.ingeniero_id === userId && r.estado === 'activo'
      );
      const agricultorIds = afiliaciones.map(a => a.agricultor_id);

      // Load profiles
      agricultorProfiles = {};
      for (const agId of agricultorIds) {
        const profile = await AgroDB.getById('user_profiles', agId);
        if (profile) agricultorProfiles[agId] = profile;
      }

      // Load all fincas for affiliated agricultores
      allFincas = [];
      for (const agId of agricultorIds) {
        const fincas = await AgroDB.getByIndex('fincas', 'propietario_id', agId);
        for (const f of fincas) {
          f._agricultor_id = agId;
          allFincas.push(f);
        }
      }

      // Load programaciones
      allProgramaciones = await AgroDB.query('programacion_inspecciones',
        r => r.ingeniero_id === userId
      );

      // Load visitas
      allVisitas = await AgroDB.query('visitas_tecnicas',
        r => r.ingeniero_id === userId
      );
    } catch (e) {
      console.warn('Error loading calendar data:', e);
      allProgramaciones = [];
      allVisitas = [];
      allFincas = [];
    }
  }

  // ── Tab rendering ─────────────────────────
  function renderTab() {
    switch (currentTab) {
      case 'mensual': return renderMensual();
      case 'semanal': return renderSemanal();
      case 'hoy': return renderHoy();
      default: return renderMensual();
    }
  }

  // ── MENSUAL ───────────────────────────────
  function renderMensual() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthName = currentDate.toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
    const days = getDaysInMonth(year, month);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Build header
    let html = `
      <div class="cal-nav" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
        <button class="btn btn-sm btn-secondary" id="cal-prev-month">◀ Anterior</button>
        <h3 style="margin:0;text-transform:capitalize;">${monthName}</h3>
        <button class="btn btn-sm btn-secondary" id="cal-next-month">Siguiente ▶</button>
      </div>
      <div class="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">
        <div class="cal-weekday">Lun</div>
        <div class="cal-weekday">Mar</div>
        <div class="cal-weekday">Mié</div>
        <div class="cal-weekday">Jue</div>
        <div class="cal-weekday">Vie</div>
        <div class="cal-weekday">Sáb</div>
        <div class="cal-weekday">Dom</div>`;

    // Pad start of month
    const firstDay = days[0].getDay();
    const startPad = firstDay === 0 ? 6 : firstDay - 1; // Monday = 0
    for (let i = 0; i < startPad; i++) {
      html += `<div class="cal-day cal-day-empty"></div>`;
    }

    // Days
    for (const day of days) {
      const dateStr = day.toISOString().slice(0, 10);
      const visitas = getVisitasForDate(day);
      const isToday = dateStr === todayStr;
      const isPast = day < today && !isToday;

      // Determine dots
      let dots = '';
      for (const v of visitas) {
        let dotColor = 'var(--gray-400)'; // default gray
        if (v._visita && v._visita.hora_salida) {
          dotColor = 'var(--success)'; // completed
        } else if (v._visita && v._visita.hora_llegada) {
          dotColor = 'var(--primary)'; // in progress
        } else if (isPast) {
          dotColor = 'var(--danger)'; // overdue
        } else {
          dotColor = 'var(--warning)'; // upcoming
        }
        dots += `<span class="cal-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};margin:1px;"></span>`;
      }

      html += `
        <div class="cal-day ${isToday ? 'cal-day-today' : ''}" data-date="${dateStr}" style="cursor:pointer;min-height:50px;padding:4px;border:1px solid var(--gray-200);border-radius:4px;${isToday ? 'background:var(--primary-light);font-weight:700;' : ''}">
          <div style="font-size:0.85rem;">${day.getDate()}</div>
          <div style="display:flex;flex-wrap:wrap;gap:1px;margin-top:2px;">${dots}</div>
        </div>`;
    }

    html += `</div>`;
    return html;
  }

  // ── SEMANAL ───────────────────────────────
  function renderSemanal() {
    const weekDates = getWeekDates(currentDate);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekLabel = `${weekDates[0].toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })} - ${weekDates[6].toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    let html = `
      <div class="cal-nav" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
        <button class="btn btn-sm btn-secondary" id="cal-prev-week">◀ Anterior</button>
        <h3 style="margin:0;">${weekLabel}</h3>
        <button class="btn btn-sm btn-secondary" id="cal-next-week">Siguiente ▶</button>
      </div>
      <div class="cal-week-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;overflow-x:auto;">`;

    for (let i = 0; i < 7; i++) {
      const day = weekDates[i];
      const dateStr = day.toISOString().slice(0, 10);
      const isToday = dateStr === todayStr;
      const visitas = getVisitasForDate(day);

      let cardsHTML = '';
      for (const v of visitas) {
        const finca = allFincas.find(f => f.id === v.finca_id);
        const fincaName = finca?.nombre || 'Finca';
        const hora = v.hora || '';
        const tipo = v.tipo || 'programada';

        let statusColor = 'var(--warning)';
        let statusLabel = 'Pendiente';
        if (v._visita?.hora_salida) {
          statusColor = 'var(--success)';
          statusLabel = 'Completada';
        } else if (v._visita?.hora_llegada) {
          statusColor = 'var(--primary)';
          statusLabel = 'En curso';
        }

        cardsHTML += `
          <div class="cal-visit-card" data-prog-id="${v.id}" data-finca-id="${v.finca_id}" style="background:#fff;border-left:3px solid ${statusColor};padding:6px 8px;border-radius:4px;margin-bottom:4px;cursor:pointer;font-size:0.8rem;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
            <div style="font-weight:600;">${escapeHtml(fincaName)}</div>
            ${hora ? `<div style="color:var(--gray-500);">${hora}</div>` : ''}
            <div style="color:var(--gray-500);">${tipo}</div>
          </div>`;
      }

      html += `
        <div class="cal-week-col" style="min-width:120px;${isToday ? 'background:var(--primary-light);border-radius:8px;' : ''}padding:8px;">
          <div style="text-align:center;margin-bottom:8px;">
            <div style="font-size:0.75rem;color:var(--gray-500);">${dayNames[i]}</div>
            <div style="font-size:1.1rem;font-weight:${isToday ? '700' : '400'};">${day.getDate()}</div>
          </div>
          ${cardsHTML || '<div style="color:var(--gray-400);font-size:0.75rem;text-align:center;">Sin visitas</div>'}
        </div>`;
    }

    html += `</div>`;
    return html;
  }

  // ── HOY (Ruta del día) ────────────────────
  function renderHoy() {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const visitas = getVisitasForDate(today);

    let html = `
      <div style="padding:12px 0;">
        <h3 style="margin:0 0 4px;">Ruta del día</h3>
        <p style="color:var(--gray-500);margin:0 0 16px;">${today.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>`;

    if (visitas.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <h3>Sin visitas programadas</h3>
          <p>No tienes visitas programadas para hoy.</p>
          <button class="btn btn-primary" id="cal-btn-programar-hoy">+ Programar visita</button>
        </div>`;
      return html;
    }

    // Visit cards
    for (const v of visitas) {
      const finca = allFincas.find(f => f.id === v.finca_id);
      const fincaName = finca?.nombre || 'Finca';
      const fincaDireccion = finca?.direccion || finca?.ubicacion || '';
      const agricultorId = finca?._agricultor_id;
      const agricultor = agricultorId ? agricultorProfiles[agricultorId] : null;
      const agricultorName = agricultor?.nombre_completo || '';
      const hora = v.hora || '';
      const tipo = v.tipo || 'programada';

      // Determine status
      let status = 'pendiente';
      let statusLabel = 'Pendiente';
      let statusColor = 'var(--warning)';
      let buttons = '';

      if (v._visita?.hora_salida) {
        status = 'completada';
        statusLabel = `Completada (${v._visita.hora_llegada} - ${v._visita.hora_salida})`;
        statusColor = 'var(--success)';
      } else if (v._visita?.hora_llegada) {
        status = 'en_curso';
        statusLabel = `En curso (desde ${v._visita.hora_llegada})`;
        statusColor = 'var(--primary)';
        buttons = `<button class="btn btn-sm btn-success cal-checkout-btn" data-prog-id="${v.id}" data-finca-id="${v.finca_id}" data-visita-id="${v._visita.id}">✓ Check-out</button>`;
      } else {
        buttons = `<button class="btn btn-sm btn-primary cal-checkin-btn" data-prog-id="${v.id}" data-finca-id="${v.finca_id}">📍 Check-in</button>`;
      }

      html += `
        <div class="card" style="margin-bottom:12px;border-left:4px solid ${statusColor};">
          <div class="card-body" style="padding:12px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <h4 style="margin:0 0 4px;">${escapeHtml(fincaName)}</h4>
                ${agricultorName ? `<div style="color:var(--gray-600);font-size:0.9rem;">👨‍🌾 ${escapeHtml(agricultorName)}</div>` : ''}
                ${fincaDireccion ? `<div style="color:var(--gray-500);font-size:0.85rem;">📍 ${escapeHtml(fincaDireccion)}</div>` : ''}
                <div style="display:flex;gap:12px;margin-top:6px;font-size:0.85rem;color:var(--gray-500);">
                  ${hora ? `<span>🕐 ${hora}</span>` : ''}
                  <span>${tipo}</span>
                </div>
              </div>
              <div style="text-align:right;">
                <span class="badge" style="background:${statusColor};color:#fff;padding:3px 8px;border-radius:12px;font-size:0.75rem;">${statusLabel}</span>
                <div style="margin-top:8px;">${buttons}</div>
              </div>
            </div>
          </div>
        </div>`;
    }

    // Mini map if Leaflet available
    if (typeof L !== 'undefined') {
      html += `<div id="cal-map" style="height:250px;border-radius:12px;margin-top:16px;"></div>`;
    }

    return html;
  }

  // ── Check-in flow ─────────────────────────
  async function checkIn(programacionId, fincaId) {
    try {
      App.showToast('Obteniendo ubicación...', 'info');
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
      });

      const visita = {
        id: AgroDB.uuid(),
        ingeniero_id: AuthModule.getUserId(),
        finca_id: fincaId,
        programacion_id: programacionId,
        fecha: new Date().toISOString().slice(0, 10),
        hora_llegada: new Date().toISOString().slice(11, 16),
        hora_salida: null,
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
        tipo: 'programada',
        created_at: new Date().toISOString()
      };

      await AgroDB.add('visitas_tecnicas', visita);
      allVisitas.push(visita);

      App.showToast('Check-in registrado', 'success');
      refreshContent();
    } catch (e) {
      if (e.code === 1) {
        App.showToast('Permiso de ubicación denegado', 'error');
      } else if (e.code === 3) {
        App.showToast('Tiempo de espera agotado para GPS', 'error');
      } else {
        App.showToast('Error al registrar check-in: ' + (e.message || ''), 'error');
      }
    }
  }

  // ── Check-out flow ────────────────────────
  async function checkOut(visitaId) {
    try {
      const horaSalida = new Date().toISOString().slice(11, 16);
      await AgroDB.update('visitas_tecnicas', visitaId, { hora_salida: horaSalida });

      // Update local cache
      const visita = allVisitas.find(v => v.id === visitaId);
      if (visita) visita.hora_salida = horaSalida;

      // Auto-advance proxima_visita in programacion
      if (visita?.programacion_id) {
        await advanceNextVisit(visita.programacion_id);
      }

      App.showToast('Check-out registrado', 'success');
      refreshContent();
    } catch (e) {
      App.showToast('Error al registrar check-out: ' + (e.message || ''), 'error');
    }
  }

  async function advanceNextVisit(programacionId) {
    try {
      const prog = allProgramaciones.find(p => p.id === programacionId);
      if (!prog || !prog.dias_intervalo) return;

      const current = new Date(prog.proxima_visita || new Date());
      current.setDate(current.getDate() + prog.dias_intervalo);
      const nextDate = current.toISOString().slice(0, 10);

      await AgroDB.update('programacion_inspecciones', programacionId, { proxima_visita: nextDate });
      prog.proxima_visita = nextDate;
    } catch { /* ignore */ }
  }

  // ── Programar visita form ─────────────────
  function showProgramarForm() {
    const fincaOptions = allFincas.map(f => {
      const ag = agricultorProfiles[f._agricultor_id];
      const agName = ag?.nombre_completo || '';
      return `<option value="${f.id}">${escapeHtml(f.nombre)}${agName ? ` (${escapeHtml(agName)})` : ''}</option>`;
    }).join('');

    const body = `
      <div class="form-group">
        <label>Finca</label>
        <select class="form-input" id="cal-prog-finca" required>
          <option value="">Seleccionar...</option>
          ${fincaOptions}
        </select>
      </div>
      <div class="form-group">
        <label>Frecuencia</label>
        <select class="form-input" id="cal-prog-frecuencia">
          <option value="semanal">Semanal (7 días)</option>
          <option value="quincenal">Quincenal (15 días)</option>
          <option value="mensual" selected>Mensual (30 días)</option>
          <option value="bimestral">Bimestral (60 días)</option>
          <option value="personalizada">Personalizada</option>
        </select>
      </div>
      <div class="form-group" id="cal-prog-custom-wrap" style="display:none;">
        <label>Días de intervalo</label>
        <input class="form-input" type="number" id="cal-prog-dias" min="1" max="365" value="30">
      </div>
      <div class="form-group">
        <label>Primera visita</label>
        <input class="form-input" type="date" id="cal-prog-fecha" value="${new Date().toISOString().slice(0, 10)}" required>
      </div>
      <div class="form-group">
        <label>Hora (opcional)</label>
        <input class="form-input" type="time" id="cal-prog-hora">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select class="form-input" id="cal-prog-tipo">
          <option value="programada">Inspección programada</option>
          <option value="seguimiento">Seguimiento</option>
          <option value="emergencia">Emergencia</option>
        </select>
      </div>
    `;

    App.showModal('Programar Visita', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="cal-save-prog">Guardar</button>`);

    setTimeout(() => {
      document.getElementById('cal-prog-frecuencia')?.addEventListener('change', (e) => {
        const wrap = document.getElementById('cal-prog-custom-wrap');
        if (wrap) wrap.style.display = e.target.value === 'personalizada' ? '' : 'none';
      });
      document.getElementById('cal-save-prog')?.addEventListener('click', handleSaveProgramacion);
    }, 100);
  }

  async function handleSaveProgramacion() {
    const fincaId = document.getElementById('cal-prog-finca')?.value;
    const frecuencia = document.getElementById('cal-prog-frecuencia')?.value;
    const customDias = parseInt(document.getElementById('cal-prog-dias')?.value) || 30;
    const fecha = document.getElementById('cal-prog-fecha')?.value;
    const hora = document.getElementById('cal-prog-hora')?.value || null;
    const tipo = document.getElementById('cal-prog-tipo')?.value || 'programada';

    if (!fincaId || !fecha) {
      App.showToast('Completa los campos requeridos', 'warning');
      return;
    }

    const frecuenciaMap = {
      semanal: 7,
      quincenal: 15,
      mensual: 30,
      bimestral: 60,
      personalizada: customDias
    };
    const diasIntervalo = frecuenciaMap[frecuencia] || 30;

    const prog = {
      id: AgroDB.uuid(),
      ingeniero_id: AuthModule.getUserId(),
      finca_id: fincaId,
      frecuencia: frecuencia,
      dias_intervalo: diasIntervalo,
      proxima_visita: fecha,
      hora: hora,
      tipo: tipo,
      activo: true,
      created_at: new Date().toISOString()
    };

    try {
      await AgroDB.add('programacion_inspecciones', prog);
      allProgramaciones.push(prog);
      App.closeModal();
      App.showToast('Visita programada', 'success');
      refreshContent();
    } catch (e) {
      App.showToast('Error al programar: ' + (e.message || ''), 'error');
    }
  }

  // ── Calendar helpers ──────────────────────
  function getDaysInMonth(year, month) {
    const days = [];
    const numDays = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= numDays; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }

  function getWeekDates(date) {
    const d = new Date(date);
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      dates.push(day);
    }
    return dates;
  }

  function getVisitasForDate(date) {
    const dateStr = date.toISOString().slice(0, 10);
    const results = [];

    for (const prog of allProgramaciones) {
      if (!prog.activo) continue;

      // Check if this date matches the programacion schedule
      const proxima = prog.proxima_visita;
      if (!proxima) continue;

      // Direct match
      if (proxima === dateStr) {
        // Look for existing visita
        const visita = allVisitas.find(v =>
          v.programacion_id === prog.id && v.fecha === dateStr
        );
        results.push({
          ...prog,
          _visita: visita || null
        });
        continue;
      }

      // Check if date falls on the recurring schedule
      if (prog.dias_intervalo && prog.dias_intervalo > 0) {
        const startDate = new Date(proxima);
        const targetDate = new Date(dateStr);
        const diffDays = Math.round((targetDate - startDate) / 86400000);
        if (diffDays >= 0 && diffDays % prog.dias_intervalo === 0) {
          const visita = allVisitas.find(v =>
            v.programacion_id === prog.id && v.fecha === dateStr
          );
          results.push({
            ...prog,
            _visita: visita || null
          });
        }
      }
    }

    // Also include unscheduled visitas for this date
    const adhocVisitas = allVisitas.filter(v =>
      v.fecha === dateStr && !v.programacion_id
    );
    for (const v of adhocVisitas) {
      results.push({
        id: v.id,
        finca_id: v.finca_id,
        tipo: v.tipo || 'ad-hoc',
        hora: v.hora_llegada,
        _visita: v
      });
    }

    return results;
  }

  // ── Event handlers ────────────────────────
  function initEvents() {
    document.getElementById('cal-btn-programar')?.addEventListener('click', showProgramarForm);
    bindTabEvents();
    bindContentEvents();
  }

  function bindTabEvents() {
    document.querySelectorAll('#cal-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        document.querySelectorAll('#cal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshContent();
      });
    });
  }

  function bindContentEvents() {
    // Month navigation
    document.getElementById('cal-prev-month')?.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      refreshContent();
    });
    document.getElementById('cal-next-month')?.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      refreshContent();
    });

    // Week navigation
    document.getElementById('cal-prev-week')?.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() - 7);
      refreshContent();
    });
    document.getElementById('cal-next-week')?.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() + 7);
      refreshContent();
    });

    // Day clicks on monthly calendar
    document.querySelectorAll('.cal-day[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.dataset.date;
        showDayDetail(dateStr);
      });
    });

    // Check-in / check-out buttons
    document.querySelectorAll('.cal-checkin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        checkIn(btn.dataset.progId, btn.dataset.fincaId);
      });
    });
    document.querySelectorAll('.cal-checkout-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        checkOut(btn.dataset.visitaId);
      });
    });

    // Programar from empty hoy
    document.getElementById('cal-btn-programar-hoy')?.addEventListener('click', showProgramarForm);

    // Initialize mini map if on Hoy tab
    if (currentTab === 'hoy' && typeof L !== 'undefined') {
      initMiniMap();
    }
  }

  function refreshContent() {
    const contentEl = document.getElementById('cal-content');
    if (contentEl) {
      contentEl.innerHTML = renderTab();
      bindContentEvents();
    }
  }

  // ── Day detail popup ──────────────────────
  function showDayDetail(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    const visitas = getVisitasForDate(date);
    const dayLabel = date.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });

    let body = '';
    if (visitas.length === 0) {
      body = '<p style="color:var(--gray-500);">No hay visitas programadas para este día.</p>';
    } else {
      body = visitas.map(v => {
        const finca = allFincas.find(f => f.id === v.finca_id);
        const fincaName = finca?.nombre || 'Finca';
        let statusLabel = 'Pendiente';
        let statusColor = 'var(--warning)';
        if (v._visita?.hora_salida) {
          statusLabel = 'Completada';
          statusColor = 'var(--success)';
        } else if (v._visita?.hora_llegada) {
          statusLabel = 'En curso';
          statusColor = 'var(--primary)';
        }
        return `
          <div style="padding:8px 0;border-bottom:1px solid var(--gray-100);">
            <div style="display:flex;justify-content:space-between;">
              <strong>${escapeHtml(fincaName)}</strong>
              <span style="color:${statusColor};font-size:0.85rem;">${statusLabel}</span>
            </div>
            <div style="font-size:0.85rem;color:var(--gray-500);">${v.tipo || 'programada'}${v.hora ? ' · ' + v.hora : ''}</div>
          </div>`;
      }).join('');
    }

    App.showModal(`📅 ${dayLabel}`, body,
      '<button class="btn btn-secondary" onclick="App.closeModal()">Cerrar</button>');
  }

  // ── Mini map ──────────────────────────────
  function initMiniMap() {
    const mapEl = document.getElementById('cal-map');
    if (!mapEl || typeof L === 'undefined') return;

    const today = new Date();
    const visitas = getVisitasForDate(today);
    const fincasWithCoords = [];

    for (const v of visitas) {
      const finca = allFincas.find(f => f.id === v.finca_id);
      if (finca && finca.latitud && finca.longitud) {
        fincasWithCoords.push(finca);
      }
    }

    if (fincasWithCoords.length === 0) {
      mapEl.innerHTML = '<p style="text-align:center;padding:20px;color:var(--gray-500);">No hay fincas con coordenadas para hoy.</p>';
      return;
    }

    const map = L.map('cal-map').setView(
      [fincasWithCoords[0].latitud, fincasWithCoords[0].longitud], 12
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    const bounds = [];
    for (const finca of fincasWithCoords) {
      const marker = L.marker([finca.latitud, finca.longitud]).addTo(map);
      marker.bindPopup(`<strong>${escapeHtml(finca.nombre)}</strong>`);
      bounds.push([finca.latitud, finca.longitud]);
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  // ── Helpers ───────────────────────────────
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Public API ────────────────────────────
  return { render };
})();

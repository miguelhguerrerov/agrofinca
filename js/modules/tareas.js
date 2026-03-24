// ============================================
// AgroFinca - Tareas Module (v2)
// Daily agenda format, hora/duracion,
// assignment to areas/ciclos, full history
// ============================================

const TareasModule = (() => {
  let showAllCompleted = false;

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const tareas = await AgroDB.query('tareas', r => r.finca_id === fincaId);
    const pending = tareas.filter(t => t.estado === 'pendiente');
    const completed = tareas.filter(t => t.estado === 'completada')
      .sort((a, b) => (b.completada_en || b.fecha_programada || '').localeCompare(a.completada_en || a.fecha_programada || ''));

    const today = DateUtils.today();

    // Count today's tasks
    const todayTasks = pending.filter(t => t.fecha_programada === today);

    // Group pending by date
    const dateGroups = {};
    pending.forEach(t => {
      const key = t.fecha_programada || '9999-99-99';
      if (!dateGroups[key]) dateGroups[key] = [];
      dateGroups[key].push(t);
    });

    // Sort dates
    const sortedDates = Object.keys(dateGroups).sort();

    // Sort tasks within each date by hora_inicio
    for (const date of sortedDates) {
      dateGroups[date].sort((a, b) => {
        const ha = a.hora_inicio || '99:99';
        const hb = b.hora_inicio || '99:99';
        return ha.localeCompare(hb);
      });
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>📅 Agenda</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-tarea">+ Nueva Tarea</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon amber">📋</div>
          <div class="s-data"><div class="s-value">${pending.length}</div><div class="s-label">Pendientes</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon green">✅</div>
          <div class="s-data"><div class="s-value">${todayTasks.length}</div><div class="s-label">Hoy</div></div>
        </div>
      </div>

      <!-- Agenda by day -->
      ${sortedDates.length === 0 ? '<div class="empty-state"><h3>Sin tareas pendientes</h3><p>Crea una nueva tarea para organizar tu trabajo.</p></div>' :
      sortedDates.map(date => {
        const tasks = dateGroups[date];
        const isToday = date === today;
        const isTomorrow = date === DateUtils.addDays(today, 1);
        const isPast = date < today;
        let dateLabel;
        if (date === '9999-99-99') {
          dateLabel = '📌 Sin fecha';
        } else if (isToday) {
          dateLabel = '📍 Hoy — ' + Format.dateShort(date);
        } else if (isTomorrow) {
          dateLabel = '🔜 Mañana — ' + Format.dateShort(date);
        } else if (isPast) {
          dateLabel = '⚠️ Atrasada — ' + DateUtils.weekdayName(date) + ' ' + Format.dateShort(date);
        } else {
          dateLabel = DateUtils.weekdayName(date) + ' ' + Format.dateShort(date);
        }

        return `
          <div class="card ${isToday ? 'card-highlight' : ''} ${isPast && date !== '9999-99-99' ? 'card-overdue' : ''}">
            <div class="card-header">
              <h3>${dateLabel}</h3>
              <span class="badge badge-gray">${tasks.length}</span>
            </div>
            ${tasks.map(t => agendaItem(t)).join('')}
          </div>`;
      }).join('')}

      <!-- Completed -->
      <div class="card">
        <div class="card-header">
          <h3>✅ Completadas</h3>
          ${completed.length > 5 ? `<button class="btn btn-sm btn-outline" id="btn-toggle-completed">${showAllCompleted ? 'Ver menos' : `Ver todas (${completed.length})`}</button>` : ''}
        </div>
        ${(showAllCompleted ? completed : completed.slice(0, 5)).map(t => `
          <div class="data-list-item" style="padding:0.5rem 0;opacity:0.6;">
            <div class="data-list-left">
              <div class="data-list-title" style="text-decoration:line-through;">${t.titulo}</div>
              <div class="data-list-sub">
                ${Format.date(t.completada_en || t.fecha_programada)}
                ${t.completada_por ? ' · Hecho por: ' + t.completada_por : ''}
                ${t.asignado_a ? ' · Asignado: ' + t.asignado_a : ''}
                ${t.area_nombre ? ' · 📍 ' + t.area_nombre : ''}
              </div>
            </div>
            <div class="data-list-actions">
              <button class="btn btn-sm btn-danger btn-del-task" data-id="${t.id}">🗑</button>
            </div>
          </div>
        `).join('')}
        ${completed.length === 0 ? '<p class="text-sm text-muted">Sin tareas completadas</p>' : ''}
      </div>
    `;

    // Events
    document.getElementById('btn-new-tarea')?.addEventListener('click', () => showQuickTask(fincaId));
    document.getElementById('btn-toggle-completed')?.addEventListener('click', () => {
      showAllCompleted = !showAllCompleted;
      render(container, fincaId);
    });

    container.querySelectorAll('.btn-complete-task').forEach(btn => {
      btn.addEventListener('click', async () => {
        const user = AuthModule.getUser();
        await AgroDB.update('tareas', btn.dataset.id, {
          estado: 'completada',
          completada_en: DateUtils.now(),
          completada_por: user?.nombre || user?.email || 'sistema'
        });

        // Handle recurring tasks
        const tarea = await AgroDB.getById('tareas', btn.dataset.id);
        if (tarea && tarea.recurrente && tarea.frecuencia_dias) {
          const nextDate = DateUtils.addDays(tarea.fecha_programada || DateUtils.today(), tarea.frecuencia_dias);
          await AgroDB.add('tareas', {
            ...tarea,
            id: undefined,
            estado: 'pendiente',
            fecha_programada: nextDate,
            completada_en: null,
            completada_por: null
          });
        }

        App.showToast('Tarea completada', 'success');
        App.refreshCurrentPage();
      });
    });
    container.querySelectorAll('.btn-edit-task').forEach(btn => {
      btn.addEventListener('click', async () => {
        const t = await AgroDB.getById('tareas', btn.dataset.id);
        showQuickTask(fincaId, t);
      });
    });
    container.querySelectorAll('.btn-del-task').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta tarea?')) {
          await AgroDB.remove('tareas', btn.dataset.id);
          App.showToast('Tarea eliminada', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  function agendaItem(t) {
    const prioColor = t.prioridad === 'alta' ? 'var(--red-500)' : t.prioridad === 'media' ? 'var(--amber-500)' : 'var(--gray-300)';
    const horaStr = t.hora_inicio ? t.hora_inicio.substring(0, 5) : '';
    const durStr = t.duracion_minutos ? formatDuration(t.duracion_minutos) : '';

    return `
      <div class="agenda-item" style="border-left:4px solid ${prioColor};">
        <div class="flex-between" style="align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div class="data-list-title">
              ${horaStr ? `<span class="badge badge-outline" style="margin-right:0.3rem;">${horaStr}</span>` : ''}
              ${t.titulo}
              ${durStr ? `<span class="text-xs text-muted"> · ${durStr}</span>` : ''}
            </div>
            <div class="data-list-sub">
              ${t.cultivo_nombre ? t.cultivo_nombre + ' · ' : ''}
              <span class="badge badge-${t.prioridad === 'alta' ? 'red' : t.prioridad === 'media' ? 'amber' : 'gray'}">${t.prioridad}</span>
              ${t.recurrente ? ' <span class="badge badge-blue">🔄</span>' : ''}
              ${t.asignado_a ? ` <span class="badge badge-blue">👤 ${t.asignado_a}</span>` : ''}
              ${t.area_nombre ? ` <span class="text-xs text-muted">📍 ${t.area_nombre}</span>` : ''}
              ${t.ciclo_nombre ? ` <span class="text-xs text-muted">🌱 ${t.ciclo_nombre}</span>` : ''}
            </div>
            ${t.descripcion ? `<div class="text-xs text-muted mt-05">${t.descripcion.substring(0, 80)}${t.descripcion.length > 80 ? '...' : ''}</div>` : ''}
          </div>
          <div class="data-list-actions" style="flex-shrink:0;margin-left:0.5rem;">
            <button class="btn btn-sm btn-primary btn-complete-task" data-id="${t.id}">✅</button>
            <button class="btn btn-sm btn-outline btn-edit-task" data-id="${t.id}">✏️</button>
            <button class="btn btn-sm btn-danger btn-del-task" data-id="${t.id}">🗑</button>
          </div>
        </div>
      </div>
    `;
  }

  function formatDuration(minutes) {
    if (minutes >= 480) return 'Día completo';
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}h ${m}min` : `${h}h`;
    }
    return `${minutes}min`;
  }

  async function showQuickTask(fincaId, tarea = null) {
    const isEdit = !!tarea;
    const [cultivos, miembros, areas, ciclos] = await Promise.all([
      AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId),
      AgroDB.getByIndex('finca_miembros', 'finca_id', fincaId),
      AgroDB.getByIndex('areas', 'finca_id', fincaId),
      AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo')
    ]);
    const finca = await AgroDB.getById('fincas', fincaId);
    const currentUser = AuthModule.getUser();

    // Build user list for assignment
    const usuarios = [];
    if (finca && finca.propietario_id) {
      const propietario = await AgroDB.getById('usuarios', finca.propietario_id);
      if (propietario) {
        usuarios.push({ nombre: propietario.nombre || propietario.email, id: propietario.id });
      }
    }
    miembros.forEach(m => {
      if (!usuarios.find(u => u.id === m.usuario_id)) {
        usuarios.push({ nombre: m.nombre || m.usuario_email, id: m.usuario_id });
      }
    });

    const body = `
      <div class="form-group">
        <label>Título *</label>
        <input type="text" id="tarea-titulo" value="${tarea?.titulo || ''}" placeholder="Ej: Revisar riego canal norte">
      </div>
      <div class="form-group">
        <label>Descripción</label>
        <textarea id="tarea-desc" placeholder="Detalles de la tarea">${tarea?.descripcion || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>📅 Fecha programada *</label>
          <input type="date" id="tarea-fecha" value="${tarea?.fecha_programada || DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>⏰ Hora de inicio</label>
          <input type="time" id="tarea-hora" value="${tarea?.hora_inicio || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Duración</label>
          <select id="tarea-duracion">
            <option value="" ${!tarea?.duracion_minutos ? 'selected' : ''}>Sin especificar</option>
            <option value="15" ${tarea?.duracion_minutos === 15 ? 'selected' : ''}>15 min</option>
            <option value="30" ${tarea?.duracion_minutos === 30 ? 'selected' : ''}>30 min</option>
            <option value="60" ${tarea?.duracion_minutos === 60 ? 'selected' : ''}>1 hora</option>
            <option value="120" ${tarea?.duracion_minutos === 120 ? 'selected' : ''}>2 horas</option>
            <option value="180" ${tarea?.duracion_minutos === 180 ? 'selected' : ''}>3 horas</option>
            <option value="240" ${tarea?.duracion_minutos === 240 ? 'selected' : ''}>4 horas</option>
            <option value="480" ${tarea?.duracion_minutos === 480 ? 'selected' : ''}>Día completo</option>
          </select>
        </div>
        <div class="form-group">
          <label>Prioridad</label>
          <select id="tarea-prioridad">
            <option value="baja" ${tarea?.prioridad === 'baja' ? 'selected' : ''}>Baja</option>
            <option value="media" ${tarea?.prioridad === 'media' || !tarea ? 'selected' : ''}>Media</option>
            <option value="alta" ${tarea?.prioridad === 'alta' ? 'selected' : ''}>Alta</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>🌱 Cultivo / Actividad</label>
          <select id="tarea-cultivo">
            <option value="">General</option>
            ${cultivos.map(c => `<option value="${c.id}" data-nombre="${c.nombre}" ${tarea?.cultivo_id === c.id ? 'selected' : ''}>${c.icono || ''} ${c.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>👤 Asignar a</label>
          <select id="tarea-asignado">
            <option value="">Sin asignar</option>
            ${usuarios.map(u => `<option value="${u.nombre}" ${tarea?.asignado_a === u.nombre ? 'selected' : ''}>${u.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>📍 Área / Lote</label>
          <select id="tarea-area">
            <option value="">Sin área</option>
            ${areas.map(a => `<option value="${a.id}" data-nombre="${a.nombre}" ${tarea?.area_id === a.id ? 'selected' : ''}>${a.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>🔄 Ciclo productivo</label>
          <select id="tarea-ciclo">
            <option value="">Sin ciclo</option>
            ${ciclos.map(c => `<option value="${c.id}" data-nombre="${c.cultivo_nombre + (c.area_nombre ? ' - ' + c.area_nombre : '')}" ${tarea?.ciclo_id === c.id ? 'selected' : ''}>${c.cultivo_nombre}${c.area_nombre ? ' - ' + c.area_nombre : ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <div class="checkbox-group">
          <input type="checkbox" id="tarea-recurrente" ${tarea?.recurrente ? 'checked' : ''}>
          <label for="tarea-recurrente">Tarea recurrente</label>
        </div>
      </div>
      <div class="form-group" id="tarea-freq-group" style="display:${tarea?.recurrente ? 'block' : 'none'};">
        <label>Frecuencia</label>
        <select id="tarea-frecuencia">
          <option value="1" ${tarea?.frecuencia_dias === 1 ? 'selected' : ''}>Cada día</option>
          <option value="3" ${tarea?.frecuencia_dias === 3 ? 'selected' : ''}>Cada 3 días</option>
          <option value="7" ${tarea?.frecuencia_dias === 7 ? 'selected' : ''}>Cada semana</option>
          <option value="14" ${tarea?.frecuencia_dias === 14 ? 'selected' : ''}>Cada 2 semanas</option>
          <option value="28" ${tarea?.frecuencia_dias === 28 ? 'selected' : ''}>Cada 4 semanas</option>
        </select>
      </div>
      ${isEdit ? `<div class="flex-between mt-1">
        <button class="btn btn-danger btn-sm" id="btn-delete-tarea-modal">🗑 Eliminar Tarea</button>
        <span></span>
      </div>` : ''}
    `;
    App.showModal(isEdit ? 'Editar Tarea' : 'Nueva Tarea', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-tarea">Guardar</button>`);

    document.getElementById('tarea-recurrente').addEventListener('change', (e) => {
      document.getElementById('tarea-freq-group').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('btn-save-tarea').addEventListener('click', async () => {
      const titulo = document.getElementById('tarea-titulo').value.trim();
      if (!titulo) { App.showToast('El título es obligatorio', 'warning'); return; }

      const fecha = document.getElementById('tarea-fecha').value;
      if (!fecha) { App.showToast('La fecha es obligatoria', 'warning'); return; }

      const cultivoSel = document.getElementById('tarea-cultivo');
      const areaSel = document.getElementById('tarea-area');
      const cicloSel = document.getElementById('tarea-ciclo');

      const data = {
        finca_id: fincaId,
        titulo,
        descripcion: document.getElementById('tarea-desc').value.trim(),
        cultivo_id: cultivoSel.value || null,
        cultivo_nombre: cultivoSel.value ? cultivoSel.selectedOptions[0].dataset.nombre : null,
        area_id: areaSel.value || null,
        area_nombre: areaSel.value ? areaSel.selectedOptions[0].dataset.nombre : null,
        ciclo_id: cicloSel.value || null,
        ciclo_nombre: cicloSel.value ? cicloSel.selectedOptions[0].dataset.nombre : null,
        fecha_programada: fecha,
        hora_inicio: document.getElementById('tarea-hora').value || null,
        duracion_minutos: parseInt(document.getElementById('tarea-duracion').value) || null,
        prioridad: document.getElementById('tarea-prioridad').value,
        recurrente: document.getElementById('tarea-recurrente').checked,
        frecuencia_dias: parseInt(document.getElementById('tarea-frecuencia').value) || 7,
        asignado_a: document.getElementById('tarea-asignado').value || null,
        estado: tarea?.estado || 'pendiente',
        creado_por: currentUser?.nombre || currentUser?.email || 'sistema'
      };

      if (isEdit) await AgroDB.update('tareas', tarea.id, data);
      else await AgroDB.add('tareas', data);

      App.closeModal();
      App.showToast('Tarea guardada', 'success');
      App.refreshCurrentPage();
    });

    document.getElementById('btn-delete-tarea-modal')?.addEventListener('click', async () => {
      if (confirm('¿Eliminar esta tarea?')) {
        await AgroDB.remove('tareas', tarea.id);
        App.closeModal();
        App.showToast('Tarea eliminada', 'success');
        App.refreshCurrentPage();
      }
    });
  }

  return { render, showQuickTask };
})();

// ============================================
// AgroFinca - Tareas Module
// Weekend-only task calendar & planning
// With user assignment (delegation)
// ============================================

const TareasModule = (() => {

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const tareas = await AgroDB.query('tareas', r => r.finca_id === fincaId);
    const weekend = DateUtils.nextWeekend();
    const pending = tareas.filter(t => t.estado === 'pendiente');
    const thisWeekend = pending.filter(t => t.fecha_programada === weekend.saturday || t.fecha_programada === weekend.sunday);
    const completed = tareas.filter(t => t.estado === 'completada');

    // Next 4 weekends
    const nextWeekends = DateUtils.nextNWeekends(4);
    const weekendGroups = {};
    pending.forEach(t => {
      const key = t.fecha_programada || 'sin-fecha';
      if (!weekendGroups[key]) weekendGroups[key] = [];
      weekendGroups[key].push(t);
    });

    container.innerHTML = `
      <div class="page-header">
        <h2>📅 Tareas</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-tarea">+ Nueva Tarea</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon amber">📋</div>
          <div class="s-data"><div class="s-value">${pending.length}</div><div class="s-label">Pendientes</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon green">✅</div>
          <div class="s-data"><div class="s-value">${thisWeekend.length}</div><div class="s-label">Este fin de semana</div></div>
        </div>
      </div>

      <!-- This weekend -->
      <div class="card">
        <div class="card-header">
          <h3>🗓️ Este fin de semana (${Format.dateShort(weekend.saturday)} - ${Format.dateShort(weekend.sunday)})</h3>
        </div>
        ${thisWeekend.length === 0 ? '<p class="text-sm text-muted">No hay tareas programadas</p>' :
      thisWeekend.map(t => taskItem(t)).join('')}
      </div>

      <!-- Future weekends -->
      ${nextWeekends.filter(d => d > weekend.sunday).reduce((acc, d) => {
      if (!acc.includes(d.substring(0, 10))) acc.push(d);
      return acc;
    }, []).slice(0, 6).map(d => {
      const tasks = weekendGroups[d] || [];
      if (tasks.length === 0) return '';
      return `
            <div class="card">
              <div class="card-header">
                <h3>${DateUtils.weekdayName(d)} ${Format.dateShort(d)}</h3>
              </div>
              ${tasks.map(t => taskItem(t)).join('')}
            </div>`;
    }).join('')}

      <!-- Completed -->
      <div class="card">
        <div class="card-header">
          <h3>✅ Completadas recientes</h3>
        </div>
        ${completed.slice(-5).reverse().map(t => `
          <div class="data-list-item" style="padding:0.5rem 0;opacity:0.6;">
            <div class="data-list-left">
              <div class="data-list-title" style="text-decoration:line-through;">${t.titulo}</div>
              <div class="data-list-sub">${Format.date(t.completada_en || t.fecha_programada)}${t.completada_por ? ' · Hecho por: ' + t.completada_por : ''}${t.asignado_a ? ' · Asignado: ' + t.asignado_a : ''}</div>
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
    container.querySelectorAll('.btn-complete-task').forEach(btn => {
      btn.addEventListener('click', async () => {
        const user = AuthModule.getUser();
        await AgroDB.update('tareas', btn.dataset.id, {
          estado: 'completada',
          completada_en: DateUtils.now(),
          completada_por: user?.nombre || user?.email || 'sistema'
        });
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

  function taskItem(t) {
    return `
      <div class="data-list-item" style="padding:0.6rem 0;">
        <div class="data-list-left">
          <div class="data-list-title">${t.titulo}</div>
          <div class="data-list-sub">
            ${t.cultivo_nombre || ''} ·
            <span class="badge badge-${t.prioridad === 'alta' ? 'red' : t.prioridad === 'media' ? 'amber' : 'gray'}">${t.prioridad}</span>
            ${t.recurrente ? ' <span class="badge badge-blue">Recurrente</span>' : ''}
            ${t.asignado_a ? ` <span class="badge badge-blue">👤 ${t.asignado_a}</span>` : ''}
          </div>
        </div>
        <div class="data-list-actions">
          <button class="btn btn-sm btn-primary btn-complete-task" data-id="${t.id}">✅</button>
          <button class="btn btn-sm btn-outline btn-edit-task" data-id="${t.id}">✏️</button>
          <button class="btn btn-sm btn-danger btn-del-task" data-id="${t.id}">🗑</button>
        </div>
      </div>
    `;
  }

  async function showQuickTask(fincaId, tarea = null) {
    const isEdit = !!tarea;
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
    const miembros = await AgroDB.getByIndex('finca_miembros', 'finca_id', fincaId);
    const finca = await AgroDB.getById('fincas', fincaId);
    const currentUser = AuthModule.getUser();
    const weekend = DateUtils.nextWeekend();

    // Build user list for assignment (owner + members)
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
          <label>Cultivo / Actividad</label>
          <select id="tarea-cultivo">
            <option value="">General</option>
            ${cultivos.map(c => `<option value="${c.id}" data-nombre="${c.nombre}" ${tarea?.cultivo_id === c.id ? 'selected' : ''}>${c.icono || ''} ${c.nombre}</option>`).join('')}
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
          <label>Fecha programada *</label>
          <input type="date" id="tarea-fecha" value="${tarea?.fecha_programada || weekend.saturday}">
          <span class="form-hint">Solo se trabaja fines de semana</span>
        </div>
        <div class="form-group">
          <label>👤 Asignar a</label>
          <select id="tarea-asignado">
            <option value="">Sin asignar</option>
            ${usuarios.map(u => `<option value="${u.nombre}" ${tarea?.asignado_a === u.nombre ? 'selected' : ''}>${u.nombre}</option>`).join('')}
          </select>
          <span class="form-hint">Delegar la tarea a un usuario</span>
        </div>
      </div>
      <div class="form-group">
        <div class="checkbox-group">
          <input type="checkbox" id="tarea-recurrente" ${tarea?.recurrente ? 'checked' : ''}>
          <label for="tarea-recurrente">Tarea recurrente</label>
        </div>
      </div>
      <div class="form-group" id="tarea-freq-group" style="display:${tarea?.recurrente ? 'block' : 'none'};">
        <label>Frecuencia (días)</label>
        <select id="tarea-frecuencia">
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
      if (!DateUtils.isWeekend(fecha)) {
        App.showToast('La fecha debe ser sábado o domingo', 'warning');
        return;
      }

      const cultivoSel = document.getElementById('tarea-cultivo');
      const data = {
        finca_id: fincaId,
        titulo,
        descripcion: document.getElementById('tarea-desc').value.trim(),
        cultivo_id: cultivoSel.value || null,
        cultivo_nombre: cultivoSel.value ? cultivoSel.selectedOptions[0].dataset.nombre : null,
        fecha_programada: fecha,
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

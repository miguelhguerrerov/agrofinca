// ============================================
// AgroFinca - Apicultura Module
// Beehive management, inspections, honey harvest
// Apis mellifera colony tracking
// ============================================

const ApiculturaModule = (() => {

  const ESTADOS_COLMENA = [
    { value: 'activa', label: 'Activa', color: 'badge-green' },
    { value: 'fuerte', label: 'Fuerte', color: 'badge-green' },
    { value: 'debil', label: 'Débil', color: 'badge-amber' },
    { value: 'huerfana', label: 'Huérfana', color: 'badge-red' },
    { value: 'enjambrada', label: 'Enjambrada', color: 'badge-amber' },
    { value: 'inactiva', label: 'Inactiva', color: 'badge-gray' }
  ];

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🐝</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const colmenas = await AgroDB.getByIndex('colmenas', 'finca_id', fincaId);
    const inspecciones = await AgroDB.query('inspecciones_colmena', r => r.finca_id === fincaId);
    const cosechas = await AgroDB.query('cosechas', r => r.finca_id === fincaId && r.cultivo_nombre === 'Miel de Abeja');

    const activas = colmenas.filter(c => c.estado !== 'inactiva').length;
    const totalMiel = cosechas.reduce((s, c) => s + (c.cantidad || 0), 0);

    container.innerHTML = `
      <div class="page-header">
        <h2>🐝 Apicultura</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-colmena">+ Nueva Colmena</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon amber">🐝</div>
          <div class="s-data"><div class="s-value">${colmenas.length}</div><div class="s-label">Colmenas totales</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon green">✅</div>
          <div class="s-data"><div class="s-value">${activas}</div><div class="s-label">Activas</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">🍯</div>
          <div class="s-data"><div class="s-value">${Format.number(totalMiel)} L</div><div class="s-label">Miel cosechada</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">📋</div>
          <div class="s-data"><div class="s-value">${inspecciones.length}</div><div class="s-label">Inspecciones</div></div>
        </div>
      </div>

      ${colmenas.length === 0 ? '<div class="empty-state"><h3>Sin colmenas</h3><p>Registra tu primera colmena de Apis mellifera.</p></div>' :
      colmenas.map(col => {
        const colInsp = inspecciones.filter(i => i.colmena_id === col.id);
        const ultimaInsp = colInsp.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
        const badge = ESTADOS_COLMENA.find(e => e.value === col.estado);
        return `
            <div class="card">
              <div class="flex-between">
                <div>
                  <div class="card-title">🐝 ${col.nombre}</div>
                  <div class="card-subtitle">${col.tipo || 'Langstroth'} · ${col.ubicacion || ''} · Desde: ${Format.dateShort(col.fecha_instalacion)}</div>
                </div>
                <span class="badge ${badge?.color || 'badge-gray'}">${badge?.label || col.estado}</span>
              </div>
              ${ultimaInsp ? `
                <div class="text-xs text-muted mt-1">
                  Última inspección: ${Format.date(ultimaInsp.fecha)}
                  · Reina: ${ultimaInsp.estado_reina || '?'}
                  · Cría: ${ultimaInsp.marcos_cria || '?'} marcos
                  · Miel: ${ultimaInsp.marcos_miel || '?'} marcos
                </div>
              ` : '<div class="text-xs text-muted mt-1">Sin inspecciones registradas</div>'}
              <div class="flex gap-1 mt-1">
                <button class="btn btn-sm btn-primary btn-inspect-col" data-id="${col.id}">📋 Inspeccionar</button>
                <button class="btn btn-sm btn-outline btn-harvest-col" data-id="${col.id}">🍯 Cosechar</button>
                <button class="btn btn-sm btn-secondary btn-edit-col" data-id="${col.id}">✏️</button>
                <button class="btn btn-sm btn-danger btn-del-col" data-id="${col.id}">🗑</button>
              </div>
            </div>`;
      }).join('')}

      <!-- Recent inspections -->
      <div class="card">
        <div class="card-header"><h3>📋 Inspecciones recientes</h3></div>
        ${inspecciones.length === 0 ? '<p class="text-sm text-muted">Sin inspecciones</p>' :
      [...inspecciones].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 8).map(i => `
            <div class="data-list-item" style="padding:0.5rem 0;">
              <div class="data-list-left">
                <div class="data-list-title">${i.colmena_nombre || 'Colmena'}</div>
                <div class="data-list-sub">
                  ${Format.date(i.fecha)} · Reina: ${i.estado_reina || '?'}
                  · Cría: ${i.marcos_cria || 0} · Miel: ${i.marcos_miel || 0}
                  ${i.enfermedades && i.enfermedades !== 'ninguna' ? ` · <span class="text-red">${i.enfermedades}</span>` : ''}
                </div>
              </div>
              <span class="badge ${i.temperamento === 'tranquila' ? 'badge-green' : i.temperamento === 'agresiva' ? 'badge-red' : 'badge-amber'}">${i.temperamento || 'N/A'}</span>
            </div>
          `).join('')}
      </div>
    `;

    // Events
    document.getElementById('btn-new-colmena')?.addEventListener('click', () => showColmenaForm(fincaId));
    container.querySelectorAll('.btn-inspect-col').forEach(btn => {
      btn.addEventListener('click', () => showInspeccionColmena(fincaId, btn.dataset.id));
    });
    container.querySelectorAll('.btn-harvest-col').forEach(btn => {
      btn.addEventListener('click', () => showCosechaMiel(fincaId, btn.dataset.id));
    });
    container.querySelectorAll('.btn-edit-col').forEach(btn => {
      btn.addEventListener('click', async () => {
        const col = await AgroDB.getById('colmenas', btn.dataset.id);
        showColmenaForm(fincaId, col);
      });
    });
    container.querySelectorAll('.btn-del-col').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta colmena?')) {
          await AgroDB.remove('colmenas', btn.dataset.id);
          App.showToast('Colmena eliminada', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function showColmenaForm(fincaId, col = null) {
    const isEdit = !!col;
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>Nombre *</label>
          <input type="text" id="col-nombre" value="${col?.nombre || ''}" placeholder="Colmena 1">
        </div>
        <div class="form-group">
          <label>Tipo</label>
          <select id="col-tipo">
            <option value="langstroth" ${col?.tipo === 'langstroth' ? 'selected' : ''}>Langstroth</option>
            <option value="dadant" ${col?.tipo === 'dadant' ? 'selected' : ''}>Dadant</option>
            <option value="top_bar" ${col?.tipo === 'top_bar' ? 'selected' : ''}>Top Bar</option>
            <option value="warre" ${col?.tipo === 'warre' ? 'selected' : ''}>Warré</option>
            <option value="otro" ${col?.tipo === 'otro' ? 'selected' : ''}>Otro</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ubicación en finca</label>
          <input type="text" id="col-ubicacion" value="${col?.ubicacion || ''}" placeholder="Sector apiario norte">
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select id="col-estado">
            ${ESTADOS_COLMENA.map(e => `<option value="${e.value}" ${col?.estado === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Fecha de instalación</label>
        <input type="date" id="col-fecha" value="${col?.fecha_instalacion || DateUtils.today()}">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="col-notas" placeholder="Origen de la colonia, observaciones...">${col?.notas || ''}</textarea>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Colmena' : 'Nueva Colmena', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-col">Guardar</button>`);

    document.getElementById('btn-save-col').addEventListener('click', async () => {
      const nombre = document.getElementById('col-nombre').value.trim();
      if (!nombre) { App.showToast('Nombre obligatorio', 'warning'); return; }
      const data = {
        finca_id: fincaId, nombre,
        tipo: document.getElementById('col-tipo').value,
        ubicacion: document.getElementById('col-ubicacion').value.trim(),
        estado: document.getElementById('col-estado').value,
        fecha_instalacion: document.getElementById('col-fecha').value,
        notas: document.getElementById('col-notas').value.trim(),
        modificado_por: (() => { const u = AuthModule.getUser(); return u?.nombre || u?.email || 'sistema'; })()
      };
      if (isEdit) await AgroDB.update('colmenas', col.id, data);
      else await AgroDB.add('colmenas', data);
      App.closeModal();
      App.showToast('Colmena guardada', 'success');
      App.refreshCurrentPage();
    });
  }

  async function showInspeccionColmena(fincaId, colmenaId) {
    const col = await AgroDB.getById('colmenas', colmenaId);
    const body = `
      <div class="form-group">
        <label>Colmena</label>
        <input type="text" value="${col?.nombre || ''}" readonly style="background:#f5f5f5;">
      </div>
      <div class="form-group">
        <label>Fecha *</label>
        <input type="date" id="insp-fecha" value="${DateUtils.today()}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Estado de la reina</label>
          <select id="insp-reina">
            <option value="presente">Presente</option>
            <option value="ausente">Ausente</option>
            <option value="celdas_reales">Celdas reales</option>
            <option value="recien_introducida">Recién introducida</option>
          </select>
        </div>
        <div class="form-group">
          <label>Temperamento</label>
          <select id="insp-temp">
            <option value="tranquila">Tranquila</option>
            <option value="nerviosa">Nerviosa</option>
            <option value="agresiva">Agresiva</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Marcos de cría</label>
          <input type="number" id="insp-cria" value="" placeholder="0">
        </div>
        <div class="form-group">
          <label>Marcos de miel</label>
          <input type="number" id="insp-miel" value="" placeholder="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Enfermedades</label>
          <select id="insp-enferm">
            <option value="ninguna">Ninguna</option>
            <option value="varroa">Varroa</option>
            <option value="loque_americana">Loque americana</option>
            <option value="loque_europea">Loque europea</option>
            <option value="nosema">Nosema</option>
            <option value="cria_yesificada">Cría yesificada</option>
            <option value="polilla">Polilla de cera</option>
            <option value="otra">Otra</option>
          </select>
        </div>
        <div class="form-group">
          <label>Alimentación</label>
          <div class="checkbox-group">
            <input type="checkbox" id="insp-alim">
            <label for="insp-alim">Se alimentó</label>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>Tratamiento aplicado</label>
        <input type="text" id="insp-trat" placeholder="Ej: Ácido oxálico, timol...">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="insp-notas" placeholder="Observaciones de la inspección"></textarea>
      </div>
    `;
    App.showModal('Inspección de Colmena', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-insp-col">Guardar</button>`);

    document.getElementById('btn-save-insp-col').addEventListener('click', async () => {
      const data = {
        finca_id: fincaId,
        colmena_id: colmenaId,
        colmena_nombre: col?.nombre,
        fecha: document.getElementById('insp-fecha').value,
        estado_reina: document.getElementById('insp-reina').value,
        temperamento: document.getElementById('insp-temp').value,
        marcos_cria: parseInt(document.getElementById('insp-cria').value) || 0,
        marcos_miel: parseInt(document.getElementById('insp-miel').value) || 0,
        enfermedades: document.getElementById('insp-enferm').value,
        alimentacion: document.getElementById('insp-alim').checked,
        tratamiento: document.getElementById('insp-trat').value.trim(),
        notas: document.getElementById('insp-notas').value.trim(),
        inspector: (() => { const u = AuthModule.getUser(); return u?.nombre || u?.email || 'sistema'; })()
      };
      await AgroDB.add('inspecciones_colmena', data);

      // Update hive status based on inspection
      const updates = {};
      if (data.estado_reina === 'ausente') updates.estado = 'huerfana';
      else if (data.marcos_cria < 2) updates.estado = 'debil';
      else updates.estado = 'activa';
      await AgroDB.update('colmenas', colmenaId, updates);

      App.closeModal();
      App.showToast('Inspección registrada', 'success');
      App.refreshCurrentPage();
    });
  }

  async function showCosechaMiel(fincaId, colmenaId) {
    const col = await AgroDB.getById('colmenas', colmenaId);
    const body = `
      <div class="form-group">
        <label>Colmena</label>
        <input type="text" value="${col?.nombre || ''}" readonly style="background:#f5f5f5;">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="cos-fecha" value="${DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Cantidad (litros) *</label>
          <input type="number" id="cos-cantidad" step="0.1" placeholder="0">
        </div>
      </div>
      <div class="form-group">
        <label>Marcos extraídos</label>
        <input type="number" id="cos-marcos" placeholder="0">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="cos-notas" placeholder="Calidad, color, observaciones..."></textarea>
      </div>
    `;
    App.showModal('Cosecha de Miel', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-cos-miel">Guardar</button>`);

    document.getElementById('btn-save-cos-miel').addEventListener('click', async () => {
      const cantidad = parseFloat(document.getElementById('cos-cantidad').value);
      if (!cantidad) { App.showToast('Ingresa la cantidad', 'warning'); return; }

      // Find honey crop
      const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
      const mielCultivo = cultivos.find(c => c.nombre === 'Miel de Abeja');

      await AgroDB.add('cosechas', {
        finca_id: fincaId,
        cultivo_id: mielCultivo?.id || null,
        cultivo_nombre: 'Miel de Abeja',
        fecha: document.getElementById('cos-fecha').value,
        cantidad,
        unidad: 'litros',
        calidad: 'A',
        notas: `Colmena: ${col?.nombre}. Marcos: ${document.getElementById('cos-marcos').value || 'N/A'}. ${document.getElementById('cos-notas').value.trim()}`
      });

      App.closeModal();
      App.showToast('Cosecha de miel registrada', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render };
})();

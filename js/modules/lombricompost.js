// ============================================
// AgroFinca - Lombricompost Module
// Vermicompost bed management, organic waste
// tracking, input/output ratios
// ============================================

const LombricompostModule = (() => {

  const ESTADOS_CAMA = [
    { value: 'alimentando', label: 'Alimentando', color: 'badge-green' },
    { value: 'madurando', label: 'Madurando', color: 'badge-amber' },
    { value: 'cosechando', label: 'Lista para cosechar', color: 'badge-blue' },
    { value: 'vacia', label: 'Vacía', color: 'badge-gray' }
  ];

  const MATERIALES = [
    'Cáscara de plátano', 'Residuos de pimiento', 'Tallos de cilantro',
    'Estiércol bovino', 'Estiércol equino', 'Restos de cocina',
    'Hojarasca', 'Pasto cortado', 'Cartón/Papel', 'Aserrín',
    'Restos de cosecha', 'Otro'
  ];

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🪱</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const camas = await AgroDB.getByIndex('camas_lombricompost', 'finca_id', fincaId);
    const registros = await AgroDB.query('registros_lombricompost', r => r.finca_id === fincaId);

    const totalEntrada = registros.filter(r => r.tipo === 'entrada_residuo').reduce((s, r) => s + (r.cantidad_kg || 0), 0);
    const totalCosecha = registros.filter(r => r.tipo === 'cosecha').reduce((s, r) => s + (r.cantidad_kg || 0), 0);
    const ratio = totalEntrada > 0 ? ((totalCosecha / totalEntrada) * 100).toFixed(1) : 0;

    container.innerHTML = `
      <div class="page-header">
        <h2>🪱 Lombricompost</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-cama">+ Nueva Cama</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon brown">🪱</div>
          <div class="s-data"><div class="s-value">${camas.length}</div><div class="s-label">Camas totales</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon green">♻️</div>
          <div class="s-data"><div class="s-value">${Format.number(totalEntrada)} kg</div><div class="s-label">Residuos procesados</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📦</div>
          <div class="s-data"><div class="s-value">${Format.number(totalCosecha)} kg</div><div class="s-label">Humus cosechado</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">📊</div>
          <div class="s-data"><div class="s-value">${ratio}%</div><div class="s-label">Ratio entrada/salida</div></div>
        </div>
      </div>

      <!-- Beds -->
      ${camas.length === 0 ? '<div class="empty-state"><h3>Sin camas de lombricompost</h3><p>Crea tu primera cama para gestionar el proceso.</p></div>' :
      camas.map(cama => {
        const camaRegs = registros.filter(r => r.cama_id === cama.id);
        const entradas = camaRegs.filter(r => r.tipo === 'entrada_residuo').reduce((s, r) => s + (r.cantidad_kg || 0), 0);
        const cosechas = camaRegs.filter(r => r.tipo === 'cosecha').reduce((s, r) => s + (r.cantidad_kg || 0), 0);
        const ultimoReg = camaRegs.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
        const badge = ESTADOS_CAMA.find(e => e.value === cama.estado);
        return `
            <div class="card">
              <div class="flex-between">
                <div>
                  <div class="card-title">🪱 ${cama.nombre}</div>
                  <div class="card-subtitle">
                    ${cama.largo_m || '?'}m × ${cama.ancho_m || '?'}m · Inicio: ${Format.dateShort(cama.fecha_inicio)}
                  </div>
                </div>
                <span class="badge ${badge?.color || 'badge-gray'}">${badge?.label || cama.estado}</span>
              </div>
              <div class="flex gap-1 mt-1" style="flex-wrap:wrap;">
                <span class="text-sm">Entrada: <b>${Format.number(entradas)} kg</b></span>
                <span class="text-sm">Cosecha: <b>${Format.number(cosechas)} kg</b></span>
                ${ultimoReg ? `<span class="text-xs text-muted">Último: ${Format.date(ultimoReg.fecha)} (${ultimoReg.tipo.replace('_', ' ')})</span>` : ''}
              </div>
              <div class="flex gap-1 mt-1">
                <button class="btn btn-sm btn-primary btn-add-residuo" data-id="${cama.id}">♻️ Agregar</button>
                <button class="btn btn-sm btn-outline btn-volteo" data-id="${cama.id}">🔄 Volteo</button>
                <button class="btn btn-sm btn-outline btn-riego-cama" data-id="${cama.id}">💧 Riego</button>
                <button class="btn btn-sm btn-outline btn-cosecha-cama" data-id="${cama.id}">📦 Cosechar</button>
                <button class="btn btn-sm btn-secondary btn-edit-cama" data-id="${cama.id}">✏️</button>
                <button class="btn btn-sm btn-danger btn-del-cama" data-id="${cama.id}">🗑</button>
              </div>
            </div>`;
      }).join('')}

      <!-- Recent records -->
      <div class="card">
        <div class="card-header"><h3>Registros recientes</h3></div>
        ${registros.length === 0 ? '<p class="text-sm text-muted">Sin registros</p>' :
      [...registros].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 10).map(r => `
            <div class="data-list-item" style="padding:0.5rem 0;">
              <div class="data-list-left">
                <div class="data-list-title">${r.tipo.replace(/_/g, ' ')}</div>
                <div class="data-list-sub">${Format.date(r.fecha)} · ${r.material || ''} · Cama: ${r.cama_nombre || ''}</div>
              </div>
              <div class="data-list-right">
                ${r.cantidad_kg ? `<div class="data-list-value">${r.cantidad_kg} kg</div>` : '<span class="text-sm text-muted">-</span>'}
              </div>
            </div>
          `).join('')}
      </div>
    `;

    // Events
    document.getElementById('btn-new-cama')?.addEventListener('click', () => showCamaForm(fincaId));
    container.querySelectorAll('.btn-add-residuo').forEach(btn => {
      btn.addEventListener('click', () => showRegistroForm(fincaId, btn.dataset.id, 'entrada_residuo'));
    });
    container.querySelectorAll('.btn-volteo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cama = await AgroDB.getById('camas_lombricompost', btn.dataset.id);
        await AgroDB.add('registros_lombricompost', {
          finca_id: fincaId, cama_id: btn.dataset.id, cama_nombre: cama?.nombre,
          fecha: DateUtils.today(), tipo: 'volteo', notas: 'Volteo de rutina'
        });
        App.showToast('Volteo registrado', 'success');
        App.refreshCurrentPage();
      });
    });
    container.querySelectorAll('.btn-riego-cama').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cama = await AgroDB.getById('camas_lombricompost', btn.dataset.id);
        await AgroDB.add('registros_lombricompost', {
          finca_id: fincaId, cama_id: btn.dataset.id, cama_nombre: cama?.nombre,
          fecha: DateUtils.today(), tipo: 'riego', notas: 'Riego de mantenimiento'
        });
        App.showToast('Riego registrado', 'success');
        App.refreshCurrentPage();
      });
    });
    container.querySelectorAll('.btn-cosecha-cama').forEach(btn => {
      btn.addEventListener('click', () => showRegistroForm(fincaId, btn.dataset.id, 'cosecha'));
    });
    container.querySelectorAll('.btn-edit-cama').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cama = await AgroDB.getById('camas_lombricompost', btn.dataset.id);
        showCamaForm(fincaId, cama);
      });
    });
    container.querySelectorAll('.btn-del-cama').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta cama y todos sus registros?')) {
          const regs = await AgroDB.query('registros_lombricompost', r => r.cama_id === btn.dataset.id);
          for (const r of regs) await AgroDB.remove('registros_lombricompost', r.id);
          await AgroDB.remove('camas_lombricompost', btn.dataset.id);
          App.showToast('Cama eliminada', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function showCamaForm(fincaId, cama = null) {
    const isEdit = !!cama;
    const body = `
      <div class="form-group">
        <label>Nombre de la cama *</label>
        <input type="text" id="cama-nombre" value="${cama?.nombre || ''}" placeholder="Cama 1, Compostera A...">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Largo (m)</label>
          <input type="number" step="0.1" id="cama-largo" value="${cama?.largo_m || ''}" placeholder="3">
        </div>
        <div class="form-group">
          <label>Ancho (m)</label>
          <input type="number" step="0.1" id="cama-ancho" value="${cama?.ancho_m || ''}" placeholder="1">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha de inicio</label>
          <input type="date" id="cama-fecha" value="${cama?.fecha_inicio || DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select id="cama-estado">
            ${ESTADOS_CAMA.map(e => `<option value="${e.value}" ${cama?.estado === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="cama-notas" placeholder="Tipo de lombrices, observaciones...">${cama?.notas || ''}</textarea>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Cama' : 'Nueva Cama', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-cama">Guardar</button>`);

    document.getElementById('btn-save-cama').addEventListener('click', async () => {
      const nombre = document.getElementById('cama-nombre').value.trim();
      if (!nombre) { App.showToast('El nombre es obligatorio', 'warning'); return; }
      const data = {
        finca_id: fincaId, nombre,
        largo_m: parseFloat(document.getElementById('cama-largo').value) || 0,
        ancho_m: parseFloat(document.getElementById('cama-ancho').value) || 0,
        fecha_inicio: document.getElementById('cama-fecha').value,
        estado: document.getElementById('cama-estado').value,
        notas: document.getElementById('cama-notas').value.trim(),
        modificado_por: (() => { const u = AuthModule.getUser(); return u?.nombre || u?.email || 'sistema'; })()
      };
      if (isEdit) await AgroDB.update('camas_lombricompost', cama.id, data);
      else await AgroDB.add('camas_lombricompost', data);
      App.closeModal();
      App.showToast('Cama guardada', 'success');
      App.refreshCurrentPage();
    });
  }

  async function showRegistroForm(fincaId, camaId, tipo) {
    const cama = await AgroDB.getById('camas_lombricompost', camaId);
    const body = `
      <div class="form-group">
        <label>Cama</label>
        <input type="text" value="${cama?.nombre || ''}" readonly style="background:#f5f5f5;">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="reg-fecha" value="${DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Cantidad (kg) *</label>
          <input type="number" id="reg-cantidad" step="0.1" placeholder="0">
        </div>
      </div>
      ${tipo === 'entrada_residuo' ? `
        <div class="form-group">
          <label>Tipo de material</label>
          <select id="reg-material">
            ${MATERIALES.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
      ` : ''}
      <div class="form-group">
        <label>Notas</label>
        <textarea id="reg-notas" placeholder="Observaciones"></textarea>
      </div>
    `;
    const titulo = tipo === 'entrada_residuo' ? 'Agregar Residuo' : 'Cosechar Humus';
    App.showModal(titulo, body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-reg">Guardar</button>`);

    document.getElementById('btn-save-reg').addEventListener('click', async () => {
      const cantidad = parseFloat(document.getElementById('reg-cantidad').value);
      if (!cantidad) { App.showToast('Ingresa la cantidad', 'warning'); return; }
      const data = {
        finca_id: fincaId, cama_id: camaId, cama_nombre: cama?.nombre,
        fecha: document.getElementById('reg-fecha').value,
        tipo,
        material: tipo === 'entrada_residuo' ? document.getElementById('reg-material').value : null,
        cantidad_kg: cantidad,
        notas: document.getElementById('reg-notas').value.trim(),
        registrado_por: (() => { const u = AuthModule.getUser(); return u?.nombre || u?.email || 'sistema'; })()
      };
      await AgroDB.add('registros_lombricompost', data);
      App.closeModal();
      App.showToast('Registro guardado', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render };
})();

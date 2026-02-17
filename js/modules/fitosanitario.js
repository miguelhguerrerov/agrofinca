// ============================================
// AgroFinca - Fitosanitario Module
// Phytosanitary agent dosification tracking
// For crops, beehives, and vermicompost
// ============================================

const FitosanitarioModule = (() => {

  const TIPOS_PRODUCTO = [
    { value: 'insecticida', label: 'Insecticida', icon: '🐛' },
    { value: 'fungicida', label: 'Fungicida', icon: '🍄' },
    { value: 'herbicida', label: 'Herbicida', icon: '🌾' },
    { value: 'acaricida', label: 'Acaricida', icon: '🕷️' },
    { value: 'nematicida', label: 'Nematicida', icon: '🪱' },
    { value: 'fertilizante_foliar', label: 'Fertilizante foliar', icon: '🌿' },
    { value: 'biocontrolador', label: 'Biocontrolador', icon: '🦠' },
    { value: 'regulador_crecimiento', label: 'Regulador de crecimiento', icon: '📏' },
    { value: 'tratamiento_apicola', label: 'Tratamiento apícola', icon: '🐝' },
    { value: 'enmienda_suelo', label: 'Enmienda de suelo', icon: '🪨' },
    { value: 'organico', label: 'Producto orgánico', icon: '♻️' },
    { value: 'otro', label: 'Otro', icon: '🧪' }
  ];

  const CATEGORIAS_TOXICIDAD = [
    { value: 'I', label: 'I - Extremadamente peligroso', color: '#D32F2F' },
    { value: 'II', label: 'II - Altamente peligroso', color: '#F44336' },
    { value: 'III', label: 'III - Moderadamente peligroso', color: '#FFA000' },
    { value: 'IV', label: 'IV - Ligeramente peligroso', color: '#4CAF50' },
    { value: 'organico', label: 'Orgánico / Sin toxicidad', color: '#2E7D32' }
  ];

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🧪</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const aplicaciones = await AgroDB.query('aplicaciones_fitosanitarias', r => r.finca_id === fincaId);
    const sorted = [...aplicaciones].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const month = DateUtils.currentMonthRange();
    const aplicMes = aplicaciones.filter(a => a.fecha >= month.start && a.fecha <= month.end);

    container.innerHTML = `
      <div class="page-header">
        <h2>🧪 Control Fitosanitario</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-aplic">+ Nueva Aplicación</button>
      </div>

      <p class="text-sm text-muted mb-2">Registro de dosificación de agentes fitosanitarios para cultivos, apicultura y lombricompost.</p>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon amber">🧪</div>
          <div class="s-data"><div class="s-value">${aplicMes.length}</div><div class="s-label">Aplicaciones este mes</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">📊</div>
          <div class="s-data"><div class="s-value">${aplicaciones.length}</div><div class="s-label">Total registrado</div></div>
        </div>
      </div>

      ${sorted.length === 0 ? '<div class="empty-state"><h3>Sin aplicaciones registradas</h3><p>Registra las aplicaciones fitosanitarias para mantener trazabilidad.</p></div>' :
      sorted.map(a => `
          <div class="card">
            <div class="flex-between">
              <div>
                <div class="card-title">${a.nombre_producto || 'Producto'}</div>
                <div class="card-subtitle">
                  ${Format.date(a.fecha)} · ${a.cultivo_nombre || a.destino || 'General'}
                </div>
              </div>
              <span class="badge" style="background:${CATEGORIAS_TOXICIDAD.find(t => t.value === a.categoria_toxicidad)?.color || '#9E9E9E'}20;color:${CATEGORIAS_TOXICIDAD.find(t => t.value === a.categoria_toxicidad)?.color || '#9E9E9E'};">${a.categoria_toxicidad || 'N/A'}</span>
            </div>
            <div class="flex gap-1 mt-1" style="flex-wrap:wrap;">
              <span class="badge badge-blue">${TIPOS_PRODUCTO.find(t => t.value === a.tipo_producto)?.label || a.tipo_producto}</span>
              <span class="text-sm">Dosis: <b>${a.dosis} ${a.unidad_dosis}</b></span>
              ${a.area_aplicada_m2 ? `<span class="text-sm">Área: ${Format.area(a.area_aplicada_m2)}</span>` : ''}
              ${a.volumen_agua_litros ? `<span class="text-sm">Agua: ${a.volumen_agua_litros}L</span>` : ''}
            </div>
            ${a.periodo_carencia_dias ? `<div class="text-xs text-amber mt-1">⚠️ Período de carencia: ${a.periodo_carencia_dias} días (hasta ${Format.dateShort(DateUtils.addDays(a.fecha, a.periodo_carencia_dias))})</div>` : ''}
            <div class="flex gap-1 mt-1">
              <button class="btn btn-sm btn-outline btn-edit-aplic" data-id="${a.id}">✏️</button>
              <button class="btn btn-sm btn-danger btn-del-aplic" data-id="${a.id}">🗑</button>
            </div>
          </div>
        `).join('')}
    `;

    document.getElementById('btn-new-aplic')?.addEventListener('click', () => showQuickApplication(fincaId));
    container.querySelectorAll('.btn-edit-aplic').forEach(btn => {
      btn.addEventListener('click', async () => {
        const a = await AgroDB.getById('aplicaciones_fitosanitarias', btn.dataset.id);
        showQuickApplication(fincaId, a);
      });
    });
    container.querySelectorAll('.btn-del-aplic').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este registro?')) {
          await AgroDB.remove('aplicaciones_fitosanitarias', btn.dataset.id);
          App.showToast('Registro eliminado', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function showQuickApplication(fincaId, aplic = null) {
    const isEdit = !!aplic;
    const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
    const ciclos = await AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo');
    const colmenas = await AgroDB.getByIndex('colmenas', 'finca_id', fincaId);
    const camas = await AgroDB.getByIndex('camas_lombricompost', 'finca_id', fincaId);

    const body = `
      <div class="form-group">
        <label>Destino de la aplicación *</label>
        <select id="aplic-destino">
          <option value="">Seleccionar...</option>
          <optgroup label="Ciclos de Cultivo">
            ${ciclos.map(c => `<option value="ciclo:${c.id}" data-nombre="${c.cultivo_nombre}" data-area="${c.area_id}" ${aplic?.ciclo_id === c.id ? 'selected' : ''}>${c.cultivo_nombre} - ${c.area_nombre || ''}</option>`).join('')}
          </optgroup>
          <optgroup label="Áreas">
            ${areas.map(a => `<option value="area:${a.id}" data-nombre="${a.nombre}" ${aplic?.area_id === a.id && !aplic?.ciclo_id ? 'selected' : ''}>${a.nombre}</option>`).join('')}
          </optgroup>
          <optgroup label="Colmenas">
            ${colmenas.map(c => `<option value="colmena:${c.id}" data-nombre="Colmena: ${c.nombre}" ${aplic?.destino === 'colmena' && aplic?.colmena_id === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
          </optgroup>
          <optgroup label="Lombricompost">
            ${camas.map(c => `<option value="cama:${c.id}" data-nombre="Cama: ${c.nombre}" ${aplic?.destino === 'lombricompost' && aplic?.cama_id === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
          </optgroup>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Tipo de producto *</label>
          <select id="aplic-tipo">
            ${TIPOS_PRODUCTO.map(t => `<option value="${t.value}" ${aplic?.tipo_producto === t.value ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" id="aplic-fecha" value="${aplic?.fecha || DateUtils.today()}">
        </div>
      </div>

      <div class="form-group">
        <label>Nombre del producto *</label>
        <input type="text" id="aplic-nombre" value="${aplic?.nombre_producto || ''}" placeholder="Ej: Trichoderma, Neem, Cipermetrina...">
      </div>
      <div class="form-group">
        <label>Ingrediente activo</label>
        <input type="text" id="aplic-ingrediente" value="${aplic?.ingrediente_activo || ''}" placeholder="Ej: Cipermetrina 25%">
      </div>

      <div class="section-title">📐 Dosificación</div>
      <div class="form-row">
        <div class="form-group">
          <label>Dosis *</label>
          <input type="number" id="aplic-dosis" step="0.01" value="${aplic?.dosis || ''}" placeholder="0">
        </div>
        <div class="form-group">
          <label>Unidad de dosis</label>
          <select id="aplic-unidad-dosis">
            ${['ml/L', 'g/L', 'cc/L', 'ml/20L', 'g/20L', 'kg/ha', 'L/ha', 'ml', 'g', 'cc'].map(u =>
      `<option value="${u}" ${aplic?.unidad_dosis === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Volumen de agua (litros)</label>
          <input type="number" id="aplic-agua" step="0.1" value="${aplic?.volumen_agua_litros || ''}" placeholder="20">
        </div>
        <div class="form-group">
          <label>Área aplicada (m²)</label>
          <input type="number" id="aplic-area-m2" value="${aplic?.area_aplicada_m2 || ''}" placeholder="0">
        </div>
      </div>
      <div class="form-group">
        <label>Método de aplicación</label>
        <select id="aplic-metodo">
          <option value="aspersion_foliar" ${aplic?.metodo === 'aspersion_foliar' ? 'selected' : ''}>Aspersión foliar</option>
          <option value="drench" ${aplic?.metodo === 'drench' ? 'selected' : ''}>Drench (al suelo)</option>
          <option value="inyeccion" ${aplic?.metodo === 'inyeccion' ? 'selected' : ''}>Inyección</option>
          <option value="granulado" ${aplic?.metodo === 'granulado' ? 'selected' : ''}>Granulado</option>
          <option value="fumigacion" ${aplic?.metodo === 'fumigacion' ? 'selected' : ''}>Fumigación</option>
          <option value="cebo" ${aplic?.metodo === 'cebo' ? 'selected' : ''}>Cebo / Trampa</option>
          <option value="otro" ${aplic?.metodo === 'otro' ? 'selected' : ''}>Otro</option>
        </select>
      </div>

      <div class="section-title">⚠️ Seguridad</div>
      <div class="form-row">
        <div class="form-group">
          <label>Categoría toxicológica</label>
          <select id="aplic-toxicidad">
            ${CATEGORIAS_TOXICIDAD.map(t => `<option value="${t.value}" ${aplic?.categoria_toxicidad === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Período de carencia (días)</label>
          <input type="number" id="aplic-carencia" value="${aplic?.periodo_carencia_dias || ''}" placeholder="0">
          <span class="form-hint">Días antes de poder cosechar</span>
        </div>
      </div>
      <div class="form-group">
        <label>Motivo de la aplicación</label>
        <textarea id="aplic-motivo" placeholder="¿Por qué se aplica? ¿Qué plaga/enfermedad?">${aplic?.motivo || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Observaciones</label>
        <textarea id="aplic-notas" placeholder="Condiciones climáticas, resultado esperado...">${aplic?.notas || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Aplicado por</label>
        <input type="text" id="aplic-aplicador" value="${aplic?.aplicado_por || AuthModule.getUser()?.nombre || ''}" placeholder="Nombre">
      </div>
    `;

    App.showModal(isEdit ? 'Editar Aplicación' : 'Nueva Aplicación Fitosanitaria', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-aplic">Guardar</button>`);

    document.getElementById('btn-save-aplic').addEventListener('click', async () => {
      const nombre = document.getElementById('aplic-nombre').value.trim();
      const dosis = parseFloat(document.getElementById('aplic-dosis').value);
      if (!nombre) { App.showToast('Nombre del producto es obligatorio', 'warning'); return; }

      const destinoSel = document.getElementById('aplic-destino').value;
      const destinoOpt = document.getElementById('aplic-destino').selectedOptions[0];
      let ciclo_id = null, area_id = null, colmena_id = null, cama_id = null, destino = 'cultivo';
      if (destinoSel.startsWith('ciclo:')) { ciclo_id = destinoSel.split(':')[1]; destino = 'cultivo'; }
      else if (destinoSel.startsWith('area:')) { area_id = destinoSel.split(':')[1]; destino = 'area'; }
      else if (destinoSel.startsWith('colmena:')) { colmena_id = destinoSel.split(':')[1]; destino = 'colmena'; }
      else if (destinoSel.startsWith('cama:')) { cama_id = destinoSel.split(':')[1]; destino = 'lombricompost'; }

      const data = {
        finca_id: fincaId,
        destino,
        cultivo_nombre: destinoOpt?.dataset.nombre || '',
        ciclo_id, area_id, colmena_id, cama_id,
        tipo_producto: document.getElementById('aplic-tipo').value,
        nombre_producto: nombre,
        ingrediente_activo: document.getElementById('aplic-ingrediente').value.trim(),
        fecha: document.getElementById('aplic-fecha').value,
        dosis: dosis || 0,
        unidad_dosis: document.getElementById('aplic-unidad-dosis').value,
        volumen_agua_litros: parseFloat(document.getElementById('aplic-agua').value) || null,
        area_aplicada_m2: parseFloat(document.getElementById('aplic-area-m2').value) || null,
        metodo: document.getElementById('aplic-metodo').value,
        categoria_toxicidad: document.getElementById('aplic-toxicidad').value,
        periodo_carencia_dias: parseInt(document.getElementById('aplic-carencia').value) || 0,
        motivo: document.getElementById('aplic-motivo').value.trim(),
        notas: document.getElementById('aplic-notas').value.trim(),
        aplicado_por: document.getElementById('aplic-aplicador').value.trim()
      };

      if (isEdit) await AgroDB.update('aplicaciones_fitosanitarias', aplic.id, data);
      else await AgroDB.add('aplicaciones_fitosanitarias', data);

      App.closeModal();
      App.showToast('Aplicación registrada', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render, showQuickApplication };
})();

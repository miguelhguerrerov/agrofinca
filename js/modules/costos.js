// ============================================
// AgroFinca - Costos Module
// Cost tracking: inputs, labor (hired+family),
// tools, infrastructure, transport, phytosanitary
// ============================================

const CostosModule = (() => {

  const CATEGORIAS = [
    { value: 'insumo', label: 'Insumo', icon: '🌿' },
    { value: 'mano_obra_contratada', label: 'Mano de obra contratada', icon: '👷' },
    { value: 'mano_obra_familiar', label: 'Mano de obra familiar', icon: '👨‍🌾' },
    { value: 'herramienta', label: 'Herramienta', icon: '🔧' },
    { value: 'infraestructura', label: 'Infraestructura', icon: '🏗️' },
    { value: 'transporte', label: 'Transporte', icon: '🚛' },
    { value: 'fitosanitario', label: 'Fitosanitario', icon: '🧪' },
    { value: 'riego', label: 'Riego', icon: '💧' },
    { value: 'empaque', label: 'Empaque', icon: '📦' },
    { value: 'otro', label: 'Otro', icon: '📋' }
  ];

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📉</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const costos = await AgroDB.query('costos', r => r.finca_id === fincaId);
    const sorted = [...costos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const month = DateUtils.currentMonthRange();
    const costosMes = costos.filter(c => c.fecha >= month.start && c.fecha <= month.end);
    const totalMes = costosMes.reduce((s, c) => s + (c.total || 0), 0);
    const totalGeneral = costos.reduce((s, c) => s + (c.total || 0), 0);

    // Family labor total (valuable but not paid)
    const familiarTotal = costos.filter(c => c.categoria === 'mano_obra_familiar').reduce((s, c) => s + (c.total || 0), 0);
    const contratadoTotal = costos.filter(c => c.categoria === 'mano_obra_contratada').reduce((s, c) => s + (c.total || 0), 0);

    // By category
    const byCategory = {};
    costos.forEach(c => {
      const cat = c.categoria || 'otro';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += c.total || 0;
    });

    container.innerHTML = `
      <div class="page-header">
        <h2>📉 Costos</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-costo">+ Nuevo Costo</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon red">📉</div>
          <div class="s-data"><div class="s-value">${Format.money(totalMes)}</div><div class="s-label">Costos del mes</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📊</div>
          <div class="s-data"><div class="s-value">${Format.money(totalGeneral)}</div><div class="s-label">Total acumulado</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">👷</div>
          <div class="s-data"><div class="s-value">${Format.money(contratadoTotal)}</div><div class="s-label">M.O. Contratada</div></div>
        </div>
        <div class="summary-card">
          <div class="s-icon brown">👨‍🌾</div>
          <div class="s-data"><div class="s-value">${Format.money(familiarTotal)}</div><div class="s-label">M.O. Familiar (valorada)</div></div>
        </div>
      </div>

      <!-- By category chart -->
      <div class="card">
        <div class="card-title">Distribución de costos</div>
        <div id="chart-costos-cat" class="chart-container"></div>
      </div>

      <!-- List -->
      <div class="card">
        <div class="card-header"><h3>Historial de costos</h3></div>
        ${sorted.length === 0 ? '<div class="empty-state"><h3>Sin costos registrados</h3></div>' :
      `<ul class="data-list">
            ${sorted.map(c => `
              <li class="data-list-item">
                <div class="data-list-left">
                  <div class="data-list-title">${c.descripcion || Format.costCategory(c.categoria)}</div>
                  <div class="data-list-sub">
                    ${Format.date(c.fecha)} · ${Format.costCategory(c.categoria)}
                    ${c.cultivo_nombre ? ` · ${c.cultivo_nombre}` : ''}
                    ${c.categoria === 'mano_obra_familiar' ? ' <span class="badge badge-brown">Familiar</span>' : ''}
                  </div>
                </div>
                <div class="data-list-right">
                  <div class="data-list-value negative">${Format.money(c.total)}</div>
                  ${c.cantidad ? `<div class="text-xs text-muted">${c.cantidad} ${c.unidad || ''} × ${Format.money(c.costo_unitario)}</div>` : ''}
                  <div class="data-list-actions">
                    <button class="btn btn-sm btn-outline btn-edit-costo" data-id="${c.id}">✏️</button>
                    <button class="btn btn-sm btn-danger btn-del-costo" data-id="${c.id}">🗑</button>
                  </div>
                </div>
              </li>
            `).join('')}
          </ul>`}
      </div>
    `;

    // Chart
    const catLabels = Object.keys(byCategory).map(k => Format.costCategory(k));
    Charts.pieChart('chart-costos-cat', {
      labels: catLabels,
      values: Object.values(byCategory)
    }, { height: 200, donut: true });

    // Events
    document.getElementById('btn-new-costo')?.addEventListener('click', () => showQuickCost(fincaId));
    container.querySelectorAll('.btn-edit-costo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = await AgroDB.getById('costos', btn.dataset.id);
        showQuickCost(fincaId, c);
      });
    });
    container.querySelectorAll('.btn-del-costo').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este costo?')) {
          await AgroDB.remove('costos', btn.dataset.id);
          App.showToast('Costo eliminado', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function showQuickCost(fincaId, costo = null) {
    const isEdit = !!costo;
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
    const ciclos = await AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo');

    const body = `
      <div class="form-group">
        <label>Categoría *</label>
        <select id="costo-categoria">
          ${CATEGORIAS.map(c => `<option value="${c.value}" ${costo?.categoria === c.value ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
        </select>
      </div>

      <div id="labor-info" class="card" style="display:none;background:#FFF8E1;padding:0.75rem;margin-bottom:1rem;">
        <p class="text-sm">💡 <b>Mano de obra familiar:</b> Registra el valor estimado del jornal familiar aunque no se pague en efectivo. Esto es importante para conocer el costo real de producción.</p>
      </div>

      <div class="form-group">
        <label>Descripción *</label>
        <input type="text" id="costo-desc" value="${costo?.descripcion || ''}" placeholder="Ej: Compra de semillas, jornal sábado...">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cultivo / Actividad</label>
          <select id="costo-cultivo">
            <option value="">General (toda la finca)</option>
            ${cultivos.map(c => `<option value="${c.id}" data-nombre="${c.nombre}" ${costo?.cultivo_id === c.id ? 'selected' : ''}>${c.icono || ''} ${c.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Ciclo productivo</label>
          <select id="costo-ciclo">
            <option value="">Sin ciclo específico</option>
            ${ciclos.map(c => `<option value="${c.id}" ${costo?.ciclo_id === c.id ? 'selected' : ''}>${c.cultivo_nombre} - ${c.area_nombre || ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Fecha *</label>
        <input type="date" id="costo-fecha" value="${costo?.fecha || DateUtils.today()}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cantidad</label>
          <input type="number" id="costo-cantidad" step="0.1" value="${costo?.cantidad || ''}" placeholder="1">
        </div>
        <div class="form-group">
          <label>Unidad</label>
          <select id="costo-unidad">
            <option value="unidad" ${costo?.unidad === 'unidad' ? 'selected' : ''}>Unidad</option>
            <option value="jornal" ${costo?.unidad === 'jornal' ? 'selected' : ''}>Jornal (día)</option>
            <option value="hora" ${costo?.unidad === 'hora' ? 'selected' : ''}>Hora</option>
            <option value="kg" ${costo?.unidad === 'kg' ? 'selected' : ''}>kg</option>
            <option value="litro" ${costo?.unidad === 'litro' ? 'selected' : ''}>Litro</option>
            <option value="saco" ${costo?.unidad === 'saco' ? 'selected' : ''}>Saco</option>
            <option value="global" ${costo?.unidad === 'global' ? 'selected' : ''}>Global</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Costo unitario ($) *</label>
          <input type="number" id="costo-unitario" step="0.01" value="${costo?.costo_unitario || ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Total ($)</label>
          <input type="number" id="costo-total" step="0.01" value="${costo?.total || ''}" readonly style="background:#f5f5f5;">
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="costo-notas" placeholder="Observaciones">${costo?.notas || ''}</textarea>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Costo' : 'Registrar Costo', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-costo">Guardar</button>`);

    // Show family labor info
    const catSel = document.getElementById('costo-categoria');
    const laborInfo = document.getElementById('labor-info');
    const toggleLaborInfo = () => {
      const val = catSel.value;
      laborInfo.style.display = (val === 'mano_obra_familiar') ? 'block' : 'none';
      if (val === 'mano_obra_familiar' || val === 'mano_obra_contratada') {
        document.getElementById('costo-unidad').value = 'jornal';
      }
    };
    catSel.addEventListener('change', toggleLaborInfo);
    toggleLaborInfo();

    // Auto calc
    const calcTotal = () => {
      const cant = parseFloat(document.getElementById('costo-cantidad').value) || 1;
      const unit = parseFloat(document.getElementById('costo-unitario').value) || 0;
      document.getElementById('costo-total').value = (cant * unit).toFixed(2);
    };
    document.getElementById('costo-cantidad').addEventListener('input', calcTotal);
    document.getElementById('costo-unitario').addEventListener('input', calcTotal);

    document.getElementById('btn-save-costo').addEventListener('click', async () => {
      const desc = document.getElementById('costo-desc').value.trim();
      const costoUnit = parseFloat(document.getElementById('costo-unitario').value);
      if (!desc) { App.showToast('La descripción es obligatoria', 'warning'); return; }

      const cultivoSel = document.getElementById('costo-cultivo');
      const cultivoOpt = cultivoSel.selectedOptions[0];

      const data = {
        finca_id: fincaId,
        categoria: document.getElementById('costo-categoria').value,
        descripcion: desc,
        cultivo_id: cultivoSel.value || null,
        cultivo_nombre: cultivoSel.value ? cultivoOpt.dataset.nombre : null,
        ciclo_id: document.getElementById('costo-ciclo').value || null,
        fecha: document.getElementById('costo-fecha').value,
        cantidad: parseFloat(document.getElementById('costo-cantidad').value) || 1,
        unidad: document.getElementById('costo-unidad').value,
        costo_unitario: costoUnit || 0,
        total: parseFloat(document.getElementById('costo-total').value) || 0,
        es_mano_obra_familiar: document.getElementById('costo-categoria').value === 'mano_obra_familiar',
        notas: document.getElementById('costo-notas').value.trim(),
        registrado_por: (() => { const u = AuthModule.getUser(); return u?.nombre || u?.email || 'sistema'; })()
      };

      if (isEdit) await AgroDB.update('costos', costo.id, data);
      else await AgroDB.add('costos', data);

      App.closeModal();
      App.showToast('Costo guardado', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render, showQuickCost };
})();

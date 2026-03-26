// ============================================
// AgroFinca - Activos Module
// Depreciable asset management + auto depreciation
// ============================================

const ActivosModule = (() => {
  const CATEGORIAS = [
    { value: 'herramienta', label: 'Herramienta', icon: '🔧' },
    { value: 'infraestructura', label: 'Infraestructura', icon: '🏗️' },
    { value: 'vehiculo', label: 'Vehículo', icon: '🚛' },
    { value: 'riego', label: 'Sistema de riego', icon: '💧' },
    { value: 'otro', label: 'Otro', icon: '📦' }
  ];

  async function render(container, fincaId) {
    const activos = await AgroDB.query('activos_finca', r => r.finca_id === fincaId);
    const sorted = activos.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    // Generate depreciation for current month
    await generarDepreciacion(fincaId);

    const depAll = await AgroDB.query('depreciacion_mensual', r => r.finca_id === fincaId);

    let totalValorActual = 0;
    let totalDepMensual = 0;

    const rows = sorted.map(a => {
      const depMensual = a.vida_util_meses > 0
        ? (a.costo_adquisicion - (a.valor_residual || 0)) / a.vida_util_meses
        : 0;
      const depAcumulada = depAll.filter(d => d.activo_id === a.id).reduce((s, d) => s + (d.monto || 0), 0);
      const valorActual = Math.max(0, a.costo_adquisicion - depAcumulada);
      const cat = CATEGORIAS.find(c => c.value === a.categoria) || CATEGORIAS[4];

      if (a.estado === 'activo') {
        totalValorActual += valorActual;
        totalDepMensual += depMensual;
      }

      return `
        <div class="card" style="margin-bottom:0.5rem;${a.estado !== 'activo' ? 'opacity:0.6' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${cat.icon} ${a.nombre}</strong>
              <div class="card-subtitle">${cat.label} · ${a.estado === 'activo' ? '✅ Activo' : '⛔ Dado de baja'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:var(--green-700)">$${valorActual.toFixed(2)}</div>
              <div class="card-subtitle">-$${depMensual.toFixed(2)}/mes</div>
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;font-size:0.8rem;color:var(--gray-500)">
            <span>Costo: $${(a.costo_adquisicion || 0).toFixed(2)}</span>
            <span>·</span>
            <span>Vida útil: ${a.vida_util_meses || 0} meses</span>
            <span>·</span>
            <span>Dep. acumulada: $${depAcumulada.toFixed(2)}</span>
          </div>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
            <button class="btn btn-xs btn-outline" onclick="ActivosModule.showActivoForm('${fincaId}', '${a.id}')">✏️ Editar</button>
            ${a.estado === 'activo' ? `<button class="btn btn-xs btn-outline" onclick="ActivosModule.darDeBaja('${a.id}')">⛔ Dar de baja</button>` : ''}
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div>
          <div style="font-size:0.85rem;color:var(--gray-500)">Valor total activos</div>
          <div style="font-size:1.3rem;font-weight:700">$${totalValorActual.toFixed(2)}</div>
          <div style="font-size:0.8rem;color:var(--gray-500)">Depreciación mensual: $${totalDepMensual.toFixed(2)}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="ActivosModule.showActivoForm('${fincaId}')">+ Nuevo activo</button>
      </div>
      ${rows || '<div class="empty-state"><p>No hay activos registrados.</p></div>'}`;
  }

  async function showActivoForm(fincaId, activoId = null) {
    let activo = null;
    if (activoId) {
      activo = await AgroDB.getById('activos_finca', activoId);
    }

    const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);

    const catOpts = CATEGORIAS.map(c =>
      `<option value="${c.value}" ${activo?.categoria === c.value ? 'selected' : ''}>${c.icon} ${c.label}</option>`
    ).join('');

    const areaOpts = `<option value="">-- Sin asignar --</option>` +
      areas.map(a => `<option value="${a.id}" ${activo?.area_id === a.id ? 'selected' : ''}>${a.nombre}</option>`).join('');

    const cultivoOpts = `<option value="">-- Sin asignar --</option>` +
      cultivos.map(c => `<option value="${c.id}" ${activo?.cultivo_id === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('');

    const today = new Date().toISOString().slice(0, 10);

    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');
    if (!modalBody || !modalTitle || !modalFooter) return;

    modalTitle.textContent = activo ? '✏️ Editar activo' : '➕ Nuevo activo';
    modalBody.innerHTML = `
      <form id="activo-form">
        <div class="form-group">
          <label>Nombre del activo *</label>
          <input class="form-input" type="text" id="activo-nombre" value="${activo?.nombre || ''}" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Categoría</label>
            <select class="form-input" id="activo-categoria">${catOpts}</select>
          </div>
          <div class="form-group">
            <label>Fecha adquisición</label>
            <input class="form-input" type="date" id="activo-fecha" value="${activo?.fecha_adquisicion || today}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Costo adquisición ($) *</label>
            <input class="form-input" type="number" id="activo-costo" step="0.01" value="${activo?.costo_adquisicion || ''}" required>
          </div>
          <div class="form-group">
            <label>Vida útil (meses) *</label>
            <input class="form-input" type="number" id="activo-vida" value="${activo?.vida_util_meses || 12}" required>
          </div>
        </div>
        <div class="form-group">
          <label>Valor residual ($)</label>
          <input class="form-input" type="number" id="activo-residual" step="0.01" value="${activo?.valor_residual || 0}">
          <span class="form-hint">Valor estimado al final de la vida útil</span>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Área asignada</label>
            <select class="form-input" id="activo-area">${areaOpts}</select>
          </div>
          <div class="form-group">
            <label>Cultivo asignado</label>
            <select class="form-input" id="activo-cultivo">${cultivoOpts}</select>
          </div>
        </div>
        <div class="form-group">
          <label>Notas</label>
          <textarea class="form-input" id="activo-notas" rows="2">${activo?.notas || ''}</textarea>
        </div>
      </form>`;

    modalFooter.innerHTML = `
      <button class="btn btn-outline" id="activo-cancel">Cancelar</button>
      <button class="btn btn-primary" id="activo-save">${activo ? 'Guardar' : 'Crear activo'}</button>`;

    document.getElementById('modal-overlay').style.display = 'flex';

    document.getElementById('activo-cancel').onclick = () => {
      document.getElementById('modal-overlay').style.display = 'none';
    };
    document.getElementById('modal-close').onclick = () => {
      document.getElementById('modal-overlay').style.display = 'none';
    };

    document.getElementById('activo-save').onclick = async () => {
      const nombre = document.getElementById('activo-nombre').value.trim();
      const costo = parseFloat(document.getElementById('activo-costo').value);
      const vida = parseInt(document.getElementById('activo-vida').value);

      if (!nombre || isNaN(costo) || isNaN(vida) || vida <= 0) {
        App.showToast('Completa nombre, costo y vida útil', 'error');
        return;
      }

      const data = {
        finca_id: fincaId,
        nombre,
        categoria: document.getElementById('activo-categoria').value,
        fecha_adquisicion: document.getElementById('activo-fecha').value,
        costo_adquisicion: costo,
        vida_util_meses: vida,
        valor_residual: parseFloat(document.getElementById('activo-residual').value) || 0,
        area_id: document.getElementById('activo-area').value || null,
        cultivo_id: document.getElementById('activo-cultivo').value || null,
        notas: document.getElementById('activo-notas').value.trim(),
        estado: activo?.estado || 'activo'
      };

      if (activo) {
        await AgroDB.update('activos_finca', activo.id, data);
        App.showToast('Activo actualizado', 'success');
      } else {
        const nuevoActivo = await AgroDB.add('activos_finca', data);
        // Auto-create corresponding cost record for the acquisition
        const activoId = nuevoActivo?.id || data.id;
        try {
          const userId = SupabaseClient?.user?.id || '';
          await AgroDB.add('costos', {
            id: crypto.randomUUID(),
            finca_id: fincaId,
            categoria: 'activo',
            subcategoria: data.categoria,
            tipo_costo: 'fijo',
            fecha: data.fecha_adquisicion || new Date().toISOString().slice(0, 10),
            total: data.costo_adquisicion || 0,
            cantidad: 1,
            unidad: 'unidad',
            costo_unitario: data.costo_adquisicion || 0,
            descripcion: `Adquisición: ${data.nombre}`,
            area_id: data.area_id || null,
            cultivo_id: data.cultivo_id || null,
            activo_id: activoId,
            es_mano_obra_familiar: false,
            notas: `Costo de adquisición del activo "${data.nombre}"`,
            registrado_por: SupabaseClient?.user?.email || '',
            synced: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        } catch (e) {
          console.warn('[Activos] No se pudo crear costo de adquisición:', e);
        }
        App.showToast('Activo registrado', 'success');
      }

      document.getElementById('modal-overlay').style.display = 'none';
      // Re-render if CostosModule is available
      if (typeof CostosModule !== 'undefined' && CostosModule._currentTab === 'activos') {
        CostosModule._refreshActiveTab?.();
      }
    };
  }

  async function darDeBaja(activoId) {
    if (!confirm('¿Dar de baja este activo? Ya no generará depreciación.')) return;
    await AgroDB.update('activos_finca', activoId, { estado: 'dado_de_baja' });
    App.showToast('Activo dado de baja', 'info');
  }

  async function generarDepreciacion(fincaId) {
    const mesActual = new Date().toISOString().slice(0, 7); // YYYY-MM
    const activos = await AgroDB.query('activos_finca', r => r.finca_id === fincaId && r.estado === 'activo');
    const depExistentes = await AgroDB.query('depreciacion_mensual', r => r.finca_id === fincaId && r.mes === mesActual);

    const existentesPorActivo = new Set(depExistentes.map(d => d.activo_id));
    let generados = 0;

    for (const activo of activos) {
      if (existentesPorActivo.has(activo.id)) continue;
      if (!activo.vida_util_meses || activo.vida_util_meses <= 0) continue;

      const monto = (activo.costo_adquisicion - (activo.valor_residual || 0)) / activo.vida_util_meses;
      if (monto <= 0) continue;

      await AgroDB.add('depreciacion_mensual', {
        finca_id: fincaId,
        activo_id: activo.id,
        mes: mesActual,
        monto: Math.round(monto * 100) / 100,
        area_id: activo.area_id || null,
        cultivo_id: activo.cultivo_id || null
      });
      generados++;
    }

    if (generados > 0) {
      console.log(`[Activos] Generados ${generados} registros de depreciación para ${mesActual}`);
    }
  }

  return { render, showActivoForm, darDeBaja, generarDepreciacion };
})();

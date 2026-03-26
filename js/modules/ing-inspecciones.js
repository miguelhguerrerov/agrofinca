// ============================================
// AgroFinca - Ing. Inspecciones Module
// Engineer inspection management with protocols,
// dynamic evaluation grids, and field trials
// ============================================

const IngInspeccionesModule = (() => {

  // ---- Main render ----
  async function render(container) {
    const user = AuthModule.getUser();
    if (!user) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><h3>Inicia sesión</h3></div>';
      return;
    }

    const ingenieroId = user.id || user.ingeniero_id;

    container.innerHTML = `
      <div class="page-header">
        <h2>🔬 Inspecciones de Ingeniero</h2>
      </div>
      <div class="tabs">
        <button class="tab-btn active" data-tab="tab-ing-inspecciones">Inspecciones</button>
        <button class="tab-btn" data-tab="tab-ing-protocolos">Protocolos</button>
        <button class="tab-btn" data-tab="tab-ing-ensayos">Ensayos</button>
      </div>
      <div id="tab-ing-inspecciones" class="tab-content active"></div>
      <div id="tab-ing-protocolos" class="tab-content" style="display:none;"></div>
      <div id="tab-ing-ensayos" class="tab-content" style="display:none;"></div>
    `;

    // Tab switching
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        container.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) { target.classList.add('active'); target.style.display = ''; }
      });
    });

    await renderInspecciones(document.getElementById('tab-ing-inspecciones'), ingenieroId);
    await renderProtocolos(document.getElementById('tab-ing-protocolos'), ingenieroId);
    await renderEnsayos(document.getElementById('tab-ing-ensayos'), ingenieroId);
  }

  // ========================================
  // TAB: Inspecciones
  // ========================================
  async function renderInspecciones(tab, ingenieroId) {
    const inspecciones = await AgroDB.query('inspecciones', r => r.ingeniero_id === ingenieroId);
    const sorted = [...inspecciones].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    tab.innerHTML = `
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">${sorted.length} inspecciones registradas</span>
        <button class="btn btn-primary btn-sm" id="btn-new-ing-insp">+ Nueva inspección</button>
      </div>
      ${sorted.length === 0
        ? '<div class="empty-state"><h3>Sin inspecciones</h3><p>Registra tu primera inspección técnica.</p></div>'
        : sorted.map(insp => `
          <div class="card">
            <div class="flex-between">
              <div>
                <div class="card-title">${insp.finca_nombre || 'Finca'} · ${insp.area_nombre || 'General'}</div>
                <div class="card-subtitle">
                  ${Format.date(insp.fecha)} · ${insp.cultivo_nombre || ''} ${insp.protocolo_nombre ? '· Protocolo: ' + insp.protocolo_nombre : ''}
                </div>
              </div>
              <span class="badge ${insp.estado_general === 'bueno' ? 'badge-green' : insp.estado_general === 'regular' ? 'badge-amber' : insp.estado_general === 'malo' ? 'badge-red' : 'badge-gray'}">${insp.estado_general || 'N/A'}</span>
            </div>
            ${insp.observaciones ? `<p class="text-sm mt-1">${Format.truncate(insp.observaciones, 120)}</p>` : ''}
            <div class="flex gap-1 mt-1">
              <button class="btn btn-sm btn-outline btn-view-ing-insp" data-id="${insp.id}">👁️ Ver</button>
              <button class="btn btn-sm btn-danger btn-del-ing-insp" data-id="${insp.id}">🗑</button>
            </div>
          </div>
        `).join('')}
    `;

    document.getElementById('btn-new-ing-insp')?.addEventListener('click', () => showInspeccionForm(null, ingenieroId));

    tab.querySelectorAll('.btn-view-ing-insp').forEach(btn => {
      btn.addEventListener('click', async () => {
        const insp = await AgroDB.getById('inspecciones', btn.dataset.id);
        if (insp) showInspeccionDetail(insp);
      });
    });

    tab.querySelectorAll('.btn-del-ing-insp').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta inspección?')) {
          const fotos = await AgroDB.getByIndex('fotos_inspeccion', 'inspeccion_id', btn.dataset.id);
          for (const f of fotos) await AgroDB.remove('fotos_inspeccion', f.id);
          await AgroDB.remove('inspecciones', btn.dataset.id);
          App.showToast('Inspección eliminada', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  // ---- Show inspection detail ----
  async function showInspeccionDetail(insp) {
    const fotos = await AgroDB.getByIndex('fotos_inspeccion', 'inspeccion_id', insp.id);

    let gridHtml = '';
    if (insp.datos_evaluacion && insp.protocolo_nombre) {
      const datos = typeof insp.datos_evaluacion === 'string' ? JSON.parse(insp.datos_evaluacion) : insp.datos_evaluacion;
      if (datos.variables && datos.grid) {
        gridHtml = `
          <div class="section-title mt-2">📊 Datos de Evaluación (${insp.protocolo_nombre})</div>
          <div style="overflow-x:auto;">
            <table class="table table-sm">
              <thead><tr><th>Rep.</th>${datos.variables.map(v => `<th>${v.nombre} ${v.unidad ? '(' + v.unidad + ')' : ''}</th>`).join('')}<th>Total</th></tr></thead>
              <tbody>
                ${datos.grid.map((row, i) => {
                  const total = row.reduce((s, v) => s + (parseFloat(v) || 0), 0);
                  return `<tr><td>${i + 1}</td>${row.map(v => `<td>${v}</td>`).join('')}<td><b>${total.toFixed(2)}</b></td></tr>`;
                }).join('')}
              </tbody>
              <tfoot><tr><td><b>Prom.</b></td>${datos.variables.map((_, ci) => {
                const avg = datos.grid.reduce((s, row) => s + (parseFloat(row[ci]) || 0), 0) / datos.grid.length;
                return `<td><b>${avg.toFixed(2)}</b></td>`;
              }).join('')}<td></td></tr></tfoot>
            </table>
          </div>`;
      }
    }

    const condHtml = insp.condiciones_ambientales ? `
      <div class="section-title mt-2">🌤️ Condiciones Ambientales</div>
      <p class="text-sm">Temp: ${insp.condiciones_ambientales.temperatura || 'N/A'}°C · Humedad: ${insp.condiciones_ambientales.humedad || 'N/A'}% ${insp.condiciones_ambientales.lluvia_reciente ? '· 🌧️ Lluvia reciente' : ''}</p>
    ` : '';

    const body = `
      <div class="mb-2">
        <span class="badge ${insp.estado_general === 'bueno' ? 'badge-green' : insp.estado_general === 'regular' ? 'badge-amber' : 'badge-red'}">${insp.estado_general || 'N/A'}</span>
        <span class="text-sm text-muted"> · ${Format.date(insp.fecha)} · ${insp.finca_nombre || ''}</span>
      </div>
      ${insp.area_nombre ? `<p class="text-sm"><b>Área:</b> ${insp.area_nombre}</p>` : ''}
      ${insp.cultivo_nombre ? `<p class="text-sm"><b>Cultivo:</b> ${insp.cultivo_nombre}</p>` : ''}
      ${insp.observaciones ? `<div class="mt-1"><b>Observaciones:</b><p class="text-sm">${insp.observaciones}</p></div>` : ''}
      ${gridHtml}
      ${condHtml}
      ${fotos.length > 0 ? `
        <div class="section-title mt-2">📷 Fotografías (${fotos.length})</div>
        <div class="photo-preview-grid">
          ${fotos.map(f => `<div class="photo-preview-item"><img src="${f.data_url || f.thumbnail}" alt="Foto"></div>`).join('')}
        </div>` : ''}
    `;

    App.showModal('Detalle de Inspección', body, '<button class="btn btn-secondary" onclick="App.closeModal()">Cerrar</button>');
  }

  // ---- Inspection form (advanced, with protocol grid) ----
  async function showInspeccionForm(fincaId, ingenieroId) {
    // Get affiliated fincas via ingeniero_agricultores
    const relaciones = await AgroDB.query('ingeniero_agricultores', r => r.ingeniero_id === ingenieroId);
    const agricultorIds = relaciones.map(r => r.agricultor_id);
    let fincas = [];
    for (const agId of agricultorIds) {
      const f = await AgroDB.query('fincas', r => r.agricultor_id === agId || r.propietario_id === agId);
      fincas = fincas.concat(f);
    }
    // Also include fincas directly assigned
    const directFincas = await AgroDB.query('fincas', r => r.ingeniero_id === ingenieroId);
    fincas = fincas.concat(directFincas);
    // Deduplicate
    const fincaMap = {};
    fincas.forEach(f => { fincaMap[f.id] = f; });
    fincas = Object.values(fincaMap);

    const protocolos = await AgroDB.query('protocolos_evaluacion', r => r.ingeniero_id === ingenieroId || !r.ingeniero_id);

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>Finca *</label>
          <select id="ing-insp-finca">
            <option value="">-- Seleccionar finca --</option>
            ${fincas.map(f => `<option value="${f.id}" data-nombre="${f.nombre}" ${fincaId === f.id ? 'selected' : ''}>${f.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" id="ing-insp-fecha" value="${DateUtils.today()}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Área / Parcela</label>
          <select id="ing-insp-area"><option value="">-- Seleccionar finca primero --</option></select>
        </div>
        <div class="form-group">
          <label>Ciclo productivo</label>
          <select id="ing-insp-ciclo"><option value="">-- Seleccionar área primero --</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Estado general</label>
          <select id="ing-insp-estado">
            <option value="bueno">✅ Bueno</option>
            <option value="regular">⚠️ Regular</option>
            <option value="malo">❌ Malo</option>
            <option value="critico">🚨 Crítico</option>
          </select>
        </div>
        <div class="form-group">
          <label>Protocolo de Evaluación</label>
          <select id="ing-insp-protocolo">
            <option value="">Sin protocolo</option>
            ${protocolos.map(p => `<option value="${p.id}" data-nombre="${p.nombre}">${p.nombre} (${p.cultivo || 'General'})</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="ing-insp-grid-container" style="display:none;">
        <div class="section-title">📊 Datos de Evaluación</div>
        <div style="overflow-x:auto;" id="ing-insp-grid-wrapper"></div>
      </div>

      <div class="section-title">🌤️ Condiciones Ambientales</div>
      <div class="form-row">
        <div class="form-group">
          <label>Temperatura (°C)</label>
          <input type="number" id="ing-insp-temp" step="0.1" placeholder="Ej: 28.5">
        </div>
        <div class="form-group">
          <label>Humedad (%)</label>
          <input type="number" id="ing-insp-humedad" step="1" min="0" max="100" placeholder="Ej: 75">
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:24px;">
          <input type="checkbox" id="ing-insp-lluvia">
          <label for="ing-insp-lluvia" style="margin:0;">Lluvia reciente</label>
        </div>
      </div>

      <div class="section-title">📷 Fotografías</div>
      <div class="photo-buttons-row">
        <button type="button" class="btn btn-outline btn-sm" id="ing-btn-take-photo">📷 Tomar foto</button>
        <button type="button" class="btn btn-outline btn-sm" id="ing-btn-upload-photo">🖼️ Galería</button>
      </div>
      <input type="file" id="ing-photo-camera" accept="image/*" capture="environment" multiple style="display:none;">
      <input type="file" id="ing-photo-gallery" accept="image/*" multiple style="display:none;">
      <div class="photo-preview-grid" id="ing-photo-previews"></div>

      <div class="form-group">
        <label>Observaciones</label>
        <textarea id="ing-insp-obs" rows="3" placeholder="Observaciones técnicas detalladas"></textarea>
      </div>
    `;

    App.showModal('Nueva Inspección Técnica', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-ing-insp">Guardar</button>`);

    // Dynamic area loading on finca change
    const fincaSelect = document.getElementById('ing-insp-finca');
    const areaSelect = document.getElementById('ing-insp-area');
    const cicloSelect = document.getElementById('ing-insp-ciclo');

    fincaSelect.addEventListener('change', async () => {
      const fId = fincaSelect.value;
      if (!fId) {
        areaSelect.innerHTML = '<option value="">-- Seleccionar finca primero --</option>';
        cicloSelect.innerHTML = '<option value="">-- Seleccionar área primero --</option>';
        return;
      }
      const areas = await AgroDB.getByIndex('areas', 'finca_id', fId);
      areaSelect.innerHTML = '<option value="">General</option>' +
        areas.map(a => `<option value="${a.id}" data-nombre="${a.nombre}">${a.nombre}</option>`).join('');
    });

    areaSelect.addEventListener('change', async () => {
      const fId = fincaSelect.value;
      if (!fId) return;
      const ciclos = await AgroDB.query('ciclos_productivos', r => r.finca_id === fId && r.estado === 'activo');
      const areaId = areaSelect.value;
      const filtered = areaId ? ciclos.filter(c => c.area_id === areaId) : ciclos;
      cicloSelect.innerHTML = '<option value="">Sin ciclo</option>' +
        filtered.map(c => `<option value="${c.id}" data-cultivo="${c.cultivo_nombre}">${c.cultivo_nombre} - ${c.area_nombre || ''}</option>`).join('');
    });

    // If fincaId was pre-selected, trigger load
    if (fincaId) {
      fincaSelect.value = fincaId;
      fincaSelect.dispatchEvent(new Event('change'));
    }

    // Protocol grid rendering
    const protocoloSelect = document.getElementById('ing-insp-protocolo');
    const gridContainer = document.getElementById('ing-insp-grid-container');
    const gridWrapper = document.getElementById('ing-insp-grid-wrapper');

    protocoloSelect.addEventListener('change', async () => {
      const pId = protocoloSelect.value;
      if (!pId) { gridContainer.style.display = 'none'; return; }
      const protocolo = await AgroDB.getById('protocolos_evaluacion', pId);
      if (!protocolo || !protocolo.variables) { gridContainer.style.display = 'none'; return; }
      const variables = typeof protocolo.variables === 'string' ? JSON.parse(protocolo.variables) : protocolo.variables;
      const reps = protocolo.repeticiones || 3;
      renderEvaluationGrid(gridWrapper, variables, reps);
      gridContainer.style.display = '';
    });

    // Photo handling
    let newPhotos = [];
    const cameraInput = document.getElementById('ing-photo-camera');
    const galleryInput = document.getElementById('ing-photo-gallery');

    document.getElementById('ing-btn-take-photo').addEventListener('click', () => cameraInput.click());
    document.getElementById('ing-btn-upload-photo').addEventListener('click', () => galleryInput.click());
    cameraInput.addEventListener('change', (e) => handlePhotos(e.target.files, newPhotos, 'ing-photo-previews'));
    galleryInput.addEventListener('change', (e) => handlePhotos(e.target.files, newPhotos, 'ing-photo-previews'));

    // Save
    document.getElementById('btn-save-ing-insp').addEventListener('click', async () => {
      const fId = fincaSelect.value;
      if (!fId) { App.showToast('Selecciona una finca', 'warning'); return; }

      const protocoloId = protocoloSelect.value || null;
      let datosEvaluacion = null;
      if (protocoloId && gridContainer.style.display !== 'none') {
        datosEvaluacion = collectGridData(gridWrapper);
      }

      const data = {
        finca_id: fId,
        finca_nombre: fincaSelect.selectedOptions[0]?.dataset.nombre || '',
        area_id: areaSelect.value || null,
        area_nombre: areaSelect.value ? areaSelect.selectedOptions[0]?.dataset.nombre : null,
        ciclo_id: cicloSelect.value || null,
        cultivo_nombre: cicloSelect.value ? cicloSelect.selectedOptions[0]?.dataset.cultivo : null,
        fecha: document.getElementById('ing-insp-fecha').value,
        estado_general: document.getElementById('ing-insp-estado').value,
        protocolo_id: protocoloId,
        protocolo_nombre: protocoloId ? protocoloSelect.selectedOptions[0]?.dataset.nombre : null,
        datos_evaluacion: datosEvaluacion,
        condiciones_ambientales: {
          temperatura: parseFloat(document.getElementById('ing-insp-temp').value) || null,
          humedad: parseFloat(document.getElementById('ing-insp-humedad').value) || null,
          lluvia_reciente: document.getElementById('ing-insp-lluvia').checked
        },
        observaciones: document.getElementById('ing-insp-obs').value.trim() || null,
        ingeniero_id: ingenieroId,
        fotos_count: newPhotos.length,
        inspector: AuthModule.getUser()?.nombre || 'Ingeniero'
      };

      const saved = await AgroDB.add('inspecciones', data);

      for (const photo of newPhotos) {
        await AgroDB.add('fotos_inspeccion', {
          inspeccion_id: saved.id,
          finca_id: fId,
          data_url: photo.dataUrl,
          thumbnail: photo.thumbnail,
          nombre: photo.name,
          fecha: DateUtils.today()
        });
      }

      App.closeModal();
      App.showToast('Inspección guardada', 'success');
      App.refreshCurrentPage();
    });
  }

  // ---- Render dynamic evaluation grid ----
  function renderEvaluationGrid(wrapper, variables, reps) {
    let html = `
      <table class="table table-sm" id="eval-grid-table">
        <thead>
          <tr>
            <th>Rep.</th>
            ${variables.map((v, i) => `<th>${v.nombre} ${v.unidad ? '(' + v.unidad + ')' : ''}</th>`).join('')}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: reps }, (_, ri) => `
            <tr>
              <td>${ri + 1}</td>
              ${variables.map((v, vi) => `<td><input type="number" class="grid-cell" data-row="${ri}" data-col="${vi}" step="0.01" style="width:80px;"></td>`).join('')}
              <td class="row-total" data-row="${ri}">0</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td><b>Prom.</b></td>
            ${variables.map((_, vi) => `<td class="col-avg" data-col="${vi}"><b>0</b></td>`).join('')}
            <td class="overall-avg"><b>0</b></td>
          </tr>
        </tfoot>
      </table>
    `;
    wrapper.innerHTML = html;

    // Auto-calculate on input
    wrapper.querySelectorAll('.grid-cell').forEach(input => {
      input.addEventListener('input', () => recalcGrid(wrapper, variables.length, reps));
    });
  }

  function recalcGrid(wrapper, numCols, numRows) {
    const table = wrapper.querySelector('#eval-grid-table');
    if (!table) return;

    let overallSum = 0;
    let overallCount = 0;

    // Row totals
    for (let r = 0; r < numRows; r++) {
      let rowSum = 0;
      for (let c = 0; c < numCols; c++) {
        const cell = table.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
        const val = parseFloat(cell?.value) || 0;
        rowSum += val;
      }
      const rowTotalEl = table.querySelector(`.row-total[data-row="${r}"]`);
      if (rowTotalEl) rowTotalEl.textContent = rowSum.toFixed(2);
    }

    // Column averages
    for (let c = 0; c < numCols; c++) {
      let colSum = 0;
      for (let r = 0; r < numRows; r++) {
        const cell = table.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
        const val = parseFloat(cell?.value) || 0;
        colSum += val;
        overallSum += val;
        overallCount++;
      }
      const colAvgEl = table.querySelector(`.col-avg[data-col="${c}"]`);
      if (colAvgEl) colAvgEl.innerHTML = `<b>${(colSum / numRows).toFixed(2)}</b>`;
    }

    // Overall average
    const overallEl = table.querySelector('.overall-avg');
    if (overallEl) overallEl.innerHTML = `<b>${overallCount > 0 ? (overallSum / overallCount).toFixed(2) : '0'}</b>`;
  }

  function collectGridData(wrapper) {
    const table = wrapper.querySelector('#eval-grid-table');
    if (!table) return null;

    const headers = [];
    table.querySelectorAll('thead th').forEach((th, i) => {
      if (i > 0 && th.textContent !== 'Total') headers.push(th.textContent.trim());
    });

    const grid = [];
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const rowData = [];
      row.querySelectorAll('.grid-cell').forEach(cell => {
        rowData.push(cell.value || '');
      });
      grid.push(rowData);
    });

    // Extract variable info from header text
    const variables = headers.map(h => {
      const match = h.match(/^(.+?)(?:\s*\((.+?)\))?$/);
      return { nombre: match ? match[1].trim() : h, unidad: match && match[2] ? match[2] : '' };
    });

    return { variables, grid };
  }

  // ---- Photo handling (reused pattern) ----
  function handlePhotos(files, newPhotos, previewGridId) {
    const grid = document.getElementById(previewGridId);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 200;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(size / img.width, size / img.height);
          const x = (size - img.width * scale) / 2;
          const y = (size - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.6);

          newPhotos.push({ dataUrl, thumbnail, name: file.name });

          const div = document.createElement('div');
          div.className = 'photo-preview-item';
          div.innerHTML = `<img src="${thumbnail}" alt="Foto"><button class="photo-remove">&times;</button>`;
          div.querySelector('.photo-remove').addEventListener('click', () => {
            const idx = newPhotos.findIndex(p => p.name === file.name);
            if (idx > -1) newPhotos.splice(idx, 1);
            div.remove();
          });
          grid.appendChild(div);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  // ========================================
  // TAB: Protocolos
  // ========================================
  async function renderProtocolos(tab, ingenieroId) {
    const protocolos = await AgroDB.query('protocolos_evaluacion', r => r.ingeniero_id === ingenieroId);
    const sorted = [...protocolos].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    tab.innerHTML = `
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">${sorted.length} protocolos</span>
        <button class="btn btn-primary btn-sm" id="btn-new-protocolo">+ Nuevo Protocolo</button>
      </div>
      ${sorted.length === 0
        ? '<div class="empty-state"><h3>Sin protocolos</h3><p>Crea un protocolo de evaluación para estandarizar tus inspecciones.</p></div>'
        : sorted.map(p => {
          const vars = typeof p.variables === 'string' ? JSON.parse(p.variables || '[]') : (p.variables || []);
          return `
            <div class="card">
              <div class="flex-between">
                <div>
                  <div class="card-title">${p.nombre}</div>
                  <div class="card-subtitle">${p.cultivo || 'General'} · Escala: ${p.escala || 'N/A'} · ${p.repeticiones || 0} repeticiones · ${vars.length} variables</div>
                </div>
              </div>
              ${p.plaga_objetivo ? `<p class="text-sm mt-1">Plaga objetivo: ${p.plaga_objetivo}</p>` : ''}
              <div class="flex gap-1 mt-1">
                <button class="btn btn-sm btn-outline btn-edit-prot" data-id="${p.id}">✏️ Editar</button>
                <button class="btn btn-sm btn-danger btn-del-prot" data-id="${p.id}">🗑</button>
              </div>
            </div>`;
        }).join('')}
    `;

    document.getElementById('btn-new-protocolo')?.addEventListener('click', () => showProtocoloForm(ingenieroId));

    tab.querySelectorAll('.btn-edit-prot').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prot = await AgroDB.getById('protocolos_evaluacion', btn.dataset.id);
        if (prot) showProtocoloForm(ingenieroId, prot);
      });
    });

    tab.querySelectorAll('.btn-del-prot').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este protocolo?')) {
          await AgroDB.remove('protocolos_evaluacion', btn.dataset.id);
          App.showToast('Protocolo eliminado', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  // ---- Protocolo form ----
  async function showProtocoloForm(ingenieroId, prot = null) {
    const isEdit = !!prot;
    const existingVars = prot ? (typeof prot.variables === 'string' ? JSON.parse(prot.variables || '[]') : (prot.variables || [])) : [];

    const body = `
      <div class="form-group">
        <label>Nombre del protocolo *</label>
        <input type="text" id="prot-nombre" value="${prot?.nombre || ''}" placeholder="Ej: Evaluación Sigatoka negra">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cultivo</label>
          <select id="prot-cultivo">
            <option value="">General</option>
            <option value="Plátano" ${prot?.cultivo === 'Plátano' ? 'selected' : ''}>Plátano</option>
            <option value="Banano" ${prot?.cultivo === 'Banano' ? 'selected' : ''}>Banano</option>
            <option value="Cacao" ${prot?.cultivo === 'Cacao' ? 'selected' : ''}>Cacao</option>
            <option value="Café" ${prot?.cultivo === 'Café' ? 'selected' : ''}>Café</option>
            <option value="Aguacate" ${prot?.cultivo === 'Aguacate' ? 'selected' : ''}>Aguacate</option>
            <option value="Cítricos" ${prot?.cultivo === 'Cítricos' ? 'selected' : ''}>Cítricos</option>
            <option value="Otro" ${prot?.cultivo === 'Otro' ? 'selected' : ''}>Otro</option>
          </select>
        </div>
        <div class="form-group">
          <label>Plaga / Enfermedad objetivo</label>
          <input type="text" id="prot-plaga" value="${prot?.plaga_objetivo || ''}" placeholder="Ej: Sigatoka negra">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Escala de medición</label>
          <select id="prot-escala">
            <option value="porcentaje" ${prot?.escala === 'porcentaje' ? 'selected' : ''}>Porcentaje (0-100%)</option>
            <option value="stover" ${prot?.escala === 'stover' ? 'selected' : ''}>Stover modificado</option>
            <option value="1-6" ${prot?.escala === '1-6' ? 'selected' : ''}>Escala 1-6</option>
          </select>
        </div>
        <div class="form-group">
          <label>Repeticiones *</label>
          <input type="number" id="prot-reps" min="1" max="50" value="${prot?.repeticiones || 5}">
        </div>
      </div>

      <div class="section-title">📐 Variables de Evaluación</div>
      <div id="prot-vars-list">
        ${existingVars.map((v, i) => variableRowHtml(i, v)).join('')}
      </div>
      <button type="button" class="btn btn-outline btn-sm mt-1" id="btn-add-variable">+ Agregar variable</button>
    `;

    App.showModal(isEdit ? 'Editar Protocolo' : 'Nuevo Protocolo', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-prot">Guardar</button>`);

    let varIndex = existingVars.length;

    // Wire up existing delete buttons
    document.querySelectorAll('.btn-del-var').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.var-row').remove());
    });

    document.getElementById('btn-add-variable').addEventListener('click', () => {
      const list = document.getElementById('prot-vars-list');
      const div = document.createElement('div');
      div.innerHTML = variableRowHtml(varIndex++, {});
      const row = div.firstElementChild;
      row.querySelector('.btn-del-var').addEventListener('click', () => row.remove());
      list.appendChild(row);
    });

    document.getElementById('btn-save-prot').addEventListener('click', async () => {
      const nombre = document.getElementById('prot-nombre').value.trim();
      if (!nombre) { App.showToast('El nombre es obligatorio', 'warning'); return; }

      const variables = [];
      document.querySelectorAll('.var-row').forEach(row => {
        const n = row.querySelector('.var-nombre')?.value.trim();
        if (n) {
          variables.push({
            nombre: n,
            tipo: row.querySelector('.var-tipo')?.value || 'numero',
            unidad: row.querySelector('.var-unidad')?.value.trim() || ''
          });
        }
      });

      const data = {
        nombre,
        cultivo: document.getElementById('prot-cultivo').value || null,
        plaga_objetivo: document.getElementById('prot-plaga').value.trim() || null,
        escala: document.getElementById('prot-escala').value,
        repeticiones: parseInt(document.getElementById('prot-reps').value) || 5,
        variables,
        ingeniero_id: ingenieroId,
        created_at: prot?.created_at || new Date().toISOString()
      };

      if (isEdit) {
        await AgroDB.update('protocolos_evaluacion', prot.id, data);
      } else {
        await AgroDB.add('protocolos_evaluacion', data);
      }

      App.closeModal();
      App.showToast('Protocolo guardado', 'success');
      App.refreshCurrentPage();
    });
  }

  function variableRowHtml(index, v) {
    return `
      <div class="var-row form-row" style="align-items:flex-end;margin-bottom:4px;">
        <div class="form-group" style="flex:2;">
          ${index === 0 ? '<label>Nombre</label>' : ''}
          <input type="text" class="var-nombre" value="${v.nombre || ''}" placeholder="Nombre variable">
        </div>
        <div class="form-group" style="flex:1;">
          ${index === 0 ? '<label>Tipo</label>' : ''}
          <select class="var-tipo">
            <option value="numero" ${v.tipo === 'numero' ? 'selected' : ''}>Número</option>
            <option value="texto" ${v.tipo === 'texto' ? 'selected' : ''}>Texto</option>
            <option value="select" ${v.tipo === 'select' ? 'selected' : ''}>Selección</option>
          </select>
        </div>
        <div class="form-group" style="flex:1;">
          ${index === 0 ? '<label>Unidad</label>' : ''}
          <input type="text" class="var-unidad" value="${v.unidad || ''}" placeholder="Ej: %, cm">
        </div>
        <button type="button" class="btn btn-sm btn-danger btn-del-var" style="margin-bottom:8px;">✕</button>
      </div>`;
  }

  // ========================================
  // TAB: Ensayos
  // ========================================
  async function renderEnsayos(tab, ingenieroId) {
    const ensayos = await AgroDB.query('ensayos', r => r.ingeniero_id === ingenieroId);
    const sorted = [...ensayos].sort((a, b) => (b.fecha_inicio || '').localeCompare(a.fecha_inicio || ''));

    tab.innerHTML = `
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">${sorted.length} ensayos</span>
        <button class="btn btn-primary btn-sm" id="btn-new-ensayo">+ Nuevo Ensayo</button>
      </div>
      ${sorted.length === 0
        ? '<div class="empty-state"><h3>Sin ensayos</h3><p>Crea un ensayo de campo para comparar tratamientos.</p></div>'
        : sorted.map(e => `
          <div class="card">
            <div class="flex-between">
              <div>
                <div class="card-title">${e.titulo}</div>
                <div class="card-subtitle">${e.finca_nombre || ''} · Inicio: ${Format.date(e.fecha_inicio)} · ${e.duracion_dias || '?'} días</div>
              </div>
              <span class="badge ${e.estado === 'activo' ? 'badge-green' : e.estado === 'completado' ? 'badge-blue' : 'badge-gray'}">${e.estado || 'planificado'}</span>
            </div>
            <div class="flex gap-1 mt-1">
              <button class="btn btn-sm btn-outline btn-detail-ensayo" data-id="${e.id}">📊 Detalle</button>
              <button class="btn btn-sm btn-outline btn-eval-ensayo" data-id="${e.id}">+ Evaluación</button>
              <button class="btn btn-sm btn-danger btn-del-ensayo" data-id="${e.id}">🗑</button>
            </div>
          </div>
        `).join('')}
    `;

    document.getElementById('btn-new-ensayo')?.addEventListener('click', () => showEnsayoForm(ingenieroId));

    tab.querySelectorAll('.btn-detail-ensayo').forEach(btn => {
      btn.addEventListener('click', () => showEnsayoDetail(btn.dataset.id, ingenieroId));
    });

    tab.querySelectorAll('.btn-eval-ensayo').forEach(btn => {
      btn.addEventListener('click', () => showNuevaEvaluacion(btn.dataset.id, ingenieroId));
    });

    tab.querySelectorAll('.btn-del-ensayo').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este ensayo y sus tratamientos?')) {
          const tratamientos = await AgroDB.query('ensayo_tratamientos', r => r.ensayo_id === btn.dataset.id);
          for (const t of tratamientos) await AgroDB.remove('ensayo_tratamientos', t.id);
          const evals = await AgroDB.query('ensayo_evaluaciones', r => r.ensayo_id === btn.dataset.id);
          for (const ev of evals) await AgroDB.remove('ensayo_evaluaciones', ev.id);
          await AgroDB.remove('ensayos', btn.dataset.id);
          App.showToast('Ensayo eliminado', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  // ---- Ensayo form ----
  async function showEnsayoForm(ingenieroId) {
    const relaciones = await AgroDB.query('ingeniero_agricultores', r => r.ingeniero_id === ingenieroId);
    const agricultorIds = relaciones.map(r => r.agricultor_id);
    let fincas = [];
    for (const agId of agricultorIds) {
      const f = await AgroDB.query('fincas', r => r.agricultor_id === agId || r.propietario_id === agId);
      fincas = fincas.concat(f);
    }
    const directFincas = await AgroDB.query('fincas', r => r.ingeniero_id === ingenieroId);
    fincas = fincas.concat(directFincas);
    const fincaMap = {};
    fincas.forEach(f => { fincaMap[f.id] = f; });
    fincas = Object.values(fincaMap);

    const protocolos = await AgroDB.query('protocolos_evaluacion', r => r.ingeniero_id === ingenieroId || !r.ingeniero_id);

    const body = `
      <div class="form-group">
        <label>Título del ensayo *</label>
        <input type="text" id="ensayo-titulo" placeholder="Ej: Evaluación de fungicidas Sigatoka">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Finca *</label>
          <select id="ensayo-finca">
            <option value="">-- Seleccionar --</option>
            ${fincas.map(f => `<option value="${f.id}" data-nombre="${f.nombre}">${f.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Protocolo</label>
          <select id="ensayo-protocolo">
            <option value="">Sin protocolo</option>
            ${protocolos.map(p => `<option value="${p.id}" data-nombre="${p.nombre}">${p.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha inicio *</label>
          <input type="date" id="ensayo-inicio" value="${DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Intervalo días</label>
          <input type="number" id="ensayo-intervalo" min="1" value="7" placeholder="Días entre evaluaciones">
        </div>
        <div class="form-group">
          <label>Duración días</label>
          <input type="number" id="ensayo-duracion" min="1" value="60" placeholder="Duración total">
        </div>
      </div>

      <div class="section-title">🧪 Tratamientos</div>
      <div id="ensayo-tratamientos-list"></div>
      <button type="button" class="btn btn-outline btn-sm mt-1" id="btn-add-tratamiento">+ Agregar tratamiento</button>
    `;

    App.showModal('Nuevo Ensayo', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-ensayo">Guardar</button>`);

    let tratIndex = 0;
    const tratList = document.getElementById('ensayo-tratamientos-list');

    function addTratamientoRow(t = {}) {
      const idx = tratIndex++;
      const div = document.createElement('div');
      div.className = 'trat-row card mb-1';
      div.style.padding = '8px';
      div.innerHTML = `
        <div class="form-row">
          <div class="form-group" style="flex:2;">
            ${idx === 0 ? '<label>Nombre</label>' : ''}
            <input type="text" class="trat-nombre" value="${t.nombre || ''}" placeholder="Ej: T${idx + 1} - Mancozeb">
          </div>
          <div class="form-group" style="flex:2;">
            ${idx === 0 ? '<label>Producto</label>' : ''}
            <input type="text" class="trat-producto" value="${t.producto || ''}" placeholder="Producto comercial">
          </div>
          <button type="button" class="btn btn-sm btn-danger btn-del-trat" style="margin-top:${idx === 0 ? '24px' : '0'};">✕</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <input type="number" class="trat-dosis" step="0.01" value="${t.dosis || ''}" placeholder="Dosis">
          </div>
          <div class="form-group">
            <select class="trat-unidad">
              <option value="lt/ha" ${t.unidad_dosis === 'lt/ha' ? 'selected' : ''}>lt/ha</option>
              <option value="g/ha" ${t.unidad_dosis === 'g/ha' ? 'selected' : ''}>g/ha</option>
              <option value="ml/lt" ${t.unidad_dosis === 'ml/lt' ? 'selected' : ''}>ml/lt</option>
              <option value="g/lt" ${t.unidad_dosis === 'g/lt' ? 'selected' : ''}>g/lt</option>
            </select>
          </div>
          <div class="form-group">
            <input type="number" class="trat-agua" step="0.1" value="${t.agua_lt || ''}" placeholder="Agua (lt)">
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:4px;">
            <input type="checkbox" class="trat-testigo" ${t.es_testigo ? 'checked' : ''}>
            <label style="margin:0;">Testigo</label>
          </div>
        </div>
      `;
      div.querySelector('.btn-del-trat').addEventListener('click', () => div.remove());
      tratList.appendChild(div);
    }

    document.getElementById('btn-add-tratamiento').addEventListener('click', () => addTratamientoRow());
    // Start with one empty row
    addTratamientoRow();

    document.getElementById('btn-save-ensayo').addEventListener('click', async () => {
      const titulo = document.getElementById('ensayo-titulo').value.trim();
      const fincaId = document.getElementById('ensayo-finca').value;
      if (!titulo || !fincaId) { App.showToast('Título y finca son obligatorios', 'warning'); return; }

      const ensayoData = {
        titulo,
        finca_id: fincaId,
        finca_nombre: document.getElementById('ensayo-finca').selectedOptions[0]?.dataset.nombre || '',
        protocolo_id: document.getElementById('ensayo-protocolo').value || null,
        protocolo_nombre: document.getElementById('ensayo-protocolo').value
          ? document.getElementById('ensayo-protocolo').selectedOptions[0]?.dataset.nombre : null,
        fecha_inicio: document.getElementById('ensayo-inicio').value,
        intervalo_dias: parseInt(document.getElementById('ensayo-intervalo').value) || 7,
        duracion_dias: parseInt(document.getElementById('ensayo-duracion').value) || 60,
        estado: 'activo',
        ingeniero_id: ingenieroId,
        created_at: new Date().toISOString()
      };

      const savedEnsayo = await AgroDB.add('ensayos', ensayoData);

      // Save tratamientos
      const tratRows = document.querySelectorAll('.trat-row');
      for (const row of tratRows) {
        const nombre = row.querySelector('.trat-nombre')?.value.trim();
        if (!nombre) continue;
        await AgroDB.add('ensayo_tratamientos', {
          ensayo_id: savedEnsayo.id,
          nombre,
          producto: row.querySelector('.trat-producto')?.value.trim() || '',
          dosis: parseFloat(row.querySelector('.trat-dosis')?.value) || 0,
          unidad_dosis: row.querySelector('.trat-unidad')?.value || 'lt/ha',
          agua_lt: parseFloat(row.querySelector('.trat-agua')?.value) || 0,
          es_testigo: row.querySelector('.trat-testigo')?.checked || false
        });
      }

      App.closeModal();
      App.showToast('Ensayo creado', 'success');
      App.refreshCurrentPage();
    });
  }

  // ---- Ensayo detail ----
  async function showEnsayoDetail(ensayoId, ingenieroId) {
    const ensayo = await AgroDB.getById('ensayos', ensayoId);
    if (!ensayo) return;

    const tratamientos = await AgroDB.query('ensayo_tratamientos', r => r.ensayo_id === ensayoId);
    const evaluaciones = await AgroDB.query('ensayo_evaluaciones', r => r.ensayo_id === ensayoId);
    const sortedEvals = [...evaluaciones].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const body = `
      <div class="mb-2">
        <span class="badge ${ensayo.estado === 'activo' ? 'badge-green' : 'badge-blue'}">${ensayo.estado}</span>
        <span class="text-sm text-muted"> · Inicio: ${Format.date(ensayo.fecha_inicio)} · Cada ${ensayo.intervalo_dias} días · ${ensayo.duracion_dias} días</span>
      </div>
      <p class="text-sm"><b>Finca:</b> ${ensayo.finca_nombre || ''}</p>
      ${ensayo.protocolo_nombre ? `<p class="text-sm"><b>Protocolo:</b> ${ensayo.protocolo_nombre}</p>` : ''}

      <div class="section-title mt-2">🧪 Tratamientos (${tratamientos.length})</div>
      ${tratamientos.length === 0 ? '<p class="text-sm text-muted">Sin tratamientos</p>' :
        `<table class="table table-sm">
          <thead><tr><th>Nombre</th><th>Producto</th><th>Dosis</th><th>Agua</th><th>Testigo</th></tr></thead>
          <tbody>
            ${tratamientos.map(t => `
              <tr>
                <td>${t.nombre}</td>
                <td>${t.producto || '-'}</td>
                <td>${t.dosis || '-'} ${t.unidad_dosis || ''}</td>
                <td>${t.agua_lt || '-'} lt</td>
                <td>${t.es_testigo ? '✅' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`}

      <div class="section-title mt-2">📊 Evaluaciones (${sortedEvals.length})</div>
      ${sortedEvals.length === 0 ? '<p class="text-sm text-muted">Sin evaluaciones realizadas</p>' :
        sortedEvals.map(ev => {
          const trat = tratamientos.find(t => t.id === ev.tratamiento_id);
          return `
            <div class="card mb-1" style="padding:8px;">
              <div class="card-subtitle">${Format.date(ev.fecha)} · Tratamiento: ${trat?.nombre || ev.tratamiento_id}</div>
              ${ev.datos ? '<span class="badge badge-green">Datos registrados</span>' : ''}
            </div>`;
        }).join('')}
    `;

    App.showModal(`📊 ${ensayo.titulo}`, body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cerrar</button>
       <button class="btn btn-primary" id="btn-add-eval-from-detail" data-id="${ensayoId}">+ Nueva Evaluación</button>`);

    document.getElementById('btn-add-eval-from-detail')?.addEventListener('click', () => {
      App.closeModal();
      showNuevaEvaluacion(ensayoId, ingenieroId);
    });
  }

  // ---- Nueva evaluacion de ensayo ----
  async function showNuevaEvaluacion(ensayoId, ingenieroId) {
    const ensayo = await AgroDB.getById('ensayos', ensayoId);
    if (!ensayo) { App.showToast('Ensayo no encontrado', 'error'); return; }

    const tratamientos = await AgroDB.query('ensayo_tratamientos', r => r.ensayo_id === ensayoId);
    if (tratamientos.length === 0) { App.showToast('Agrega tratamientos al ensayo primero', 'warning'); return; }

    // Get protocol for grid
    let variables = [];
    let reps = 3;
    if (ensayo.protocolo_id) {
      const protocolo = await AgroDB.getById('protocolos_evaluacion', ensayo.protocolo_id);
      if (protocolo) {
        variables = typeof protocolo.variables === 'string' ? JSON.parse(protocolo.variables) : (protocolo.variables || []);
        reps = protocolo.repeticiones || 3;
      }
    }

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>Tratamiento *</label>
          <select id="eval-tratamiento">
            <option value="">-- Seleccionar --</option>
            ${tratamientos.map(t => `<option value="${t.id}">${t.nombre} ${t.es_testigo ? '(Testigo)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="eval-fecha" value="${DateUtils.today()}">
        </div>
      </div>
      ${variables.length > 0 ? `
        <div class="section-title">📊 Datos de Evaluación</div>
        <div style="overflow-x:auto;" id="eval-ensayo-grid"></div>
      ` : '<p class="text-sm text-muted">Sin protocolo asociado. Los datos se guardarán como observaciones.</p>'}
      <div class="form-group">
        <label>Observaciones</label>
        <textarea id="eval-obs" rows="2" placeholder="Notas de la evaluación"></textarea>
      </div>
    `;

    App.showModal(`Nueva Evaluación · ${ensayo.titulo}`, body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-eval">Guardar</button>`);

    if (variables.length > 0) {
      renderEvaluationGrid(document.getElementById('eval-ensayo-grid'), variables, reps);
    }

    document.getElementById('btn-save-eval').addEventListener('click', async () => {
      const tratId = document.getElementById('eval-tratamiento').value;
      if (!tratId) { App.showToast('Selecciona un tratamiento', 'warning'); return; }

      let datos = null;
      if (variables.length > 0) {
        const gridWrapper = document.getElementById('eval-ensayo-grid');
        datos = collectGridData(gridWrapper);
      }

      await AgroDB.add('ensayo_evaluaciones', {
        ensayo_id: ensayoId,
        tratamiento_id: tratId,
        fecha: document.getElementById('eval-fecha').value,
        datos,
        observaciones: document.getElementById('eval-obs').value.trim() || null,
        ingeniero_id: ingenieroId,
        created_at: new Date().toISOString()
      });

      App.closeModal();
      App.showToast('Evaluación registrada', 'success');
      App.refreshCurrentPage();
    });
  }

  return { render };
})();

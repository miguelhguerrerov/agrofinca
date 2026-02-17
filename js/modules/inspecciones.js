// ============================================
// AgroFinca - Inspecciones Module
// Periodic crop inspections with photos
// Technical details for audit trails
// ============================================

const InspeccionesModule = (() => {

  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>Selecciona una finca</h3></div>';
      return;
    }

    const inspecciones = await AgroDB.query('inspecciones', r => r.finca_id === fincaId);
    const sorted = [...inspecciones].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    container.innerHTML = `
      <div class="page-header">
        <h2>📋 Inspecciones de Cultivos</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-inspeccion">+ Nueva Inspección</button>
      </div>

      <p class="text-sm text-muted mb-2">Registro periódico de inspecciones con fotografías y detalles técnicos para auditorías futuras.</p>

      ${sorted.length === 0 ? '<div class="empty-state"><h3>Sin inspecciones</h3><p>Registra tu primera inspección de campo.</p></div>' :
      sorted.map(insp => `
          <div class="card">
            <div class="flex-between">
              <div>
                <div class="card-title">${insp.titulo || 'Inspección'}</div>
                <div class="card-subtitle">
                  ${Format.date(insp.fecha)} · ${insp.cultivo_nombre || ''} · ${insp.area_nombre || ''}
                </div>
              </div>
              <span class="badge ${insp.estado_general === 'bueno' ? 'badge-green' : insp.estado_general === 'regular' ? 'badge-amber' : insp.estado_general === 'malo' ? 'badge-red' : 'badge-gray'}">${insp.estado_general || 'N/A'}</span>
            </div>
            ${insp.observaciones ? `<p class="text-sm mt-1">${Format.truncate(insp.observaciones, 120)}</p>` : ''}
            <div class="flex gap-1 mt-1" style="flex-wrap:wrap;">
              ${insp.plagas_detectadas ? `<span class="badge badge-red">Plagas: ${insp.plagas_detectadas}</span>` : ''}
              ${insp.enfermedades_detectadas ? `<span class="badge badge-amber">Enferm.: ${insp.enfermedades_detectadas}</span>` : ''}
              ${insp.estado_riego ? `<span class="badge badge-blue">Riego: ${insp.estado_riego}</span>` : ''}
              ${insp.fotos_count > 0 ? `<span class="badge badge-gray">📷 ${insp.fotos_count} fotos</span>` : ''}
            </div>
            <div class="flex gap-1 mt-1">
              <button class="btn btn-sm btn-outline btn-view-insp" data-id="${insp.id}">👁️ Ver</button>
              <button class="btn btn-sm btn-outline btn-edit-insp" data-id="${insp.id}">✏️</button>
              <button class="btn btn-sm btn-danger btn-del-insp" data-id="${insp.id}">🗑</button>
            </div>
          </div>
        `).join('')}
    `;

    document.getElementById('btn-new-inspeccion')?.addEventListener('click', () => showQuickInspection(fincaId));
    container.querySelectorAll('.btn-view-insp').forEach(btn => {
      btn.addEventListener('click', () => showInspectionDetail(btn.dataset.id, fincaId));
    });
    container.querySelectorAll('.btn-edit-insp').forEach(btn => {
      btn.addEventListener('click', async () => {
        const insp = await AgroDB.getById('inspecciones', btn.dataset.id);
        showQuickInspection(fincaId, insp);
      });
    });
    container.querySelectorAll('.btn-del-insp').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta inspección?')) {
          // Delete associated photos
          const fotos = await AgroDB.getByIndex('fotos_inspeccion', 'inspeccion_id', btn.dataset.id);
          for (const f of fotos) await AgroDB.remove('fotos_inspeccion', f.id);
          await AgroDB.remove('inspecciones', btn.dataset.id);
          App.showToast('Inspección eliminada', 'success');
          App.refreshCurrentPage();
        }
      });
    });
  }

  async function showQuickInspection(fincaId, insp = null) {
    const isEdit = !!insp;
    const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
    const ciclos = await AgroDB.query('ciclos_productivos', r => r.finca_id === fincaId && r.estado === 'activo');
    let photos = [];
    if (isEdit) {
      photos = await AgroDB.getByIndex('fotos_inspeccion', 'inspeccion_id', insp.id);
    }

    const body = `
      <div class="form-group">
        <label>Título / Motivo *</label>
        <input type="text" id="insp-titulo" value="${insp?.titulo || ''}" placeholder="Ej: Inspección semanal parcela A">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" id="insp-fecha" value="${insp?.fecha || DateUtils.today()}">
        </div>
        <div class="form-group">
          <label>Estado general</label>
          <select id="insp-estado">
            <option value="bueno" ${insp?.estado_general === 'bueno' ? 'selected' : ''}>✅ Bueno</option>
            <option value="regular" ${insp?.estado_general === 'regular' ? 'selected' : ''}>⚠️ Regular</option>
            <option value="malo" ${insp?.estado_general === 'malo' ? 'selected' : ''}>❌ Malo</option>
            <option value="critico" ${insp?.estado_general === 'critico' ? 'selected' : ''}>🚨 Crítico</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Área / Parcela</label>
          <select id="insp-area">
            <option value="">General</option>
            ${areas.map(a => `<option value="${a.id}" data-nombre="${a.nombre}" ${insp?.area_id === a.id ? 'selected' : ''}>${a.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Ciclo productivo</label>
          <select id="insp-ciclo">
            <option value="">Sin ciclo</option>
            ${ciclos.map(c => `<option value="${c.id}" data-cultivo="${c.cultivo_nombre}" ${insp?.ciclo_id === c.id ? 'selected' : ''}>${c.cultivo_nombre} - ${c.area_nombre || ''}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="section-title">📊 Detalles Técnicos</div>
      <div class="form-row">
        <div class="form-group">
          <label>Estado del follaje</label>
          <select id="insp-follaje">
            <option value="">N/A</option>
            <option value="excelente" ${insp?.estado_follaje === 'excelente' ? 'selected' : ''}>Excelente</option>
            <option value="bueno" ${insp?.estado_follaje === 'bueno' ? 'selected' : ''}>Bueno</option>
            <option value="marchito" ${insp?.estado_follaje === 'marchito' ? 'selected' : ''}>Marchito</option>
            <option value="amarillento" ${insp?.estado_follaje === 'amarillento' ? 'selected' : ''}>Amarillento</option>
            <option value="necrotico" ${insp?.estado_follaje === 'necrotico' ? 'selected' : ''}>Necrótico</option>
          </select>
        </div>
        <div class="form-group">
          <label>Estado del riego</label>
          <select id="insp-riego">
            <option value="">N/A</option>
            <option value="adecuado" ${insp?.estado_riego === 'adecuado' ? 'selected' : ''}>Adecuado</option>
            <option value="excesivo" ${insp?.estado_riego === 'excesivo' ? 'selected' : ''}>Excesivo</option>
            <option value="deficiente" ${insp?.estado_riego === 'deficiente' ? 'selected' : ''}>Deficiente</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Plagas detectadas</label>
          <input type="text" id="insp-plagas" value="${insp?.plagas_detectadas || ''}" placeholder="Ej: Picudo negro, mosca blanca">
        </div>
        <div class="form-group">
          <label>Enfermedades detectadas</label>
          <input type="text" id="insp-enfermedades" value="${insp?.enfermedades_detectadas || ''}" placeholder="Ej: Sigatoka, pudrición">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Estado del suelo</label>
          <select id="insp-suelo">
            <option value="">N/A</option>
            <option value="humedo" ${insp?.estado_suelo === 'humedo' ? 'selected' : ''}>Húmedo</option>
            <option value="seco" ${insp?.estado_suelo === 'seco' ? 'selected' : ''}>Seco</option>
            <option value="encharcado" ${insp?.estado_suelo === 'encharcado' ? 'selected' : ''}>Encharcado</option>
            <option value="compactado" ${insp?.estado_suelo === 'compactado' ? 'selected' : ''}>Compactado</option>
          </select>
        </div>
        <div class="form-group">
          <label>Etapa fenológica</label>
          <input type="text" id="insp-fenologia" value="${insp?.etapa_fenologica || ''}" placeholder="Ej: Floración, fructificación">
        </div>
      </div>
      <div class="form-group">
        <label>Observaciones detalladas</label>
        <textarea id="insp-obs" rows="3" placeholder="Descripción técnica detallada de lo observado">${insp?.observaciones || ''}</textarea>
      </div>

      <div class="section-title">📷 Fotografías</div>
      <div class="photo-input-area" id="photo-drop-area">
        <div class="photo-icon">📷</div>
        <p>Toca para tomar foto o seleccionar imagen</p>
        <input type="file" id="photo-input" accept="image/*" capture="environment" multiple style="display:none;">
      </div>
      <div class="photo-preview-grid" id="photo-previews">
        ${photos.map(p => `
          <div class="photo-preview-item" data-photo-id="${p.id}">
            <img src="${p.thumbnail || p.data_url}" alt="Foto">
            <button class="photo-remove" data-id="${p.id}">&times;</button>
          </div>
        `).join('')}
      </div>
    `;

    App.showModal(isEdit ? 'Editar Inspección' : 'Nueva Inspección', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-insp">Guardar</button>`);

    // Photo handling
    let newPhotos = [];
    const dropArea = document.getElementById('photo-drop-area');
    const fileInput = document.getElementById('photo-input');

    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      handlePhotos(e.target.files, newPhotos);
    });

    // Remove existing photos
    document.querySelectorAll('.photo-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        await AgroDB.remove('fotos_inspeccion', btn.dataset.id);
        btn.closest('.photo-preview-item').remove();
      });
    });

    document.getElementById('btn-save-insp').addEventListener('click', async () => {
      const titulo = document.getElementById('insp-titulo').value.trim();
      if (!titulo) { App.showToast('El título es obligatorio', 'warning'); return; }

      const areaSel = document.getElementById('insp-area');
      const cicloSel = document.getElementById('insp-ciclo');

      const data = {
        finca_id: fincaId,
        titulo,
        fecha: document.getElementById('insp-fecha').value,
        estado_general: document.getElementById('insp-estado').value,
        area_id: areaSel.value || null,
        area_nombre: areaSel.value ? areaSel.selectedOptions[0].dataset.nombre : null,
        ciclo_id: cicloSel.value || null,
        cultivo_nombre: cicloSel.value ? cicloSel.selectedOptions[0].dataset.cultivo : null,
        estado_follaje: document.getElementById('insp-follaje').value || null,
        estado_riego: document.getElementById('insp-riego').value || null,
        plagas_detectadas: document.getElementById('insp-plagas').value.trim() || null,
        enfermedades_detectadas: document.getElementById('insp-enfermedades').value.trim() || null,
        estado_suelo: document.getElementById('insp-suelo').value || null,
        etapa_fenologica: document.getElementById('insp-fenologia').value.trim() || null,
        observaciones: document.getElementById('insp-obs').value.trim() || null,
        fotos_count: (photos.length - document.querySelectorAll('.photo-preview-item').length) + newPhotos.length + document.querySelectorAll('.photo-preview-item').length,
        inspector: AuthModule.getUser()?.nombre || 'Usuario'
      };

      let inspId;
      if (isEdit) {
        await AgroDB.update('inspecciones', insp.id, data);
        inspId = insp.id;
      } else {
        const saved = await AgroDB.add('inspecciones', data);
        inspId = saved.id;
      }

      // Save new photos
      for (const photo of newPhotos) {
        await AgroDB.add('fotos_inspeccion', {
          inspeccion_id: inspId,
          finca_id: fincaId,
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

  function handlePhotos(files, newPhotos) {
    const grid = document.getElementById('photo-previews');
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        // Create thumbnail
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
            const idx = newPhotos.indexOf(newPhotos.find(p => p.name === file.name));
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

  async function showInspectionDetail(inspId, fincaId) {
    const insp = await AgroDB.getById('inspecciones', inspId);
    if (!insp) return;
    const fotos = await AgroDB.getByIndex('fotos_inspeccion', 'inspeccion_id', inspId);

    const body = `
      <div class="mb-2">
        <span class="badge ${insp.estado_general === 'bueno' ? 'badge-green' : insp.estado_general === 'regular' ? 'badge-amber' : 'badge-red'}">${insp.estado_general}</span>
        <span class="text-sm text-muted"> · ${Format.date(insp.fecha)} · Inspector: ${insp.inspector || 'N/A'}</span>
      </div>
      ${insp.area_nombre ? `<p class="text-sm"><b>Área:</b> ${insp.area_nombre}</p>` : ''}
      ${insp.cultivo_nombre ? `<p class="text-sm"><b>Cultivo:</b> ${insp.cultivo_nombre}</p>` : ''}
      ${insp.etapa_fenologica ? `<p class="text-sm"><b>Etapa fenológica:</b> ${insp.etapa_fenologica}</p>` : ''}
      ${insp.estado_follaje ? `<p class="text-sm"><b>Follaje:</b> ${insp.estado_follaje}</p>` : ''}
      ${insp.estado_riego ? `<p class="text-sm"><b>Riego:</b> ${insp.estado_riego}</p>` : ''}
      ${insp.estado_suelo ? `<p class="text-sm"><b>Suelo:</b> ${insp.estado_suelo}</p>` : ''}
      ${insp.plagas_detectadas ? `<p class="text-sm"><b>Plagas:</b> <span class="text-red">${insp.plagas_detectadas}</span></p>` : ''}
      ${insp.enfermedades_detectadas ? `<p class="text-sm"><b>Enfermedades:</b> <span class="text-amber">${insp.enfermedades_detectadas}</span></p>` : ''}
      ${insp.observaciones ? `<div class="mt-1"><b>Observaciones:</b><p class="text-sm">${insp.observaciones}</p></div>` : ''}
      ${fotos.length > 0 ? `
        <div class="section-title mt-2">📷 Fotografías (${fotos.length})</div>
        <div class="photo-preview-grid">
          ${fotos.map(f => `<div class="photo-preview-item"><img src="${f.data_url || f.thumbnail}" alt="Foto"></div>`).join('')}
        </div>
      ` : '<p class="text-sm text-muted mt-1">Sin fotografías</p>'}
    `;
    App.showModal(insp.titulo, body, '<button class="btn btn-secondary" onclick="App.closeModal()">Cerrar</button>');
  }

  return { render, showQuickInspection };
})();

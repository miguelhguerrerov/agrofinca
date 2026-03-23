// ============================================
// AgroFinca - Fincas Module (v2)
// Satellite map view, scale bar, full CRUD areas
// Member management with audit trail
// ============================================

const FincasModule = (() => {
  let map = null;
  let drawnItems = null;

  // --- Helper: create map with satellite + street layers + scale ---
  function createMapWithLayers(elementId, lat, lng, zoom = 18) {
    const mapEl = document.getElementById(elementId);
    if (!mapEl || typeof L === 'undefined') return null;

    const m = L.map(elementId).setView([lat, lng], zoom);

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri WorldImagery', maxZoom: 22
    });
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    });
    const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22, opacity: 0.7
    });

    satellite.addTo(m);

    L.control.layers(
      { '🛰️ Satélite': satellite, '🗺️ Calles': streets },
      { '🏷️ Etiquetas viales': labels },
      { position: 'topright', collapsed: true }
    ).addTo(m);

    L.control.scale({ imperial: false, metric: true, maxWidth: 200, position: 'bottomleft' }).addTo(m);

    return m;
  }

  async function render(container, fincaId) {
    const userId = AuthModule.getUserId();
    const fincas = await AgroDB.getByIndex('fincas', 'propietario_id', userId);
    const memberships = await AgroDB.getByIndex('finca_miembros', 'usuario_id', userId);
    const memberFincas = [];
    for (const m of memberships) {
      const f = await AgroDB.getById('fincas', m.finca_id);
      if (f && !fincas.find(x => x.id === f.id)) memberFincas.push({ ...f, _role: m.rol });
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>🏡 Mis Fincas</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-finca">+ Nueva Finca</button>
      </div>
      ${fincas.length === 0 && memberFincas.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🏡</div>
          <h3>No tienes fincas registradas</h3>
          <p>Crea tu primera finca para comenzar a registrar cultivos, producción y ventas.</p>
          <button class="btn btn-primary" id="btn-empty-new-finca">Crear mi primera finca</button>
        </div>
      ` : `
        <div class="section">
          ${fincas.map(f => fincaCard(f, 'propietario')).join('')}
          ${memberFincas.map(f => fincaCard(f, f._role || 'miembro')).join('')}
        </div>
      `}
    `;

    document.getElementById('btn-new-finca')?.addEventListener('click', async () => {
      if (typeof PlanGuard !== 'undefined') {
        const canAdd = await PlanGuard.canAddFarmAsync();
        if (!canAdd) { PlanGuard.showUpgradePrompt('Fincas ilimitadas'); return; }
      }
      showFincaForm();
    });
    document.getElementById('btn-empty-new-finca')?.addEventListener('click', async () => {
      if (typeof PlanGuard !== 'undefined') {
        const canAdd = await PlanGuard.canAddFarmAsync();
        if (!canAdd) { PlanGuard.showUpgradePrompt('Fincas ilimitadas'); return; }
      }
      showFincaForm();
    });
    container.querySelectorAll('.btn-manage-finca').forEach(btn => {
      btn.addEventListener('click', () => showFincaDetail(btn.dataset.id));
    });
    container.querySelectorAll('.btn-select-finca').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('finca-selector').value = btn.dataset.id;
        document.getElementById('finca-selector').dispatchEvent(new Event('change'));
        App.showToast('Finca seleccionada', 'success');
      });
    });
  }

  function fincaCard(finca, role) {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${finca.nombre}</div>
            <div class="card-subtitle">${finca.ubicacion || 'Sin ubicación'} · <span class="badge ${role === 'propietario' ? 'badge-green' : 'badge-blue'}">${role}</span></div>
          </div>
        </div>
        <div class="flex gap-1">
          <span class="text-sm text-muted">${Format.area(finca.area_total_m2 || 0)}</span>
          ${finca.descripcion ? `<span class="text-sm text-muted">· ${Format.truncate(finca.descripcion, 40)}</span>` : ''}
        </div>
        <div class="flex gap-1 mt-1">
          <button class="btn btn-primary btn-sm btn-select-finca" data-id="${finca.id}">Seleccionar</button>
          <button class="btn btn-outline btn-sm btn-manage-finca" data-id="${finca.id}">Gestionar</button>
        </div>
      </div>
    `;
  }

  async function showFincaForm(finca = null) {
    const isEdit = !!finca;
    const body = `
      <div class="form-group">
        <label>Nombre de la finca *</label>
        <input type="text" id="finca-nombre" value="${finca?.nombre || ''}" placeholder="Mi Finca">
      </div>
      <div class="form-group">
        <label>Ubicación / Dirección</label>
        <input type="text" id="finca-ubicacion" value="${finca?.ubicacion || ''}" placeholder="Provincia, cantón, parroquia">
      </div>
      <div class="form-group">
        <label>Descripción</label>
        <textarea id="finca-descripcion" placeholder="Descripción general de la finca">${finca?.descripcion || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Área total (m²)</label>
          <input type="number" id="finca-area" value="${finca?.area_total_m2 || ''}" placeholder="10000">
        </div>
        <div class="form-group">
          <label>Sistema de riego</label>
          <select id="finca-riego">
            <option value="canales_infiltracion" ${finca?.sistema_riego === 'canales_infiltracion' ? 'selected' : ''}>Canales con infiltración radicular</option>
            <option value="goteo" ${finca?.sistema_riego === 'goteo' ? 'selected' : ''}>Goteo</option>
            <option value="aspersion" ${finca?.sistema_riego === 'aspersion' ? 'selected' : ''}>Aspersión</option>
            <option value="gravedad" ${finca?.sistema_riego === 'gravedad' ? 'selected' : ''}>Gravedad</option>
            <option value="ninguno" ${finca?.sistema_riego === 'ninguno' ? 'selected' : ''}>Ninguno / Secano</option>
            <option value="otro" ${finca?.sistema_riego === 'otro' ? 'selected' : ''}>Otro</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Coordenadas centrales (opcional)</label>
        <div class="form-row">
          <input type="number" step="any" id="finca-lat" value="${finca?.latitud || ''}" placeholder="Latitud">
          <input type="number" step="any" id="finca-lng" value="${finca?.longitud || ''}" placeholder="Longitud">
          <button class="btn btn-outline btn-sm" id="btn-get-location" type="button">📍 GPS</button>
        </div>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Finca' : 'Nueva Finca', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       ${isEdit ? '<button class="btn btn-danger btn-sm" id="btn-delete-finca">🗑 Eliminar</button>' : ''}
       <button class="btn btn-primary" id="btn-save-finca">${isEdit ? 'Actualizar' : 'Crear Finca'}</button>`);

    document.getElementById('btn-get-location').addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          document.getElementById('finca-lat').value = pos.coords.latitude.toFixed(6);
          document.getElementById('finca-lng').value = pos.coords.longitude.toFixed(6);
          App.showToast('Ubicación obtenida', 'success');
        }, () => App.showToast('No se pudo obtener ubicación', 'warning'));
      }
    });

    document.getElementById('btn-delete-finca')?.addEventListener('click', async () => {
      if (confirm('⚠️ ¿Eliminar esta finca y todos sus datos asociados?')) {
        await AgroDB.remove('fincas', finca.id);
        App.closeModal();
        await App.loadUserFincas();
        App.showToast('Finca eliminada', 'success');
        App.navigateTo('fincas');
      }
    });

    document.getElementById('btn-save-finca').addEventListener('click', async () => {
      const nombre = document.getElementById('finca-nombre').value.trim();
      if (!nombre) { App.showToast('El nombre es obligatorio', 'warning'); return; }

      const data = {
        nombre,
        ubicacion: document.getElementById('finca-ubicacion').value.trim(),
        descripcion: document.getElementById('finca-descripcion').value.trim(),
        area_total_m2: parseFloat(document.getElementById('finca-area').value) || 0,
        sistema_riego: document.getElementById('finca-riego').value,
        latitud: parseFloat(document.getElementById('finca-lat').value) || null,
        longitud: parseFloat(document.getElementById('finca-lng').value) || null,
        propietario_id: AuthModule.getUserId(),
        modificado_por: AuthModule.getUser()?.nombre || 'Sistema'
      };

      try {
        if (isEdit) {
          await AgroDB.update('fincas', finca.id, data);
          App.showToast('Finca actualizada', 'success');
        } else {
          const newFinca = await AgroDB.add('fincas', data);
          await AgroDB.seedDefaultCrops(newFinca.id);
          App.showToast('Finca creada exitosamente', 'success');
        }
        App.closeModal();
        await App.loadUserFincas();
        App.navigateTo('fincas');
      } catch (err) {
        App.showToast('Error: ' + err.message, 'error');
      }
    });
  }

  async function showFincaDetail(fincaId) {
    const finca = await AgroDB.getById('fincas', fincaId);
    if (!finca) return;

    const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
    const miembros = await AgroDB.getByIndex('finca_miembros', 'finca_id', fincaId);
    const isOwner = finca.propietario_id === AuthModule.getUserId();

    const miembrosInfo = [];
    for (const m of miembros) {
      const u = await AgroDB.getById('usuarios', m.usuario_id);
      miembrosInfo.push({ ...m, nombre: u?.nombre || m.usuario_email || 'Desconocido', email: u?.email || m.usuario_email });
    }

    const content = document.getElementById('main-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-sm btn-secondary" id="btn-back-fincas">← Volver</button>
          <h2 style="margin-top:0.5rem;">${finca.nombre}</h2>
          <p class="text-sm text-muted">${finca.ubicacion || ''} · ${Format.area(finca.area_total_m2)} · Riego: ${finca.sistema_riego || 'N/A'}</p>
        </div>
        ${isOwner ? '<button class="btn btn-outline btn-sm" id="btn-edit-finca">✏️ Editar</button>' : ''}
      </div>

      <!-- Map / Areas with satellite -->
      <div class="card">
        <div class="card-header">
          <h3>🗺️ Áreas Cultivables (Vista Satélite)</h3>
          <button class="btn btn-primary btn-sm" id="btn-new-area">+ Área</button>
        </div>
        <div id="finca-map" class="map-container" style="height:350px;"></div>
        ${areas.length === 0 ? '<p class="text-sm text-muted text-center mt-1">No hay áreas definidas. Crea una nueva área dibujándola sobre el mapa satelital.</p>' : ''}
        <ul class="data-list" id="areas-list">
          ${areas.map(a => `
            <li class="data-list-item">
              <div class="data-list-left">
                <div class="flex gap-1" style="align-items:center;">
                  <span class="area-color" style="background:${a.color || '#4CAF50'}"></span>
                  <span class="data-list-title">${a.nombre}</span>
                </div>
                <div class="data-list-sub">${a.cultivo_actual_nombre || 'Sin cultivo'} · ${Format.area(a.area_m2)}</div>
              </div>
              <div class="data-list-actions">
                <button class="btn btn-sm btn-outline btn-edit-area" data-id="${a.id}">✏️</button>
                <button class="btn btn-sm btn-danger btn-del-area" data-id="${a.id}">🗑</button>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>

      <!-- Members -->
      <div class="card">
        <div class="card-header">
          <h3>👥 Miembros</h3>
          ${isOwner ? '<button class="btn btn-primary btn-sm" id="btn-add-member">+ Invitar</button>' : ''}
        </div>
        <div>
          <div class="member-chip">
            <div class="member-avatar">${Format.initials(AuthModule.getUser()?.nombre || '')}</div>
            <span>${AuthModule.getUser()?.nombre || 'Propietario'}</span>
            <span class="badge badge-green" style="margin-left:4px;">Dueño</span>
          </div>
          ${miembrosInfo.map(m => `
            <div class="member-chip" data-member-id="${m.id}">
              <div class="member-avatar">${Format.initials(m.nombre)}</div>
              <span>${m.nombre} (${m.rol})</span>
              ${isOwner ? `<span class="member-remove" data-id="${m.id}">&times;</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Init satellite map
    setTimeout(() => {
      const lat = finca.latitud || -1.8312;
      const lng = finca.longitud || -79.9345;
      if (map) { map.remove(); map = null; }
      map = createMapWithLayers('finca-map', lat, lng, 18);
      if (!map) return;

      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      areas.forEach(area => {
        if (area.geojson) {
          try {
            const geoLayer = L.geoJSON(JSON.parse(area.geojson), {
              style: { color: area.color || '#4CAF50', fillColor: area.color || '#4CAF50', fillOpacity: 0.35, weight: 2 }
            });
            geoLayer.bindPopup(`<b>${area.nombre}</b><br>${area.cultivo_actual_nombre || 'Sin cultivo'}<br>${Format.area(area.area_m2)}`);
            geoLayer.addTo(drawnItems);
          } catch (e) { /* ignore */ }
        }
      });

      if (drawnItems.getLayers().length > 0) {
        map.fitBounds(drawnItems.getBounds().pad(0.1));
      }
      setTimeout(() => map.invalidateSize(), 200);
    }, 100);

    // Events
    document.getElementById('btn-back-fincas').addEventListener('click', () => App.navigateTo('fincas'));
    document.getElementById('btn-edit-finca')?.addEventListener('click', () => showFincaForm(finca));
    document.getElementById('btn-new-area').addEventListener('click', () => showAreaForm(fincaId));
    document.getElementById('btn-add-member')?.addEventListener('click', () => showAddMember(fincaId));

    content.querySelectorAll('.btn-edit-area').forEach(btn => {
      btn.addEventListener('click', async () => {
        const area = await AgroDB.getById('areas', btn.dataset.id);
        if (area) showAreaForm(fincaId, area);
      });
    });
    content.querySelectorAll('.btn-del-area').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta área?')) {
          await AgroDB.remove('areas', btn.dataset.id);
          App.showToast('Área eliminada', 'success');
          showFincaDetail(fincaId);
        }
      });
    });
    content.querySelectorAll('.member-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Remover este miembro?')) {
          await AgroDB.remove('finca_miembros', btn.dataset.id);
          App.showToast('Miembro removido', 'success');
          showFincaDetail(fincaId);
        }
      });
    });
  }

  async function showAreaForm(fincaId, area = null) {
    const isEdit = !!area;
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);

    const body = `
      <div class="form-group">
        <label>Nombre del área *</label>
        <input type="text" id="area-nombre" value="${area?.nombre || ''}" placeholder="Parcela A, Lote 1...">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cultivo actual</label>
          <select id="area-cultivo">
            <option value="">Sin cultivo</option>
            ${cultivos.map(c => `<option value="${c.id}" ${area?.cultivo_actual_id === c.id ? 'selected' : ''}>${c.icono || ''} ${c.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Área (m²)</label>
          <input type="number" id="area-m2" value="${area?.area_m2 || ''}" placeholder="500">
        </div>
      </div>
      <div class="form-group">
        <label>Color en mapa</label>
        <input type="color" id="area-color" value="${area?.color || '#4CAF50'}">
      </div>
      <div class="form-group">
        <label>📡 Dibujar área en vista satelital</label>
        <p class="form-hint">Usa los botones de dibujo para trazar el polígono del área sobre la imagen satelital. La escala muestra decenas de metros.</p>
        <div id="area-map-draw" class="map-container" style="height:300px;"></div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="area-notas" placeholder="Observaciones del área">${area?.notas || ''}</textarea>
      </div>
    `;

    App.showModal(isEdit ? 'Editar Área' : 'Nueva Área', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       ${isEdit ? `<button class="btn btn-danger btn-sm" id="btn-delete-area">🗑 Eliminar</button>` : ''}
       <button class="btn btn-primary" id="btn-save-area">Guardar</button>`);

    let drawMap = null;
    let drawLayer = new L.FeatureGroup();
    let areaGeoJSON = area?.geojson ? JSON.parse(area.geojson) : null;

    setTimeout(() => {
      const mapContainer = document.getElementById('area-map-draw');
      if (!mapContainer || typeof L === 'undefined') return;

      AgroDB.getById('fincas', fincaId).then(finca => {
        const lat = finca?.latitud || -1.8312;
        const lng = finca?.longitud || -79.9345;

        drawMap = createMapWithLayers('area-map-draw', lat, lng, 19);
        if (!drawMap) return;
        drawMap.addLayer(drawLayer);

        if (areaGeoJSON) {
          const layer = L.geoJSON(areaGeoJSON, {
            style: { color: area.color || '#4CAF50', fillOpacity: 0.35, weight: 2 }
          });
          layer.eachLayer(l => drawLayer.addLayer(l));
          drawMap.fitBounds(drawLayer.getBounds().pad(0.1));
        }

        const drawControl = new L.Control.Draw({
          edit: { featureGroup: drawLayer },
          draw: {
            polygon: { allowIntersection: false, showArea: true, metric: true },
            rectangle: true,
            circle: false, circlemarker: false, marker: true, polyline: false
          }
        });
        drawMap.addControl(drawControl);

        drawMap.on(L.Draw.Event.CREATED, (e) => {
          drawLayer.clearLayers();
          drawLayer.addLayer(e.layer);
          areaGeoJSON = drawLayer.toGeoJSON();
          if (e.layerType === 'polygon' || e.layerType === 'rectangle') {
            const coords = e.layer.getLatLngs()[0];
            const m2 = L.GeometryUtil ? L.GeometryUtil.geodesicArea(coords) : estimateArea(coords);
            document.getElementById('area-m2').value = Math.round(m2);
          }
        });
        drawMap.on(L.Draw.Event.EDITED, () => { areaGeoJSON = drawLayer.toGeoJSON(); });
        drawMap.on(L.Draw.Event.DELETED, () => { areaGeoJSON = null; document.getElementById('area-m2').value = ''; });
        setTimeout(() => drawMap.invalidateSize(), 200);
      });
    }, 300);

    document.getElementById('btn-delete-area')?.addEventListener('click', async () => {
      if (confirm('¿Eliminar esta área?')) {
        await AgroDB.remove('areas', area.id);
        if (drawMap) drawMap.remove();
        App.closeModal();
        App.showToast('Área eliminada', 'success');
        showFincaDetail(fincaId);
      }
    });

    document.getElementById('btn-save-area').addEventListener('click', async () => {
      const nombre = document.getElementById('area-nombre').value.trim();
      if (!nombre) { App.showToast('El nombre es obligatorio', 'warning'); return; }
      const cultivoId = document.getElementById('area-cultivo').value;
      let cultivoNombre = '';
      if (cultivoId) { const c = await AgroDB.getById('cultivos_catalogo', cultivoId); cultivoNombre = c ? c.nombre : ''; }

      const data = {
        nombre, finca_id: fincaId,
        cultivo_actual_id: cultivoId || null,
        cultivo_actual_nombre: cultivoNombre,
        area_m2: parseFloat(document.getElementById('area-m2').value) || 0,
        color: document.getElementById('area-color').value,
        geojson: areaGeoJSON ? JSON.stringify(areaGeoJSON) : null,
        notas: document.getElementById('area-notas').value.trim(),
        modificado_por: AuthModule.getUser()?.nombre || 'Sistema'
      };

      if (isEdit) await AgroDB.update('areas', area.id, data);
      else await AgroDB.add('areas', data);

      if (drawMap) drawMap.remove();
      App.closeModal();
      App.showToast('Área guardada', 'success');
      showFincaDetail(fincaId);
    });
  }

  function estimateArea(latlngs) {
    let area = 0;
    const n = latlngs.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += latlngs[i].lat * latlngs[j].lng;
      area -= latlngs[j].lat * latlngs[i].lng;
    }
    return Math.abs(area / 2) * 111320 * 111320;
  }

  async function showAddMember(fincaId) {
    const body = `
      <div class="form-group">
        <label>Correo del usuario a invitar *</label>
        <input type="email" id="member-email" placeholder="capataz@correo.com">
      </div>
      <div class="form-group">
        <label>Nombre (referencia)</label>
        <input type="text" id="member-nombre" placeholder="Nombre del miembro">
      </div>
      <div class="form-group">
        <label>Rol en esta finca</label>
        <select id="member-rol">
          <option value="capataz">Capataz / Responsable</option>
          <option value="trabajador">Trabajador</option>
          <option value="tecnico">Técnico</option>
          <option value="observador">Observador (solo lectura)</option>
        </select>
      </div>
    `;
    App.showModal('Invitar Miembro', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-member">Invitar</button>`);

    document.getElementById('btn-save-member').addEventListener('click', async () => {
      const email = document.getElementById('member-email').value.trim();
      if (!email) { App.showToast('El correo es obligatorio', 'warning'); return; }
      const users = await AgroDB.getAll('usuarios');
      const user = users.find(u => u.email === email);
      await AgroDB.add('finca_miembros', {
        finca_id: fincaId,
        usuario_id: user?.id || null,
        usuario_email: email,
        nombre: document.getElementById('member-nombre').value.trim(),
        rol: document.getElementById('member-rol').value
      });
      App.closeModal();
      App.showToast('Miembro invitado', 'success');
      showFincaDetail(fincaId);
    });
  }

  return { render };
})();

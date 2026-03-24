// ============================================
// AgroFinca - Fincas Module (v4)
// UX Redesign: Tabbed detail view (Áreas/Miembros/Info)
// Area categorization by type, map labels, Google Satellite default
// Member management with email validation
// ============================================

const FincasModule = (() => {
  let map = null;
  let drawnItems = null;
  let currentFincaTab = 'areas';

  // --- Area type taxonomy ---
  const AREA_TYPES = [
    { value: 'productivo',      label: 'Productivo',      icon: '🌱', color: '#4CAF50', badge: 'badge-green' },
    { value: 'proteccion',      label: 'Protección',      icon: '🌳', color: '#2196F3', badge: 'badge-blue' },
    { value: 'procesamiento',   label: 'Procesamiento',   icon: '🏭', color: '#FFA000', badge: 'badge-amber' },
    { value: 'almacenamiento',  label: 'Almacenamiento',  icon: '📦', color: '#795548', badge: 'badge-brown' },
    { value: 'infraestructura', label: 'Infraestructura', icon: '🏠', color: '#9E9E9E', badge: 'badge-gray' },
    { value: 'otros',           label: 'Otros',           icon: '📍', color: '#616161', badge: 'badge-gray' }
  ];

  function getAreaType(v) {
    return AREA_TYPES.find(t => t.value === v) || AREA_TYPES[AREA_TYPES.length - 1];
  }

  // --- Helper: create map with satellite + street layers + scale ---
  function createMapWithLayers(elementId, lat, lng, zoom = 18) {
    const mapEl = document.getElementById(elementId);
    if (!mapEl || typeof L === 'undefined') return null;

    const m = L.map(elementId).setView([lat, lng], zoom);

    const googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      attribution: '© Google', maxZoom: 22, maxNativeZoom: 20
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri WorldImagery', maxZoom: 22, maxNativeZoom: 19
    });
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    });
    const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22, maxNativeZoom: 19, opacity: 0.7
    });

    // Google Satellite as default
    googleSat.addTo(m);

    L.control.layers(
      { '🛰️ Google Satélite': googleSat, '🛰️ Esri Satélite': satellite, '🗺️ Calles': streets },
      { '🏷️ Etiquetas viales': labels },
      { position: 'topright', collapsed: true }
    ).addTo(m);

    L.control.scale({ imperial: false, metric: true, maxWidth: 200, position: 'bottomleft' }).addTo(m);

    return m;
  }

  // --- Helper: calculate area from a polygon layer ---
  function calculateAreaFromLayer(layer) {
    if (!layer.getLatLngs) return 0;
    const coords = layer.getLatLngs()[0];
    if (!coords || coords.length < 3) return 0;
    return L.GeometryUtil ? L.GeometryUtil.geodesicArea(coords) : estimateArea(coords);
  }

  // =============================================
  // RENDER: Finca List
  // =============================================
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

  // =============================================
  // FINCA FORM (Create / Edit)
  // =============================================
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
        <label>📍 Ubicación en mapa</label>
        <p class="form-hint">Haz clic en el mapa para marcar la ubicación, o usa el botón GPS.</p>
        <div id="finca-location-map" class="map-container" style="height:250px; margin-bottom:0.5rem;"></div>
        <div class="form-row" style="align-items:center;">
          <input type="number" step="any" id="finca-lat" value="${finca?.latitud || ''}" placeholder="Latitud" style="flex:1;">
          <input type="number" step="any" id="finca-lng" value="${finca?.longitud || ''}" placeholder="Longitud" style="flex:1;">
          <button class="btn btn-outline btn-sm" id="btn-get-location" type="button" style="white-space:nowrap;">📍 GPS</button>
        </div>
      </div>
    `;
    App.showModal(isEdit ? 'Editar Finca' : 'Nueva Finca', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       ${isEdit ? '<button class="btn btn-danger btn-sm" id="btn-delete-finca">🗑 Eliminar</button>' : ''}
       <button class="btn btn-primary" id="btn-save-finca">${isEdit ? 'Actualizar' : 'Crear Finca'}</button>`);

    let pickerMap = null;
    let pickerMarker = null;

    function updatePickerMarker(lat, lng) {
      if (pickerMarker) {
        pickerMarker.setLatLng([lat, lng]);
      } else if (pickerMap) {
        pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(pickerMap);
        pickerMarker.on('dragend', () => {
          const pos = pickerMarker.getLatLng();
          document.getElementById('finca-lat').value = pos.lat.toFixed(6);
          document.getElementById('finca-lng').value = pos.lng.toFixed(6);
        });
      }
      document.getElementById('finca-lat').value = lat.toFixed(6);
      document.getElementById('finca-lng').value = lng.toFixed(6);
    }

    setTimeout(() => {
      const mapEl = document.getElementById('finca-location-map');
      if (!mapEl || typeof L === 'undefined') return;

      const initLat = finca?.latitud || -1.8312;
      const initLng = finca?.longitud || -79.9345;
      const initZoom = finca?.latitud ? 16 : 6;

      pickerMap = createMapWithLayers('finca-location-map', initLat, initLng, initZoom);
      if (!pickerMap) return;

      if (finca?.latitud && finca?.longitud) {
        pickerMarker = L.marker([finca.latitud, finca.longitud], { draggable: true }).addTo(pickerMap);
        pickerMarker.on('dragend', () => {
          const pos = pickerMarker.getLatLng();
          document.getElementById('finca-lat').value = pos.lat.toFixed(6);
          document.getElementById('finca-lng').value = pos.lng.toFixed(6);
        });
      }

      pickerMap.on('click', (e) => {
        updatePickerMarker(e.latlng.lat, e.latlng.lng);
        pickerMap.panTo(e.latlng);
      });

      setTimeout(() => pickerMap.invalidateSize(), 200);
    }, 200);

    document.getElementById('btn-get-location').addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          document.getElementById('finca-lat').value = lat.toFixed(6);
          document.getElementById('finca-lng').value = lng.toFixed(6);
          if (pickerMap) {
            updatePickerMarker(lat, lng);
            pickerMap.setView([lat, lng], 16);
          }
          App.showToast('Ubicación obtenida', 'success');
        }, () => App.showToast('No se pudo obtener ubicación', 'warning'));
      }
    });

    ['finca-lat', 'finca-lng'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const lat = parseFloat(document.getElementById('finca-lat').value);
        const lng = parseFloat(document.getElementById('finca-lng').value);
        if (!isNaN(lat) && !isNaN(lng) && pickerMap) {
          updatePickerMarker(lat, lng);
          pickerMap.setView([lat, lng], 16);
        }
      });
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
        if (pickerMap) { pickerMap.remove(); pickerMap = null; }
        App.closeModal();
        await App.loadUserFincas();
        App.navigateTo('fincas');
      } catch (err) {
        App.showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // =============================================
  // FINCA DETAIL — Tabbed View
  // =============================================
  async function showFincaDetail(fincaId) {
    const finca = await AgroDB.getById('fincas', fincaId);
    if (!finca) return;

    const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
    const miembros = await AgroDB.getByIndex('finca_miembros', 'finca_id', fincaId);
    const isOwner = finca.propietario_id === AuthModule.getUserId();

    const miembrosInfo = [];
    for (const m of miembros) {
      const u = await AgroDB.getById('usuarios', m.usuario_id);
      miembrosInfo.push({ ...m, nombre: u?.nombre || m.nombre || m.usuario_email || 'Desconocido', email: u?.email || m.usuario_email });
    }

    const content = document.getElementById('main-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-sm btn-secondary" id="btn-back-fincas">← Volver</button>
          <h2 style="margin-top:0.5rem;">${finca.nombre}</h2>
          <p class="text-sm text-muted">${finca.ubicacion || ''}</p>
        </div>
        ${isOwner ? '<button class="btn btn-outline btn-sm" id="btn-edit-finca">✏️ Editar</button>' : ''}
      </div>

      <div class="tabs">
        <button class="tab ${currentFincaTab === 'areas' ? 'active' : ''}" data-tab="areas">🗺️ Áreas</button>
        <button class="tab ${currentFincaTab === 'miembros' ? 'active' : ''}" data-tab="miembros">👥 Miembros (${miembrosInfo.length + 1})</button>
        <button class="tab ${currentFincaTab === 'info' ? 'active' : ''}" data-tab="info">ℹ️ Info</button>
      </div>

      <div id="finca-tab-content"></div>
    `;

    // Tab switching
    content.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentFincaTab = tab.dataset.tab;
        content.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderFincaTab(fincaId, finca, areas, miembrosInfo, isOwner);
      });
    });

    // Header events
    document.getElementById('btn-back-fincas').addEventListener('click', () => {
      currentFincaTab = 'areas'; // Reset to default
      App.navigateTo('fincas');
    });
    document.getElementById('btn-edit-finca')?.addEventListener('click', () => showFincaForm(finca));

    // Render current tab
    renderFincaTab(fincaId, finca, areas, miembrosInfo, isOwner);
  }

  function renderFincaTab(fincaId, finca, areas, miembrosInfo, isOwner) {
    // Cleanup map before switching
    if (map) { map.remove(); map = null; }

    const el = document.getElementById('finca-tab-content');
    if (!el) return;

    switch (currentFincaTab) {
      case 'areas':
        renderAreasTab(el, fincaId, finca, areas, isOwner);
        break;
      case 'miembros':
        renderMiembrosTab(el, fincaId, finca, miembrosInfo, isOwner);
        break;
      case 'info':
        renderInfoTab(el, finca, miembrosInfo, isOwner);
        break;
    }
  }

  // =============================================
  // TAB: Áreas
  // =============================================
  function renderAreasTab(el, fincaId, finca, areas, isOwner) {
    // Compute metrics
    const totalArea = areas.reduce((s, a) => s + (a.area_m2 || 0), 0);
    const grouped = {};
    AREA_TYPES.forEach(t => { grouped[t.value] = []; });
    areas.forEach(a => {
      const tipo = a.tipo || 'otros';
      if (!grouped[tipo]) grouped[tipo] = [];
      grouped[tipo].push(a);
    });

    const productivo = grouped['productivo'] || [];
    const proteccion = grouped['proteccion'] || [];
    const productivoArea = productivo.reduce((s, a) => s + (a.area_m2 || 0), 0);
    const proteccionArea = proteccion.reduce((s, a) => s + (a.area_m2 || 0), 0);
    const pctProd = totalArea > 0 ? Math.round(productivoArea / totalArea * 100) : 0;
    const pctProt = totalArea > 0 ? Math.round(proteccionArea / totalArea * 100) : 0;

    el.innerHTML = `
      <!-- Summary Metrics -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">🗺️</div>
          <div class="s-data">
            <div class="s-value">${Format.area(totalArea)}</div>
            <div class="s-label">Área mapeada</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon green">🌱</div>
          <div class="s-data">
            <div class="s-value">${productivo.length}</div>
            <div class="s-label">Productivo (${pctProd}%)</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">🌳</div>
          <div class="s-data">
            <div class="s-value">${proteccion.length}</div>
            <div class="s-label">Protección (${pctProt}%)</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📊</div>
          <div class="s-data">
            <div class="s-value">${areas.length}</div>
            <div class="s-label">Áreas definidas</div>
          </div>
        </div>
      </div>

      <!-- Map -->
      <div class="card">
        <div class="card-header">
          <h3>🗺️ Vista Satelital</h3>
          <button class="btn btn-primary btn-sm" id="btn-new-area">+ Nueva Área</button>
        </div>
        <div id="finca-map" class="map-container" style="height:350px;"></div>
      </div>

      ${areas.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🗺️</div>
          <h3>Define las áreas de tu finca</h3>
          <p>Las áreas te permiten mapear parcelas productivas, zonas de protección, infraestructura y más. Dibuja tu primera área sobre el mapa satelital.</p>
          <button class="btn btn-primary" id="btn-empty-new-area">+ Crear primera área</button>
        </div>
      ` : `
        <!-- Area list grouped by type -->
        <div class="card">
          ${AREA_TYPES.map(type => {
            const typeAreas = grouped[type.value] || [];
            if (typeAreas.length === 0) return '';
            const typeTotal = typeAreas.reduce((s, a) => s + (a.area_m2 || 0), 0);
            return `
              <div class="area-type-header">
                <span class="badge ${type.badge}">${type.icon} ${type.label}</span>
                <span class="text-sm text-muted">${typeAreas.length} área${typeAreas.length > 1 ? 's' : ''} · ${Format.area(typeTotal)}</span>
              </div>
              <ul class="data-list">
                ${typeAreas.map(a => `
                  <li class="data-list-item">
                    <div class="data-list-left">
                      <div class="flex gap-1" style="align-items:center;">
                        <span class="area-color" style="background:${a.color || type.color}"></span>
                        <span class="data-list-title">${a.nombre}</span>
                      </div>
                      <div class="data-list-sub">${a.cultivo_actual_nombre || (type.value === 'productivo' ? 'Sin cultivo' : type.label)} · ${Format.area(a.area_m2)}</div>
                    </div>
                    <div class="data-list-actions">
                      <button class="btn btn-sm btn-outline btn-edit-area" data-id="${a.id}">✏️</button>
                      <button class="btn btn-sm btn-danger btn-del-area" data-id="${a.id}">🗑</button>
                    </div>
                  </li>
                `).join('')}
              </ul>
            `;
          }).join('')}
        </div>
      `}
    `;

    // Init satellite map with labels
    setTimeout(() => {
      const lat = finca.latitud || -1.8312;
      const lng = finca.longitud || -79.9345;
      map = createMapWithLayers('finca-map', lat, lng, 18);
      if (!map) return;

      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      areas.forEach(area => {
        if (area.geojson) {
          try {
            const aType = getAreaType(area.tipo);
            const aColor = area.color || aType.color;
            const geoLayer = L.geoJSON(JSON.parse(area.geojson), {
              style: { color: aColor, fillColor: aColor, fillOpacity: 0.35, weight: 2 }
            });

            // Popup with type badge
            geoLayer.bindPopup(`
              <b>${area.nombre}</b><br>
              <span>${aType.icon} ${aType.label}</span><br>
              ${area.cultivo_actual_nombre ? area.cultivo_actual_nombre + '<br>' : ''}
              ${Format.area(area.area_m2)}
            `);

            // Permanent label on map
            geoLayer.eachLayer(layer => {
              layer.bindTooltip(area.nombre, {
                permanent: true,
                direction: 'center',
                className: 'area-label-tooltip'
              });
            });

            geoLayer.addTo(drawnItems);
          } catch (e) { /* ignore */ }
        }
      });

      if (drawnItems.getLayers().length > 0) {
        map.fitBounds(drawnItems.getBounds().pad(0.1));
      }
      setTimeout(() => map && map.invalidateSize(), 200);
    }, 100);

    // Events
    document.getElementById('btn-new-area')?.addEventListener('click', () => showAreaForm(fincaId));
    document.getElementById('btn-empty-new-area')?.addEventListener('click', () => showAreaForm(fincaId));

    el.querySelectorAll('.btn-edit-area').forEach(btn => {
      btn.addEventListener('click', async () => {
        const area = await AgroDB.getById('areas', btn.dataset.id);
        if (area) showAreaForm(fincaId, area);
      });
    });
    el.querySelectorAll('.btn-del-area').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta área?')) {
          await AgroDB.remove('areas', btn.dataset.id);
          App.showToast('Área eliminada', 'success');
          showFincaDetail(fincaId);
        }
      });
    });
  }

  // =============================================
  // TAB: Miembros
  // =============================================
  function renderMiembrosTab(el, fincaId, finca, miembrosInfo, isOwner) {
    const owner = AuthModule.getUser();
    const ownerName = owner?.nombre || 'Propietario';
    const ownerEmail = owner?.email || '';

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>👥 Equipo de la Finca</h3>
          ${isOwner ? '<button class="btn btn-primary btn-sm" id="btn-add-member">+ Invitar</button>' : ''}
        </div>

        <ul class="data-list">
          <!-- Owner -->
          <li class="data-list-item">
            <div class="data-list-left">
              <div class="flex gap-1" style="align-items:center;">
                <div class="member-avatar">${Format.initials(ownerName)}</div>
                <div>
                  <div class="data-list-title">${ownerName}</div>
                  <div class="data-list-sub">${ownerEmail}</div>
                </div>
              </div>
            </div>
            <span class="badge badge-green">Dueño</span>
          </li>

          ${miembrosInfo.length === 0 ? '' : miembrosInfo.map(m => `
            <li class="data-list-item" data-member-id="${m.id}">
              <div class="data-list-left">
                <div class="flex gap-1" style="align-items:center;">
                  <div class="member-avatar">${Format.initials(m.nombre)}</div>
                  <div>
                    <div class="data-list-title">${m.nombre}</div>
                    <div class="data-list-sub">${m.email || m.usuario_email || ''} · ${m.rol}
                      ${m.estado_invitacion === 'pendiente' ? ' <span class="badge badge-amber">Pendiente</span>' : ''}
                    </div>
                  </div>
                </div>
              </div>
              ${isOwner ? `<button class="btn btn-sm btn-danger member-remove" data-id="${m.id}">✕</button>` : ''}
            </li>
          `).join('')}
        </ul>

        ${miembrosInfo.length === 0 ? `
          <div class="empty-state" style="padding:2rem 1rem;">
            <p>No hay miembros adicionales. ${isOwner ? 'Invita a tu equipo para colaborar.' : ''}</p>
          </div>
        ` : ''}
      </div>
    `;

    // Events
    document.getElementById('btn-add-member')?.addEventListener('click', () => showAddMember(fincaId));

    el.querySelectorAll('.member-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Remover este miembro?')) {
          await AgroDB.remove('finca_miembros', btn.dataset.id);
          App.showToast('Miembro removido', 'success');
          showFincaDetail(fincaId);
        }
      });
    });
  }

  // =============================================
  // TAB: Info
  // =============================================
  function renderInfoTab(el, finca, miembrosInfo, isOwner) {
    const riegoLabels = {
      canales_infiltracion: 'Canales con infiltración',
      goteo: 'Goteo',
      aspersion: 'Aspersión',
      gravedad: 'Gravedad',
      ninguno: 'Ninguno / Secano',
      otro: 'Otro'
    };

    el.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">📍</div>
          <div class="s-data">
            <div class="s-value" style="font-size:0.95rem;">${finca.ubicacion || 'Sin ubicación'}</div>
            <div class="s-label">Ubicación</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon green">📐</div>
          <div class="s-data">
            <div class="s-value">${Format.area(finca.area_total_m2 || 0)}</div>
            <div class="s-label">Área total declarada</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">💧</div>
          <div class="s-data">
            <div class="s-value" style="font-size:0.95rem;">${riegoLabels[finca.sistema_riego] || finca.sistema_riego || 'N/A'}</div>
            <div class="s-label">Sistema de riego</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon brown">👥</div>
          <div class="s-data">
            <div class="s-value">${miembrosInfo.length + 1}</div>
            <div class="s-label">Miembros</div>
          </div>
        </div>
      </div>

      ${finca.descripcion ? `
        <div class="card">
          <h3 style="margin-bottom:0.5rem;">Descripción</h3>
          <p class="text-sm">${finca.descripcion}</p>
        </div>
      ` : ''}

      ${finca.latitud ? `
        <div class="card">
          <h3 style="margin-bottom:0.5rem;">Ubicación en Mapa</h3>
          <div id="info-map" class="map-container" style="height:250px;"></div>
          <p class="text-sm text-muted mt-1">📍 ${finca.latitud?.toFixed(5)}, ${finca.longitud?.toFixed(5)}</p>
        </div>
      ` : ''}

      ${isOwner ? `
        <div style="text-align:center; margin-top:1rem;">
          <button class="btn btn-outline btn-sm" id="btn-edit-finca-info">✏️ Editar información</button>
        </div>
      ` : ''}
    `;

    // Info map
    if (finca.latitud) {
      setTimeout(() => {
        map = createMapWithLayers('info-map', finca.latitud, finca.longitud, 16);
        if (map) {
          L.marker([finca.latitud, finca.longitud]).addTo(map);
          setTimeout(() => map && map.invalidateSize(), 200);
        }
      }, 100);
    }

    document.getElementById('btn-edit-finca-info')?.addEventListener('click', () => showFincaForm(finca));
  }

  // =============================================
  // AREA FORM (Create / Edit) with Type Selector
  // =============================================
  async function showAreaForm(fincaId, area = null) {
    const isEdit = !!area;
    const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
    const currentTipo = area?.tipo || 'productivo';

    const body = `
      <div class="form-group">
        <label>Nombre del área *</label>
        <input type="text" id="area-nombre" value="${area?.nombre || ''}" placeholder="Parcela A, Lote 1, Zona Ripiaria...">
      </div>
      <div class="form-group">
        <label>Tipo de área *</label>
        <p class="form-hint">Clasifica según su uso principal</p>
        <select id="area-tipo">
          ${AREA_TYPES.map(t => `<option value="${t.value}" ${currentTipo === t.value ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group" id="area-cultivo-group" style="display:${currentTipo === 'productivo' ? '' : 'none'}">
          <label>Cultivo actual</label>
          <select id="area-cultivo">
            <option value="">Sin cultivo</option>
            ${cultivos.map(c => `<option value="${c.id}" ${area?.cultivo_actual_id === c.id ? 'selected' : ''}>${c.icono || ''} ${c.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Área (m²)</label>
          <input type="number" id="area-m2" value="${area?.area_m2 || ''}" placeholder="Auto al dibujar">
        </div>
      </div>
      <div class="form-group">
        <label>Color en mapa</label>
        <input type="color" id="area-color" value="${area?.color || getAreaType(currentTipo).color}">
      </div>
      <div class="form-group">
        <label>📡 Dibujar área en vista satelital</label>
        <p class="form-hint">Dibuja el polígono. Las áreas existentes se muestran como referencia (línea punteada).</p>
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

    // Type selector: auto-set color and toggle cultivo
    document.getElementById('area-tipo').addEventListener('change', (e) => {
      const typeInfo = getAreaType(e.target.value);
      // Auto-set color unless user already changed it manually
      document.getElementById('area-color').value = typeInfo.color;
      // Show cultivo selector only for productive areas
      const cultivoGroup = document.getElementById('area-cultivo-group');
      if (cultivoGroup) {
        cultivoGroup.style.display = e.target.value === 'productivo' ? '' : 'none';
      }
    });

    let drawMap = null;
    let drawLayer = new L.FeatureGroup();
    let areaGeoJSON = area?.geojson ? JSON.parse(area.geojson) : null;

    setTimeout(async () => {
      const mapContainer = document.getElementById('area-map-draw');
      if (!mapContainer || typeof L === 'undefined') return;

      const fincaData = await AgroDB.getById('fincas', fincaId);
      const lat = fincaData?.latitud || -1.8312;
      const lng = fincaData?.longitud || -79.9345;

      drawMap = createMapWithLayers('area-map-draw', lat, lng, 19);
      if (!drawMap) return;
      drawMap.addLayer(drawLayer);

      // Show existing areas as read-only reference
      const allAreas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
      const otherAreas = allAreas.filter(a => !isEdit || a.id !== area.id);
      const refGroup = new L.FeatureGroup();

      otherAreas.forEach(a => {
        if (a.geojson) {
          try {
            const geoLayer = L.geoJSON(JSON.parse(a.geojson), {
              style: {
                color: a.color || '#888',
                fillColor: a.color || '#888',
                fillOpacity: 0.15,
                weight: 1.5,
                dashArray: '6,4'
              },
              interactive: false
            });
            geoLayer.eachLayer(l => {
              l.bindTooltip(a.nombre, {
                permanent: true,
                direction: 'center',
                className: 'area-ref-label'
              });
            });
            geoLayer.addTo(refGroup);
          } catch (e) { /* ignore */ }
        }
      });
      refGroup.addTo(drawMap);

      // Load current area being edited
      if (areaGeoJSON) {
        const layer = L.geoJSON(areaGeoJSON, {
          style: { color: area.color || '#4CAF50', fillOpacity: 0.35, weight: 2 }
        });
        layer.eachLayer(l => drawLayer.addLayer(l));
        drawMap.fitBounds(drawLayer.getBounds().pad(0.1));
      } else if (refGroup.getLayers().length > 0) {
        drawMap.fitBounds(refGroup.getBounds().pad(0.2));
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
          const m2 = calculateAreaFromLayer(e.layer);
          document.getElementById('area-m2').value = Math.round(m2);
        }
      });

      drawMap.on(L.Draw.Event.EDITED, (e) => {
        areaGeoJSON = drawLayer.toGeoJSON();
        e.layers.eachLayer(layer => {
          const m2 = calculateAreaFromLayer(layer);
          if (m2 > 0) {
            document.getElementById('area-m2').value = Math.round(m2);
          }
        });
      });

      drawMap.on(L.Draw.Event.DELETED, () => {
        areaGeoJSON = null;
        document.getElementById('area-m2').value = '';
      });

      setTimeout(() => drawMap.invalidateSize(), 200);
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

      const tipo = document.getElementById('area-tipo').value;
      const cultivoId = tipo === 'productivo' ? document.getElementById('area-cultivo')?.value : null;
      let cultivoNombre = '';
      if (cultivoId) { const c = await AgroDB.getById('cultivos_catalogo', cultivoId); cultivoNombre = c ? c.nombre : ''; }

      const data = {
        nombre, finca_id: fincaId,
        tipo,
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

  // =============================================
  // MEMBER INVITATION with email validation
  // =============================================
  async function showAddMember(fincaId) {
    const body = `
      <div class="form-group">
        <label>Correo del usuario a invitar *</label>
        <input type="email" id="member-email" placeholder="usuario@correo.com">
        <div id="member-email-status" class="form-hint"></div>
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

    let foundUserId = null;
    let foundNombre = '';

    document.getElementById('member-email').addEventListener('blur', async () => {
      const email = document.getElementById('member-email').value.trim().toLowerCase();
      const statusEl = document.getElementById('member-email-status');
      if (!email || !email.includes('@')) { statusEl.textContent = ''; return; }

      statusEl.textContent = 'Verificando...';
      statusEl.className = 'form-hint';
      foundUserId = null;
      foundNombre = '';

      try {
        if (SyncEngine.isOnline() && SupabaseClient.hasSession()) {
          const profiles = await SupabaseClient.select('user_profiles', { email });
          if (profiles.length > 0) {
            foundUserId = profiles[0].id;
            foundNombre = profiles[0].nombre || '';
            statusEl.innerHTML = `<span style="color:var(--green-700);">✅ Usuario encontrado: <b>${foundNombre || email}</b></span>`;
            const nameInput = document.getElementById('member-nombre');
            if (!nameInput.value && foundNombre) nameInput.value = foundNombre;
          } else {
            statusEl.innerHTML = '<span style="color:var(--amber-700);">⚠️ Correo no registrado. Se creará invitación pendiente.</span>';
          }
        } else {
          statusEl.innerHTML = '<span style="color:var(--gray-500);">📡 Sin conexión — se verificará al sincronizar</span>';
        }
      } catch (e) {
        statusEl.innerHTML = '<span style="color:var(--gray-500);">📡 No se pudo verificar — se guardará como pendiente</span>';
      }
    });

    document.getElementById('btn-save-member').addEventListener('click', async () => {
      const email = document.getElementById('member-email').value.trim().toLowerCase();
      if (!email) { App.showToast('El correo es obligatorio', 'warning'); return; }

      const existingMembers = await AgroDB.getByIndex('finca_miembros', 'finca_id', fincaId);
      if (existingMembers.find(m => m.usuario_email === email)) {
        App.showToast('Este usuario ya es miembro de la finca', 'warning');
        return;
      }

      await AgroDB.add('finca_miembros', {
        finca_id: fincaId,
        usuario_id: foundUserId || null,
        usuario_email: email,
        nombre: document.getElementById('member-nombre').value.trim() || foundNombre,
        rol: document.getElementById('member-rol').value,
        estado_invitacion: foundUserId ? 'activa' : 'pendiente'
      });
      App.closeModal();
      App.showToast(foundUserId ? 'Miembro agregado' : 'Invitación pendiente creada', 'success');
      showFincaDetail(fincaId);
    });
  }

  return { render };
})();

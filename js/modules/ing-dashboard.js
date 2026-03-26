// ============================================
// AgroFinca - Ingeniero Dashboard Module
// Overview of all affiliated farms, inspections,
// KPIs, map, alerts, and quick actions
// ============================================

const IngDashboardModule = (() => {

  let map = null;

  // ── Render entry point ──────────────────────
  async function render(container) {
    const userId = AuthModule.getUserId();
    const today = DateUtils.today();
    const month = DateUtils.currentMonthRange();

    // ── 1. Load affiliated agricultores ──
    const afiliaciones = await AgroDB.query('ingeniero_agricultores',
      r => r.ingeniero_id === userId && r.estado === 'activo'
    );

    if (afiliaciones.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👨‍🌾</div>
          <h3>Panel del Ingeniero</h3>
          <p>No tienes agricultores afiliados aún. Afilia a tu primer agricultor para comenzar a supervisar sus fincas.</p>
          <button class="btn btn-primary" id="ing-dash-afiliar">+ Afiliar agricultor</button>
        </div>
      `;
      document.getElementById('ing-dash-afiliar')?.addEventListener('click', () => App.navigateTo('ing-agricultores'));
      return;
    }

    // ── 2. Gather data across all affiliated farms ──
    const agricultorIds = afiliaciones.map(a => a.agricultor_id);
    let allFincas = [];
    let allAreas = [];
    let allCiclos = [];
    let allInspecciones = [];
    let allProgramacion = [];
    const agricultorProfiles = {};

    for (const agId of agricultorIds) {
      const profile = await AgroDB.getById('user_profiles', agId);
      if (profile) agricultorProfiles[agId] = profile;

      const fincas = await AgroDB.getByIndex('fincas', 'propietario_id', agId);
      for (const finca of fincas) {
        finca._agricultor_id = agId;
        allFincas.push(finca);

        const areas = await AgroDB.getByIndex('areas', 'finca_id', finca.id);
        allAreas.push(...areas);

        const ciclos = await AgroDB.query('ciclos_productivos', r => r.finca_id === finca.id && r.estado === 'activo');
        allCiclos.push(...ciclos);

        const inspecciones = await AgroDB.query('inspecciones', r => r.finca_id === finca.id);
        allInspecciones.push(...inspecciones);

        const programacion = await AgroDB.query('programacion_inspecciones', r => r.finca_id === finca.id);
        allProgramacion.push(...programacion);
      }
    }

    // ── 3. Compute KPIs ──
    const totalAgricultores = agricultorIds.length;
    const totalFincas = allFincas.length;
    const superficieTotal = allAreas.reduce((sum, a) => sum + (a.area_m2 || 0), 0) / 10000;
    const inspeccionesMes = allInspecciones.filter(i => i.fecha >= month.start && i.fecha <= month.end);
    const pendientes = allProgramacion.filter(p => p.proxima_visita && p.proxima_visita <= today);

    // Visitas esta semana
    const weekStart = getWeekStart(today);
    const weekEnd = getWeekEnd(today);
    const visitasSemana = allInspecciones.filter(i => i.fecha >= weekStart && i.fecha <= weekEnd);

    // Last inspection per finca
    const lastInspByFinca = {};
    allInspecciones.forEach(i => {
      if (!lastInspByFinca[i.finca_id] || i.fecha > lastInspByFinca[i.finca_id].fecha) {
        lastInspByFinca[i.finca_id] = i;
      }
    });

    // Recent inspecciones (last 10)
    const recentInsp = [...allInspecciones]
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
      .slice(0, 10);

    // ── 4. Alertas ──
    const alertas = [];
    const fourteenDaysAgo = offsetDate(today, -14);
    const thirtyDaysAgo = offsetDate(today, -30);

    allFincas.forEach(f => {
      const last = lastInspByFinca[f.id];
      if (!last || last.fecha < thirtyDaysAgo) {
        alertas.push({ tipo: 'sin_inspeccion', finca: f.nombre, finca_id: f.id, mensaje: `Sin inspección hace >30 días`, badge: 'badge-red' });
      }
    });

    // Prescripciones vencidas
    const prescVencidas = await AgroDB.query('prescripciones',
      r => agricultorIds.includes(r.agricultor_id) && r.fecha_vencimiento && r.fecha_vencimiento < today && r.estado !== 'completada'
    );
    prescVencidas.forEach(p => {
      alertas.push({ tipo: 'prescripcion_vencida', mensaje: `Prescripción vencida: ${p.producto || p.titulo || 'Sin título'}`, badge: 'badge-amber' });
    });

    // ── 5. Build HTML ──
    let html = `
      <div class="page-header">
        <h2>📊 Panel del Ingeniero</h2>
      </div>

      <!-- KPI Cards -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon green">👨‍🌾</div>
          <div class="s-data">
            <div class="s-value">${totalAgricultores}</div>
            <div class="s-label">Agricultores afiliados</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">🏡</div>
          <div class="s-data">
            <div class="s-value">${totalFincas}</div>
            <div class="s-label">Fincas bajo supervisión</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon amber">📐</div>
          <div class="s-data">
            <div class="s-value">${superficieTotal.toFixed(2)} ha</div>
            <div class="s-label">Superficie total</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon green">📋</div>
          <div class="s-data">
            <div class="s-value">${inspeccionesMes.length}</div>
            <div class="s-label">Inspecciones este mes</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon red">⏰</div>
          <div class="s-data">
            <div class="s-value">${pendientes.length}</div>
            <div class="s-label">Inspecciones pendientes</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon blue">📅</div>
          <div class="s-data">
            <div class="s-value">${visitasSemana.length}</div>
            <div class="s-label">Visitas esta semana</div>
          </div>
        </div>
      </div>
    `;

    // ── Map Section ──
    const fincasConCoords = allFincas.filter(f => f.latitud && f.longitud);
    if (fincasConCoords.length > 0) {
      html += `
        <div class="card">
          <div class="card-title">🗺️ Mapa de Fincas</div>
          <div id="ing-dash-map" style="height:320px;border-radius:8px;"></div>
        </div>
      `;
    }

    // ── Quick Actions ──
    html += `
      <div class="card">
        <div class="card-title">⚡ Acciones rápidas</div>
        <div class="form-row" style="gap:0.5rem;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="ing-quick-inspeccion">📋 Nueva inspección</button>
          <button class="btn btn-outline btn-sm" id="ing-quick-afiliar">👨‍🌾 Afiliar agricultor</button>
          <button class="btn btn-outline btn-sm" id="ing-quick-chat">💬 Abrir chat</button>
        </div>
      </div>
    `;

    // ── Alertas ──
    if (alertas.length > 0) {
      html += `
        <div class="card" style="border-left:3px solid var(--red-500);">
          <div class="card-header">
            <h3>⚠️ Alertas (${alertas.length})</h3>
          </div>
          ${alertas.slice(0, 8).map(a => `
            <div class="data-list-item" style="padding:0.4rem 0;">
              <div class="data-list-title">${a.mensaje}</div>
              ${a.finca ? `<span class="badge ${a.badge}">${a.finca}</span>` : `<span class="badge ${a.badge}">Vencida</span>`}
            </div>
          `).join('')}
        </div>
      `;
    }

    // ── Recent Inspecciones ──
    html += `
      <div class="card">
        <div class="card-header">
          <h3>📋 Inspecciones recientes</h3>
        </div>
        ${recentInsp.length === 0 ? '<p class="text-sm text-muted">Sin inspecciones registradas</p>' :
        recentInsp.map(insp => {
          const finca = allFincas.find(f => f.id === insp.finca_id);
          return `
            <div class="data-list-item" style="padding:0.5rem 0;border-bottom:1px solid var(--gray-300);">
              <div class="data-list-left">
                <div class="data-list-title">${insp.titulo || 'Inspección'}</div>
                <div class="data-list-sub">
                  ${finca ? finca.nombre : ''} · ${Format.dateShort(insp.fecha)}
                  ${insp.cultivo_nombre ? ` · ${insp.cultivo_nombre}` : ''}
                </div>
              </div>
              <div class="data-list-right">
                <span class="badge ${insp.estado_general === 'bueno' ? 'badge-green' : insp.estado_general === 'regular' ? 'badge-amber' : insp.estado_general === 'malo' ? 'badge-red' : 'badge-gray'}">
                  ${insp.estado_general || 'N/A'}
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = html;

    // ── 6. Post-render: Map ──
    if (fincasConCoords.length > 0 && typeof L !== 'undefined') {
      initMap(fincasConCoords, lastInspByFinca, today);
    }

    // ── 7. Event listeners ──
    document.getElementById('ing-quick-inspeccion')?.addEventListener('click', () => App.navigateTo('ing-inspecciones'));
    document.getElementById('ing-quick-afiliar')?.addEventListener('click', () => App.navigateTo('ing-agricultores'));
    document.getElementById('ing-quick-chat')?.addEventListener('click', () => App.navigateTo('asistente-ia'));
  }

  // ── Map initialization ──
  function initMap(fincas, lastInspByFinca, today) {
    const mapEl = document.getElementById('ing-dash-map');
    if (!mapEl) return;

    const center = [fincas[0].latitud, fincas[0].longitud];
    map = L.map('ing-dash-map').setView(center, 10);

    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      attribution: '© Google', maxZoom: 22, maxNativeZoom: 20
    }).addTo(map);

    L.control.scale({ imperial: false, metric: true, maxWidth: 200, position: 'bottomleft' }).addTo(map);

    const fourteenDaysAgo = offsetDate(today, -14);
    const thirtyDaysAgo = offsetDate(today, -30);
    const bounds = L.latLngBounds();

    fincas.forEach(f => {
      const last = lastInspByFinca[f.id];
      let color = '#EF5350'; // red > 30 days or no inspection
      let label = 'Sin inspección reciente';

      if (last) {
        if (last.fecha >= fourteenDaysAgo) {
          color = '#4CAF50'; // green < 14 days
          label = `Última: ${Format.dateShort(last.fecha)}`;
        } else if (last.fecha >= thirtyDaysAgo) {
          color = '#FFC107'; // yellow 14-30 days
          label = `Última: ${Format.dateShort(last.fecha)}`;
        } else {
          label = `Última: ${Format.dateShort(last.fecha)}`;
        }
      }

      const marker = L.circleMarker([f.latitud, f.longitud], {
        radius: 10,
        fillColor: color,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.85
      }).addTo(map);

      marker.bindPopup(`
        <strong>${f.nombre}</strong><br>
        <span style="font-size:0.85rem;">${label}</span>
      `);

      bounds.extend([f.latitud, f.longitud]);
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }

  // ── Date helpers ──
  function getWeekStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  function getWeekEnd(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 0 : 7);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  function offsetDate(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  return { render };
})();

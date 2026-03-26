// ============================================
// AgroFinca - Mi Técnico (vista agricultor)
// Citas programadas, visitas, inspecciones del ingeniero
// ============================================

const MiTecnicoModule = (() => {

  async function render(container, fincaId) {
    const userId = AuthModule.getUserId();
    const isOnline = SyncEngine.isOnline() && SupabaseClient.hasSession();

    // Check for affiliation requests - try SERVER first (local may not have them yet)
    let allAfiliaciones = [];
    if (isOnline) {
      try {
        const afResult = await SupabaseClient.select('ingeniero_agricultores', { agricultor_id: userId });
        allAfiliaciones = afResult.ok ? afResult.data : [];
        // Also save to local for offline use
        for (const af of allAfiliaciones) {
          try {
            const exists = await AgroDB.getById('ingeniero_agricultores', af.id);
            if (exists) {
              await AgroDB.update('ingeniero_agricultores', af.id, { ...af, synced: true });
            } else {
              await AgroDB.add('ingeniero_agricultores', { ...af, synced: true });
            }
          } catch(e) {}
        }
      } catch (e) {
        console.warn('[MiTecnico] Server query failed, using local:', e.message);
        allAfiliaciones = await AgroDB.query('ingeniero_agricultores', r => r.agricultor_id === userId);
      }
    } else {
      allAfiliaciones = await AgroDB.query('ingeniero_agricultores', r => r.agricultor_id === userId);
    }

    const pendientes = allAfiliaciones.filter(a => a.estado === 'pendiente');
    const afiliaciones = allAfiliaciones.filter(a => a.estado === 'activo');

    // Resolve engineer names for pending requests (from server since other user's profile)
    const pendientesData = [];
    for (const p of pendientes) {
      let ingNombre = p.notas || 'Ingeniero';
      if (isOnline && p.ingeniero_id) {
        try {
          const profResult = await SupabaseClient.select('user_profiles', { id: p.ingeniero_id });
          if (profResult.ok && profResult.data[0]) {
            ingNombre = profResult.data[0].nombre || profResult.data[0].full_name || profResult.data[0].email || ingNombre;
          }
        } catch (e) { /* use fallback name */ }
      }
      pendientesData.push({ id: p.id, nombre: ingNombre, fecha: p.fecha_afiliacion });
    }

    if (afiliaciones.length === 0 && pendientesData.length === 0) {
      container.innerHTML = `
        <div class="page-header"><h2>Mi Tecnico</h2></div>
        <div class="empty-state">
          <div class="empty-icon">🔬</div>
          <h3>Sin tecnico afiliado</h3>
          <p>Aun no tienes un ingeniero agronomo vinculado a tu cuenta. Cuando un tecnico te afilie, podras ver sus visitas, inspecciones y recomendaciones aqui.</p>
        </div>`;
      return;
    }

    // Build pending requests HTML
    let pendingHTML = '';
    if (pendientesData.length > 0) {
      pendingHTML = pendientesData.map(p => `
        <div class="card" style="border:2px solid var(--amber-500);background:var(--amber-50);margin-bottom:1rem;">
          <h3 style="margin:0 0 0.5rem 0;">Solicitud de afiliacion</h3>
          <p style="margin:0 0 0.75rem 0;">El Ing. <strong>${p.nombre}</strong> quiere afiliarse como tu tecnico agronomo.</p>
          <div class="form-row" style="gap:0.5rem;">
            <button class="btn btn-primary btn-sm btn-aceptar-afiliacion" data-afiliacion-id="${p.id}">Aceptar</button>
            <button class="btn btn-outline btn-sm btn-rechazar-afiliacion" data-afiliacion-id="${p.id}">Rechazar</button>
          </div>
        </div>
      `).join('');
    }

    // If only pending (no active), show pending section and return
    if (afiliaciones.length === 0) {
      container.innerHTML = `
        <div class="page-header"><h2>Mi Tecnico</h2></div>
        ${pendingHTML}`;
      bindPendingButtons(container, fincaId);
      return;
    }

    // Get engineer profiles (from server)
    const ingenieros = [];
    for (const af of afiliaciones) {
      let profile = null;
      if (isOnline) {
        try {
          const profResult2 = await SupabaseClient.select('user_profiles', { id: af.ingeniero_id });
          const profiles = profResult2.ok ? profResult2.data : [];
          profile = profiles?.[0] || null;
        } catch (e) { /* skip */ }
      }
      if (!profile) {
        profile = await AgroDB.getById('user_profiles', af.ingeniero_id);
      }
      if (profile) ingenieros.push({ ...profile, afiliacion: af });
    }

    // Get all data for this agricultor's fincas
    const fincas = fincaId
      ? [await AgroDB.getById('fincas', fincaId)].filter(Boolean)
      : await AgroDB.query('fincas', r => r.propietario_id === userId);
    const fincaIds = fincas.map(f => f.id);

    // Upcoming visits (programacion_inspecciones)
    const hoy = new Date().toISOString().slice(0, 10);
    const allProgramacion = [];
    for (const af of afiliaciones) {
      const prog = await AgroDB.query('programacion_inspecciones',
        r => r.ingeniero_id === af.ingeniero_id && fincaIds.includes(r.finca_id) && r.estado === 'activa');
      allProgramacion.push(...prog);
    }
    const proximasVisitas = allProgramacion
      .filter(p => p.proxima_visita)
      .sort((a, b) => (a.proxima_visita || '').localeCompare(b.proxima_visita || ''));

    // Past visits (visitas_tecnicas)
    const allVisitas = [];
    for (const af of afiliaciones) {
      const vis = await AgroDB.query('visitas_tecnicas',
        r => r.ingeniero_id === af.ingeniero_id && fincaIds.includes(r.finca_id));
      allVisitas.push(...vis);
    }
    allVisitas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    // Inspections by engineer
    const allInspecciones = [];
    for (const af of afiliaciones) {
      const insp = await AgroDB.query('inspecciones',
        r => r.ingeniero_id === af.ingeniero_id && fincaIds.includes(r.finca_id));
      allInspecciones.push(...insp);
    }
    allInspecciones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    // Prescriptions
    const allPrescripciones = [];
    for (const af of afiliaciones) {
      const presc = await AgroDB.query('prescripciones',
        r => r.ingeniero_id === af.ingeniero_id && fincaIds.includes(r.finca_id));
      allPrescripciones.push(...presc);
    }
    const prescActivas = allPrescripciones.filter(p => p.estado === 'pendiente' || p.estado === 'en_ejecucion');

    // Build tabs HTML
    container.innerHTML = `
      <div class="page-header">
        <h2>Mi Tecnico</h2>
      </div>

      ${pendingHTML}

      <!-- Engineer info card -->
      ${ingenieros.map(ing => `
        <div class="card" style="border-left:4px solid var(--green-600);margin-bottom:1rem;">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <div style="width:48px;height:48px;border-radius:50%;background:var(--green-100);display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🔬</div>
            <div>
              <h3 style="margin:0;">${ing.nombre || ing.email || 'Ingeniero'}</h3>
              <div class="text-sm text-muted">${ing.especialidad || 'Ingeniero Agrónomo'}</div>
              ${ing.registro_profesional ? `<div class="text-sm text-muted">Reg. ${ing.registro_profesional}</div>` : ''}
              <div class="text-sm text-muted">Afiliado desde ${ing.afiliacion.fecha_afiliacion ? new Date(ing.afiliacion.fecha_afiliacion).toLocaleDateString() : 'Reciente'}</div>
            </div>
            <button class="btn btn-sm btn-primary" style="margin-left:auto;" onclick="App.navigateTo('ing-chat')">💬 Chat</button>
          </div>
        </div>
      `).join('')}

      <!-- Tabs -->
      <div class="form-row" style="gap:0;border-bottom:2px solid var(--gray-300);margin-bottom:1rem;">
        <button class="btn btn-sm btn-outline mi-tec-tab active" data-tab="proximas" style="border-radius:8px 8px 0 0;">📅 Próximas visitas (${proximasVisitas.length})</button>
        <button class="btn btn-sm btn-outline mi-tec-tab" data-tab="historial" style="border-radius:8px 8px 0 0;">📋 Historial visitas (${allVisitas.length})</button>
        <button class="btn btn-sm btn-outline mi-tec-tab" data-tab="inspecciones" style="border-radius:8px 8px 0 0;">🔬 Inspecciones (${allInspecciones.length})</button>
        <button class="btn btn-sm btn-outline mi-tec-tab" data-tab="recetas" style="border-radius:8px 8px 0 0;">💊 Recetas (${prescActivas.length})</button>
      </div>

      <!-- Tab: Próximas visitas -->
      <div class="mi-tec-panel" id="mi-tec-proximas">
        ${proximasVisitas.length === 0 ? '<p class="text-sm text-muted">No hay visitas programadas.</p>' :
          proximasVisitas.map(p => {
            const finca = fincas.find(f => f.id === p.finca_id);
            const diasFalta = Math.ceil((new Date(p.proxima_visita) - new Date(hoy)) / 86400000);
            const badge = diasFalta <= 0 ? 'badge-red' : diasFalta <= 3 ? 'badge-amber' : 'badge-green';
            const label = diasFalta <= 0 ? 'Hoy / Atrasada' : diasFalta === 1 ? 'Mañana' : `En ${diasFalta} días`;
            return `
              <div class="card" style="margin-bottom:0.5rem;border-left:3px solid ${diasFalta <= 0 ? 'var(--red-500)' : diasFalta <= 3 ? 'var(--yellow-500)' : 'var(--green-500)'};">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div class="text-sm" style="font-weight:600;">📅 ${p.proxima_visita}</div>
                    <div class="text-sm text-muted">🏡 ${finca?.nombre || 'Finca'} · ${p.frecuencia || 'programada'}</div>
                  </div>
                  <span class="badge ${badge}">${label}</span>
                </div>
              </div>`;
          }).join('')}
      </div>

      <!-- Tab: Historial visitas -->
      <div class="mi-tec-panel" id="mi-tec-historial" style="display:none;">
        ${allVisitas.length === 0 ? '<p class="text-sm text-muted">No hay visitas registradas.</p>' :
          allVisitas.slice(0, 30).map(v => {
            const finca = fincas.find(f => f.id === v.finca_id);
            const duracion = v.hora_llegada && v.hora_salida
              ? `${v.hora_llegada} - ${v.hora_salida}`
              : v.hora_llegada ? `Llegó: ${v.hora_llegada}` : '';
            return `
              <div class="card" style="margin-bottom:0.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div class="text-sm" style="font-weight:600;">📅 ${v.fecha}</div>
                    <div class="text-sm text-muted">🏡 ${finca?.nombre || 'Finca'} · ${v.tipo || 'Visita'}</div>
                    ${duracion ? `<div class="text-sm text-muted">🕐 ${duracion}</div>` : ''}
                    ${v.resumen ? `<div class="text-sm" style="margin-top:0.25rem;">${v.resumen}</div>` : ''}
                  </div>
                  <span class="badge badge-green">✅</span>
                </div>
              </div>`;
          }).join('')}
      </div>

      <!-- Tab: Inspecciones del técnico -->
      <div class="mi-tec-panel" id="mi-tec-inspecciones" style="display:none;">
        ${allInspecciones.length === 0 ? '<p class="text-sm text-muted">No hay inspecciones del técnico.</p>' :
          allInspecciones.slice(0, 30).map(i => {
            const estadoColor = i.estado_general === 'bueno' ? 'badge-green' :
              i.estado_general === 'regular' ? 'badge-amber' : 'badge-red';
            return `
              <div class="card" style="margin-bottom:0.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div class="text-sm" style="font-weight:600;">🔬 ${i.fecha} · ${i.area_nombre || ''}</div>
                    <div class="text-sm text-muted">${i.cultivo_nombre || ''} · ${i.tipo || 'General'}</div>
                    ${i.plagas ? `<div class="text-sm" style="color:var(--red-600);">🐛 ${i.plagas}</div>` : ''}
                    ${i.enfermedades ? `<div class="text-sm" style="color:var(--red-600);">🦠 ${i.enfermedades}</div>` : ''}
                    ${i.recomendaciones ? `<div class="text-sm" style="color:var(--green-700);">💡 ${i.recomendaciones}</div>` : ''}
                  </div>
                  <span class="badge ${estadoColor}">${i.estado_general || 'N/A'}</span>
                </div>
              </div>`;
          }).join('')}
      </div>

      <!-- Tab: Recetas/Prescripciones activas -->
      <div class="mi-tec-panel" id="mi-tec-recetas" style="display:none;">
        ${prescActivas.length === 0 ? '<p class="text-sm text-muted">No hay recetas activas.</p>' :
          prescActivas.map(p => {
            const finca = fincas.find(f => f.id === p.finca_id);
            const estadoBadge = p.estado === 'pendiente' ? 'badge-amber' : 'badge-green';
            return `
              <div class="card" style="margin-bottom:0.5rem;border-left:3px solid ${p.estado === 'pendiente' ? 'var(--yellow-500)' : 'var(--green-500)'};">
                <div>
                  <div class="text-sm" style="font-weight:600;">💊 ${p.producto}</div>
                  <div class="text-sm text-muted">🏡 ${finca?.nombre || ''} · Dosis: ${p.dosis || ''} ${p.unidad_dosis || ''}</div>
                  <div class="text-sm text-muted">Método: ${p.metodo_aplicacion || 'N/A'} · Cada ${p.intervalo_dias || '?'} días · ${p.num_aplicaciones || 1} aplicaciones</div>
                  ${p.carencia_dias ? `<div class="text-sm text-muted">⚠️ Carencia: ${p.carencia_dias} días antes de cosecha</div>` : ''}
                  ${p.precauciones ? `<div class="text-sm" style="color:var(--red-600);">🛡️ ${p.precauciones}</div>` : ''}
                  <div style="margin-top:0.5rem;">
                    <span class="badge ${estadoBadge}">${p.estado}</span>
                  </div>
                </div>
              </div>`;
          }).join('')}
      </div>
    `;

    // Tab switching
    container.querySelectorAll('.mi-tec-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.mi-tec-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.mi-tec-panel').forEach(p => p.style.display = 'none');
        tab.classList.add('active');
        const panel = document.getElementById(`mi-tec-${tab.dataset.tab}`);
        if (panel) panel.style.display = 'block';
      });
    });

    // Bind pending affiliation buttons
    bindPendingButtons(container, fincaId);
  }

  function bindPendingButtons(container, fincaId) {
    container.querySelectorAll('.btn-aceptar-afiliacion').forEach(btn => {
      btn.addEventListener('click', async () => {
        const afId = btn.dataset.afiliacionId;
        try {
          await AgroDB.update('ingeniero_agricultores', afId, {
            estado: 'activo',
            fecha_afiliacion: new Date().toISOString()
          });
          App.showToast('Afiliacion aceptada', 'success');
          render(container, fincaId);
        } catch (e) {
          App.showToast('Error al aceptar: ' + e.message, 'error');
        }
      });
    });

    container.querySelectorAll('.btn-rechazar-afiliacion').forEach(btn => {
      btn.addEventListener('click', async () => {
        const afId = btn.dataset.afiliacionId;
        try {
          await AgroDB.update('ingeniero_agricultores', afId, {
            estado: 'rechazado'
          });
          App.showToast('Afiliacion rechazada', 'info');
          render(container, fincaId);
        } catch (e) {
          App.showToast('Error al rechazar: ' + e.message, 'error');
        }
      });
    });
  }

  return { render };
})();

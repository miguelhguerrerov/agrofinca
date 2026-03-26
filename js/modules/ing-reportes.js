// ============================================
// AgroFinca - Ingeniero Reportes Module
// Report generation: inspections, trials,
// portfolio, yield, and sales reports
// Print-ready HTML in new window
// ============================================

const IngReportesModule = (() => {

  const REPORT_TYPES = [
    {
      key: 'inspeccion',
      title: 'Reporte de Inspeccion Fitosanitaria',
      icon: '🔬',
      description: 'Resumen completo de una inspeccion: datos de finca, protocolo, cuadricula de datos, resultados, fotos y recomendaciones.'
    },
    {
      key: 'ensayo',
      title: 'Reporte de Ensayo Comparativo',
      icon: '🧪',
      description: 'Detalle de un ensayo con tratamientos, evaluaciones, tabla comparativa y conclusiones.'
    },
    {
      key: 'cartera',
      title: 'Reporte de Estado de Cartera',
      icon: '👥',
      description: 'Estado de todos los agricultores afiliados: fincas, superficie, ultima inspeccion y semaforo de estado.'
    },
    {
      key: 'rendimiento',
      title: 'Reporte de Rendimiento Tecnico',
      icon: '📊',
      description: 'Comparativa de rendimiento por cultivo entre fincas: area, t/ha, referencia y porcentaje.'
    },
    {
      key: 'ventas_insumos',
      title: 'Reporte de Ventas de Insumos',
      icon: '🛒',
      description: 'Resumen de ventas por periodo: agricultor, productos vendidos, totales, cobrado vs pendiente.'
    }
  ];

  // ── Render entry point ──────────────────────
  async function render(container) {
    const userId = AuthModule.getUserId();
    const user = AuthModule.getUser();
    const userName = user?.nombre || user?.email || 'Ingeniero';

    container.innerHTML = `
      <div class="page-header">
        <h2>📋 Reportes</h2>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;">
        ${REPORT_TYPES.map(rt => `
          <div class="card" style="cursor:default;">
            <div style="font-size:2rem;margin-bottom:0.5rem;">${rt.icon}</div>
            <div class="card-title">${rt.title}</div>
            <p style="font-size:0.85rem;color:var(--gray-600);margin-bottom:1rem;">${rt.description}</p>
            <button class="btn btn-primary btn-sm btn-generar-reporte" data-type="${rt.key}">Generar</button>
          </div>
        `).join('')}
      </div>
    `;

    // Bind buttons
    container.querySelectorAll('.btn-generar-reporte').forEach(btn => {
      btn.addEventListener('click', () => showReportConfig(btn.dataset.type, userId, userName, container));
    });
  }

  // ── Report configuration modal ──────────────
  async function showReportConfig(type, userId, userName, container) {
    let body = '';
    const reportInfo = REPORT_TYPES.find(r => r.key === type);

    switch (type) {
      case 'inspeccion': {
        const inspecciones = await loadInspecciones(userId);
        body = `
          <div class="form-group">
            <label>Seleccionar inspeccion</label>
            <select id="rpt-inspeccion-id">
              <option value="">-- Seleccionar --</option>
              ${inspecciones.map(i => `<option value="${i.id}">${Format.date(i.fecha)} - ${i.finca_nombre || 'Finca'} - ${i.tipo || ''}</option>`).join('')}
            </select>
          </div>
        `;
        break;
      }
      case 'ensayo': {
        const ensayos = await loadEnsayos(userId);
        body = `
          <div class="form-group">
            <label>Seleccionar ensayo</label>
            <select id="rpt-ensayo-id">
              <option value="">-- Seleccionar --</option>
              ${ensayos.map(e => `<option value="${e.id}">${e.nombre || e.titulo || 'Ensayo'} - ${Format.date(e.fecha_inicio)}</option>`).join('')}
            </select>
          </div>
        `;
        break;
      }
      case 'cartera':
        body = `<p style="color:var(--gray-600);">Este reporte se genera automaticamente con todos los agricultores afiliados. No requiere seleccion adicional.</p>`;
        break;
      case 'rendimiento': {
        const cultivos = await loadCultivosUnicos(userId);
        body = `
          <div class="form-group">
            <label>Cultivo a comparar</label>
            <select id="rpt-cultivo">
              <option value="">-- Seleccionar cultivo --</option>
              ${cultivos.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        `;
        break;
      }
      case 'ventas_insumos':
        body = `
          <div class="form-group">
            <label>Periodo</label>
            <select id="rpt-periodo">
              <option value="mes">Mes actual</option>
              <option value="trimestre">Ultimo trimestre</option>
              <option value="anio">Ultimo ano</option>
            </select>
          </div>
        `;
        break;
    }

    App.showModal(`${reportInfo.icon} ${reportInfo.title}`, body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-gen-report">🖨 Generar</button>`
    );

    document.getElementById('btn-gen-report').addEventListener('click', async () => {
      const params = {};
      switch (type) {
        case 'inspeccion':
          params.inspeccionId = document.getElementById('rpt-inspeccion-id')?.value;
          if (!params.inspeccionId) { App.showToast('Selecciona una inspeccion', 'warning'); return; }
          break;
        case 'ensayo':
          params.ensayoId = document.getElementById('rpt-ensayo-id')?.value;
          if (!params.ensayoId) { App.showToast('Selecciona un ensayo', 'warning'); return; }
          break;
        case 'rendimiento':
          params.cultivo = document.getElementById('rpt-cultivo')?.value;
          if (!params.cultivo) { App.showToast('Selecciona un cultivo', 'warning'); return; }
          break;
        case 'ventas_insumos':
          params.periodo = document.getElementById('rpt-periodo')?.value || 'mes';
          break;
      }

      App.closeModal();
      await generateReport(type, params, userId, userName);
    });
  }

  // ── Data loaders ────────────────────────────

  async function getAfiliaciones(userId) {
    return AgroDB.query('ingeniero_agricultores', r => r.ingeniero_id === userId && r.estado === 'activo');
  }

  async function getFincasForAgricultor(agId) {
    return AgroDB.getByIndex('fincas', 'propietario_id', agId);
  }

  async function loadInspecciones(userId) {
    const afiliaciones = await getAfiliaciones(userId);
    const allInspecciones = [];
    for (const af of afiliaciones) {
      const fincas = await getFincasForAgricultor(af.agricultor_id);
      for (const finca of fincas) {
        const insps = await AgroDB.query('inspecciones', r => r.finca_id === finca.id);
        insps.forEach(i => { i.finca_nombre = finca.nombre; });
        allInspecciones.push(...insps);
      }
    }
    return allInspecciones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }

  async function loadEnsayos(userId) {
    let ensayos = [];
    try { ensayos = await AgroDB.query('ensayos', r => r.ingeniero_id === userId); } catch(e) {}
    return ensayos.sort((a, b) => (b.fecha_inicio || '').localeCompare(a.fecha_inicio || ''));
  }

  async function loadCultivosUnicos(userId) {
    const afiliaciones = await getAfiliaciones(userId);
    const nombres = new Set();
    for (const af of afiliaciones) {
      const fincas = await getFincasForAgricultor(af.agricultor_id);
      for (const finca of fincas) {
        const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', finca.id);
        cultivos.forEach(c => { if (c.nombre) nombres.add(c.nombre); });
      }
    }
    return [...nombres].sort();
  }

  // ── Report generation ───────────────────────

  async function generateReport(type, params, userId, userName) {
    let reportHTML = '';

    switch (type) {
      case 'inspeccion':
        reportHTML = await buildInspeccionReport(params.inspeccionId, userId, userName);
        break;
      case 'ensayo':
        reportHTML = await buildEnsayoReport(params.ensayoId, userId, userName);
        break;
      case 'cartera':
        reportHTML = await buildCarteraReport(userId, userName);
        break;
      case 'rendimiento':
        reportHTML = await buildRendimientoReport(params.cultivo, userId, userName);
        break;
      case 'ventas_insumos':
        reportHTML = await buildVentasReport(params.periodo, userId, userName);
        break;
    }

    openPrintWindow(reportHTML);
  }

  // ── 1. Inspeccion Fitosanitaria ─────────────
  async function buildInspeccionReport(inspeccionId, userId, userName) {
    const insp = await AgroDB.getById('inspecciones', inspeccionId);
    if (!insp) return '<p>Inspeccion no encontrada</p>';

    let finca = null;
    try { finca = await AgroDB.getById('fincas', insp.finca_id); } catch(e) {}

    // Load datos, resultados, recomendaciones
    let datos = [];
    try { datos = await AgroDB.query('inspecciones_datos', r => r.inspeccion_id === inspeccionId); } catch(e) {}
    let resultados = insp.resultados || insp.observaciones || '';
    let recomendaciones = insp.recomendaciones || '';
    let fotos = insp.fotos || [];

    // Protocol
    let protocolo = null;
    if (insp.protocolo_id) {
      try { protocolo = await AgroDB.getById('protocolos_inspeccion', insp.protocolo_id); } catch(e) {}
    }

    return `
      <h1>Reporte de Inspeccion Fitosanitaria</h1>
      <h2>${finca?.nombre || 'Finca'}</h2>

      <table class="rpt-table">
        <tr><th>Fecha</th><td>${Format.date(insp.fecha)}</td><th>Inspector</th><td>${userName}</td></tr>
        <tr><th>Tipo</th><td>${insp.tipo || '-'}</td><th>Protocolo</th><td>${protocolo?.nombre || insp.protocolo || '-'}</td></tr>
        ${finca ? `<tr><th>Ubicacion</th><td>${finca.ubicacion || finca.municipio || '-'}</td><th>Area</th><td>${finca.area_total || '-'} ha</td></tr>` : ''}
      </table>

      ${datos.length > 0 ? `
        <h3>Datos Recopilados</h3>
        <table class="rpt-table">
          <thead><tr><th>Variable</th><th>Valor</th><th>Unidad</th><th>Observacion</th></tr></thead>
          <tbody>
            ${datos.map(d => `<tr><td>${d.variable || d.nombre || ''}</td><td>${d.valor || ''}</td><td>${d.unidad || ''}</td><td>${d.observacion || ''}</td></tr>`).join('')}
          </tbody>
        </table>
      ` : ''}

      ${resultados ? `<h3>Resultados</h3><p>${resultados}</p>` : ''}
      ${recomendaciones ? `<h3>Recomendaciones</h3><p>${recomendaciones}</p>` : ''}

      ${fotos.length > 0 ? `
        <h3>Evidencia Fotografica</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${fotos.map(f => `<img src="${f.url || f}" style="max-width:200px;max-height:150px;border:1px solid #ddd;border-radius:4px;" alt="Foto">`).join('')}
        </div>
      ` : ''}
    `;
  }

  // ── 2. Ensayo Comparativo ───────────────────
  async function buildEnsayoReport(ensayoId, userId, userName) {
    let ensayo = null;
    try { ensayo = await AgroDB.getById('ensayos', ensayoId); } catch(e) {}
    if (!ensayo) return '<p>Ensayo no encontrado</p>';

    let tratamientos = [];
    try { tratamientos = await AgroDB.query('ensayos_tratamientos', r => r.ensayo_id === ensayoId); } catch(e) {}

    let evaluaciones = [];
    try { evaluaciones = await AgroDB.query('ensayos_evaluaciones', r => r.ensayo_id === ensayoId); } catch(e) {}
    evaluaciones.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

    return `
      <h1>Reporte de Ensayo Comparativo</h1>
      <h2>${ensayo.nombre || ensayo.titulo || 'Ensayo'}</h2>

      <table class="rpt-table">
        <tr><th>Fecha inicio</th><td>${Format.date(ensayo.fecha_inicio)}</td><th>Fecha fin</th><td>${ensayo.fecha_fin ? Format.date(ensayo.fecha_fin) : 'En curso'}</td></tr>
        <tr><th>Objetivo</th><td colspan="3">${ensayo.objetivo || '-'}</td></tr>
        <tr><th>Responsable</th><td colspan="3">${userName}</td></tr>
      </table>

      ${tratamientos.length > 0 ? `
        <h3>Tratamientos</h3>
        <table class="rpt-table">
          <thead><tr><th>#</th><th>Tratamiento</th><th>Descripcion</th><th>Dosis</th></tr></thead>
          <tbody>
            ${tratamientos.map((t, i) => `<tr><td>${i + 1}</td><td>${t.nombre || ''}</td><td>${t.descripcion || ''}</td><td>${t.dosis || ''}</td></tr>`).join('')}
          </tbody>
        </table>
      ` : ''}

      ${evaluaciones.length > 0 ? `
        <h3>Evaluaciones</h3>
        <table class="rpt-table">
          <thead><tr><th>Fecha</th><th>Tratamiento</th><th>Variable</th><th>Valor</th><th>Observacion</th></tr></thead>
          <tbody>
            ${evaluaciones.map(ev => {
              const trat = tratamientos.find(t => t.id === ev.tratamiento_id);
              return `<tr><td>${Format.date(ev.fecha)}</td><td>${trat?.nombre || ''}</td><td>${ev.variable || ''}</td><td>${ev.valor || ''}</td><td>${ev.observacion || ''}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : ''}

      ${tratamientos.length > 0 ? `
        <h3>Tabla Comparativa</h3>
        <table class="rpt-table">
          <thead><tr><th>Tratamiento</th><th>Evaluaciones</th><th>Promedio</th><th>Min</th><th>Max</th></tr></thead>
          <tbody>
            ${tratamientos.map(t => {
              const tevs = evaluaciones.filter(e => e.tratamiento_id === t.id);
              const vals = tevs.map(e => parseFloat(e.valor)).filter(v => !isNaN(v));
              const avg = vals.length > 0 ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : '-';
              const min = vals.length > 0 ? Math.min(...vals).toFixed(2) : '-';
              const max = vals.length > 0 ? Math.max(...vals).toFixed(2) : '-';
              return `<tr><td>${t.nombre || ''}</td><td>${tevs.length}</td><td>${avg}</td><td>${min}</td><td>${max}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : ''}

      ${ensayo.conclusiones ? `<h3>Conclusiones</h3><p>${ensayo.conclusiones}</p>` : ''}
    `;
  }

  // ── 3. Estado de Cartera ────────────────────
  async function buildCarteraReport(userId, userName) {
    const afiliaciones = await getAfiliaciones(userId);
    const rows = [];

    for (const af of afiliaciones) {
      const profile = await AgroDB.getById('user_profiles', af.agricultor_id);
      const fincas = await getFincasForAgricultor(af.agricultor_id);
      const fincaNames = fincas.map(f => f.nombre).join(', ') || '-';
      const totalArea = fincas.reduce((s, f) => s + (f.area_total || 0), 0);

      // Last inspection across all fincas
      let lastInsp = null;
      for (const finca of fincas) {
        const insps = await AgroDB.query('inspecciones', r => r.finca_id === finca.id);
        const sorted = insps.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        if (sorted.length > 0 && (!lastInsp || sorted[0].fecha > lastInsp.fecha)) {
          lastInsp = sorted[0];
        }
      }

      // Semaforo: green < 30 days, yellow 30-60, red > 60 or no inspection
      const today = new Date(DateUtils.today());
      let statusColor = '#e53935'; // red
      let statusLabel = 'Sin inspeccion';
      if (lastInsp?.fecha) {
        const daysSince = Math.floor((today - new Date(lastInsp.fecha)) / (1000 * 60 * 60 * 24));
        if (daysSince <= 30) { statusColor = '#43a047'; statusLabel = `${daysSince}d`; }
        else if (daysSince <= 60) { statusColor = '#f9a825'; statusLabel = `${daysSince}d`; }
        else { statusColor = '#e53935'; statusLabel = `${daysSince}d`; }
      }

      rows.push({
        agricultor: profile?.nombre || profile?.email || af.agricultor_id,
        fincas: fincaNames,
        superficie: totalArea,
        ultimaInsp: lastInsp ? Format.date(lastInsp.fecha) : '-',
        statusColor,
        statusLabel
      });
    }

    return `
      <h1>Reporte de Estado de Cartera</h1>
      <p>Agricultores afiliados: ${rows.length}</p>

      <table class="rpt-table">
        <thead>
          <tr><th>Agricultor</th><th>Fincas</th><th>Superficie (ha)</th><th>Ultima inspeccion</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.agricultor}</td>
              <td>${r.fincas}</td>
              <td style="text-align:right;">${r.superficie.toFixed(1)}</td>
              <td>${r.ultimaInsp}</td>
              <td><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${r.statusColor};margin-right:4px;vertical-align:middle;"></span>${r.statusLabel}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // ── 4. Rendimiento Tecnico ──────────────────
  async function buildRendimientoReport(cultivoNombre, userId, userName) {
    const afiliaciones = await getAfiliaciones(userId);
    const rows = [];
    const allYields = [];

    for (const af of afiliaciones) {
      const profile = await AgroDB.getById('user_profiles', af.agricultor_id);
      const fincas = await getFincasForAgricultor(af.agricultor_id);

      for (const finca of fincas) {
        const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', finca.id);
        const matching = cultivos.filter(c => c.nombre === cultivoNombre);

        for (const cult of matching) {
          // Get production data (cosechas)
          let cosechas = [];
          try { cosechas = await AgroDB.query('cosechas', r => r.cultivo_id === cult.id || r.finca_id === finca.id); } catch(e) {}
          cosechas = cosechas.filter(c => (c.cultivo_nombre === cultivoNombre) || (c.cultivo_id === cult.id));
          const totalProd = cosechas.reduce((s, c) => s + (c.cantidad || 0), 0);

          const area = cult.area || finca.area_total || 1;
          const tHa = area > 0 ? totalProd / 1000 / area : 0; // assume kg to t

          allYields.push(tHa);

          rows.push({
            finca: finca.nombre,
            agricultor: profile?.nombre || '',
            area: area,
            totalProd,
            tHa
          });
        }
      }
    }

    // Reference (average)
    const avgYield = allYields.length > 0 ? allYields.reduce((s, v) => s + v, 0) / allYields.length : 0;

    return `
      <h1>Reporte de Rendimiento Tecnico</h1>
      <h2>Cultivo: ${cultivoNombre}</h2>
      <p>Rendimiento promedio de referencia: ${avgYield.toFixed(2)} t/ha</p>

      <table class="rpt-table">
        <thead>
          <tr><th>Finca</th><th>Agricultor</th><th>Area (ha)</th><th>t/ha</th><th>Ref. (t/ha)</th><th>%</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const pct = avgYield > 0 ? (r.tHa / avgYield * 100) : 0;
            let status = '🟢';
            if (pct < 70) status = '🔴';
            else if (pct < 90) status = '🟡';
            return `
              <tr>
                <td>${r.finca}</td>
                <td>${r.agricultor}</td>
                <td style="text-align:right;">${r.area.toFixed(1)}</td>
                <td style="text-align:right;">${r.tHa.toFixed(2)}</td>
                <td style="text-align:right;">${avgYield.toFixed(2)}</td>
                <td style="text-align:right;">${pct.toFixed(0)}%</td>
                <td style="text-align:center;">${status}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      ${rows.length === 0 ? '<p style="color:#999;">No se encontraron datos de produccion para este cultivo.</p>' : ''}
    `;
  }

  // ── 5. Ventas de Insumos ────────────────────
  async function buildVentasReport(periodo, userId, userName) {
    const today = DateUtils.today();
    let fechaDesde = '';

    switch (periodo) {
      case 'mes': {
        const month = DateUtils.currentMonthRange();
        fechaDesde = month.start;
        break;
      }
      case 'trimestre': {
        const d = new Date(today);
        d.setMonth(d.getMonth() - 3);
        fechaDesde = d.toISOString().split('T')[0];
        break;
      }
      case 'anio': {
        const d = new Date(today);
        d.setFullYear(d.getFullYear() - 1);
        fechaDesde = d.toISOString().split('T')[0];
        break;
      }
    }

    const ventas = await AgroDB.query('ventas_insumos', r =>
      r.ingeniero_id === userId && r.fecha >= fechaDesde
    );

    // Load detail for each sale
    const agricultorNames = {};
    const rows = [];

    for (const v of ventas) {
      if (v.agricultor_id && !agricultorNames[v.agricultor_id]) {
        const profile = await AgroDB.getById('user_profiles', v.agricultor_id);
        if (profile) agricultorNames[v.agricultor_id] = profile.nombre || profile.email || v.agricultor_id;
      }

      let detalles = [];
      try { detalles = await AgroDB.query('ventas_insumos_detalle', r => r.venta_id === v.id); } catch(e) {}
      const productos = detalles.map(d => d.producto_nombre || 'Producto').join(', ') || '-';

      rows.push({
        agricultor: agricultorNames[v.agricultor_id] || 'Agricultor',
        fecha: v.fecha,
        productos,
        total: v.total || 0,
        cobrado: v.cobrado
      });
    }

    rows.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const totalVendido = rows.reduce((s, r) => s + r.total, 0);
    const totalCobrado = rows.filter(r => r.cobrado).reduce((s, r) => s + r.total, 0);
    const totalPendiente = totalVendido - totalCobrado;

    const periodoLabel = periodo === 'mes' ? 'Mes actual' : periodo === 'trimestre' ? 'Ultimo trimestre' : 'Ultimo ano';

    return `
      <h1>Reporte de Ventas de Insumos</h1>
      <h2>Periodo: ${periodoLabel}</h2>

      <table class="rpt-table" style="width:auto;margin-bottom:1rem;">
        <tr><th>Total vendido</th><td style="text-align:right;font-weight:bold;">${Format.money(totalVendido)}</td></tr>
        <tr><th>Cobrado</th><td style="text-align:right;color:#2e7d32;">${Format.money(totalCobrado)}</td></tr>
        <tr><th>Pendiente</th><td style="text-align:right;color:#c62828;">${Format.money(totalPendiente)}</td></tr>
      </table>

      <table class="rpt-table">
        <thead>
          <tr><th>Agricultor</th><th>Fecha</th><th>Productos</th><th style="text-align:right;">Total</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.agricultor}</td>
              <td>${Format.date(r.fecha)}</td>
              <td>${r.productos}</td>
              <td style="text-align:right;">${Format.money(r.total)}</td>
              <td>${r.cobrado
                ? '<span style="color:#2e7d32;">Cobrado</span>'
                : '<span style="color:#c62828;">Pendiente</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${rows.length === 0 ? '<p style="color:#999;">No se encontraron ventas en este periodo.</p>' : ''}
    `;
  }

  // ── Open print window ───────────────────────
  function openPrintWindow(contentHTML) {
    const today = DateUtils.today();
    const user = AuthModule.getUser();
    const userName = user?.nombre || user?.email || 'Ingeniero';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte AgroFinca</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      @page { margin: 1.5cm; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      font-size: 14px;
      line-height: 1.5;
    }
    .rpt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #2e7d32;
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    .rpt-header-logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: #2e7d32;
    }
    .rpt-header-meta {
      text-align: right;
      font-size: 0.85rem;
      color: #666;
    }
    h1 { font-size: 1.4rem; color: #2e7d32; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; color: #555; margin-top: 0; }
    h3 { font-size: 1rem; color: #2e7d32; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; margin-top: 1.5rem; }
    .rpt-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1rem;
      font-size: 0.85rem;
    }
    .rpt-table th, .rpt-table td {
      border: 1px solid #ddd;
      padding: 6px 10px;
      text-align: left;
    }
    .rpt-table th {
      background: #f5f5f5;
      font-weight: 600;
      white-space: nowrap;
    }
    .rpt-table tbody tr:nth-child(even) { background: #fafafa; }
    .rpt-footer {
      border-top: 2px solid #e0e0e0;
      margin-top: 2rem;
      padding-top: 0.75rem;
      text-align: center;
      font-size: 0.8rem;
      color: #999;
    }
    .btn-print {
      position: fixed;
      top: 1rem;
      right: 1rem;
      background: #2e7d32;
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
    }
    .btn-print:hover { background: #1b5e20; }
  </style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">🖨 Imprimir</button>

  <div class="rpt-header">
    <div class="rpt-header-logo">🌱 AgroFinca</div>
    <div class="rpt-header-meta">
      <div>${userName}</div>
      <div>Fecha: ${Format.date(today)}</div>
    </div>
  </div>

  ${contentHTML}

  <div class="rpt-footer">
    Generado por AgroFinca &middot; ${Format.date(today)}
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    } else {
      App.showToast('No se pudo abrir la ventana de impresion. Verifica el bloqueador de pop-ups.', 'warning');
    }
  }

  return { render };
})();

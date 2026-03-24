// ============================================
// AgroFinca - AI Data Helpers
// Aggregates IndexedDB data into compact summaries
// for sending to Gemini as context (<2000 tokens)
// ============================================

const AIDataHelpers = (() => {

  // Full farm summary
  async function getFarmSummary(fincaId) {
    try {
      const finca = await AgroDB.getById('fincas', fincaId);
      const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
      const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
      const ciclos = await AgroDB.getByIndex('ciclos_productivos', 'finca_id', fincaId);
      const activos = ciclos.filter(c => c.estado === 'activo');

      return {
        finca: finca?.nombre || '',
        ubicacion: finca?.ubicacion || '',
        area_total_m2: finca?.area_total_m2 || 0,
        sistema_riego: finca?.sistema_riego || 'no especificado',
        areas: areas.map(a => ({ nombre: a.nombre, tipo: a.tipo, m2: a.area_m2, cultivo: a.cultivo_actual_nombre })),
        cultivos: cultivos.map(c => ({ nombre: c.nombre, tipo: c.tipo, ciclo_dias: c.ciclo_dias })),
        ciclos_activos: activos.map(c => ({
          cultivo: c.cultivo_nombre, area: c.area_nombre,
          inicio: c.fecha_inicio, estado: c.estado
        })),
        total_ciclos: ciclos.length,
        total_areas: areas.length
      };
    } catch { return {}; }
  }

  // Per-crop statistics
  async function getCropStats(fincaId) {
    try {
      const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
      const ciclos = await AgroDB.getByIndex('ciclos_productivos', 'finca_id', fincaId);
      const cosechas = await AgroDB.getByIndex('cosechas', 'finca_id', fincaId);
      const ventas = await AgroDB.getByIndex('ventas', 'finca_id', fincaId);
      const costos = await AgroDB.getByIndex('costos', 'finca_id', fincaId);
      const inspecciones = await AgroDB.getByIndex('inspecciones', 'finca_id', fincaId);

      return cultivos.map(c => {
        const cCiclos = ciclos.filter(x => x.cultivo_id === c.id);
        const cCosechas = cosechas.filter(x => x.cultivo_id === c.id);
        const cVentas = ventas.filter(x => x.cultivo_id === c.id);
        const cCostos = costos.filter(x => x.cultivo_id === c.id);
        const cInsp = inspecciones.filter(x => x.cultivo_id === c.id || x.cultivo_nombre === c.nombre);

        return {
          nombre: c.nombre,
          tipo: c.tipo,
          ciclos_total: cCiclos.length,
          ciclos_activos: cCiclos.filter(x => x.estado === 'activo').length,
          cosechas_total: cCosechas.reduce((s, x) => s + (x.cantidad || 0), 0),
          ventas_total: cVentas.reduce((s, x) => s + (x.total || 0), 0),
          costos_total: cCostos.reduce((s, x) => s + (x.total || 0), 0),
          margen: cVentas.reduce((s, x) => s + (x.total || 0), 0) - cCostos.reduce((s, x) => s + (x.total || 0), 0),
          inspecciones: cInsp.length,
          ultima_inspeccion: cInsp.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]?.fecha || null,
          problemas: [...new Set(cInsp.filter(i => i.plagas_detectadas || i.enfermedades_detectadas)
            .flatMap(i => [i.plagas_detectadas, i.enfermedades_detectadas].filter(Boolean)))]
        };
      });
    } catch { return []; }
  }

  // Per-area statistics
  async function getAreaStats(fincaId) {
    try {
      const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
      const inspecciones = await AgroDB.getByIndex('inspecciones', 'finca_id', fincaId);
      const fitosanitario = await AgroDB.getByIndex('aplicaciones_fitosanitarias', 'finca_id', fincaId);
      const costos = await AgroDB.getByIndex('costos', 'finca_id', fincaId);

      return areas.map(a => {
        const aInsp = inspecciones.filter(x => x.area_id === a.id);
        const aFito = fitosanitario.filter(x => x.area_id === a.id);
        const aCostos = costos.filter(x => x.area_id === a.id);

        return {
          nombre: a.nombre,
          tipo: a.tipo,
          m2: a.area_m2,
          cultivo_actual: a.cultivo_actual_nombre,
          inspecciones: aInsp.length,
          aplicaciones_fito: aFito.length,
          costos_total: aCostos.reduce((s, x) => s + (x.total || 0), 0),
          ultimo_estado: aInsp.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]?.estado_general || 'sin inspección'
        };
      });
    } catch { return []; }
  }

  // Financial summary (last 6 months)
  async function getFinancialSummary(fincaId) {
    try {
      const ventas = await AgroDB.getByIndex('ventas', 'finca_id', fincaId);
      const costos = await AgroDB.getByIndex('costos', 'finca_id', fincaId);
      const now = new Date();
      const months = [];

      for (let i = 0; i < 6; i++) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const mKey = m.toISOString().slice(0, 7);

        const mVentas = ventas.filter(v => v.fecha && v.fecha.startsWith(mKey));
        const mCostos = costos.filter(c => c.fecha && c.fecha.startsWith(mKey));

        const ingresos = mVentas.reduce((s, v) => s + (v.total || 0), 0);
        const gastos = mCostos.reduce((s, c) => s + (c.total || 0), 0);

        months.push({
          mes: mKey,
          ingresos,
          gastos,
          margen: ingresos - gastos
        });
      }

      return {
        meses: months,
        total_ingresos: months.reduce((s, m) => s + m.ingresos, 0),
        total_gastos: months.reduce((s, m) => s + m.gastos, 0),
        margen_total: months.reduce((s, m) => s + m.margen, 0),
        top_gastos: getTopCategories(costos),
        top_productos: getTopProducts(ventas)
      };
    } catch { return {}; }
  }

  function getTopCategories(costos) {
    const bycat = {};
    costos.forEach(c => {
      const cat = c.categoria || 'otro';
      bycat[cat] = (bycat[cat] || 0) + (c.total || 0);
    });
    return Object.entries(bycat).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([cat, total]) => ({ categoria: cat, total }));
  }

  function getTopProducts(ventas) {
    const byp = {};
    ventas.forEach(v => {
      const p = v.cultivo_nombre || v.producto || 'otro';
      byp[p] = (byp[p] || 0) + (v.total || 0);
    });
    return Object.entries(byp).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([producto, total]) => ({ producto, total }));
  }

  // Pending issues and reminders context
  async function getPendingIssues(fincaId) {
    try {
      const tareas = await AgroDB.getByIndex('tareas', 'finca_id', fincaId);
      const ciclos = await AgroDB.getByIndex('ciclos_productivos', 'finca_id', fincaId);
      const inspecciones = await AgroDB.getByIndex('inspecciones', 'finca_id', fincaId);
      const now = new Date().toISOString().slice(0, 10);

      const vencidas = tareas.filter(t => t.estado === 'pendiente' && t.fecha_programada && t.fecha_programada < now);
      const proximaCosecha = ciclos.filter(c => {
        if (c.estado !== 'activo' || !c.fecha_fin_estimada) return false;
        const diff = (new Date(c.fecha_fin_estimada) - new Date()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 14;
      });

      const inspRecientes = inspecciones
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 5);
      const problemas = inspRecientes.filter(i =>
        i.estado_general === 'malo' || i.estado_general === 'critico' ||
        i.plagas_detectadas || i.enfermedades_detectadas
      );

      // Days since last inspection
      const lastInsp = inspRecientes[0]?.fecha;
      const diasSinInspeccion = lastInsp ? Math.floor((Date.now() - new Date(lastInsp)) / (1000 * 60 * 60 * 24)) : 999;

      return {
        tareas_vencidas: vencidas.length,
        tareas_vencidas_detalle: vencidas.slice(0, 3).map(t => t.titulo),
        ciclos_proximos_cosecha: proximaCosecha.map(c => ({
          cultivo: c.cultivo_nombre, area: c.area_nombre,
          fecha_fin: c.fecha_fin_estimada
        })),
        problemas_recientes: problemas.map(i => ({
          area: i.area_nombre, estado: i.estado_general,
          plagas: i.plagas_detectadas, enfermedades: i.enfermedades_detectadas,
          fecha: i.fecha
        })),
        dias_sin_inspeccion: diasSinInspeccion,
        tareas_pendientes: tareas.filter(t => t.estado === 'pendiente').length
      };
    } catch { return {}; }
  }

  // Compact summary for daily tip (combines key data)
  async function getDailyTipContext(fincaId) {
    const [farm, issues, financial] = await Promise.all([
      getFarmSummary(fincaId),
      getPendingIssues(fincaId),
      getFinancialSummary(fincaId)
    ]);
    return {
      finca: farm.finca,
      ubicacion: farm.ubicacion,
      cultivos: farm.cultivos?.map(c => c.nombre) || [],
      ciclos_activos: farm.ciclos_activos?.length || 0,
      areas: farm.total_areas,
      tareas_vencidas: issues.tareas_vencidas,
      dias_sin_inspeccion: issues.dias_sin_inspeccion,
      problemas: issues.problemas_recientes?.slice(0, 2) || [],
      margen_mes: financial.meses?.[0]?.margen || 0,
      cosecha_proxima: issues.ciclos_proximos_cosecha?.slice(0, 2) || []
    };
  }

  return {
    getFarmSummary,
    getCropStats,
    getAreaStats,
    getFinancialSummary,
    getPendingIssues,
    getDailyTipContext
  };
})();

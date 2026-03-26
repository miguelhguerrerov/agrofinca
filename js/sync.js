// ============================================
// AgroFinca - Sync Engine (v5)
// Bidirectional sync: IndexedDB <-> Supabase
// Offline-first: IndexedDB is primary DB
// v5: structured results, batch upsert, conflict
// detection, sync_log, backoff with jitter,
// permanent fail tracking without queue removal
// ============================================

const SyncEngine = (() => {
  let isSyncing = false;
  let syncInterval = null;
  let onStatusChange = null;
  let lastSyncTimestamp = localStorage.getItem('agrofinca_last_sync') || null;

  // Retry state management (persisted in localStorage)
  const MAX_RETRIES = 5;
  const RETRY_STATE_KEY = 'agrofinca_sync_retry_state';

  function getRetryState(queueItemId) {
    try {
      const all = JSON.parse(localStorage.getItem(RETRY_STATE_KEY) || '{}');
      return all[queueItemId] || { count: 0, nextRetryAt: null, lastError: null, permanent: false, blockedBy: null };
    } catch { return { count: 0, nextRetryAt: null, lastError: null, permanent: false, blockedBy: null }; }
  }

  function setRetryState(queueItemId, state) {
    try {
      const all = JSON.parse(localStorage.getItem(RETRY_STATE_KEY) || '{}');
      all[queueItemId] = state;
      localStorage.setItem(RETRY_STATE_KEY, JSON.stringify(all));
    } catch {}
  }

  function clearRetryState(queueItemId) {
    try {
      const all = JSON.parse(localStorage.getItem(RETRY_STATE_KEY) || '{}');
      delete all[queueItemId];
      localStorage.setItem(RETRY_STATE_KEY, JSON.stringify(all));
    } catch {}
  }

  function clearAllRetryStates() {
    localStorage.removeItem(RETRY_STATE_KEY);
  }

  function calculateBackoff(retryCount) {
    const baseMs = 30000;
    const delay = baseMs * Math.pow(2, Math.min(retryCount, 5));
    const jitter = Math.random() * delay * 0.1;
    return Math.min(delay + jitter, 600000); // cap 10 min
  }

  // Tables that sync to Supabase (ordered by dependency - parents first)
  const SYNC_TABLES = [
    'fincas', 'finca_miembros', 'areas', 'cultivos_catalogo',
    'clientes', 'proveedores', 'activos_finca', 'area_cultivos',
    'ciclos_productivos', 'fases_fenologicas',
    'cosechas', 'ventas', 'costos', 'depreciacion_mensual',
    'colmenas', 'inspecciones_colmena', 'camas_lombricompost', 'registros_lombricompost',
    'ai_conversations', 'ai_chat_history',
    'tareas', 'inspecciones', 'fotos_inspeccion', 'aplicaciones_fitosanitarias',
    'lotes_animales', 'registros_animales',
    'ingeniero_agricultores', 'protocolos_evaluacion', 'productos_ingeniero', 'chat_grupos',
    'ensayos', 'prescripciones', 'programacion_inspecciones', 'chat_conversaciones', 'chat_grupo_miembros',
    'ensayo_tratamientos', 'ventas_insumos', 'visitas_tecnicas',
    'ensayo_evaluaciones', 'ventas_insumos_detalle', 'chat_mensajes'
  ];

  // Push order: parent tables must be pushed before child tables (FK dependencies)
  const PUSH_ORDER = [
    'fincas',
    'finca_miembros', 'areas', 'cultivos_catalogo', 'colmenas',
    'clientes', 'proveedores', 'activos_finca',
    'camas_lombricompost', 'lotes_animales',
    'ciclos_productivos',                                          // BEFORE area_cultivos (FK dep)
    'area_cultivos',
    'fases_fenologicas',
    'cosechas', 'ventas', 'costos', 'depreciacion_mensual',
    'inspecciones_colmena', 'registros_lombricompost',
    'ai_conversations', 'ai_chat_history',                         // ADDED (conversation before history FK)
    'tareas', 'inspecciones',
    'fotos_inspeccion', 'aplicaciones_fitosanitarias', 'registros_animales',
    'ingeniero_agricultores', 'protocolos_evaluacion', 'productos_ingeniero', 'chat_grupos',
    'ensayos', 'prescripciones', 'programacion_inspecciones', 'chat_conversaciones', 'chat_grupo_miembros',
    'ensayo_tratamientos', 'ventas_insumos', 'visitas_tecnicas',
    'ensayo_evaluaciones', 'ventas_insumos_detalle', 'chat_mensajes'
  ];

  // Tables that should NEVER sync (local-only)
  const LOCAL_ONLY_TABLES = [
    'usuarios', 'sync_queue',
    'user_profiles_local', 'payment_history',
    'sync_conflicts', 'sync_log'
  ];

  // Fields to ALWAYS strip from ALL tables before pushing to Supabase
  const LOCAL_ONLY_FIELDS = [
    'synced', 'password_hash', 'avatar_iniciales', 'es_offline', '_role'
  ];

  // Known columns per Supabase table - ONLY these columns are sent
  const KNOWN_COLUMNS = {
    fincas: ['id', 'nombre', 'ubicacion', 'descripcion', 'area_total_m2', 'sistema_riego', 'latitud', 'longitud', 'propietario_id', 'modificado_por', 'created_at', 'updated_at'],
    finca_miembros: ['id', 'finca_id', 'usuario_id', 'usuario_email', 'rol', 'invitado_por', 'estado_invitacion', 'created_at', 'updated_at'],
    areas: ['id', 'finca_id', 'nombre', 'tipo', 'area_m2', 'cultivo_actual_id', 'cultivo_actual_nombre', 'geojson', 'latitud', 'longitud', 'color', 'notas', 'created_at', 'updated_at'],
    cultivos_catalogo: ['id', 'finca_id', 'nombre', 'tipo', 'unidad_produccion', 'ciclo_dias', 'color', 'icono', 'descripcion', 'es_predeterminado', 'rendimiento_referencia', 'unidad_rendimiento', 'fases_template', 'created_at', 'updated_at'],
    ciclos_productivos: ['id', 'finca_id', 'area_id', 'cultivo_id', 'cultivo_nombre', 'area_nombre', 'nombre', 'fecha_inicio', 'fecha_fin', 'fecha_fin_estimada', 'fecha_fin_real', 'estado', 'tipo_ciclo', 'cantidad_plantas', 'ciclo_dias', 'notas', 'created_at', 'updated_at'],
    cosechas: ['id', 'finca_id', 'ciclo_id', 'cultivo_id', 'cultivo_nombre', 'area_id', 'fecha', 'cantidad', 'unidad', 'calidad', 'notas', 'registrado_por', 'created_at', 'updated_at'],
    ventas: ['id', 'finca_id', 'cultivo_id', 'cultivo_nombre', 'producto', 'fecha', 'cantidad', 'unidad', 'precio_unitario', 'total', 'comprador', 'cliente_id', 'ciclo_id', 'area_id', 'cosecha_id', 'forma_pago', 'cobrado', 'fecha_cobro', 'notas', 'registrado_por', 'created_at', 'updated_at'],
    costos: ['id', 'finca_id', 'cultivo_id', 'cultivo_nombre', 'ciclo_id', 'area_id', 'categoria', 'subcategoria', 'tipo_costo', 'fecha', 'total', 'cantidad', 'unidad', 'costo_unitario', 'descripcion', 'proveedor', 'proveedor_id', 'activo_id', 'es_mano_obra_familiar', 'notas', 'registrado_por', 'created_at', 'updated_at'],
    colmenas: ['id', 'finca_id', 'nombre', 'tipo', 'estado', 'ubicacion', 'fecha_instalacion', 'notas', 'created_at', 'updated_at'],
    inspecciones_colmena: ['id', 'finca_id', 'colmena_id', 'fecha', 'tipo', 'estado_general', 'poblacion', 'reina_vista', 'crias', 'miel', 'plagas', 'notas', 'created_at', 'updated_at'],
    camas_lombricompost: ['id', 'finca_id', 'nombre', 'tipo', 'estado', 'ubicacion', 'fecha_inicio', 'notas', 'created_at', 'updated_at'],
    registros_lombricompost: ['id', 'finca_id', 'cama_id', 'fecha', 'tipo', 'descripcion', 'cantidad', 'unidad', 'notas', 'created_at', 'updated_at'],
    tareas: ['id', 'finca_id', 'titulo', 'descripcion', 'fecha_programada', 'fecha_completada', 'estado', 'prioridad', 'asignado_a', 'area_id', 'area_nombre', 'ciclo_id', 'ciclo_nombre', 'cultivo_id', 'cultivo_nombre', 'hora_inicio', 'duracion_minutos', 'recurrente', 'frecuencia_dias', 'completada_en', 'completada_por', 'creado_por', 'notas', 'asignado_por_ingeniero', 'created_at', 'updated_at'],
    inspecciones: ['id', 'finca_id', 'area_id', 'area_nombre', 'ciclo_id', 'cultivo_nombre', 'fecha', 'tipo', 'estado_general', 'plagas', 'enfermedades', 'recomendaciones', 'notas', 'ingeniero_id', 'protocolo_id', 'datos_evaluacion', 'condiciones_ambientales', 'created_at', 'updated_at'],
    fotos_inspeccion: ['id', 'finca_id', 'inspeccion_id', 'url', 'descripcion', 'tipo', 'created_at', 'updated_at'],
    aplicaciones_fitosanitarias: ['id', 'finca_id', 'area_id', 'ciclo_id', 'cultivo_nombre', 'destino', 'tipo_producto', 'nombre_producto', 'ingrediente_activo', 'fecha', 'producto', 'dosis', 'unidad_dosis', 'metodo', 'objetivo', 'periodo_carencia_dias', 'area_aplicada_m2', 'colmena_id', 'cama_id', 'notas', 'prescripcion_id', 'created_at', 'updated_at'],
    lotes_animales: ['id', 'finca_id', 'nombre', 'tipo_animal', 'cantidad', 'raza', 'area_id', 'notas', 'created_at', 'updated_at'],
    registros_animales: ['id', 'finca_id', 'lote_id', 'tipo', 'fecha', 'descripcion', 'cantidad', 'costo', 'producto', 'notas', 'created_at', 'updated_at'],
    ai_conversations: ['id', 'finca_id', 'usuario_id', 'title', 'message_count', 'created_at', 'updated_at'],
    ai_chat_history: ['id', 'conversation_id', 'finca_id', 'usuario_id', 'role', 'content', 'image', 'timestamp', 'created_at', 'updated_at'],
    activos_finca: ['id', 'finca_id', 'nombre', 'categoria', 'fecha_adquisicion', 'costo_adquisicion', 'vida_util_meses', 'valor_residual', 'estado', 'area_id', 'cultivo_id', 'notas', 'created_at', 'updated_at'],
    area_cultivos: ['id', 'finca_id', 'area_id', 'cultivo_id', 'ciclo_id', 'proporcion', 'fecha_inicio', 'fecha_fin', 'activo', 'notas', 'created_at', 'updated_at'],
    depreciacion_mensual: ['id', 'finca_id', 'activo_id', 'mes', 'monto', 'area_id', 'cultivo_id', 'created_at', 'updated_at'],
    clientes: ['id', 'finca_id', 'nombre', 'telefono', 'email', 'ubicacion', 'tipo', 'notas', 'activo', 'created_at', 'updated_at'],
    proveedores: ['id', 'finca_id', 'nombre', 'telefono', 'email', 'ubicacion', 'tipo', 'productos_frecuentes', 'notas', 'activo', 'created_at', 'updated_at'],
    fases_fenologicas: ['id', 'finca_id', 'ciclo_id', 'nombre', 'orden', 'fecha_inicio', 'fecha_fin', 'estado', 'genera_ingresos', 'duracion_estimada_dias', 'descripcion', 'notas', 'created_at', 'updated_at'],
    ingeniero_agricultores: ['id', 'ingeniero_id', 'agricultor_id', 'estado', 'fecha_afiliacion', 'notas', 'created_at', 'updated_at'],
    protocolos_evaluacion: ['id', 'ingeniero_id', 'nombre', 'cultivo_id', 'plaga_objetivo', 'variables', 'repeticiones', 'escala', 'formulas', 'descripcion', 'activo', 'created_at', 'updated_at'],
    ensayos: ['id', 'finca_id', 'ingeniero_id', 'protocolo_id', 'titulo', 'objetivo', 'fecha_inicio', 'fecha_fin', 'intervalo_dias', 'duracion_dias', 'estado', 'resultados_json', 'conclusiones', 'created_at', 'updated_at'],
    ensayo_tratamientos: ['id', 'ensayo_id', 'nombre', 'producto', 'dosis', 'unidad_dosis', 'agua_lt', 'metodo', 'es_testigo', 'orden', 'created_at', 'updated_at'],
    ensayo_evaluaciones: ['id', 'ensayo_id', 'tratamiento_id', 'fecha', 'repeticion', 'valores', 'resultado', 'notas', 'created_at', 'updated_at'],
    prescripciones: ['id', 'ingeniero_id', 'finca_id', 'agricultor_id', 'inspeccion_id', 'producto', 'ingrediente_activo', 'dosis', 'unidad_dosis', 'metodo_aplicacion', 'intervalo_dias', 'num_aplicaciones', 'carencia_dias', 'precauciones', 'estado', 'fecha_inicio', 'fecha_fin', 'notas', 'created_at', 'updated_at'],
    productos_ingeniero: ['id', 'ingeniero_id', 'nombre', 'ingrediente_activo', 'tipo', 'registro_sanitario', 'cultivos_autorizados', 'dosis_recomendada', 'carencia_dias', 'precio', 'unidad_venta', 'stock', 'toxicidad', 'activo', 'notas', 'created_at', 'updated_at'],
    ventas_insumos: ['id', 'ingeniero_id', 'agricultor_id', 'finca_id', 'prescripcion_id', 'fecha', 'total', 'forma_pago', 'cobrado', 'fecha_cobro', 'notas', 'created_at', 'updated_at'],
    ventas_insumos_detalle: ['id', 'venta_id', 'producto_id', 'cantidad', 'precio_unitario', 'total', 'created_at', 'updated_at'],
    programacion_inspecciones: ['id', 'ingeniero_id', 'finca_id', 'area_id', 'frecuencia', 'dias_intervalo', 'proxima_visita', 'estado', 'notas', 'created_at', 'updated_at'],
    visitas_tecnicas: ['id', 'ingeniero_id', 'finca_id', 'fecha', 'hora_llegada', 'hora_salida', 'latitud', 'longitud', 'tipo', 'resumen', 'inspeccion_id', 'created_at', 'updated_at'],
    chat_conversaciones: ['id', 'tipo', 'grupo_id', 'participante_1', 'participante_2', 'ultimo_mensaje', 'ultimo_mensaje_at', 'created_at', 'updated_at'],
    chat_mensajes: ['id', 'conversacion_id', 'emisor_id', 'tipo', 'contenido', 'archivo_url', 'leido', 'vinculo_inspeccion_id', 'created_at', 'updated_at'],
    chat_grupos: ['id', 'ingeniero_id', 'nombre', 'descripcion', 'tipo', 'created_at', 'updated_at'],
    chat_grupo_miembros: ['id', 'grupo_id', 'usuario_id', 'fecha_union', 'created_at', 'updated_at']
  };

  // Tables that DON'T have finca_id column (pull without finca_id filter)
  const TABLES_WITHOUT_FINCA_ID = [
    'fincas',
    'ingeniero_agricultores',   // uses ingeniero_id + agricultor_id
    'protocolos_evaluacion',    // uses ingeniero_id
    'productos_ingeniero',      // uses ingeniero_id
    'chat_grupos',              // uses ingeniero_id
    'chat_grupo_miembros',      // uses grupo_id + usuario_id
    'chat_conversaciones',      // uses participante_1 + participante_2
    'chat_mensajes',            // uses conversacion_id + emisor_id
    'ensayo_tratamientos',      // uses ensayo_id (no finca_id)
    'ensayo_evaluaciones',      // uses ensayo_id + tratamiento_id
    'ventas_insumos_detalle',   // uses venta_id + producto_id
  ];

  function setStatusCallback(callback) {
    onStatusChange = callback;
  }

  function updateStatus(status, pendingCount, failedCount = 0) {
    if (onStatusChange) onStatusChange(status, pendingCount, failedCount);
  }

  function isOnline() {
    return navigator.onLine;
  }

  // Start periodic sync
  function startAutoSync(intervalMs = 30000) {
    stopAutoSync();
    if (isOnline() && SupabaseClient.hasSession()) {
      setTimeout(() => syncAll(), 2000);
    }
    syncInterval = setInterval(() => {
      if (isOnline() && SupabaseClient.hasSession()) {
        syncAll();
      }
    }, intervalMs);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  function stopAutoSync() {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  }

  function handleOnline() {
    updateStatus('online', 0);
    if (SupabaseClient.hasSession()) {
      syncAll();
    }
  }

  function handleOffline() {
    updateStatus('offline', 0);
  }

  // Main sync function
  async function syncAll() {
    if (isSyncing || !isOnline()) return;
    if (!SupabaseClient.hasSession()) return;

    isSyncing = true;
    updateStatus('syncing', 0);

    try {
      // Health check — don't waste retries if server unreachable
      const serverOk = await SupabaseClient.healthCheck();
      if (!serverOk) {
        updateStatus('server-unreachable', await AgroDB.getPendingSyncCount());
        isSyncing = false;
        return;
      }

      // Refresh token
      try { await SupabaseClient.refreshSession(); } catch {}

      // Fix orphaned records
      await fixOrphanedRecords();

      // Push then pull
      const pushResult = await pushChanges();
      await pullChanges();

      // Update timestamp
      lastSyncTimestamp = new Date().toISOString();
      localStorage.setItem('agrofinca_last_sync', lastSyncTimestamp);

      // Log cycle
      await AgroDB.addSyncLogEntry({ type: 'cycle', table: null, record_id: null, result: 'ok', error: null, duration_ms: 0 });

      // Report status
      const pending = await AgroDB.getPendingSyncCount();
      const conflicts = await AgroDB.getConflicts(false);
      const failedCount = getFailedItemCount();

      if (pending === 0 && failedCount === 0) {
        updateStatus('online', 0, 0);
      } else {
        updateStatus('online', pending, failedCount);
      }

      // Notify user of new permanent failures
      if (pushResult.newPermanentFailures > 0 && typeof App !== 'undefined' && App.showToast) {
        App.showToast(`${pushResult.newPermanentFailures} registro(s) no pudieron sincronizarse`, 'error', 5000);
      }
      if (conflicts.length > 0 && typeof App !== 'undefined' && App.showToast) {
        App.showToast(`${conflicts.length} conflicto(s) de sync detectados`, 'warning', 5000);
      }

    } catch (err) {
      console.error('[Sync] syncAll error:', err);
    } finally {
      isSyncing = false;
    }
  }

  // Clean a record: remove local-only fields + unknown columns
  function cleanRecord(table, record) {
    const clean = { ...record };

    for (const field of LOCAL_ONLY_FIELDS) {
      delete clean[field];
    }

    const knownCols = KNOWN_COLUMNS[table];
    if (knownCols) {
      for (const key of Object.keys(clean)) {
        if (!knownCols.includes(key)) {
          delete clean[key];
        }
      }
    }

    // Remove undefined/null values for cleaner payload (except id)
    for (const key of Object.keys(clean)) {
      if (key !== 'id' && clean[key] === undefined) {
        delete clean[key];
      }
    }

    return clean;
  }

  function isLocalOnly(tableName) {
    return LOCAL_ONLY_TABLES.includes(tableName);
  }

  // Fix records created with wrong user ID
  async function fixOrphanedRecords() {
    try {
      const authUser = await SupabaseClient.getUser();
      if (!authUser || !authUser.id) return;
      const authUid = authUser.id;

      const allFincas = await AgroDB.getAll('fincas');
      for (const finca of allFincas) {
        if (finca.propietario_id && finca.propietario_id !== authUid) {
          console.log(`[Sync] Fixing orphaned finca "${finca.nombre}": ${finca.propietario_id} -> ${authUid}`);
          await AgroDB.update('fincas', finca.id, { propietario_id: authUid });
        }
      }

      const allMembers = await AgroDB.getAll('finca_miembros');
      for (const member of allMembers) {
        if (member.usuario_id && member.usuario_id !== authUid && !member.synced) {
          await AgroDB.update('finca_miembros', member.id, { usuario_id: authUid });
        }
      }
    } catch (err) {
      console.warn('[Sync] fixOrphanedRecords error:', err.message || err);
    }
  }

  // Push local unsynced changes to Supabase
  async function pushChanges() {
    const queue = await AgroDB.getSyncQueue();
    if (queue.length === 0) return { newPermanentFailures: 0 };

    const byTable = {};
    for (const item of queue) {
      if (!byTable[item.store_name]) byTable[item.store_name] = [];
      byTable[item.store_name].push(item);
    }

    const orderedTables = [...PUSH_ORDER];
    for (const table of Object.keys(byTable)) {
      if (!orderedTables.includes(table)) orderedTables.push(table);
    }

    let processed = 0, errors = 0, newPermanentFailures = 0;
    const blockedDeps = new Map(); // parentId -> {table, error}

    for (const table of orderedTables) {
      const items = byTable[table];
      if (!items || items.length === 0) continue;
      if (LOCAL_ONLY_TABLES.includes(table)) {
        for (const item of items) await AgroDB.clearSyncQueueItem(item.id);
        continue;
      }

      // Collect ready records (not blocked, not waiting for backoff)
      const readyItems = [];
      for (const item of items) {
        const state = getRetryState(item.id);

        // Skip permanently failed items
        if (state.permanent) continue;

        // Skip items waiting for backoff
        if (state.nextRetryAt && new Date(state.nextRetryAt) > new Date()) continue;

        // Skip if retry count exceeded (but don't remove — user decides)
        if (state.count >= MAX_RETRIES && !state.permanent) {
          setRetryState(item.id, { ...state, permanent: true, lastError: state.lastError || 'Max retries exceeded' });
          newPermanentFailures++;
          continue;
        }

        // Get record from IndexedDB
        let record;
        try { record = await AgroDB.getById(item.store_name, item.record_id); } catch {}

        if (!record) {
          if (item.action === 'delete') {
            // Process delete
            const delStart = Date.now();
            const result = await SupabaseClient.deleteRecord(table, item.record_id);
            await AgroDB.addSyncLogEntry({ type: 'push', table, record_id: item.record_id, result: result.ok ? 'ok' : 'error', error: result.ok ? null : result.error, duration_ms: Date.now() - delStart });
            if (result.ok) {
              await AgroDB.clearSyncQueueItem(item.id);
              clearRetryState(item.id);
            }
          } else {
            // Record deleted locally — remove from queue
            await AgroDB.clearSyncQueueItem(item.id);
            clearRetryState(item.id);
          }
          continue;
        }

        // Check if blocked by parent dependency
        if (table !== 'fincas' && record.finca_id && blockedDeps.has(record.finca_id)) {
          setRetryState(item.id, { ...getRetryState(item.id), blockedBy: record.finca_id });
          continue;
        }

        readyItems.push({ item, record: cleanRecord(table, record) });
      }

      if (readyItems.length === 0) continue;

      // Try batch upsert first (if >1 record)
      if (readyItems.length > 1) {
        const batchStart = Date.now();
        const batchResult = await SupabaseClient.batchUpsert(table, readyItems.map(r => r.record));

        if (batchResult.ok) {
          // All succeeded
          for (const { item } of readyItems) {
            await AgroDB.markSynced(item.store_name, item.record_id);
            await AgroDB.clearSyncQueueItem(item.id);
            clearRetryState(item.id);
            processed++;
          }
          await AgroDB.addSyncLogEntry({ type: 'push', table, record_id: `batch(${readyItems.length})`, result: 'ok', error: null, duration_ms: Date.now() - batchStart });
          continue;
        }
        // Batch failed — fall through to individual upserts
        console.warn(`[Sync] Batch upsert failed for ${table}, falling back to individual:`, batchResult.error);
      }

      // Individual upserts
      for (const { item, record } of readyItems) {
        const pushStart = Date.now();
        const result = await SupabaseClient.upsert(table, record);
        const duration = Date.now() - pushStart;

        if (result.ok) {
          await AgroDB.markSynced(item.store_name, item.record_id);
          await AgroDB.clearSyncQueueItem(item.id);
          clearRetryState(item.id);
          processed++;
          await AgroDB.addSyncLogEntry({ type: 'push', table, record_id: item.record_id, result: 'ok', error: null, duration_ms: duration });

          // Unblock children if this was a blocked parent
          if (table === 'fincas') blockedDeps.delete(record.id);

        } else {
          errors++;
          const state = getRetryState(item.id);
          const newCount = state.count + 1;
          const backoffMs = calculateBackoff(newCount);

          if (result.permanent || newCount >= MAX_RETRIES) {
            setRetryState(item.id, { count: newCount, nextRetryAt: null, lastError: result.error, permanent: true, blockedBy: null });
            newPermanentFailures++;
            console.error(`[Sync] PERMANENTLY FAILED: ${table}/${item.record_id}: ${result.error}`);
          } else {
            setRetryState(item.id, { count: newCount, nextRetryAt: new Date(Date.now() + backoffMs).toISOString(), lastError: result.error, permanent: false, blockedBy: null });
            console.warn(`[Sync] ${table}/${item.record_id} retry ${newCount}/${MAX_RETRIES} (next in ${Math.round(backoffMs/1000)}s): ${result.error}`);
          }

          // Track blocked finca for cascade
          if (table === 'fincas') {
            blockedDeps.set(record.id, { table, error: result.error });
          }

          await AgroDB.addSyncLogEntry({ type: 'push', table, record_id: item.record_id, result: 'error', error: result.error, duration_ms: duration });
        }
      }
    }

    console.log(`[Sync] Push complete: ${processed} ok, ${errors} errors, ${newPermanentFailures} permanent`);
    return { newPermanentFailures };
  }

  // Pull remote changes to local
  async function pullChanges() {
    const since = lastSyncTimestamp || '2020-01-01T00:00:00Z';
    const fincaId = App ? App.getCurrentFincaId() : null;

    for (const table of SYNC_TABLES) {
      if (LOCAL_ONLY_TABLES.includes(table)) continue;

      try {
        const pullStart = Date.now();
        const useFilter = TABLES_WITHOUT_FINCA_ID.includes(table) ? null : fincaId;

        // Pagination loop
        let allRecords = [];
        let pageTimestamp = since;

        while (true) {
          const result = await SupabaseClient.getUpdatedSince(table, pageTimestamp, useFilter);
          if (!result.ok) {
            console.warn(`[Sync] Pull error for ${table}: ${result.error}`);
            await AgroDB.addSyncLogEntry({ type: 'pull', table, record_id: null, result: 'error', error: result.error, duration_ms: Date.now() - pullStart });
            break;
          }

          allRecords = allRecords.concat(result.data);

          if (result.data.length < 500) break; // No more pages
          // Next page starts from last record's updated_at
          pageTimestamp = result.data[result.data.length - 1].updated_at;
        }

        if (allRecords.length === 0) continue;

        let pulled = 0, conflicts = 0;

        for (const remote of allRecords) {
          const local = await AgroDB.getById(table, remote.id);

          if (!local) {
            // New record from server
            await directPut(table, { ...remote, synced: true });
            pulled++;
          } else if (new Date(remote.updated_at) > new Date(local.updated_at)) {
            // Remote is newer
            if (local.synced === false) {
              // CONFLICT: local was modified AND remote is newer
              await AgroDB.addConflict(table, remote.id, local, remote);
              conflicts++;
              // Don't overwrite — let user resolve
            } else {
              // No conflict: local was synced, just update
              await directPut(table, { ...remote, synced: true });
              pulled++;
            }
          }
          // If local is newer or same, keep local
        }

        if (pulled > 0 || conflicts > 0) {
          console.log(`[Sync] Pull ${table}: ${pulled} updated, ${conflicts} conflicts`);
        }

        await AgroDB.addSyncLogEntry({ type: 'pull', table, record_id: `${pulled}/${conflicts}`, result: conflicts > 0 ? 'conflict' : 'ok', error: null, duration_ms: Date.now() - pullStart });

      } catch (err) {
        console.warn(`[Sync] Pull error for ${table}:`, err.message || err);
      }
    }
  }

  // Direct put without triggering sync queue
  async function directPut(storeName, record) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('agrofinca_db');
      request.onsuccess = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(storeName)) {
          console.warn(`[Sync] Object store "${storeName}" not found in IndexedDB, skipping`);
          database.close();
          resolve();
          return;
        }
        const tx = database.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const putReq = store.put(record);
        putReq.onsuccess = () => { database.close(); resolve(); };
        putReq.onerror = () => { database.close(); reject(putReq.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Re-queue unsynced records that were removed from sync_queue (after max retries)
  // Scans all sync tables for records with synced !== true and no matching queue entry
  async function requeueUnsynced() {
    let requeued = 0;
    try {
      const queue = await AgroDB.getSyncQueue();
      // Build a set of record_ids already in queue (per table)
      const inQueue = {};
      for (const item of queue) {
        if (!inQueue[item.store_name]) inQueue[item.store_name] = new Set();
        inQueue[item.store_name].add(item.record_id);
      }

      for (const table of SYNC_TABLES) {
        try {
          const unsynced = await AgroDB.getUnsynced(table);
          for (const record of unsynced) {
            if (inQueue[table] && inQueue[table].has(record.id)) continue; // already queued
            await AgroDB.addToSyncQueue(table, 'upsert', record.id);
            requeued++;
          }
        } catch (e) {
          // Table may not exist in IndexedDB yet, skip
        }
      }

      if (requeued > 0) {
        console.log(`[Sync] Re-queued ${requeued} unsynced records that were missing from queue`);
      }
    } catch (err) {
      console.warn('[Sync] requeueUnsynced error:', err.message || err);
    }
    return requeued;
  }

  // Force full sync (resets timestamp + clears retry states + re-queues missing items)
  async function forceSync() {
    lastSyncTimestamp = null;
    localStorage.removeItem('agrofinca_last_sync');
    clearAllRetryStates();
    await requeueUnsynced();
    await syncAll();
  }

  // Clear all permanently failed items from queue
  async function clearFailedItems() {
    const queue = await AgroDB.getSyncQueue();
    let cleared = 0;
    try {
      const all = JSON.parse(localStorage.getItem(RETRY_STATE_KEY) || '{}');
      for (const item of queue) {
        if (all[item.id] && all[item.id].permanent) {
          await AgroDB.clearSyncQueueItem(item.id);
          clearRetryState(item.id);
          cleared++;
        }
      }
    } catch {}
    console.log(`[Sync] Cleared ${cleared} permanently failed items`);
    return cleared;
  }

  // Get count of permanently failed items
  function getFailedItemCount() {
    try {
      const all = JSON.parse(localStorage.getItem(RETRY_STATE_KEY) || '{}');
      return Object.values(all).filter(s => s.permanent).length;
    } catch { return 0; }
  }

  // Get detailed list of permanently failed items
  async function getFailedItems() {
    try {
      const all = JSON.parse(localStorage.getItem(RETRY_STATE_KEY) || '{}');
      const queue = await AgroDB.getSyncQueue();
      const queueMap = {};
      for (const item of queue) queueMap[item.id] = item;

      const failed = [];
      for (const [queueId, state] of Object.entries(all)) {
        if (!state.permanent) continue;
        const queueItem = queueMap[queueId];
        failed.push({
          queueId,
          table: queueItem?.store_name || 'unknown',
          recordId: queueItem?.record_id || 'unknown',
          error: state.lastError,
          retries: state.count,
          permanent: state.permanent
        });
      }
      return failed;
    } catch { return []; }
  }

  // Retry a single failed item
  async function retryItem(queueId) {
    clearRetryState(queueId);
    await syncAll();
  }

  // Retry all permanently failed items
  async function retryAllFailed() {
    try {
      const all = JSON.parse(localStorage.getItem(RETRY_STATE_KEY) || '{}');
      for (const [id, state] of Object.entries(all)) {
        if (state.permanent) {
          all[id] = { ...state, permanent: false, count: 0, nextRetryAt: null };
        }
      }
      localStorage.setItem(RETRY_STATE_KEY, JSON.stringify(all));
    } catch {}
    await syncAll();
  }

  // Dismiss a failed item (remove from queue and retry state)
  async function dismissItem(queueId) {
    clearRetryState(queueId);
    await AgroDB.clearSyncQueueItem(parseInt(queueId));
  }

  // Get unresolved conflicts
  async function getConflicts() {
    return AgroDB.getConflicts(false);
  }

  // Resolve a conflict (accept 'remote' or 'local')
  async function resolveConflict(conflictId, resolution) {
    const conflict = (await AgroDB.getConflicts(false)).find(c => c.id === conflictId);
    if (!conflict) return;

    if (resolution === 'remote') {
      // Accept remote version
      await directPut(conflict.table_name, { ...conflict.remote_data, synced: true });
    } else if (resolution === 'local') {
      // Keep local, re-push
      const local = await AgroDB.getById(conflict.table_name, conflict.record_id);
      if (local) {
        local.synced = false;
        local.updated_at = new Date().toISOString();
        await AgroDB.addToSyncQueue(conflict.table_name, 'upsert', conflict.record_id);
      }
    }

    await AgroDB.resolveConflict(conflictId, resolution);
  }

  // Get recent sync log entries
  function getSyncLog(limit = 50) {
    return AgroDB.getSyncLog(limit);
  }

  // Get sync status info
  function getStatus() {
    return {
      online: isOnline(),
      syncing: isSyncing,
      pendingCount: 0, // caller should use AgroDB.getPendingSyncCount()
      failedCount: getFailedItemCount(),
      lastSync: lastSyncTimestamp
    };
  }

  return {
    setStatusCallback,
    startAutoSync,
    stopAutoSync,
    syncAll,
    forceSync,
    isOnline,
    SYNC_TABLES,
    getStatus,
    clearFailedItems,
    // New v5 methods
    getFailedItems,
    getFailedItemCount,
    retryItem,
    retryAllFailed,
    dismissItem,
    getConflicts,
    resolveConflict,
    getSyncLog,
  };
})();

// ============================================
// AgroFinca - Sync Engine (v4)
// Bidirectional sync: IndexedDB <-> Supabase
// Offline-first: IndexedDB is primary DB
// v4: retry limits, permanent fail detection,
// backoff, better error categorization
// ============================================

const SyncEngine = (() => {
  let isSyncing = false;
  let syncInterval = null;
  let onStatusChange = null;
  let lastSyncTimestamp = localStorage.getItem('agrofinca_last_sync') || null;

  // Max retries before marking an item as permanently failed
  const MAX_RETRIES = 5;

  // Track retry counts per queue item (persisted in localStorage)
  function getRetryCount(queueItemId) {
    const retries = JSON.parse(localStorage.getItem('agrofinca_sync_retries') || '{}');
    return retries[queueItemId] || 0;
  }
  function incrementRetry(queueItemId) {
    const retries = JSON.parse(localStorage.getItem('agrofinca_sync_retries') || '{}');
    retries[queueItemId] = (retries[queueItemId] || 0) + 1;
    localStorage.setItem('agrofinca_sync_retries', JSON.stringify(retries));
    return retries[queueItemId];
  }
  function clearRetry(queueItemId) {
    const retries = JSON.parse(localStorage.getItem('agrofinca_sync_retries') || '{}');
    delete retries[queueItemId];
    localStorage.setItem('agrofinca_sync_retries', JSON.stringify(retries));
  }
  function clearAllRetries() {
    localStorage.removeItem('agrofinca_sync_retries');
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
    'lotes_animales', 'registros_animales'
  ];

  // Push order: parent tables must be pushed before child tables (FK dependencies)
  const PUSH_ORDER = [
    'fincas',
    'finca_miembros', 'areas', 'cultivos_catalogo', 'colmenas',
    'clientes', 'proveedores', 'activos_finca',
    'camas_lombricompost', 'lotes_animales',
    'area_cultivos', 'ciclos_productivos',
    'fases_fenologicas',
    'cosechas', 'ventas', 'costos', 'depreciacion_mensual',
    'inspecciones_colmena', 'registros_lombricompost',
    'tareas', 'inspecciones',
    'fotos_inspeccion', 'aplicaciones_fitosanitarias', 'registros_animales'
  ];

  // Tables that should NEVER sync (local-only)
  const LOCAL_ONLY_TABLES = [
    'usuarios', 'sync_queue',
    'user_profiles_local', 'payment_history'
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
    cultivos_catalogo: ['id', 'finca_id', 'nombre', 'tipo', 'unidad_produccion', 'ciclo_dias', 'color', 'icono', 'descripcion', 'es_predeterminado', 'rendimiento_referencia', 'unidad_rendimiento', 'created_at', 'updated_at'],
    ciclos_productivos: ['id', 'finca_id', 'area_id', 'cultivo_id', 'cultivo_nombre', 'area_nombre', 'nombre', 'fecha_inicio', 'fecha_fin', 'fecha_fin_estimada', 'fecha_fin_real', 'estado', 'tipo_ciclo', 'cantidad_plantas', 'ciclo_dias', 'notas', 'created_at', 'updated_at'],
    cosechas: ['id', 'finca_id', 'ciclo_id', 'cultivo_id', 'cultivo_nombre', 'area_id', 'fecha', 'cantidad', 'unidad', 'calidad', 'notas', 'registrado_por', 'created_at', 'updated_at'],
    ventas: ['id', 'finca_id', 'cultivo_id', 'cultivo_nombre', 'producto', 'fecha', 'cantidad', 'unidad', 'precio_unitario', 'total', 'comprador', 'cliente_id', 'ciclo_id', 'area_id', 'cosecha_id', 'forma_pago', 'cobrado', 'fecha_cobro', 'notas', 'registrado_por', 'created_at', 'updated_at'],
    costos: ['id', 'finca_id', 'cultivo_id', 'cultivo_nombre', 'ciclo_id', 'area_id', 'categoria', 'subcategoria', 'tipo_costo', 'fecha', 'total', 'cantidad', 'unidad', 'costo_unitario', 'descripcion', 'proveedor', 'proveedor_id', 'es_mano_obra_familiar', 'notas', 'registrado_por', 'created_at', 'updated_at'],
    colmenas: ['id', 'finca_id', 'nombre', 'tipo', 'estado', 'ubicacion', 'fecha_instalacion', 'notas', 'created_at', 'updated_at'],
    inspecciones_colmena: ['id', 'finca_id', 'colmena_id', 'fecha', 'tipo', 'estado_general', 'poblacion', 'reina_vista', 'crias', 'miel', 'plagas', 'notas', 'created_at', 'updated_at'],
    camas_lombricompost: ['id', 'finca_id', 'nombre', 'tipo', 'estado', 'ubicacion', 'fecha_inicio', 'notas', 'created_at', 'updated_at'],
    registros_lombricompost: ['id', 'finca_id', 'cama_id', 'fecha', 'tipo', 'descripcion', 'cantidad', 'unidad', 'notas', 'created_at', 'updated_at'],
    tareas: ['id', 'finca_id', 'titulo', 'descripcion', 'fecha_programada', 'fecha_completada', 'estado', 'prioridad', 'asignado_a', 'area_id', 'area_nombre', 'ciclo_id', 'ciclo_nombre', 'cultivo_id', 'cultivo_nombre', 'hora_inicio', 'duracion_minutos', 'recurrente', 'frecuencia_dias', 'completada_en', 'completada_por', 'creado_por', 'notas', 'created_at', 'updated_at'],
    inspecciones: ['id', 'finca_id', 'area_id', 'area_nombre', 'ciclo_id', 'cultivo_nombre', 'fecha', 'tipo', 'estado_general', 'plagas', 'enfermedades', 'recomendaciones', 'notas', 'created_at', 'updated_at'],
    fotos_inspeccion: ['id', 'finca_id', 'inspeccion_id', 'url', 'descripcion', 'tipo', 'created_at', 'updated_at'],
    aplicaciones_fitosanitarias: ['id', 'finca_id', 'area_id', 'ciclo_id', 'cultivo_nombre', 'destino', 'tipo_producto', 'nombre_producto', 'ingrediente_activo', 'fecha', 'producto', 'dosis', 'unidad_dosis', 'metodo', 'objetivo', 'periodo_carencia_dias', 'area_aplicada_m2', 'colmena_id', 'cama_id', 'notas', 'created_at', 'updated_at'],
    lotes_animales: ['id', 'finca_id', 'nombre', 'tipo_animal', 'cantidad', 'raza', 'area_id', 'notas', 'created_at', 'updated_at'],
    registros_animales: ['id', 'finca_id', 'lote_id', 'tipo', 'fecha', 'descripcion', 'cantidad', 'costo', 'producto', 'notas', 'created_at', 'updated_at'],
    ai_conversations: ['id', 'finca_id', 'usuario_id', 'title', 'message_count', 'created_at', 'updated_at'],
    ai_chat_history: ['id', 'conversation_id', 'finca_id', 'usuario_id', 'role', 'content', 'image', 'timestamp', 'created_at', 'updated_at'],
    activos_finca: ['id', 'finca_id', 'nombre', 'categoria', 'fecha_adquisicion', 'costo_adquisicion', 'vida_util_meses', 'valor_residual', 'estado', 'area_id', 'cultivo_id', 'notas', 'created_at', 'updated_at'],
    area_cultivos: ['id', 'finca_id', 'area_id', 'cultivo_id', 'ciclo_id', 'proporcion', 'fecha_inicio', 'fecha_fin', 'activo', 'notas', 'created_at', 'updated_at'],
    depreciacion_mensual: ['id', 'finca_id', 'activo_id', 'mes', 'monto', 'area_id', 'cultivo_id', 'created_at', 'updated_at'],
    clientes: ['id', 'finca_id', 'nombre', 'telefono', 'email', 'ubicacion', 'tipo', 'notas', 'activo', 'created_at', 'updated_at'],
    proveedores: ['id', 'finca_id', 'nombre', 'telefono', 'email', 'ubicacion', 'tipo', 'productos_frecuentes', 'notas', 'activo', 'created_at', 'updated_at'],
    fases_fenologicas: ['id', 'finca_id', 'ciclo_id', 'nombre', 'orden', 'fecha_inicio', 'fecha_fin', 'estado', 'genera_ingresos', 'descripcion', 'notas', 'created_at', 'updated_at']
  };

  // Tables that DON'T have finca_id column
  const TABLES_WITHOUT_FINCA_ID = ['fincas'];

  function setStatusCallback(callback) {
    onStatusChange = callback;
  }

  function updateStatus(status, pendingCount) {
    if (onStatusChange) onStatusChange(status, pendingCount);
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
    isSyncing = true;
    try {
      updateStatus('syncing', 0);

      // 0. Refresh token to prevent 401s
      try {
        await SupabaseClient.refreshSession();
      } catch (e) {
        console.warn('[Sync] Token refresh failed:', e.message);
      }

      // 1. Fix orphaned records
      await fixOrphanedRecords();

      // 2. Push local changes to Supabase
      await pushChanges();

      // 3. Pull remote changes to local
      await pullChanges();

      // Update timestamp
      lastSyncTimestamp = new Date().toISOString();
      localStorage.setItem('agrofinca_last_sync', lastSyncTimestamp);

      const pending = await AgroDB.getPendingSyncCount();
      updateStatus('online', pending);
      if (pending === 0) {
        console.log('[Sync] ✅ All synced successfully');
      } else {
        console.log(`[Sync] ⚠️ ${pending} items still pending`);
      }
    } catch (err) {
      console.error('[Sync] Error:', err);
      const pending = await AgroDB.getPendingSyncCount();
      updateStatus(isOnline() ? 'online' : 'offline', pending);
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

  // Categorize HTTP errors: permanent (4xx) vs transient (5xx/network)
  function isPermanentError(errorMessage) {
    if (!errorMessage) return false;
    const msg = String(errorMessage).toLowerCase();
    // 400 Bad Request with schema issues = permanent until schema changes
    if (msg.includes('http 400') || msg.includes('pgrst204') || msg.includes('could not find')) return true;
    // 404 table not found = permanent
    if (msg.includes('not found') && msg.includes('404')) return true;
    // 409 conflict handled by patchRecord fallback, not permanent
    return false;
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
    if (queue.length === 0) return 0;

    let processed = 0;
    let errors = 0;
    let skippedPermanent = 0;

    const failedFincaIds = new Set();

    // Group by table
    const byTable = {};
    for (const item of queue) {
      if (!byTable[item.store_name]) byTable[item.store_name] = [];
      byTable[item.store_name].push(item);
    }

    // Process in dependency order
    const orderedTables = [...PUSH_ORDER];
    for (const table of Object.keys(byTable)) {
      if (!orderedTables.includes(table)) orderedTables.push(table);
    }

    for (const table of orderedTables) {
      const items = byTable[table];
      if (!items || items.length === 0) continue;

      // Skip local-only tables
      if (isLocalOnly(table)) {
        for (const item of items) {
          await AgroDB.clearSyncQueueItem(item.id);
          clearRetry(item.id);
        }
        processed += items.length;
        continue;
      }

      // Check if any item in this table already hit max retries
      // If ALL items for a table are permanently failing, log once and skip
      const allMaxed = items.every(item => getRetryCount(item.id) >= MAX_RETRIES);
      if (allMaxed) {
        console.warn(`[Sync] ⏭️ Skipping ${table} (${items.length} items) - all exceeded ${MAX_RETRIES} retries`);
        skippedPermanent += items.length;
        continue;
      }

      console.log(`[Sync] Pushing ${items.length} items for ${table}...`);

      for (const item of items) {
        try {
          // Check retry limit
          const retries = getRetryCount(item.id);
          if (retries >= MAX_RETRIES) {
            skippedPermanent++;
            continue;
          }

          if (item.action === 'upsert') {
            const record = await AgroDB.getById(item.store_name, item.record_id);
            if (!record) {
              await AgroDB.clearSyncQueueItem(item.id);
              clearRetry(item.id);
              processed++;
              continue;
            }

            // CASCADE CHECK
            if (table !== 'fincas' && record.finca_id && failedFincaIds.has(record.finca_id)) {
              errors++;
              continue;
            }

            const clean = cleanRecord(table, record);

            // Debug logging for key tables
            if (table === 'fincas' || table === 'areas') {
              console.log(`[Sync] 📤 Pushing ${table}:`, JSON.stringify(clean).substring(0, 300));
            }

            const result = await SupabaseClient.upsert(table, clean);

            if (result) {
              await AgroDB.markSynced(item.store_name, item.record_id);
              await AgroDB.clearSyncQueueItem(item.id);
              clearRetry(item.id);
              processed++;

              if (table === 'fincas') {
                console.log(`[Sync] ✅ Finca synced OK: "${clean.nombre}" (${clean.id}) propietario=${clean.propietario_id}`);
              }
            } else {
              // upsert returned null = server rejected
              const newRetries = incrementRetry(item.id);
              errors++;

              if (table === 'fincas') {
                failedFincaIds.add(record.id);
                console.error(`[Sync] ❌ FINCA PUSH FAILED for "${record.nombre}" (${record.id}) - retry ${newRetries}/${MAX_RETRIES}`);
              } else {
                console.warn(`[Sync] Upsert null for ${table}/${item.record_id} - retry ${newRetries}/${MAX_RETRIES}`);
              }

              // If max retries reached, clear from queue to stop infinite loop
              if (newRetries >= MAX_RETRIES) {
                console.error(`[Sync] 🛑 PERMANENTLY FAILED: ${table}/${item.record_id} after ${MAX_RETRIES} retries - removing from queue`);
                await AgroDB.clearSyncQueueItem(item.id);
                clearRetry(item.id);
              }
            }
          } else if (item.action === 'delete') {
            const result = await SupabaseClient.deleteRecord(item.store_name, item.record_id);
            if (result) {
              await AgroDB.clearSyncQueueItem(item.id);
              clearRetry(item.id);
              processed++;
            } else {
              const newRetries = incrementRetry(item.id);
              errors++;
              if (newRetries >= MAX_RETRIES) {
                await AgroDB.clearSyncQueueItem(item.id);
                clearRetry(item.id);
              }
            }
          }
        } catch (err) {
          const errMsg = err.message || String(err);
          const newRetries = incrementRetry(item.id);
          errors++;
          console.error(`[Sync] Push error ${table}/${item.record_id} (retry ${newRetries}/${MAX_RETRIES}):`, errMsg);

          if (table === 'fincas') {
            try {
              const rec = await AgroDB.getById('fincas', item.record_id);
              if (rec) failedFincaIds.add(rec.id);
            } catch (_) {}
          }

          // Permanent errors: clear immediately
          if (isPermanentError(errMsg) || newRetries >= MAX_RETRIES) {
            console.error(`[Sync] 🛑 Removing permanently failed item: ${table}/${item.record_id}`);
            await AgroDB.clearSyncQueueItem(item.id);
            clearRetry(item.id);
          }
        }
      }
    }

    if (failedFincaIds.size > 0) {
      console.warn(`[Sync] ⚠️ ${failedFincaIds.size} finca(s) failed. Child records skipped.`);
    }
    if (skippedPermanent > 0) {
      console.warn(`[Sync] ⏭️ ${skippedPermanent} items skipped (max retries exceeded)`);
    }
    console.log(`[Sync] Push complete: ${processed} ok, ${errors} errors, ${skippedPermanent} skipped`);
    return processed;
  }

  // Pull remote changes to local
  async function pullChanges() {
    const since = lastSyncTimestamp || '2020-01-01T00:00:00Z';
    const fincaId = App ? App.getCurrentFincaId() : null;

    for (const table of SYNC_TABLES) {
      try {
        const useFilter = TABLES_WITHOUT_FINCA_ID.includes(table) ? null : fincaId;
        const remoteRecords = await SupabaseClient.getUpdatedSince(table, since, useFilter);

        if (remoteRecords.length > 0) {
          console.log(`[Sync] Pull: ${remoteRecords.length} updates from ${table}`);
        }

        for (const remote of remoteRecords) {
          const local = await AgroDB.getById(table, remote.id);
          if (!local) {
            await directPut(table, { ...remote, synced: true });
          } else if (new Date(remote.updated_at) > new Date(local.updated_at)) {
            await directPut(table, { ...remote, synced: true });
          }
        }
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
        console.log(`[Sync] ♻️ Re-queued ${requeued} unsynced records that were missing from queue`);
      }
    } catch (err) {
      console.warn('[Sync] requeueUnsynced error:', err.message || err);
    }
    return requeued;
  }

  // Force full sync (resets timestamp + clears retry counters + re-queues missing items)
  async function forceSync() {
    lastSyncTimestamp = null;
    localStorage.removeItem('agrofinca_last_sync');
    clearAllRetries();
    // Re-queue any records that were removed from sync_queue after max retries
    await requeueUnsynced();
    return syncAll();
  }

  // Clear all permanently failed items from queue
  async function clearFailedItems() {
    const queue = await AgroDB.getSyncQueue();
    let cleared = 0;
    for (const item of queue) {
      if (getRetryCount(item.id) >= MAX_RETRIES) {
        await AgroDB.clearSyncQueueItem(item.id);
        clearRetry(item.id);
        cleared++;
      }
    }
    console.log(`[Sync] Cleared ${cleared} permanently failed items`);
    return cleared;
  }

  // Get sync status info
  async function getStatus() {
    const pending = await AgroDB.getPendingSyncCount();
    return {
      online: isOnline(),
      syncing: isSyncing,
      pendingCount: pending,
      lastSync: lastSyncTimestamp
    };
  }

  return {
    setStatusCallback,
    startAutoSync,
    stopAutoSync,
    syncAll,
    forceSync,
    clearFailedItems,
    getStatus,
    isOnline,
    SYNC_TABLES
  };
})();

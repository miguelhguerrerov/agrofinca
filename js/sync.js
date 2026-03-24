// ============================================
// AgroFinca - Sync Engine (v3)
// Bidirectional sync: IndexedDB <-> Supabase
// Offline-first: IndexedDB is primary DB
// Fixes v2: table-aware cleanRecord, cascade stop,
// token refresh, getUpdatedSince fix for fincas
// ============================================

const SyncEngine = (() => {
  let isSyncing = false;
  let syncInterval = null;
  let onStatusChange = null;
  let lastSyncTimestamp = localStorage.getItem('agrofinca_last_sync') || null;

  // Tables that sync to Supabase (ordered by dependency - parents first)
  // 'usuarios' is LOCAL ONLY - user data syncs via user_profiles in Supabase
  const SYNC_TABLES = [
    'fincas', 'finca_miembros', 'areas', 'cultivos_catalogo',
    'ciclos_productivos', 'cosechas', 'ventas', 'costos', 'colmenas',
    'inspecciones_colmena', 'camas_lombricompost', 'registros_lombricompost',
    'tareas', 'inspecciones', 'fotos_inspeccion', 'aplicaciones_fitosanitarias',
    'lotes_animales', 'registros_animales'
  ];

  // Push order: parent tables must be pushed before child tables (FK dependencies)
  const PUSH_ORDER = [
    'fincas',                     // Level 0: no FK deps
    'finca_miembros',             // Level 1: depends on fincas
    'areas',                      // Level 1: depends on fincas
    'cultivos_catalogo',          // Level 1: depends on fincas
    'colmenas',                   // Level 1: depends on fincas
    'camas_lombricompost',        // Level 1: depends on fincas
    'lotes_animales',             // Level 1: depends on fincas
    'ciclos_productivos',         // Level 2: depends on areas, cultivos_catalogo, fincas
    'cosechas',                   // Level 3: depends on ciclos_productivos, fincas
    'ventas',                     // Level 2: depends on fincas, cultivos
    'costos',                     // Level 2: depends on fincas, cultivos, ciclos
    'inspecciones_colmena',       // Level 2: depends on colmenas, fincas
    'registros_lombricompost',    // Level 2: depends on camas_lombricompost, fincas
    'tareas',                     // Level 1: depends on fincas
    'inspecciones',               // Level 2: depends on fincas, areas, ciclos
    'fotos_inspeccion',           // Level 3: depends on inspecciones
    'aplicaciones_fitosanitarias',// Level 2: depends on fincas, areas, ciclos
    'registros_animales'          // Level 2: depends on lotes_animales, fincas
  ];

  // Tables that should NEVER sync (local-only)
  const LOCAL_ONLY_TABLES = [
    'usuarios',             // User data is in Supabase auth + user_profiles
    'sync_queue',           // Internal sync mechanism
    'ai_chat_history',      // Local AI chat
    'user_profiles_local',  // Local cache of server profiles
    'payment_history'       // Managed by Edge Functions
  ];

  // Fields to ALWAYS strip from ALL tables before pushing to Supabase
  const LOCAL_ONLY_FIELDS = [
    'synced',           // Local sync flag
    'password_hash',    // Local auth only
    'avatar_iniciales', // Computed locally
    'es_offline',       // Local flag
    '_role'             // Computed field for UI
  ];

  // Known columns per Supabase table - ONLY these columns are sent
  // Any field NOT in this list gets stripped before pushing
  // This prevents PostgREST 400 errors from unknown columns
  const KNOWN_COLUMNS = {
    fincas: ['id', 'nombre', 'ubicacion', 'descripcion', 'area_total_m2', 'sistema_riego', 'latitud', 'longitud', 'propietario_id', 'modificado_por', 'created_at', 'updated_at'],
    finca_miembros: ['id', 'finca_id', 'usuario_id', 'usuario_email', 'rol', 'invitado_por', 'estado_invitacion', 'created_at', 'updated_at'],
    areas: ['id', 'finca_id', 'nombre', 'tipo', 'area_m2', 'cultivo_actual_id', 'cultivo_actual_nombre', 'geojson', 'latitud', 'longitud', 'color', 'notas', 'created_at', 'updated_at'],
    cultivos_catalogo: ['id', 'finca_id', 'nombre', 'tipo', 'unidad_produccion', 'ciclo_dias', 'color', 'icono', 'descripcion', 'es_predeterminado', 'rendimiento_referencia', 'unidad_rendimiento', 'created_at', 'updated_at'],
    ciclos_productivos: ['id', 'finca_id', 'area_id', 'cultivo_id', 'cultivo_nombre', 'area_nombre', 'nombre', 'fecha_inicio', 'fecha_fin', 'fecha_fin_real', 'estado', 'notas', 'created_at', 'updated_at'],
    cosechas: ['id', 'finca_id', 'ciclo_id', 'cultivo_id', 'cultivo_nombre', 'area_id', 'fecha', 'cantidad', 'unidad', 'calidad', 'notas', 'created_at', 'updated_at'],
    ventas: ['id', 'finca_id', 'cultivo_id', 'cultivo_nombre', 'producto', 'fecha', 'cantidad', 'unidad', 'precio_unitario', 'total', 'comprador', 'notas', 'created_at', 'updated_at'],
    costos: ['id', 'finca_id', 'cultivo_id', 'cultivo_nombre', 'ciclo_id', 'categoria', 'subcategoria', 'fecha', 'monto', 'descripcion', 'proveedor', 'notas', 'created_at', 'updated_at'],
    colmenas: ['id', 'finca_id', 'nombre', 'tipo', 'estado', 'ubicacion', 'fecha_instalacion', 'notas', 'created_at', 'updated_at'],
    inspecciones_colmena: ['id', 'finca_id', 'colmena_id', 'fecha', 'tipo', 'estado_general', 'poblacion', 'reina_vista', 'crias', 'miel', 'plagas', 'notas', 'created_at', 'updated_at'],
    camas_lombricompost: ['id', 'finca_id', 'nombre', 'tipo', 'estado', 'ubicacion', 'fecha_inicio', 'notas', 'created_at', 'updated_at'],
    registros_lombricompost: ['id', 'finca_id', 'cama_id', 'fecha', 'tipo', 'descripcion', 'cantidad', 'unidad', 'notas', 'created_at', 'updated_at'],
    tareas: ['id', 'finca_id', 'titulo', 'descripcion', 'fecha_programada', 'fecha_completada', 'estado', 'prioridad', 'asignado_a', 'area_id', 'area_nombre', 'ciclo_id', 'ciclo_nombre', 'cultivo_id', 'cultivo_nombre', 'hora_inicio', 'duracion_minutos', 'recurrente', 'frecuencia_dias', 'completada_en', 'completada_por', 'creado_por', 'notas', 'created_at', 'updated_at'],
    inspecciones: ['id', 'finca_id', 'area_id', 'area_nombre', 'ciclo_id', 'cultivo_nombre', 'fecha', 'tipo', 'estado_general', 'plagas', 'enfermedades', 'recomendaciones', 'notas', 'created_at', 'updated_at'],
    fotos_inspeccion: ['id', 'finca_id', 'inspeccion_id', 'url', 'descripcion', 'tipo', 'created_at', 'updated_at'],
    aplicaciones_fitosanitarias: ['id', 'finca_id', 'area_id', 'ciclo_id', 'cultivo_nombre', 'destino', 'tipo_producto', 'nombre_producto', 'ingrediente_activo', 'fecha', 'producto', 'dosis', 'unidad_dosis', 'metodo', 'objetivo', 'periodo_carencia_dias', 'area_aplicada_m2', 'colmena_id', 'cama_id', 'notas', 'created_at', 'updated_at'],
    lotes_animales: ['id', 'finca_id', 'nombre', 'tipo_animal', 'cantidad', 'raza', 'area_id', 'notas', 'created_at', 'updated_at'],
    registros_animales: ['id', 'finca_id', 'lote_id', 'tipo', 'fecha', 'descripcion', 'cantidad', 'costo', 'producto', 'notas', 'created_at', 'updated_at']
  };

  // Tables that DON'T have finca_id column (used in pull to skip finca_id filter)
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
    // Initial sync - only if online and has session
    if (isOnline() && SupabaseClient.hasSession()) {
      setTimeout(() => syncAll(), 2000);
    }
    // Periodic
    syncInterval = setInterval(() => {
      if (isOnline() && SupabaseClient.hasSession()) {
        syncAll();
      }
    }, intervalMs);

    // Listen for online/offline events
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

      // 1. Fix orphaned records (propietario_id mismatch with auth.uid)
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

  // Clean a record by removing local-only fields AND unknown columns for the table
  function cleanRecord(table, record) {
    const clean = { ...record };

    // 1. Always remove global local-only fields
    for (const field of LOCAL_ONLY_FIELDS) {
      delete clean[field];
    }

    // 2. If we know the columns for this table, strip anything not in the list
    const knownCols = KNOWN_COLUMNS[table];
    if (knownCols) {
      for (const key of Object.keys(clean)) {
        if (!knownCols.includes(key)) {
          // Don't log for common local fields to reduce noise
          if (!LOCAL_ONLY_FIELDS.includes(key)) {
            console.debug(`[Sync] Stripping unknown field "${key}" from ${table}`);
          }
          delete clean[key];
        }
      }
    }

    return clean;
  }

  // Check if a table is local-only (should not sync)
  function isLocalOnly(tableName) {
    return LOCAL_ONLY_TABLES.includes(tableName);
  }

  // Fix records created with a local/offline user ID that don't match auth.uid()
  async function fixOrphanedRecords() {
    try {
      const authUser = await SupabaseClient.getUser();
      if (!authUser || !authUser.id) return;

      const authUid = authUser.id;

      // Fix fincas with mismatched propietario_id (check ALL fincas, not just unsynced)
      const allFincas = await AgroDB.getAll('fincas');
      for (const finca of allFincas) {
        if (finca.propietario_id && finca.propietario_id !== authUid) {
          console.log(`[Sync] Fixing orphaned finca "${finca.nombre}": ${finca.propietario_id} -> ${authUid}`);
          await AgroDB.update('fincas', finca.id, { propietario_id: authUid });
        }
      }

      // Fix finca_miembros with mismatched usuario_id
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

    // Track which finca_ids have been successfully pushed
    // If a finca push fails, we skip ALL its child records
    const failedFincaIds = new Set();
    const succeededFincaIds = new Set();

    // Group queue items by table for ordered pushing
    const byTable = {};
    for (const item of queue) {
      if (!byTable[item.store_name]) byTable[item.store_name] = [];
      byTable[item.store_name].push(item);
    }

    // Process tables in push order (parent tables first)
    const orderedTables = [...PUSH_ORDER];
    for (const table of Object.keys(byTable)) {
      if (!orderedTables.includes(table)) orderedTables.push(table);
    }

    for (const table of orderedTables) {
      const items = byTable[table];
      if (!items || items.length === 0) continue;

      // Skip local-only tables entirely
      if (isLocalOnly(table)) {
        for (const item of items) {
          await AgroDB.clearSyncQueueItem(item.id);
        }
        console.log(`[Sync] Skipped local-only table: ${table} (${items.length} items cleared)`);
        processed += items.length;
        continue;
      }

      console.log(`[Sync] Pushing ${items.length} items for ${table}...`);

      for (const item of items) {
        try {
          if (item.action === 'upsert') {
            const record = await AgroDB.getById(item.store_name, item.record_id);
            if (!record) {
              // Record was deleted locally, remove from queue
              await AgroDB.clearSyncQueueItem(item.id);
              processed++;
              continue;
            }

            // CASCADE CHECK: If this is a child table, check if parent finca succeeded
            if (table !== 'fincas' && record.finca_id) {
              if (failedFincaIds.has(record.finca_id)) {
                console.warn(`[Sync] Skipping ${table}/${item.record_id} - parent finca ${record.finca_id} failed`);
                errors++;
                continue; // Don't clear from queue - will retry next cycle
              }
            }

            // Remove local-only fields AND unknown columns before sending
            const clean = cleanRecord(table, record);
            const result = await SupabaseClient.upsert(table, clean);

            if (result) {
              await AgroDB.markSynced(item.store_name, item.record_id);
              await AgroDB.clearSyncQueueItem(item.id);
              processed++;

              // Track finca success for cascade
              if (table === 'fincas') {
                succeededFincaIds.add(record.id);
              }
            } else {
              errors++;
              // Track finca failure for cascade
              if (table === 'fincas') {
                failedFincaIds.add(record.id);
                console.error(`[Sync] ❌ FINCA PUSH FAILED for "${record.nombre}" (${record.id}) - all child records will be skipped`);
              } else {
                console.warn(`[Sync] Upsert returned null for ${table}/${item.record_id}`);
              }
            }
          } else if (item.action === 'delete') {
            const result = await SupabaseClient.deleteRecord(item.store_name, item.record_id);
            if (result) {
              await AgroDB.clearSyncQueueItem(item.id);
              processed++;
            } else {
              errors++;
            }
          }
        } catch (err) {
          errors++;
          console.error(`[Sync] Push error for ${table}/${item.record_id}:`, err.message || err);
          if (table === 'fincas') {
            // Extract finca id from the queue item
            try {
              const rec = await AgroDB.getById('fincas', item.record_id);
              if (rec) failedFincaIds.add(rec.id);
            } catch (_) {}
          }
        }
      }
    }

    if (failedFincaIds.size > 0) {
      console.warn(`[Sync] ⚠️ ${failedFincaIds.size} finca(s) failed to push. Their child records were skipped.`);
    }
    console.log(`[Sync] Push complete: ${processed} processed, ${errors} errors`);
    return processed;
  }

  // Pull remote changes to local
  async function pullChanges() {
    const since = lastSyncTimestamp || '2020-01-01T00:00:00Z';
    const fincaId = App ? App.getCurrentFincaId() : null;

    for (const table of SYNC_TABLES) {
      try {
        // For fincas table, don't pass fincaId filter (fincas doesn't have finca_id column)
        const useFilter = TABLES_WITHOUT_FINCA_ID.includes(table) ? null : fincaId;
        const remoteRecords = await SupabaseClient.getUpdatedSince(table, since, useFilter);

        if (remoteRecords.length > 0) {
          console.log(`[Sync] Pull: ${remoteRecords.length} updates from ${table}`);
        }

        for (const remote of remoteRecords) {
          const local = await AgroDB.getById(table, remote.id);
          if (!local) {
            // New remote record - add locally without triggering sync queue
            await directPut(table, { ...remote, synced: true });
          } else if (new Date(remote.updated_at) > new Date(local.updated_at)) {
            // Remote is newer - update locally (last-write-wins)
            await directPut(table, { ...remote, synced: true });
          }
          // If local is newer, it will be pushed in next pushChanges
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
        // Check if the object store exists before writing
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

  // Force full sync
  async function forceSync() {
    lastSyncTimestamp = null;
    localStorage.removeItem('agrofinca_last_sync');
    return syncAll();
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
    getStatus,
    isOnline,
    SYNC_TABLES
  };
})();

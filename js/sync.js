// ============================================
// AgroFinca - Sync Engine (v2)
// Bidirectional sync: IndexedDB <-> Supabase
// Offline-first: IndexedDB is primary DB
// Fixes: push ordering, local-only field stripping,
// usuarios exclusion, retry logic, better error handling
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
    'fincas',                     // Level 0: no FK deps (propietario_id is auth.uid, not a FK to our tables)
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

  // Fields to strip before pushing to Supabase (local-only fields)
  const LOCAL_ONLY_FIELDS = [
    'synced',           // Local sync flag
    'password_hash',    // Local auth only
    'avatar_iniciales', // Computed locally
    'es_offline',       // Local flag
    '_role'             // Computed field for UI
  ];

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

      // 0. Fix orphaned records (propietario_id mismatch with auth.uid)
      await fixOrphanedRecords();

      // 1. Push local changes to Supabase
      await pushChanges();

      // 2. Pull remote changes to local
      await pullChanges();

      // Update timestamp
      lastSyncTimestamp = new Date().toISOString();
      localStorage.setItem('agrofinca_last_sync', lastSyncTimestamp);

      const pending = await AgroDB.getPendingSyncCount();
      updateStatus('online', pending);
    } catch (err) {
      console.error('Sync error:', err);
      const pending = await AgroDB.getPendingSyncCount();
      updateStatus(isOnline() ? 'online' : 'offline', pending);
    } finally {
      isSyncing = false;
    }
  }

  // Clean a record by removing local-only fields
  function cleanRecord(record) {
    const clean = { ...record };
    for (const field of LOCAL_ONLY_FIELDS) {
      delete clean[field];
    }
    return clean;
  }

  // Check if a table is local-only (should not sync)
  function isLocalOnly(tableName) {
    return LOCAL_ONLY_TABLES.includes(tableName);
  }

  // Fix records created with a local/offline user ID that don't match auth.uid()
  // This happens when a user creates data offline/with wrong ID then logs in online
  async function fixOrphanedRecords() {
    try {
      const authUser = await SupabaseClient.getUser();
      if (!authUser || !authUser.id) return;

      const authUid = authUser.id;

      // Fix fincas with mismatched propietario_id
      const allFincas = await AgroDB.getAll('fincas');
      for (const finca of allFincas) {
        if (finca.propietario_id && finca.propietario_id !== authUid && !finca.synced) {
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

    // Group queue items by table for ordered pushing
    const byTable = {};
    for (const item of queue) {
      if (!byTable[item.store_name]) byTable[item.store_name] = [];
      byTable[item.store_name].push(item);
    }

    // Process tables in push order (parent tables first)
    const orderedTables = [...PUSH_ORDER];
    // Add any tables from queue that aren't in PUSH_ORDER (shouldn't happen, but safe)
    for (const table of Object.keys(byTable)) {
      if (!orderedTables.includes(table)) orderedTables.push(table);
    }

    for (const table of orderedTables) {
      const items = byTable[table];
      if (!items || items.length === 0) continue;

      // Skip local-only tables entirely
      if (isLocalOnly(table)) {
        // Clear these from sync queue since they should never sync
        for (const item of items) {
          await AgroDB.clearSyncQueueItem(item.id);
        }
        console.log(`[Sync] Skipped local-only table: ${table} (${items.length} items cleared)`);
        processed += items.length;
        continue;
      }

      for (const item of items) {
        try {
          if (item.action === 'upsert') {
            const record = await AgroDB.getById(item.store_name, item.record_id);
            if (record) {
              // Remove local-only fields before sending
              const clean = cleanRecord(record);
              const result = await SupabaseClient.upsert(item.store_name, clean);
              if (result) {
                await AgroDB.markSynced(item.store_name, item.record_id);
                await AgroDB.clearSyncQueueItem(item.id);
                processed++;
              } else {
                errors++;
                console.warn(`[Sync] Upsert returned null for ${item.store_name}/${item.record_id}`);
              }
            } else {
              // Record was deleted locally, remove from queue
              await AgroDB.clearSyncQueueItem(item.id);
              processed++;
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
          console.error(`[Sync] Push error for ${item.store_name}/${item.record_id}:`, err.message || err);
        }
      }
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
        const remoteRecords = await SupabaseClient.getUpdatedSince(table, since, fincaId);
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
        const tx = database.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
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

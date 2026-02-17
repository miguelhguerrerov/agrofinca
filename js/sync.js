// ============================================
// AgroFinca - Sync Engine
// Bidirectional sync: IndexedDB <-> Supabase
// ============================================

const SyncEngine = (() => {
  let isSyncing = false;
  let syncInterval = null;
  let onStatusChange = null;
  let lastSyncTimestamp = localStorage.getItem('agrofinca_last_sync') || null;

  // Tables that sync (excluding local-only tables)
  const SYNC_TABLES = [
    'usuarios', 'fincas', 'finca_miembros', 'areas', 'cultivos_catalogo',
    'ciclos_productivos', 'cosechas', 'ventas', 'costos', 'colmenas',
    'inspecciones_colmena', 'camas_lombricompost', 'registros_lombricompost',
    'tareas', 'inspecciones', 'fotos_inspeccion', 'aplicaciones_fitosanitarias'
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
    // Initial sync
    if (isOnline() && SupabaseClient.isConfigured() && SupabaseClient.hasSession()) {
      setTimeout(() => syncAll(), 2000);
    }
    // Periodic
    syncInterval = setInterval(() => {
      if (isOnline() && SupabaseClient.isConfigured() && SupabaseClient.hasSession()) {
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
    if (SupabaseClient.isConfigured() && SupabaseClient.hasSession()) {
      syncAll();
    }
  }

  function handleOffline() {
    updateStatus('offline', 0);
  }

  // Main sync function
  async function syncAll() {
    if (isSyncing || !isOnline() || !SupabaseClient.isConfigured()) return;
    isSyncing = true;
    try {
      updateStatus('syncing', 0);

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

  // Push local unsynced changes to Supabase
  async function pushChanges() {
    const queue = await AgroDB.getSyncQueue();
    let processed = 0;

    for (const item of queue) {
      try {
        if (item.action === 'upsert') {
          const record = await AgroDB.getById(item.store_name, item.record_id);
          if (record) {
            // Remove local-only fields before sending
            const cleanRecord = { ...record };
            delete cleanRecord.synced;
            const result = await SupabaseClient.upsert(item.store_name, cleanRecord);
            if (result) {
              await AgroDB.markSynced(item.store_name, item.record_id);
              await AgroDB.clearSyncQueueItem(item.id);
              processed++;
            }
          } else {
            // Record was deleted locally, remove from queue
            await AgroDB.clearSyncQueueItem(item.id);
          }
        } else if (item.action === 'delete') {
          const result = await SupabaseClient.deleteRecord(item.store_name, item.record_id);
          if (result) {
            await AgroDB.clearSyncQueueItem(item.id);
            processed++;
          }
        }
      } catch (err) {
        console.warn(`Sync push error for ${item.store_name}/${item.record_id}:`, err);
      }
    }
    return processed;
  }

  // Pull remote changes to local
  async function pullChanges() {
    const since = lastSyncTimestamp || '2020-01-01T00:00:00Z';
    const fincaId = App ? App.getCurrentFincaId() : null;

    for (const table of SYNC_TABLES) {
      try {
        // Skip user-specific tables
        if (table === 'usuarios') continue;

        const remoteRecords = await SupabaseClient.getUpdatedSince(table, since, fincaId);
        for (const remote of remoteRecords) {
          const local = await AgroDB.getById(table, remote.id);
          if (!local) {
            // New remote record - add locally
            await new Promise((resolve, reject) => {
              const tx = indexedDB.open('agrofinca_db').onsuccess = (e) => {
                // Use direct put to avoid adding to sync queue
                const database = e.target.result;
                const store = database.transaction(table, 'readwrite').objectStore(table);
                remote.synced = true;
                const req = store.put(remote);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
              };
            }).catch(() => {
              // Fallback: use AgroDB but mark as synced
              return AgroDB.add(table, { ...remote, synced: true });
            });
          } else if (new Date(remote.updated_at) > new Date(local.updated_at)) {
            // Remote is newer - update locally (last-write-wins)
            await directPut(table, { ...remote, synced: true });
          }
          // If local is newer, it will be pushed in next pushChanges
        }
      } catch (err) {
        console.warn(`Sync pull error for ${table}:`, err);
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
      configured: SupabaseClient.isConfigured(),
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

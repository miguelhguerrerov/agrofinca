// ============================================
// AgroFinca - IndexedDB Database Layer
// Offline-first local storage
// ============================================

const AgroDB = (() => {
  const DB_NAME = 'agrofinca_db';
  const DB_VERSION = 3;
  let db = null;

  // All object stores (tables)
  const STORES = [
    'usuarios',
    'fincas',
    'finca_miembros',
    'areas',
    'cultivos_catalogo',
    'ciclos_productivos',
    'cosechas',
    'ventas',
    'costos',
    'colmenas',
    'inspecciones_colmena',
    'camas_lombricompost',
    'registros_lombricompost',
    'tareas',
    'inspecciones',
    'fotos_inspeccion',
    'aplicaciones_fitosanitarias',
    'lotes_animales',
    'registros_animales',
    'sync_queue',
    'ai_chat_history',
    'user_profiles_local',
    'payment_history'
  ];

  // Initialize database
  function init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // --- usuarios ---
        if (!database.objectStoreNames.contains('usuarios')) {
          const store = database.createObjectStore('usuarios', { keyPath: 'id' });
          store.createIndex('email', 'email', { unique: true });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- fincas ---
        if (!database.objectStoreNames.contains('fincas')) {
          const store = database.createObjectStore('fincas', { keyPath: 'id' });
          store.createIndex('propietario_id', 'propietario_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- finca_miembros (relación usuario-finca con rol) ---
        if (!database.objectStoreNames.contains('finca_miembros')) {
          const store = database.createObjectStore('finca_miembros', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('usuario_id', 'usuario_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- areas (parcelas georreferenciadas) ---
        if (!database.objectStoreNames.contains('areas')) {
          const store = database.createObjectStore('areas', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('cultivo_actual_id', 'cultivo_actual_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- cultivos_catalogo (catálogo personalizable) ---
        if (!database.objectStoreNames.contains('cultivos_catalogo')) {
          const store = database.createObjectStore('cultivos_catalogo', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('tipo', 'tipo', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- ciclos_productivos ---
        if (!database.objectStoreNames.contains('ciclos_productivos')) {
          const store = database.createObjectStore('ciclos_productivos', { keyPath: 'id' });
          store.createIndex('area_id', 'area_id', { unique: false });
          store.createIndex('cultivo_id', 'cultivo_id', { unique: false });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('estado', 'estado', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- cosechas ---
        if (!database.objectStoreNames.contains('cosechas')) {
          const store = database.createObjectStore('cosechas', { keyPath: 'id' });
          store.createIndex('ciclo_id', 'ciclo_id', { unique: false });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- ventas ---
        if (!database.objectStoreNames.contains('ventas')) {
          const store = database.createObjectStore('ventas', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('cultivo_id', 'cultivo_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- costos ---
        if (!database.objectStoreNames.contains('costos')) {
          const store = database.createObjectStore('costos', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('cultivo_id', 'cultivo_id', { unique: false });
          store.createIndex('categoria', 'categoria', { unique: false });
          store.createIndex('ciclo_id', 'ciclo_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- colmenas ---
        if (!database.objectStoreNames.contains('colmenas')) {
          const store = database.createObjectStore('colmenas', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- inspecciones_colmena ---
        if (!database.objectStoreNames.contains('inspecciones_colmena')) {
          const store = database.createObjectStore('inspecciones_colmena', { keyPath: 'id' });
          store.createIndex('colmena_id', 'colmena_id', { unique: false });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- camas_lombricompost ---
        if (!database.objectStoreNames.contains('camas_lombricompost')) {
          const store = database.createObjectStore('camas_lombricompost', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- registros_lombricompost ---
        if (!database.objectStoreNames.contains('registros_lombricompost')) {
          const store = database.createObjectStore('registros_lombricompost', { keyPath: 'id' });
          store.createIndex('cama_id', 'cama_id', { unique: false });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- tareas ---
        if (!database.objectStoreNames.contains('tareas')) {
          const store = database.createObjectStore('tareas', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('fecha_programada', 'fecha_programada', { unique: false });
          store.createIndex('estado', 'estado', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- inspecciones (inspecciones periódicas de cultivos con fotos) ---
        if (!database.objectStoreNames.contains('inspecciones')) {
          const store = database.createObjectStore('inspecciones', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('area_id', 'area_id', { unique: false });
          store.createIndex('ciclo_id', 'ciclo_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- fotos_inspeccion ---
        if (!database.objectStoreNames.contains('fotos_inspeccion')) {
          const store = database.createObjectStore('fotos_inspeccion', { keyPath: 'id' });
          store.createIndex('inspeccion_id', 'inspeccion_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- aplicaciones_fitosanitarias ---
        if (!database.objectStoreNames.contains('aplicaciones_fitosanitarias')) {
          const store = database.createObjectStore('aplicaciones_fitosanitarias', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('area_id', 'area_id', { unique: false });
          store.createIndex('ciclo_id', 'ciclo_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- lotes_animales ---
        if (!database.objectStoreNames.contains('lotes_animales')) {
          const store = database.createObjectStore('lotes_animales', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('tipo_animal', 'tipo_animal', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- registros_animales ---
        if (!database.objectStoreNames.contains('registros_animales')) {
          const store = database.createObjectStore('registros_animales', { keyPath: 'id' });
          store.createIndex('lote_id', 'lote_id', { unique: false });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('tipo', 'tipo', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- sync_queue (cola de sincronización) ---
        if (!database.objectStoreNames.contains('sync_queue')) {
          const store = database.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          store.createIndex('store_name', 'store_name', { unique: false });
          store.createIndex('action', 'action', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // --- ai_chat_history (historial de chat IA) ---
        if (!database.objectStoreNames.contains('ai_chat_history')) {
          const store = database.createObjectStore('ai_chat_history', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('usuario_id', 'usuario_id', { unique: false });
        }

        // --- user_profiles_local (perfil local con plan) ---
        if (!database.objectStoreNames.contains('user_profiles_local')) {
          const store = database.createObjectStore('user_profiles_local', { keyPath: 'id' });
          store.createIndex('email', 'email', { unique: true });
        }

        // --- payment_history (historial de pagos) ---
        if (!database.objectStoreNames.contains('payment_history')) {
          const store = database.createObjectStore('payment_history', { keyPath: 'id' });
          store.createIndex('usuario_id', 'usuario_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }
      };
    });
  }

  // Generate UUID
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Get a transaction
  function getStore(storeName, mode = 'readonly') {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // Generic CRUD operations
  async function add(storeName, data) {
    const record = {
      ...data,
      id: data.id || uuid(),
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      synced: false
    };
    return new Promise((resolve, reject) => {
      const store = getStore(storeName, 'readwrite');
      const request = store.put(record);
      request.onsuccess = () => {
        addToSyncQueue(storeName, 'upsert', record.id);
        resolve(record);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function update(storeName, id, data) {
    const existing = await getById(storeName, id);
    if (!existing) throw new Error(`Record ${id} not found in ${storeName}`);
    const record = {
      ...existing,
      ...data,
      id,
      updated_at: new Date().toISOString(),
      synced: false
    };
    return new Promise((resolve, reject) => {
      const store = getStore(storeName, 'readwrite');
      const request = store.put(record);
      request.onsuccess = () => {
        addToSyncQueue(storeName, 'upsert', id);
        resolve(record);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function remove(storeName, id) {
    return new Promise((resolve, reject) => {
      const store = getStore(storeName, 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => {
        addToSyncQueue(storeName, 'delete', id);
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getById(storeName, id) {
    return new Promise((resolve, reject) => {
      const store = getStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const store = getStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const store = getStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function query(storeName, filterFn) {
    const all = await getAll(storeName);
    return filterFn ? all.filter(filterFn) : all;
  }

  // Count records
  async function count(storeName, filterFn) {
    if (!filterFn) {
      return new Promise((resolve, reject) => {
        const store = getStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    const records = await query(storeName, filterFn);
    return records.length;
  }

  // Sync queue management
  async function addToSyncQueue(storeName, action, recordId) {
    return new Promise((resolve, reject) => {
      const store = getStore('sync_queue', 'readwrite');
      const entry = {
        store_name: storeName,
        action,
        record_id: recordId,
        timestamp: new Date().toISOString()
      };
      const request = store.add(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function getSyncQueue() {
    return getAll('sync_queue');
  }

  async function clearSyncQueueItem(id) {
    return new Promise((resolve, reject) => {
      const store = getStore('sync_queue', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function getPendingSyncCount() {
    return count('sync_queue');
  }

  // Bulk operations
  async function bulkAdd(storeName, records) {
    const results = [];
    for (const record of records) {
      results.push(await add(storeName, record));
    }
    return results;
  }

  async function clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const store = getStore(storeName, 'readwrite');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Mark record as synced
  async function markSynced(storeName, id) {
    const record = await getById(storeName, id);
    if (record) {
      record.synced = true;
      return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
      });
    }
  }

  // Get unsynced records
  async function getUnsynced(storeName) {
    return getByIndex(storeName, 'synced', false);
  }

  // Export all data (for backup)
  async function exportAll() {
    const data = {};
    for (const store of STORES) {
      if (store !== 'sync_queue') {
        data[store] = await getAll(store);
      }
    }
    return data;
  }

  // Import data (from backup)
  async function importAll(data) {
    for (const [storeName, records] of Object.entries(data)) {
      if (STORES.includes(storeName) && storeName !== 'sync_queue') {
        await clearStore(storeName);
        for (const record of records) {
          await new Promise((resolve, reject) => {
            const store = getStore(storeName, 'readwrite');
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      }
    }
  }

  // Seed default crop catalog
  async function seedDefaultCrops(fincaId) {
    const defaults = [
      {
        nombre: 'Plátano Barraganete',
        tipo: 'perenne',
        unidad_produccion: 'racimos',
        ciclo_dias: 0,
        color: '#2E7D32',
        icono: '🍌',
        descripcion: 'Plátano de cocción tipo barraganete. Cultivo perenne con cosecha continua.',
        es_predeterminado: true
      },
      {
        nombre: 'Pimiento Verde',
        tipo: 'estacional',
        unidad_produccion: 'kg',
        ciclo_dias: 120,
        color: '#4CAF50',
        icono: '🫑',
        descripcion: 'Pimiento verde de ciclo estacional. Cosecha aproximada a los 120 días.',
        es_predeterminado: true
      },
      {
        nombre: 'Cilantro',
        tipo: 'rotacion_rapida',
        unidad_produccion: 'atados',
        ciclo_dias: 40,
        color: '#81C784',
        icono: '🌿',
        descripcion: 'Cilantro de rotación rápida. Ciclo de 30-45 días.',
        es_predeterminado: true
      },
      {
        nombre: 'Miel de Abeja',
        tipo: 'apicola',
        unidad_produccion: 'litros',
        ciclo_dias: 0,
        color: '#FFA000',
        icono: '🍯',
        descripcion: 'Producción apícola con Apis mellifera.',
        es_predeterminado: true
      },
      {
        nombre: 'Lombricompost',
        tipo: 'compostaje',
        unidad_produccion: 'kg',
        ciclo_dias: 90,
        color: '#795548',
        icono: '🪱',
        descripcion: 'Humus de lombriz producido con residuos orgánicos.',
        es_predeterminado: true
      }
    ];

    for (const crop of defaults) {
      await add('cultivos_catalogo', { ...crop, finca_id: fincaId });
    }
  }

  return {
    init,
    uuid,
    add,
    update,
    remove,
    getById,
    getAll,
    getByIndex,
    query,
    count,
    bulkAdd,
    clearStore,
    markSynced,
    getUnsynced,
    getSyncQueue,
    clearSyncQueueItem,
    getPendingSyncCount,
    addToSyncQueue,
    exportAll,
    importAll,
    seedDefaultCrops,
    STORES
  };
})();

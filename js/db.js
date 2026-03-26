// ============================================
// AgroFinca - IndexedDB Database Layer
// Offline-first local storage
// ============================================

const AgroDB = (() => {
  const DB_NAME = 'agrofinca_db';
  const DB_VERSION = 9;
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
    'ai_conversations',
    'ai_chat_history',
    'user_profiles_local',
    'payment_history',
    'activos_finca',
    'area_cultivos',
    'depreciacion_mensual',
    'clientes',
    'proveedores',
    'fases_fenologicas',
    'ingeniero_agricultores',
    'protocolos_evaluacion',
    'ensayos',
    'ensayo_tratamientos',
    'ensayo_evaluaciones',
    'prescripciones',
    'productos_ingeniero',
    'ventas_insumos',
    'ventas_insumos_detalle',
    'programacion_inspecciones',
    'visitas_tecnicas',
    'chat_conversaciones',
    'chat_mensajes',
    'chat_grupos',
    'chat_grupo_miembros',
    'sync_conflicts',
    'sync_log'
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

        // --- ai_conversations (conversaciones de chat IA) ---
        if (!database.objectStoreNames.contains('ai_conversations')) {
          const store = database.createObjectStore('ai_conversations', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('updated_at', 'updated_at', { unique: false });
          store.createIndex('usuario_id', 'usuario_id', { unique: false });
        }

        // --- ai_chat_history (mensajes de chat IA) ---
        if (!database.objectStoreNames.contains('ai_chat_history')) {
          const store = database.createObjectStore('ai_chat_history', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('conversation_id', 'conversation_id', { unique: false });
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

        // --- activos_finca (activos depreciables: herramientas, infraestructura) ---
        if (!database.objectStoreNames.contains('activos_finca')) {
          const store = database.createObjectStore('activos_finca', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- area_cultivos (policultivo: proporción de cada cultivo por área) ---
        if (!database.objectStoreNames.contains('area_cultivos')) {
          const store = database.createObjectStore('area_cultivos', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('area_id', 'area_id', { unique: false });
          store.createIndex('cultivo_id', 'cultivo_id', { unique: false });
          store.createIndex('ciclo_id', 'ciclo_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- depreciacion_mensual (registros mensuales auto-generados) ---
        if (!database.objectStoreNames.contains('depreciacion_mensual')) {
          const store = database.createObjectStore('depreciacion_mensual', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('activo_id', 'activo_id', { unique: false });
          store.createIndex('mes', 'mes', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- clientes (directorio de compradores) ---
        if (!database.objectStoreNames.contains('clientes')) {
          const store = database.createObjectStore('clientes', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- proveedores (directorio de proveedores) ---
        if (!database.objectStoreNames.contains('proveedores')) {
          const store = database.createObjectStore('proveedores', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- fases_fenologicas (fases de cultivos perennes) ---
        if (!database.objectStoreNames.contains('fases_fenologicas')) {
          const store = database.createObjectStore('fases_fenologicas', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('ciclo_id', 'ciclo_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- ingeniero_agricultores (relación ingeniero-agricultor) ---
        if (!database.objectStoreNames.contains('ingeniero_agricultores')) {
          const store = database.createObjectStore('ingeniero_agricultores', { keyPath: 'id' });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('agricultor_id', 'agricultor_id', { unique: false });
          store.createIndex('estado', 'estado', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- protocolos_evaluacion ---
        if (!database.objectStoreNames.contains('protocolos_evaluacion')) {
          const store = database.createObjectStore('protocolos_evaluacion', { keyPath: 'id' });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- ensayos ---
        if (!database.objectStoreNames.contains('ensayos')) {
          const store = database.createObjectStore('ensayos', { keyPath: 'id' });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('protocolo_id', 'protocolo_id', { unique: false });
          store.createIndex('estado', 'estado', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- ensayo_tratamientos ---
        if (!database.objectStoreNames.contains('ensayo_tratamientos')) {
          const store = database.createObjectStore('ensayo_tratamientos', { keyPath: 'id' });
          store.createIndex('ensayo_id', 'ensayo_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- ensayo_evaluaciones ---
        if (!database.objectStoreNames.contains('ensayo_evaluaciones')) {
          const store = database.createObjectStore('ensayo_evaluaciones', { keyPath: 'id' });
          store.createIndex('ensayo_id', 'ensayo_id', { unique: false });
          store.createIndex('tratamiento_id', 'tratamiento_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- prescripciones ---
        if (!database.objectStoreNames.contains('prescripciones')) {
          const store = database.createObjectStore('prescripciones', { keyPath: 'id' });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('agricultor_id', 'agricultor_id', { unique: false });
          store.createIndex('inspeccion_id', 'inspeccion_id', { unique: false });
          store.createIndex('estado', 'estado', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- productos_ingeniero ---
        if (!database.objectStoreNames.contains('productos_ingeniero')) {
          const store = database.createObjectStore('productos_ingeniero', { keyPath: 'id' });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('tipo', 'tipo', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- ventas_insumos ---
        if (!database.objectStoreNames.contains('ventas_insumos')) {
          const store = database.createObjectStore('ventas_insumos', { keyPath: 'id' });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('agricultor_id', 'agricultor_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- ventas_insumos_detalle ---
        if (!database.objectStoreNames.contains('ventas_insumos_detalle')) {
          const store = database.createObjectStore('ventas_insumos_detalle', { keyPath: 'id' });
          store.createIndex('venta_id', 'venta_id', { unique: false });
          store.createIndex('producto_id', 'producto_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- programacion_inspecciones ---
        if (!database.objectStoreNames.contains('programacion_inspecciones')) {
          const store = database.createObjectStore('programacion_inspecciones', { keyPath: 'id' });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- visitas_tecnicas ---
        if (!database.objectStoreNames.contains('visitas_tecnicas')) {
          const store = database.createObjectStore('visitas_tecnicas', { keyPath: 'id' });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('finca_id', 'finca_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- chat_conversaciones ---
        if (!database.objectStoreNames.contains('chat_conversaciones')) {
          const store = database.createObjectStore('chat_conversaciones', { keyPath: 'id' });
          store.createIndex('participante_1', 'participante_1', { unique: false });
          store.createIndex('participante_2', 'participante_2', { unique: false });
          store.createIndex('tipo', 'tipo', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- chat_mensajes ---
        if (!database.objectStoreNames.contains('chat_mensajes')) {
          const store = database.createObjectStore('chat_mensajes', { keyPath: 'id' });
          store.createIndex('conversacion_id', 'conversacion_id', { unique: false });
          store.createIndex('emisor_id', 'emisor_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- chat_grupos ---
        if (!database.objectStoreNames.contains('chat_grupos')) {
          const store = database.createObjectStore('chat_grupos', { keyPath: 'id' });
          store.createIndex('ingeniero_id', 'ingeniero_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- chat_grupo_miembros ---
        if (!database.objectStoreNames.contains('chat_grupo_miembros')) {
          const store = database.createObjectStore('chat_grupo_miembros', { keyPath: 'id' });
          store.createIndex('grupo_id', 'grupo_id', { unique: false });
          store.createIndex('usuario_id', 'usuario_id', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // --- sync_conflicts (local-only diagnostic store) ---
        if (!database.objectStoreNames.contains('sync_conflicts')) {
          const store = database.createObjectStore('sync_conflicts', { keyPath: 'id' });
          store.createIndex('table_name', 'table_name', { unique: false });
          store.createIndex('record_id', 'record_id', { unique: false });
          store.createIndex('resolved', 'resolved', { unique: false });
          store.createIndex('created_at', 'created_at', { unique: false });
        }

        // --- sync_log (local-only diagnostic store) ---
        if (!database.objectStoreNames.contains('sync_log')) {
          const store = database.createObjectStore('sync_log', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }

        // Add compound index for deduplication (only if upgrading)
        if (database.objectStoreNames.contains('sync_queue')) {
          try {
            const tx = event.target.transaction;
            const store = tx.objectStore('sync_queue');
            if (!store.indexNames.contains('store_record')) {
              store.createIndex('store_record', ['store_name', 'record_id'], { unique: false });
            }
          } catch (e) { console.warn('Could not add store_record index:', e.message); }
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
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = (e) => {
        const database = e.target.result;
        const tx = database.transaction('sync_queue', 'readwrite');
        const store = tx.objectStore('sync_queue');

        // Check for existing entry (dedup)
        if (store.indexNames.contains('store_record')) {
          const idx = store.index('store_record');
          const range = IDBKeyRange.only([storeName, recordId]);
          const cursorReq = idx.openCursor(range);
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              // Update existing entry instead of creating duplicate
              const existing = cursor.value;
              existing.action = action;
              existing.timestamp = new Date().toISOString();
              cursor.update(existing);
              database.close();
              resolve(existing);
            } else {
              // No existing entry — add new
              const entry = { store_name: storeName, action, record_id: recordId, timestamp: new Date().toISOString() };
              const addReq = store.add(entry);
              addReq.onsuccess = () => { database.close(); resolve(entry); };
              addReq.onerror = () => { database.close(); reject(addReq.error); };
            }
          };
          cursorReq.onerror = () => {
            // Fallback: just add (index might not exist yet)
            const entry = { store_name: storeName, action, record_id: recordId, timestamp: new Date().toISOString() };
            const addReq = store.add(entry);
            addReq.onsuccess = () => { database.close(); resolve(entry); };
            addReq.onerror = () => { database.close(); reject(addReq.error); };
          };
        } else {
          // No index available — add without dedup
          const entry = { store_name: storeName, action, record_id: recordId, timestamp: new Date().toISOString() };
          const addReq = store.add(entry);
          addReq.onsuccess = () => { database.close(); resolve(entry); };
          addReq.onerror = () => { database.close(); reject(addReq.error); };
        }
      };
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

  // Seed default crop catalog — 20 cultivos principales de Ecuador
  // Fuente: ESPAC 2022-2023 / INEC / MAG Ecuador
  async function seedDefaultCrops(fincaId) {
    const defaults = [
      {
        nombre: 'Banano',
        tipo: 'perenne', unidad_produccion: 'kg', ciclo_dias: 0,
        color: '#FFD600', icono: '🍌',
        rendimiento_referencia: 36.28, unidad_rendimiento: 't/ha',
        descripcion: 'Banano de exportación. Principal cultivo de Ecuador.',
        es_predeterminado: true
      },
      {
        nombre: 'Plátano Barraganete',
        tipo: 'perenne', unidad_produccion: 'racimos', ciclo_dias: 0,
        color: '#2E7D32', icono: '🍌',
        rendimiento_referencia: 7.49, unidad_rendimiento: 't/ha',
        descripcion: 'Plátano de cocción tipo barraganete. Cultivo perenne con cosecha continua.',
        es_predeterminado: true
      },
      {
        nombre: 'Cacao',
        tipo: 'perenne', unidad_produccion: 'kg', ciclo_dias: 0,
        color: '#5D4037', icono: '🫘',
        rendimiento_referencia: 0.66, unidad_rendimiento: 't/ha',
        descripcion: 'Cacao fino de aroma. Ecuador es el mayor exportador mundial de cacao fino.',
        es_predeterminado: true
      },
      {
        nombre: 'Café',
        tipo: 'perenne', unidad_produccion: 'kg', ciclo_dias: 0,
        color: '#4E342E', icono: '☕',
        rendimiento_referencia: 0.27, unidad_rendimiento: 't/ha',
        descripcion: 'Café arábigo y robusta. Cultivo de altura.',
        es_predeterminado: true
      },
      {
        nombre: 'Arroz',
        tipo: 'cereal', unidad_produccion: 'kg', ciclo_dias: 120,
        color: '#F5F5DC', icono: '🌾',
        rendimiento_referencia: 5.14, unidad_rendimiento: 't/ha',
        descripcion: 'Arroz paddy. Principal cereal de la costa ecuatoriana.',
        es_predeterminado: true
      },
      {
        nombre: 'Maíz Duro',
        tipo: 'cereal', unidad_produccion: 'kg', ciclo_dias: 120,
        color: '#FFA000', icono: '🌽',
        rendimiento_referencia: 6.35, unidad_rendimiento: 't/ha',
        descripcion: 'Maíz duro seco para alimento animal y agroindustria.',
        es_predeterminado: true
      },
      {
        nombre: 'Maíz Suave',
        tipo: 'cereal', unidad_produccion: 'kg', ciclo_dias: 150,
        color: '#FFD54F', icono: '🌽',
        rendimiento_referencia: 1.08, unidad_rendimiento: 't/ha',
        descripcion: 'Maíz suave de sierra para consumo humano.',
        es_predeterminado: true
      },
      {
        nombre: 'Caña de Azúcar',
        tipo: 'perenne', unidad_produccion: 'toneladas', ciclo_dias: 0,
        color: '#8BC34A', icono: '🎋',
        rendimiento_referencia: 68.41, unidad_rendimiento: 't/ha',
        descripcion: 'Caña de azúcar para producción de panela y azúcar.',
        es_predeterminado: true
      },
      {
        nombre: 'Papa',
        tipo: 'estacional', unidad_produccion: 'kg', ciclo_dias: 150,
        color: '#8D6E63', icono: '🥔',
        rendimiento_referencia: 27.87, unidad_rendimiento: 't/ha',
        descripcion: 'Papa de sierra ecuatoriana. Múltiples variedades.',
        es_predeterminado: true
      },
      {
        nombre: 'Tomate Riñón',
        tipo: 'hortaliza', unidad_produccion: 'kg', ciclo_dias: 120,
        color: '#F44336', icono: '🍅',
        rendimiento_referencia: 33.51, unidad_rendimiento: 't/ha',
        descripcion: 'Tomate riñón bajo invernadero o campo abierto.',
        es_predeterminado: true
      },
      {
        nombre: 'Pimiento Verde',
        tipo: 'hortaliza', unidad_produccion: 'kg', ciclo_dias: 90,
        color: '#4CAF50', icono: '🫑',
        rendimiento_referencia: 22.08, unidad_rendimiento: 't/ha',
        descripcion: 'Pimiento verde de ciclo estacional.',
        es_predeterminado: true
      },
      {
        nombre: 'Cebolla Colorada',
        tipo: 'hortaliza', unidad_produccion: 'kg', ciclo_dias: 150,
        color: '#9C27B0', icono: '🧅',
        rendimiento_referencia: 14.37, unidad_rendimiento: 't/ha',
        descripcion: 'Cebolla colorada perla. Cultivo de sierra.',
        es_predeterminado: true
      },
      {
        nombre: 'Zanahoria',
        tipo: 'hortaliza', unidad_produccion: 'kg', ciclo_dias: 120,
        color: '#FF5722', icono: '🥕',
        rendimiento_referencia: 25.0, unidad_rendimiento: 't/ha',
        descripcion: 'Zanahoria amarilla. Hortaliza de sierra.',
        es_predeterminado: true
      },
      {
        nombre: 'Fréjol',
        tipo: 'leguminosa', unidad_produccion: 'kg', ciclo_dias: 90,
        color: '#795548', icono: '🫘',
        rendimiento_referencia: 0.63, unidad_rendimiento: 't/ha',
        descripcion: 'Fréjol seco y tierno. Grano básico ecuatoriano.',
        es_predeterminado: true
      },
      {
        nombre: 'Yuca',
        tipo: 'estacional', unidad_produccion: 'kg', ciclo_dias: 270,
        color: '#BCAAA4', icono: '🥔',
        rendimiento_referencia: 21.3, unidad_rendimiento: 't/ha',
        descripcion: 'Yuca o mandioca. Tubérculo tropical.',
        es_predeterminado: true
      },
      {
        nombre: 'Piña',
        tipo: 'perenne', unidad_produccion: 'kg', ciclo_dias: 0,
        color: '#FFEB3B', icono: '🍍',
        rendimiento_referencia: 42.13, unidad_rendimiento: 't/ha',
        descripcion: 'Piña variedad MD2 (Golden). Fruta de exportación.',
        es_predeterminado: true
      },
      {
        nombre: 'Maracuyá',
        tipo: 'perenne', unidad_produccion: 'kg', ciclo_dias: 0,
        color: '#FF9800', icono: '🟡',
        rendimiento_referencia: 6.91, unidad_rendimiento: 't/ha',
        descripcion: 'Maracuyá para jugo y exportación.',
        es_predeterminado: true
      },
      {
        nombre: 'Naranja',
        tipo: 'frutal', unidad_produccion: 'kg', ciclo_dias: 0,
        color: '#FF9800', icono: '🍊',
        rendimiento_referencia: 12.4, unidad_rendimiento: 't/ha',
        descripcion: 'Naranja dulce. Cítrico perenne.',
        es_predeterminado: true
      },
      {
        nombre: 'Limón',
        tipo: 'frutal', unidad_produccion: 'kg', ciclo_dias: 0,
        color: '#CDDC39', icono: '🍋',
        rendimiento_referencia: 10.0, unidad_rendimiento: 't/ha',
        descripcion: 'Limón sutil y tahití. Cítrico perenne.',
        es_predeterminado: true
      },
      {
        nombre: 'Cilantro',
        tipo: 'rotacion_rapida', unidad_produccion: 'atados', ciclo_dias: 50,
        color: '#81C784', icono: '🌿',
        rendimiento_referencia: 8.0, unidad_rendimiento: 't/ha',
        descripcion: 'Cilantro de rotación rápida. Ciclo de 40-60 días.',
        es_predeterminado: true
      },
      {
        nombre: 'Miel de Abeja',
        tipo: 'apicola', unidad_produccion: 'litros', ciclo_dias: 0,
        color: '#FFA000', icono: '🍯',
        rendimiento_referencia: 20, unidad_rendimiento: 'litros/colmena/año',
        descripcion: 'Producción apícola con Apis mellifera.',
        es_predeterminado: true
      },
      {
        nombre: 'Lombricompost',
        tipo: 'compostaje', unidad_produccion: 'kg', ciclo_dias: 90,
        color: '#795548', icono: '🪱',
        rendimiento_referencia: null, unidad_rendimiento: null,
        descripcion: 'Humus de lombriz producido con residuos orgánicos.',
        es_predeterminado: true
      }
    ];

    for (const crop of defaults) {
      await add('cultivos_catalogo', { ...crop, finca_id: fincaId });
    }
  }

  // ── Sync Conflicts ──
  async function addConflict(tableName, recordId, localData, remoteData) {
    const conflict = {
      id: uuid(),
      table_name: tableName,
      record_id: recordId,
      local_data: localData,
      remote_data: remoteData,
      created_at: new Date().toISOString(),
      resolved: false,
      resolution: null
    };
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('sync_conflicts', 'readwrite');
        const store = tx.objectStore('sync_conflicts');
        const addReq = store.put(conflict);
        addReq.onsuccess = () => { db.close(); resolve(conflict); };
        addReq.onerror = () => { db.close(); reject(addReq.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getConflicts(resolvedFilter = false) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sync_conflicts')) { db.close(); resolve([]); return; }
        const tx = db.transaction('sync_conflicts', 'readonly');
        const store = tx.objectStore('sync_conflicts');
        const idx = store.index('resolved');
        const range = IDBKeyRange.only(resolvedFilter);
        const getReq = idx.getAll(range);
        getReq.onsuccess = () => { db.close(); resolve(getReq.result || []); };
        getReq.onerror = () => { db.close(); reject(getReq.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function resolveConflict(conflictId, resolution, resolvedData) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('sync_conflicts', 'readwrite');
        const store = tx.objectStore('sync_conflicts');
        const getReq = store.get(conflictId);
        getReq.onsuccess = () => {
          const conflict = getReq.result;
          if (!conflict) { db.close(); resolve(null); return; }
          conflict.resolved = true;
          conflict.resolution = resolution;
          conflict.resolved_at = new Date().toISOString();
          const putReq = store.put(conflict);
          putReq.onsuccess = () => { db.close(); resolve(conflict); };
          putReq.onerror = () => { db.close(); reject(putReq.error); };
        };
        getReq.onerror = () => { db.close(); reject(getReq.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ── Sync Log ──
  async function addSyncLogEntry(entry) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sync_log')) { db.close(); resolve(null); return; }
        const tx = db.transaction('sync_log', 'readwrite');
        const store = tx.objectStore('sync_log');
        entry.timestamp = entry.timestamp || new Date().toISOString();
        const addReq = store.add(entry);
        addReq.onsuccess = () => {
          // Auto-prune to last 200 entries
          const countReq = store.count();
          countReq.onsuccess = () => {
            if (countReq.result > 200) {
              const cursorReq = store.openCursor();
              let toDelete = countReq.result - 200;
              cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (cursor && toDelete > 0) {
                  cursor.delete();
                  toDelete--;
                  cursor.continue();
                } else {
                  db.close();
                  resolve(entry);
                }
              };
            } else {
              db.close();
              resolve(entry);
            }
          };
        };
        addReq.onerror = () => { db.close(); reject(addReq.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getSyncLog(limit = 50) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sync_log')) { db.close(); resolve([]); return; }
        const tx = db.transaction('sync_log', 'readonly');
        const store = tx.objectStore('sync_log');
        const idx = store.index('timestamp');
        const results = [];
        const cursorReq = idx.openCursor(null, 'prev'); // newest first
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            db.close();
            resolve(results);
          }
        };
        cursorReq.onerror = () => { db.close(); reject(cursorReq.error); };
      };
      request.onerror = () => reject(request.error);
    });
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
    addConflict,
    getConflicts,
    resolveConflict,
    addSyncLogEntry,
    getSyncLog,
    exportAll,
    importAll,
    seedDefaultCrops,
    STORES
  };
})();

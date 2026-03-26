# AgroFinca - Backend y Servicios

## Supabase - Configuracion del Proyecto

### Componentes utilizados

| Servicio | Uso |
|----------|-----|
| **Auth** | Registro/login con email y password, seleccion de rol |
| **Database** (PostgreSQL) | Almacenamiento persistente con RLS |
| **Realtime** | WebSocket para chat en vivo (publicacion en `chat_mensajes`) |
| **Edge Functions** | Proxy seguro a Gemini API |
| **PostgREST** | API REST auto-generada de las tablas |

### Configuracion requerida

El archivo `js/config.js` contiene las URLs y claves publicas de Supabase:

```javascript
const AppConfig = {
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbG...',
  FREE_FARM_LIMIT: 1  // Limite de fincas en plan gratuito
};
```

### Variables de entorno (Edge Functions)

| Variable | Descripcion |
|----------|-------------|
| `GEMINI_API_KEY` | Clave de API de Google Gemini |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SB_SERVICE_ROLE_KEY` | Clave de servicio (para verificar JWT) |

---

## Autenticacion (Supabase Auth)

### Flujo de registro
1. Usuario llena formulario de registro (nombre, email, password, **rol**)
2. Si el rol es `'ingeniero'`, se muestran y validan campos adicionales: **especialidad** y **registro_profesional**
3. `AuthModule` llama a `supabase.auth.signUp()` con metadata `{ nombre }`
4. Trigger `on_auth_user_created` crea automaticamente `user_profiles` con plan 'free'
5. El frontend hace upsert en `user_profiles` con `rol`, `especialidad`, `registro_profesional`
6. Se inicia sesion automaticamente
7. La pagina por defecto se determina segun el rol: `ing-dashboard` para ingenieros, `dashboard` para agricultores

### Flujo de login
1. Usuario ingresa email y password
2. `AuthModule` llama a `supabase.auth.signInWithPassword()`
3. Se obtiene JWT y se almacena en session
4. `App.onAuthSuccess()` carga fincas e inicia sync

### Modo offline
- Boton "Usar sin conexion" permite acceso sin autenticacion
- Solo se puede usar datos previamente sincronizados
- No se puede sincronizar hasta conectar e iniciar sesion

### Refresh de sesion
- `SyncEngine.syncAll()` llama a `SupabaseClient.refreshSession()` antes de cada sync
- Esto previene errores 401 por tokens expirados

---

## Sync Engine v4

### Arquitectura

El motor de sincronizacion (`js/sync.js`) maneja la transferencia bidireccional entre IndexedDB y Supabase.

### Cola de sincronizacion

Cada operacion CRUD en `AgroDB` automaticamente agrega una entrada a `sync_queue`:

```javascript
// En AgroDB.add():
addToSyncQueue(storeName, 'upsert', record.id);

// En AgroDB.remove():
addToSyncQueue(storeName, 'delete', id);
```

Estructura de un item en cola:
```javascript
{
  id: autoIncrement,        // ID unico en la cola
  store_name: 'costos',     // Tabla de origen
  action: 'upsert',         // 'upsert' o 'delete'
  record_id: 'uuid-...',    // ID del registro
  timestamp: '2024-...'     // Timestamp de creacion
}
```

### Orden de push (dependencias FK)

Las tablas se sincronizan en orden de dependencia para respetar foreign keys:

```
PUSH_ORDER = [
  'fincas',                          // Padres primero
  'finca_miembros', 'areas', 'cultivos_catalogo', 'colmenas',
  'clientes', 'proveedores', 'activos_finca',
  'camas_lombricompost', 'lotes_animales',
  'area_cultivos', 'ciclos_productivos',
  'fases_fenologicas',
  'cosechas', 'ventas', 'costos', 'depreciacion_mensual',  // Hijos
  'inspecciones_colmena', 'registros_lombricompost',
  'tareas', 'inspecciones',
  'fotos_inspeccion', 'aplicaciones_fitosanitarias', 'registros_animales',
  // v4.0 - Tablas del ingeniero (ordenadas por FK)
  'ingeniero_agricultores', 'protocolos_evaluacion', 'productos_ingeniero', 'chat_grupos',
  'ensayos', 'prescripciones', 'programacion_inspecciones', 'chat_conversaciones', 'chat_grupo_miembros',
  'ensayo_tratamientos', 'ventas_insumos', 'visitas_tecnicas',
  'ensayo_evaluaciones', 'ventas_insumos_detalle', 'chat_mensajes'
]
```

### KNOWN_COLUMNS

Antes de enviar un registro a Supabase, se filtra para enviar **solo columnas conocidas**:

```javascript
const KNOWN_COLUMNS = {
  fincas: ['id', 'nombre', 'ubicacion', 'descripcion', 'area_total_m2', ...],
  ventas: ['id', 'finca_id', 'cultivo_id', 'cultivo_nombre', 'producto', ...],
  // ...para cada tabla
};
```

Esto previene errores `PGRST204` (columna desconocida) al enviar campos locales como `synced`.

### Campos locales eliminados automaticamente

```javascript
const LOCAL_ONLY_FIELDS = ['synced', 'password_hash', 'avatar_iniciales', 'es_offline', '_role'];
```

### Tablas que NO se sincronizan

```javascript
const LOCAL_ONLY_TABLES = ['usuarios', 'sync_queue', 'user_profiles_local', 'payment_history'];
```

### Sistema de reintentos

| Concepto | Valor |
|----------|-------|
| Max reintentos | 5 (`MAX_RETRIES`) |
| Almacenamiento | `localStorage` (`agrofinca_sync_retries`) |
| Error permanente | HTTP 400 (schema mismatch), 404 |
| Error transitorio | HTTP 5xx, errores de red |

Flujo de reintentos:
1. Si upsert falla, se incrementa contador en localStorage
2. Si alcanza `MAX_RETRIES`, el item se remueve de la cola
3. Se marca como "permanently failed" en logs
4. `requeueUnsynced()` puede re-encolar registros huerfanos

### Cascade check

Si una finca falla al sincronizar, todos los registros hijos de esa finca se saltan automaticamente en el mismo ciclo de push.

### Funciones principales

| Funcion | Descripcion |
|---------|-------------|
| `syncAll()` | Ejecuta push + pull completo |
| `pushChanges()` | Envia cambios locales a Supabase |
| `pullChanges()` | Descarga cambios remotos |
| `forceSync()` | Resetea timestamp, limpia retries, re-encola todo |
| `requeueUnsynced()` | Re-encola registros `synced=false` que no estan en cola |
| `clearFailedItems()` | Limpia items con max retries excedidos |

### Auto-sync

```javascript
SyncEngine.startAutoSync(30000); // Cada 30 segundos
```

Tambien se sincroniza cuando:
- El navegador recupera conexion (evento `online`)
- El Service Worker envía mensaje `SYNC_REQUESTED`

### Pull: resolucion de conflictos

Estrategia **last-write-wins** basada en `updated_at`:
```javascript
if (new Date(remote.updated_at) > new Date(local.updated_at)) {
  await directPut(table, { ...remote, synced: true });
}
```

`directPut()` escribe directamente en IndexedDB **sin** agregar a `sync_queue`, evitando loops de sincronizacion.

---

## Supabase Realtime (v4.0)

### Protocolo

El chat entre ingeniero y agricultores usa **Supabase Realtime** via WebSocket (protocolo Phoenix Channel).

### Conexion

```
URL: wss://<PROJECT_ID>.supabase.co/realtime/v1/websocket?apikey=<ANON_KEY>&vsn=1.0.0
```

### Funciones en supabase-client.js

| Funcion | Descripcion |
|---------|-------------|
| `connectRealtime()` | Abre WebSocket, configura heartbeat (30s) y auto-reconnect (5s) |
| `subscribeToChat(conversacionId, callback)` | Se suscribe a INSERTs en `chat_mensajes` filtrado por `conversacion_id` |
| `unsubscribeChat(conversacionId)` | Deja el canal Phoenix |
| `disconnectRealtime()` | Cierra WebSocket, limpia timers |

### Flujo de un mensaje en tiempo real

```
1. Ingeniero escribe mensaje -> INSERT en chat_mensajes (via REST upsert)
2. Supabase Realtime detecta INSERT en chat_mensajes (publicacion habilitada)
3. WebSocket envia evento al canal `realtime:public:chat_mensajes:conversacion_id=eq.{id}`
4. callback() del suscriptor recibe el nuevo mensaje y actualiza la UI
5. Si el WebSocket no esta conectado, el mensaje se sincroniza via SyncEngine en el proximo ciclo
```

### Requisito en base de datos

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE chat_mensajes;
```

### Politicas RLS del ingeniero (v4.0)

Las 15 nuevas tablas usan `DROP POLICY IF EXISTS` antes de `CREATE POLICY` para ser idempotentes:

```sql
DROP POLICY IF EXISTS "tabla_select" ON tabla;
CREATE POLICY "tabla_select" ON tabla FOR SELECT
  USING (ingeniero_id = auth.uid());
```

Tablas con `finca_id` (como `ensayos`, `prescripciones`, `ventas_insumos`) permiten ademas acceso al agricultor propietario de la finca via `user_finca_ids()`.

---

## Service Worker (sw.js)

### Cache

- Nombre: `agrofinca-v16` (incrementar en cada deploy)
- Archivos estaticos: todos los JS (incluyendo 9 modulos `ing-*.js`), CSS, HTML, iconos, manifest
- CDN: Leaflet CSS/JS, Leaflet Draw CSS/JS

### Estrategias de cache

| Tipo de recurso | Estrategia | Descripcion |
|----------------|------------|-------------|
| Archivos estaticos | Cache-first | Lee del cache, si no existe va a red |
| Supabase API | Network-first | Intenta red, si falla usa cache |
| Tiles de mapas | Network-first | Intenta red, fallback a cache |
| Navegacion | Fallback a index.html | Si falla red y no hay cache |

### Background Sync

```javascript
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    // Notifica al main thread para que SyncEngine sincronice
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }));
    });
  }
});
```

### Push Notifications

El SW maneja eventos `push` para mostrar notificaciones del servidor (ej: nuevo mensaje de chat, alerta de inspeccion):

```javascript
self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification(data.title || 'AgroFinca', {
    body: data.body, icon: './icons/icon-192.svg'
  });
});
```

En v4.0, las push notifications se activan para:
- Nuevos mensajes de chat cuando la app no esta en primer plano
- Alertas de inspecciones programadas vencidas
- Notificaciones de prescripciones asignadas

### Ciclo de vida

- **Install**: Cache todos los archivos estaticos + CDN. `skipWaiting()` para activar inmediatamente.
- **Activate**: Limpia caches antiguos. `clients.claim()` para tomar control inmediato.

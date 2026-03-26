# AgroFinca - API Reference

## Supabase REST API (Auto-generada)

Supabase genera automaticamente una API REST para cada tabla via PostgREST.

### URL Base

```
https://<PROJECT_ID>.supabase.co/rest/v1/
```

### Headers requeridos

```
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
Prefer: return=representation   (para upserts)
```

### Endpoints por tabla

Cada tabla genera los endpoints CRUD estandar:

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/rest/v1/{tabla}?select=*` | Listar registros |
| GET | `/rest/v1/{tabla}?id=eq.{uuid}` | Obtener por ID |
| POST | `/rest/v1/{tabla}` | Crear registro |
| PATCH | `/rest/v1/{tabla}?id=eq.{uuid}` | Actualizar registro |
| DELETE | `/rest/v1/{tabla}?id=eq.{uuid}` | Eliminar registro |

### Tablas disponibles

Todas las tablas listadas en `SYNC_TABLES`:

```
// Tablas originales
fincas, finca_miembros, areas, cultivos_catalogo,
clientes, proveedores, activos_finca, area_cultivos,
ciclos_productivos, fases_fenologicas,
cosechas, ventas, costos, depreciacion_mensual,
colmenas, inspecciones_colmena, camas_lombricompost, registros_lombricompost,
ai_conversations, ai_chat_history,
tareas, inspecciones, fotos_inspeccion, aplicaciones_fitosanitarias,
lotes_animales, registros_animales, user_profiles

// v4.0 - Tablas del ingeniero
ingeniero_agricultores, protocolos_evaluacion, productos_ingeniero, chat_grupos,
ensayos, prescripciones, programacion_inspecciones, chat_conversaciones, chat_grupo_miembros,
ensayo_tratamientos, ventas_insumos, visitas_tecnicas,
ensayo_evaluaciones, ventas_insumos_detalle, chat_mensajes
```

### Filtros comunes

```
// Por finca
GET /rest/v1/ventas?finca_id=eq.{uuid}

// Por rango de fecha
GET /rest/v1/ventas?fecha=gte.2024-01-01&fecha=lte.2024-12-31

// Actualizados desde timestamp (para sync)
GET /rest/v1/ventas?updated_at=gt.2024-01-01T00:00:00Z&finca_id=eq.{uuid}&order=updated_at.asc

// Upsert (INSERT o UPDATE si existe)
POST /rest/v1/ventas
Header: Prefer: resolution=merge-duplicates
```

### Ejemplo: SupabaseClient.upsert()

```javascript
async function upsert(table, record) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(record)
  });
  return response.ok ? await response.json() : null;
}
```

### Ejemplo: getUpdatedSince() (para pull sync)

```javascript
async function getUpdatedSince(table, since, fincaId) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?updated_at=gt.${since}&order=updated_at.asc`;
  if (fincaId) url += `&finca_id=eq.${fincaId}`;
  const response = await fetch(url, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`
    }
  });
  return response.ok ? await response.json() : [];
}
```

---

## Funciones de supabase-client.js (v4.1 — Sync Engine v5)

### healthCheck()

Verifica la disponibilidad del servidor antes de sincronizar.

```
HEAD /rest/v1/
Timeout: 5 segundos
```

Retorna `{ ok: true }` si el servidor responde, `{ ok: false, error: '...' }` si no.

### batchUpsert(table, records[])

Envia multiples registros en una sola peticion POST.

```javascript
POST /rest/v1/{tabla}
Header: Prefer: resolution=merge-duplicates,return=representation
Body: [record1, record2, ...]
```

Retorna `{ ok, data, error, code, permanent }`. Si falla, el sync engine hace fallback a upsert individual.

### Retornos estructurados

Todas las funciones de API (`upsert`, `select`, `getUpdatedSince`, `deleteRecord`, `batchUpsert`) ahora retornan un objeto consistente:

```javascript
{
  ok: boolean,       // true si la operacion fue exitosa
  data: any,         // datos retornados (array, objeto, o null)
  error: string,     // mensaje de error (null si ok)
  code: number,      // codigo HTTP (null si error de red)
  permanent: boolean // true si el error no tiene sentido reintentar (400, 404)
}
```

Ejemplos:
- Exito: `{ ok: true, data: [{...}], error: null, code: 200, permanent: false }`
- Error transitorio: `{ ok: false, data: null, error: 'Network error', code: null, permanent: false }`
- Error permanente: `{ ok: false, data: null, error: 'Column not found', code: 400, permanent: true }`

---

## Edge Function: gemini-proxy

### Endpoint

```
POST https://<PROJECT_ID>.supabase.co/functions/v1/gemini-proxy
```

### Headers

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Validacion

1. Se valida el JWT contra Supabase Auth
2. Se consulta `user_profiles.plan` del usuario
3. Si `plan !== 'paid'`, se retorna HTTP 403

### Modelo de IA

```
Gemini 2.0 Flash (gemini-2.0-flash)
```

### Acciones disponibles

#### 1. `chat` - Chat con asistente IA

**Request:**
```json
{
  "action": "chat",
  "messages": [
    { "role": "user", "content": "Mi cacao tiene manchas negras" },
    { "role": "assistant", "content": "Podria ser..." },
    { "role": "user", "content": "Que tratamiento recomiendas?" }
  ],
  "context": {
    "fincaNombre": "Mi Finca",
    "ubicacion": "Ecuador",
    "cultivos": ["Cacao", "Banano"],
    "ciclosActivos": 3,
    "areas": ["Lote 1", "Lote 2"],
    "tareas_vencidas": 2,
    "dias_sin_inspeccion": 15,
    "problemas_recientes": [...],
    "cosechas_proximas": [...],
    "cultivos_stats": [...]
  }
}
```

**Response:**
```json
{
  "response": "Texto de respuesta del asistente...\n\n```json\n{\"actions\": [{\"type\": \"create_tarea\", \"data\": {...}}]}\n```"
}
```

**Acciones ejecutables** (incluidas opcionalmente en la respuesta del chat):
- `create_tarea`: Crear tarea con titulo, descripcion, prioridad, fecha_programada
- `create_inspeccion`: Crear inspeccion con titulo, estado_general, plagas, enfermedades
- `create_aplicacion_fitosanitaria`: Registrar aplicacion con nombre_producto, tipo_producto, dosis
- `create_costo`: Registrar costo con descripcion, categoria, total

#### 2. `analyze-image` - Analisis de imagenes

**Request:**
```json
{
  "action": "analyze-image",
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "prompt": "Identifica plagas en este cultivo de cacao"
}
```

**Response:**
```json
{
  "response": "Diagnostico: Se observa...\n\n```json\n{\"actions\": [...]}\n```"
}
```

#### 3. `transcribe` - Transcripcion de audio

**Request:**
```json
{
  "action": "transcribe",
  "audio": "base64-encoded-audio",
  "mimeType": "audio/webm"
}
```

#### 4. `phytosanitary` - Recomendacion fitosanitaria

**Request:**
```json
{
  "action": "phytosanitary",
  "data": {
    "cultivo": "Cacao",
    "plagas": "Trips, cochinilla",
    "enfermedades": "Monilia",
    "estado_follaje": "Amarillento",
    "estado_suelo": "Humedo",
    "etapa": "Produccion",
    "observaciones": "Manchas negras en frutos"
  }
}
```

#### 5. `optimization` - Optimizacion de finca

**Request:**
```json
{
  "action": "optimization",
  "data": {
    "finca": "Mi Finca",
    "cultivos": ["Cacao", "Banano"],
    "ventasTotal": 5000,
    "costosTotal": 3000,
    "ciclosActivos": 3,
    "areas": 5
  }
}
```

#### 6. `daily-tip` - Consejo diario

**Request:**
```json
{
  "action": "daily-tip",
  "data": {
    "finca": "Mi Finca",
    "ubicacion": "Ecuador",
    "cultivos": ["Cacao", "Banano"],
    "ciclos_activos": 3,
    "areas": 5,
    "tareas_vencidas": 2,
    "dias_sin_inspeccion": 10,
    "problemas": [...],
    "margen_mes": 1500,
    "cosecha_proxima": [...]
  }
}
```

**Response:** Texto corto (max 3 oraciones) con consejo personalizado.

#### 7. `smart-reminders` - Recordatorios inteligentes

**Request:**
```json
{
  "action": "smart-reminders",
  "data": {
    "finca": "Mi Finca",
    "cultivos": [...],
    "areas": [...],
    "ciclos_activos": [...],
    "tareas_vencidas": 3,
    "tareas_vencidas_detalle": ["Fumigar", "Podar"],
    "dias_sin_inspeccion": 15,
    "problemas_recientes": [...],
    "ciclos_proximos_cosecha": [...]
  }
}
```

**Response (JSON array):**
```json
[
  {
    "icon": "emoji",
    "title": "Titulo corto",
    "description": "Descripcion breve",
    "priority": "alta|media|baja",
    "suggestedAction": "crear_tarea|ir_inspecciones|ir_fitosanitario|..."
  }
]
```

#### 8. `analyze-data` - Analisis de datos

**Request:**
```json
{
  "action": "analyze-data",
  "analysisType": "crop|area|farm",
  "data": { /* datos relevantes al tipo */ }
}
```

Tipos de analisis:
- `crop`: Analisis de un cultivo especifico (rendimiento, costos, ventas, problemas)
- `area`: Analisis de un area (uso, productividad, costos)
- `farm`: Analisis integral de la finca (finanzas, cultivos, recomendaciones)

### Codigos de error

| Codigo | Descripcion |
|--------|-------------|
| 401 | Token invalido o ausente |
| 403 | Plan premium requerido |
| 400 | Accion desconocida |
| 502 | Error en Gemini API |
| 500 | Error interno de la Edge Function |

---

## Supabase Realtime (WebSocket) - v4.0

### Endpoint

```
wss://<PROJECT_ID>.supabase.co/realtime/v1/websocket?apikey=<ANON_KEY>&vsn=1.0.0
```

### Autenticacion

Tras conectar el WebSocket, se envia un mensaje `phx_join` con el `access_token` JWT:

```json
{
  "topic": "realtime:public:chat_mensajes:conversacion_id=eq.{id}",
  "event": "phx_join",
  "payload": { "access_token": "<JWT_TOKEN>" },
  "ref": "1"
}
```

### Canal de chat

```
Topico: realtime:public:chat_mensajes:conversacion_id=eq.{uuid}
```

### Eventos recibidos

| Evento | Descripcion |
|--------|-------------|
| `INSERT` | Nuevo mensaje en la conversacion |
| `UPDATE` | Mensaje editado (ej. marcado como leido) |
| `DELETE` | Mensaje eliminado |

El payload contiene `columns`, `record` (datos nuevos) y `old_record` (datos previos en UPDATE/DELETE).

### Heartbeat

Se envia `heartbeat` cada 30 segundos para mantener la conexion:

```json
{ "topic": "phoenix", "event": "heartbeat", "payload": {}, "ref": "2" }
```

### Ejemplo de suscripcion

```javascript
SupabaseClient.subscribeToChat(conversacionId, (newMessage) => {
  // newMessage contiene el registro INSERT completo
  renderMessage(newMessage);
});
```

### Requisitos

1. La tabla `chat_mensajes` debe estar en la publicacion Realtime:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE chat_mensajes;
   ```
2. El usuario debe tener permisos SELECT en `chat_mensajes` via RLS

---

## Endpoints REST de tablas del ingeniero (v4.0)

Las 15 nuevas tablas generan endpoints REST automaticamente via PostgREST.

### Tablas disponibles

| Tabla | Descripcion |
|-------|-------------|
| `ingenieros` | Perfil del ingeniero (especialidad, cedula, registro_senescyt) |
| `ingeniero_agricultores` | Relacion N:M ingeniero-agricultor (estado_invitacion) |
| `ing_inspecciones` | Inspecciones de campo del ingeniero |
| `ing_fotos_inspeccion` | Fotos asociadas a inspecciones |
| `protocolos_evaluacion` | Protocolos fitosanitarios con grilla dinamica |
| `evaluaciones_protocolo` | Resultados de evaluaciones ejecutadas |
| `ensayos` | Ensayos comparativos (tratamientos x repeticiones) |
| `ensayo_mediciones` | Mediciones individuales por tratamiento y repeticion |
| `prescripciones` | Prescripciones tecnicas con seguimiento de cumplimiento |
| `visitas` | Calendario de visitas con check-in/out GPS |
| `ing_productos` | Catalogo de productos del ingeniero (stock, toxicidad) |
| `ventas_insumos` | Ventas de insumos a agricultores |
| `ventas_insumos_items` | Items individuales de cada venta |
| `chat_conversaciones` | Conversaciones entre ingeniero y agricultor |
| `chat_mensajes` | Mensajes con soporte offline (pending_sync) |

### Ejemplos de consultas

```
// Agricultores afiliados al ingeniero
GET /rest/v1/ingeniero_agricultores?ingeniero_id=eq.{uuid}&estado=eq.activo

// Prescripciones activas
GET /rest/v1/prescripciones?ingeniero_id=eq.{uuid}&estado=in.(pendiente,en_ejecucion)

// Productos con stock bajo
GET /rest/v1/ing_productos?ingeniero_id=eq.{uuid}&stock=lt.10&activo=eq.true

// Mensajes de una conversacion
GET /rest/v1/chat_mensajes?conversacion_id=eq.{uuid}&order=created_at.asc

// Ensayos con mediciones (join)
GET /rest/v1/ensayos?select=*,ensayo_mediciones(*)&ingeniero_id=eq.{uuid}

// Visitas del mes
GET /rest/v1/visitas?ingeniero_id=eq.{uuid}&fecha=gte.2025-01-01&fecha=lte.2025-01-31
```

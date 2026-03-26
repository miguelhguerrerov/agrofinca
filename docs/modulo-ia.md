# AgroFinca - Modulo de Inteligencia Artificial

## Arquitectura IA

El sistema de IA tiene 5 componentes principales:

```
ai-data-helpers.js    -> Agrega datos de IndexedDB en resumenes compactos
ai-cache.js           -> Cache localStorage con TTL
gemini-client.js      -> Cliente HTTP al Edge Function proxy
asistente-ia.js       -> UI del chat multi-conversacion
plan-guard.js         -> Control de acceso premium
```

### Flujo de una consulta IA

```
1. Usuario escribe mensaje en chat
2. AsistenteIAModule obtiene contexto via AIDataHelpers
3. GeminiClient envia request al Edge Function
4. Edge Function valida JWT + plan premium
5. Edge Function llama a Gemini API
6. Respuesta regresa al chat con posibles acciones ejecutables
```

---

## ai-data-helpers.js (AIDataHelpers)

Agrega datos de IndexedDB en resumenes compactos (< 2000 tokens) para enviar como contexto a Gemini.

### Funciones disponibles

#### getFarmSummary(fincaId)

Resumen general de la finca:
```javascript
{
  finca: 'Mi Finca',
  ubicacion: 'Ecuador',
  area_total_m2: 50000,
  sistema_riego: 'aspersion',
  areas: [{ nombre: 'Lote 1', tipo: 'productivo', m2: 10000, cultivo: 'Cacao' }],
  cultivos: [{ nombre: 'Cacao', tipo: 'perenne', ciclo_dias: 0 }],
  ciclos_activos: [{ cultivo: 'Cacao', area: 'Lote 1', inicio: '2024-01-15', estado: 'activo' }],
  total_ciclos: 5,
  total_areas: 3
}
```

#### getCropStats(fincaId)

Estadisticas por cultivo:
```javascript
[{
  nombre: 'Cacao',
  tipo: 'perenne',
  ciclos_total: 3,
  ciclos_activos: 1,
  cosechas_total: 500,      // cantidad total cosechada
  ventas_total: 2000,       // $ total vendido
  costos_total: 800,        // $ total gastado
  margen: 1200,             // ventas - costos
  inspecciones: 5,
  ultima_inspeccion: '2024-06-15',
  problemas: ['trips', 'monilia']
}]
```

#### getAreaStats(fincaId)

Estadisticas por area:
```javascript
[{
  nombre: 'Lote 1',
  tipo: 'productivo',
  m2: 10000,
  cultivo_actual: 'Cacao',
  inspecciones: 5,
  aplicaciones_fito: 2,
  costos_total: 500,
  ultimo_estado: 'bueno'
}]
```

#### getFinancialSummary(fincaId)

Resumen financiero de los ultimos 6 meses:
```javascript
{
  meses: [{ mes: '2024-06', ingresos: 1000, gastos: 500, margen: 500 }, ...],
  total_ingresos: 6000,
  total_gastos: 3000,
  margen_total: 3000,
  top_gastos: [{ categoria: 'insumo', total: 1500 }],
  top_productos: [{ producto: 'Cacao', total: 3000 }]
}
```

#### getPendingIssues(fincaId)

Problemas y alertas pendientes:
```javascript
{
  tareas_vencidas: 3,
  tareas_vencidas_detalle: ['Fumigar', 'Podar', 'Regar'],
  ciclos_proximos_cosecha: [{ cultivo: 'Cacao', fecha_fin: '2024-07-01' }],
  problemas_recientes: [{ area: 'Lote 1', estado: 'malo', plagas: 'trips' }],
  dias_sin_inspeccion: 12,
  tareas_pendientes: 5
}
```

#### getDailyTipContext(fincaId)

Version compacta que combina datos clave para el consejo diario:
```javascript
{
  finca: 'Mi Finca',
  ubicacion: 'Ecuador',
  cultivos: ['Cacao', 'Banano'],
  ciclos_activos: 3,
  areas: 5,
  tareas_vencidas: 2,
  dias_sin_inspeccion: 10,
  problemas: [...],
  margen_mes: 1500,
  cosecha_proxima: [...]
}
```

---

## ai-cache.js (AICache)

Cache en localStorage con TTL para respuestas de IA.

### API

```javascript
AICache.get(key)                    // Retorna datos o null si expirado
AICache.set(key, data, ttlMinutes)  // Default TTL: 240 minutos (4 horas)
AICache.invalidate(key)             // Elimina una entrada
AICache.invalidateAll(fincaId)      // Elimina todas las entradas de una finca
```

### Funcionamiento

```javascript
// Estructura en localStorage
ai_cache_{key}: {
  data: { ... },
  expires: 1719500000000  // timestamp de expiracion
}
```

- Al leer, verifica si `Date.now() > entry.expires`
- Si el storage esta lleno, `clearOldest()` elimina entradas expiradas
- Usado para cachear: consejo diario, recordatorios inteligentes

---

## gemini-client.js (GeminiClient)

Cliente frontend que llama al Edge Function proxy. Todas las funciones retornan la respuesta del Edge Function.

### Metodos

| Metodo | Accion | Descripcion |
|--------|--------|-------------|
| `chat(messages, context)` | `chat` | Chat con historial y contexto de finca |
| `analyzeImage(base64Image, prompt)` | `analyze-image` | Analisis de foto de cultivo |
| `transcribeAudio(base64Audio, mimeType)` | `transcribe` | Transcripcion de audio |
| `phytosanitaryRecommendation(data)` | `phytosanitary` | Recomendacion fitosanitaria |
| `farmOptimization(data)` | `optimization` | Sugerencias de optimizacion |
| `dailyTip(farmSummary)` | `daily-tip` | Consejo diario personalizado |
| `smartReminders(farmData)` | `smart-reminders` | Recordatorios inteligentes (JSON) |
| `analyzeData(type, data)` | `analyze-data` | Analisis de cultivo, area o finca |

### Ejemplo de uso

```javascript
// Chat
const response = await GeminiClient.chat(
  [{ role: 'user', content: 'Mi cacao tiene manchas' }],
  { fincaNombre: 'Mi Finca', cultivos: ['Cacao'] }
);

// Consejo diario
const tipContext = await AIDataHelpers.getDailyTipContext(fincaId);
const tip = await GeminiClient.dailyTip(tipContext);
```

---

## asistente-ia.js (AsistenteIAModule)

### Premium Gating

El modulo completo requiere plan Premium. Si el usuario tiene plan gratuito, se muestra un prompt de upgrade con `PlanGuard.showUpgradePrompt('Asistente IA')`.

### UI del chat

Layout estilo aplicacion de mensajeria:
- **Sidebar izquierdo**: Lista de conversaciones con titulo, fecha, contador de mensajes
- **Area principal**: Mensajes del chat, input, botones de media

### Multi-conversacion

Las conversaciones se almacenan en IndexedDB (`ai_conversations`) y se sincronizan con Supabase.

```javascript
// Estructura de conversacion
{
  id: 'uuid',
  finca_id: 'uuid-finca',
  usuario_id: 'uuid-usuario',
  title: 'Consulta sobre plagas en cacao',
  message_count: 12,
  created_at: '2024-06-01T...',
  updated_at: '2024-06-15T...'
}
```

Cada mensaje se almacena en `ai_chat_history`:
```javascript
{
  id: 'uuid',
  conversation_id: 'uuid-conv',
  finca_id: 'uuid-finca',
  usuario_id: 'uuid-usuario',
  role: 'user' | 'assistant',
  content: 'Texto del mensaje',
  image: 'base64...',  // Si se adjunto imagen
  timestamp: '2024-06-15T10:30:00Z'
}
```

### Acciones ejecutables

Cuando la IA sugiere acciones (crear tarea, inspeccion, etc.), el frontend parsea el bloque JSON de la respuesta y muestra botones para ejecutar cada accion con un click:

```javascript
// La respuesta puede contener:
// ```json
// { "actions": [{ "type": "create_tarea", "data": { "titulo": "..." } }] }
// ```

// El frontend renderiza botones de accion:
// [Crear tarea: "Inspeccionar cacao"] [Registrar aplicacion fitosanitaria]
```

### Entrada multimedia

- **Texto**: Input de texto con envio por Enter o boton
- **Fotos**: Captura de camara o seleccion de galeria, se envia como base64
- **Audio**: Grabacion con MediaRecorder API, se envia como base64 WebM

---

## Funcionalidades proactivas del Dashboard

### Consejo diario

En el Dashboard, se muestra un consejo personalizado basado en datos de la finca:

1. Se obtiene contexto con `AIDataHelpers.getDailyTipContext(fincaId)`
2. Se verifica cache: `AICache.get('daily_tip_' + fincaId)`
3. Si no hay cache, se llama `GeminiClient.dailyTip(context)`
4. Se cachea por 4 horas
5. Se muestra en una card del dashboard

### Recordatorios inteligentes

Alertas generadas por IA basadas en datos reales:

1. Se obtiene contexto completo (issues + financial)
2. Se llama `GeminiClient.smartReminders(data)`
3. Se recibe JSON array con 2-5 recordatorios
4. Cada recordatorio tiene: icono, titulo, descripcion, prioridad, accion sugerida
5. Se renderizan como cards con boton de accion (navegar a la seccion relevante)

### Acciones sugeridas en recordatorios

| suggestedAction | Navegacion |
|----------------|------------|
| `crear_tarea` | Abre formulario de tarea |
| `ir_inspecciones` | Navega a Inspecciones |
| `ir_fitosanitario` | Navega a Fitosanitario |
| `ir_produccion` | Navega a Produccion |
| `ir_costos` | Navega a Costos |
| `ir_ventas` | Navega a Ventas |

---

## PlanGuard (plan-guard.js)

### Funciones

```javascript
PlanGuard.isPaid()                    // Boolean: tiene plan premium
PlanGuard.canAddFarmAsync()           // Boolean: puede agregar finca (limite free)
PlanGuard.showUpgradePrompt(feature)  // Muestra modal de upgrade
PlanGuard.guardFeature(name, callback) // Ejecuta callback si premium, sino muestra prompt
PlanGuard.checkFeature(name)          // Retorna true si premium, sino muestra prompt
PlanGuard.openUpgrade()               // Navega a seccion de upgrade
```

### Funcionalidades Premium

- Asistente IA completo (chat, fotos, audio)
- Consejo diario y recordatorios inteligentes
- Analisis financiero avanzado (tabs 2-7)
- Exportacion CSV
- Fincas ilimitadas (free: `AppConfig.FREE_FARM_LIMIT`)

# AgroFinca - Historial de Versiones

## v4.1 — Sync Engine v5 (Marzo 2026)

- Health check antes de sync (evita reintentos contra servidor caido)
- Retornos estructurados en supabase-client.js (ya no retorna null)
- Backoff exponencial por item (30s, 60s, 120s, 240s, 480s, cap 10min)
- Batch upsert (multiples registros en 1 request)
- Deteccion de conflictos (local modificado + remoto mas nuevo → sync_conflicts)
- Paginacion en pull (>500 registros)
- Deduplicacion en sync_queue (index compuesto store_record)
- Pagina de diagnostico sync (items fallidos, conflictos, log)
- Cascada mejorada (blockedDeps Map, auto-desbloqueo de hijos)
- DB_VERSION 9, CACHE v17
- Items permanentes no se eliminan — usuario decide via diagnostico

---

## v4.0 — Rol Ingeniero Agronomo (Marzo 2026)

### Nuevo rol: Ingeniero Agronomo
- Campo `user_profiles.rol`: `'agricultor'` (default) o `'ingeniero'`
- Registro con seleccion de rol + campos condicionales: `especialidad`, `registro_profesional`
- `AuthModule.getUserRol()`, `AuthModule.isIngeniero()` para deteccion de rol
- Routing condicional: agricultores van al dashboard de finca, ingenieros al `ing-dashboard`
- Sidebar dinamico: `App.updateNavigationForRole()` oculta/muestra items segun rol

### 9 modulos del ingeniero (`ing-*.js`)
- **ing-dashboard.js**: KPIs consolidados, mapa Leaflet con marcadores de fincas (verde/amarillo/rojo), alertas priorizadas
- **ing-agricultores.js**: Gestion de afiliados, ficha de agricultor, vista read-only de fincas
- **ing-inspecciones.js**: 3 tabs (Inspecciones / Protocolos / Ensayos), grid dinamico para datos de campo
- **ing-prescripciones.js**: 3 tabs (Activas / Historial / Seguimiento), tracking de adherencia
- **ing-productos.js**: Catalogo con badges de toxicidad (banda I-IV), gestion de stock
- **ing-ventas.js**: Ventas a agricultores con detalle multi-linea, tracking de credito
- **ing-chat.js**: Chat hibrido (Realtime WebSocket + sync offline), grupos, badges de no leidos
- **ing-calendario.js**: Vistas mensual/semanal/hoy, GPS check-in/out, planificacion de rutas
- **ing-reportes.js**: 5 reportes imprimibles (inspeccion, ensayo, cartera, rendimiento, ventas)

### Base de datos (15 nuevas tablas)
- `ingeniero_agricultores`: Relacion ingeniero-agricultor
- `protocolos_evaluacion`: Protocolos reutilizables de evaluacion
- `ensayos`, `ensayo_tratamientos`, `ensayo_evaluaciones`: Ensayos de campo completos
- `prescripciones`: Recetas fitosanitarias del ingeniero
- `productos_ingeniero`: Catalogo de productos con stock y toxicidad
- `ventas_insumos`, `ventas_insumos_detalle`: Ventas multi-linea a agricultores
- `programacion_inspecciones`: Programacion periodica de visitas
- `visitas_tecnicas`: Registro GPS de visitas
- `chat_grupos`, `chat_grupo_miembros`, `chat_conversaciones`, `chat_mensajes`: Sistema de chat
- DB_VERSION incrementado a 8 (IndexedDB)
- SQL idempotente (`DROP POLICY IF EXISTS` antes de `CREATE POLICY`)
- Publicacion Realtime habilitada para `chat_mensajes`

### Tablas modificadas
- `user_profiles`: +`rol`, +`especialidad`, +`registro_profesional`
- `inspecciones`: +`ingeniero_id`, +`protocolo_id`, +`datos_evaluacion` (JSONB), +`condiciones_ambientales` (JSONB)
- `aplicaciones_fitosanitarias`: +`prescripcion_id`
- `tareas`: +`asignado_por_ingeniero`

### Chat hibrido
- Supabase Realtime (WebSocket) para mensajes en tiempo real
- Sincronizacion offline con campo `pending_sync` y cola local
- Indicadores de estado: enviado, entregado, leido

### Evaluaciones y ensayos
- Protocolos de evaluacion fitosanitaria con grilla dinamica (plagas x puntos de muestreo)
- Ensayos comparativos con tratamientos x repeticiones y mediciones individuales

### IA multi-finca
- `getIngenieroContext()` agrega datos de todas las fincas afiliadas
- `buildContext()` detecta rol y usa contexto multi-finca para ingeniero
- IA solo usa cultivos con ciclos activos (fix en `getFarmSummary`)

### Infraestructura
- `supabase-client.js`: `connectRealtime()`, `subscribeToChat()`, `unsubscribeChat()`, `disconnectRealtime()` (WebSocket Phoenix Channel)
- `auth.js`: `getUserRol()`, `isIngeniero()`, seleccion de rol en registro
- `app.js`: `updateNavigationForRole()`, sidebar dinamico, 24 paginas registradas
- `ai-data-helpers.js`: `getIngenieroContext()` para contexto multi-finca
- `asistente-ia.js`: `buildContext()` detecta `isIngeniero()` para contexto multi-finca
- `db.js`: DB_VERSION 8, 15 nuevos IndexedDB stores
- `sync.js`: 15 nuevas tablas en SYNC_TABLES, KNOWN_COLUMNS completo, PUSH_ORDER actualizado
- `sw.js`: CACHE v16, push notification handler activo, 9 nuevos archivos estaticos
- Push notifications para mensajes de chat, alertas de inspecciones, prescripciones

---

## v3.1 — Mejoras Sistema Contable (Marzo 2026)

### Fases fenologicas
- Visualizacion mejorada con barras de progreso coloreadas (verde/ambar/rojo)
- Fechas predichas calculadas acumulativamente desde inicio del ciclo
- Plantillas personalizables por cultivo (`fases_template` JSONB en `cultivos_catalogo`)
- Boton de edicion individual de fases

### Produccion
- Validacion estricta de proporcion de policultivo (suma <= 100%, deshabilita boton guardar)
- Recalculo automatico de `fecha_fin_estimada` al cambiar `fecha_inicio`
- Dropdown de fase fenologica en formulario de inspecciones

### Ventas
- Formulario completo de nuevo cliente en modal secundario (`showNestedClienteForm`)
- Fix: `ciclo_id` usaba tabla `'ciclos'` en vez de `'ciclos_productivos'`

### Costos y finanzas
- Activos vinculados a costos: auto-crear costo con `categoria='activo'` y `activo_id` FK (CAPEX)
- Distribucion de costos a cosechas individuales (`distribuirCostosACosechas`): costo/kg, margen/kg en tab Rendimiento
- Costos generales distribuidos a areas proporcionalmente por m2 (3 niveles en `renderPorArea`)
- Separacion CAPEX: costos con `categoria='activo'` excluidos de costos operativos

### IA
- IA solo usa cultivos con ciclos activos (no catalogo completo)

### Infraestructura
- SQL idempotente (DROP POLICY IF EXISTS)
- 12 archivos de documentacion tecnica en `docs/`

---

## v3.0 - Sistema Contable Completo (2024)

### Activos depreciables (`activos_finca`)
- CRUD completo de activos (herramientas, infraestructura, vehiculos, riego)
- Depreciacion automatica con metodo de linea recta
- Generacion auto de registros mensuales en `depreciacion_mensual`
- Creacion automatica de costo al registrar activo
- Dar de baja activos
- Visualizacion de valor actual y depreciacion acumulada

### Clientes (`clientes`)
- Directorio CRUD de compradores
- Tab dedicado en modulo de Ventas
- Tipos: mayorista, minorista, restaurante, mercado, exportador
- Vinculacion directa con ventas (campo `cliente_id`)
- Precio historico por cliente y producto

### Proveedores (`proveedores`)
- Directorio CRUD de proveedores
- Tab dedicado en modulo de Costos
- Tipos: insumos, herramientas, transporte, fitosanitario, servicios
- Campo `productos_frecuentes`
- Vinculacion directa con costos (campo `proveedor_id`)

### Policultivo (`area_cultivos`)
- Soporte para multiples cultivos por area con proporciones
- Tabla `area_cultivos` con proporcion 0-1
- Visualizacion de composicion en detalle de area
- Distribucion de costos proporcional en finanzas

### Fases fenologicas (`fases_fenologicas`)
- Seguimiento de etapas de cultivos perennes
- Estados: pendiente, en_curso, completada
- Funcion `avanzarFase()` para progresion secuencial
- Templates en catalogo de cultivos
- Marcador de fases que generan ingresos

### Sistema financiero de 7 tabs
1. **Resumen**: KPIs globales, tendencia 12 meses, tabla comparativa
2. **Por Cultivo**: Distribucion de costos en 3 niveles (directo, area, general)
3. **Por Area**: Analisis geografico de rentabilidad
4. **Rendimiento**: t/ha, kg/planta, comparacion con referencia nacional
5. **Clientes**: Analisis por comprador, creditos pendientes
6. **Proveedores**: Analisis por proveedor, categorias frecuentes
7. **Punto de Equilibrio**: Costos fijos vs variables, break-even

### Algoritmo de distribucion de costos
- 3 niveles: costos directos (por cultivo), costos de area (por proporcion), costos generales (por superficie)
- Clasificacion simultanea fijo/variable
- Integracion con depreciacion de activos

### Ventas con credito
- Campo `cobrado` (boolean) para tracking de pagos
- Campo `fecha_cobro` para registro de cobro
- Campo `forma_pago` (efectivo, transferencia, cheque, credito)
- Selects en cascada: cultivo -> ciclo -> cosecha -> cliente

### Costos mejorados
- Campo `tipo_costo` (fijo/variable) con auto-clasificacion por categoria
- Campo `es_mano_obra_familiar` para separar costos reales
- Vinculacion con proveedores y activos
- Smart defaults por categoria

### IA proactiva (Dashboard)
- Consejo diario personalizado basado en datos de la finca
- Recordatorios inteligentes con prioridad y acciones sugeridas
- Cache con TTL para respuestas de IA (4 horas)
- Navegacion directa desde alertas a la seccion relevante

### Respuestas accionables del chat IA
- La IA puede sugerir acciones ejecutables (crear tarea, inspeccion, aplicacion fitosanitaria, costo)
- Botones de ejecucion con un click en la interfaz del chat
- Contexto enriquecido con estadisticas de cultivos y finanzas

---

## v2.0 - Sincronizacion y Multi-dispositivo (2024)

### Sync Engine v4
- Sincronizacion bidireccional IndexedDB <-> Supabase
- Cola de sincronizacion con reintentos (max 5)
- Orden de push respetando dependencias FK
- `KNOWN_COLUMNS` para filtrar campos antes de enviar
- Deteccion de errores permanentes vs transitorios
- Auto-sync cada 30 segundos
- Sync on reconnect (evento `online`)
- `requeueUnsynced()` para re-encolar registros huerfanos
- `forceSync()` para reset completo
- Cascade check: si finca falla, hijos se saltan

### Supabase Auth
- Login/registro con email y password
- Modo offline (acceso sin conexion a datos locales)
- Refresh automatico de token antes de cada sync
- Session restore al recargar

### Row Level Security (RLS)
- RLS en todas las tablas
- Funcion `user_finca_ids()` para multi-tenancy
- Politicas CRUD completas por tabla
- Soporte para propietarios y miembros

### Miembros de finca
- Invitacion por email
- Roles: propietario, administrador, trabajador
- Acceso compartido a datos de la finca

### Service Worker
- Cache-first para archivos estaticos
- Network-first para API de Supabase y tiles de mapas
- Background sync support
- Push notifications (preparado)
- Versionado de cache (`agrofinca-v15`)

---

## v1.0 - PWA Inicial (2024)

### Arquitectura base
- Progressive Web App con Vanilla JavaScript
- Patron IIFE para modulos
- IndexedDB como base de datos local (offline-first)
- SPA router con navegacion por hash

### Modulos iniciales
- **Dashboard**: Panel principal con KPIs de la finca
- **Fincas**: CRUD de fincas con mapa Leaflet y areas georreferenciadas
- **Produccion**: Ciclos productivos, cosechas, catalogo de cultivos (22 cultivos de Ecuador)
- **Ventas**: Registro basico de ventas
- **Costos**: Registro basico de costos con 10 categorias
- **Tareas**: Planificacion con fechas, prioridades, recurrencia
- **Inspecciones**: Inspecciones de cultivo con fotos
- **Fitosanitario**: Aplicaciones fitosanitarias con periodo de carencia
- **Lombricompost**: Camas de lombricompost y registros
- **Apicultura**: Colmenas e inspecciones apicolas
- **Animales**: Lotes de animales y registros
- **Configuracion**: Ajustes del sistema y perfil

### Interfaz
- Diseño responsive (mobile-first)
- Bottom navigation para movil
- Sidebar drawer para escritorio
- FAB (Floating Action Button) para registro rapido
- Sistema de modales generico
- Toast notifications
- Graficos SVG inline (barras, lineas, dona)
- Mapas con Leaflet (Google Satellite, Esri, OSM)

### Asistente IA (basico)
- Chat con Gemini via Edge Function proxy
- Analisis de imagenes de cultivos
- Transcripcion de audio
- Recomendaciones fitosanitarias
- Multi-conversacion con historial
- Premium gating con PlanGuard

### PWA
- Manifest con iconos SVG
- Service Worker con cache de archivos estaticos
- Modo offline funcional
- Instalable en dispositivos moviles

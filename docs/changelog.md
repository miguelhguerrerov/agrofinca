# AgroFinca - Historial de Versiones

## v3.1 - Mejoras y Correcciones (2024)

### Fases fenologicas
- Visualizacion mejorada de fases con barras de progreso coloreadas (verde/ambar/rojo)
- Fechas previstas calculadas acumulativamente desde inicio del ciclo
- Indicadores visuales de tiempo real vs estimado (`actualDays/estimatedDays`)
- Soporte para edicion individual de fases
- Columna `duracion_estimada_dias` agregada a `fases_fenologicas`
- Columna `fases_template` (JSONB) agregada a `cultivos_catalogo` para templates de fases

### Validacion y correcciones
- Fix en distribucion de costos: correcta asignacion de costos generales cuando no hay cultivo_id ni area_id
- Fix en datos de IA: contexto actualizado para incluir estadisticas de cultivos y cosechas proximas
- Fix en sincronizacion: columna `activo_id` agregada a costos para vincular costos de depreciacion
- Mejoras de validacion en formularios de ventas y costos

### Documentacion
- Creacion de 12 archivos de documentacion tecnica en `docs/`

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

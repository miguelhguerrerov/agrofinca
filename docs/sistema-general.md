# AgroFinca - Arquitectura General del Sistema

## Resumen

AgroFinca es una **Progressive Web App (PWA)** para gestion agroforestal, construida con Vanilla JavaScript puro (sin frameworks). Diseñada para agricultores e ingenieros agronomos de Ecuador/Latinoamerica, funciona offline-first con sincronizacion bidireccional a la nube. Desde v4.0, soporta dos roles de usuario (**agricultor** e **ingeniero agronomo**) con navegacion y modulos condicionales por rol.

## Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| Frontend | Vanilla JS (ES6+), CSS3, HTML5 |
| Patron de modulos | IIFE (Immediately Invoked Function Expression) |
| Base de datos local | IndexedDB (`agrofinca_db`, version 8) |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| IA | Google Gemini 2.0 Flash (via Edge Function proxy) |
| Mapas | Leaflet.js + Leaflet Draw (Google Satellite, Esri, OSM) |
| Realtime | Supabase Realtime (WebSocket) para chat en vivo |
| Service Worker | Cache-first para estaticos, Network-first para API |
| Despliegue | Archivos estaticos (compatible con cualquier hosting) |

## Principios de Arquitectura

1. **Offline-first**: IndexedDB es la base de datos primaria. Toda operacion CRUD escribe primero en local.
2. **Sync Engine bidireccional**: Push (local -> Supabase) y Pull (Supabase -> local) con cola de sincronizacion.
3. **Sin frameworks**: Todo es Vanilla JS con patron IIFE para encapsulamiento de modulos.
4. **Freemium**: Plan gratuito con limites. Plan Premium desbloquea IA, exportaciones y fincas ilimitadas (`PlanGuard`).

## Estructura de Directorios

```
agrofinca/
├── index.html              # SPA - punto de entrada unico
├── manifest.json           # Configuracion PWA
├── sw.js                   # Service Worker (cache + sync)
├── supabase-schema.sql     # Schema completo de PostgreSQL
│
├── css/
│   └── styles.css          # Estilos globales (CSS variables)
│
├── icons/
│   ├── icon-192.svg
│   └── icon-512.svg
│
├── js/
│   ├── config.js           # URLs de Supabase, constantes
│   ├── db.js               # AgroDB - capa IndexedDB
│   ├── supabase-client.js  # Cliente REST de Supabase
│   ├── sync.js             # SyncEngine v4
│   ├── plan-guard.js       # Control freemium
│   ├── app.js              # Router SPA + inicializacion
│   ├── ai-cache.js         # Cache localStorage con TTL
│   ├── ai-data-helpers.js  # Agregacion de datos para IA
│   ├── gemini-client.js    # Cliente del proxy Gemini
│   │
│   ├── utils/
│   │   ├── format.js       # Formateo de moneda, numeros, iniciales
│   │   ├── dates.js        # Utilidades de fechas, rangos, progreso
│   │   ├── charts.js       # Graficos SVG inline (barras, lineas, dona)
│   │   └── photos.js       # Captura y compresion de fotos
│   │
│   └── modules/
│       ├── auth.js              # Autenticacion (Supabase Auth) + rol agricultor/ingeniero
│       ├── dashboard.js         # Panel principal con KPIs (agricultor)
│       ├── fincas.js            # Gestion de fincas y areas
│       ├── produccion.js        # Ciclos, cosechas, catalogo
│       ├── ventas.js            # Ventas + clientes
│       ├── costos.js            # Costos + proveedores + activos
│       ├── finanzas.js          # Analisis financiero 7 tabs
│       ├── tareas.js            # Planificacion de tareas
│       ├── inspecciones.js      # Inspecciones de cultivo
│       ├── fitosanitario.js     # Aplicaciones fitosanitarias
│       ├── lombricompost.js     # Camas de lombricompost
│       ├── apicultura.js        # Colmenas e inspecciones
│       ├── animales.js          # Lotes de animales
│       ├── configuracion.js     # Ajustes, perfil, upgrade
│       ├── asistente-ia.js      # Chat IA multi-conversacion
│       ├── admin.js             # Panel de administracion
│       ├── activos.js           # Activos depreciables
│       ├── ing-dashboard.js     # Dashboard ingeniero: KPIs, mapa Leaflet, alertas
│       ├── ing-agricultores.js  # Gestion de agricultores afiliados
│       ├── ing-inspecciones.js  # Inspecciones + protocolos + ensayos
│       ├── ing-prescripciones.js # Prescripciones fitosanitarias
│       ├── ing-productos.js     # Catalogo de productos del ingeniero
│       ├── ing-ventas.js        # Ventas de insumos a agricultores
│       ├── ing-chat.js          # Chat hibrido (Realtime + offline)
│       ├── ing-calendario.js    # Calendario de visitas tecnicas
│       └── ing-reportes.js      # Reportes imprimibles
│
└── supabase/
    └── functions/
        └── gemini-proxy/
            └── index.ts     # Edge Function - proxy a Gemini API
```

## Flujo de Inicializacion

1. `index.html` carga todos los scripts en orden de dependencia
2. `App.init()` se ejecuta en `DOMContentLoaded`
3. Se inicializa IndexedDB (`AgroDB.init()`)
4. Se intenta restaurar la sesion (`AuthModule.restoreSession()`)
5. Si hay sesion valida: se cargan fincas, se inicia navegacion y sync
6. Se registra el Service Worker (`sw.js`)
7. `SyncEngine.startAutoSync()` inicia sincronizacion cada 30 segundos

## Flujo de Datos

```
Usuario -> UI Module -> AgroDB (IndexedDB) -> sync_queue
                                                   |
                                          SyncEngine.pushChanges()
                                                   |
                                          Supabase (PostgreSQL)
                                                   |
                                          SyncEngine.pullChanges()
                                                   |
                                          AgroDB (actualiza local)
```

## Arquitectura de Roles (v4.0)

El sistema soporta dos roles de usuario definidos en `user_profiles.rol`:

| Rol | Valor | Descripcion |
|-----|-------|-------------|
| **Agricultor** | `'agricultor'` | Rol por defecto. Gestiona sus propias fincas |
| **Ingeniero Agronomo** | `'ingeniero'` | Profesional que asesora a multiples agricultores |

### Seleccion de rol

- En el formulario de registro, el usuario selecciona su rol (`#reg-rol`)
- Si elige `'ingeniero'`, se muestran campos adicionales: **especialidad** y **registro_profesional**
- `AuthModule.getUserRol()` retorna el rol actual; `AuthModule.isIngeniero()` es un helper booleano

### Navegacion condicional

`App.updateNavigationForRole()` oculta/muestra items de sidebar y bottom nav segun el rol:

- **Agricultor**: ve los modulos clasicos (dashboard, produccion, ventas, costos, etc.)
- **Ingeniero**: ve 9 modulos propios con prefijo `ing-` (ing-dashboard, ing-agricultores, etc.)
- Modulos compartidos: fincas (lectura para ingeniero), configuracion, asistente-ia, admin

### Pagina por defecto

```javascript
const defaultPage = AuthModule.isIngeniero() ? 'ing-dashboard' : 'dashboard';
```

## Navegacion

La app es una SPA con navegacion interna manejada por `App.navigateTo(pageName)`.

### Paginas del agricultor

- `dashboard` - Panel principal
- `fincas` - Gestion de fincas
- `produccion` - Ciclos productivos y cosechas
- `inspecciones` - Inspecciones de cultivo
- `fitosanitario` - Aplicaciones fitosanitarias
- `lombricompost` - Lombricompost
- `apicultura` - Apicultura
- `animales` - Animales de granja
- `ventas` - Registro de ventas
- `costos` - Registro de costos
- `finanzas` - Analisis financiero
- `tareas` - Planificacion
- `asistente-ia` - Chat con IA (Premium)
- `configuracion` - Ajustes del sistema
- `admin` - Panel de administracion (solo admins)

### Paginas del ingeniero agronomo (v4.0)

- `ing-dashboard` - Dashboard consolidado con KPIs, mapa Leaflet con marcadores de fincas (verde/amarillo/rojo), alertas
- `ing-agricultores` - Gestion de agricultores afiliados, ficha, vista read-only de fincas
- `ing-inspecciones` - 3 tabs: Inspecciones / Protocolos de evaluacion / Ensayos de campo
- `ing-prescripciones` - 3 tabs: Activas / Historial / Seguimiento con tracking de adherencia
- `ing-productos` - Catalogo de productos con badges de toxicidad, gestion de stock
- `ing-ventas` - Ventas de insumos a agricultores con detalle multi-linea, tracking de credito
- `ing-chat` - Chat hibrido (Supabase Realtime WebSocket + sync offline), grupos, badges de no leidos
- `ing-calendario` - Vistas mensual/semanal/hoy, GPS check-in/out, planificacion de rutas
- `ing-reportes` - 5 tipos de reportes imprimibles (inspeccion, ensayo, cartera, rendimiento, ventas)

## Comunicacion en Tiempo Real (v4.0)

El sistema incluye **Supabase Realtime** via WebSocket para el chat entre ingeniero y agricultores:

```
supabase-client.js
├── connectRealtime()      # Abre WebSocket a Supabase Realtime
├── subscribeToChat(id)    # Suscribe a cambios en chat_mensajes por conversacion_id
├── unsubscribeChat(id)    # Desuscribe de un canal
└── disconnectRealtime()   # Cierra conexion WebSocket
```

- **Protocolo**: WebSocket Phoenix Channel (`wss://<project>.supabase.co/realtime/v1/websocket`)
- **Heartbeat**: Ping cada 30 segundos para mantener conexion
- **Auto-reconnect**: Si se desconecta, reintenta en 5 segundos
- **Offline fallback**: Los mensajes se guardan en IndexedDB y se sincronizan cuando hay conexion

## Modelo de Seguridad

- **Autenticacion**: Supabase Auth (email/password) con seleccion de rol en registro
- **Autorizacion**: Row Level Security (RLS) en todas las tablas, incluyendo las 15 nuevas tablas de v4.0
- **Multi-tenancy**: Funcion `user_finca_ids()` filtra datos por fincas del usuario
- **Multi-tenancy ingeniero**: Tablas con `ingeniero_id` filtran por `auth.uid()` directamente
- **Premium**: `PlanGuard` controla acceso a funcionalidades de pago
- **Edge Functions**: Validan JWT y verifican plan premium antes de proxy a Gemini
- **Push notifications**: Service Worker maneja eventos `push` para notificaciones del servidor

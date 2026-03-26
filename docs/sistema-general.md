# AgroFinca - Arquitectura General del Sistema

## Resumen

AgroFinca es una **Progressive Web App (PWA)** para gestion agroforestal, construida con Vanilla JavaScript puro (sin frameworks). Diseñada para agricultores de Ecuador/Latinoamerica, funciona offline-first con sincronizacion bidireccional a la nube.

## Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| Frontend | Vanilla JS (ES6+), CSS3, HTML5 |
| Patron de modulos | IIFE (Immediately Invoked Function Expression) |
| Base de datos local | IndexedDB (`agrofinca_db`, version 7) |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| IA | Google Gemini 2.0 Flash (via Edge Function proxy) |
| Mapas | Leaflet.js + Leaflet Draw (Google Satellite, Esri, OSM) |
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
│       ├── auth.js          # Autenticacion (Supabase Auth)
│       ├── dashboard.js     # Panel principal con KPIs
│       ├── fincas.js        # Gestion de fincas y areas
│       ├── produccion.js    # Ciclos, cosechas, catalogo
│       ├── ventas.js        # Ventas + clientes
│       ├── costos.js        # Costos + proveedores + activos
│       ├── finanzas.js      # Analisis financiero 7 tabs
│       ├── tareas.js        # Planificacion de tareas
│       ├── inspecciones.js  # Inspecciones de cultivo
│       ├── fitosanitario.js # Aplicaciones fitosanitarias
│       ├── lombricompost.js # Camas de lombricompost
│       ├── apicultura.js    # Colmenas e inspecciones
│       ├── animales.js      # Lotes de animales
│       ├── configuracion.js # Ajustes, perfil, upgrade
│       ├── asistente-ia.js  # Chat IA multi-conversacion
│       ├── admin.js         # Panel de administracion
│       └── activos.js       # Activos depreciables
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

## Navegacion

La app es una SPA con navegacion interna manejada por `App.navigateTo(pageName)`. Las paginas disponibles son:

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

## Modelo de Seguridad

- **Autenticacion**: Supabase Auth (email/password)
- **Autorizacion**: Row Level Security (RLS) en todas las tablas
- **Multi-tenancy**: Funcion `user_finca_ids()` filtra datos por fincas del usuario
- **Premium**: `PlanGuard` controla acceso a funcionalidades de pago
- **Edge Functions**: Validan JWT y verifican plan premium antes de proxy a Gemini

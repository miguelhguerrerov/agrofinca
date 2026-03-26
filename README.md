# AgroFinca - Gestión Agroforestal

Sistema integral de gestión para fincas agroforestales. PWA offline-first construida con vanilla JavaScript, IndexedDB y Supabase.

![Version](https://img.shields.io/badge/version-3.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![PWA](https://img.shields.io/badge/PWA-ready-brightgreen)

## Demo

**[https://miguelhguerrerov.github.io/agrofinca/](https://miguelhguerrerov.github.io/agrofinca/)**

## Funcionalidades

### Gestión de Fincas
- Registro de múltiples fincas con ubicación, área y sistema de riego
- Áreas de cultivo graficables con mapas interactivos (Leaflet)
- Coordenadas GPS automáticas
- Multi-usuario por finca con roles: **Propietario** (acceso total) y **Trabajador** (acceso limitado)

### Producción
- **Catálogo de cultivos**: Perennes, estacionales, frutales, hortalizas, leguminosas, etc.
- **Ciclos productivos**: Seguimiento de siembra a cosecha con estados y fechas
- **Policultivo**: Soporte para varios cultivos en la misma área con proporciones configurables
- **Fases fenológicas**: Timeline visual para cultivos perennes (vivero, crecimiento, floración, producción)
- **Cosechas**: Registro de cantidad, calidad y unidades por ciclo con rendimiento real (t/ha, kg/planta)
- **Rendimiento vs ESPAC**: Comparación automática con datos de referencia nacional

### Actividades Especiales
- **Apicultura**: Gestión de colmenas, inspecciones, seguimiento de reinas
- **Lombricompostaje**: Camas de lombricompost, alimentación y cosecha de humus
- **Animales**: Lotes de animales, alimentación, producción, mortalidad

### Finanzas
- **Ventas**: Registro con defaults inteligentes, vinculación a cosechas, ciclos y clientes
- **Costos**: Categorización fijo/variable, asignación a áreas y cultivos, distribución proporcional
- **Directorio de clientes**: CRUD con stats (frecuencia, precio promedio, créditos pendientes)
- **Directorio de proveedores**: CRUD con stats (total gastado, concentración, categorías)
- **Activos depreciables**: Registro de herramientas/infraestructura con depreciación mensual automática
- **Costos ocultos**: Visibilización de M.O. familiar + depreciación
- **Cuentas por cobrar**: Seguimiento de ventas a crédito
- **Análisis financiero** (7 pestañas):
  - Resumen: KPIs, costos ocultos, tendencias 12 meses
  - Por Cultivo: Rentabilidad con costos distribuidos (directos + área + generales)
  - Por Área: Ganancia por m² y por ha, policultivo
  - Rendimiento: Real vs ESPAC, kg/planta, calidad A/B/C
  - Clientes: Quién paga mejor, frecuencia, estacionalidad
  - Proveedores: Concentración, oportunidades de negociación
  - Punto de Equilibrio: PE por cultivo, brecha de área, plantas adicionales necesarias
- **Exportación CSV** (premium)
- Selector de período: mes actual, trimestre, año, rango personalizado

### Inspecciones y Fitosanitario
- Inspecciones de campo con fotos (cámara o galería)
- Registro de plagas, enfermedades, estado de follaje y suelo
- Aplicaciones fitosanitarias con dosis, período de carencia y toxicidad
- Análisis con IA de fotos de cultivos (premium)

### Planificación
- Tareas programadas con prioridad y recurrencia
- Asignación a miembros de la finca
- Vista de tareas del fin de semana en dashboard

### Asistente IA (Premium)
- Chat conversacional con contexto de la finca
- Análisis de fotos de cultivos para diagnóstico de plagas/enfermedades
- Recomendaciones fitosanitarias personalizadas
- Transcripción de audio
- Sugerencias de optimización de producción
- Modelo: Google Gemini vía Edge Functions seguras

### Dashboard
- KPIs del mes: ventas, costos, ganancia
- Gráfico de ingresos vs costos (12 meses)
- Ciclos activos, tareas pendientes, cosechas recientes
- Comparación mensual con porcentaje de cambio
- Top 3 productos por ingresos
- Vista de áreas de cultivo con mapa

## Arquitectura

```
agrofinca/
├── index.html              # SPA entry point
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (cache-first)
├── css/
│   └── styles.css          # Design system con CSS variables
├── js/
│   ├── config.js           # Configuración centralizada
│   ├── app.js              # Router SPA y navegación
│   ├── db.js               # IndexedDB (base de datos local)
│   ├── supabase-client.js  # Cliente Supabase
│   ├── sync.js             # Motor de sincronización offline-first
│   ├── plan-guard.js       # Gating de features freemium
│   ├── gemini-client.js    # Cliente para IA (Edge Functions)
│   ├── modules/
│   │   ├── auth.js         # Login / registro
│   │   ├── dashboard.js    # Panel principal
│   │   ├── fincas.js       # Gestión de fincas
│   │   ├── produccion.js   # Cultivos y ciclos
│   │   ├── ventas.js       # Registro de ventas
│   │   ├── costos.js       # Registro de costos
│   │   ├── finanzas.js     # Análisis financiero
│   │   ├── inspecciones.js # Inspecciones de campo
│   │   ├── fitosanitario.js# Control fitosanitario
│   │   ├── tareas.js       # Planificación de tareas
│   │   ├── apicultura.js   # Gestión apícola
│   │   ├── lombricompost.js# Lombricompostaje
│   │   ├── animales.js     # Producción animal
│   │   ├── asistente-ia.js # Asistente IA (7 tipos de acciones ejecutables)
│   │   ├── activos.js      # Gestión de activos depreciables
│   │   ├── configuracion.js# Ajustes y plan
│   │   └── admin.js        # Panel de administración
│   └── utils/
│       ├── format.js       # Formateo de moneda, números, fechas
│       ├── dates.js        # Utilidades de fechas
│       ├── charts.js       # Gráficos (Chart.js wrapper)
│       └── photos.js       # Captura y compresión de fotos
├── icons/                  # Iconos PWA (192px, 512px)
└── supabase/
    └── functions/
        ├── gemini-proxy/   # Proxy seguro para Gemini API
        ├── admin-api/      # API de administración
        └── payment-webhook/# Webhook de pagos PayPal
```

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| Base de datos local | IndexedDB |
| Backend / Auth | Supabase (PostgreSQL + Auth + RLS) |
| Sincronización | Offline-first con sync bidireccional |
| IA | Google Gemini (vía Supabase Edge Functions) |
| Mapas | Leaflet + Leaflet Draw |
| Gráficos | Chart.js |
| Pagos | PayPal JS SDK |
| Hosting | GitHub Pages |
| PWA | Service Worker (cache-first) |

## Modelo Freemium

| Funcionalidad | Gratis | Premium |
|---|:---:|:---:|
| Gestión de fincas | Hasta 2 | Ilimitadas |
| Producción, ventas, costos | Si | Si |
| Dashboard básico | Si | Si |
| Tareas | Si | Si |
| Asistente IA (Gemini) | - | Si |
| Análisis financiero avanzado | Solo KPIs | Completo |
| Inspecciones con IA | - | Si |
| Input de audio | - | Si |
| Recomendaciones fitosanitarias IA | - | Si |
| Exportar reportes CSV | - | Si |

## Instalación Local

1. Clona el repositorio:
```bash
git clone https://github.com/miguelhguerrerov/agrofinca.git
cd agrofinca
```

2. Sirve los archivos con cualquier servidor HTTP:
```bash
python -m http.server 8080
```

3. Abre `http://localhost:8080` en tu navegador.

La app funciona completamente offline usando IndexedDB. Para habilitar la sincronización en la nube, se requiere configurar Supabase.

## Configuración de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ejecuta `supabase-schema.sql` en el SQL Editor
3. Configura los Secrets para Edge Functions:
   - `GEMINI_API_KEY` - API key de Google Gemini
   - `SB_SERVICE_ROLE_KEY` - Service role key del proyecto
4. Despliega las Edge Functions:
```bash
npx supabase functions deploy gemini-proxy --project-ref <tu-ref>
npx supabase functions deploy admin-api --project-ref <tu-ref>
npx supabase functions deploy payment-webhook --project-ref <tu-ref>
```

## Seguridad

- **Row Level Security (RLS)**: Cada usuario solo accede a sus datos
- **Edge Functions**: Las API keys nunca se exponen al frontend
- **JWT Validation**: Todas las Edge Functions validan el token de autenticación
- **Roles de finca**: Trabajadores tienen acceso limitado (sin finanzas ni gestión de miembros)

## Autor

**Miguel Guerrero** - [@miguelhguerrerov](https://github.com/miguelhguerrerov)

## Licencia

MIT

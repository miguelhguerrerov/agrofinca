# AgroFinca - Frontend

## Patron de Modulos (IIFE)

Todos los modulos del frontend usan el patron **IIFE** (Immediately Invoked Function Expression):

```javascript
const NombreModule = (() => {
  // Variables privadas
  let _estado = 'inicial';

  // Funciones privadas
  function funcionPrivada() { /* ... */ }

  // Funcion render (punto de entrada)
  async function render(container, fincaId) {
    if (!fincaId) {
      container.innerHTML = '<div class="empty-state">...</div>';
      return;
    }
    // Cargar datos de IndexedDB
    const datos = await AgroDB.getByIndex('tabla', 'finca_id', fincaId);
    // Generar HTML
    container.innerHTML = `<div>...</div>`;
    // Enlazar event listeners
    container.querySelector('#btn').addEventListener('click', handler);
  }

  // API publica
  return {
    render,
    funcionPublica
  };
})();
```

### Convencion de nomenclatura

- Modulos: `NombreModule` (PascalCase + Module)
- Variables privadas: `_prefijo` (underscore)
- Funciones de render: `render(container, fincaId)`
- Funciones de formulario: `showFormulario(fincaId, itemId?)`

## Routing y Navegacion (App.js)

### Registro de paginas

```javascript
const pages = {
  // Modulos del agricultor (15)
  dashboard: () => DashboardModule,
  fincas: () => FincasModule,
  produccion: () => ProduccionModule,
  ventas: () => VentasModule,
  costos: () => CostosModule,
  finanzas: () => FinanzasModule,
  // ...mas modulos agricultor...

  // Modulos del ingeniero (9) - v4.0
  'ing-dashboard': () => IngDashboardModule,
  'ing-agricultores': () => IngAgricultoresModule,
  'ing-inspecciones': () => IngInspeccionesModule,
  'ing-prescripciones': () => IngPrescripcionesModule,
  'ing-productos': () => IngProductosModule,
  'ing-ventas': () => IngVentasModule,
  'ing-chat': () => IngChatModule,
  'ing-calendario': () => IngCalendarioModule,
  'ing-reportes': () => IngReportesModule
};
```

Total: **24 paginas** (15 agricultor + 9 ingeniero).

### Navegacion

```javascript
App.navigateTo('produccion');
// 1. Actualiza currentPage
// 2. Actualiza titulo en top bar
// 3. Marca link activo en sidebar y bottom nav
// 4. Llama module.render(mainContent, currentFincaId)
// 5. Actualiza estado del FAB
// 6. Scroll to top
```

### Navegacion condicional por rol (v4.0)

`App.updateNavigationForRole()` oculta/muestra items del sidebar y bottom nav segun el rol del usuario:

```javascript
function updateNavigationForRole() {
  const isIng = AuthModule.isIngeniero();

  // Ocultar nav del agricultor cuando es ingeniero
  const agriNav = ['dashboard', 'produccion', 'ventas', 'costos', 'finanzas', 'tareas', 'inspecciones', 'fitosanitario'];
  const ingNav = ['ing-dashboard', 'ing-agricultores', 'ing-inspecciones', 'ing-prescripciones', 'ing-productos', 'ing-ventas', 'ing-chat', 'ing-calendario', 'ing-reportes'];

  for (const id of agriNav) {
    const el = document.querySelector(`[data-page="${id}"]`);
    if (el) el.closest('li, .nav-item')?.style.setProperty('display', isIng ? 'none' : '');
  }
  for (const id of ingNav) {
    const el = document.querySelector(`[data-page="${id}"]`);
    if (el) el.closest('li, .nav-item')?.style.setProperty('display', isIng ? '' : 'none');
  }
}
```

La pagina por defecto al hacer login depende del rol:
```javascript
const defaultPage = AuthModule.isIngeniero() ? 'ing-dashboard' : 'dashboard';
```

### Selector de finca

El selector de finca en el top bar (`#finca-selector`) determina `currentFincaId`. Al cambiar:
1. Se guarda en `localStorage` (`agrofinca_current_finca`)
2. Se llama `refreshCurrentPage()` que re-renderiza el modulo actual

**Nota**: Para ingenieros, el selector de finca no aplica de la misma forma, ya que sus modulos trabajan con multiples fincas a la vez a traves de `ingeniero_agricultores`.

## Sistema de Modales

### Modal generico

```javascript
App.showModal('Titulo', '<div>HTML del body</div>', '<div>HTML del footer</div>');
App.closeModal();
```

Estructura HTML:
```html
<div id="modal-overlay" class="modal-overlay">
  <div id="modal-container" class="modal-container">
    <div class="modal-header">
      <h3 id="modal-title">Titulo</h3>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <div id="modal-body" class="modal-body"></div>
    <div id="modal-footer" class="modal-footer"></div>
  </div>
</div>
```

Cierre por: boton X, click en overlay, o `App.closeModal()`.

## Sistema de Tabs

Patron usado en Produccion, Ventas, Costos, Finanzas:

```javascript
// Estado del tab
let _currentTab = 'costos';

// Render tabs
container.innerHTML = `
  <div class="tabs-row">
    <button class="tab-btn ${_currentTab === 'costos' ? 'active' : ''}" data-tab="costos">Costos</button>
    <button class="tab-btn ${_currentTab === 'proveedores' ? 'active' : ''}" data-tab="proveedores">Proveedores</button>
  </div>
  <div id="tab-content"></div>
`;

// Binding
container.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _currentTab = btn.dataset.tab;
    render(container, fincaId); // Re-render completo
  });
});
```

## Componentes de Tarjeta (Cards)

### Summary cards (KPIs)

```html
<div class="summary-grid">
  <div class="summary-card">
    <div class="s-icon green">icono</div>
    <div class="s-data">
      <div class="s-value">42</div>
      <div class="s-label">Descripcion</div>
    </div>
  </div>
</div>
```

### Cards de registro

```html
<div class="card">
  <div style="display:flex;justify-content:space-between">
    <div>
      <strong>Titulo</strong>
      <div class="card-subtitle">Subtitulo</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700;color:var(--green-700)">$100.00</div>
    </div>
  </div>
  <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
    <button class="btn btn-xs btn-outline">Editar</button>
    <button class="btn btn-xs btn-danger">Eliminar</button>
  </div>
</div>
```

## Toast Notifications

```javascript
App.showToast('Mensaje', 'info', 3000);   // info, success, warning, error
```

Los toasts se apilan en `#toast-container` y desaparecen automaticamente con animacion.

## FAB (Floating Action Button)

Boton flotante `+` que abre un action sheet con acciones rapidas:

- Registrar Cosecha
- Registrar Venta
- Registrar Costo
- Nueva Inspeccion
- Aplicacion Fitosanitaria
- Nueva Tarea

Las acciones se desactivan visualmente si no hay datos prerequisito (e.g., cosecha requiere ciclo activo).

## PWA (Progressive Web App)

### manifest.json

```json
{
  "name": "AgroFinca",
  "short_name": "AgroFinca",
  "start_url": "./",
  "display": "standalone",
  "theme_color": "#2E7D32",
  "background_color": "#ffffff"
}
```

### Meta tags

```html
<meta name="theme-color" content="#2E7D32">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

## Diseño Responsive

### Layout principal

- **Desktop**: Sidebar fija a la izquierda + contenido principal
- **Mobile**: Sidebar como drawer (hamburger menu) + bottom navigation de 5 items

### Bottom Navigation (mobile)

5 items fijos: Dashboard, Produccion, Ventas, Costos, Mas (abre grid de todas las paginas)

### CSS Variables (tema)

El sistema usa CSS custom properties para colores consistentes:

```css
:root {
  --primary: #2E7D32;        /* Verde principal */
  --primary-dark: #1B5E20;
  --surface: #ffffff;
  --text-primary: #212121;
  --text-secondary: #757575;
  --gray-200: #EEEEEE;
  --green-700: #388E3C;
  --red-500: #F44336;
  --amber-500: #FFA000;
  /* ... */
}
```

## Graficos

Los graficos se generan con SVG inline a traves de `js/utils/charts.js`. No hay dependencias externas para graficos. Tipos disponibles:

- Barras verticales
- Lineas
- Dona (donut)

## Mapas

Se usa Leaflet.js con:
- Google Satellite (default)
- Esri World Imagery
- OpenStreetMap (calles)
- Leaflet Draw para dibujar poligonos de areas

## Sync Diagnostics (v4.1)

### Nuevo modulo: sync-diagnostics.js

Pagina dedicada al diagnostico del estado de sincronizacion, accesible desde el indicador de sync en la barra superior.

### UI de sync mejorada

El indicador de estado de sync en la barra superior ahora muestra 5 estados visuales:

| Estado | Icono/Color | Descripcion |
|--------|-------------|-------------|
| `unreachable` | Gris | Servidor no disponible (health check fallo) |
| `has-errors` | Rojo | Hay items con error permanente en la cola |
| `has-conflicts` | Naranja | Hay conflictos sin resolver |
| `pending` | Azul (animado) | Sincronizacion en progreso o items pendientes |
| `synced` | Verde | Todo sincronizado correctamente |

### Status indicator clickable

El indicador de sync es clickable. Al hacer tap/click, navega directamente a la pagina de diagnostico (`sync-diagnostics`).

### Toasts automaticos

Se muestran toasts automaticos para:
- **Errores permanentes**: Cuando un item falla con error 400/404, se muestra un toast de tipo `error` indicando la tabla y el registro afectado.
- **Conflictos detectados**: Cuando se detecta un conflicto durante el pull, se muestra un toast de tipo `warning` indicando cuantos conflictos nuevos hay.

---

## Carga de Scripts

Los scripts se cargan en orden de dependencia en `index.html`:

1. Librerias externas (Leaflet)
2. Config
3. Utilidades (format, dates, charts, photos)
4. Core (db, supabase-client, sync, plan-guard)
5. IA (ai-cache, ai-data-helpers, gemini-client)
6. Modulos (auth, fincas, dashboard, produccion, ...)
7. App (controlador principal - siempre ultimo)

No se usan import/export de ES modules; todo se carga como scripts globales.

## Modulos del Ingeniero Agronomo (v4.0)

9 modulos nuevos con prefijo `ing-`, todos en `js/modules/`:

### ing-dashboard.js (IngDashboardModule)

Dashboard consolidado del ingeniero:
- **KPIs**: Total agricultores, fincas, hectareas, ciclos activos, alertas
- **Mapa Leaflet**: Marcadores de fincas con colores segun estado fitosanitario (verde = bueno, amarillo = alerta, rojo = critico)
- **Alertas**: Lista priorizada de fincas con inspecciones vencidas o problemas

### ing-agricultores.js (IngAgricultoresModule)

Gestion de agricultores afiliados:
- Lista de agricultores con estado de afiliacion
- **Ficha** del agricultor: datos personales, fincas, historial
- **Vista read-only** de fincas del agricultor (areas, ciclos, inspecciones)
- Afiliacion/desafiliacion de agricultores

### ing-inspecciones.js (IngInspeccionesModule)

Modulo con **3 tabs**:
- **Inspecciones**: Inspecciones realizadas con `ingeniero_id`, grid dinamico para datos de campo (`datos_evaluacion` JSONB)
- **Protocolos**: CRUD de protocolos de evaluacion reutilizables (variables, escalas, formulas)
- **Ensayos**: Ensayos de campo con tratamientos (incluyendo testigo) y evaluaciones multiples

### ing-prescripciones.js (IngPrescripcionesModule)

Prescripciones fitosanitarias con **3 tabs**:
- **Activas**: Prescripciones pendientes o en ejecucion
- **Historial**: Prescripciones completadas o canceladas
- **Seguimiento**: Tracking de adherencia del agricultor a la prescripcion

### ing-productos.js (IngProductosModule)

Catalogo de productos del ingeniero:
- CRUD de productos con **badges de toxicidad** (banda I, II, III, IV)
- Gestion de **stock** (entrada, salida, stock actual)
- Registro sanitario, cultivos autorizados, dosis recomendada, carencia

### ing-ventas.js (IngVentasModule)

Ventas de insumos a agricultores:
- Formulario con **detalle multi-linea** (ventas_insumos + ventas_insumos_detalle)
- Vinculacion opcional con prescripcion
- **Tracking de credito**: cobrado/pendiente, fecha de cobro
- Resumen por agricultor

### ing-chat.js (IngChatModule)

Chat hibrido entre ingeniero y agricultores:
- **Realtime**: WebSocket via `SupabaseClient.subscribeToChat()` para mensajes en vivo
- **Offline**: Mensajes se guardan en IndexedDB y se sincronizan cuando hay conexion
- **Tipos de conversacion**: Individual (1-a-1) y grupal
- **Grupos**: Solo el ingeniero puede crear grupos y agregar miembros
- **Badges de no leidos**: Contador de mensajes no leidos por conversacion
- **Vinculo con inspecciones**: Posibilidad de compartir reportes de inspeccion en el chat

### ing-calendario.js (IngCalendarioModule)

Calendario de visitas tecnicas:
- **3 vistas**: Mensual, semanal, hoy
- **GPS check-in/check-out**: Registro de hora y ubicacion de llegada/salida
- **Planificacion de rutas**: Basada en `programacion_inspecciones`
- Vinculacion de visitas tecnicas con inspecciones

### ing-reportes.js (IngReportesModule)

5 tipos de reportes imprimibles:
1. **Reporte de inspeccion**: Detalle de una inspeccion con fotos y recomendaciones
2. **Reporte de ensayo**: Resultados con estadisticas por tratamiento
3. **Reporte de cartera**: Resumen de agricultores y estado de fincas
4. **Reporte de rendimiento**: Comparativo de rendimiento por finca/cultivo
5. **Reporte de ventas**: Ventas de insumos con totales por periodo

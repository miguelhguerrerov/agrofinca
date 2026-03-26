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
  dashboard: () => DashboardModule,
  fincas: () => FincasModule,
  produccion: () => ProduccionModule,
  // ...15 paginas totales
};
```

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

### Selector de finca

El selector de finca en el top bar (`#finca-selector`) determina `currentFincaId`. Al cambiar:
1. Se guarda en `localStorage` (`agrofinca_current_finca`)
2. Se llama `refreshCurrentPage()` que re-renderiza el modulo actual

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

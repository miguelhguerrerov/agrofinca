# AgroFinca - Modulo de Fincas

**Archivo**: `js/modules/fincas.js`

## Estructura

El modulo de fincas tiene dos vistas principales:

1. **Lista de fincas** - Todas las fincas del usuario (propias y como miembro)
2. **Detalle de finca** - Vista con tabs: Areas, Miembros, Info

## Gestion de Fincas (CRUD)

### Crear finca

Campos del formulario:
- **Nombre** (obligatorio)
- **Ubicacion** (texto libre)
- **Descripcion**
- **Area total** (m2, con conversion automatica a hectareas)
- **Sistema de riego** (seleccion)
- **Coordenadas GPS** (latitud/longitud, opcional via mapa)

Al crear una finca:
1. Se asigna `propietario_id = AuthModule.getUserId()`
2. Se ejecuta `AgroDB.seedDefaultCrops(fincaId)` para cargar catalogo de 22 cultivos
3. Se crea automaticamente un registro en `finca_miembros` como propietario
4. Plan gratuito limita a `AppConfig.FREE_FARM_LIMIT` fincas (verificado con `PlanGuard.canAddFarmAsync()`)

### Editar finca

Mismos campos que la creacion. Solo el propietario puede editar.

### Eliminar finca

Eliminar una finca borra en cascada todos los datos asociados (areas, ciclos, cosechas, ventas, costos, etc.) gracias a `ON DELETE CASCADE` en la base de datos.

## Areas

### Tipos de area

| Valor | Etiqueta | Icono | Color |
|-------|----------|-------|-------|
| `productivo` | Productivo | planta | Verde (#4CAF50) |
| `proteccion` | Proteccion | arbol | Azul (#2196F3) |
| `procesamiento` | Procesamiento | fabrica | Ambar (#FFA000) |
| `almacenamiento` | Almacenamiento | caja | Cafe (#795548) |
| `infraestructura` | Infraestructura | casa | Gris (#9E9E9E) |
| `otros` | Otros | pin | Gris (#616161) |

### Campos del area

- **Nombre** (obligatorio)
- **Tipo** (seleccion de la taxonomia)
- **Area en m2** (con conversion automatica a hectareas)
- **Cultivo actual** (seleccion del catalogo)
- **Color** (para visualizacion en mapa)
- **Poligono GeoJSON** (dibujado en mapa)
- **Notas**

### Mapa interactivo

Cada finca tiene un mapa Leaflet para dibujar areas:

```javascript
function createMapWithLayers(elementId, lat, lng, zoom) {
  // Capas disponibles:
  // - Google Satellite (default)
  // - Esri World Imagery
  // - OpenStreetMap (calles)
  // - Etiquetas viales (overlay)
  // + Escala metrica
}
```

Se usa **Leaflet Draw** para:
- Dibujar poligonos (areas)
- Calcular superficie automaticamente del poligono
- Almacenar como GeoJSON

### Conversion de unidades

```
area_m2 / 10000 = hectareas
```

El area se almacena siempre en m2, pero se muestra en la unidad mas legible:
- < 10000 m2: se muestra en m2
- >= 10000 m2: se muestra en hectareas

### Policultivo en areas

Cuando un area tiene multiples cultivos (via `area_cultivos`), se muestra la composicion:

```
Lote A (5000 m2)
├── Cacao 70% (3500 m2)
├── Platano 20% (1000 m2)
└── Cafe 10% (500 m2)
```

## Miembros de Finca

### Roles

| Rol | Permisos |
|-----|----------|
| `propietario` | CRUD completo, gestion de miembros, eliminar finca |
| `administrador` | CRUD de datos, invitar trabajadores |
| `trabajador` | Lectura + registro de datos basicos |

### Invitacion de miembros

1. Propietario ingresa email del nuevo miembro
2. Se crea registro en `finca_miembros` con `estado_invitacion: 'activa'`
3. El miembro ve la finca automaticamente al iniciar sesion (RLS via `user_finca_ids()`)

### Vista de miembros

Lista de miembros con:
- Avatar (iniciales)
- Nombre y email
- Rol (badge de color)
- Boton para cambiar rol o eliminar (solo propietario)

## Vista de Detalle

Al seleccionar una finca, se muestra una vista con tabs:

### Tab Areas
- Lista de areas agrupadas por tipo
- Cards con nombre, superficie, cultivo actual, color
- Mapa con todos los poligonos

### Tab Miembros
- Lista de miembros con roles
- Formulario de invitacion

### Tab Info
- Datos generales de la finca
- Resumen: total areas, area cultivada, cultivos activos
- Botones de editar/eliminar

## Acceso del Ingeniero Agronomo (v4.0)

El ingeniero agronomo puede ver las fincas de sus agricultores afiliados en **modo lectura**:

- A traves del modulo `ing-agricultores.js`, el ingeniero accede a la ficha del agricultor
- Desde la ficha, puede ver las fincas del agricultor con sus areas, ciclos e inspecciones
- La vista es **read-only**: el ingeniero no puede crear, editar ni eliminar datos de la finca del agricultor
- El ingeniero puede crear inspecciones y prescripciones vinculadas a las fincas del agricultor (desde sus propios modulos `ing-inspecciones` e `ing-prescripciones`)


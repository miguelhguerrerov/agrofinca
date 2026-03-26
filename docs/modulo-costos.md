# AgroFinca - Modulo de Costos

**Archivo**: `js/modules/costos.js` y `js/modules/activos.js`

## Estructura

El modulo de costos tiene **3 tabs**:

| Tab | Descripcion |
|-----|-------------|
| **Costos** | Registro y listado de costos |
| **Proveedores** | Directorio CRUD de proveedores |
| **Activos** | Activos depreciables con auto-depreciacion |

## Tab: Costos

### Categorias de costo

```javascript
const CATEGORIAS = [
  { value: 'insumo',                label: 'Insumo',                   icon: 'planta' },
  { value: 'mano_obra_contratada',  label: 'Mano de obra contratada',  icon: 'obrero' },
  { value: 'mano_obra_familiar',    label: 'Mano de obra familiar',    icon: 'agricultor' },
  { value: 'herramienta',           label: 'Herramienta',              icon: 'llave' },
  { value: 'infraestructura',       label: 'Infraestructura',          icon: 'construccion' },
  { value: 'transporte',            label: 'Transporte',               icon: 'camion' },
  { value: 'fitosanitario',         label: 'Fitosanitario',            icon: 'quimica' },
  { value: 'riego',                 label: 'Riego',                    icon: 'agua' },
  { value: 'empaque',               label: 'Empaque',                  icon: 'caja' },
  { value: 'otro',                  label: 'Otro',                     icon: 'documento' }
];
```

### Clasificacion fijo/variable

Se clasifica automaticamente segun la categoria:

```javascript
// Variables
const VARIABLE_CATEGORIES = [
  'insumo', 'mano_obra_contratada', 'mano_obra_familiar',
  'fitosanitario', 'empaque', 'transporte'
];

// Fijos
const FIXED_CATEGORIES = ['herramienta', 'infraestructura', 'riego'];
```

El campo `tipo_costo` se guarda en el registro y se usa en el analisis financiero para calcular punto de equilibrio.

### Formulario de costo

Campos del formulario:

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| Fecha | date | Fecha del costo |
| Categoria | select | De la lista de categorias |
| Subcategoria | text | Opcional, detalle libre |
| Descripcion | text | Que se compro/pago |
| Cultivo | select | Opcional, para costo directo |
| Ciclo | select | Opcional, vinculado a ciclo |
| Area | select | Opcional, para costo de area |
| Cantidad | number | Cantidad comprada |
| Unidad | text | Unidad de medida |
| Costo unitario | number | Precio por unidad |
| Total | number | Auto-calculado o manual |
| Proveedor | select | Del directorio de proveedores |
| Mano de obra familiar | checkbox | Marca si es trabajo familiar |
| Notas | textarea | Observaciones |

### Smart defaults

Al abrir el formulario, se pre-llenan valores del ultimo costo registrado:
- Misma categoria seleccionada previamente
- Proveedor frecuente por categoria

```javascript
async function getLastCostDefaults(fincaId) {
  const costos = await AgroDB.query('costos', r => r.finca_id === fincaId);
  const sorted = [...costos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lastByCategory = {};
  sorted.forEach(c => {
    if (!lastByCategory[c.categoria]) lastByCategory[c.categoria] = c;
  });
  return { last: sorted[0], lastByCategory };
}
```

### Quick Cost

`CostosModule.showQuickCost(fincaId)` abre un modal simplificado accesible desde el FAB.

## Tab: Proveedores

### CRUD de proveedores

Campos:
- **Nombre** (obligatorio)
- **Telefono**
- **Email**
- **Ubicacion**
- **Tipo**: insumos, herramientas, transporte, fitosanitario, servicios, otro
- **Productos frecuentes** (texto libre)
- **Notas**
- **Activo** (boolean, para desactivar sin borrar)

### Vinculacion con costos

Al registrar un costo, se puede seleccionar un proveedor del directorio. Esto llena automaticamente el campo `proveedor_id` y `proveedor` (nombre).

### Vista de proveedores

Lista de cards con:
- Nombre y tipo
- Telefono y email (con links para llamar/escribir en mobile)
- Productos frecuentes
- Total gastado (calculado de costos con ese `proveedor_id`)
- Botones editar/desactivar

## Tab: Activos

**Archivo**: `js/modules/activos.js`

### Concepto

Los activos son bienes depreciables de la finca (herramientas, infraestructura, vehiculos, sistemas de riego).

### Categorias de activos

```javascript
const CATEGORIAS = [
  { value: 'herramienta',     label: 'Herramienta' },
  { value: 'infraestructura', label: 'Infraestructura' },
  { value: 'vehiculo',        label: 'Vehiculo' },
  { value: 'riego',           label: 'Sistema de riego' },
  { value: 'otro',            label: 'Otro' }
];
```

### Campos del activo

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| Nombre | text | Nombre del activo |
| Categoria | select | Tipo de activo |
| Fecha adquisicion | date | Cuando se compro |
| Costo adquisicion | number | Precio de compra |
| Vida util (meses) | number | Duracion esperada |
| Valor residual | number | Valor al final de vida util |
| Area | select | Area asociada (opcional) |
| Cultivo | select | Cultivo asociado (opcional) |
| Estado | - | activo o dado_de_baja |
| Notas | textarea | Observaciones |

### Depreciacion automatica

La depreciacion se calcula con el **metodo de linea recta**:

```
depreciacion_mensual = (costo_adquisicion - valor_residual) / vida_util_meses
```

#### Generacion automatica

`ActivosModule.generarDepreciacion(fincaId)` se ejecuta automaticamente:
1. Al renderizar el tab de Activos
2. Al renderizar el modulo de Finanzas

Logica:
1. Para cada activo con `estado = 'activo'`
2. Desde la fecha de adquisicion hasta hoy
3. Para cada mes que no tenga registro en `depreciacion_mensual`
4. Crea un registro con el monto mensual

```javascript
// Registro de depreciacion mensual
{
  finca_id: '...',
  activo_id: '...',
  mes: '2024-06',        // Formato YYYY-MM
  monto: 41.67,          // Depreciacion del mes
  area_id: '...',        // Heredado del activo
  cultivo_id: '...'      // Heredado del activo
}
```

### Creacion automatica de costo

Al crear un activo, se crea automaticamente un registro de costo:
- Categoria: segun tipo de activo (herramienta, infraestructura, etc.)
- Total: costo de adquisicion
- Descripcion: nombre del activo
- Tipo costo: 'fijo'
- activo_id: ID del activo

### Dar de baja

Al dar de baja un activo:
1. Se cambia `estado` a `dado_de_baja`
2. Se detiene la generacion de depreciacion futura
3. El activo se muestra con opacidad reducida en la lista

### Vista de activos

Cada card muestra:
- Nombre y categoria
- **Valor actual**: costo - depreciacion acumulada
- **Depreciacion mensual**: monto por mes
- Datos: costo original, vida util, depreciacion acumulada
- Botones: editar, dar de baja

KPIs en la cabecera:
- Valor total de activos activos
- Depreciacion mensual total

# AgroFinca - Modulo de Ventas

**Archivo**: `js/modules/ventas.js`

## Estructura

El modulo de ventas tiene **2 tabs**:

| Tab | Descripcion |
|-----|-------------|
| **Ventas** | Registro y listado de ventas |
| **Clientes** | Directorio CRUD de clientes/compradores |

## Tab: Ventas

### Formulario de venta

El formulario usa **selects en cascada** para vincular la venta a datos existentes:

```
Cultivo -> Ciclo productivo -> Cosecha -> Cliente
```

#### Campos del formulario

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| Fecha | date | Fecha de la venta |
| Cultivo | select | Del catalogo de cultivos |
| Ciclo | select | Ciclos del cultivo seleccionado |
| Cosecha | select | Cosechas del ciclo seleccionado (opcional) |
| Area | select | Areas del ciclo (auto-llenado) |
| Producto | text | Nombre del producto vendido |
| Cantidad | number | Cantidad vendida |
| Unidad | text | Unidad de medida |
| Precio unitario | number | Precio por unidad |
| Total | number | Auto-calculado (cantidad * precio) |
| Cliente | select | Del directorio de clientes |
| Comprador | text | Nombre libre (si no usa directorio) |
| Forma de pago | select | Efectivo, transferencia, cheque, credito |
| Cobrado | checkbox | Si se ha cobrado |
| Fecha cobro | date | Cuando se cobro (si aplica) |
| Notas | textarea | Observaciones |

### Smart Defaults

El sistema recuerda la ultima venta y pre-llena valores inteligentemente:

```javascript
async function getLastSaleDefaults(fincaId) {
  const ventas = await AgroDB.query('ventas', r => r.finca_id === fincaId);
  const sorted = [...ventas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const last = sorted[0];

  // Ultimo precio por producto
  const priceByProduct = {};
  sorted.forEach(v => {
    const key = v.cultivo_id || v.producto;
    if (key && !priceByProduct[key]) priceByProduct[key] = v.precio_unitario;
  });

  // Ultimo comprador por producto
  const buyerByProduct = {};
  sorted.forEach(v => {
    const key = v.cultivo_id || v.producto;
    if (key && !buyerByProduct[key]) buyerByProduct[key] = v.comprador;
  });

  return { last, priceByProduct, buyerByProduct,
           lastBuyer: last.comprador, lastPayMethod: last.forma_pago };
}
```

### Precio por cliente

Ademas de los defaults generales, se consulta el ultimo precio que un cliente especifico pago por un producto:

```javascript
async function getLastClientPrice(fincaId, clienteId, cultivoId) {
  const ventas = await AgroDB.query('ventas',
    r => r.finca_id === fincaId && r.cliente_id === clienteId && r.cultivo_id === cultivoId
  );
  const sorted = [...ventas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return sorted[0]?.precio_unitario || null;
}
```

Esto permite que al seleccionar un cliente, el precio se ajuste al historico de ese cliente.

### Quick Sale

`VentasModule.showQuickSale(fincaId)` abre un modal simplificado accesible desde el FAB.

### Vista de ventas

Lista de ventas ordenadas por fecha (mas reciente primero). Cada card muestra:
- Cultivo/producto
- Fecha
- Cantidad y unidad
- Precio unitario
- Total
- Comprador/cliente
- Badge de cobrado/pendiente
- Botones editar/eliminar

## Tracking de Credito

### Campos relevantes

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `cobrado` | BOOLEAN | Si la venta se cobro (default: true) |
| `fecha_cobro` | DATE | Fecha en que se cobro |
| `forma_pago` | TEXT | Metodo de pago |

### Flujo de credito

1. Se registra venta con `cobrado = false` y `forma_pago = 'credito'`
2. La venta aparece con badge "Pendiente" en rojo
3. Al cobrar, se edita la venta: `cobrado = true`, `fecha_cobro = hoy`
4. En el tab Clientes de Finanzas se muestran creditos pendientes por cliente

## Tab: Clientes

### CRUD de clientes

Campos:
- **Nombre** (obligatorio)
- **Telefono**
- **Email**
- **Ubicacion**
- **Tipo**: mayorista, minorista, restaurante, mercado, exportador, otro
- **Notas**
- **Activo** (boolean)

### Vista de clientes

Lista de cards con:
- Nombre y tipo (badge)
- Informacion de contacto (con links tel: y mailto:)
- Total comprado (calculado de ventas con ese `cliente_id`)
- Creditos pendientes (ventas con `cobrado = false`)
- Botones editar/desactivar

### Vinculacion con ventas

Al registrar una venta, se puede seleccionar un cliente del directorio. Esto:
1. Llena `cliente_id` en la venta
2. Llena `comprador` con el nombre del cliente
3. Activa la busqueda de precio historico para ese cliente

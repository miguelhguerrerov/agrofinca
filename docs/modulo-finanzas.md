# AgroFinca - Modulo de Finanzas (Analisis Financiero)

**Archivo**: `js/modules/finanzas.js`

## Estructura

El modulo de finanzas es el sistema de analisis mas complejo de AgroFinca. Tiene **7 tabs** y un **selector de periodo**.

## Selector de Periodo

Opciones disponibles:

| Valor | Etiqueta | Rango |
|-------|----------|-------|
| `month` | Este mes | Mes actual |
| `quarter` | Ultimos 3 meses | 3 meses atras |
| `year` | Este anio | Enero 1 - Diciembre 31 |
| `all` | Todo el historial | 2000-01-01 a 2099-12-31 |
| `custom` | Personalizado | Fechas seleccionadas |

El periodo filtra ventas y costos por `fecha`. Los datos base se cargan una sola vez y se filtran en memoria.

## Datos cargados

Al renderizar, se cargan todos los datos de la finca en paralelo:

```javascript
const [allVentas, allCostos, cosechas, ciclos, cultivos, areas,
       areaCultivos, depreciacion, activos, clientes, proveedores] = await Promise.all([...]);
```

## Tab 1: Resumen

### KPIs principales

- **Ingresos totales**: Suma de `ventas.total`
- **Costos reales**: Costos sin mano de obra familiar
- **Costos familiares**: Solo mano de obra familiar
- **Ganancia real**: Ingresos - costos reales
- **Ganancia con familiar**: Ingresos - todos los costos
- **ROI**: `(ingresos - costos) / costos * 100`

### Grafico de tendencia mensual

Barras de ingresos, costos y ganancia de los ultimos 12 meses.

### Tabla comparativa mensual

| Mes | Ingresos | Costos | Ganancia |
|-----|----------|--------|----------|
| Enero | $500 | $300 | $200 |
| ... | ... | ... | ... |

### Analisis por cultivo (basico)

Para cada cultivo con ventas o costos en el periodo:
- Ingresos, costos, ganancia, ROI

## Tab 2: Por Cultivo

Analisis detallado por cultivo usando el **algoritmo de distribucion de costos** (ver seccion dedicada).

Para cada cultivo muestra:
- Ingresos totales
- Costos directos (asignados al cultivo)
- Costos de area (distribuidos por proporcion policultivo)
- Costos generales (distribuidos por superficie)
- Costo total = directos + area + generales + depreciacion
- Ganancia neta
- ROI
- Costos fijos vs variables

## Tab 3: Por Area

Similar a por cultivo, pero agrupado por area geografica:
- Ingresos de cultivos del area
- Costos directos del area
- Superficie y productividad por m2

## Tab 4: Rendimiento

Analisis de rendimiento productivo:
- Cosechas totales por cultivo (en kg)
- Rendimiento t/ha (ajustado por proporcion policultivo)
- Rendimiento kg/planta (si hay cantidad_plantas)
- Comparacion con rendimiento de referencia nacional
- Evolucion de precios por producto

### Distribucion de costos a cosechas individuales (v3.1)

El tab de Rendimiento calcula metricas por cosecha individual:
- **Costo/kg**: Costos del ciclo distribuidos entre las cosechas, dividido por kg cosechados
- **Margen/kg**: Precio promedio de venta menos costo/kg
- Permite identificar que cosechas son mas rentables dentro de un mismo ciclo

## Tab 5: Clientes

Analisis de ventas por cliente:
- Total comprado por cliente
- Productos favoritos
- Historial de compras
- Creditos pendientes (ventas con `cobrado = false`)

## Tab 6: Proveedores

Analisis de compras por proveedor:
- Total gastado por proveedor
- Categorias frecuentes
- Historial de compras

## Tab 7: Punto de Equilibrio

### Calculo del Break-Even

```
Costos fijos = costos con tipo_costo='fijo' + depreciacion mensual
Costos variables = costos con tipo_costo='variable'
Ingresos totales
Unidades vendidas

Margen de contribucion = (Ingresos - Costos variables) / Unidades vendidas
Punto de equilibrio (unidades) = Costos fijos / Margen de contribucion
Punto de equilibrio ($) = PE unidades * Precio promedio
```

Muestra:
- Costos fijos totales del periodo
- Costos variables totales
- Margen de contribucion unitario
- Punto de equilibrio en unidades y dolares
- Porcentaje alcanzado

## Algoritmo distribuirCostos()

Este es el algoritmo central del modulo financiero. Distribuye costos a cultivos en 3 niveles:

### Nivel 1: Costos directos

Si el costo tiene `cultivo_id`, se asigna directamente a ese cultivo.

```javascript
if (costo.cultivo_id && result[costo.cultivo_id]) {
  result[costo.cultivo_id].directos += costo.total;
}
```

### Nivel 2: Costos de area

Si el costo tiene `area_id` pero no `cultivo_id`, se distribuye entre los cultivos del area segun su proporcion en `area_cultivos`:

```javascript
else if (costo.area_id) {
  const shares = areaCultivos.filter(ac => ac.area_id === costo.area_id && ac.activo);
  for (const share of shares) {
    result[share.cultivo_id].area += costo.total * share.proporcion;
  }
}
```

### Nivel 3: Costos generales (distribucion proporcional por m2 - v3.1)

Si el costo no tiene ni `cultivo_id` ni `area_id`, se distribuye proporcionalmente segun la superficie cultivada (m2) de cada cultivo:

```javascript
else {
  // Calcular area total ponderada
  const totalAreaM2 = areaCultivos.filter(ac => ac.activo).reduce((s, ac) => {
    const area = areas.find(a => a.id === ac.area_id);
    return s + (area.area_m2 * ac.proporcion);
  }, 0);

  // Distribuir por fraccion de superficie
  for (const ac of areaCultivos.filter(x => x.activo)) {
    const areaM2 = area.area_m2 * ac.proporcion;
    const fraccion = areaM2 / totalAreaM2;
    result[ac.cultivo_id].generales += costo.total * fraccion;
  }
}
```

### Clasificacion fijo/variable

Cada costo se clasifica simultaneamente como fijo o variable segun `tipo_costo`:

```javascript
const tipo = costo.tipo_costo || 'variable';
if (tipo === 'fijo') result[cultivo_id].fijos += monto;
else result[cultivo_id].variables += monto;
```

### Resultado por cultivo

```javascript
{
  directos: 500,      // Costos asignados directamente
  area: 200,          // Costos del area distribuidos
  generales: 100,     // Costos generales distribuidos
  depreciacion: 50,   // Depreciacion de activos
  fijos: 350,         // Total costos fijos
  variables: 500,     // Total costos variables
  total: 850          // directos + area + generales + depreciacion
}
```

### Separacion CAPEX (v3.1)

Los costos vinculados a activos (`activo_id` presente) se tratan como **CAPEX** (gasto de capital) y se separan del flujo operativo:
- El costo de adquisicion del activo se registra como costo fijo con `activo_id`
- La depreciacion mensual se distribuye como costo fijo a traves de `depreciacion_mensual`
- En los analisis por cultivo, la depreciacion se suma como un componente separado del costo total

## Exportacion CSV

Cada tab tiene un boton de exportacion CSV que genera y descarga un archivo con los datos de la tabla actual. Funcionalidad Premium (`PlanGuard.isPaid()`).

## Premium Gating

El modulo tiene gating parcial:
- Tabs basicos (Resumen) disponibles para todos
- Tabs avanzados (Por Cultivo, Rendimiento, Punto de Equilibrio) requieren plan Premium
- Exportacion CSV requiere plan Premium


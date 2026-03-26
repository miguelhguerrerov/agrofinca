# AgroFinca - Modulo de Produccion

**Archivo**: `js/modules/produccion.js`

## Estructura

El modulo de produccion maneja tres tabs principales:

| Tab | Contenido |
|-----|-----------|
| **Ciclos** | Ciclos productivos (activos, completados, cancelados) |
| **Cosechas** | Registros de cosecha por ciclo |
| **Catalogo** | Catalogo personalizable de cultivos |

## Ciclos Productivos

### Tipos de ciclo

| Tipo | ciclo_dias | Comportamiento |
|------|-----------|----------------|
| **Estacional** | > 0 (ej: 120) | Tiene fecha inicio y fin estimada. Barra de progreso temporal. |
| **Perenne** | 0 | Sin fecha fin. Usa fases fenologicas. Cosecha continua. |

### Creacion de ciclo

Al crear un ciclo:
1. Se selecciona area y cultivo
2. Se determina `tipo_ciclo` automaticamente segun `cultivo.ciclo_dias`
3. Si es perenne y el cultivo tiene `fases_template`, se crean las fases automaticamente
4. Se calcula `fecha_fin_estimada = fecha_inicio + ciclo_dias`
5. Se crea registro en `area_cultivos` con la proporcion del policultivo

### Estados de ciclo

- `activo` - En curso
- `completado` - Finalizado exitosamente
- `cancelado` - Cancelado

### Card de ciclo

Cada ciclo muestra:
- Nombre del cultivo y area
- Barra de progreso (para estacionales)
- Rendimiento calculado (kg total, t/ha, kg/planta)
- Fases fenologicas (para perennes)
- Botones de editar, completar, cosecha rapida

## Fases Fenologicas

Las fases aplican a ciclos perennes y representan etapas del crecimiento.

### Template de fases

Los cultivos pueden tener un `fases_template` (JSONB) que define fases predeterminadas:

```json
[
  { "nombre": "Plantacion", "duracion_estimada_dias": 30, "genera_ingresos": false },
  { "nombre": "Crecimiento vegetativo", "duracion_estimada_dias": 180, "genera_ingresos": false },
  { "nombre": "Floracion", "duracion_estimada_dias": 60, "genera_ingresos": false },
  { "nombre": "Fructificacion", "duracion_estimada_dias": 90, "genera_ingresos": false },
  { "nombre": "Produccion", "duracion_estimada_dias": 0, "genera_ingresos": true }
]
```

### Estados de fase

- `pendiente` - No iniciada
- `en_curso` - En progreso
- `completada` - Finalizada

### Avanzar fase (`avanzarFase`)

```javascript
ProduccionModule.avanzarFase(cicloId, faseId)
```

Logica:
1. Si fase esta `pendiente` -> cambia a `en_curso`, registra `fecha_inicio = hoy`
2. Si fase esta `en_curso` -> cambia a `completada`, registra `fecha_fin = hoy`
3. Si hay siguiente fase, automaticamente la inicia

### Visualizacion de fases

Cada fase muestra:
- Icono (planta o dinero si genera_ingresos)
- Nombre y estado
- Fechas previstas (calculadas acumulativamente desde fecha_inicio del ciclo)
- Barra de progreso con colores:
  - Verde: dentro del tiempo estimado
  - Ambar: entre 100% y 120% del tiempo
  - Rojo: excedido > 120%
- Dias reales vs estimados (`actualDays / estimated`)

### Fechas predichas

Las fechas de inicio/fin de cada fase se calculan acumulativamente:
```javascript
let cumulativeDays = 0;
for (const fase of sortedFases) {
  fase._predictedStart = addDays(ciclo.fecha_inicio, cumulativeDays);
  cumulativeDays += (fase.duracion_estimada_dias || 0);
  fase._predictedEnd = addDays(ciclo.fecha_inicio, cumulativeDays);
}
```

## Policultivo (area_cultivos)

### Concepto

Un area puede tener multiples cultivos simultaneamente, cada uno con una proporcion:

```javascript
// area_cultivos ejemplo
{
  area_id: 'uuid-area',
  cultivo_id: 'uuid-cacao',
  ciclo_id: 'uuid-ciclo',
  proporcion: 0.7,    // 70% del area
  activo: true
}
```

### Helper: getAreaCropShares

```javascript
async function getAreaCropShares(areaId) {
  return AgroDB.query('area_cultivos', r => r.area_id === areaId && r.activo);
}
```

Usado para:
- Mostrar composicion del area en el modulo de fincas
- Calcular rendimiento real por cultivo (t/ha ajustado por proporcion)
- Distribuir costos en el modulo de finanzas

## Calculo de Rendimiento

### Conversion a kg

```javascript
function convertToKg(cantidad, unidad) {
  const conv = {
    kg: 1, toneladas: 1000, quintales: 45.36,
    libras: 0.4536, sacos: 50, gramos: 0.001
  };
  return (cantidad || 0) * (conv[unidad] || 1);
}
```

### Rendimiento por ciclo

```javascript
const totalKg = cosechas.reduce((s, co) => s + convertToKg(co.cantidad, co.unidad), 0);

// t/ha (ajustado por proporcion del policultivo)
const areaM2 = area.area_m2 * proporcion;
const areaHa = areaM2 / 10000;
const tHa = areaHa > 0 ? (totalKg / 1000) / areaHa : 0;

// kg/planta
const kgPlanta = ciclo.cantidad_plantas > 0 ? totalKg / ciclo.cantidad_plantas : null;
```

### Unidades de rendimiento

```javascript
const YIELD_UNITS = [
  { value: 't/ha', label: 't/ha (toneladas por hectarea)' },
  { value: 'kg/planta', label: 'kg/planta' },
  { value: 'kg/planta/anio', label: 'kg/planta/anio' },
  { value: 'kg/ha/anio', label: 'kg/ha/anio' },
  { value: 'racimos/planta/anio', label: 'racimos/planta/anio' },
  { value: 'litros/colmena/anio', label: 'litros/colmena/anio' },
  { value: 'kg/m2/ciclo', label: 'kg/m2/ciclo' }
];
```

## Catalogo de Cultivos

### Seed por defecto

Al crear una finca, `AgroDB.seedDefaultCrops(fincaId)` crea 22 cultivos predeterminados basados en datos de Ecuador (ESPAC 2022-2023):

- Banano, Platano Barraganete, Cacao, Cafe
- Arroz, Maiz Duro, Maiz Suave
- Cana de Azucar, Papa, Tomate Rinon
- Pimiento, Cebolla, Zanahoria, Frejol, Yuca
- Pina, Maracuya, Naranja, Limon, Cilantro
- Miel de Abeja, Lombricompost

### Campos del catalogo

Cada cultivo tiene:
- Nombre, tipo, icono (emoji), color
- `unidad_produccion`: kg, racimos, toneladas, litros, atados
- `ciclo_dias`: 0 para perennes, > 0 para estacionales
- `rendimiento_referencia` + `unidad_rendimiento`: rendimiento promedio nacional
- `fases_template` (JSONB): template de fases fenologicas

### Emoji picker

Selector visual organizado por categorias:
- Frutas, Hortalizas, Granos, Tuberculos
- Tropicales, Ganaderia, Apicultura, Otros

## Cosechas

### Registro de cosecha

Campos: ciclo, fecha, cantidad, unidad, calidad, notas.

La calidad puede ser: primera, segunda, tercera, rechazo.

### Quick Harvest

`ProduccionModule.showQuickHarvest(fincaId)` abre un modal para registro rapido desde el FAB o desde el card del ciclo.

# Changelog - AgroFinca

## [3.0.0] - 2026-03-25

### Sistema Contable Avanzado para Agricultura Familiar

Reestructuración completa del sistema financiero orientado a visibilizar costos ocultos, calcular rentabilidad real por cultivo/área, y soportar policultivos.

### Nuevas tablas (DB_VERSION 5 → 6)
- `clientes` — Directorio de compradores con tipo, contacto y stats
- `proveedores` — Directorio de proveedores con productos frecuentes
- `activos_finca` — Activos depreciables (herramientas, infraestructura, vehículos)
- `area_cultivos` — Soporte policultivo: proporción de cada cultivo por área
- `depreciacion_mensual` — Registros auto-generados de depreciación lineal
- `fases_fenologicas` — Fases para cultivos perennes (vivero → producción)

### Nuevos campos en tablas existentes
- `costos`: tipo_costo (fijo/variable), proveedor_id, area_id en formulario
- `ventas`: cliente_id, ciclo_id, area_id, cosecha_id, cobrado, fecha_cobro
- `cosechas`: area_id
- `ciclos_productivos`: tipo_ciclo (estacional/perenne), cantidad_plantas, fecha_fin_estimada, ciclo_dias sincronizados a Supabase

### Módulo Finanzas (7 pestañas)
- **Resumen**: KPIs + costos ocultos (M.O. familiar + depreciación) + cuentas por cobrar
- **Por Cultivo**: Rentabilidad con distribución de costos en 3 niveles (directos → área → generales)
- **Por Área**: Ganancia por m² y por ha con desglose de policultivo
- **Rendimiento**: t/ha real vs referencia ESPAC, kg/planta, calidad A/B/C
- **Clientes**: Quién paga mejor, frecuencia de compra, créditos pendientes
- **Proveedores**: Concentración de gasto, oportunidades de negociación
- **Punto de Equilibrio**: PE por cultivo, brecha de área/plantas necesarias (premium)

### Módulo Costos (3 pestañas)
- **Costos**: Formulario mejorado con tipo_costo, área, proveedor
- **Proveedores**: CRUD con stats de gasto y frecuencia
- **Activos**: CRUD de activos depreciables con cálculo automático

### Módulo Ventas (2 pestañas)
- **Ventas**: Formulario con cascada cultivo→ciclo→cosecha→cliente, créditos
- **Clientes**: CRUD con stats de compras y cobros

### Policultivo
- Soporte para múltiples cultivos en una misma área con proporciones (%)
- Validación: proporciones deben sumar ≤ 100%
- Distribución proporcional de costos de área a cada cultivo
- Display en tarjetas de área: "60% Cacao · 30% Plátano · 10% Yuca"

### Ciclos Perennes y Fases Fenológicas
- Detección automática: ciclo_dias=0 → perenne
- Fases por defecto: Vivero, Crecimiento, Floración, Producción
- Timeline visual con estados (pendiente/en curso/completada)
- Avance de fases con botón (auto-inicia siguiente)
- Rendimiento anualizado para perennes

### Distribución de Costos (3 niveles)
1. Costo con `cultivo_id` → 100% a ese cultivo
2. Costo con `area_id` sin `cultivo_id` → split por proporciones de policultivo
3. Costo general (sin area/cultivo) → distribuido a todos los cultivos por superficie ocupada

### Rendimiento
- Cálculo: siempre en m², conversión a ha solo para display
- kg/ha, t/ha, kg/planta
- Comparación con datos ESPAC (referencia nacional)
- Indicadores: superior (≥100%), cercano (≥70%), bajo (<70%)

### Punto de Equilibrio
- PE = costos_fijos / margen_contribución
- Brecha de área: cuántos m² adicionales se necesitan
- Brecha de plantas: cuántas plantas adicionales
- Nota para perennes: tiempo hasta producción de nuevas plantas

### Correcciones de sincronización
- Corregidos campos faltantes en Supabase: cantidad_plantas, fecha_fin_estimada, ciclo_dias, es_mano_obra_familiar, registrado_por, forma_pago
- KNOWN_COLUMNS actualizados para 6 nuevas tablas
- SYNC_TABLES y PUSH_ORDER actualizados

---

## [2.1.0] - 2026-03-25

### Acciones IA con formularios completos
- Expandido de 4 a 7 tipos de acción (+ cosecha, ciclo, venta)
- FIELD_SCHEMAS con todos los campos de cada formulario real
- Controles adecuados: select, date, time, number, textarea, checkbox
- Selects dinámicos cargan áreas/cultivos/ciclos con IDs reales
- Auto-cálculo de totales (costos y ventas)
- Campos condicionales (frecuencia solo si recurrente)
- Validación de campos requeridos
- Gemini recibe instrucciones completas de todos los tipos de acción

---

## [2.0.0] - 2026-03-24

### IA Proactiva para Premium
- Consejo del día en dashboard con cache 12h
- Alertas inteligentes con navegación a módulos
- Chat con acciones ejecutables (crear tarea, inspección, etc.)
- Multi-conversación CRUD en asistente IA
- Sidebar de conversaciones con búsqueda
- UI moderna con burbujas, markdown, animaciones

### Mejoras de Sincronización
- `requeueUnsynced()` recupera registros removidos de sync_queue
- Fix KNOWN_COLUMNS.costos (monto → total, cantidad, costo_unitario)
- AI tables sincronizables (ai_conversations, ai_chat_history)

### Inspecciones
- Separación de botones cámara y galería

---

## [1.0.0] - 2026-03-20

- Release inicial con gestión completa de fincas, producción, ventas, costos
- Sincronización offline-first con Supabase
- Dashboard con KPIs y gráficos
- Sistema freemium con PayPal

# AgroFinca - Base de Datos

## Panorama General

AgroFinca usa dos capas de base de datos:

1. **IndexedDB** (local, offline-first): Base de datos primaria en el navegador (`agrofinca_db`, version 9)
2. **PostgreSQL** (remoto, Supabase): Base de datos en la nube para sincronizacion y persistencia

## IndexedDB - Object Stores (AgroDB)

La base de datos local tiene **46 object stores** (28 originales + 15 en v4.0 + 3 en v4.1). Todos usan `id` (UUID) como keyPath, excepto `sync_log` que usa autoIncrement.

### Stores sincronizados con Supabase

| Store | Indices | Descripcion |
|-------|---------|-------------|
| `fincas` | propietario_id, synced | Fincas del usuario |
| `finca_miembros` | finca_id, usuario_id, synced | Miembros con roles |
| `areas` | finca_id, cultivo_actual_id, synced | Parcelas georreferenciadas |
| `cultivos_catalogo` | finca_id, tipo, synced | Catalogo de cultivos |
| `ciclos_productivos` | area_id, cultivo_id, finca_id, estado, synced | Ciclos de produccion |
| `cosechas` | ciclo_id, finca_id, fecha, synced | Registros de cosecha |
| `ventas` | finca_id, cultivo_id, fecha, synced | Registros de venta |
| `costos` | finca_id, cultivo_id, categoria, ciclo_id, fecha, synced | Registros de costo |
| `colmenas` | finca_id, synced | Colmenas apicolas |
| `inspecciones_colmena` | colmena_id, finca_id, fecha, synced | Inspecciones de colmena |
| `camas_lombricompost` | finca_id, synced | Camas de lombricompost |
| `registros_lombricompost` | cama_id, finca_id, fecha, synced | Registros de lombricompost |
| `tareas` | finca_id, fecha_programada, estado, synced | Tareas planificadas |
| `inspecciones` | finca_id, area_id, ciclo_id, fecha, synced | Inspecciones de cultivo |
| `fotos_inspeccion` | inspeccion_id, synced | Fotos de inspecciones |
| `aplicaciones_fitosanitarias` | finca_id, area_id, ciclo_id, fecha, synced | Aplicaciones quimicas |
| `lotes_animales` | finca_id, tipo_animal, synced | Lotes de animales |
| `registros_animales` | lote_id, finca_id, tipo, fecha, synced | Registros de animales |
| `ai_conversations` | finca_id, updated_at, usuario_id | Conversaciones IA |
| `ai_chat_history` | finca_id, conversation_id, fecha, usuario_id | Mensajes de chat IA |
| `activos_finca` | finca_id, synced | Activos depreciables |
| `area_cultivos` | finca_id, area_id, cultivo_id, ciclo_id, synced | Policultivo |
| `depreciacion_mensual` | finca_id, activo_id, mes, synced | Depreciacion auto-generada |
| `clientes` | finca_id, synced | Directorio de compradores |
| `proveedores` | finca_id, synced | Directorio de proveedores |
| `fases_fenologicas` | finca_id, ciclo_id, synced | Fases de cultivos perennes |
| `ingeniero_agricultores` | ingeniero_id, agricultor_id, synced | Afiliacion ingeniero-agricultor |
| `protocolos_evaluacion` | ingeniero_id, synced | Protocolos de evaluacion de campo |
| `ensayos` | finca_id, ingeniero_id, synced | Ensayos de campo |
| `ensayo_tratamientos` | ensayo_id, synced | Tratamientos dentro de ensayos |
| `ensayo_evaluaciones` | ensayo_id, tratamiento_id, synced | Evaluaciones por tratamiento |
| `prescripciones` | ingeniero_id, finca_id, synced | Prescripciones fitosanitarias |
| `productos_ingeniero` | ingeniero_id, synced | Catalogo de productos del ingeniero |
| `ventas_insumos` | ingeniero_id, finca_id, synced | Ventas de insumos a agricultores |
| `ventas_insumos_detalle` | venta_id, synced | Detalle multi-linea de ventas |
| `programacion_inspecciones` | ingeniero_id, finca_id, synced | Programacion periodica de visitas |
| `visitas_tecnicas` | ingeniero_id, finca_id, synced | Registro GPS de visitas tecnicas |
| `chat_grupos` | ingeniero_id, synced | Grupos de chat del ingeniero |
| `chat_grupo_miembros` | grupo_id, usuario_id, synced | Miembros de grupos de chat |
| `chat_conversaciones` | tipo, participante_1, synced | Conversaciones 1-a-1 y grupales |
| `chat_mensajes` | conversacion_id, emisor_id, synced | Mensajes del chat |

### Stores solo locales (no se sincronizan)

| Store | Descripcion |
|-------|-------------|
| `usuarios` | Cache local del usuario autenticado |
| `sync_queue` | Cola de operaciones pendientes de sync (autoIncrement). Index compuesto `store_record` sobre [store_name, record_id] para deduplicacion |
| `user_profiles_local` | Perfil local con plan (free/paid) |
| `payment_history` | Historial de pagos |
| `sync_conflicts` | Conflictos detectados durante pull (v4.1) |
| `sync_log` | Log de operaciones de sync con auto-prune (v4.1, autoIncrement) |

### Store sync_conflicts (v4.1)

Almacena conflictos detectados cuando un registro local modificado (`synced: false`) tiene una version remota mas reciente.

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID (keyPath) | Identificador unico del conflicto |
| table_name | TEXT | Nombre de la tabla/store afectado |
| record_id | UUID | ID del registro en conflicto |
| local_data | Object | Copia completa del registro local |
| remote_data | Object | Copia completa del registro remoto |
| created_at | TEXT (ISO) | Timestamp de deteccion del conflicto |
| resolved | BOOLEAN | Si el conflicto fue resuelto |
| resolution | TEXT | Tipo de resolucion: 'local', 'remote', 'manual', null |

### Store sync_log (v4.1)

Log de operaciones de sincronizacion. Usa autoIncrement como keyPath. Se auto-poda a 200 entradas.

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | INTEGER (auto) | ID autoincremental |
| timestamp | TEXT (ISO) | Momento de la operacion |
| type | TEXT | Tipo: 'push', 'pull', 'conflict', 'error' |
| table | TEXT | Tabla/store afectado |
| record_id | UUID | ID del registro |
| result | TEXT | Resultado: 'success', 'error', 'conflict', 'skipped' |
| error | TEXT | Mensaje de error (si aplica) |
| duration_ms | INTEGER | Duracion de la operacion en milisegundos |

### Index compuesto en sync_queue (v4.1)

Se agrego un index compuesto `store_record` sobre `[store_name, record_id]` en el store `sync_queue` para evitar duplicados al encolar operaciones sobre el mismo registro.

## PostgreSQL (Supabase) - Tablas

### user_profiles
Creada automaticamente por trigger `on_auth_user_created`.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | - | FK a auth.users |
| email | TEXT | - | Correo electronico |
| nombre | TEXT | - | Nombre completo |
| rol | TEXT | 'agricultor' | Rol: 'agricultor' o 'ingeniero' |
| especialidad | TEXT | - | Especialidad del ingeniero (solo si rol='ingeniero') |
| registro_profesional | TEXT | - | Numero de registro profesional (solo si rol='ingeniero') |
| plan | TEXT | 'free' | Plan: free o paid |
| plan_expires_at | TIMESTAMPTZ | - | Expiracion del plan |
| is_admin | BOOLEAN | false | Es administrador |
| farm_count | INTEGER | 0 | Contador de fincas |
| created_at | TIMESTAMPTZ | NOW() | Fecha de creacion |
| updated_at | TIMESTAMPTZ | NOW() | Ultima modificacion |

### fincas

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | Identificador unico |
| nombre | TEXT (NOT NULL) | - | Nombre de la finca |
| ubicacion | TEXT | - | Ubicacion textual |
| descripcion | TEXT | - | Descripcion |
| area_total_m2 | NUMERIC | 0 | Area total en m2 |
| sistema_riego | TEXT | - | Tipo de riego |
| latitud | NUMERIC | - | Coordenada GPS |
| longitud | NUMERIC | - | Coordenada GPS |
| propietario_id | UUID (NOT NULL) | - | FK a auth.users |
| modificado_por | TEXT | - | Ultimo editor |
| created_at | TIMESTAMPTZ | NOW() | Fecha creacion |
| updated_at | TIMESTAMPTZ | NOW() | Ultima modificacion |

### finca_miembros

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| usuario_id | UUID | - | FK a auth.users |
| usuario_email | TEXT | - | Email del invitado |
| rol | TEXT | 'trabajador' | Rol: propietario, administrador, trabajador |
| invitado_por | UUID | - | Quien invito |
| estado_invitacion | TEXT | 'activa' | Estado de la invitacion |

### areas

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| nombre | TEXT (NOT NULL) | - | Nombre del area |
| tipo | TEXT | - | productivo, proteccion, procesamiento, almacenamiento, infraestructura, otros |
| area_m2 | NUMERIC | 0 | Superficie en m2 |
| cultivo_actual_id | UUID | - | Cultivo actual |
| cultivo_actual_nombre | TEXT | - | Nombre del cultivo (desnormalizado) |
| geojson | JSONB | - | Poligono GeoJSON del area |
| latitud | NUMERIC | - | Centro GPS |
| longitud | NUMERIC | - | Centro GPS |
| color | TEXT | - | Color en mapa |
| notas | TEXT | - | Observaciones |

### cultivos_catalogo

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| nombre | TEXT (NOT NULL) | - | Nombre del cultivo |
| tipo | TEXT | - | perenne, estacional, cereal, hortaliza, leguminosa, frutal, rotacion_rapida, apicola, compostaje |
| unidad_produccion | TEXT | - | kg, racimos, toneladas, litros, atados |
| ciclo_dias | INTEGER | 0 | Duracion del ciclo (0 = perenne) |
| color | TEXT | - | Color para UI |
| icono | TEXT | - | Emoji |
| descripcion | TEXT | - | Descripcion del cultivo |
| es_predeterminado | BOOLEAN | false | Cultivo del seed |
| rendimiento_referencia | NUMERIC | - | Rendimiento de referencia |
| unidad_rendimiento | TEXT | - | t/ha, kg/planta, etc. |
| fases_template | JSONB | - | Template de fases fenologicas |

### ciclos_productivos

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| area_id | UUID | - | FK a areas |
| cultivo_id | UUID | - | FK a cultivos_catalogo |
| cultivo_nombre | TEXT | - | Nombre (desnormalizado) |
| area_nombre | TEXT | - | Nombre (desnormalizado) |
| nombre | TEXT | - | Nombre del ciclo |
| fecha_inicio | DATE | - | Inicio del ciclo |
| fecha_fin | DATE | - | Fin planificado |
| fecha_fin_estimada | DATE | - | Fin estimado |
| fecha_fin_real | DATE | - | Fin real |
| estado | TEXT | 'activo' | activo, completado, cancelado |
| tipo_ciclo | TEXT | 'estacional' | estacional o perenne |
| cantidad_plantas | INTEGER | 0 | Numero de plantas |
| ciclo_dias | INTEGER | 0 | Duracion en dias |
| notas | TEXT | - | Observaciones |

### cosechas

| Columna | Tipo | Default |
|---------|------|---------|
| id | UUID (PK) | gen_random_uuid() |
| finca_id | UUID (NOT NULL) | - |
| ciclo_id | UUID | - |
| cultivo_id | UUID | - |
| cultivo_nombre | TEXT | - |
| area_id | UUID | - |
| fecha | DATE | - |
| cantidad | NUMERIC | 0 |
| unidad | TEXT | - |
| calidad | TEXT | - |
| notas | TEXT | - |
| registrado_por | TEXT | - |

### ventas

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| cultivo_id | UUID | - | FK a cultivos_catalogo |
| cultivo_nombre | TEXT | - | Desnormalizado |
| producto | TEXT | - | Nombre del producto |
| fecha | DATE | - | Fecha de venta |
| cantidad | NUMERIC | 0 | Cantidad vendida |
| unidad | TEXT | - | Unidad |
| precio_unitario | NUMERIC | 0 | Precio por unidad |
| total | NUMERIC | 0 | Total = cantidad * precio |
| comprador | TEXT | - | Nombre del comprador |
| cliente_id | UUID | - | FK a clientes |
| ciclo_id | UUID | - | FK a ciclos_productivos |
| area_id | UUID | - | FK a areas |
| cosecha_id | UUID | - | FK a cosechas |
| forma_pago | TEXT | - | Metodo de pago |
| cobrado | BOOLEAN | true | Si se cobro |
| fecha_cobro | DATE | - | Fecha de cobro |
| notas | TEXT | - | Observaciones |
| registrado_por | TEXT | - | Quien registro |

### costos

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| cultivo_id | UUID | - | FK a cultivos_catalogo |
| ciclo_id | UUID | - | FK a ciclos_productivos |
| area_id | UUID | - | FK a areas |
| categoria | TEXT | - | insumo, mano_obra_contratada, mano_obra_familiar, herramienta, etc. |
| subcategoria | TEXT | - | Subcategoria |
| tipo_costo | TEXT | 'variable' | fijo o variable |
| fecha | DATE | - | Fecha |
| total | NUMERIC | 0 | Monto total |
| cantidad | NUMERIC | 1 | Cantidad |
| unidad | TEXT | - | Unidad |
| costo_unitario | NUMERIC | 0 | Costo por unidad |
| descripcion | TEXT | - | Descripcion |
| proveedor | TEXT | - | Nombre del proveedor |
| proveedor_id | UUID | - | FK a proveedores |
| activo_id | UUID | - | FK a activos_finca |
| es_mano_obra_familiar | BOOLEAN | false | Si es mano de obra familiar |
| notas | TEXT | - | Observaciones |
| registrado_por | TEXT | - | Quien registro |

### clientes

| Columna | Tipo | Default |
|---------|------|---------|
| id | UUID (PK) | gen_random_uuid() |
| finca_id | UUID (NOT NULL) | - |
| nombre | TEXT (NOT NULL) | - |
| telefono | TEXT | - |
| email | TEXT | - |
| ubicacion | TEXT | - |
| tipo | TEXT | 'otro' |
| notas | TEXT | - |
| activo | BOOLEAN | true |

### proveedores

| Columna | Tipo | Default |
|---------|------|---------|
| id | UUID (PK) | gen_random_uuid() |
| finca_id | UUID (NOT NULL) | - |
| nombre | TEXT (NOT NULL) | - |
| telefono | TEXT | - |
| email | TEXT | - |
| ubicacion | TEXT | - |
| tipo | TEXT | 'otro' |
| productos_frecuentes | TEXT | - |
| notas | TEXT | - |
| activo | BOOLEAN | true |

### activos_finca

| Columna | Tipo | Default |
|---------|------|---------|
| id | UUID (PK) | gen_random_uuid() |
| finca_id | UUID (NOT NULL) | - |
| nombre | TEXT (NOT NULL) | - |
| categoria | TEXT | 'otro' |
| fecha_adquisicion | DATE | - |
| costo_adquisicion | NUMERIC | 0 |
| vida_util_meses | INTEGER | 12 |
| valor_residual | NUMERIC | 0 |
| estado | TEXT | 'activo' |
| area_id | UUID | FK a areas |
| cultivo_id | UUID | FK a cultivos_catalogo |
| notas | TEXT | - |

### area_cultivos (policultivo)

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| area_id | UUID (NOT NULL) | - | FK a areas |
| cultivo_id | UUID (NOT NULL) | - | FK a cultivos_catalogo |
| ciclo_id | UUID | - | FK a ciclos_productivos |
| proporcion | NUMERIC | 1.0 | Proporcion del area (0-1) |
| fecha_inicio | DATE | - | Inicio de la asociacion |
| fecha_fin | DATE | - | Fin de la asociacion |
| activo | BOOLEAN | true | Si esta activo |
| notas | TEXT | - | Observaciones |

### depreciacion_mensual

| Columna | Tipo | Default |
|---------|------|---------|
| id | UUID (PK) | gen_random_uuid() |
| finca_id | UUID (NOT NULL) | - |
| activo_id | UUID (NOT NULL) | FK a activos_finca |
| mes | TEXT (NOT NULL) | - |
| monto | NUMERIC | 0 |
| area_id | UUID | FK a areas |
| cultivo_id | UUID | FK a cultivos_catalogo |

### fases_fenologicas

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| ciclo_id | UUID (NOT NULL) | - | FK a ciclos_productivos |
| nombre | TEXT (NOT NULL) | - | Nombre de la fase |
| orden | INTEGER | 0 | Orden secuencial |
| fecha_inicio | DATE | - | Inicio real |
| fecha_fin | DATE | - | Fin real |
| estado | TEXT | 'pendiente' | pendiente, en_curso, completada |
| genera_ingresos | BOOLEAN | false | Si genera ingresos |
| duracion_estimada_dias | INTEGER | - | Duracion estimada |
| descripcion | TEXT | - | Descripcion |
| notas | TEXT | - | Observaciones |

### Otras tablas

- **colmenas**: id, finca_id, nombre, tipo, estado, ubicacion, fecha_instalacion, notas
- **inspecciones_colmena**: id, finca_id, colmena_id, fecha, tipo, estado_general, poblacion, reina_vista, crias, miel, plagas, notas
- **camas_lombricompost**: id, finca_id, nombre, tipo, estado, ubicacion, fecha_inicio, notas
- **registros_lombricompost**: id, finca_id, cama_id, fecha, tipo, descripcion, cantidad, unidad, notas
- **tareas**: id, finca_id, titulo, descripcion, fecha_programada, fecha_completada, estado, prioridad, asignado_a, area_id, ciclo_id, cultivo_id, hora_inicio, duracion_minutos, recurrente, frecuencia_dias, notas, **asignado_por_ingeniero** (UUID, FK a auth.users - v4.0)
- **inspecciones**: id, finca_id, area_id, ciclo_id, fecha, tipo, estado_general, plagas, enfermedades, recomendaciones, notas, **ingeniero_id** (UUID, FK a auth.users - v4.0), **protocolo_id** (UUID, FK a protocolos_evaluacion - v4.0), **datos_evaluacion** (JSONB - v4.0), **condiciones_ambientales** (JSONB - v4.0)
- **fotos_inspeccion**: id, finca_id, inspeccion_id, url, descripcion, tipo
- **aplicaciones_fitosanitarias**: id, finca_id, area_id, ciclo_id, cultivo_nombre, destino, tipo_producto, nombre_producto, ingrediente_activo, fecha, dosis, unidad_dosis, metodo, objetivo, periodo_carencia_dias, area_aplicada_m2, notas, **prescripcion_id** (UUID, FK a prescripciones - v4.0)
- **lotes_animales**: id, finca_id, nombre, tipo_animal, cantidad, raza, area_id, notas
- **registros_animales**: id, finca_id, lote_id, tipo, fecha, descripcion, cantidad, costo, producto, notas
- **ai_conversations**: id, finca_id, usuario_id, title, message_count
- **ai_chat_history**: id, conversation_id, finca_id, usuario_id, role, content, image, timestamp

### Tablas del Ingeniero Agronomo (v4.0)

#### ingeniero_agricultores

Relacion de afiliacion entre ingeniero y agricultor.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users (ingeniero) |
| agricultor_id | UUID (NOT NULL) | - | FK a auth.users (agricultor) |
| estado | TEXT | 'activo' | activo, inactivo |
| fecha_afiliacion | DATE | - | Fecha de afiliacion |
| notas | TEXT | - | Observaciones |

#### protocolos_evaluacion

Protocolos reutilizables para inspecciones estandarizadas.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users |
| nombre | TEXT (NOT NULL) | - | Nombre del protocolo |
| cultivo_id | UUID | - | FK a cultivos_catalogo |
| plaga_objetivo | TEXT | - | Plaga o enfermedad objetivo |
| variables | JSONB | - | Variables a evaluar |
| repeticiones | INTEGER | - | Numero de repeticiones |
| escala | JSONB | - | Escala de evaluacion |
| formulas | JSONB | - | Formulas de calculo |
| descripcion | TEXT | - | Descripcion |
| activo | BOOLEAN | true | Si esta activo |

#### ensayos

Ensayos de campo con tratamientos y evaluaciones.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users |
| protocolo_id | UUID | - | FK a protocolos_evaluacion |
| titulo | TEXT (NOT NULL) | - | Titulo del ensayo |
| objetivo | TEXT | - | Objetivo |
| fecha_inicio | DATE | - | Inicio del ensayo |
| fecha_fin | DATE | - | Fin del ensayo |
| intervalo_dias | INTEGER | - | Intervalo entre evaluaciones |
| duracion_dias | INTEGER | - | Duracion total en dias |
| estado | TEXT | 'activo' | activo, completado, cancelado |
| resultados_json | JSONB | - | Resultados calculados |
| conclusiones | TEXT | - | Conclusiones |

#### ensayo_tratamientos

Tratamientos (incluido testigo) dentro de un ensayo.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ensayo_id | UUID (NOT NULL) | - | FK a ensayos |
| nombre | TEXT (NOT NULL) | - | Nombre del tratamiento |
| producto | TEXT | - | Producto aplicado |
| dosis | NUMERIC | - | Dosis |
| unidad_dosis | TEXT | - | Unidad de dosis |
| agua_lt | NUMERIC | - | Litros de agua |
| metodo | TEXT | - | Metodo de aplicacion |
| es_testigo | BOOLEAN | false | Si es tratamiento testigo |
| orden | INTEGER | 0 | Orden |

#### ensayo_evaluaciones

Datos recopilados por tratamiento y repeticion.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ensayo_id | UUID (NOT NULL) | - | FK a ensayos |
| tratamiento_id | UUID (NOT NULL) | - | FK a ensayo_tratamientos |
| fecha | DATE | - | Fecha de evaluacion |
| repeticion | INTEGER | - | Numero de repeticion |
| valores | JSONB | - | Valores medidos |
| resultado | NUMERIC | - | Resultado calculado |
| notas | TEXT | - | Observaciones |

#### prescripciones

Recetas fitosanitarias emitidas por el ingeniero.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| agricultor_id | UUID | - | FK a auth.users |
| inspeccion_id | UUID | - | FK a inspecciones |
| producto | TEXT | - | Producto recetado |
| ingrediente_activo | TEXT | - | Ingrediente activo |
| dosis | NUMERIC | - | Dosis |
| unidad_dosis | TEXT | - | Unidad |
| metodo_aplicacion | TEXT | - | Metodo |
| intervalo_dias | INTEGER | - | Intervalo entre aplicaciones |
| num_aplicaciones | INTEGER | - | Numero de aplicaciones |
| carencia_dias | INTEGER | - | Periodo de carencia |
| precauciones | TEXT | - | Precauciones de seguridad |
| estado | TEXT | 'pendiente' | pendiente, en_ejecucion, completada, cancelada |
| fecha_inicio | DATE | - | Inicio de aplicacion |
| fecha_fin | DATE | - | Fin de aplicacion |
| notas | TEXT | - | Observaciones |

#### productos_ingeniero

Catalogo de productos del ingeniero con gestion de stock.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users |
| nombre | TEXT (NOT NULL) | - | Nombre comercial |
| ingrediente_activo | TEXT | - | Principio activo |
| tipo | TEXT | - | insecticida, fungicida, herbicida, etc. |
| registro_sanitario | TEXT | - | Numero de registro |
| cultivos_autorizados | TEXT | - | Cultivos autorizados |
| dosis_recomendada | TEXT | - | Dosis recomendada |
| carencia_dias | INTEGER | - | Periodo de carencia |
| precio | NUMERIC | 0 | Precio de venta |
| unidad_venta | TEXT | - | Unidad de venta |
| stock | NUMERIC | 0 | Stock disponible |
| toxicidad | TEXT | - | Banda toxicologica (I, II, III, IV) |
| activo | BOOLEAN | true | Si esta activo |
| notas | TEXT | - | Observaciones |

#### ventas_insumos

Ventas de insumos del ingeniero a agricultores.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users |
| agricultor_id | UUID | - | FK a auth.users |
| finca_id | UUID | - | FK a fincas |
| prescripcion_id | UUID | - | FK a prescripciones |
| fecha | DATE | - | Fecha de venta |
| total | NUMERIC | 0 | Total de la venta |
| forma_pago | TEXT | - | Metodo de pago |
| cobrado | BOOLEAN | true | Si se cobro |
| fecha_cobro | DATE | - | Fecha de cobro |
| notas | TEXT | - | Observaciones |

#### ventas_insumos_detalle

Lineas de detalle de cada venta de insumo.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| venta_id | UUID (NOT NULL) | - | FK a ventas_insumos |
| producto_id | UUID (NOT NULL) | - | FK a productos_ingeniero |
| cantidad | NUMERIC | 0 | Cantidad vendida |
| precio_unitario | NUMERIC | 0 | Precio unitario |
| total | NUMERIC | 0 | Total de la linea |

#### programacion_inspecciones

Programacion periodica de visitas a fincas.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| area_id | UUID | - | FK a areas |
| frecuencia | TEXT | - | semanal, quincenal, mensual |
| dias_intervalo | INTEGER | - | Dias entre visitas |
| proxima_visita | DATE | - | Proxima fecha programada |
| estado | TEXT | 'activa' | activa, pausada, cancelada |
| notas | TEXT | - | Observaciones |

#### visitas_tecnicas

Registro GPS de visitas tecnicas realizadas.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users |
| finca_id | UUID (NOT NULL) | - | FK a fincas |
| fecha | DATE | - | Fecha de visita |
| hora_llegada | TEXT | - | Hora de check-in |
| hora_salida | TEXT | - | Hora de check-out |
| latitud | NUMERIC | - | Coordenada GPS |
| longitud | NUMERIC | - | Coordenada GPS |
| tipo | TEXT | - | inspeccion, asesoria, ensayo, entrega |
| resumen | TEXT | - | Resumen de la visita |
| inspeccion_id | UUID | - | FK a inspecciones (si aplica) |

### Tablas de Chat (v4.0)

#### chat_grupos

Grupos de chat creados por el ingeniero.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| ingeniero_id | UUID (NOT NULL) | - | FK a auth.users |
| nombre | TEXT (NOT NULL) | - | Nombre del grupo |
| descripcion | TEXT | - | Descripcion |
| tipo | TEXT | - | Tipo de grupo |

#### chat_grupo_miembros

Miembros de cada grupo de chat.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| grupo_id | UUID (NOT NULL) | - | FK a chat_grupos |
| usuario_id | UUID (NOT NULL) | - | FK a auth.users |
| fecha_union | DATE | - | Fecha de incorporacion |

#### chat_conversaciones

Conversaciones individuales y grupales.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| tipo | TEXT | - | 'individual' o 'grupo' |
| grupo_id | UUID | - | FK a chat_grupos (si tipo='grupo') |
| participante_1 | UUID | - | FK a auth.users |
| participante_2 | UUID | - | FK a auth.users |
| ultimo_mensaje | TEXT | - | Preview del ultimo mensaje |
| ultimo_mensaje_at | TIMESTAMPTZ | - | Timestamp del ultimo mensaje |

#### chat_mensajes

Mensajes individuales del chat.

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| id | UUID (PK) | gen_random_uuid() | ID |
| conversacion_id | UUID (NOT NULL) | - | FK a chat_conversaciones |
| emisor_id | UUID (NOT NULL) | - | FK a auth.users |
| tipo | TEXT | 'texto' | texto, imagen, archivo |
| contenido | TEXT | - | Contenido del mensaje |
| archivo_url | TEXT | - | URL del archivo adjunto |
| leido | BOOLEAN | false | Si fue leido |
| vinculo_inspeccion_id | UUID | - | FK a inspecciones (para compartir reportes) |

### Publicacion Realtime para Chat

La tabla `chat_mensajes` debe tener habilitada la **publicacion Realtime** en Supabase para que el WebSocket funcione:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE chat_mensajes;
```

## Diagrama de Relaciones

```
auth.users
    │
    ├── user_profiles (1:1)
    │
    └── fincas (1:N) ─── propietario_id
         │
         ├── finca_miembros (1:N)
         ├── areas (1:N)
         │    └── area_cultivos (1:N) ── policultivo
         │
         ├── cultivos_catalogo (1:N)
         │
         ├── ciclos_productivos (1:N) ── area_id, cultivo_id
         │    ├── cosechas (1:N) ── ciclo_id
         │    └── fases_fenologicas (1:N) ── ciclo_id
         │
         ├── ventas (1:N) ── cultivo_id, ciclo_id, area_id, cosecha_id, cliente_id
         ├── costos (1:N) ── cultivo_id, ciclo_id, area_id, proveedor_id, activo_id
         │
         ├── clientes (1:N)
         ├── proveedores (1:N)
         ├── activos_finca (1:N)
         │    └── depreciacion_mensual (1:N)
         │
         ├── colmenas (1:N)
         │    └── inspecciones_colmena (1:N)
         │
         ├── camas_lombricompost (1:N)
         │    └── registros_lombricompost (1:N)
         │
         ├── lotes_animales (1:N)
         │    └── registros_animales (1:N)
         │
         ├── tareas (1:N)
         ├── inspecciones (1:N)
         │    └── fotos_inspeccion (1:N)
         ├── aplicaciones_fitosanitarias (1:N)
         │
         ├── ai_conversations (1:N) ── usuario_id
         │    └── ai_chat_history (1:N)
         │
         └── (tablas del ingeniero ── ingeniero_id = auth.uid())
              ├── ingeniero_agricultores (1:N)
              ├── protocolos_evaluacion (1:N)
              │    └── ensayos (1:N) ── protocolo_id, finca_id
              │         ├── ensayo_tratamientos (1:N)
              │         └── ensayo_evaluaciones (1:N) ── tratamiento_id
              ├── prescripciones (1:N) ── finca_id, inspeccion_id
              ├── productos_ingeniero (1:N)
              ├── ventas_insumos (1:N) ── finca_id, prescripcion_id
              │    └── ventas_insumos_detalle (1:N) ── producto_id
              ├── programacion_inspecciones (1:N) ── finca_id
              ├── visitas_tecnicas (1:N) ── finca_id
              ├── chat_grupos (1:N)
              │    └── chat_grupo_miembros (1:N) ── usuario_id
              └── chat_conversaciones (1:N) ── participante_1/2, grupo_id
                   └── chat_mensajes (1:N) ── emisor_id
```

## Row Level Security (RLS)

Todas las tablas tienen RLS activado. El patron de politicas es consistente:

### Tabla `fincas` (caso especial)
- **SELECT**: Propietario O miembro de la finca
- **INSERT/UPDATE/DELETE**: Solo propietario (`propietario_id = auth.uid()`)

### Tablas con `finca_id` (mayoria)
Usan la funcion helper `user_finca_ids()`:
```sql
CREATE OR REPLACE FUNCTION user_finca_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM fincas WHERE propietario_id = auth.uid()
  UNION
  SELECT finca_id FROM finca_miembros WHERE usuario_id = auth.uid();
$$;
```

Politica tipica (SELECT/INSERT/UPDATE/DELETE):
```sql
CREATE POLICY "tabla_select" ON tabla FOR SELECT
  USING (finca_id IN (SELECT user_finca_ids()));
```

### Tablas de IA
- `ai_conversations` y `ai_chat_history`: Filtran por `usuario_id = auth.uid()` directamente

### Tablas del ingeniero (v4.0)
Tablas con `ingeniero_id` usan politica directa:
```sql
CREATE POLICY "tabla_select" ON tabla FOR SELECT
  USING (ingeniero_id = auth.uid());
```
Aplica a: `ingeniero_agricultores`, `protocolos_evaluacion`, `productos_ingeniero`, `chat_grupos`, `programacion_inspecciones`, `visitas_tecnicas`

### Tablas de chat (v4.0)
- `chat_conversaciones`: El usuario debe ser `participante_1` o `participante_2`, o miembro del grupo referenciado
- `chat_mensajes`: El usuario debe ser participante de la conversacion
- `chat_grupo_miembros`: El usuario debe ser el `ingeniero_id` del grupo o su propio `usuario_id`

### user_profiles
- Cada usuario solo ve/edita su propio perfil (`id = auth.uid()`)

## Trigger de Nuevo Usuario

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

La funcion `handle_new_user()` crea automaticamente un registro en `user_profiles` con plan 'free' cuando se registra un nuevo usuario.

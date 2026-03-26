-- ============================================================================
-- AGROFINCA - COMPLETE SCHEMA REWRITE
-- ============================================================================
-- WARNING: This script DROPS ALL APP TABLES and recreates them.
-- All data in dropped tables will be LOST.
-- user_profiles is preserved (CREATE IF NOT EXISTS) to keep the signup trigger.
--
-- Why: PostgREST schema cache does not see columns added via ALTER TABLE.
-- A clean CREATE TABLE with all columns inline fixes this permanently.
--
-- Run with: psql or Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP ALL APP TABLES (reverse dependency order, CASCADE)
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 1: Dropping all app tables (reverse dependency order) ===';
END $$;

DROP TABLE IF EXISTS fotos_inspeccion CASCADE;
DROP TABLE IF EXISTS inspecciones CASCADE;
DROP TABLE IF EXISTS aplicaciones_fitosanitarias CASCADE;
DROP TABLE IF EXISTS registros_animales CASCADE;
DROP TABLE IF EXISTS lotes_animales CASCADE;
DROP TABLE IF EXISTS registros_lombricompost CASCADE;
DROP TABLE IF EXISTS camas_lombricompost CASCADE;
DROP TABLE IF EXISTS inspecciones_colmena CASCADE;
DROP TABLE IF EXISTS colmenas CASCADE;
DROP TABLE IF EXISTS tareas CASCADE;
DROP TABLE IF EXISTS costos CASCADE;
DROP TABLE IF EXISTS ventas CASCADE;
DROP TABLE IF EXISTS cosechas CASCADE;
DROP TABLE IF EXISTS ciclos_productivos CASCADE;
DROP TABLE IF EXISTS cultivos_catalogo CASCADE;
DROP TABLE IF EXISTS areas CASCADE;
DROP TABLE IF EXISTS finca_miembros CASCADE;
DROP TABLE IF EXISTS fincas CASCADE;

DO $$ BEGIN
  RAISE NOTICE 'All app tables dropped successfully.';
END $$;

-- ============================================================================
-- STEP 2: user_profiles (preserved - CREATE IF NOT EXISTS)
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 3: Ensuring user_profiles exists ===';
END $$;

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  nombre TEXT,
  plan TEXT DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  is_admin BOOLEAN DEFAULT FALSE,
  farm_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- user_profiles RLS (idempotent - drop ALL old + new policy names then create)
-- Old policy names that may still exist from previous schemas:
DROP POLICY IF EXISTS "Users see own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins see all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins update all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ============================================================================
-- STEP 4: CREATE ALL APP TABLES
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 4: Creating all app tables ===';
END $$;

-- ---------- fincas ----------
CREATE TABLE fincas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  ubicacion TEXT,
  descripcion TEXT,
  area_total_m2 NUMERIC DEFAULT 0,
  sistema_riego TEXT,
  latitud NUMERIC,
  longitud NUMERIC,
  propietario_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  modificado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: fincas';
END $$;

-- ---------- finca_miembros ----------
CREATE TABLE finca_miembros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users ON DELETE CASCADE,
  usuario_email TEXT,
  rol TEXT DEFAULT 'trabajador',
  invitado_por UUID,
  estado_invitacion TEXT DEFAULT 'activa',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: finca_miembros';
  RAISE NOTICE 'Creating helper function user_finca_ids()...';
END $$;

-- Helper function: user_finca_ids() - must be created AFTER fincas + finca_miembros
CREATE OR REPLACE FUNCTION user_finca_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM fincas WHERE propietario_id = auth.uid()
  UNION
  SELECT finca_id FROM finca_miembros WHERE usuario_id = auth.uid();
$$;

DO $$ BEGIN
  RAISE NOTICE 'Created: user_finca_ids() function';
END $$;

-- ---------- areas ----------
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT,
  area_m2 NUMERIC DEFAULT 0,
  cultivo_actual_id UUID,
  cultivo_actual_nombre TEXT,
  geojson JSONB,
  latitud NUMERIC,
  longitud NUMERIC,
  color TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- cultivos_catalogo ----------
CREATE TABLE cultivos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT,
  unidad_produccion TEXT,
  ciclo_dias INTEGER DEFAULT 0,
  color TEXT,
  icono TEXT,
  descripcion TEXT,
  es_predeterminado BOOLEAN DEFAULT FALSE,
  rendimiento_referencia NUMERIC,
  unidad_rendimiento TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: areas, cultivos_catalogo';
END $$;

-- ---------- ciclos_productivos ----------
CREATE TABLE ciclos_productivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  area_id UUID,
  cultivo_id UUID,
  cultivo_nombre TEXT,
  area_nombre TEXT,
  nombre TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  fecha_fin_real DATE,
  estado TEXT DEFAULT 'activo',
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- cosechas ----------
CREATE TABLE cosechas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  ciclo_id UUID,
  cultivo_id UUID,
  cultivo_nombre TEXT,
  area_id UUID,
  fecha DATE,
  cantidad NUMERIC DEFAULT 0,
  unidad TEXT,
  calidad TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: ciclos_productivos, cosechas';
END $$;

-- ---------- ventas ----------
CREATE TABLE ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  cultivo_id UUID,
  cultivo_nombre TEXT,
  producto TEXT,
  fecha DATE,
  cantidad NUMERIC DEFAULT 0,
  unidad TEXT,
  precio_unitario NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  comprador TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- costos ----------
CREATE TABLE costos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  cultivo_id UUID,
  cultivo_nombre TEXT,
  ciclo_id UUID,
  area_id UUID,
  categoria TEXT,
  subcategoria TEXT,
  fecha DATE,
  total NUMERIC DEFAULT 0,
  cantidad NUMERIC DEFAULT 1,
  unidad TEXT,
  costo_unitario NUMERIC DEFAULT 0,
  descripcion TEXT,
  proveedor TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: ventas, costos';
END $$;

-- ---------- colmenas ----------
CREATE TABLE colmenas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  nombre TEXT,
  tipo TEXT,
  estado TEXT DEFAULT 'activa',
  ubicacion TEXT,
  fecha_instalacion DATE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- inspecciones_colmena ----------
CREATE TABLE inspecciones_colmena (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  colmena_id UUID,
  fecha DATE,
  tipo TEXT,
  estado_general TEXT,
  poblacion TEXT,
  reina_vista BOOLEAN DEFAULT FALSE,
  crias TEXT,
  miel TEXT,
  plagas TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: colmenas, inspecciones_colmena';
END $$;

-- ---------- camas_lombricompost ----------
CREATE TABLE camas_lombricompost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  nombre TEXT,
  tipo TEXT,
  estado TEXT DEFAULT 'activa',
  ubicacion TEXT,
  fecha_inicio DATE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- registros_lombricompost ----------
CREATE TABLE registros_lombricompost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  cama_id UUID,
  fecha DATE,
  tipo TEXT,
  descripcion TEXT,
  cantidad NUMERIC,
  unidad TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: camas_lombricompost, registros_lombricompost';
END $$;

-- ---------- tareas ----------
CREATE TABLE tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  titulo TEXT,
  descripcion TEXT,
  fecha_programada DATE,
  fecha_completada DATE,
  estado TEXT DEFAULT 'pendiente',
  prioridad TEXT DEFAULT 'media',
  asignado_a TEXT,
  area_id UUID,
  area_nombre TEXT,
  ciclo_id UUID,
  ciclo_nombre TEXT,
  cultivo_id UUID,
  cultivo_nombre TEXT,
  hora_inicio TIME,
  duracion_minutos INTEGER,
  recurrente BOOLEAN DEFAULT FALSE,
  frecuencia_dias INTEGER,
  completada_en TIMESTAMPTZ,
  completada_por TEXT,
  creado_por TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: tareas';
END $$;

-- ---------- inspecciones ----------
CREATE TABLE inspecciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  area_id UUID,
  area_nombre TEXT,
  ciclo_id UUID,
  cultivo_nombre TEXT,
  fecha DATE,
  tipo TEXT,
  estado_general TEXT,
  plagas TEXT,
  enfermedades TEXT,
  recomendaciones TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- fotos_inspeccion ----------
CREATE TABLE fotos_inspeccion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID,
  inspeccion_id UUID,
  url TEXT,
  descripcion TEXT,
  tipo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: inspecciones, fotos_inspeccion';
END $$;

-- ---------- aplicaciones_fitosanitarias ----------
CREATE TABLE aplicaciones_fitosanitarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  area_id UUID,
  ciclo_id UUID,
  cultivo_nombre TEXT,
  destino TEXT,
  tipo_producto TEXT,
  nombre_producto TEXT,
  ingrediente_activo TEXT,
  fecha DATE,
  producto TEXT,
  dosis TEXT,
  unidad_dosis TEXT,
  metodo TEXT,
  objetivo TEXT,
  periodo_carencia_dias INTEGER,
  area_aplicada_m2 NUMERIC,
  colmena_id UUID,
  cama_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: aplicaciones_fitosanitarias';
END $$;

-- ---------- lotes_animales ----------
CREATE TABLE lotes_animales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  nombre TEXT,
  tipo_animal TEXT,
  cantidad INTEGER DEFAULT 0,
  raza TEXT,
  area_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- registros_animales ----------
CREATE TABLE registros_animales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  lote_id UUID,
  tipo TEXT,
  fecha DATE,
  descripcion TEXT,
  cantidad NUMERIC DEFAULT 0,
  costo NUMERIC DEFAULT 0,
  producto TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: lotes_animales, registros_animales';
END $$;

-- ---- AI conversations & chat history ----
DROP TABLE IF EXISTS ai_chat_history CASCADE;
DROP TABLE IF EXISTS ai_conversations CASCADE;

CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  usuario_id UUID NOT NULL,
  title TEXT DEFAULT 'Nuevo chat',
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations ON DELETE CASCADE,
  finca_id UUID NOT NULL REFERENCES fincas ON DELETE CASCADE,
  usuario_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  image TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  RAISE NOTICE 'Created: ai_conversations, ai_chat_history';
  RAISE NOTICE '=== All tables created successfully ===';
END $$;

-- ============================================================================
-- STEP 5: ENABLE RLS ON ALL TABLES
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 5: Enabling RLS on all tables ===';
END $$;

ALTER TABLE fincas ENABLE ROW LEVEL SECURITY;
ALTER TABLE finca_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cultivos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciclos_productivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosechas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE colmenas ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspecciones_colmena ENABLE ROW LEVEL SECURITY;
ALTER TABLE camas_lombricompost ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_lombricompost ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_inspeccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_fitosanitarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_animales ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_animales ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 6: RLS POLICIES
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 6: Creating RLS policies ===';
END $$;

-- ---- fincas (special: owner + members) ----
CREATE POLICY "fincas_select" ON fincas FOR SELECT USING (
  propietario_id = auth.uid()
  OR id IN (SELECT finca_id FROM finca_miembros WHERE usuario_id = auth.uid())
);
CREATE POLICY "fincas_insert" ON fincas FOR INSERT WITH CHECK (
  propietario_id = auth.uid()
);
CREATE POLICY "fincas_update" ON fincas FOR UPDATE USING (
  propietario_id = auth.uid()
);
CREATE POLICY "fincas_delete" ON fincas FOR DELETE USING (
  propietario_id = auth.uid()
);

DO $$ BEGIN
  RAISE NOTICE 'RLS policies: fincas';
END $$;

-- ---- finca_miembros ----
CREATE POLICY "finca_miembros_select" ON finca_miembros FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "finca_miembros_insert" ON finca_miembros FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "finca_miembros_update" ON finca_miembros FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "finca_miembros_delete" ON finca_miembros FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- areas ----
CREATE POLICY "areas_select" ON areas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "areas_insert" ON areas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "areas_update" ON areas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "areas_delete" ON areas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- cultivos_catalogo ----
CREATE POLICY "cultivos_catalogo_select" ON cultivos_catalogo FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cultivos_catalogo_insert" ON cultivos_catalogo FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cultivos_catalogo_update" ON cultivos_catalogo FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cultivos_catalogo_delete" ON cultivos_catalogo FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

DO $$ BEGIN
  RAISE NOTICE 'RLS policies: finca_miembros, areas, cultivos_catalogo';
END $$;

-- ---- ciclos_productivos ----
CREATE POLICY "ciclos_productivos_select" ON ciclos_productivos FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ciclos_productivos_insert" ON ciclos_productivos FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ciclos_productivos_update" ON ciclos_productivos FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ciclos_productivos_delete" ON ciclos_productivos FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- cosechas ----
CREATE POLICY "cosechas_select" ON cosechas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cosechas_insert" ON cosechas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cosechas_update" ON cosechas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cosechas_delete" ON cosechas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- ventas ----
CREATE POLICY "ventas_select" ON ventas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ventas_insert" ON ventas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ventas_update" ON ventas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ventas_delete" ON ventas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- costos ----
CREATE POLICY "costos_select" ON costos FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "costos_insert" ON costos FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "costos_update" ON costos FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "costos_delete" ON costos FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

DO $$ BEGIN
  RAISE NOTICE 'RLS policies: ciclos_productivos, cosechas, ventas, costos';
END $$;

-- ---- colmenas ----
CREATE POLICY "colmenas_select" ON colmenas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "colmenas_insert" ON colmenas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "colmenas_update" ON colmenas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "colmenas_delete" ON colmenas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- inspecciones_colmena ----
CREATE POLICY "inspecciones_colmena_select" ON inspecciones_colmena FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_colmena_insert" ON inspecciones_colmena FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_colmena_update" ON inspecciones_colmena FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_colmena_delete" ON inspecciones_colmena FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- camas_lombricompost ----
CREATE POLICY "camas_lombricompost_select" ON camas_lombricompost FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "camas_lombricompost_insert" ON camas_lombricompost FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "camas_lombricompost_update" ON camas_lombricompost FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "camas_lombricompost_delete" ON camas_lombricompost FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- registros_lombricompost ----
CREATE POLICY "registros_lombricompost_select" ON registros_lombricompost FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "registros_lombricompost_insert" ON registros_lombricompost FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "registros_lombricompost_update" ON registros_lombricompost FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "registros_lombricompost_delete" ON registros_lombricompost FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

DO $$ BEGIN
  RAISE NOTICE 'RLS policies: colmenas, inspecciones_colmena, camas_lombricompost, registros_lombricompost';
END $$;

-- ---- tareas ----
CREATE POLICY "tareas_select" ON tareas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "tareas_insert" ON tareas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "tareas_update" ON tareas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "tareas_delete" ON tareas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- inspecciones ----
CREATE POLICY "inspecciones_select" ON inspecciones FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_insert" ON inspecciones FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_update" ON inspecciones FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_delete" ON inspecciones FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- fotos_inspeccion ----
CREATE POLICY "fotos_inspeccion_select" ON fotos_inspeccion FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fotos_inspeccion_insert" ON fotos_inspeccion FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fotos_inspeccion_update" ON fotos_inspeccion FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fotos_inspeccion_delete" ON fotos_inspeccion FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

DO $$ BEGIN
  RAISE NOTICE 'RLS policies: tareas, inspecciones, fotos_inspeccion';
END $$;

-- ---- aplicaciones_fitosanitarias ----
CREATE POLICY "aplicaciones_fitosanitarias_select" ON aplicaciones_fitosanitarias FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "aplicaciones_fitosanitarias_insert" ON aplicaciones_fitosanitarias FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "aplicaciones_fitosanitarias_update" ON aplicaciones_fitosanitarias FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "aplicaciones_fitosanitarias_delete" ON aplicaciones_fitosanitarias FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- lotes_animales ----
CREATE POLICY "lotes_animales_select" ON lotes_animales FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "lotes_animales_insert" ON lotes_animales FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "lotes_animales_update" ON lotes_animales FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "lotes_animales_delete" ON lotes_animales FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ---- registros_animales ----
CREATE POLICY "registros_animales_select" ON registros_animales FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "registros_animales_insert" ON registros_animales FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "registros_animales_update" ON registros_animales FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "registros_animales_delete" ON registros_animales FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

DO $$ BEGIN
  RAISE NOTICE 'RLS policies: aplicaciones_fitosanitarias, lotes_animales, registros_animales';
END $$;

-- ---- ai_conversations (user owns their conversations) ----
CREATE POLICY "ai_conv_select" ON ai_conversations FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "ai_conv_insert" ON ai_conversations FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "ai_conv_update" ON ai_conversations FOR UPDATE USING (usuario_id = auth.uid());
CREATE POLICY "ai_conv_delete" ON ai_conversations FOR DELETE USING (usuario_id = auth.uid());

-- ---- ai_chat_history (user owns their messages) ----
CREATE POLICY "ai_chat_select" ON ai_chat_history FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "ai_chat_insert" ON ai_chat_history FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "ai_chat_update" ON ai_chat_history FOR UPDATE USING (usuario_id = auth.uid());
CREATE POLICY "ai_chat_delete" ON ai_chat_history FOR DELETE USING (usuario_id = auth.uid());

DO $$ BEGIN
  RAISE NOTICE 'RLS policies: ai_conversations, ai_chat_history';
  RAISE NOTICE '=== All RLS policies created ===';
END $$;

-- ============================================================================
-- STEP 7: handle_new_user TRIGGER
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 7: Creating handle_new_user trigger ===';
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, nombre, plan, is_admin, farm_count, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'nombre', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    'free',
    FALSE,
    0,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- STEP 8: GRANTS
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 8: Granting permissions ===';
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON user_profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON user_profiles TO authenticated;

GRANT ALL ON fincas TO authenticated;
GRANT ALL ON finca_miembros TO authenticated;
GRANT ALL ON areas TO authenticated;
GRANT ALL ON cultivos_catalogo TO authenticated;
GRANT ALL ON ciclos_productivos TO authenticated;
GRANT ALL ON cosechas TO authenticated;
GRANT ALL ON ventas TO authenticated;
GRANT ALL ON costos TO authenticated;
GRANT ALL ON colmenas TO authenticated;
GRANT ALL ON inspecciones_colmena TO authenticated;
GRANT ALL ON camas_lombricompost TO authenticated;
GRANT ALL ON registros_lombricompost TO authenticated;
GRANT ALL ON tareas TO authenticated;
GRANT ALL ON inspecciones TO authenticated;
GRANT ALL ON fotos_inspeccion TO authenticated;
GRANT ALL ON aplicaciones_fitosanitarias TO authenticated;
GRANT ALL ON lotes_animales TO authenticated;
GRANT ALL ON registros_animales TO authenticated;

GRANT EXECUTE ON FUNCTION user_finca_ids() TO authenticated;

-- ============================================================================
-- STEP 9: NOTIFY PostgREST to reload schema cache
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 9: Notifying PostgREST to reload schema cache ===';
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- STEP 10: VERIFICATION
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '=== STEP 10: Verification ===';
END $$;

SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

DO $$ BEGIN
  RAISE NOTICE '=== SCHEMA REWRITE COMPLETE ===';
  RAISE NOTICE 'All tables created with inline columns. PostgREST cache refreshed.';
  RAISE NOTICE 'If sync still fails, run: NOTIFY pgrst, ''reload schema''; again.';
END $$;

-- ============================================================================
-- STEP: NEW TABLES FOR ACCOUNTING SYSTEM v2
-- ============================================================================

-- --- clientes (directorio de compradores) ---
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  ubicacion TEXT,
  tipo TEXT DEFAULT 'otro',
  notas TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "clientes_insert" ON clientes FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- --- proveedores (directorio de proveedores) ---
CREATE TABLE IF NOT EXISTS proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  ubicacion TEXT,
  tipo TEXT DEFAULT 'otro',
  productos_frecuentes TEXT,
  notas TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proveedores_select" ON proveedores FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "proveedores_insert" ON proveedores FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "proveedores_update" ON proveedores FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "proveedores_delete" ON proveedores FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- --- activos_finca (activos depreciables) ---
CREATE TABLE IF NOT EXISTS activos_finca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  categoria TEXT DEFAULT 'otro',
  fecha_adquisicion DATE,
  costo_adquisicion NUMERIC DEFAULT 0,
  vida_util_meses INTEGER DEFAULT 12,
  valor_residual NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'activo',
  area_id UUID REFERENCES areas(id),
  cultivo_id UUID REFERENCES cultivos_catalogo(id),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE activos_finca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activos_finca_select" ON activos_finca FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "activos_finca_insert" ON activos_finca FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "activos_finca_update" ON activos_finca FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "activos_finca_delete" ON activos_finca FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- --- area_cultivos (policultivo: proporción por área) ---
CREATE TABLE IF NOT EXISTS area_cultivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  cultivo_id UUID NOT NULL REFERENCES cultivos_catalogo(id),
  ciclo_id UUID REFERENCES ciclos_productivos(id),
  proporcion NUMERIC DEFAULT 1.0,
  fecha_inicio DATE,
  fecha_fin DATE,
  activo BOOLEAN DEFAULT true,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE area_cultivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "area_cultivos_select" ON area_cultivos FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "area_cultivos_insert" ON area_cultivos FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "area_cultivos_update" ON area_cultivos FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "area_cultivos_delete" ON area_cultivos FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- --- depreciacion_mensual (registros mensuales auto-generados) ---
CREATE TABLE IF NOT EXISTS depreciacion_mensual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
  activo_id UUID NOT NULL REFERENCES activos_finca(id) ON DELETE CASCADE,
  mes TEXT NOT NULL,
  monto NUMERIC DEFAULT 0,
  area_id UUID REFERENCES areas(id),
  cultivo_id UUID REFERENCES cultivos_catalogo(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE depreciacion_mensual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "depreciacion_mensual_select" ON depreciacion_mensual FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "depreciacion_mensual_insert" ON depreciacion_mensual FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "depreciacion_mensual_update" ON depreciacion_mensual FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "depreciacion_mensual_delete" ON depreciacion_mensual FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- --- fases_fenologicas (fases de cultivos perennes) ---
CREATE TABLE IF NOT EXISTS fases_fenologicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
  ciclo_id UUID NOT NULL REFERENCES ciclos_productivos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  fecha_inicio DATE,
  fecha_fin DATE,
  estado TEXT DEFAULT 'pendiente',
  genera_ingresos BOOLEAN DEFAULT false,
  descripcion TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fases_fenologicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fases_fenologicas_select" ON fases_fenologicas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fases_fenologicas_insert" ON fases_fenologicas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fases_fenologicas_update" ON fases_fenologicas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fases_fenologicas_delete" ON fases_fenologicas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));

-- ============================================================================
-- STEP: ALTER EXISTING TABLES - Add missing columns
-- ============================================================================

-- ciclos_productivos: add missing columns
ALTER TABLE ciclos_productivos ADD COLUMN IF NOT EXISTS cantidad_plantas INTEGER DEFAULT 0;
ALTER TABLE ciclos_productivos ADD COLUMN IF NOT EXISTS fecha_fin_estimada DATE;
ALTER TABLE ciclos_productivos ADD COLUMN IF NOT EXISTS ciclo_dias INTEGER DEFAULT 0;
ALTER TABLE ciclos_productivos ADD COLUMN IF NOT EXISTS tipo_ciclo TEXT DEFAULT 'estacional';

-- costos: add missing columns
ALTER TABLE costos ADD COLUMN IF NOT EXISTS tipo_costo TEXT DEFAULT 'variable';
ALTER TABLE costos ADD COLUMN IF NOT EXISTS es_mano_obra_familiar BOOLEAN DEFAULT false;
ALTER TABLE costos ADD COLUMN IF NOT EXISTS registrado_por TEXT;
ALTER TABLE costos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES proveedores(id);

-- ventas: add missing columns
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS forma_pago TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS registrado_por TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS ciclo_id UUID REFERENCES ciclos_productivos(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cosecha_id UUID REFERENCES cosechas(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobrado BOOLEAN DEFAULT true;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS fecha_cobro DATE;

-- cosechas: add missing columns
ALTER TABLE cosechas ADD COLUMN IF NOT EXISTS registrado_por TEXT;

-- ============================================
-- AgroFinca v2 - Complete Supabase Schema
-- Run this in Supabase SQL Editor
-- Creates all tables, enables RLS, sets policies
-- ============================================

-- ============================================
-- 0. HELPER FUNCTION: Get user's finca IDs
-- Used by RLS policies to check finca access
-- ============================================
CREATE OR REPLACE FUNCTION user_finca_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM fincas WHERE propietario_id = auth.uid()
  UNION
  SELECT finca_id FROM finca_miembros WHERE usuario_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;


-- ============================================
-- 1. USER PROFILES (already exists from supabase-fix.sql)
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users see own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins see all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Service role insert profiles" ON user_profiles;

CREATE POLICY "Users see own profile" ON user_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON user_profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Service role insert profiles" ON user_profiles FOR INSERT WITH CHECK (true);
-- Admin policy without recursive reference
CREATE POLICY "Admins see all profiles" ON user_profiles FOR SELECT USING (
  id = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.is_admin = true
  )
);


-- ============================================
-- 2. FINCAS
-- ============================================
CREATE TABLE IF NOT EXISTS fincas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  ubicacion TEXT,
  descripcion TEXT,
  area_total_m2 NUMERIC DEFAULT 0,
  sistema_riego TEXT,
  latitud NUMERIC,
  longitud NUMERIC,
  propietario_id UUID REFERENCES auth.users(id),
  modificado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fincas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fincas_select" ON fincas;
DROP POLICY IF EXISTS "fincas_insert" ON fincas;
DROP POLICY IF EXISTS "fincas_update" ON fincas;
DROP POLICY IF EXISTS "fincas_delete" ON fincas;

CREATE POLICY "fincas_select" ON fincas FOR SELECT USING (
  propietario_id = auth.uid() OR id IN (SELECT finca_id FROM finca_miembros WHERE usuario_id = auth.uid())
);
CREATE POLICY "fincas_insert" ON fincas FOR INSERT WITH CHECK (propietario_id = auth.uid());
CREATE POLICY "fincas_update" ON fincas FOR UPDATE USING (propietario_id = auth.uid());
CREATE POLICY "fincas_delete" ON fincas FOR DELETE USING (propietario_id = auth.uid());


-- ============================================
-- 3. FINCA_MIEMBROS (user-finca membership with roles)
-- ============================================
CREATE TABLE IF NOT EXISTS finca_miembros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_email TEXT,
  rol TEXT DEFAULT 'trabajador',
  invitado_por UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE finca_miembros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finca_miembros_select" ON finca_miembros;
DROP POLICY IF EXISTS "finca_miembros_insert" ON finca_miembros;
DROP POLICY IF EXISTS "finca_miembros_update" ON finca_miembros;
DROP POLICY IF EXISTS "finca_miembros_delete" ON finca_miembros;

CREATE POLICY "finca_miembros_select" ON finca_miembros FOR SELECT USING (
  finca_id IN (SELECT user_finca_ids())
);
CREATE POLICY "finca_miembros_insert" ON finca_miembros FOR INSERT WITH CHECK (
  finca_id IN (SELECT id FROM fincas WHERE propietario_id = auth.uid())
);
CREATE POLICY "finca_miembros_update" ON finca_miembros FOR UPDATE USING (
  finca_id IN (SELECT id FROM fincas WHERE propietario_id = auth.uid())
);
CREATE POLICY "finca_miembros_delete" ON finca_miembros FOR DELETE USING (
  finca_id IN (SELECT id FROM fincas WHERE propietario_id = auth.uid())
);


-- ============================================
-- 4. AREAS (parcelas georreferenciadas)
-- ============================================
CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT,
  area_m2 NUMERIC DEFAULT 0,
  cultivo_actual_id UUID,
  geojson JSONB,
  latitud NUMERIC,
  longitud NUMERIC,
  color TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "areas_select" ON areas;
DROP POLICY IF EXISTS "areas_insert" ON areas;
DROP POLICY IF EXISTS "areas_update" ON areas;
DROP POLICY IF EXISTS "areas_delete" ON areas;

CREATE POLICY "areas_select" ON areas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "areas_insert" ON areas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "areas_update" ON areas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "areas_delete" ON areas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 5. CULTIVOS_CATALOGO (crop catalog per finca)
-- ============================================
CREATE TABLE IF NOT EXISTS cultivos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT,
  unidad_produccion TEXT,
  ciclo_dias INTEGER DEFAULT 0,
  color TEXT,
  icono TEXT,
  descripcion TEXT,
  es_predeterminado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cultivos_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cultivos_select" ON cultivos_catalogo;
DROP POLICY IF EXISTS "cultivos_insert" ON cultivos_catalogo;
DROP POLICY IF EXISTS "cultivos_update" ON cultivos_catalogo;
DROP POLICY IF EXISTS "cultivos_delete" ON cultivos_catalogo;

CREATE POLICY "cultivos_select" ON cultivos_catalogo FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cultivos_insert" ON cultivos_catalogo FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cultivos_update" ON cultivos_catalogo FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cultivos_delete" ON cultivos_catalogo FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 6. CICLOS_PRODUCTIVOS
-- ============================================
CREATE TABLE IF NOT EXISTS ciclos_productivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  area_id UUID,
  cultivo_id UUID,
  nombre TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  estado TEXT DEFAULT 'activo',
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ciclos_productivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ciclos_select" ON ciclos_productivos;
DROP POLICY IF EXISTS "ciclos_insert" ON ciclos_productivos;
DROP POLICY IF EXISTS "ciclos_update" ON ciclos_productivos;
DROP POLICY IF EXISTS "ciclos_delete" ON ciclos_productivos;

CREATE POLICY "ciclos_select" ON ciclos_productivos FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ciclos_insert" ON ciclos_productivos FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ciclos_update" ON ciclos_productivos FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ciclos_delete" ON ciclos_productivos FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 7. COSECHAS
-- ============================================
CREATE TABLE IF NOT EXISTS cosechas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  ciclo_id UUID,
  cultivo_id UUID,
  area_id UUID,
  fecha DATE,
  cantidad NUMERIC DEFAULT 0,
  unidad TEXT,
  calidad TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cosechas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cosechas_select" ON cosechas;
DROP POLICY IF EXISTS "cosechas_insert" ON cosechas;
DROP POLICY IF EXISTS "cosechas_update" ON cosechas;
DROP POLICY IF EXISTS "cosechas_delete" ON cosechas;

CREATE POLICY "cosechas_select" ON cosechas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cosechas_insert" ON cosechas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cosechas_update" ON cosechas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "cosechas_delete" ON cosechas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 8. VENTAS
-- ============================================
CREATE TABLE IF NOT EXISTS ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  cultivo_id UUID,
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
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventas_select" ON ventas;
DROP POLICY IF EXISTS "ventas_insert" ON ventas;
DROP POLICY IF EXISTS "ventas_update" ON ventas;
DROP POLICY IF EXISTS "ventas_delete" ON ventas;

CREATE POLICY "ventas_select" ON ventas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ventas_insert" ON ventas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ventas_update" ON ventas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "ventas_delete" ON ventas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 9. COSTOS
-- ============================================
CREATE TABLE IF NOT EXISTS costos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  cultivo_id UUID,
  ciclo_id UUID,
  categoria TEXT,
  subcategoria TEXT,
  fecha DATE,
  monto NUMERIC DEFAULT 0,
  descripcion TEXT,
  proveedor TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE costos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "costos_select" ON costos;
DROP POLICY IF EXISTS "costos_insert" ON costos;
DROP POLICY IF EXISTS "costos_update" ON costos;
DROP POLICY IF EXISTS "costos_delete" ON costos;

CREATE POLICY "costos_select" ON costos FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "costos_insert" ON costos FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "costos_update" ON costos FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "costos_delete" ON costos FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 10. COLMENAS
-- ============================================
CREATE TABLE IF NOT EXISTS colmenas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT,
  tipo TEXT,
  estado TEXT DEFAULT 'activa',
  ubicacion TEXT,
  fecha_instalacion DATE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE colmenas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colmenas_select" ON colmenas;
DROP POLICY IF EXISTS "colmenas_insert" ON colmenas;
DROP POLICY IF EXISTS "colmenas_update" ON colmenas;
DROP POLICY IF EXISTS "colmenas_delete" ON colmenas;

CREATE POLICY "colmenas_select" ON colmenas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "colmenas_insert" ON colmenas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "colmenas_update" ON colmenas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "colmenas_delete" ON colmenas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 11. INSPECCIONES_COLMENA
-- ============================================
CREATE TABLE IF NOT EXISTS inspecciones_colmena (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  colmena_id UUID,
  fecha DATE,
  estado_general TEXT,
  reina_vista BOOLEAN DEFAULT FALSE,
  cria BOOLEAN DEFAULT FALSE,
  miel_estimada NUMERIC DEFAULT 0,
  plagas TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE inspecciones_colmena ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insp_colmena_select" ON inspecciones_colmena;
DROP POLICY IF EXISTS "insp_colmena_insert" ON inspecciones_colmena;
DROP POLICY IF EXISTS "insp_colmena_update" ON inspecciones_colmena;
DROP POLICY IF EXISTS "insp_colmena_delete" ON inspecciones_colmena;

CREATE POLICY "insp_colmena_select" ON inspecciones_colmena FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "insp_colmena_insert" ON inspecciones_colmena FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "insp_colmena_update" ON inspecciones_colmena FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "insp_colmena_delete" ON inspecciones_colmena FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 12. CAMAS_LOMBRICOMPOST
-- ============================================
CREATE TABLE IF NOT EXISTS camas_lombricompost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT,
  largo_m NUMERIC,
  ancho_m NUMERIC,
  estado TEXT DEFAULT 'activa',
  fecha_inicio DATE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE camas_lombricompost ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "camas_select" ON camas_lombricompost;
DROP POLICY IF EXISTS "camas_insert" ON camas_lombricompost;
DROP POLICY IF EXISTS "camas_update" ON camas_lombricompost;
DROP POLICY IF EXISTS "camas_delete" ON camas_lombricompost;

CREATE POLICY "camas_select" ON camas_lombricompost FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "camas_insert" ON camas_lombricompost FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "camas_update" ON camas_lombricompost FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "camas_delete" ON camas_lombricompost FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 13. REGISTROS_LOMBRICOMPOST
-- ============================================
CREATE TABLE IF NOT EXISTS registros_lombricompost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  cama_id UUID,
  fecha DATE,
  tipo TEXT,
  cantidad_kg NUMERIC DEFAULT 0,
  material TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE registros_lombricompost ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reg_lombri_select" ON registros_lombricompost;
DROP POLICY IF EXISTS "reg_lombri_insert" ON registros_lombricompost;
DROP POLICY IF EXISTS "reg_lombri_update" ON registros_lombricompost;
DROP POLICY IF EXISTS "reg_lombri_delete" ON registros_lombricompost;

CREATE POLICY "reg_lombri_select" ON registros_lombricompost FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "reg_lombri_insert" ON registros_lombricompost FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "reg_lombri_update" ON registros_lombricompost FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "reg_lombri_delete" ON registros_lombricompost FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 14. TAREAS
-- ============================================
CREATE TABLE IF NOT EXISTS tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  titulo TEXT,
  descripcion TEXT,
  fecha_programada DATE,
  fecha_completada DATE,
  estado TEXT DEFAULT 'pendiente',
  prioridad TEXT DEFAULT 'media',
  asignado_a UUID,
  area_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tareas_select" ON tareas;
DROP POLICY IF EXISTS "tareas_insert" ON tareas;
DROP POLICY IF EXISTS "tareas_update" ON tareas;
DROP POLICY IF EXISTS "tareas_delete" ON tareas;

CREATE POLICY "tareas_select" ON tareas FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "tareas_insert" ON tareas FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "tareas_update" ON tareas FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "tareas_delete" ON tareas FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 15. INSPECCIONES (crop inspections with photos)
-- ============================================
CREATE TABLE IF NOT EXISTS inspecciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  area_id UUID,
  ciclo_id UUID,
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
ALTER TABLE inspecciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inspecciones_select" ON inspecciones;
DROP POLICY IF EXISTS "inspecciones_insert" ON inspecciones;
DROP POLICY IF EXISTS "inspecciones_update" ON inspecciones;
DROP POLICY IF EXISTS "inspecciones_delete" ON inspecciones;

CREATE POLICY "inspecciones_select" ON inspecciones FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_insert" ON inspecciones FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_update" ON inspecciones FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "inspecciones_delete" ON inspecciones FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 16. FOTOS_INSPECCION
-- ============================================
CREATE TABLE IF NOT EXISTS fotos_inspeccion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspeccion_id UUID,
  finca_id UUID,
  url TEXT,
  descripcion TEXT,
  analisis_ia TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fotos_inspeccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fotos_select" ON fotos_inspeccion;
DROP POLICY IF EXISTS "fotos_insert" ON fotos_inspeccion;
DROP POLICY IF EXISTS "fotos_update" ON fotos_inspeccion;
DROP POLICY IF EXISTS "fotos_delete" ON fotos_inspeccion;

CREATE POLICY "fotos_select" ON fotos_inspeccion FOR SELECT USING (
  finca_id IN (SELECT user_finca_ids()) OR
  inspeccion_id IN (SELECT id FROM inspecciones WHERE finca_id IN (SELECT user_finca_ids()))
);
CREATE POLICY "fotos_insert" ON fotos_inspeccion FOR INSERT WITH CHECK (true);
CREATE POLICY "fotos_update" ON fotos_inspeccion FOR UPDATE USING (
  finca_id IN (SELECT user_finca_ids()) OR
  inspeccion_id IN (SELECT id FROM inspecciones WHERE finca_id IN (SELECT user_finca_ids()))
);
CREATE POLICY "fotos_delete" ON fotos_inspeccion FOR DELETE USING (
  finca_id IN (SELECT user_finca_ids()) OR
  inspeccion_id IN (SELECT id FROM inspecciones WHERE finca_id IN (SELECT user_finca_ids()))
);


-- ============================================
-- 17. APLICACIONES_FITOSANITARIAS
-- ============================================
CREATE TABLE IF NOT EXISTS aplicaciones_fitosanitarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  area_id UUID,
  ciclo_id UUID,
  fecha DATE,
  producto TEXT,
  dosis TEXT,
  metodo TEXT,
  objetivo TEXT,
  periodo_carencia_dias INTEGER,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE aplicaciones_fitosanitarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fitosan_select" ON aplicaciones_fitosanitarias;
DROP POLICY IF EXISTS "fitosan_insert" ON aplicaciones_fitosanitarias;
DROP POLICY IF EXISTS "fitosan_update" ON aplicaciones_fitosanitarias;
DROP POLICY IF EXISTS "fitosan_delete" ON aplicaciones_fitosanitarias;

CREATE POLICY "fitosan_select" ON aplicaciones_fitosanitarias FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fitosan_insert" ON aplicaciones_fitosanitarias FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fitosan_update" ON aplicaciones_fitosanitarias FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "fitosan_delete" ON aplicaciones_fitosanitarias FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 18. LOTES_ANIMALES
-- ============================================
CREATE TABLE IF NOT EXISTS lotes_animales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT,
  tipo_animal TEXT,
  cantidad INTEGER DEFAULT 0,
  raza TEXT,
  area_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE lotes_animales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lotes_select" ON lotes_animales;
DROP POLICY IF EXISTS "lotes_insert" ON lotes_animales;
DROP POLICY IF EXISTS "lotes_update" ON lotes_animales;
DROP POLICY IF EXISTS "lotes_delete" ON lotes_animales;

CREATE POLICY "lotes_select" ON lotes_animales FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "lotes_insert" ON lotes_animales FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "lotes_update" ON lotes_animales FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "lotes_delete" ON lotes_animales FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 19. REGISTROS_ANIMALES
-- ============================================
CREATE TABLE IF NOT EXISTS registros_animales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  lote_id UUID,
  tipo TEXT,
  fecha DATE,
  descripcion TEXT,
  cantidad NUMERIC DEFAULT 0,
  costo NUMERIC DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE registros_animales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reg_animales_select" ON registros_animales;
DROP POLICY IF EXISTS "reg_animales_insert" ON registros_animales;
DROP POLICY IF EXISTS "reg_animales_update" ON registros_animales;
DROP POLICY IF EXISTS "reg_animales_delete" ON registros_animales;

CREATE POLICY "reg_animales_select" ON registros_animales FOR SELECT USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "reg_animales_insert" ON registros_animales FOR INSERT WITH CHECK (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "reg_animales_update" ON registros_animales FOR UPDATE USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "reg_animales_delete" ON registros_animales FOR DELETE USING (finca_id IN (SELECT user_finca_ids()));


-- ============================================
-- 20. TRIGGER: Auto-create user_profiles on signup
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, nombre, plan, is_admin, farm_count, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    'free',
    FALSE,
    0,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nombre = COALESCE(EXCLUDED.nombre, public.user_profiles.nombre),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================
-- 21. GRANTS
-- ============================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Authenticated users: full CRUD on all app tables
GRANT ALL ON public.user_profiles TO authenticated;
GRANT ALL ON public.fincas TO authenticated;
GRANT ALL ON public.finca_miembros TO authenticated;
GRANT ALL ON public.areas TO authenticated;
GRANT ALL ON public.cultivos_catalogo TO authenticated;
GRANT ALL ON public.ciclos_productivos TO authenticated;
GRANT ALL ON public.cosechas TO authenticated;
GRANT ALL ON public.ventas TO authenticated;
GRANT ALL ON public.costos TO authenticated;
GRANT ALL ON public.colmenas TO authenticated;
GRANT ALL ON public.inspecciones_colmena TO authenticated;
GRANT ALL ON public.camas_lombricompost TO authenticated;
GRANT ALL ON public.registros_lombricompost TO authenticated;
GRANT ALL ON public.tareas TO authenticated;
GRANT ALL ON public.inspecciones TO authenticated;
GRANT ALL ON public.fotos_inspeccion TO authenticated;
GRANT ALL ON public.aplicaciones_fitosanitarias TO authenticated;
GRANT ALL ON public.lotes_animales TO authenticated;
GRANT ALL ON public.registros_animales TO authenticated;

-- Anon: read-only on profiles (for signup trigger)
GRANT SELECT ON public.user_profiles TO anon;


-- ============================================
-- 22. SCHEMA MIGRATIONS (v2.1)
-- Run these after initial schema is in place
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '🔄 Iniciando migraciones v2.1 - cultivos_catalogo...';
END $$;

-- Add rendimiento fields to cultivos_catalogo
ALTER TABLE cultivos_catalogo ADD COLUMN IF NOT EXISTS rendimiento_referencia NUMERIC;
ALTER TABLE cultivos_catalogo ADD COLUMN IF NOT EXISTS unidad_rendimiento TEXT;

DO $$
BEGIN
  RAISE NOTICE '✅ cultivos_catalogo: rendimiento_referencia, unidad_rendimiento';
  RAISE NOTICE '🔄 Migrando tareas (campos agenda)...';
END $$;

-- Add agenda fields to tareas
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS hora_inicio TIME;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS duracion_minutos INTEGER;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS ciclo_id UUID;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS cultivo_id UUID;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS cultivo_nombre TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS area_nombre TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS ciclo_nombre TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS recurrente BOOLEAN DEFAULT FALSE;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS frecuencia_dias INTEGER;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS completada_en TIMESTAMPTZ;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS completada_por TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS creado_por TEXT;

-- Fix asignado_a from UUID to TEXT (JS uses name strings)
DO $$ BEGIN
  ALTER TABLE tareas ALTER COLUMN asignado_a TYPE TEXT USING asignado_a::TEXT;
  RAISE NOTICE '✅ tareas: 12 columnas agenda + asignado_a TEXT';
EXCEPTION WHEN others THEN
  RAISE NOTICE '⚠️ tareas.asignado_a ya es TEXT (omitido)';
END $$;

-- ============================================
-- 22b. SCHEMA MIGRATIONS (v2.2) - Denormalized _nombre fields
-- These are cached display names used by the JS app to avoid JOINs
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '🔄 Iniciando migraciones v2.2 - campos denormalizados...';
END $$;

-- finca_miembros: invitation tracking
ALTER TABLE finca_miembros ADD COLUMN IF NOT EXISTS estado_invitacion TEXT DEFAULT 'activa';

DO $$
BEGIN
  RAISE NOTICE '✅ finca_miembros: estado_invitacion';
END $$;

-- areas: current crop name cache
ALTER TABLE areas ADD COLUMN IF NOT EXISTS cultivo_actual_nombre TEXT;

DO $$
BEGIN
  RAISE NOTICE '✅ areas: cultivo_actual_nombre';
END $$;

-- ciclos_productivos: denormalized names + real end date
ALTER TABLE ciclos_productivos ADD COLUMN IF NOT EXISTS cultivo_nombre TEXT;
ALTER TABLE ciclos_productivos ADD COLUMN IF NOT EXISTS area_nombre TEXT;
ALTER TABLE ciclos_productivos ADD COLUMN IF NOT EXISTS fecha_fin_real DATE;

DO $$
BEGIN
  RAISE NOTICE '✅ ciclos_productivos: cultivo_nombre, area_nombre, fecha_fin_real';
END $$;

-- cosechas: denormalized crop name
ALTER TABLE cosechas ADD COLUMN IF NOT EXISTS cultivo_nombre TEXT;

DO $$
BEGIN
  RAISE NOTICE '✅ cosechas: cultivo_nombre';
END $$;

-- ventas: product name + crop name
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS producto TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cultivo_nombre TEXT;

DO $$
BEGIN
  RAISE NOTICE '✅ ventas: producto, cultivo_nombre';
END $$;

-- costos: crop name
ALTER TABLE costos ADD COLUMN IF NOT EXISTS cultivo_nombre TEXT;

DO $$
BEGIN
  RAISE NOTICE '✅ costos: cultivo_nombre';
END $$;

-- inspecciones: denormalized names
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS cultivo_nombre TEXT;
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS area_nombre TEXT;

DO $$
BEGIN
  RAISE NOTICE '✅ inspecciones: cultivo_nombre, area_nombre';
END $$;

-- aplicaciones_fitosanitarias: extended fields
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS cultivo_nombre TEXT;
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS destino TEXT;
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS tipo_producto TEXT;
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS nombre_producto TEXT;
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS ingrediente_activo TEXT;
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS unidad_dosis TEXT;
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS area_aplicada_m2 NUMERIC;
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS colmena_id UUID;
ALTER TABLE aplicaciones_fitosanitarias ADD COLUMN IF NOT EXISTS cama_id UUID;

DO $$
BEGIN
  RAISE NOTICE '✅ aplicaciones_fitosanitarias: 9 columnas nuevas';
END $$;

-- registros_animales: product field
ALTER TABLE registros_animales ADD COLUMN IF NOT EXISTS producto TEXT;

DO $$
BEGIN
  RAISE NOTICE '✅ registros_animales: producto';
  RAISE NOTICE '🎉 Migraciones v2.2 completadas exitosamente';
END $$;


-- ============================================
-- 22c. FIX FK CONSTRAINTS (v2.3)
-- fincas.propietario_id must reference auth.users, NOT the local usuarios table
-- finca_miembros.usuario_id must reference auth.users, NOT usuarios
-- ============================================

DO $$
DECLARE
  fk_table TEXT;
BEGIN
  RAISE NOTICE '🔄 Verificando FK constraints en fincas y finca_miembros...';

  -- Check if fincas_propietario_id_fkey references the wrong table
  SELECT ccu.table_name INTO fk_table
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'fincas'
  AND tc.constraint_name = 'fincas_propietario_id_fkey'
  AND tc.constraint_type = 'FOREIGN KEY';

  IF fk_table IS NOT NULL AND fk_table = 'usuarios' THEN
    RAISE NOTICE '⚠️ fincas.propietario_id apunta a "usuarios" (incorrecto) - corrigiendo a auth.users...';
    ALTER TABLE fincas DROP CONSTRAINT fincas_propietario_id_fkey;
    ALTER TABLE fincas ADD CONSTRAINT fincas_propietario_id_fkey FOREIGN KEY (propietario_id) REFERENCES auth.users(id);
    RAISE NOTICE '✅ fincas.propietario_id ahora apunta a auth.users';
  ELSIF fk_table IS NOT NULL THEN
    RAISE NOTICE '✅ fincas.propietario_id ya apunta a "%", no se necesita cambio', fk_table;
  ELSE
    -- No FK constraint exists, create it
    ALTER TABLE fincas ADD CONSTRAINT fincas_propietario_id_fkey FOREIGN KEY (propietario_id) REFERENCES auth.users(id);
    RAISE NOTICE '✅ fincas.propietario_id: FK creado apuntando a auth.users';
  END IF;

  -- Check finca_miembros.usuario_id FK
  SELECT ccu.table_name INTO fk_table
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'finca_miembros'
  AND tc.constraint_name = 'finca_miembros_usuario_id_fkey'
  AND tc.constraint_type = 'FOREIGN KEY';

  IF fk_table IS NOT NULL AND fk_table = 'usuarios' THEN
    RAISE NOTICE '⚠️ finca_miembros.usuario_id apunta a "usuarios" (incorrecto) - corrigiendo a auth.users...';
    ALTER TABLE finca_miembros DROP CONSTRAINT finca_miembros_usuario_id_fkey;
    ALTER TABLE finca_miembros ADD CONSTRAINT finca_miembros_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);
    RAISE NOTICE '✅ finca_miembros.usuario_id ahora apunta a auth.users';
  ELSIF fk_table IS NOT NULL THEN
    RAISE NOTICE '✅ finca_miembros.usuario_id ya apunta a "%", no se necesita cambio', fk_table;
  ELSE
    ALTER TABLE finca_miembros ADD CONSTRAINT finca_miembros_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);
    RAISE NOTICE '✅ finca_miembros.usuario_id: FK creado apuntando a auth.users';
  END IF;
END $$;


-- ============================================
-- 23. VERIFY: Check all tables and new columns exist
-- ============================================

-- Show all tables
SELECT table_name, (
  SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public'
) as column_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- Verify critical new columns exist
DO $$
DECLARE
  missing_count INTEGER := 0;
BEGIN
  -- Check finca_miembros.estado_invitacion
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finca_miembros' AND column_name = 'estado_invitacion') THEN
    RAISE WARNING '❌ FALTA: finca_miembros.estado_invitacion';
    missing_count := missing_count + 1;
  END IF;

  -- Check ciclos_productivos.cultivo_nombre
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ciclos_productivos' AND column_name = 'cultivo_nombre') THEN
    RAISE WARNING '❌ FALTA: ciclos_productivos.cultivo_nombre';
    missing_count := missing_count + 1;
  END IF;

  -- Check areas.cultivo_actual_nombre
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'areas' AND column_name = 'cultivo_actual_nombre') THEN
    RAISE WARNING '❌ FALTA: areas.cultivo_actual_nombre';
    missing_count := missing_count + 1;
  END IF;

  -- Check tareas.hora_inicio
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tareas' AND column_name = 'hora_inicio') THEN
    RAISE WARNING '❌ FALTA: tareas.hora_inicio';
    missing_count := missing_count + 1;
  END IF;

  -- Check cultivos_catalogo.rendimiento_referencia
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cultivos_catalogo' AND column_name = 'rendimiento_referencia') THEN
    RAISE WARNING '❌ FALTA: cultivos_catalogo.rendimiento_referencia';
    missing_count := missing_count + 1;
  END IF;

  IF missing_count = 0 THEN
    RAISE NOTICE '✅ VERIFICACION: Todas las columnas críticas existen correctamente';
  ELSE
    RAISE WARNING '⚠️ VERIFICACION: %s columna(s) crítica(s) faltan - revisa los errores arriba', missing_count;
  END IF;
END $$;

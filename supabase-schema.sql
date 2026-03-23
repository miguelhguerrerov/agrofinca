-- ============================================
-- AgroFinca v2.0 - Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Core Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nombre TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'paid')),
  plan_expires_at TIMESTAMPTZ,
  is_admin BOOLEAN DEFAULT FALSE,
  farm_count INTEGER DEFAULT 0,
  disabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS upgrade_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id TEXT,
  amount REAL,
  currency TEXT DEFAULT 'USD',
  payer_email TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE, nombre TEXT, rol TEXT DEFAULT 'propietario',
  avatar_iniciales TEXT, plan TEXT DEFAULT 'free', is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fincas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  propietario_id UUID REFERENCES usuarios(id),
  nombre TEXT NOT NULL, ubicacion TEXT, descripcion TEXT,
  area_total_m2 REAL DEFAULT 0, sistema_riego TEXT,
  latitud DOUBLE PRECISION, longitud DOUBLE PRECISION,
  modificado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finca_miembros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id),
  usuario_email TEXT, nombre TEXT, rol TEXT DEFAULT 'trabajador',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, cultivo_actual_id UUID, cultivo_actual_nombre TEXT,
  area_m2 REAL DEFAULT 0, color TEXT DEFAULT '#4CAF50', geojson TEXT, notas TEXT,
  modificado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cultivos_catalogo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, tipo TEXT, unidad_produccion TEXT DEFAULT 'kg',
  ciclo_dias INTEGER DEFAULT 0, color TEXT, icono TEXT, descripcion TEXT,
  es_predeterminado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ciclos_productivos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  cultivo_id UUID, cultivo_nombre TEXT, area_id UUID, area_nombre TEXT,
  fecha_inicio DATE, fecha_fin_estimada DATE, fecha_fin_real DATE,
  ciclo_dias INTEGER DEFAULT 0, estado TEXT DEFAULT 'activo',
  cantidad_plantas INTEGER DEFAULT 0, notas TEXT, registrado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cosechas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  ciclo_id UUID, cultivo_id UUID, cultivo_nombre TEXT,
  fecha DATE, cantidad REAL DEFAULT 0, unidad TEXT DEFAULT 'kg',
  calidad TEXT, notas TEXT, registrado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  cultivo_id UUID, producto TEXT, cultivo_nombre TEXT,
  fecha DATE, cantidad REAL DEFAULT 0, unidad TEXT,
  precio_unitario REAL DEFAULT 0, total REAL DEFAULT 0,
  comprador TEXT, forma_pago TEXT DEFAULT 'efectivo', notas TEXT, registrado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS costos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  categoria TEXT, descripcion TEXT, cultivo_id UUID, cultivo_nombre TEXT,
  ciclo_id UUID, fecha DATE, cantidad REAL DEFAULT 1, unidad TEXT,
  costo_unitario REAL DEFAULT 0, total REAL DEFAULT 0,
  es_mano_obra_familiar BOOLEAN DEFAULT FALSE, notas TEXT, registrado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS colmenas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, tipo TEXT DEFAULT 'langstroth',
  ubicacion TEXT, estado TEXT DEFAULT 'activa',
  fecha_instalacion DATE, notas TEXT, modificado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inspecciones_colmena (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID, colmena_id UUID REFERENCES colmenas(id) ON DELETE CASCADE,
  colmena_nombre TEXT, fecha DATE, estado_reina TEXT,
  temperamento TEXT, marcos_cria INTEGER DEFAULT 0, marcos_miel INTEGER DEFAULT 0,
  enfermedades TEXT, alimentacion BOOLEAN DEFAULT FALSE, tratamiento TEXT,
  notas TEXT, inspector TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS camas_lombricompost (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, largo_m REAL, ancho_m REAL,
  fecha_inicio DATE, estado TEXT DEFAULT 'alimentando',
  notas TEXT, modificado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registros_lombricompost (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID, cama_id UUID REFERENCES camas_lombricompost(id) ON DELETE CASCADE,
  cama_nombre TEXT, fecha DATE, tipo TEXT, material TEXT,
  cantidad_kg REAL DEFAULT 0, notas TEXT, registrado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tareas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, descripcion TEXT,
  cultivo_id UUID, cultivo_nombre TEXT,
  fecha_programada DATE, prioridad TEXT DEFAULT 'media',
  recurrente BOOLEAN DEFAULT FALSE, frecuencia_dias INTEGER DEFAULT 7,
  estado TEXT DEFAULT 'pendiente',
  asignado_a TEXT, creado_por TEXT,
  completada_en TIMESTAMPTZ, completada_por TEXT, notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inspecciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  titulo TEXT, fecha DATE, estado_general TEXT,
  area_id UUID, area_nombre TEXT, ciclo_id UUID, cultivo_nombre TEXT,
  estado_follaje TEXT, estado_riego TEXT, plagas_detectadas TEXT,
  enfermedades_detectadas TEXT, estado_suelo TEXT, etapa_fenologica TEXT,
  observaciones TEXT, fotos_count INTEGER DEFAULT 0, inspector TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fotos_inspeccion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspeccion_id UUID REFERENCES inspecciones(id) ON DELETE CASCADE,
  finca_id UUID, data_url TEXT, thumbnail TEXT, nombre TEXT,
  storage_url TEXT, fecha DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aplicaciones_fitosanitarias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  destino TEXT, cultivo_nombre TEXT, ciclo_id UUID, area_id UUID,
  colmena_id UUID, cama_id UUID, tipo_producto TEXT,
  nombre_producto TEXT, ingrediente_activo TEXT,
  fecha DATE, dosis REAL DEFAULT 0, unidad_dosis TEXT,
  volumen_agua_litros REAL, area_aplicada_m2 REAL, metodo TEXT,
  categoria_toxicidad TEXT, periodo_carencia_dias INTEGER DEFAULT 0,
  motivo TEXT, notas TEXT, aplicado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lotes_animales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID REFERENCES fincas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, tipo_animal TEXT, raza TEXT,
  cantidad_inicial INTEGER DEFAULT 0, cantidad_actual INTEGER DEFAULT 0,
  fecha_ingreso DATE, estado TEXT DEFAULT 'activo',
  ubicacion TEXT, proveedor TEXT, costo_adquisicion REAL DEFAULT 0,
  notas TEXT, modificado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registros_animales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID, lote_id UUID REFERENCES lotes_animales(id) ON DELETE CASCADE,
  lote_nombre TEXT, fecha DATE, tipo TEXT,
  tipo_alimento TEXT, cantidad REAL DEFAULT 0, cantidad_kg REAL DEFAULT 0,
  peso_promedio_kg REAL, muestra INTEGER, huevos_rotos INTEGER DEFAULT 0,
  costo REAL DEFAULT 0, producto TEXT, notas TEXT, registrado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finca_id UUID,
  usuario_id UUID,
  role TEXT,
  content TEXT,
  image TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- Enable RLS on all tables
-- ==========================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS Policies - User Profiles
-- ==========================================

CREATE POLICY "Users see own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Users insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Admins see all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ==========================================
-- RLS Policies - User data isolation
-- ==========================================

-- Helper function: user's accessible finca IDs
CREATE OR REPLACE FUNCTION user_finca_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM fincas WHERE propietario_id = auth.uid()
  UNION
  SELECT finca_id FROM finca_miembros WHERE usuario_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Usuarios
CREATE POLICY "Users manage own user" ON usuarios
  FOR ALL USING (id = auth.uid());

-- Fincas
CREATE POLICY "Owners see own fincas" ON fincas
  FOR ALL USING (propietario_id = auth.uid());

CREATE POLICY "Members see fincas" ON fincas
  FOR SELECT USING (id IN (SELECT finca_id FROM finca_miembros WHERE usuario_id = auth.uid()));

-- Finca miembros
CREATE POLICY "Access finca_miembros" ON finca_miembros
  FOR ALL USING (finca_id IN (SELECT user_finca_ids()));

-- All tables with finca_id
CREATE POLICY "User access areas" ON areas FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access cultivos" ON cultivos_catalogo FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access ciclos" ON ciclos_productivos FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access cosechas" ON cosechas FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access ventas" ON ventas FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access costos" ON costos FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access colmenas" ON colmenas FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access inspecciones_colmena" ON inspecciones_colmena FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access camas_lombricompost" ON camas_lombricompost FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access registros_lombricompost" ON registros_lombricompost FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access tareas" ON tareas FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access inspecciones" ON inspecciones FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access fotos" ON fotos_inspeccion FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access fitosanitario" ON aplicaciones_fitosanitarias FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access lotes_animales" ON lotes_animales FOR ALL USING (finca_id IN (SELECT user_finca_ids()));
CREATE POLICY "User access registros_animales" ON registros_animales FOR ALL USING (finca_id IN (SELECT user_finca_ids()));

-- AI Chat History
CREATE POLICY "Users access own chat" ON ai_chat_history
  FOR ALL USING (usuario_id = auth.uid());

-- Upgrade Requests
CREATE POLICY "Users create own requests" ON upgrade_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users see own requests" ON upgrade_requests
  FOR SELECT USING (user_id = auth.uid());

-- Payment History
CREATE POLICY "Users see own payments" ON payment_history
  FOR SELECT USING (user_id = auth.uid());

-- ==========================================
-- Auto-create profile on signup
-- ==========================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, nombre, plan, is_admin, farm_count)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    'free',
    FALSE,
    0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ==========================================
-- Storage bucket for photos
-- ==========================================

INSERT INTO storage.buckets (id, name, public) VALUES ('fotos', 'fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users upload photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'fotos' AND auth.role() = 'authenticated');

CREATE POLICY "Public read photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'fotos');

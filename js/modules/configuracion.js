// ============================================
// AgroFinca - Configuración Module
// Settings, Supabase semi-auto config,
// export/import, sync status
// ============================================

const ConfiguracionModule = (() => {

  async function render(container, fincaId) {
    const user = AuthModule.getUser();
    const syncStatus = await SyncEngine.getStatus();

    container.innerHTML = `
      <div class="page-header"><h2>⚙️ Configuración</h2></div>

      <!-- User info -->
      <div class="card">
        <div class="card-title">👤 Mi Cuenta</div>
        <div class="flex gap-1" style="align-items:center;">
          <div class="avatar" style="width:50px;height:50px;font-size:1.2rem;">${Format.initials(user?.nombre)}</div>
          <div>
            <div style="font-weight:600;">${user?.nombre || 'Usuario'}</div>
            <div class="text-sm text-muted">${user?.email || ''}</div>
            <div class="text-xs text-muted">ID: ${user?.id?.substring(0, 8) || ''}...</div>
          </div>
        </div>
      </div>

      <!-- Supabase Semi-Automatic Config -->
      <div class="card">
        <div class="card-title">☁️ Configuración de Nube (Supabase)</div>
        <p class="text-sm text-muted mb-1">Conecta tu finca a la nube para sincronizar datos entre dispositivos y hacer respaldos automáticos.</p>

        <!-- Setup wizard -->
        <div class="card" style="background:#E8F5E9;border:1px solid #C8E6C9;">
          <div class="card-title">🚀 Configuración Rápida (3 pasos)</div>
          <div class="text-sm mb-1">
            <details>
              <summary style="cursor:pointer;font-weight:600;color:var(--green-700);">📖 Paso 1: Crear tu proyecto en Supabase (gratis)</summary>
              <ol class="text-sm" style="padding-left:1.2rem;margin-top:0.5rem;line-height:1.8;">
                <li>Ve a <a href="https://supabase.com" target="_blank" rel="noopener" style="color:var(--green-700);font-weight:600;">supabase.com</a> y crea una cuenta gratis</li>
                <li>Haz clic en <b>"New project"</b></li>
                <li>Elige un nombre (ej: "agrofinca"), una contraseña segura y tu región más cercana</li>
                <li>Espera ~2 minutos a que se cree el proyecto</li>
              </ol>
            </details>
          </div>
          <div class="text-sm mb-1">
            <details>
              <summary style="cursor:pointer;font-weight:600;color:var(--green-700);">📖 Paso 2: Copiar las credenciales</summary>
              <ol class="text-sm" style="padding-left:1.2rem;margin-top:0.5rem;line-height:1.8;">
                <li>En Supabase, ve a <b>Settings → API</b> (menú lateral izquierdo)</li>
                <li>Copia la <b>URL</b> del proyecto (parece: <code>https://xxxxx.supabase.co</code>)</li>
                <li>Copia la <b>anon public key</b> (empieza con <code>eyJ...</code>)</li>
                <li>Pega ambos valores aquí abajo</li>
              </ol>
            </details>
          </div>
          <div class="text-sm mb-1">
            <details>
              <summary style="cursor:pointer;font-weight:600;color:var(--green-700);">📖 Paso 3: Crear las tablas (un clic)</summary>
              <ol class="text-sm" style="padding-left:1.2rem;margin-top:0.5rem;line-height:1.8;">
                <li>En Supabase, ve a <b>SQL Editor</b> (menú lateral izquierdo)</li>
                <li>Haz clic en <b>"New query"</b></li>
                <li>Copia el SQL de abajo (botón "Copiar SQL") y pégalo en el editor</li>
                <li>Haz clic en <b>"Run"</b> (o Ctrl+Enter)</li>
                <li>¡Listo! Tu base de datos en la nube está configurada</li>
              </ol>
            </details>
          </div>
        </div>

        <!-- Config inputs -->
        <div class="form-group">
          <label>URL de Supabase *</label>
          <input type="url" id="cfg-supa-url" value="${localStorage.getItem('agrofinca_supabase_url') || ''}" placeholder="https://xxxxx.supabase.co">
          <span class="form-hint">Lo encuentras en Settings → API → Project URL</span>
        </div>
        <div class="form-group">
          <label>Clave anónima (anon key) *</label>
          <input type="text" id="cfg-supa-key" value="${localStorage.getItem('agrofinca_supabase_key') || ''}" placeholder="eyJhbGciOiJ..." style="font-family:monospace;font-size:0.8rem;">
          <span class="form-hint">Lo encuentras en Settings → API → Project API keys → anon public</span>
        </div>
        <div class="flex gap-1">
          <button class="btn btn-primary btn-sm" id="btn-save-supabase">💾 Guardar y Conectar</button>
          <button class="btn btn-outline btn-sm" id="btn-test-supabase">🔍 Probar Conexión</button>
        </div>
        <div id="supabase-test-result" class="mt-1"></div>
        <div class="mt-1">
          <span class="text-sm">Estado actual: </span>
          <span class="badge ${syncStatus.online ? 'badge-green' : 'badge-red'}">${syncStatus.online ? 'En línea' : 'Sin conexión'}</span>
          <span class="badge ${syncStatus.configured ? 'badge-green' : 'badge-amber'}">${syncStatus.configured ? 'Configurado' : 'No configurado'}</span>
          ${syncStatus.lastSync ? `<span class="text-xs text-muted"> · Última sync: ${Format.timeAgo(syncStatus.lastSync)}</span>` : ''}
          ${syncStatus.pendingCount > 0 ? `<span class="badge badge-amber">${syncStatus.pendingCount} pendientes</span>` : ''}
        </div>
        <div class="flex gap-1 mt-1">
          <button class="btn btn-outline btn-sm" id="btn-force-sync">🔄 Forzar Sincronización</button>
        </div>
      </div>

      <!-- SQL Schema -->
      <div class="card">
        <div class="card-title">🗄️ Esquema SQL para Supabase</div>
        <p class="text-sm text-muted mb-1">Copia este SQL y ejecútalo en el <b>SQL Editor</b> de Supabase para crear todas las tablas.</p>
        <div class="flex gap-1 mb-1">
          <button class="btn btn-primary btn-sm" id="btn-copy-sql-quick">📋 Copiar SQL al portapapeles</button>
          <button class="btn btn-outline btn-sm" id="btn-show-sql">👁️ Ver SQL</button>
        </div>
        <div id="sql-content" style="display:none;" class="mt-1">
          <textarea id="sql-text" rows="12" style="width:100%;font-family:monospace;font-size:0.7rem;border:1px solid #ddd;padding:0.5rem;border-radius:4px;" readonly></textarea>
        </div>
      </div>

      <!-- Export/Import -->
      <div class="card">
        <div class="card-title">💾 Datos Locales</div>
        <p class="text-sm text-muted mb-1">Exporta o importa todos los datos como archivo JSON. Útil para respaldos manuales.</p>
        <div class="flex gap-1">
          <button class="btn btn-primary btn-sm" id="btn-export">📤 Exportar Datos</button>
          <button class="btn btn-outline btn-sm" id="btn-import">📥 Importar Datos</button>
          <input type="file" id="import-file" accept=".json" style="display:none;">
        </div>
      </div>

      <!-- Data stats -->
      <div class="card">
        <div class="card-title">📊 Estadísticas de Datos</div>
        <div id="data-stats">Cargando...</div>
      </div>

      <!-- About -->
      <div class="card">
        <div class="card-title">ℹ️ Acerca de AgroFinca</div>
        <p class="text-sm">Sistema de gestión agroforestal para plantaciones híbridas.</p>
        <p class="text-sm text-muted">Versión 1.1.0 · PWA Offline-First</p>
        <p class="text-sm text-muted">Funciona con y sin conexión a internet.</p>
        <p class="text-sm text-muted mt-1">Tecnologías: HTML/CSS/JS, IndexedDB, Supabase, Leaflet Maps</p>
      </div>

      <!-- Danger zone -->
      <div class="card" style="border:2px solid var(--red-500);">
        <div class="card-title text-red">⚠️ Zona de Peligro</div>
        <button class="btn btn-danger btn-sm" id="btn-clear-data">🗑 Borrar todos los datos locales</button>
      </div>
    `;

    loadStats();

    // Save Supabase config
    document.getElementById('btn-save-supabase').addEventListener('click', () => {
      const url = document.getElementById('cfg-supa-url').value.trim();
      const key = document.getElementById('cfg-supa-key').value.trim();
      if (!url || !key) { App.showToast('Completa la URL y la clave', 'warning'); return; }
      SupabaseClient.configure(url, key);
      App.showToast('Configuración guardada', 'success');
      App.refreshCurrentPage();
    });

    // Test connection
    document.getElementById('btn-test-supabase').addEventListener('click', async () => {
      const resultEl = document.getElementById('supabase-test-result');
      const url = document.getElementById('cfg-supa-url').value.trim();
      const key = document.getElementById('cfg-supa-key').value.trim();
      if (!url || !key) { resultEl.innerHTML = '<span class="badge badge-red">❌ Ingresa la URL y la clave primero</span>'; return; }
      resultEl.innerHTML = '<span class="badge badge-amber">⏳ Probando conexión...</span>';
      try {
        const response = await fetch(url + '/rest/v1/', { headers: { 'apikey': key, 'Authorization': 'Bearer ' + key } });
        if (response.ok) {
          resultEl.innerHTML = '<span class="badge badge-green">✅ Conexión exitosa</span>';
          SupabaseClient.configure(url, key);
        } else if (response.status === 401) {
          resultEl.innerHTML = '<span class="badge badge-red">❌ Clave inválida. Verifica tu anon key.</span>';
        } else {
          resultEl.innerHTML = '<span class="badge badge-amber">⚠️ Respuesta: ' + response.status + '</span>';
        }
      } catch (err) {
        resultEl.innerHTML = '<span class="badge badge-red">❌ No se pudo conectar. Verifica la URL.</span>';
      }
    });

    document.getElementById('btn-force-sync').addEventListener('click', async () => {
      App.showToast('Sincronizando...', 'info');
      await SyncEngine.forceSync();
      App.showToast('Sincronización completada', 'success');
      App.refreshCurrentPage();
    });

    document.getElementById('btn-export').addEventListener('click', async () => {
      const data = await AgroDB.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = 'agrofinca-backup-' + DateUtils.today() + '.json';
      a.click(); URL.revokeObjectURL(url);
      App.showToast('Datos exportados', 'success');
    });

    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (confirm('¿Importar datos? Esto reemplazará los datos actuales.')) {
          await AgroDB.importAll(data);
          App.showToast('Datos importados correctamente', 'success');
          await App.loadUserFincas(); App.refreshCurrentPage();
        }
      } catch (err) { App.showToast('Error al importar: ' + err.message, 'error'); }
    });

    document.getElementById('btn-show-sql').addEventListener('click', () => {
      const sqlDiv = document.getElementById('sql-content');
      sqlDiv.style.display = sqlDiv.style.display === 'none' ? 'block' : 'none';
      document.getElementById('sql-text').value = getSQLSchema();
    });

    document.getElementById('btn-copy-sql-quick').addEventListener('click', () => {
      const sql = getSQLSchema();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(sql).then(() => App.showToast('SQL copiado. Pégalo en Supabase SQL Editor.', 'success', 4000));
      } else {
        const ta = document.createElement('textarea'); ta.value = sql;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); App.showToast('SQL copiado', 'success');
      }
    });

    document.getElementById('btn-clear-data').addEventListener('click', async () => {
      if (confirm('⚠️ ¿Estás seguro? Esto eliminará TODOS los datos locales permanentemente.')) {
        if (confirm('Esta acción no se puede deshacer. ¿Continuar?')) {
          for (const store of AgroDB.STORES) { await AgroDB.clearStore(store); }
          localStorage.clear();
          App.showToast('Datos eliminados', 'success');
          location.reload();
        }
      }
    });
  }

  async function loadStats() {
    const statsEl = document.getElementById('data-stats');
    if (!statsEl) return;
    const stores = ['fincas','areas','cultivos_catalogo','ciclos_productivos','cosechas',
      'ventas','costos','colmenas','inspecciones_colmena','camas_lombricompost',
      'registros_lombricompost','tareas','inspecciones','aplicaciones_fitosanitarias',
      'lotes_animales','registros_animales'];
    let html = '<ul class="data-list">';
    for (const store of stores) {
      try {
        const count = await AgroDB.count(store);
        html += '<li class="data-list-item" style="padding:0.3rem 0;"><span class="text-sm">' +
          store.replace(/_/g,' ') + '</span><span class="badge badge-gray">' + count + '</span></li>';
      } catch(e) {}
    }
    html += '</ul>';
    statsEl.innerHTML = html;
  }

  function getSQLSchema() {
    return `-- AgroFinca - Supabase SQL Schema v1.1
-- Execute this in your Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE, nombre TEXT, rol TEXT DEFAULT 'propietario',
  avatar_iniciales TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
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

-- RLS
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

CREATE POLICY "Allow all for authenticated" ON fincas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON finca_miembros FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON areas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON cultivos_catalogo FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON ciclos_productivos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON cosechas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON ventas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON costos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON colmenas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON inspecciones_colmena FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON camas_lombricompost FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON registros_lombricompost FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON tareas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON inspecciones FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON fotos_inspeccion FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON aplicaciones_fitosanitarias FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON lotes_animales FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON registros_animales FOR ALL USING (auth.role() = 'authenticated');
`;
  }

  return { render };
})();

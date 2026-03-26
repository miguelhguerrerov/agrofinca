// ============================================
// AgroFinca - Ingeniero Productos Module
// Product catalog for agricultural engineers:
// pesticides, fertilizers, biocontrol agents
// CRUD, stock tracking, toxicity classification
// ============================================

const IngProductosModule = (() => {

  const TIPOS = [
    { value: 'fungicida', label: 'Fungicida', icon: '🍄' },
    { value: 'insecticida', label: 'Insecticida', icon: '🐛' },
    { value: 'herbicida', label: 'Herbicida', icon: '🌿' },
    { value: 'fertilizante', label: 'Fertilizante', icon: '🧪' },
    { value: 'biocontrolador', label: 'Biocontrolador', icon: '🦠' },
    { value: 'coadyuvante', label: 'Coadyuvante', icon: '💧' },
    { value: 'otro', label: 'Otro', icon: '📦' }
  ];

  const TOXICIDAD_MAP = {
    'I':   { label: 'I - Extremadamente toxico', color: 'var(--danger, #e53935)', bg: '#fdecea' },
    'II':  { label: 'II - Altamente toxico', color: '#f9a825', bg: '#fff8e1' },
    'III': { label: 'III - Moderadamente toxico', color: 'var(--primary, #1976d2)', bg: '#e3f2fd' },
    'IV':  { label: 'IV - Ligeramente toxico', color: 'var(--success, #43a047)', bg: '#e8f5e9' }
  };

  const UNIDADES_VENTA = ['litro', 'kg', 'sobre', 'galon', 'saco', 'unidad'];

  let _filterTipo = '';

  // ── Render entry point ──────────────────────
  async function render(container) {
    const userId = AuthModule.getUserId();

    const productos = await AgroDB.query('productos_ingeniero', r => r.ingeniero_id === userId);
    const sorted = [...productos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    // Summary
    const totalProductos = productos.length;
    const stockValue = productos.reduce((s, p) => s + ((p.precio || 0) * (p.stock || 0)), 0);

    // Filter
    const filtered = _filterTipo
      ? sorted.filter(p => p.tipo === _filterTipo)
      : sorted;

    container.innerHTML = `
      <div class="page-header">
        <h2>🧪 Productos del Ingeniero</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-producto">+ Nuevo producto</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="s-icon blue">📦</div>
          <div class="s-data">
            <div class="s-value">${totalProductos}</div>
            <div class="s-label">Total productos</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="s-icon green">💰</div>
          <div class="s-data">
            <div class="s-value">${Format.money(stockValue)}</div>
            <div class="s-label">Valor en stock</div>
          </div>
        </div>
      </div>

      <!-- Filter by tipo -->
      <div class="card">
        <div class="card-header">
          <h3>Catalogo de productos</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="productos-filter-tipo" class="input-sm" style="width:150px;">
              <option value="">Todos los tipos</option>
              ${TIPOS.map(t => `<option value="${t.value}" ${_filterTipo === t.value ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
            </select>
            <input type="text" id="productos-search" placeholder="Buscar..." class="input-sm" style="width:140px;">
          </div>
        </div>

        ${filtered.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🧪</div><h3>Sin productos registrados</h3><p>Agrega tu primer producto para comenzar</p></div>'
          : `<ul class="data-list" id="productos-list">
              ${filtered.map(p => {
                const tipoInfo = TIPOS.find(t => t.value === p.tipo) || TIPOS[TIPOS.length - 1];
                const toxInfo = TOXICIDAD_MAP[p.toxicidad] || null;
                return `
                  <li class="data-list-item" data-search="${(p.nombre || '').toLowerCase()} ${(p.ingrediente_activo || '').toLowerCase()}">
                    <div class="data-list-left">
                      <div class="data-list-title">${p.nombre || 'Sin nombre'}</div>
                      <div class="data-list-sub">
                        <span class="badge" style="background:var(--gray-100);color:var(--gray-700);">${tipoInfo.icon} ${tipoInfo.label}</span>
                        ${p.ingrediente_activo ? ` &middot; ${p.ingrediente_activo}` : ''}
                        ${toxInfo ? ` &middot; <span style="color:${toxInfo.color};font-weight:600;">${toxInfo.label}</span>` : ''}
                      </div>
                    </div>
                    <div class="data-list-right">
                      <div class="data-list-value">${Format.money(p.precio || 0)}</div>
                      <div class="text-xs text-muted">Stock: ${p.stock || 0} ${p.unidad_venta || ''}</div>
                      <div class="data-list-actions">
                        <button class="btn btn-sm btn-outline btn-edit-producto" data-id="${p.id}">✏️</button>
                        <button class="btn btn-sm btn-danger btn-del-producto" data-id="${p.id}">🗑</button>
                      </div>
                    </div>
                  </li>
                `;
              }).join('')}
            </ul>`
        }
      </div>
    `;

    // Filter events
    document.getElementById('productos-filter-tipo')?.addEventListener('change', (e) => {
      _filterTipo = e.target.value;
      render(container);
    });

    document.getElementById('productos-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#productos-list .data-list-item').forEach(li => {
        li.style.display = li.dataset.search.includes(q) ? '' : 'none';
      });
    });

    // New producto
    document.getElementById('btn-new-producto')?.addEventListener('click', () => showProductoForm(container));

    // Edit
    container.querySelectorAll('.btn-edit-producto').forEach(btn => {
      btn.addEventListener('click', async () => {
        const p = await AgroDB.getById('productos_ingeniero', btn.dataset.id);
        showProductoForm(container, p);
      });
    });

    // Delete
    container.querySelectorAll('.btn-del-producto').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar este producto?')) {
          await AgroDB.remove('productos_ingeniero', btn.dataset.id);
          App.showToast('Producto eliminado', 'success');
          render(container);
        }
      });
    });
  }

  // ── Product Form (modal CRUD) ──────────────
  async function showProductoForm(container, producto = null) {
    const isEdit = !!producto;
    const userId = AuthModule.getUserId();

    const body = `
      <div class="form-group">
        <label>Nombre comercial *</label>
        <input type="text" id="prod-nombre" value="${producto?.nombre || ''}" placeholder="Ej: Mancozeb 80 WP" autofocus>
      </div>
      <div class="form-group">
        <label>Ingrediente activo</label>
        <input type="text" id="prod-ingrediente" value="${producto?.ingrediente_activo || ''}" placeholder="Ej: Mancozeb">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo *</label>
          <select id="prod-tipo">
            ${TIPOS.map(t => `<option value="${t.value}" ${producto?.tipo === t.value ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Toxicidad</label>
          <select id="prod-toxicidad">
            <option value="">Sin clasificar</option>
            <option value="I" ${producto?.toxicidad === 'I' ? 'selected' : ''}>I - Extremadamente toxico</option>
            <option value="II" ${producto?.toxicidad === 'II' ? 'selected' : ''}>II - Altamente toxico</option>
            <option value="III" ${producto?.toxicidad === 'III' ? 'selected' : ''}>III - Moderadamente toxico</option>
            <option value="IV" ${producto?.toxicidad === 'IV' ? 'selected' : ''}>IV - Ligeramente toxico</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Registro sanitario</label>
        <input type="text" id="prod-registro" value="${producto?.registro_sanitario || ''}" placeholder="Numero de registro">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Dosis recomendada</label>
          <input type="text" id="prod-dosis" value="${producto?.dosis_recomendada || ''}" placeholder="Ej: 2-3 cc/L, 50 g/20L">
        </div>
        <div class="form-group">
          <label>Carencia (dias)</label>
          <input type="number" id="prod-carencia" value="${producto?.carencia_dias || ''}" placeholder="0" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Precio ($)</label>
          <input type="number" id="prod-precio" step="0.01" value="${producto?.precio || ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Unidad de venta</label>
          <select id="prod-unidad">
            ${UNIDADES_VENTA.map(u => `<option value="${u}" ${producto?.unidad_venta === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Stock</label>
        <input type="number" id="prod-stock" step="0.1" value="${producto?.stock || ''}" placeholder="0" min="0">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="prod-notas" placeholder="Observaciones, precauciones, compatibilidades...">${producto?.notas || ''}</textarea>
      </div>
    `;

    App.showModal(
      isEdit ? 'Editar Producto' : 'Nuevo Producto',
      body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="btn-save-producto">Guardar</button>`
    );

    document.getElementById('btn-save-producto').addEventListener('click', async () => {
      const nombre = document.getElementById('prod-nombre').value.trim();
      if (!nombre) { App.showToast('El nombre comercial es obligatorio', 'warning'); return; }

      const data = {
        ingeniero_id: userId,
        nombre,
        ingrediente_activo: document.getElementById('prod-ingrediente').value.trim() || null,
        tipo: document.getElementById('prod-tipo').value,
        registro_sanitario: document.getElementById('prod-registro').value.trim() || null,
        dosis_recomendada: document.getElementById('prod-dosis').value.trim() || null,
        carencia_dias: parseInt(document.getElementById('prod-carencia').value) || null,
        precio: parseFloat(document.getElementById('prod-precio').value) || 0,
        unidad_venta: document.getElementById('prod-unidad').value,
        stock: parseFloat(document.getElementById('prod-stock').value) || 0,
        toxicidad: document.getElementById('prod-toxicidad').value || null,
        notas: document.getElementById('prod-notas').value.trim() || '',
        actualizado: DateUtils.today()
      };

      if (isEdit) {
        await AgroDB.update('productos_ingeniero', producto.id, data);
      } else {
        await AgroDB.add('productos_ingeniero', data);
      }

      App.closeModal();
      App.showToast(isEdit ? 'Producto actualizado' : 'Producto creado', 'success');
      render(container);
    });
  }

  return { render };
})();

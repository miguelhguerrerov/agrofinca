const SyncDiagnosticsModule = (() => {

  async function render(container) {
    const status = SyncEngine.getStatus();
    const pendingCount = await AgroDB.getPendingSyncCount();
    const failedItems = await SyncEngine.getFailedItems();
    const conflicts = await SyncEngine.getConflicts();
    const log = await SyncEngine.getSyncLog(50);

    container.innerHTML = `
      <div class="page-header">
        <h2>🔧 Diagnóstico de Sincronización</h2>
      </div>

      <!-- Summary Cards -->
      <div class="stats-grid" style="margin-bottom:1.5rem;">
        <div class="stat-card">
          <div class="stat-value" style="color:${status.online ? 'var(--green-600)' : 'var(--red-600)'}">
            ${status.online ? '🟢 En línea' : '🔴 Sin conexión'}
          </div>
          <div class="stat-label">Estado</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${pendingCount}</div>
          <div class="stat-label">Pendientes</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${failedItems.length > 0 ? 'var(--red-600)' : 'inherit'}">${failedItems.length}</div>
          <div class="stat-label">Fallidos</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${conflicts.length > 0 ? 'var(--amber-600)' : 'inherit'}">${conflicts.length}</div>
          <div class="stat-label">Conflictos</div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex;gap:0.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="btn-force-sync">🔄 Forzar Sincronización</button>
        ${failedItems.length > 0 ? '<button class="btn btn-outline btn-sm" id="btn-retry-all">♻️ Reintentar Todos los Fallidos</button>' : ''}
        <button class="btn btn-outline btn-sm" id="btn-export-log">📥 Exportar Log</button>
      </div>

      <div class="text-sm text-muted" style="margin-bottom:1.5rem;">
        Última sincronización: ${status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Nunca'}
      </div>

      <!-- Failed Items Section -->
      ${failedItems.length > 0 ? `
        <h3 style="color:var(--red-600);margin-bottom:0.75rem;">🛑 Items Fallidos (${failedItems.length})</h3>
        <div class="sync-diag-table-wrapper" style="overflow-x:auto;margin-bottom:1.5rem;">
          <table class="sync-diag-table">
            <thead>
              <tr>
                <th>Tabla</th>
                <th>ID</th>
                <th>Error</th>
                <th>Intentos</th>
                <th>Tipo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${failedItems.map(item => `
                <tr>
                  <td><strong>${item.store_name}</strong></td>
                  <td class="text-sm text-muted">${(item.record_id || '').substring(0, 8)}...</td>
                  <td class="error-text">${item.retryState.lastError || 'Desconocido'}</td>
                  <td>${item.retryState.count || 0}</td>
                  <td><span class="badge ${item.retryState.permanent ? 'badge-red' : 'badge-amber'}">${item.retryState.permanent ? 'Permanente' : 'Transitorio'}</span></td>
                  <td>
                    <button class="btn btn-sm btn-outline btn-retry-item" data-id="${item.id}">♻️</button>
                    <button class="btn btn-sm btn-outline btn-dismiss-item" data-id="${item.id}" style="color:var(--red-500);">✕</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Conflicts Section -->
      ${conflicts.length > 0 ? `
        <h3 style="color:var(--amber-600);margin-bottom:0.75rem;">⚡ Conflictos (${conflicts.length})</h3>
        <div style="margin-bottom:1.5rem;">
          ${conflicts.map(c => `
            <div class="card" style="border-left:3px solid var(--amber-500);margin-bottom:0.5rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <strong>${c.table_name}</strong> · <span class="text-sm text-muted">${(c.record_id || '').substring(0, 8)}...</span>
                  <div class="text-sm text-muted">${new Date(c.created_at).toLocaleString()}</div>
                </div>
                <div style="display:flex;gap:0.25rem;">
                  <button class="btn btn-sm btn-outline btn-view-conflict" data-id="${c.id}">👁️ Ver</button>
                  <button class="btn btn-sm btn-primary btn-resolve-local" data-id="${c.id}">📱 Local</button>
                  <button class="btn btn-sm btn-outline btn-resolve-remote" data-id="${c.id}">☁️ Remoto</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Sync Log Section -->
      <h3 style="margin-bottom:0.75rem;">📋 Log de Sincronización</h3>
      ${log.length === 0 ? '<p class="text-sm text-muted">Sin eventos registrados.</p>' : `
        <div class="sync-diag-table-wrapper" style="overflow-x:auto;max-height:400px;overflow-y:auto;">
          <table class="sync-diag-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Tipo</th>
                <th>Tabla</th>
                <th>Resultado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              ${log.map(entry => {
                const time = new Date(entry.timestamp).toLocaleTimeString();
                const typeIcon = entry.type === 'push' ? '⬆️' : entry.type === 'pull' ? '⬇️' : '🔄';
                const resultColor = entry.result === 'ok' ? 'var(--green-600)' : entry.result === 'error' ? 'var(--red-600)' : 'var(--amber-600)';
                return `
                  <tr>
                    <td class="text-sm">${time}</td>
                    <td>${typeIcon} ${entry.type || ''}</td>
                    <td class="text-sm">${entry.table || '-'}</td>
                    <td><span style="color:${resultColor}">${entry.result || ''}</span></td>
                    <td class="text-sm text-muted">${entry.error || (entry.duration_ms ? entry.duration_ms + 'ms' : '')}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    // Bind event handlers
    document.getElementById('btn-force-sync')?.addEventListener('click', async () => {
      App.showToast('Forzando sincronización...', 'info');
      await SyncEngine.forceSync();
      render(container);
    });

    document.getElementById('btn-retry-all')?.addEventListener('click', async () => {
      await SyncEngine.retryAllFailed();
      App.showToast('Reintentando items fallidos...', 'info');
      render(container);
    });

    document.getElementById('btn-export-log')?.addEventListener('click', async () => {
      const fullLog = await SyncEngine.getSyncLog(200);
      const blob = new Blob([JSON.stringify({ log: fullLog, status, failedItems, conflicts, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `sync-log-${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      App.showToast('Log exportado', 'success');
    });

    // Retry individual items
    container.querySelectorAll('.btn-retry-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        await SyncEngine.retryItem(parseInt(btn.dataset.id));
        render(container);
      });
    });

    // Dismiss individual items
    container.querySelectorAll('.btn-dismiss-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Descartar este item? Se perderá la sincronización de este registro.')) {
          await SyncEngine.dismissItem(parseInt(btn.dataset.id));
          render(container);
        }
      });
    });

    // View conflict details
    container.querySelectorAll('.btn-view-conflict').forEach(btn => {
      btn.addEventListener('click', () => {
        const conflict = conflicts.find(c => c.id === btn.dataset.id);
        if (!conflict) return;
        showConflictModal(conflict);
      });
    });

    // Resolve conflict: local
    container.querySelectorAll('.btn-resolve-local').forEach(btn => {
      btn.addEventListener('click', async () => {
        await SyncEngine.resolveConflict(btn.dataset.id, 'local');
        App.showToast('Conflicto resuelto: se mantuvo versión local', 'success');
        render(container);
      });
    });

    // Resolve conflict: remote
    container.querySelectorAll('.btn-resolve-remote').forEach(btn => {
      btn.addEventListener('click', async () => {
        await SyncEngine.resolveConflict(btn.dataset.id, 'remote');
        App.showToast('Conflicto resuelto: se aplicó versión del servidor', 'success');
        render(container);
      });
    });
  }

  function showConflictModal(conflict) {
    const localStr = JSON.stringify(conflict.local_data, null, 2);
    const remoteStr = JSON.stringify(conflict.remote_data, null, 2);

    App.showModal(`
      <div class="modal-header">
        <h3>⚡ Conflicto: ${conflict.table_name}</h3>
      </div>
      <div class="modal-body">
        <p class="text-sm text-muted">ID: ${conflict.record_id} · ${new Date(conflict.created_at).toLocaleString()}</p>
        <div class="conflict-diff">
          <div class="conflict-local">
            <h4 style="margin:0 0 0.5rem 0;">📱 Versión Local</h4>
            <pre style="font-size:0.75rem;overflow:auto;max-height:300px;">${localStr}</pre>
          </div>
          <div class="conflict-remote">
            <h4 style="margin:0 0 0.5rem 0;">☁️ Versión Remota</h4>
            <pre style="font-size:0.75rem;overflow:auto;max-height:300px;">${remoteStr}</pre>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="(async()=>{await SyncEngine.resolveConflict('${conflict.id}','local');App.showToast('Versión local mantenida','success');App.closeModal();App.refreshCurrentPage();})()">📱 Usar Local</button>
        <button class="btn btn-outline" onclick="(async()=>{await SyncEngine.resolveConflict('${conflict.id}','remote');App.showToast('Versión remota aplicada','success');App.closeModal();App.refreshCurrentPage();})()">☁️ Usar Remoto</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cerrar</button>
      </div>
    `);
  }

  return { render };
})();

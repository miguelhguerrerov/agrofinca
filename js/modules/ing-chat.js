// ============================================
// AgroFinca - Ingeniero Chat Module
// Human-to-human messaging system
// Directas + grupos, Realtime via Supabase
// Offline support with IndexedDB + sync engine
// ============================================

const IngChatModule = (() => {
  let conversations = [];
  let activeConversationId = null;
  let chatMessages = [];
  let currentSubscription = null;
  let unreadCounts = {};
  let contactProfiles = {};

  // ── Render entry point ──────────────────────
  async function render(container) {
    const userId = AuthModule.getUserId();
    if (!userId) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔒</div>
          <h3>Inicia sesión</h3>
          <p>Debes iniciar sesión para usar el chat.</p>
        </div>`;
      return;
    }

    await loadContactProfiles();
    await loadConversations();
    await computeUnreadCounts();

    container.innerHTML = `
      <div class="ia-app">
        <!-- Sidebar: conversation list -->
        <div class="ia-sidebar" id="chat-sidebar">
          <div class="ia-sidebar-header">
            <h3>💬 Mensajes</h3>
            <div style="display:flex;gap:4px;">
              <button class="ia-btn-icon" id="chat-new-conv" title="Nueva conversación">
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
              ${AuthModule.isIngeniero() ? `
              <button class="ia-btn-icon" id="chat-new-group" title="Nuevo grupo">
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </button>` : ''}
            </div>
          </div>
          <div class="ia-conv-list" id="chat-conv-list">
            ${renderConversationList()}
          </div>
        </div>

        <!-- Main chat area -->
        <div class="ia-main">
          <!-- Chat header -->
          <div class="ia-chat-header" id="chat-header">
            <button class="ia-btn-icon ia-toggle-sidebar" id="chat-toggle-sidebar" title="Ver chats">
              <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M3 6h18M3 12h18M3 18h18"/>
              </svg>
            </button>
            <div class="ia-chat-title" id="chat-title">
              ${activeConversationId ? getConversationTitle(getActiveConversation()) : 'Selecciona una conversación'}
            </div>
            <div class="ia-chat-actions" id="chat-actions"></div>
          </div>

          <!-- Messages -->
          <div class="ia-messages" id="chat-messages">
            ${activeConversationId ? renderMessages() : renderEmptyState()}
          </div>

          <!-- Input area -->
          <div class="ia-input" id="chat-input" ${!activeConversationId ? 'style="display:none"' : ''}>
            <div class="ia-input-row">
              <button class="ia-btn-icon" id="chat-btn-photo" title="Enviar foto">📷</button>
              <div class="ia-textarea-wrap">
                <textarea id="chat-message-input" placeholder="Escribe un mensaje..." rows="1"></textarea>
              </div>
              <button class="ia-btn-send" id="chat-btn-send" title="Enviar">
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Hidden file input -->
          <input type="file" id="chat-photo-input" accept="image/*" capture="environment" style="display:none;">
        </div>
      </div>`;

    initEvents();
    if (activeConversationId) {
      await subscribeToConversation(activeConversationId);
      scrollToBottom();
    }
  }

  // ── Load contact profiles ─────────────────
  async function loadContactProfiles() {
    const userId = AuthModule.getUserId();
    try {
      if (AuthModule.isIngeniero()) {
        const afiliaciones = await AgroDB.query('ingeniero_agricultores',
          r => r.ingeniero_id === userId && r.estado === 'activo'
        );
        for (const af of afiliaciones) {
          const profile = await AgroDB.getById('user_profiles', af.agricultor_id);
          if (profile) contactProfiles[af.agricultor_id] = profile;
        }
      } else {
        const afiliaciones = await AgroDB.query('ingeniero_agricultores',
          r => r.agricultor_id === userId && r.estado === 'activo'
        );
        for (const af of afiliaciones) {
          const profile = await AgroDB.getById('user_profiles', af.ingeniero_id);
          if (profile) contactProfiles[af.ingeniero_id] = profile;
        }
      }
    } catch (e) {
      console.warn('Error loading contact profiles:', e);
    }
  }

  // ── Conversations CRUD ──────────────────────
  async function loadConversations() {
    const userId = AuthModule.getUserId();
    try {
      // Direct conversations
      const directas = await AgroDB.query('chat_conversaciones', r =>
        (r.participante_1 === userId || r.participante_2 === userId)
      );

      // Group conversations
      const miembros = await AgroDB.query('chat_grupo_miembros', r => r.usuario_id === userId);
      const grupoIds = miembros.map(m => m.grupo_id);
      let grupales = [];
      if (grupoIds.length > 0) {
        grupales = await AgroDB.query('chat_conversaciones', r =>
          r.tipo === 'grupo' && grupoIds.includes(r.grupo_id)
        );
      }

      // Merge and deduplicate
      const allConvs = [...directas, ...grupales];
      const seen = new Set();
      conversations = [];
      for (const c of allConvs) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          conversations.push(c);
        }
      }

      // Sort by last message
      conversations.sort((a, b) =>
        new Date(b.ultimo_mensaje_at || b.created_at) - new Date(a.ultimo_mensaje_at || a.created_at)
      );

      // Auto-select most recent
      if (!activeConversationId && conversations.length > 0) {
        activeConversationId = conversations[0].id;
        await loadMessages(activeConversationId);
      }
    } catch (e) {
      console.warn('Error loading conversations:', e);
      conversations = [];
    }
  }

  async function computeUnreadCounts() {
    const userId = AuthModule.getUserId();
    unreadCounts = {};
    for (const conv of conversations) {
      try {
        const msgs = await AgroDB.query('chat_mensajes', r =>
          r.conversacion_id === conv.id && r.emisor_id !== userId && !r.leido
        );
        if (msgs.length > 0) {
          unreadCounts[conv.id] = msgs.length;
        }
      } catch { /* ignore */ }
    }
  }

  async function loadMessages(convId) {
    try {
      const all = await AgroDB.query('chat_mensajes', r => r.conversacion_id === convId);
      chatMessages = all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } catch {
      chatMessages = [];
    }
  }

  // ── Select conversation ───────────────────
  async function selectConversation(convId) {
    // Unsubscribe previous
    if (currentSubscription) {
      SupabaseClient.unsubscribeChat(currentSubscription);
      currentSubscription = null;
    }

    activeConversationId = convId;
    await loadMessages(convId);
    await markMessagesAsRead(convId);
    await subscribeToConversation(convId);
    refreshUI();
    document.getElementById('chat-sidebar')?.classList.remove('open');
  }

  async function subscribeToConversation(convId) {
    currentSubscription = convId;
    SupabaseClient.subscribeToChat(convId, onNewMessage);
  }

  // ── Realtime callback ─────────────────────
  function onNewMessage(event, record) {
    if (!record) return;
    const userId = AuthModule.getUserId();

    if (record.conversacion_id === activeConversationId) {
      // Active conversation: append and mark as read
      if (record.emisor_id !== userId) {
        chatMessages.push(record);
        appendMessageToDOM(record);
        markMessagesAsRead(activeConversationId);
        scrollToBottom();
      }
    } else {
      // Different conversation: update unread badge
      unreadCounts[record.conversacion_id] = (unreadCounts[record.conversacion_id] || 0) + 1;
      updateConvList();
      playNotificationSound();
    }
  }

  async function markMessagesAsRead(convId) {
    const userId = AuthModule.getUserId();
    try {
      const unread = await AgroDB.query('chat_mensajes', r =>
        r.conversacion_id === convId && r.emisor_id !== userId && !r.leido
      );
      for (const msg of unread) {
        await AgroDB.update('chat_mensajes', msg.id, { leido: true });
      }
      delete unreadCounts[convId];
      updateConvList();
    } catch { /* ignore */ }
  }

  // ── Send message ──────────────────────────
  async function sendMessage() {
    const input = document.getElementById('chat-message-input');
    const text = input?.value.trim();
    if (!text || !activeConversationId) return;

    // Clear input
    if (input) { input.value = ''; input.style.height = 'auto'; }

    const userId = AuthModule.getUserId();
    const now = new Date().toISOString();

    const msg = {
      id: AgroDB.uuid(),
      conversacion_id: activeConversationId,
      emisor_id: userId,
      tipo: 'texto',
      contenido: text,
      leido: false,
      created_at: now
    };

    // Optimistic UI
    chatMessages.push(msg);
    appendMessageToDOM(msg);
    scrollToBottom();

    // Save to IndexedDB (sync engine pushes to Supabase → triggers Realtime)
    try {
      await AgroDB.add('chat_mensajes', msg);
    } catch (e) {
      console.warn('Error saving message:', e);
    }

    // Update conversation metadata
    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv) {
      conv.ultimo_mensaje = text.substring(0, 100);
      conv.ultimo_mensaje_at = now;
      try {
        await AgroDB.update('chat_conversaciones', conv.id, {
          ultimo_mensaje: conv.ultimo_mensaje,
          ultimo_mensaje_at: conv.ultimo_mensaje_at
        });
      } catch { /* ignore */ }
      // Re-sort conversations
      conversations.sort((a, b) =>
        new Date(b.ultimo_mensaje_at || b.created_at) - new Date(a.ultimo_mensaje_at || a.created_at)
      );
      updateConvList();
    }
  }

  async function sendPhoto() {
    const fileInput = document.getElementById('chat-photo-input');
    fileInput?.click();
  }

  async function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId) return;
    e.target.value = '';

    try {
      const compressed = await PhotoUtils.compressImage(file);
      const userId = AuthModule.getUserId();
      const now = new Date().toISOString();

      const msg = {
        id: AgroDB.uuid(),
        conversacion_id: activeConversationId,
        emisor_id: userId,
        tipo: 'foto',
        contenido: compressed.base64,
        leido: false,
        created_at: now
      };

      chatMessages.push(msg);
      appendMessageToDOM(msg);
      scrollToBottom();

      await AgroDB.add('chat_mensajes', msg);

      const conv = conversations.find(c => c.id === activeConversationId);
      if (conv) {
        conv.ultimo_mensaje = '📷 Foto';
        conv.ultimo_mensaje_at = now;
        await AgroDB.update('chat_conversaciones', conv.id, {
          ultimo_mensaje: conv.ultimo_mensaje,
          ultimo_mensaje_at: conv.ultimo_mensaje_at
        });
        conversations.sort((a, b) =>
          new Date(b.ultimo_mensaje_at || b.created_at) - new Date(a.ultimo_mensaje_at || a.created_at)
        );
        updateConvList();
      }
    } catch {
      App.showToast('Error al enviar foto', 'error');
    }
  }

  // ── New conversation ──────────────────────
  function showNewConversation() {
    const userId = AuthModule.getUserId();
    const contacts = Object.entries(contactProfiles);

    if (contacts.length === 0) {
      App.showToast('No tienes contactos afiliados', 'warning');
      return;
    }

    const contactListHTML = contacts.map(([id, profile]) => `
      <div class="chat-contact-item" data-user-id="${id}" style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;cursor:pointer;border:1px solid var(--gray-200);margin-bottom:6px;">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
          ${AuthModule.isIngeniero() ? '👨‍🌾' : '👨‍💼'}
        </div>
        <div>
          <div style="font-weight:600;">${escapeHtml(profile.nombre_completo || profile.email || 'Usuario')}</div>
          <div style="font-size:0.85rem;color:var(--gray-500);">${AuthModule.isIngeniero() ? 'Agricultor' : 'Ingeniero'}</div>
        </div>
      </div>
    `).join('');

    const body = `
      <div style="max-height:400px;overflow-y:auto;">
        <p style="margin-bottom:12px;color:var(--gray-600);">Selecciona un contacto para iniciar una conversación:</p>
        <div id="chat-contact-list">${contactListHTML}</div>
      </div>
    `;

    App.showModal('Nueva Conversación', body,
      '<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>');

    // Bind contact clicks
    setTimeout(() => {
      document.querySelectorAll('.chat-contact-item').forEach(item => {
        item.addEventListener('click', async () => {
          const targetId = item.dataset.userId;
          await createDirectConversation(targetId);
          App.closeModal();
        });
      });
    }, 100);
  }

  async function createDirectConversation(targetUserId) {
    const userId = AuthModule.getUserId();

    // Check if conversation already exists
    const existing = conversations.find(c =>
      c.tipo !== 'grupo' && (
        (c.participante_1 === userId && c.participante_2 === targetUserId) ||
        (c.participante_1 === targetUserId && c.participante_2 === userId)
      )
    );

    if (existing) {
      await selectConversation(existing.id);
      return;
    }

    const now = new Date().toISOString();
    const conv = {
      id: AgroDB.uuid(),
      tipo: 'directa',
      participante_1: userId,
      participante_2: targetUserId,
      ultimo_mensaje: null,
      ultimo_mensaje_at: now,
      created_at: now
    };

    try {
      await AgroDB.add('chat_conversaciones', conv);
    } catch (e) {
      console.warn('Error creating conversation:', e);
    }

    conversations.unshift(conv);
    activeConversationId = conv.id;
    chatMessages = [];
    refreshUI();
  }

  // ── New group (ingeniero only) ────────────
  function showNewGroup() {
    if (!AuthModule.isIngeniero()) return;

    const contacts = Object.entries(contactProfiles);
    const checkboxList = contacts.map(([id, profile]) => `
      <label class="chat-group-member" style="display:flex;align-items:center;gap:10px;padding:8px;cursor:pointer;">
        <input type="checkbox" value="${id}" class="chat-group-check">
        <span>${escapeHtml(profile.nombre_completo || profile.email || 'Usuario')}</span>
      </label>
    `).join('');

    const body = `
      <div class="form-group">
        <label>Nombre del grupo</label>
        <input class="form-input" type="text" id="chat-group-name" placeholder="Ej: Zona Norte, Cultivo Cacao..." required>
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select class="form-input" id="chat-group-tipo">
          <option value="zona">Por zona</option>
          <option value="cultivo">Por cultivo</option>
          <option value="general">General</option>
        </select>
      </div>
      <div class="form-group">
        <label>Miembros</label>
        <div style="max-height:250px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:8px;padding:8px;">
          ${checkboxList || '<p style="color:var(--gray-500);">No hay contactos disponibles</p>'}
        </div>
      </div>
    `;

    App.showModal('Nuevo Grupo', body,
      `<button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="chat-save-group">Crear Grupo</button>`);

    setTimeout(() => {
      document.getElementById('chat-save-group')?.addEventListener('click', handleSaveGroup);
    }, 100);
  }

  async function handleSaveGroup() {
    const nombre = document.getElementById('chat-group-name')?.value.trim();
    const tipo = document.getElementById('chat-group-tipo')?.value || 'general';

    if (!nombre) {
      App.showToast('Ingresa un nombre para el grupo', 'warning');
      return;
    }

    const checkboxes = document.querySelectorAll('.chat-group-check:checked');
    const memberIds = Array.from(checkboxes).map(cb => cb.value);

    if (memberIds.length === 0) {
      App.showToast('Selecciona al menos un miembro', 'warning');
      return;
    }

    const userId = AuthModule.getUserId();
    const now = new Date().toISOString();

    // Create grupo
    const grupo = {
      id: AgroDB.uuid(),
      nombre: nombre,
      tipo: tipo,
      creado_por: userId,
      created_at: now
    };

    try {
      await AgroDB.add('chat_grupos', grupo);
    } catch (e) {
      console.warn('Error creating group:', e);
    }

    // Add members (including the creator)
    const allMembers = [userId, ...memberIds];
    for (const memberId of allMembers) {
      try {
        await AgroDB.add('chat_grupo_miembros', {
          id: AgroDB.uuid(),
          grupo_id: grupo.id,
          usuario_id: memberId,
          rol: memberId === userId ? 'admin' : 'miembro',
          created_at: now
        });
      } catch { /* ignore */ }
    }

    // Create conversacion for the group
    const conv = {
      id: AgroDB.uuid(),
      tipo: 'grupo',
      grupo_id: grupo.id,
      participante_1: null,
      participante_2: null,
      ultimo_mensaje: null,
      ultimo_mensaje_at: now,
      created_at: now
    };

    try {
      await AgroDB.add('chat_conversaciones', conv);
    } catch (e) {
      console.warn('Error creating group conversation:', e);
    }

    conversations.unshift(conv);
    activeConversationId = conv.id;
    chatMessages = [];

    App.closeModal();
    App.showToast('Grupo creado', 'success');
    refreshUI();
  }

  // ── Rendering ─────────────────────────────
  function renderConversationList() {
    if (conversations.length === 0) {
      return `<div class="ia-conv-empty">Sin conversaciones.<br>Inicia una nueva con el botón +</div>`;
    }
    return conversations.map(c => {
      const title = getConversationTitle(c);
      const unread = unreadCounts[c.id] || 0;
      const isGroup = c.tipo === 'grupo';
      const icon = isGroup ? '👥' : '👤';
      const lastMsg = c.ultimo_mensaje || '';
      const timeStr = timeAgo(c.ultimo_mensaje_at || c.created_at);

      return `
        <div class="ia-conv-item ${c.id === activeConversationId ? 'active' : ''}" data-conv-id="${c.id}">
          <div class="ia-conv-icon">${icon}</div>
          <div class="ia-conv-info">
            <div class="ia-conv-title">${escapeHtml(title)}</div>
            <div class="ia-conv-meta">${escapeHtml(lastMsg.substring(0, 40))} · ${timeStr}</div>
          </div>
          ${unread > 0 ? `<span class="chat-unread-badge">${unread}</span>` : ''}
        </div>`;
    }).join('');
  }

  function getConversationTitle(conv) {
    if (!conv) return 'Chat';
    if (conv.tipo === 'grupo') {
      // Look up group name
      return conv._groupName || 'Grupo';
    }
    // Direct: show the other person's name
    const userId = AuthModule.getUserId();
    const otherId = conv.participante_1 === userId ? conv.participante_2 : conv.participante_1;
    const profile = contactProfiles[otherId];
    return profile?.nombre_completo || profile?.email || 'Contacto';
  }

  function renderMessages() {
    if (chatMessages.length === 0) {
      return renderWelcome();
    }
    return chatMessages.map(msg => buildMessageHTML(msg)).join('');
  }

  function renderWelcome() {
    const conv = getActiveConversation();
    const title = conv ? getConversationTitle(conv) : 'Chat';
    return `
      <div class="ia-welcome-v2">
        <div class="ia-welcome-icon">💬</div>
        <h3>${escapeHtml(title)}</h3>
        <p>Inicio de la conversación. Envía un mensaje para comenzar.</p>
      </div>`;
  }

  function renderEmptyState() {
    return `
      <div class="ia-welcome-v2">
        <div class="ia-welcome-icon">💬</div>
        <h3>Mensajería</h3>
        <p>Selecciona una conversación o inicia una nueva para comunicarte con tus contactos.</p>
        <button class="btn btn-primary" id="chat-empty-new">+ Nueva Conversación</button>
      </div>`;
  }

  function buildMessageHTML(msg) {
    const userId = AuthModule.getUserId();
    const isSent = msg.emisor_id === userId;
    const time = new Date(msg.created_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    const conv = getActiveConversation();
    const isGroup = conv?.tipo === 'grupo';

    // Sender name for group chats
    let senderName = '';
    if (isGroup && !isSent) {
      const senderProfile = contactProfiles[msg.emisor_id];
      senderName = senderProfile?.nombre_completo || 'Usuario';
    }

    const contentHTML = msg.tipo === 'foto'
      ? `<img src="${msg.contenido}" class="ia-msg-img" alt="Foto" style="max-width:240px;border-radius:8px;cursor:pointer;">`
      : `<div class="ia-msg-text">${escapeHtml(msg.contenido || '')}</div>`;

    return `
      <div class="ia-msg ${isSent ? 'ia-msg-user chat-msg-sent' : 'ia-msg-bot chat-msg-received'}">
        <div class="ia-msg-bubble" style="background:${isSent ? 'var(--success-light, #dcfce7)' : '#fff'};">
          ${isGroup && !isSent ? `<div class="chat-sender-name" style="font-size:0.75rem;font-weight:600;color:var(--primary);margin-bottom:2px;">${escapeHtml(senderName)}</div>` : ''}
          ${contentHTML}
          <span class="ia-msg-time">${time}</span>
        </div>
      </div>`;
  }

  function appendMessageToDOM(msg) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;
    const welcome = messagesDiv.querySelector('.ia-welcome-v2');
    if (welcome) welcome.remove();
    messagesDiv.insertAdjacentHTML('beforeend', buildMessageHTML(msg));
  }

  function refreshUI() {
    updateConvList();
    const titleEl = document.getElementById('chat-title');
    const inputEl = document.getElementById('chat-input');
    const messagesEl = document.getElementById('chat-messages');

    if (titleEl) {
      titleEl.textContent = activeConversationId
        ? getConversationTitle(getActiveConversation())
        : 'Selecciona una conversación';
    }
    if (inputEl) inputEl.style.display = activeConversationId ? '' : 'none';
    if (messagesEl) {
      messagesEl.innerHTML = activeConversationId ? renderMessages() : renderEmptyState();
      document.getElementById('chat-empty-new')?.addEventListener('click', showNewConversation);
    }
    scrollToBottom();

    // Load group names for group conversations
    loadGroupNames();
  }

  async function loadGroupNames() {
    for (const conv of conversations) {
      if (conv.tipo === 'grupo' && conv.grupo_id && !conv._groupName) {
        try {
          const grupo = await AgroDB.getById('chat_grupos', conv.grupo_id);
          if (grupo) conv._groupName = grupo.nombre;
        } catch { /* ignore */ }
      }
    }
    // Update displayed titles if needed
    const titleEl = document.getElementById('chat-title');
    if (titleEl && activeConversationId) {
      titleEl.textContent = getConversationTitle(getActiveConversation());
    }
  }

  function updateConvList() {
    const listEl = document.getElementById('chat-conv-list');
    if (listEl) {
      listEl.innerHTML = renderConversationList();
      listEl.querySelectorAll('.ia-conv-item').forEach(item => {
        item.addEventListener('click', () => selectConversation(item.dataset.convId));
      });
    }
  }

  // ── Event handlers ────────────────────────
  function initEvents() {
    document.getElementById('chat-new-conv')?.addEventListener('click', showNewConversation);
    document.getElementById('chat-new-group')?.addEventListener('click', showNewGroup);
    document.getElementById('chat-empty-new')?.addEventListener('click', showNewConversation);

    // Toggle sidebar (mobile)
    document.getElementById('chat-toggle-sidebar')?.addEventListener('click', () => {
      document.getElementById('chat-sidebar')?.classList.toggle('open');
    });

    // Send
    document.getElementById('chat-btn-send')?.addEventListener('click', sendMessage);
    const input = document.getElementById('chat-message-input');
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Photo
    document.getElementById('chat-btn-photo')?.addEventListener('click', sendPhoto);
    document.getElementById('chat-photo-input')?.addEventListener('change', handlePhotoSelected);

    // Conversation list clicks
    document.querySelectorAll('.ia-conv-item').forEach(item => {
      item.addEventListener('click', () => selectConversation(item.dataset.convId));
    });
  }

  // ── Helpers ───────────────────────────────
  function getActiveConversation() {
    return conversations.find(c => c.id === activeConversationId) || null;
  }

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* ignore */ }
  }

  function scrollToBottom() {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
  }

  // ── Public API ────────────────────────────
  return { render };
})();

// ============================================
// AgroFinca - Asistente IA Module v2
// Multi-conversation chat with Gemini
// Premium feature - CRUD conversations
// ============================================

const AsistenteIAModule = (() => {
  let conversations = [];
  let activeConversationId = null;
  let chatMessages = [];
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let currentPhotos = [];
  let currentFincaId = null;

  // ── Render entry point ──────────────────────
  async function render(container, fincaId) {
    if (!PlanGuard.isPaid()) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🤖</div>
          <h3>Asistente IA</h3>
          <p>El asistente inteligente con Gemini está disponible en el plan Premium.</p>
          <button class="btn btn-primary" onclick="PlanGuard.showUpgradePrompt('Asistente IA')">
            ⭐ Actualizar a Premium
          </button>
        </div>`;
      return;
    }
    if (!fincaId) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏡</div>
          <h3>Selecciona una finca</h3>
          <p>Selecciona una finca para usar el asistente IA.</p>
        </div>`;
      return;
    }

    currentFincaId = fincaId;
    await loadConversations(fincaId);

    container.innerHTML = `
      <div class="ia-app">
        <!-- Sidebar: conversation list -->
        <div class="ia-sidebar" id="ia-sidebar">
          <div class="ia-sidebar-header">
            <h3>💬 Chats</h3>
            <button class="ia-btn-icon" id="ia-new-chat" title="Nuevo chat">
              <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
          <div class="ia-conv-list" id="ia-conv-list">
            ${renderConversationList()}
          </div>
        </div>

        <!-- Main chat area -->
        <div class="ia-main">
          <!-- Chat header -->
          <div class="ia-chat-header" id="ia-chat-header">
            <button class="ia-btn-icon ia-toggle-sidebar" id="ia-toggle-sidebar" title="Ver chats">
              <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M3 6h18M3 12h18M3 18h18"/>
              </svg>
            </button>
            <div class="ia-chat-title" id="ia-chat-title">
              ${activeConversationId ? getActiveConversation()?.title || 'Chat' : 'Selecciona o crea un chat'}
            </div>
            <div class="ia-chat-actions" id="ia-chat-actions">
              ${activeConversationId ? `
                <button class="ia-btn-icon" id="ia-rename-chat" title="Renombrar">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="ia-btn-icon ia-btn-danger" id="ia-delete-chat" title="Eliminar">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Quick actions -->
          <div class="ia-quick-actions" id="ia-quick-actions" ${!activeConversationId ? 'style="display:none"' : ''}>
            <button class="ia-chip" data-template="crop-analysis">📸 Analizar cultivo</button>
            <button class="ia-chip" data-template="pest-id">🐛 Identificar plaga</button>
            <button class="ia-chip" data-template="optimize">📊 Optimizar producción</button>
            <button class="ia-chip" data-template="phyto">🧪 Fitosanitaria</button>
          </div>

          <!-- Messages -->
          <div class="ia-messages" id="ia-messages">
            ${activeConversationId ? renderMessages() : renderEmptyState()}
          </div>

          <!-- Photo preview -->
          <div id="ia-photo-preview" class="ia-photo-preview" style="display:none;"></div>

          <!-- Input area -->
          <div class="ia-input" id="ia-input" ${!activeConversationId ? 'style="display:none"' : ''}>
            <div class="ia-input-row">
              <button class="ia-btn-icon" id="ia-btn-photo" title="Tomar foto">📷</button>
              <button class="ia-btn-icon" id="ia-btn-gallery" title="Subir imagen">🖼️</button>
              <button class="ia-btn-icon" id="ia-btn-audio" title="Nota de voz">🎤</button>
              <div class="ia-textarea-wrap">
                <textarea id="ia-message-input" placeholder="Escribe tu pregunta..." rows="1"></textarea>
              </div>
              <button class="ia-btn-send" id="ia-btn-send" title="Enviar">
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Hidden file inputs -->
          <input type="file" id="ia-camera-input" accept="image/*" capture="environment" style="display:none;">
          <input type="file" id="ia-gallery-input" accept="image/*" style="display:none;">
        </div>
      </div>`;

    initEvents(fincaId);
    scrollToBottom();
  }

  // ── Conversations CRUD ──────────────────────
  async function loadConversations(fincaId) {
    try {
      const all = await AgroDB.getByIndex('ai_conversations', 'finca_id', fincaId);
      conversations = all.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      // Auto-select most recent if none selected
      if (!activeConversationId && conversations.length > 0) {
        activeConversationId = conversations[0].id;
        await loadMessages(activeConversationId);
      }
    } catch {
      conversations = [];
    }
  }

  async function createConversation(title = null) {
    const conv = {
      id: AgroDB.uuid(),
      title: title || `Chat ${new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
      finca_id: currentFincaId,
      usuario_id: AuthModule.getUserId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0
    };

    try {
      await AgroDB.add('ai_conversations', conv);
    } catch (e) {
      console.warn('Error creating conversation:', e);
    }

    conversations.unshift(conv);
    activeConversationId = conv.id;
    chatMessages = [];
    refreshUI();
    return conv;
  }

  async function renameConversation(convId, newTitle) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    conv.title = newTitle;
    conv.updated_at = new Date().toISOString();
    try {
      await AgroDB.update('ai_conversations', convId, { title: newTitle, updated_at: conv.updated_at });
    } catch { /* ignore */ }
    refreshUI();
  }

  async function deleteConversation(convId) {
    // Delete messages
    try {
      const msgs = await AgroDB.getByIndex('ai_chat_history', 'conversation_id', convId);
      for (const msg of msgs) {
        await AgroDB.remove('ai_chat_history', msg.id);
      }
    } catch { /* ignore */ }
    // Delete conversation
    try {
      await AgroDB.remove('ai_conversations', convId);
    } catch { /* ignore */ }

    conversations = conversations.filter(c => c.id !== convId);
    if (activeConversationId === convId) {
      activeConversationId = conversations.length > 0 ? conversations[0].id : null;
      if (activeConversationId) {
        await loadMessages(activeConversationId);
      } else {
        chatMessages = [];
      }
    }
    refreshUI();
  }

  async function selectConversation(convId) {
    activeConversationId = convId;
    await loadMessages(convId);
    refreshUI();
    // Close sidebar on mobile
    document.getElementById('ia-sidebar')?.classList.remove('open');
  }

  // ── Messages ────────────────────────────────
  async function loadMessages(convId) {
    try {
      const all = await AgroDB.getByIndex('ai_chat_history', 'conversation_id', convId);
      chatMessages = all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch {
      // Fallback: load by finca_id for legacy messages
      try {
        const all = await AgroDB.getByIndex('ai_chat_history', 'finca_id', currentFincaId);
        chatMessages = all
          .filter(m => m.conversation_id === convId)
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } catch {
        chatMessages = [];
      }
    }
  }

  async function addMessage(role, content, image = null) {
    if (!activeConversationId) {
      await createConversation();
    }

    const msg = {
      id: AgroDB.uuid(),
      role,
      content,
      conversation_id: activeConversationId,
      finca_id: currentFincaId,
      image,
      timestamp: new Date().toISOString(),
      usuario_id: AuthModule.getUserId()
    };
    chatMessages.push(msg);

    try {
      await AgroDB.add('ai_chat_history', msg);
    } catch (e) {
      console.warn('Error saving chat message:', e);
    }

    // Update conversation timestamp and count
    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv) {
      conv.updated_at = msg.timestamp;
      conv.message_count = (conv.message_count || 0) + 1;
      // Auto-title from first user message
      if (role === 'user' && conv.message_count <= 2 && content.length > 3) {
        conv.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
      }
      try {
        await AgroDB.update('ai_conversations', conv.id, {
          updated_at: conv.updated_at,
          message_count: conv.message_count,
          title: conv.title
        });
      } catch { /* ignore */ }
    }

    appendMessageToDOM(msg);
    updateConvList();
    scrollToBottom();
  }

  // ── Rendering ───────────────────────────────
  function renderConversationList() {
    if (conversations.length === 0) {
      return `<div class="ia-conv-empty">Sin conversaciones.<br>Crea una nueva con el botón +</div>`;
    }
    return conversations.map(c => `
      <div class="ia-conv-item ${c.id === activeConversationId ? 'active' : ''}" data-conv-id="${c.id}">
        <div class="ia-conv-icon">💬</div>
        <div class="ia-conv-info">
          <div class="ia-conv-title">${escapeHtml(c.title)}</div>
          <div class="ia-conv-meta">${c.message_count || 0} msgs · ${timeAgo(c.updated_at)}</div>
        </div>
      </div>
    `).join('');
  }

  function renderMessages() {
    if (chatMessages.length === 0) {
      return renderWelcome();
    }
    return chatMessages.map(msg => buildMessageHTML(msg)).join('');
  }

  function renderWelcome() {
    return `
      <div class="ia-welcome-v2">
        <div class="ia-welcome-icon">🤖</div>
        <h3>Asistente AgroFinca</h3>
        <p>Tu agrónomo virtual con IA. Pregúntame sobre:</p>
        <div class="ia-welcome-chips">
          <button class="ia-welcome-chip" data-template="optimize">📊 Optimizar mi finca</button>
          <button class="ia-welcome-chip" data-template="pest-id">🐛 Identificar una plaga</button>
          <button class="ia-welcome-chip" data-template="crop-analysis">📸 Analizar un cultivo</button>
          <button class="ia-welcome-chip" data-template="phyto">🧪 Plan fitosanitario</button>
        </div>
      </div>`;
  }

  function renderEmptyState() {
    return `
      <div class="ia-welcome-v2">
        <div class="ia-welcome-icon">💬</div>
        <h3>Inicia una conversación</h3>
        <p>Crea un nuevo chat para hablar con tu asistente agrícola.</p>
        <button class="btn btn-primary" id="ia-empty-new-chat">+ Nuevo Chat</button>
      </div>`;
  }

  function buildMessageHTML(msg) {
    const isUser = msg.role === 'user';
    const time = new Date(msg.timestamp).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="ia-msg ${isUser ? 'ia-msg-user' : 'ia-msg-bot'}">
        ${!isUser ? '<div class="ia-msg-avatar">🤖</div>' : ''}
        <div class="ia-msg-bubble">
          ${msg.image ? `<img src="${msg.image}" class="ia-msg-img" alt="Foto">` : ''}
          <div class="ia-msg-text">${formatMarkdown(msg.content)}</div>
          <span class="ia-msg-time">${time}</span>
        </div>
        ${isUser ? '<div class="ia-msg-avatar">👤</div>' : ''}
      </div>`;
  }

  function appendMessageToDOM(msg) {
    const messagesDiv = document.getElementById('ia-messages');
    if (!messagesDiv) return;
    const welcome = messagesDiv.querySelector('.ia-welcome-v2');
    if (welcome) welcome.remove();
    messagesDiv.insertAdjacentHTML('beforeend', buildMessageHTML(msg));
  }

  function refreshUI() {
    updateConvList();
    // Update header
    const titleEl = document.getElementById('ia-chat-title');
    const actionsEl = document.getElementById('ia-chat-actions');
    const quickEl = document.getElementById('ia-quick-actions');
    const inputEl = document.getElementById('ia-input');
    const messagesEl = document.getElementById('ia-messages');

    if (titleEl) {
      titleEl.textContent = activeConversationId
        ? (getActiveConversation()?.title || 'Chat')
        : 'Selecciona o crea un chat';
    }
    if (actionsEl) {
      actionsEl.innerHTML = activeConversationId ? `
        <button class="ia-btn-icon" id="ia-rename-chat" title="Renombrar">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="ia-btn-icon ia-btn-danger" id="ia-delete-chat" title="Eliminar">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      ` : '';
      // Rebind actions
      document.getElementById('ia-rename-chat')?.addEventListener('click', handleRename);
      document.getElementById('ia-delete-chat')?.addEventListener('click', handleDelete);
    }

    if (quickEl) quickEl.style.display = activeConversationId ? '' : 'none';
    if (inputEl) inputEl.style.display = activeConversationId ? '' : 'none';
    if (messagesEl) {
      messagesEl.innerHTML = activeConversationId ? renderMessages() : renderEmptyState();
      // Bind empty state button
      document.getElementById('ia-empty-new-chat')?.addEventListener('click', () => createConversation());
      // Bind welcome chips
      messagesEl.querySelectorAll('.ia-welcome-chip').forEach(btn => {
        btn.addEventListener('click', () => handleTemplate(btn.dataset.template));
      });
    }
    scrollToBottom();
  }

  function updateConvList() {
    const listEl = document.getElementById('ia-conv-list');
    if (listEl) {
      listEl.innerHTML = renderConversationList();
      // Bind clicks
      listEl.querySelectorAll('.ia-conv-item').forEach(item => {
        item.addEventListener('click', () => selectConversation(item.dataset.convId));
      });
    }
  }

  // ── Event handlers ──────────────────────────
  function initEvents(fincaId) {
    // New chat
    document.getElementById('ia-new-chat')?.addEventListener('click', () => createConversation());
    document.getElementById('ia-empty-new-chat')?.addEventListener('click', () => createConversation());

    // Toggle sidebar (mobile)
    document.getElementById('ia-toggle-sidebar')?.addEventListener('click', () => {
      document.getElementById('ia-sidebar')?.classList.toggle('open');
    });

    // Send
    document.getElementById('ia-btn-send')?.addEventListener('click', () => sendMessage(fincaId));
    const input = document.getElementById('ia-message-input');
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(fincaId);
      }
    });
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Camera / Gallery / Audio
    document.getElementById('ia-btn-photo')?.addEventListener('click', () =>
      document.getElementById('ia-camera-input')?.click());
    document.getElementById('ia-btn-gallery')?.addEventListener('click', () =>
      document.getElementById('ia-gallery-input')?.click());
    document.getElementById('ia-camera-input')?.addEventListener('change', handlePhotoSelect);
    document.getElementById('ia-gallery-input')?.addEventListener('change', handlePhotoSelect);
    document.getElementById('ia-btn-audio')?.addEventListener('click', toggleAudioRecording);

    // Quick action chips
    document.querySelectorAll('.ia-chip[data-template]').forEach(btn => {
      btn.addEventListener('click', () => handleTemplate(btn.dataset.template));
    });

    // Welcome chips
    document.querySelectorAll('.ia-welcome-chip[data-template]').forEach(btn => {
      btn.addEventListener('click', () => handleTemplate(btn.dataset.template));
    });

    // Conversation list clicks
    document.querySelectorAll('.ia-conv-item').forEach(item => {
      item.addEventListener('click', () => selectConversation(item.dataset.convId));
    });

    // Rename / Delete
    document.getElementById('ia-rename-chat')?.addEventListener('click', handleRename);
    document.getElementById('ia-delete-chat')?.addEventListener('click', handleDelete);
  }

  async function handleRename() {
    const conv = getActiveConversation();
    if (!conv) return;
    const newName = prompt('Nombre del chat:', conv.title);
    if (newName && newName.trim()) {
      await renameConversation(conv.id, newName.trim());
    }
  }

  async function handleDelete() {
    const conv = getActiveConversation();
    if (!conv) return;
    if (confirm(`¿Eliminar "${conv.title}"? Se perderán todos los mensajes.`)) {
      await deleteConversation(conv.id);
    }
  }

  // ── Send message flow ───────────────────────
  async function sendMessage(fincaId) {
    const input = document.getElementById('ia-message-input');
    const text = input?.value.trim() || '';
    const photos = [...currentPhotos];

    if (!text && photos.length === 0) return;

    // Clear input
    if (input) { input.value = ''; input.style.height = 'auto'; }
    currentPhotos = [];
    const preview = document.getElementById('ia-photo-preview');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }

    // Create conversation if needed
    if (!activeConversationId) {
      await createConversation(text.substring(0, 50));
    }

    const imageBase64 = photos.length > 0 ? photos[0].base64 : null;
    await addMessage('user', text || 'Analiza esta imagen', imageBase64);
    showTyping();

    try {
      let result;
      if (photos.length > 0) {
        result = await GeminiClient.analyzeImage(photos[0].base64, text || '');
      } else {
        const context = await buildContext(fincaId);
        const messages = chatMessages
          .filter(m => m.conversation_id === activeConversationId)
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }));
        messages.push({ role: 'user', content: text });
        result = await GeminiClient.chat(messages, context);
      }
      hideTyping();
      await addMessage('assistant', result.response || result.text || 'No se obtuvo respuesta.');
    } catch (err) {
      hideTyping();
      await addMessage('assistant', '⚠️ Error: ' + err.message);
    }
  }

  function handleTemplate(template) {
    const input = document.getElementById('ia-message-input');
    if (template === 'crop-analysis' || template === 'pest-id') {
      App.showToast(template === 'crop-analysis'
        ? 'Toma una foto o sube una imagen de tu cultivo'
        : '¿Qué síntomas observas? Describe o envía una foto', 'info', 4000);
      document.getElementById('ia-camera-input')?.click();
      return;
    }
    if (template === 'optimize') {
      if (input) input.value = 'Analiza mis datos de producción y dame recomendaciones para optimizar mi finca.';
      sendMessage(currentFincaId);
      return;
    }
    if (template === 'phyto') {
      if (input) input.value = 'Dame un plan fitosanitario basado en mis cultivos e inspecciones recientes.';
      sendMessage(currentFincaId);
      return;
    }
  }

  // ── Photos ──────────────────────────────────
  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const preview = document.getElementById('ia-photo-preview');
    if (preview) preview.style.display = 'flex';

    for (const file of files) {
      try {
        const compressed = await PhotoUtils.compressImage(file);
        currentPhotos.push(compressed);
        const div = document.createElement('div');
        div.className = 'ia-preview-item';
        div.innerHTML = `
          <img src="${compressed.base64}" alt="Preview">
          <button class="ia-preview-remove">&times;</button>`;
        div.querySelector('.ia-preview-remove').addEventListener('click', () => {
          const idx = currentPhotos.indexOf(compressed);
          if (idx > -1) currentPhotos.splice(idx, 1);
          div.remove();
          if (currentPhotos.length === 0 && preview) preview.style.display = 'none';
        });
        preview?.appendChild(div);
      } catch {
        App.showToast('Error al procesar foto', 'error');
      }
    }
    e.target.value = '';
  }

  // ── Audio ───────────────────────────────────
  async function toggleAudioRecording() {
    const btn = document.getElementById('ia-btn-audio');
    if (isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      if (btn) { btn.textContent = '🎤'; btn.classList.remove('recording'); }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        await handleAudio(blob);
      };
      mediaRecorder.start();
      isRecording = true;
      if (btn) { btn.textContent = '⏹️'; btn.classList.add('recording'); }
      App.showToast('Grabando audio...', 'info');
    } catch {
      App.showToast('No se pudo acceder al micrófono', 'error');
    }
  }

  async function handleAudio(blob) {
    if (!activeConversationId) await createConversation('Nota de voz');
    await addMessage('user', '🎤 Nota de voz enviada');
    showTyping();
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
      const result = await GeminiClient.transcribeAudio(base64);
      hideTyping();
      await addMessage('assistant', result.response || result.text || 'No se pudo procesar.');
    } catch (err) {
      hideTyping();
      await addMessage('assistant', '⚠️ Error: ' + err.message);
    }
  }

  // ── Context builder ─────────────────────────
  async function buildContext(fincaId) {
    try {
      const finca = await AgroDB.getById('fincas', fincaId);
      const ciclos = await AgroDB.getByIndex('ciclos_productivos', 'finca_id', fincaId);
      const activos = ciclos.filter(c => c.estado === 'activo');
      const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
      const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
      return {
        fincaNombre: finca?.nombre || '',
        cultivos: cultivos.map(c => c.nombre),
        ciclosActivos: activos.length,
        areas: areas.map(a => a.nombre),
        ubicacion: finca?.ubicacion || ''
      };
    } catch { return {}; }
  }

  // ── Helpers ─────────────────────────────────
  function getActiveConversation() {
    return conversations.find(c => c.id === activeConversationId);
  }

  function showTyping() {
    const el = document.getElementById('ia-messages');
    if (!el) return;
    el.insertAdjacentHTML('beforeend', `
      <div class="ia-msg ia-msg-bot ia-typing-indicator">
        <div class="ia-msg-avatar">🤖</div>
        <div class="ia-msg-bubble">
          <div class="ia-typing-anim">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>`);
    scrollToBottom();
  }

  function hideTyping() {
    document.querySelector('.ia-typing-indicator')?.remove();
  }

  function scrollToBottom() {
    const el = document.getElementById('ia-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^## (.*$)/gm, '<h3>$1</h3>')
      .replace(/^# (.*$)/gm, '<h2>$1</h2>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/^\* (.*$)/gm, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }

  function escapeHtml(text) {
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
    return `${days}d`;
  }

  return { render };
})();

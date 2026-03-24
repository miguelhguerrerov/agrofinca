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
    // Parse actions from bot messages
    let displayContent = msg.content;
    let actions = [];
    if (!isUser && msg.content) {
      const parsed = parseActionsFromResponse(msg.content);
      displayContent = parsed.cleanText;
      actions = parsed.actions;
    }
    const actionsHTML = actions.length > 0 ? `
      <div class="ia-actions" data-msg-id="${msg.id}">
        ${actions.map((a, i) => `
          <button class="ia-action-btn ${msg._actionsExecuted?.[i] ? 'executed' : ''}"
                  data-action-index="${i}" data-msg-id="${msg.id}"
                  ${msg._actionsExecuted?.[i] ? 'disabled' : ''}>
            ${msg._actionsExecuted?.[i] ? '✓' : '✅'} ${getActionLabel(a)}
          </button>
        `).join('')}
      </div>` : '';
    return `
      <div class="ia-msg ${isUser ? 'ia-msg-user' : 'ia-msg-bot'}">
        ${!isUser ? '<div class="ia-msg-avatar">🤖</div>' : ''}
        <div class="ia-msg-bubble">
          ${msg.image ? `<img src="${msg.image}" class="ia-msg-img" alt="Foto">` : ''}
          <div class="ia-msg-text">${formatMarkdown(displayContent)}</div>
          ${actionsHTML}
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

    // Action buttons (event delegation)
    document.getElementById('ia-messages')?.addEventListener('click', handleActionClick);
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

  // ── Actionable Chat — Parse & Execute ───────
  function parseActionsFromResponse(text) {
    if (!text) return { cleanText: '', actions: [] };
    const jsonRegex = /```json\s*([\s\S]*?)```/g;
    let actions = [];
    let cleanText = text;
    let match;
    while ((match = jsonRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.actions && Array.isArray(parsed.actions)) {
          actions = actions.concat(parsed.actions);
        }
      } catch { /* invalid JSON, skip */ }
      cleanText = cleanText.replace(match[0], '');
    }
    return { cleanText: cleanText.trim(), actions };
  }

  // ── Action types with full field schemas ────
  const ACTION_MAP = {
    create_tarea: { store: 'tareas', label: 'Crear tarea', icon: '📅' },
    create_inspeccion: { store: 'inspecciones', label: 'Crear inspección', icon: '📋' },
    create_aplicacion_fitosanitaria: { store: 'aplicaciones_fitosanitarias', label: 'Crear aplicación fitosanitaria', icon: '🧪' },
    create_costo: { store: 'costos', label: 'Registrar costo', icon: '💰' },
    create_cosecha: { store: 'cosechas', label: 'Registrar cosecha', icon: '🌾' },
    create_ciclo: { store: 'ciclos_productivos', label: 'Crear ciclo productivo', icon: '🔄' },
    create_venta: { store: 'ventas', label: 'Registrar venta', icon: '🛒' }
  };

  // Full field schemas per action type — mirrors the real forms
  const FIELD_SCHEMAS = {
    create_tarea: [
      { key: 'titulo', label: 'Título', type: 'text', required: true },
      { key: 'descripcion', label: 'Descripción', type: 'textarea' },
      { key: 'fecha_programada', label: 'Fecha programada', type: 'date', required: true },
      { key: 'hora_inicio', label: 'Hora de inicio', type: 'time' },
      { key: 'duracion_minutos', label: 'Duración', type: 'select', options: [
        { value: '', label: '-- Sin definir --' },
        { value: '15', label: '15 minutos' }, { value: '30', label: '30 minutos' },
        { value: '60', label: '1 hora' }, { value: '120', label: '2 horas' },
        { value: '180', label: '3 horas' }, { value: '240', label: '4 horas' },
        { value: '480', label: 'Todo el día' }
      ]},
      { key: 'prioridad', label: 'Prioridad', type: 'select', options: [
        { value: 'baja', label: 'Baja' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' }
      ]},
      { key: 'area_id', label: 'Área / Lote', type: 'dynamic_select', source: 'areas' },
      { key: 'cultivo_id', label: 'Cultivo', type: 'dynamic_select', source: 'cultivos' },
      { key: 'ciclo_id', label: 'Ciclo productivo', type: 'dynamic_select', source: 'ciclos' },
      { key: 'recurrente', label: 'Tarea recurrente', type: 'checkbox' },
      { key: 'frecuencia_dias', label: 'Repetir cada', type: 'select', showIf: 'recurrente', options: [
        { value: '1', label: 'Diario' }, { value: '3', label: 'Cada 3 días' },
        { value: '7', label: 'Semanal' }, { value: '14', label: 'Quincenal' },
        { value: '28', label: 'Mensual' }
      ]}
    ],
    create_inspeccion: [
      { key: 'titulo', label: 'Título / Motivo', type: 'text', required: true },
      { key: 'fecha', label: 'Fecha', type: 'date', required: true },
      { key: 'estado_general', label: 'Estado general', type: 'select', options: [
        { value: 'bueno', label: '🟢 Bueno' }, { value: 'regular', label: '🟡 Regular' }, { value: 'malo', label: '🔴 Malo' }
      ]},
      { key: 'area_id', label: 'Área / Lote', type: 'dynamic_select', source: 'areas' },
      { key: 'ciclo_id', label: 'Ciclo productivo', type: 'dynamic_select', source: 'ciclos' },
      { key: 'estado_follaje', label: 'Estado del follaje', type: 'select', options: [
        { value: '', label: '-- Sin evaluar --' },
        { value: 'saludable', label: 'Saludable' }, { value: 'amarillento', label: 'Amarillento' },
        { value: 'necrotico', label: 'Necrótico' }, { value: 'marchito', label: 'Marchito' },
        { value: 'defoliado', label: 'Defoliado' }
      ]},
      { key: 'estado_riego', label: 'Estado del riego', type: 'select', options: [
        { value: '', label: '-- Sin evaluar --' },
        { value: 'optimo', label: 'Óptimo' }, { value: 'insuficiente', label: 'Insuficiente' },
        { value: 'excesivo', label: 'Excesivo' }, { value: 'sin_riego', label: 'Sin riego' }
      ]},
      { key: 'estado_suelo', label: 'Estado del suelo', type: 'select', options: [
        { value: '', label: '-- Sin evaluar --' },
        { value: 'esponjoso', label: 'Esponjoso' }, { value: 'compactado', label: 'Compactado' },
        { value: 'humedo', label: 'Húmedo' }, { value: 'seco', label: 'Seco' },
        { value: 'erosionado', label: 'Erosionado' }
      ]},
      { key: 'plagas_detectadas', label: 'Plagas detectadas', type: 'text' },
      { key: 'enfermedades_detectadas', label: 'Enfermedades detectadas', type: 'text' },
      { key: 'etapa_fenologica', label: 'Etapa fenológica', type: 'text' },
      { key: 'observaciones', label: 'Observaciones detalladas', type: 'textarea', required: true }
    ],
    create_aplicacion_fitosanitaria: [
      { key: 'producto', label: 'Producto aplicado', type: 'text', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: [
        { value: 'fungicida', label: 'Fungicida' }, { value: 'insecticida', label: 'Insecticida' },
        { value: 'herbicida', label: 'Herbicida' }, { value: 'fertilizante', label: 'Fertilizante' },
        { value: 'biocontrol', label: 'Biocontrol' }, { value: 'otro', label: 'Otro' }
      ]},
      { key: 'fecha', label: 'Fecha de aplicación', type: 'date', required: true },
      { key: 'area_id', label: 'Área / Lote', type: 'dynamic_select', source: 'areas' },
      { key: 'ciclo_id', label: 'Ciclo productivo', type: 'dynamic_select', source: 'ciclos' },
      { key: 'dosis', label: 'Dosis', type: 'text' },
      { key: 'metodo_aplicacion', label: 'Método de aplicación', type: 'select', options: [
        { value: '', label: '-- Seleccionar --' },
        { value: 'aspersion', label: 'Aspersión' }, { value: 'drench', label: 'Drench' },
        { value: 'granulado', label: 'Granulado' }, { value: 'inyeccion', label: 'Inyección' },
        { value: 'manual', label: 'Manual' }
      ]},
      { key: 'motivo', label: 'Motivo de aplicación', type: 'textarea' },
      { key: 'notas', label: 'Notas adicionales', type: 'textarea' }
    ],
    create_costo: [
      { key: 'categoria', label: 'Categoría', type: 'select', required: true, options: [
        { value: 'insumo', label: 'Insumo' }, { value: 'mano_obra_contratada', label: 'Mano de obra contratada' },
        { value: 'mano_obra_familiar', label: 'Mano de obra familiar' }, { value: 'herramienta', label: 'Herramienta' },
        { value: 'infraestructura', label: 'Infraestructura' }, { value: 'transporte', label: 'Transporte' },
        { value: 'fitosanitario', label: 'Fitosanitario' }, { value: 'riego', label: 'Riego' },
        { value: 'empaque', label: 'Empaque' }, { value: 'otro', label: 'Otro' }
      ]},
      { key: 'descripcion', label: 'Descripción', type: 'text', required: true },
      { key: 'fecha', label: 'Fecha', type: 'date', required: true },
      { key: 'cantidad', label: 'Cantidad', type: 'number', step: '0.1', defaultValue: '1' },
      { key: 'unidad', label: 'Unidad', type: 'select', options: [
        { value: 'unidad', label: 'Unidad' }, { value: 'jornal', label: 'Jornal' },
        { value: 'hora', label: 'Hora' }, { value: 'kg', label: 'Kg' },
        { value: 'litro', label: 'Litro' }, { value: 'saco', label: 'Saco' },
        { value: 'global', label: 'Global' }
      ]},
      { key: 'costo_unitario', label: 'Costo unitario ($)', type: 'number', step: '0.01', required: true },
      { key: 'total', label: 'Total ($)', type: 'number', step: '0.01', readonly: true, computed: 'cantidad * costo_unitario' },
      { key: 'area_id', label: 'Área / Lote', type: 'dynamic_select', source: 'areas' },
      { key: 'cultivo_id', label: 'Cultivo', type: 'dynamic_select', source: 'cultivos' },
      { key: 'ciclo_id', label: 'Ciclo productivo', type: 'dynamic_select', source: 'ciclos' },
      { key: 'notas', label: 'Notas', type: 'textarea' }
    ],
    create_cosecha: [
      { key: 'ciclo_id', label: 'Ciclo productivo', type: 'dynamic_select', source: 'ciclos', required: true },
      { key: 'fecha', label: 'Fecha de cosecha', type: 'date', required: true },
      { key: 'cantidad', label: 'Cantidad', type: 'number', step: '0.1', required: true },
      { key: 'unidad', label: 'Unidad', type: 'select', options: [
        { value: 'kg', label: 'Kilogramos' }, { value: 'racimos', label: 'Racimos' },
        { value: 'litros', label: 'Litros' }, { value: 'unidades', label: 'Unidades' },
        { value: 'atados', label: 'Atados' }, { value: 'sacos', label: 'Sacos' },
        { value: 'quintales', label: 'Quintales' }, { value: 'libras', label: 'Libras' }
      ]},
      { key: 'calidad', label: 'Calidad', type: 'select', options: [
        { value: 'A', label: 'A - Premium' }, { value: 'B', label: 'B - Estándar' }, { value: 'C', label: 'C - Segunda' }
      ]},
      { key: 'notas', label: 'Observaciones', type: 'textarea' }
    ],
    create_ciclo: [
      { key: 'cultivo_id', label: 'Cultivo', type: 'dynamic_select', source: 'cultivos', required: true },
      { key: 'area_id', label: 'Área / Lote', type: 'dynamic_select', source: 'areas' },
      { key: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: true },
      { key: 'fecha_fin_estimada', label: 'Fecha fin estimada', type: 'date' },
      { key: 'cantidad_plantas', label: 'Cantidad de plantas', type: 'number' },
      { key: 'estado', label: 'Estado', type: 'select', options: [
        { value: 'activo', label: 'Activo' }, { value: 'completado', label: 'Completado' }, { value: 'cancelado', label: 'Cancelado' }
      ]},
      { key: 'notas', label: 'Notas', type: 'textarea' }
    ],
    create_venta: [
      { key: 'fecha', label: 'Fecha de venta', type: 'date', required: true },
      { key: 'cultivo_id', label: 'Producto (cultivo)', type: 'dynamic_select', source: 'cultivos' },
      { key: 'producto', label: 'Producto (si no es cultivo)', type: 'text' },
      { key: 'cantidad', label: 'Cantidad', type: 'number', step: '0.1', required: true },
      { key: 'unidad', label: 'Unidad', type: 'select', options: [
        { value: 'kg', label: 'Kilogramos' }, { value: 'racimos', label: 'Racimos' },
        { value: 'atados', label: 'Atados' }, { value: 'litros', label: 'Litros' },
        { value: 'unidades', label: 'Unidades' }, { value: 'sacos', label: 'Sacos' },
        { value: 'quintales', label: 'Quintales' }, { value: 'libras', label: 'Libras' }
      ]},
      { key: 'precio_unitario', label: 'Precio unitario ($)', type: 'number', step: '0.01', required: true },
      { key: 'total', label: 'Total ($)', type: 'number', step: '0.01', readonly: true, computed: 'cantidad * precio_unitario' },
      { key: 'comprador', label: 'Comprador', type: 'text' },
      { key: 'forma_pago', label: 'Forma de pago', type: 'select', options: [
        { value: 'efectivo', label: 'Efectivo' }, { value: 'transferencia', label: 'Transferencia' }, { value: 'credito', label: 'Crédito' }
      ]},
      { key: 'notas', label: 'Notas', type: 'textarea' }
    ]
  };

  // Cache for dynamic select options
  let _dynamicOptionsCache = {};

  async function loadDynamicOptions() {
    if (!currentFincaId) return;
    try {
      const [areas, cultivos, ciclos] = await Promise.all([
        AgroDB.getByIndex('areas', 'finca_id', currentFincaId).catch(() => []),
        AgroDB.getByIndex('cultivos_catalogo', 'finca_id', currentFincaId).catch(() => []),
        AgroDB.getByIndex('ciclos_productivos', 'finca_id', currentFincaId).catch(() => [])
      ]);
      _dynamicOptionsCache = {
        areas: [{ value: '', label: '-- Sin asignar --' }, ...areas.map(a => ({ value: a.id, label: `${a.nombre} (${a.tipo || ''})` }))],
        cultivos: [{ value: '', label: '-- Sin asignar --' }, ...cultivos.map(c => ({ value: c.id, label: c.nombre }))],
        ciclos: [{ value: '', label: '-- Sin asignar --' }, ...ciclos.filter(c => c.estado === 'activo').map(c => {
          const cultivo = cultivos.find(cu => cu.id === c.cultivo_id);
          return { value: c.id, label: `${cultivo?.nombre || 'Ciclo'} (${c.fecha_inicio || ''})` };
        })]
      };
    } catch (e) {
      console.warn('[IA] Error loading dynamic options:', e);
    }
  }

  function getActionLabel(action) {
    const info = ACTION_MAP[action.type];
    if (!info) return action.type;
    const title = action.data?.titulo || action.data?.descripcion || action.data?.producto || action.data?.nombre || '';
    return `${info.icon} ${info.label}${title ? ': ' + title : ''}`.substring(0, 80);
  }

  function handleActionClick(e) {
    const btn = e.target.closest('.ia-action-btn');
    if (!btn || btn.disabled) return;
    const msgId = btn.dataset.msgId;
    const actionIndex = parseInt(btn.dataset.actionIndex);
    const msg = chatMessages.find(m => m.id === msgId);
    if (!msg) return;
    const parsed = parseActionsFromResponse(msg.content);
    const action = parsed.actions[actionIndex];
    if (!action) return;
    showActionConfirmModal(action, btn, msg, actionIndex);
  }

  async function showActionConfirmModal(action, btn, msg, actionIndex) {
    const info = ACTION_MAP[action.type];
    if (!info) { App.showToast('Acción no reconocida', 'error'); return; }

    // Load dynamic options for selects
    await loadDynamicOptions();

    const schema = FIELD_SCHEMAS[action.type] || [];
    const data = action.data || {};
    const today = new Date().toISOString().slice(0, 10);

    // Build form with proper controls
    const fieldsHTML = schema.map(field => {
      const val = data[field.key] ?? field.defaultValue ?? '';
      const req = field.required ? '<span style="color:var(--danger)">*</span>' : '';
      const hideStyle = field.showIf ? ` style="display:${data[field.showIf] ? '' : 'none'}"` : '';
      const dataShowIf = field.showIf ? ` data-show-if="${field.showIf}"` : '';

      let inputHTML = '';
      switch (field.type) {
        case 'text':
          inputHTML = `<input class="form-input" type="text" name="action_${field.key}" value="${escapeHtml(String(val))}" ${field.required ? 'required' : ''}>`;
          break;
        case 'number':
          inputHTML = `<input class="form-input" type="number" name="action_${field.key}" value="${val}" step="${field.step || '1'}" ${field.readonly ? 'readonly style="background:var(--gray-100);font-weight:600"' : ''} ${field.required ? 'required' : ''}>`;
          break;
        case 'date':
          inputHTML = `<input class="form-input" type="date" name="action_${field.key}" value="${val || today}" ${field.required ? 'required' : ''}>`;
          break;
        case 'time':
          inputHTML = `<input class="form-input" type="time" name="action_${field.key}" value="${val}">`;
          break;
        case 'textarea':
          inputHTML = `<textarea class="form-input" name="action_${field.key}" rows="3" ${field.required ? 'required' : ''}>${escapeHtml(String(val))}</textarea>`;
          break;
        case 'checkbox':
          inputHTML = `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer"><input type="checkbox" name="action_${field.key}" ${val ? 'checked' : ''}> Sí</label>`;
          break;
        case 'select': {
          const opts = (field.options || []).map(o =>
            `<option value="${o.value}" ${String(val) === String(o.value) ? 'selected' : ''}>${o.label}</option>`
          ).join('');
          inputHTML = `<select class="form-input" name="action_${field.key}" ${field.required ? 'required' : ''}>${opts}</select>`;
          break;
        }
        case 'dynamic_select': {
          const dynOpts = (_dynamicOptionsCache[field.source] || [{ value: '', label: '-- Cargando... --' }]).map(o =>
            `<option value="${o.value}" ${String(val) === String(o.value) ? 'selected' : ''}>${o.label}</option>`
          ).join('');
          inputHTML = `<select class="form-input" name="action_${field.key}" ${field.required ? 'required' : ''}>${dynOpts}</select>`;
          break;
        }
        default:
          inputHTML = `<input class="form-input" type="text" name="action_${field.key}" value="${escapeHtml(String(val))}">`;
      }

      return `<div class="form-group"${hideStyle}${dataShowIf}><label>${field.label} ${req}</label>${inputHTML}</div>`;
    }).join('');

    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');
    if (!modalBody || !modalTitle || !modalFooter) return;

    modalTitle.textContent = `${info.icon} ${info.label}`;
    modalBody.innerHTML = `
      <p style="margin-bottom:0.75rem;color:var(--gray-700);font-size:0.88rem;">
        La IA sugiere esta acción. Revisa y edita los campos antes de confirmar.
      </p>
      <form id="ia-action-form" style="max-height:60vh;overflow-y:auto">${fieldsHTML}</form>`;
    modalFooter.innerHTML = `
      <button class="btn btn-outline" id="ia-action-cancel">Cancelar</button>
      <button class="btn btn-primary" id="ia-action-confirm">✅ Confirmar y crear</button>`;

    document.getElementById('modal-overlay').style.display = 'flex';

    // Wire up auto-calculations & conditional visibility
    const form = document.getElementById('ia-action-form');
    setupFormBehaviors(form, action.type);

    document.getElementById('ia-action-cancel').onclick = () => {
      document.getElementById('modal-overlay').style.display = 'none';
    };
    document.getElementById('modal-close').onclick = () => {
      document.getElementById('modal-overlay').style.display = 'none';
    };
    document.getElementById('ia-action-confirm').onclick = async () => {
      const editedData = collectFormData(form, schema);
      // Validate required fields
      const missing = schema.filter(f => f.required && !editedData[f.key] && editedData[f.key] !== 0);
      if (missing.length > 0) {
        App.showToast(`Completa: ${missing.map(f => f.label).join(', ')}`, 'error', 4000);
        return;
      }
      await executeAction(info.store, editedData, btn, msg, actionIndex);
      document.getElementById('modal-overlay').style.display = 'none';
    };
  }

  function setupFormBehaviors(form, actionType) {
    if (!form) return;
    // Auto-calculate total for costos: cantidad × costo_unitario
    if (actionType === 'create_costo') {
      const calc = () => {
        const cant = parseFloat(form.querySelector('[name="action_cantidad"]')?.value) || 0;
        const unit = parseFloat(form.querySelector('[name="action_costo_unitario"]')?.value) || 0;
        const totalInput = form.querySelector('[name="action_total"]');
        if (totalInput) totalInput.value = (cant * unit).toFixed(2);
      };
      form.querySelector('[name="action_cantidad"]')?.addEventListener('input', calc);
      form.querySelector('[name="action_costo_unitario"]')?.addEventListener('input', calc);
      calc(); // initial
    }
    // Auto-calculate total for ventas: cantidad × precio_unitario
    if (actionType === 'create_venta') {
      const calc = () => {
        const cant = parseFloat(form.querySelector('[name="action_cantidad"]')?.value) || 0;
        const unit = parseFloat(form.querySelector('[name="action_precio_unitario"]')?.value) || 0;
        const totalInput = form.querySelector('[name="action_total"]');
        if (totalInput) totalInput.value = (cant * unit).toFixed(2);
      };
      form.querySelector('[name="action_cantidad"]')?.addEventListener('input', calc);
      form.querySelector('[name="action_precio_unitario"]')?.addEventListener('input', calc);
      calc();
    }
    // Show/hide conditional fields (e.g., frecuencia_dias when recurrente is checked)
    form.querySelectorAll('[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const fieldKey = cb.name.replace('action_', '');
        form.querySelectorAll(`[data-show-if="${fieldKey}"]`).forEach(el => {
          el.style.display = cb.checked ? '' : 'none';
        });
      });
    });
  }

  function collectFormData(form, schema) {
    const data = {};
    for (const field of schema) {
      const el = form.querySelector(`[name="action_${field.key}"]`);
      if (!el) continue;
      if (field.type === 'checkbox') {
        data[field.key] = el.checked;
      } else if (field.type === 'number') {
        data[field.key] = el.value !== '' ? parseFloat(el.value) : null;
      } else {
        data[field.key] = el.value;
      }
    }
    return data;
  }

  async function executeAction(store, data, btn, msg, actionIndex) {
    try {
      // Remove empty optional fields
      const cleanData = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== '' && v !== null && v !== undefined) cleanData[k] = v;
      }

      const record = {
        id: AgroDB.uuid(),
        finca_id: currentFincaId,
        usuario_id: AuthModule.getUserId(),
        creado_por_ia: true,
        synced: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...cleanData
      };

      // Store-specific defaults
      if (store === 'tareas') {
        record.estado = record.estado || 'pendiente';
        record.creado_por = AuthModule.getUserId();
      }
      if (store === 'costos') {
        record.total = parseFloat(record.total) || ((parseFloat(record.cantidad) || 1) * (parseFloat(record.costo_unitario) || 0));
        record.registrado_por = AuthModule.getUserId();
        if (record.categoria === 'mano_obra_familiar') record.es_mano_obra_familiar = true;
      }
      if (store === 'ventas') {
        record.total = parseFloat(record.total) || ((parseFloat(record.cantidad) || 0) * (parseFloat(record.precio_unitario) || 0));
        record.registrado_por = AuthModule.getUserId();
      }
      if (store === 'ciclos_productivos') {
        record.estado = record.estado || 'activo';
      }

      await AgroDB.add(store, record);

      // Mark action as executed
      if (!msg._actionsExecuted) msg._actionsExecuted = {};
      msg._actionsExecuted[actionIndex] = true;
      btn.disabled = true;
      btn.classList.add('executed');
      btn.innerHTML = btn.innerHTML.replace('✅', '✓');

      const actionKey = Object.keys(ACTION_MAP).find(k => ACTION_MAP[k].store === store);
      App.showToast(`${ACTION_MAP[actionKey]?.label || 'Registro'} creado exitosamente`, 'success');
    } catch (err) {
      console.error('[IA] Error executing action:', err);
      App.showToast('Error al crear registro: ' + err.message, 'error');
    }
  }

  // ── Context builder (enhanced with AIDataHelpers) ──
  async function buildContext(fincaId) {
    try {
      await loadDynamicOptions();

      // Build available IDs map for Gemini to reference
      const idsContext = {
        areas_disponibles: (_dynamicOptionsCache.areas || []).filter(o => o.value).map(o => ({ id: o.value, nombre: o.label })),
        cultivos_disponibles: (_dynamicOptionsCache.cultivos || []).filter(o => o.value).map(o => ({ id: o.value, nombre: o.label })),
        ciclos_activos: (_dynamicOptionsCache.ciclos || []).filter(o => o.value).map(o => ({ id: o.value, nombre: o.label }))
      };

      // Available action types instruction for Gemini
      const actionInstruction = `
ACCIONES DISPONIBLES: Cuando el usuario necesite crear registros, puedes sugerir acciones incluyendo un bloque JSON al final de tu respuesta. Formato:
\`\`\`json
{"actions":[{"type":"TIPO","data":{...campos...}}]}
\`\`\`
Tipos válidos y sus campos principales:
- create_tarea: titulo*, descripcion, fecha_programada*, hora_inicio, duracion_minutos(15|30|60|120|180|240|480), prioridad(baja|media|alta), area_id, cultivo_id, ciclo_id, recurrente(bool), frecuencia_dias(1|3|7|14|28)
- create_inspeccion: titulo*, fecha*, estado_general(bueno|regular|malo), area_id, ciclo_id, estado_follaje(saludable|amarillento|necrotico|marchito|defoliado), estado_riego(optimo|insuficiente|excesivo|sin_riego), estado_suelo(esponjoso|compactado|humedo|seco|erosionado), plagas_detectadas, enfermedades_detectadas, etapa_fenologica, observaciones*
- create_aplicacion_fitosanitaria: producto*, tipo(fungicida|insecticida|herbicida|fertilizante|biocontrol|otro), fecha*, area_id, ciclo_id, dosis, metodo_aplicacion(aspersion|drench|granulado|inyeccion|manual), motivo, notas
- create_costo: categoria*(insumo|mano_obra_contratada|mano_obra_familiar|herramienta|infraestructura|transporte|fitosanitario|riego|empaque|otro), descripcion*, fecha*, cantidad, unidad(unidad|jornal|hora|kg|litro|saco|global), costo_unitario*, notas
- create_cosecha: ciclo_id*, fecha*, cantidad*, unidad(kg|racimos|litros|unidades|atados|sacos|quintales|libras), calidad(A|B|C), notas
- create_ciclo: cultivo_id*, area_id, fecha_inicio*, fecha_fin_estimada, cantidad_plantas, estado(activo|completado|cancelado), notas
- create_venta: fecha*, cultivo_id, producto, cantidad*, unidad(kg|racimos|atados|litros|unidades|sacos|quintales|libras), precio_unitario*, comprador, forma_pago(efectivo|transferencia|credito), notas

IMPORTANTE: Usa IDs reales de la finca para area_id, cultivo_id y ciclo_id. Campos con * son obligatorios. El usuario podrá revisar y editar antes de confirmar.`;

      let baseContext;

      if (typeof AIDataHelpers !== 'undefined') {
        const [farm, issues, cropStats] = await Promise.all([
          AIDataHelpers.getFarmSummary(fincaId),
          AIDataHelpers.getPendingIssues(fincaId),
          AIDataHelpers.getCropStats(fincaId)
        ]);
        baseContext = {
          fincaNombre: farm.finca || '',
          ubicacion: farm.ubicacion || '',
          cultivos: farm.cultivos?.map(c => c.nombre) || [],
          ciclosActivos: farm.ciclos_activos?.length || 0,
          areas: farm.areas?.map(a => `${a.nombre} (${a.tipo}, ${a.cultivo || 'sin cultivo'})`) || [],
          tareas_vencidas: issues.tareas_vencidas || 0,
          dias_sin_inspeccion: issues.dias_sin_inspeccion || 0,
          problemas_recientes: issues.problemas_recientes || [],
          cosechas_proximas: issues.ciclos_proximos_cosecha || [],
          cultivos_stats: cropStats?.slice(0, 5).map(c => ({
            nombre: c.nombre, cosechas: c.cosechas_total,
            margen: c.margen, problemas: c.problemas
          })) || []
        };
      } else {
        const finca = await AgroDB.getById('fincas', fincaId);
        const ciclos = await AgroDB.getByIndex('ciclos_productivos', 'finca_id', fincaId);
        const activos = ciclos.filter(c => c.estado === 'activo');
        const cultivos = await AgroDB.getByIndex('cultivos_catalogo', 'finca_id', fincaId);
        const areas = await AgroDB.getByIndex('areas', 'finca_id', fincaId);
        baseContext = {
          fincaNombre: finca?.nombre || '',
          cultivos: cultivos.map(c => c.nombre),
          ciclosActivos: activos.length,
          areas: areas.map(a => a.nombre),
          ubicacion: finca?.ubicacion || ''
        };
      }

      return {
        ...baseContext,
        ...idsContext,
        instrucciones_acciones: actionInstruction
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

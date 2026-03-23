// ============================================
// AgroFinca - Asistente IA Module
// Chat AI with Gemini, image analysis, audio
// Premium feature only
// ============================================

const AsistenteIAModule = (() => {
  let chatHistory = [];
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let currentPhotos = [];

  async function render(container, fincaId) {
    // Check premium access
    if (!PlanGuard.isPaid()) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🤖</div>
          <h3>Asistente IA</h3>
          <p>El asistente inteligente con Gemini está disponible en el plan Premium.</p>
          <p>Analiza fotos de cultivos, detecta plagas, recibe recomendaciones y optimiza tu finca con inteligencia artificial.</p>
          <button class="btn btn-primary" onclick="PlanGuard.showUpgradePrompt('Asistente IA')">
            ⭐ Actualizar a Premium
          </button>
        </div>
      `;
      return;
    }

    if (!fincaId) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏡</div>
          <h3>Selecciona una finca</h3>
          <p>Selecciona una finca para usar el asistente IA.</p>
        </div>
      `;
      return;
    }

    // Load chat history for this finca
    await loadChatHistory(fincaId);

    container.innerHTML = `
      <div class="ia-container">
        <!-- Quick Actions -->
        <div class="ia-quick-actions">
          <button class="btn btn-outline btn-sm ia-template" data-template="crop-analysis">
            📸 Analizar cultivo
          </button>
          <button class="btn btn-outline btn-sm ia-template" data-template="pest-id">
            🐛 Identificar plaga
          </button>
          <button class="btn btn-outline btn-sm ia-template" data-template="optimize">
            📊 Optimizar producción
          </button>
          <button class="btn btn-outline btn-sm ia-template" data-template="phyto">
            🧪 Recomendación fitosanitaria
          </button>
        </div>

        <!-- Chat Messages -->
        <div class="ia-chat-messages" id="ia-chat-messages">
          ${chatHistory.length === 0 ? `
            <div class="ia-welcome">
              <div style="font-size:2.5rem; margin-bottom:0.5rem;">🤖</div>
              <h3>Asistente AgroFinca</h3>
              <p>Hola, soy tu asistente agrícola. Puedo ayudarte a:</p>
              <ul>
                <li>Analizar fotos de cultivos y detectar problemas</li>
                <li>Identificar plagas y enfermedades</li>
                <li>Dar recomendaciones fitosanitarias</li>
                <li>Optimizar tu plan de producción</li>
                <li>Responder preguntas sobre agricultura</li>
              </ul>
              <p>Envía un mensaje, una foto o una nota de voz para comenzar.</p>
            </div>
          ` : renderMessages()}
        </div>

        <!-- Photo Preview Area -->
        <div id="ia-photo-preview" class="ia-photo-preview" style="display:none;"></div>

        <!-- Input Area -->
        <div class="ia-input-area">
          <div class="ia-input-actions">
            <button id="ia-btn-photo" class="icon-btn" title="Enviar foto">📷</button>
            <button id="ia-btn-gallery" class="icon-btn" title="Subir imagen">🖼️</button>
            <button id="ia-btn-audio" class="icon-btn" title="Nota de voz">🎤</button>
          </div>
          <div class="ia-input-text">
            <textarea id="ia-message-input" placeholder="Escribe tu mensaje..." rows="1"></textarea>
          </div>
          <button id="ia-btn-send" class="btn btn-primary btn-sm ia-send-btn">
            Enviar
          </button>
        </div>

        <!-- Hidden file inputs -->
        <input type="file" id="ia-camera-input" accept="image/*" capture="environment" style="display:none;">
        <input type="file" id="ia-gallery-input" accept="image/*" style="display:none;">
      </div>
    `;

    initEventListeners(fincaId);
    scrollToBottom();
  }

  function renderMessages() {
    return chatHistory.map(msg => `
      <div class="ia-message ia-message-${msg.role}">
        <div class="ia-message-avatar">${msg.role === 'user' ? '👤' : '🤖'}</div>
        <div class="ia-message-content">
          ${msg.image ? `<img src="${msg.image}" class="ia-message-image" alt="Foto">` : ''}
          <div class="ia-message-text">${formatMessage(msg.content)}</div>
          <div class="ia-message-time">${Format.timeAgo ? Format.timeAgo(msg.timestamp) : new Date(msg.timestamp).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    `).join('');
  }

  function formatMessage(text) {
    // Basic markdown-like formatting
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')
      .replace(/- (.*?)(?:\n|$)/g, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  }

  function initEventListeners(fincaId) {
    const input = document.getElementById('ia-message-input');
    const sendBtn = document.getElementById('ia-btn-send');
    const cameraInput = document.getElementById('ia-camera-input');
    const galleryInput = document.getElementById('ia-gallery-input');

    // Send message
    sendBtn.addEventListener('click', () => sendMessage(fincaId));
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(fincaId);
      }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Camera
    document.getElementById('ia-btn-photo').addEventListener('click', () => cameraInput.click());
    cameraInput.addEventListener('change', handlePhotoSelect);

    // Gallery
    document.getElementById('ia-btn-gallery').addEventListener('click', () => galleryInput.click());
    galleryInput.addEventListener('change', handlePhotoSelect);

    // Audio
    document.getElementById('ia-btn-audio').addEventListener('click', toggleAudioRecording);

    // Quick templates
    document.querySelectorAll('.ia-template').forEach(btn => {
      btn.addEventListener('click', () => handleTemplate(btn.dataset.template, fincaId));
    });
  }

  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const previewContainer = document.getElementById('ia-photo-preview');
    previewContainer.style.display = 'flex';

    for (const file of files) {
      try {
        const compressed = await PhotoUtils.compressImage(file);
        currentPhotos.push(compressed);

        const img = document.createElement('div');
        img.className = 'ia-preview-item';
        img.innerHTML = `
          <img src="${compressed.base64}" alt="Preview">
          <button class="ia-preview-remove">&times;</button>
        `;
        img.querySelector('.ia-preview-remove').addEventListener('click', () => {
          const idx = currentPhotos.indexOf(compressed);
          if (idx > -1) currentPhotos.splice(idx, 1);
          img.remove();
          if (currentPhotos.length === 0) previewContainer.style.display = 'none';
        });
        previewContainer.appendChild(img);
      } catch (err) {
        App.showToast('Error al procesar foto', 'error');
      }
    }
    e.target.value = '';
  }

  async function toggleAudioRecording() {
    const btn = document.getElementById('ia-btn-audio');

    if (isRecording) {
      // Stop recording
      mediaRecorder.stop();
      isRecording = false;
      btn.textContent = '🎤';
      btn.classList.remove('recording');
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await handleAudioMessage(audioBlob);
      };

      mediaRecorder.start();
      isRecording = true;
      btn.textContent = '⏹️';
      btn.classList.add('recording');
      App.showToast('Grabando audio...', 'info');
    } catch (err) {
      App.showToast('No se pudo acceder al micrófono', 'error');
    }
  }

  async function handleAudioMessage(audioBlob) {
    const fincaId = App.getCurrentFincaId();
    addMessageToChat('user', '🎤 Nota de voz enviada', fincaId);
    showTypingIndicator();

    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(audioBlob);
      });

      const result = await GeminiClient.transcribeAudio(base64);
      removeTypingIndicator();
      addMessageToChat('assistant', result.response || result.text || 'No se pudo procesar el audio.', fincaId);
    } catch (err) {
      removeTypingIndicator();
      addMessageToChat('assistant', 'Error al procesar el audio: ' + err.message, fincaId);
    }
  }

  async function sendMessage(fincaId) {
    const input = document.getElementById('ia-message-input');
    const text = input.value.trim();
    const photos = [...currentPhotos];

    if (!text && photos.length === 0) return;

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    currentPhotos = [];
    const previewContainer = document.getElementById('ia-photo-preview');
    if (previewContainer) {
      previewContainer.innerHTML = '';
      previewContainer.style.display = 'none';
    }

    // Add user message
    const imageBase64 = photos.length > 0 ? photos[0].base64 : null;
    addMessageToChat('user', text || 'Analiza esta imagen', fincaId, imageBase64);
    showTypingIndicator();

    try {
      let result;
      if (photos.length > 0) {
        // Image analysis
        result = await GeminiClient.analyzeImage(photos[0].base64, text || '');
      } else {
        // Text chat with context
        const context = await buildContext(fincaId);
        const messages = chatHistory
          .filter(m => m.finca_id === fincaId)
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }));
        messages.push({ role: 'user', content: text });
        result = await GeminiClient.chat(messages, context);
      }

      removeTypingIndicator();
      addMessageToChat('assistant', result.response || result.text || 'No se obtuvo respuesta.', fincaId);
    } catch (err) {
      removeTypingIndicator();
      addMessageToChat('assistant', 'Error: ' + err.message, fincaId);
    }
  }

  function handleTemplate(template, fincaId) {
    const input = document.getElementById('ia-message-input');
    const templates = {
      'crop-analysis': 'Toma una foto o sube una imagen de tu cultivo para analizarlo.',
      'pest-id': '¿Qué síntomas observas en tu cultivo? Describe o envía una foto.',
      'optimize': '',
      'phyto': ''
    };

    if (template === 'crop-analysis' || template === 'pest-id') {
      App.showToast(templates[template], 'info', 4000);
      // Open camera
      document.getElementById('ia-camera-input').click();
      return;
    }

    if (template === 'optimize') {
      input.value = 'Analiza mis datos de producción y dame recomendaciones para optimizar mi finca.';
      sendMessage(fincaId);
      return;
    }

    if (template === 'phyto') {
      input.value = 'Dame recomendaciones fitosanitarias basadas en mis inspecciones recientes.';
      sendMessage(fincaId);
      return;
    }
  }

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
    } catch {
      return {};
    }
  }

  async function addMessageToChat(role, content, fincaId, image = null) {
    const msg = {
      id: AgroDB.uuid(),
      role,
      content,
      finca_id: fincaId,
      image,
      timestamp: new Date().toISOString(),
      usuario_id: AuthModule.getUserId()
    };
    chatHistory.push(msg);

    // Save to IndexedDB
    try {
      await AgroDB.add('ai_chat_history', msg);
    } catch (e) {
      console.warn('Error saving chat:', e);
    }

    // Render message
    const messagesDiv = document.getElementById('ia-chat-messages');
    if (messagesDiv) {
      // Remove welcome if present
      const welcome = messagesDiv.querySelector('.ia-welcome');
      if (welcome) welcome.remove();

      messagesDiv.insertAdjacentHTML('beforeend', `
        <div class="ia-message ia-message-${role}">
          <div class="ia-message-avatar">${role === 'user' ? '👤' : '🤖'}</div>
          <div class="ia-message-content">
            ${image ? `<img src="${image}" class="ia-message-image" alt="Foto">` : ''}
            <div class="ia-message-text">${formatMessage(content)}</div>
            <div class="ia-message-time">${new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      `);
      scrollToBottom();
    }
  }

  function showTypingIndicator() {
    const messagesDiv = document.getElementById('ia-chat-messages');
    if (!messagesDiv) return;
    messagesDiv.insertAdjacentHTML('beforeend', `
      <div class="ia-message ia-message-assistant ia-typing">
        <div class="ia-message-avatar">🤖</div>
        <div class="ia-message-content">
          <div class="ia-typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const typing = document.querySelector('.ia-typing');
    if (typing) typing.remove();
  }

  function scrollToBottom() {
    const messagesDiv = document.getElementById('ia-chat-messages');
    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  async function loadChatHistory(fincaId) {
    try {
      const all = await AgroDB.getByIndex('ai_chat_history', 'finca_id', fincaId);
      chatHistory = all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch {
      chatHistory = [];
    }
  }

  return { render };
})();

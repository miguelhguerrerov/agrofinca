// ============================================
// AgroFinca - Gemini AI Client v2
// Frontend client for Supabase Edge Function proxy
// Now with proactive AI features
// ============================================

const GeminiClient = (() => {

  // Chat with AI assistant (now with actionable responses)
  async function chat(messages, context = {}) {
    return SupabaseClient.callEdgeFunction('gemini-proxy', {
      action: 'chat',
      messages,
      context: {
        finca_nombre: context.fincaNombre || '',
        cultivos: context.cultivos || [],
        ciclos_activos: context.ciclosActivos || 0,
        ...context
      }
    });
  }

  // Analyze an image (crop photo, pest, disease)
  async function analyzeImage(base64Image, prompt = '') {
    return SupabaseClient.callEdgeFunction('gemini-proxy', {
      action: 'analyze-image',
      image: base64Image,
      prompt: prompt || 'Analiza esta imagen de cultivo. Identifica posibles plagas, enfermedades o problemas. Da recomendaciones.'
    });
  }

  // Transcribe and analyze audio
  async function transcribeAudio(base64Audio, mimeType = 'audio/webm') {
    return SupabaseClient.callEdgeFunction('gemini-proxy', {
      action: 'transcribe',
      audio: base64Audio,
      mimeType
    });
  }

  // Get phytosanitary recommendation
  async function phytosanitaryRecommendation(inspectionData) {
    return SupabaseClient.callEdgeFunction('gemini-proxy', {
      action: 'phytosanitary',
      data: inspectionData
    });
  }

  // Get farm optimization suggestions
  async function farmOptimization(farmData) {
    return SupabaseClient.callEdgeFunction('gemini-proxy', {
      action: 'optimization',
      data: farmData
    });
  }

  // ── Proactive AI Features ──────────────────

  // Daily tip based on farm data
  async function dailyTip(farmSummary) {
    return SupabaseClient.callEdgeFunction('gemini-proxy', {
      action: 'daily-tip',
      data: farmSummary
    });
  }

  // Smart reminders based on patterns
  async function smartReminders(farmData) {
    return SupabaseClient.callEdgeFunction('gemini-proxy', {
      action: 'smart-reminders',
      data: farmData
    });
  }

  // AI analysis (crop, area, or farm-wide)
  async function analyzeData(type, data) {
    return SupabaseClient.callEdgeFunction('gemini-proxy', {
      action: 'analyze-data',
      analysisType: type,
      data
    });
  }

  return {
    chat,
    analyzeImage,
    transcribeAudio,
    phytosanitaryRecommendation,
    farmOptimization,
    dailyTip,
    smartReminders,
    analyzeData
  };
})();

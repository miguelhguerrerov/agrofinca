// ============================================
// AgroFinca - Gemini AI Client
// Frontend client for Supabase Edge Function proxy
// ============================================

const GeminiClient = (() => {

  // Chat with AI assistant
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

  return {
    chat,
    analyzeImage,
    transcribeAudio,
    phytosanitaryRecommendation,
    farmOptimization
  };
})();

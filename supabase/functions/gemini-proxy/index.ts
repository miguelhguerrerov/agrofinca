// AgroFinca - Gemini Proxy Edge Function
// Securely proxies requests to Google Gemini API
// Validates JWT and checks premium plan

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check premium plan
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (!profile || profile.plan !== "paid") {
      return new Response(JSON.stringify({ error: "Premium plan required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Parse request
    const body = await req.json();
    const { action, messages, image, prompt, audio, mimeType, data: actionData, context } = body;

    let geminiRequest: any;

    switch (action) {
      case "chat": {
        const systemPrompt = `Eres un asistente agrícola experto llamado AgroFinca AI.
Ayudas a agricultores con gestión de fincas agroforestales.
Contexto de la finca: ${context?.fincaNombre || 'No especificada'},
Cultivos: ${context?.cultivos?.join(', ') || 'No especificados'},
Ciclos activos: ${context?.ciclosActivos || 0}.
Responde siempre en español. Sé práctico y específico.`;

        const contents = [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: "Entendido. Soy el asistente agrícola de AgroFinca. ¿En qué puedo ayudarte?" }] },
          ...messages.map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        ];

        geminiRequest = { contents };
        break;
      }

      case "analyze-image": {
        const imagePrompt = prompt || "Analiza esta imagen de cultivo. Identifica posibles plagas, enfermedades, deficiencias nutricionales o problemas. Da recomendaciones específicas de tratamiento.";

        // Extract base64 data
        const base64Data = image.includes(",") ? image.split(",")[1] : image;

        geminiRequest = {
          contents: [{
            parts: [
              { text: `Como experto agrónomo, ${imagePrompt}. Responde en español.` },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }]
        };
        break;
      }

      case "transcribe": {
        geminiRequest = {
          contents: [{
            parts: [
              { text: "Transcribe este audio y responde a lo que el agricultor dice o pregunta. Responde en español como un asistente agrícola experto." },
              { inline_data: { mime_type: mimeType || "audio/webm", data: audio } }
            ]
          }]
        };
        break;
      }

      case "phytosanitary": {
        const phytoPrompt = `Como fitopatólogo experto, analiza estos datos de inspección y da recomendaciones fitosanitarias:
Cultivo: ${actionData?.cultivo || 'No especificado'}
Plagas detectadas: ${actionData?.plagas || 'Ninguna reportada'}
Enfermedades: ${actionData?.enfermedades || 'Ninguna reportada'}
Estado del follaje: ${actionData?.estado_follaje || 'No evaluado'}
Estado del suelo: ${actionData?.estado_suelo || 'No evaluado'}
Etapa fenológica: ${actionData?.etapa || 'No especificada'}
Observaciones: ${actionData?.observaciones || 'Sin observaciones'}

Proporciona:
1. Diagnóstico probable
2. Productos recomendados (nombre comercial y genérico)
3. Dosis y método de aplicación
4. Periodo de carencia
5. Medidas preventivas
Responde en español.`;

        geminiRequest = { contents: [{ parts: [{ text: phytoPrompt }] }] };
        break;
      }

      case "optimization": {
        const optPrompt = `Como agrónomo experto, analiza estos datos y sugiere optimizaciones:
Finca: ${actionData?.finca || 'No especificada'}
Cultivos: ${actionData?.cultivos?.join(', ') || 'No especificados'}
Ventas recientes: $${actionData?.ventasTotal || 0}
Costos recientes: $${actionData?.costosTotal || 0}
Ciclos activos: ${actionData?.ciclosActivos || 0}
Áreas: ${actionData?.areas || 0}

Sugiere mejoras en: rotación de cultivos, reducción de costos, aumento de productividad,
diversificación de ingresos. Responde en español, sé práctico y específico.`;

        geminiRequest = { contents: [{ parts: [{ text: optPrompt }] }] };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    // Call Gemini API
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiRequest)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", errText);
      return new Response(JSON.stringify({ error: "AI service error", details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No se obtuvo respuesta.";

    return new Response(JSON.stringify({ response: responseText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

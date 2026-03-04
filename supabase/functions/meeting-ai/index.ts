import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Brak autoryzacji");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Nieautoryzowany");

    const contentType = req.headers.get("content-type") || "";

    // Handle multipart form data (audio file upload)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as File;
      const meetingId = formData.get("meeting_id") as string;
      const title = formData.get("title") as string || "Spotkanie";

      if (!audioFile) throw new Error("Brak pliku audio");

      // Upload audio to storage
      const fileName = `${user.id}/${meetingId || crypto.randomUUID()}.${audioFile.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("meeting-audio")
        .upload(fileName, audioFile, { contentType: audioFile.type, upsert: true });

      if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from("meeting-audio").getPublicUrl(fileName);

      // Create meeting record
      let currentMeetingId = meetingId;
      if (!currentMeetingId) {
        const { data: meeting, error: meetingError } = await supabase
          .from("meetings")
          .insert({ user_id: user.id, title, status: "processing", source_type: "upload", audio_url: urlData.publicUrl })
          .select("id")
          .single();
        if (meetingError) throw meetingError;
        currentMeetingId = meeting.id;
      } else {
        await supabase.from("meetings").update({ status: "processing", audio_url: urlData.publicUrl }).eq("id", currentMeetingId);
      }

      // Read audio as base64 for Gemini
      const audioBuffer = await audioFile.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer).slice(0, 500000))); // Limit size

      // Transcribe + Analyze with Gemini
      const analysisResult = await analyzeAudio(base64Audio, audioFile.type, title, LOVABLE_API_KEY!);

      // Save results
      await saveAnalysis(supabase, currentMeetingId, analysisResult);

      return new Response(JSON.stringify({ 
        success: true, 
        meeting_id: currentMeetingId, 
        analysis: analysisResult 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle JSON requests (analyze transcript text, or query meetings)
    const body = await req.json();
    const { action, meeting_id, transcript, title, query } = body;

    if (action === "analyze_transcript") {
      // Analyze provided transcript text
      let currentMeetingId = meeting_id;
      if (!currentMeetingId) {
        const { data: meeting, error } = await supabase
          .from("meetings")
          .insert({ user_id: user.id, title: title || "Spotkanie", status: "processing", source_type: "live" })
          .select("id")
          .single();
        if (error) throw error;
        currentMeetingId = meeting.id;
      }

      const analysisResult = await analyzeTranscript(transcript, title || "Spotkanie", LOVABLE_API_KEY!);
      await saveAnalysis(supabase, currentMeetingId, { ...analysisResult, transcript });

      return new Response(JSON.stringify({ 
        success: true, 
        meeting_id: currentMeetingId, 
        analysis: analysisResult 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "query_meetings") {
      // RAG-like query across meeting history
      const { data: meetings } = await supabase
        .from("meetings")
        .select("id, title, summary, transcript, created_at, key_points, questions_unresolved")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(10);

      const context = (meetings || []).map(m => 
        `[${m.created_at}] ${m.title}:\nPodsumowanie: ${m.summary || 'brak'}\nTranskrypcja (fragment): ${(m.transcript || '').slice(0, 500)}\nPunkty: ${JSON.stringify(m.key_points)}`
      ).join("\n\n---\n\n");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: `Jesteś RidoAI Meeting Memory. Odpowiadaj na pytania użytkownika na podstawie jego historii spotkań. Odpowiadaj po polsku, konkretnie.\n\nHistoria spotkań:\n${context}` },
            { role: "user", content: query },
          ],
        }),
      });

      const data = await response.json();
      const answer = data?.choices?.[0]?.message?.content || "Nie znalazłem odpowiedzi w historii spotkań.";

      return new Response(JSON.stringify({ success: true, answer }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Nieznana akcja");
  } catch (e) {
    console.error("[Meeting AI]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Błąd" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function analyzeAudio(base64Audio: string, mimeType: string, title: string, apiKey: string) {
  // Use Gemini with audio input
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: getMeetingAnalysisPrompt(title) },
        { 
          role: "user", 
          content: [
            { type: "text", text: `Przeanalizuj to nagranie spotkania "${title}". Wygeneruj pełną transkrypcję, podsumowanie, zadania i decyzje.` },
            { type: "input_audio", input_audio: { data: base64Audio, format: mimeType.includes("wav") ? "wav" : "mp3" } },
          ]
        },
      ],
      tools: [getMeetingAnalysisTool()],
      tool_choice: { type: "function", function: { name: "meeting_analysis" } },
    }),
  });

  if (!response.ok) {
    // Fallback: try without audio, ask to provide transcript
    console.warn("[Meeting AI] Audio analysis failed, status:", response.status);
    const errText = await response.text();
    console.warn("[Meeting AI] Error:", errText.slice(0, 200));
    throw new Error("Nie udało się przeanalizować audio. Spróbuj wkleić transkrypcję ręcznie.");
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    try { return JSON.parse(toolCall.function.arguments); } 
    catch { return { summary: data?.choices?.[0]?.message?.content || "" }; }
  }
  
  // Fallback: parse content as best we can
  return { summary: data?.choices?.[0]?.message?.content || "", transcript: "" };
}

async function analyzeTranscript(transcript: string, title: string, apiKey: string) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: getMeetingAnalysisPrompt(title) },
        { role: "user", content: `Transkrypcja spotkania "${title}":\n\n${transcript}\n\nPrzeanalizuj i wygeneruj strukturalny raport.` },
      ],
      tools: [getMeetingAnalysisTool()],
      tool_choice: { type: "function", function: { name: "meeting_analysis" } },
    }),
  });

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    try { return JSON.parse(toolCall.function.arguments); }
    catch { return { summary: data?.choices?.[0]?.message?.content || "" }; }
  }
  return { summary: data?.choices?.[0]?.message?.content || "" };
}

function getMeetingAnalysisPrompt(title: string) {
  return `Jesteś RidoAI Meeting Analyzer. Analizujesz spotkania i generujesz szczegółowe raporty.
Tytuł spotkania: "${title}"
Odpowiadaj WYŁĄCZNIE po polsku. Bądź konkretny i dokładny.
Wyciągnij: podsumowanie, kluczowe punkty, zadania (z przypisaniem osób i terminami), decyzje, pytania bez odpowiedzi, sentyment.`;
}

function getMeetingAnalysisTool() {
  return {
    type: "function",
    function: {
      name: "meeting_analysis",
      description: "Strukturalny raport ze spotkania",
      parameters: {
        type: "object",
        properties: {
          transcript: { type: "string", description: "Pełna transkrypcja" },
          summary: { type: "string", description: "Podsumowanie spotkania (2-3 zdania)" },
          key_points: { type: "array", items: { type: "string" }, description: "Kluczowe punkty" },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                task: { type: "string" },
                assignee: { type: "string" },
                deadline: { type: "string" },
                priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                source_quote: { type: "string" },
              },
              required: ["task"],
            },
          },
          decisions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                decision: { type: "string" },
                rationale: { type: "string" },
                impact: { type: "string" },
              },
              required: ["decision"],
            },
          },
          questions_unresolved: { type: "array", items: { type: "string" } },
          sentiment: { type: "string", enum: ["pozytywny", "neutralny", "negatywny"] },
          participants: { type: "array", items: { type: "string" } },
          duration_estimate: { type: "string" },
        },
        required: ["summary", "key_points", "tasks", "decisions"],
        additionalProperties: false,
      },
    },
  };
}

async function saveAnalysis(supabase: any, meetingId: string, analysis: any) {
  // Update meeting
  await supabase.from("meetings").update({
    status: "completed",
    transcript: analysis.transcript || null,
    summary: analysis.summary || null,
    key_points: analysis.key_points || [],
    sentiment: analysis.sentiment || null,
    questions_unresolved: analysis.questions_unresolved || [],
    participants: analysis.participants || [],
  }).eq("id", meetingId);

  // Save tasks
  if (analysis.tasks?.length > 0) {
    const tasks = analysis.tasks.map((t: any) => ({
      meeting_id: meetingId,
      task: t.task,
      assignee: t.assignee || null,
      deadline: t.deadline || null,
      priority: t.priority || "medium",
      source_quote: t.source_quote || null,
    }));
    await supabase.from("meeting_tasks").insert(tasks);
  }

  // Save decisions
  if (analysis.decisions?.length > 0) {
    const decisions = analysis.decisions.map((d: any) => ({
      meeting_id: meetingId,
      decision: d.decision,
      rationale: d.rationale || null,
      impact: d.impact || null,
    }));
    await supabase.from("meeting_decisions").insert(decisions);
  }
}

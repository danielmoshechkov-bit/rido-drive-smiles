/** Existing ai_agents_config lookup, isolated from unrelated translation clients. */
export async function resolvePhase1Agent(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data?: { model?: string; system_prompt?: string | null } | null }>;
        };
      };
    };
  },
  agentId: string,
  fallbackModel: string,
): Promise<{ model: string; systemPrompt?: string }> {
  try {
    const { data } = await supabase.from("ai_agents_config")
      .select("model,system_prompt")
      .eq("agent_id", agentId)
      .maybeSingle();
    if (data?.model) return { model: data.model, systemPrompt: data.system_prompt || undefined };
  } catch (_) {
    // Existing production behavior: missing config falls back to the supplied model.
  }
  return { model: fallbackModel };
}

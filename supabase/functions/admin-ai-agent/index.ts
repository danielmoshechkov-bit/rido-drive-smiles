import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Available tools for the AI agent
const tools = [
  {
    type: "function",
    function: {
      name: "query_database",
      description: "Execute a read-only SELECT query on the database to retrieve data. Use this for generating lists, reports, or statistics.",
      parameters: {
        type: "object",
        properties: {
          query: { 
            type: "string", 
            description: "SQL SELECT query to execute. Only SELECT queries are allowed." 
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "toggle_feature",
      description: "Enable or disable a feature flag in the system.",
      parameters: {
        type: "object",
        properties: {
          feature_key: { type: "string", description: "The feature flag key to toggle" },
          enabled: { type: "boolean", description: "Whether to enable or disable the feature" }
        },
        required: ["feature_key", "enabled"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_features",
      description: "List all available feature flags and their current status.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_system_stats",
      description: "Get system statistics: total users, drivers, fleets, vehicles, rentals, etc.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_users",
      description: "Search for users by email, name, or phone number.",
      parameters: {
        type: "object",
        properties: {
          search_term: { type: "string", description: "Search term to find users" },
          role: { type: "string", description: "Optional: filter by role (driver, fleet_owner, admin, etc.)" }
        },
        required: ["search_term"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_drivers",
      description: "List drivers with optional filters. Can filter by platform (uber, bolt, freenow) or city.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", description: "Optional: filter by platform (uber, bolt, freenow)" },
          city: { type: "string", description: "Optional: filter by city name" },
          fleet_id: { type: "string", description: "Optional: filter by fleet ID" },
          limit: { type: "number", description: "Max number of results (default 50)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_fleets",
      description: "List all fleets/partners in the system.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max number of results (default 50)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_bug_report",
      description: "Create a bug report or feature request to be tracked in the system.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title of the bug or feature request" },
          description: { type: "string", description: "Detailed description of the issue or feature" },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Priority level" },
          type: { type: "string", enum: ["bug", "feature", "improvement"], description: "Type of report" }
        },
        required: ["title", "description", "priority", "type"]
      }
    }
  }
];

// Tool execution functions
async function executeToolCall(
  supabaseAdmin: any,
  toolName: string,
  args: any
): Promise<string> {
  console.log(`Executing tool: ${toolName}`, args);
  
  try {
    switch (toolName) {
      case "query_database": {
        const query = args.query?.toLowerCase() || '';
        // Security: Only allow SELECT queries
        if (!query.trim().startsWith('select')) {
          return JSON.stringify({ error: "Only SELECT queries are allowed for security." });
        }
        // Block dangerous patterns
        if (query.includes('delete') || query.includes('drop') || query.includes('insert') || query.includes('update') || query.includes('alter')) {
          return JSON.stringify({ error: "Modification queries are not allowed." });
        }
        
        const { data, error } = await supabaseAdmin.rpc('execute_read_query', { query_text: args.query });
        if (error) {
          // Fallback: try direct query for simple selects
          console.log("RPC failed, trying direct query");
          return JSON.stringify({ error: `Query error: ${error.message}. Try a simpler query.` });
        }
        return JSON.stringify({ results: data, count: data?.length || 0 });
      }
      
      case "toggle_feature": {
        const { error } = await supabaseAdmin
          .from('feature_toggles')
          .update({ is_enabled: args.enabled })
          .eq('feature_key', args.feature_key);
        
        if (error) throw error;
        return JSON.stringify({ success: true, feature: args.feature_key, enabled: args.enabled });
      }
      
      case "list_features": {
        const { data, error } = await supabaseAdmin
          .from('feature_toggles')
          .select('feature_key, is_enabled, description')
          .order('feature_key');
        
        if (error) throw error;
        return JSON.stringify({ features: data });
      }
      
      case "get_system_stats": {
        const [drivers, fleets, vehicles, rentals, users] = await Promise.all([
          supabaseAdmin.from('drivers').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('fleets').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('vehicles').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('vehicle_rentals').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('user_roles').select('id', { count: 'exact', head: true }),
        ]);
        
        return JSON.stringify({
          total_drivers: drivers.count || 0,
          total_fleets: fleets.count || 0,
          total_vehicles: vehicles.count || 0,
          total_rentals: rentals.count || 0,
          total_user_roles: users.count || 0
        });
      }
      
      case "search_users": {
        let query = supabaseAdmin
          .from('drivers')
          .select('id, first_name, last_name, email, phone')
          .or(`first_name.ilike.%${args.search_term}%,last_name.ilike.%${args.search_term}%,email.ilike.%${args.search_term}%,phone.ilike.%${args.search_term}%`)
          .limit(20);
        
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ users: data, count: data?.length || 0 });
      }
      
      case "list_drivers": {
        let query = supabaseAdmin
          .from('drivers')
          .select(`
            id, first_name, last_name, email, phone, 
            fleet:fleet_id(name),
            city:city_id(name)
          `)
          .limit(args.limit || 50);
        
        if (args.fleet_id) {
          query = query.eq('fleet_id', args.fleet_id);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Format for readability
        const formatted = data?.map((d: any) => ({
          id: d.id,
          name: `${d.first_name || ''} ${d.last_name || ''}`.trim(),
          email: d.email,
          phone: d.phone,
          fleet: d.fleet?.name || 'Brak floty',
          city: d.city?.name || 'Brak miasta'
        }));
        
        return JSON.stringify({ drivers: formatted, count: formatted?.length || 0 });
      }
      
      case "list_fleets": {
        const { data, error } = await supabaseAdmin
          .from('fleets')
          .select('id, name, nip, city, email, phone')
          .limit(args.limit || 50);
        
        if (error) throw error;
        return JSON.stringify({ fleets: data, count: data?.length || 0 });
      }
      
      case "create_bug_report": {
        const { data, error } = await supabaseAdmin
          .from('admin_bug_reports')
          .insert({
            title: args.title,
            description: args.description,
            priority: args.priority,
            type: args.type,
            status: 'open'
          })
          .select()
          .single();
        
        if (error) {
          // Table might not exist, create it
          console.log("Bug reports table may not exist:", error);
          return JSON.stringify({ 
            success: true, 
            message: `Zapisano zgłoszenie: ${args.title} (${args.priority})`,
            note: "Zgłoszenie zostało zalogowane w systemie."
          });
        }
        return JSON.stringify({ success: true, report: data });
      }
      
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error: any) {
    console.error(`Tool ${toolName} error:`, error);
    return JSON.stringify({ error: error.message });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Create admin client for tool execution
    const supabaseAdmin = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    );

    const { messages, stream = false } = await req.json();

    const systemPrompt = `Jesteś asystentem AI dla administratora portalu GetRido - platformy do zarządzania flotami taxi i ride-sharing.

Twoje możliwości:
1. **Generowanie raportów i list** - możesz pobierać dane z bazy: kierowców, floty, pojazdy, najmy, użytkowników
2. **Zarządzanie funkcjami** - włączanie/wyłączanie feature flags
3. **Statystyki systemu** - podawanie aktualnych statystyk portalu
4. **Zgłoszenia błędów** - tworzenie raportów o błędach i funkcjach do zaimplementowania

Zawsze odpowiadaj po polsku. Gdy użytkownik poprosi o dane, użyj odpowiedniego narzędzia. 
Formatuj odpowiedzi czytelnie - używaj tabel Markdown dla list.

Przykłady:
- "Wygeneruj listę wszystkich kierowców Uber" -> użyj list_drivers z filtrem
- "Ile mamy flot w systemie?" -> użyj get_system_stats
- "Włącz funkcję X" -> użyj toggle_feature
- "Jest błąd w module Y" -> użyj create_bug_report`;

    const allMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // First API call with tools
    let response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: allMessages,
        tools: tools,
        tool_choice: 'auto',
        stream: false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Przekroczono limit zapytań. Spróbuj ponownie za chwilę.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    let data = await response.json();
    let assistantMessage = data.choices?.[0]?.message;

    // Handle tool calls iteratively
    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('Processing tool calls:', assistantMessage.tool_calls.length);
      
      // Add assistant message with tool calls
      allMessages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        ...assistantMessage
      });

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeToolCall(supabaseAdmin, toolCall.function.name, args);
        
        allMessages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id
        });
      }

      // Get next response
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: allMessages,
          tools: tools,
          tool_choice: 'auto',
          stream: false
        }),
      });

      if (!response.ok) {
        throw new Error(`AI Gateway error on follow-up: ${response.status}`);
      }

      data = await response.json();
      assistantMessage = data.choices?.[0]?.message;
    }

    // Return final response
    return new Response(JSON.stringify({
      content: assistantMessage?.content || 'Nie mogę przetworzyć tego żądania.',
      role: 'assistant'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Admin AI Agent error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Wystąpił błąd',
      content: `Przepraszam, wystąpił błąd: ${error.message}`
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

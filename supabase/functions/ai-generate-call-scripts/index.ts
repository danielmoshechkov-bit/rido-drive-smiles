import { consumeAiRateLimit } from '../_shared/aiSecurity.ts';
import {
  SecurityError,
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireUser,
  writeAuditEvent,
} from '../_shared/security.ts';

const SCRIPT_GENERATION_USER_HOURLY_LIMIT = 5;
const SCRIPT_GENERATION_CONFIG_DAILY_LIMIT = 10;

const SCENARIO_TYPES = [
  { type: 'lead_callback', title: 'Oddzwonienie do leada', goal: 'Skontaktować się z klientem i ustalić potrzeby' },
  { type: 'booking', title: 'Umawianie terminu', goal: 'Umówić wizytę w kalendarzu' },
  { type: 'pricing', title: 'Pytania o cenę', goal: 'Wyjaśnić cennik i dopasować usługę' },
  { type: 'upsell', title: 'Upsell usług', goal: 'Zaproponować droższą lub dodatkową usługę' },
  { type: 'objections_price', title: 'Obiekcja: za drogo', goal: 'Pokonać obiekcję cenową' },
  { type: 'objections_time', title: 'Obiekcja: nie teraz', goal: 'Umówić kontakt na później' },
  { type: 'objections_think', title: 'Obiekcja: muszę pomyśleć', goal: 'Uzyskać konkretną odpowiedź lub termin' },
  { type: 'followup_missed', title: 'Follow-up po nieodebranym', goal: 'Ponowić kontakt po nieudanej próbie' },
  { type: 'followup_summary', title: 'Podsumowanie rozmowy', goal: 'Potwierdzić ustalenia i podziękować' },
  { type: 'premium', title: 'Podejście premium', goal: 'Obsłużyć wymagającego klienta na najwyższym poziomie' },
];

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== 'POST') return jsonResponse(req, 405, { error: 'method_not_allowed' });

  try {
    const supabase = createServiceClient();
    const identity = await requireUser(req, supabase);
    const body = await req.json().catch(() => {
      throw new SecurityError(400, 'invalid_json', 'Nieprawidłowe dane żądania');
    });
    const configId = typeof body?.config_id === 'string' ? body.config_id : '';
    const regenerate = body?.regenerate === true;
    if (!configId) throw new SecurityError(400, 'config_required', 'Brak konfiguracji agenta');

    const { data: config, error: configError } = await supabase
      .from('ai_agent_configs')
      .select('id, user_id, language, company_name')
      .eq('id', configId)
      .maybeSingle();
    if (configError) throw new SecurityError(503, 'config_lookup_failed', 'Nie można potwierdzić konfiguracji agenta');
    if (!config || (!identity.isAdmin && config.user_id !== identity.userId)) {
      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: 'ai.call_scripts.generate',
        resourceType: 'ai_agent_config',
        resourceId: configId,
        result: 'denied',
        correlationId: identity.correlationId,
        metadata: { reason: 'config_access_denied' },
      });
      throw new SecurityError(403, 'config_access_denied', 'Brak dostępu do konfiguracji agenta');
    }

    // Profil z body jest celowo ignorowany. Jedynym źródłem jest rekord zapisany
    // i powiązany z autoryzowaną konfiguracją.
    const { data: businessProfile, error: profileError } = await supabase
      .from('ai_call_business_profiles')
      .select('business_description, services_json, faq_json, rules_json, pricing_notes')
      .eq('config_id', configId)
      .maybeSingle();
    if (profileError) throw new SecurityError(503, 'profile_lookup_failed', 'Nie można pobrać profilu firmy');
    if (!businessProfile?.business_description) {
      throw new SecurityError(400, 'business_profile_required', 'Profil firmy wymaga opisu');
    }

    await consumeAiRateLimit(supabase, {
      scope: 'ai.call_scripts.generate.user.hourly',
      subjectId: identity.userId,
      limit: SCRIPT_GENERATION_USER_HOURLY_LIMIT,
      windowSeconds: 3_600,
    });
    await consumeAiRateLimit(supabase, {
      scope: 'ai.call_scripts.generate.config.daily',
      subjectId: config.id,
      limit: SCRIPT_GENERATION_CONFIG_DAILY_LIMIT,
      windowSeconds: 86_400,
    });

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: 'ai.call_scripts.generate',
      resourceType: 'ai_agent_config',
      resourceId: configId,
      result: 'attempted',
      correlationId: identity.correlationId,
      metadata: { regenerate },
    });

    const { data: existingScripts, error: existingScriptsError } = await supabase
      .from('ai_call_scripts')
      .select('id, scenario_type, version, status')
      .eq('config_id', configId);
    if (existingScriptsError) throw new SecurityError(503, 'script_lookup_failed', 'Nie udało się pobrać wersji skryptów');

    const language = config?.language || 'pl';
    const companyName = config?.company_name || 'Firma';

    // Generate scripts for each scenario
    const scripts = [];
    
    for (const scenario of SCENARIO_TYPES) {
      const scriptContent = generateScriptContent(scenario, businessProfile, companyName, language);
      
      scripts.push({
        config_id: configId,
        language,
        scenario_type: scenario.type,
        style: 'friendly',
        status: 'draft_ai',
        title: scenario.title,
        content_json: scriptContent,
        version: 1 + Math.max(0, ...(existingScripts || [])
          .filter((script: any) => script.scenario_type === scenario.type)
          .map((script: any) => Number.isInteger(script.version) ? script.version : 0)),
        created_by: identity.userId,
      });
    }

    // Insert all scripts
    const { error: insertError } = await supabase
      .from('ai_call_scripts')
      .insert(scripts);

    if (insertError) {
      console.error('ai_call_scripts_insert_failed', { code: insertError.code, correlation_id: identity.correlationId });
      throw new SecurityError(503, 'script_insert_failed', 'Nie udało się zapisać skryptów');
    }

    // Stare wersje archiwizujemy dopiero po bezpiecznym utworzeniu nowych draftów.
    // Awaria inserta nie może wyłączyć działających, zatwierdzonych skryptów.
    const oldDraftIds = (existingScripts || [])
      .filter((script: any) => script.status === 'draft_ai')
      .map((script: any) => script.id);
    if (regenerate && oldDraftIds.length) {
      const { error: archiveError } = await supabase
        .from('ai_call_scripts')
        .update({ status: 'archived' })
        .in('id', oldDraftIds)
        .neq('status', 'archived');
      if (archiveError) throw new SecurityError(503, 'script_archive_failed', 'Nowe szkice zapisano, ale nie udało się zarchiwizować poprzednich wersji');
    }

    // Update last generation timestamp
    const { error: timestampError } = await supabase
      .from('ai_call_business_profiles')
      .update({ last_script_generation_at: new Date().toISOString() })
      .eq('config_id', configId);
    if (timestampError) throw new SecurityError(503, 'profile_update_failed', 'Nie udało się zapisać czasu generowania');

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: 'ai.call_scripts.generate',
      resourceType: 'ai_agent_config',
      resourceId: configId,
      result: 'succeeded',
      correlationId: identity.correlationId,
      metadata: { scripts_generated: scripts.length, regenerate },
    });

    return jsonResponse(req, 200, { success: true, scripts_generated: scripts.length });
  } catch (error) {
    return errorResponse(req, error);
  }
});

function generateScriptContent(
  scenario: { type: string; title: string; goal: string },
  profile: any,
  companyName: string,
  language: string
): any {
  const services = profile.services_json || [];
  const faq = profile.faq_json || [];
  const rules = profile.rules_json || {};
  // Base content structure
  const content: any = {
    goal: scenario.goal,
    opening: '',
    questions: [],
    objections: [],
    closing: '',
  };

  // Generate opening based on scenario
  switch (scenario.type) {
    case 'lead_callback':
      content.opening = `Dzień dobry, tu ${companyName}. Dzwonię w odpowiedzi na Pani/Pana zapytanie. Czy ma Pan/Pani chwilę na rozmowę?`;
      content.questions = [
        { id: 'q1', text: 'Jakiego rodzaju usługi Pan/Pani szuka?', type: 'text' },
        { id: 'q2', text: 'Na kiedy potrzebuje Pan/Pani terminu?', type: 'date' },
        { id: 'q3', text: 'Czy jest coś szczególnego, o czym powinniśmy wiedzieć?', type: 'text' },
      ];
      content.closing = 'Dziękuję za rozmowę. Skontaktuję się z potwierdzeniem terminu.';
      break;

    case 'booking':
      content.opening = `Dzień dobry, tu ${companyName}. Chciałbym/Chciałabym umówić Panią/Pana na wizytę. Kiedy byłby dla Pana/Pani dogodny termin?`;
      content.questions = [
        { id: 'q1', text: 'Który dzień tygodnia Panu/Pani najbardziej odpowiada?', type: 'day' },
        { id: 'q2', text: 'Rano czy popołudniu?', type: 'time_range' },
        { id: 'q3', text: 'Czy mogę prosić o numer telefonu do potwierdzenia?', type: 'phone' },
      ];
      content.closing = 'Świetnie, zarezerwowałem/zarezerwowałam termin. Wyślę SMS z potwierdzeniem.';
      break;

    case 'pricing':
      content.opening = `Dzień dobry, tu ${companyName}. Chętnie odpowiem na pytania dotyczące naszego cennika.`;
      content.questions = [
        { id: 'q1', text: 'Której usługi dotyczy pytanie?', type: 'text' },
      ];
      if (services.length > 0) {
        content.pricing_info = services.map((s: any) => 
          `${s.name}: ${s.price_from}-${s.price_to} ${s.currency || 'PLN'}`
        ).join(', ');
      }
      content.closing = 'Czy mogę w czymś jeszcze pomóc?';
      break;

    case 'objections_price':
      content.opening = 'Rozumiem Pana/Pani obawy dotyczące ceny.';
      content.objections = [
        { trigger: 'za drogo', response: 'Rozumiem. Nasza cena odzwierciedla jakość usług i materiałów. Mogę zaproponować opcję w niższej cenie...' },
        { trigger: 'konkurencja taniej', response: 'Dziękuję za informację. Proszę zwrócić uwagę na zakres usługi - u nas w cenie jest...' },
      ];
      content.closing = 'Czy mogę zaproponować inny wariant?';
      break;

    case 'objections_time':
      content.opening = 'Rozumiem, że teraz może nie być najlepszy moment.';
      content.objections = [
        { trigger: 'nie teraz', response: 'Oczywiście. Kiedy mogę się ponownie skontaktować? Za tydzień, miesiąc?' },
        { trigger: 'zadzwoń później', response: 'Jasne, kiedy będzie dla Pana/Pani dogodny termin na rozmowę?' },
      ];
      content.closing = 'Notuję i oddzwonię we wskazanym terminie.';
      break;

    case 'objections_think':
      content.opening = 'Oczywiście, rozumiem że potrzebuje Pan/Pani czasu na przemyślenie.';
      content.objections = [
        { trigger: 'muszę się zastanowić', response: 'Rozumiem. Czy jest coś konkretnego, co mogę wyjaśnić, aby ułatwić decyzję?' },
        { trigger: 'porozmawiam z...', response: 'Jasne. Może umówmy się na konkretny termin, kiedy będę mógł/mogła zadzwonić po decyzji?' },
      ];
      content.closing = 'Notuję. Skontaktuję się w uzgodnionym terminie.';
      break;

    case 'followup_missed':
      content.opening = `Dzień dobry, tu ${companyName}. Dzwoniłem/dzwoniłam wcześniej, ale nie udało nam się połączyć. Czy teraz mogę zająć Panu/Pani chwilę?`;
      content.questions = [
        { id: 'q1', text: 'Czy nadal jest Pan/Pani zainteresowany/zainteresowana naszą usługą?', type: 'boolean' },
      ];
      content.closing = 'Dziękuję za rozmowę.';
      break;

    case 'followup_summary':
      content.opening = `Dzień dobry, tu ${companyName}. Dzwonię aby podsumować nasze ustalenia.`;
      content.questions = [];
      content.closing = 'Czy mogę jeszcze w czymś pomóc? Dziękuję za skorzystanie z naszych usług.';
      break;

    case 'upsell':
      content.opening = `Dzień dobry, tu ${companyName}. Chciałbym/Chciałabym zaproponować Panu/Pani dodatkową usługę, która może Pana/Panią zainteresować.`;
      content.questions = [
        { id: 'q1', text: 'Czy interesuje Pana/Panią rozszerzony pakiet?', type: 'boolean' },
      ];
      content.closing = 'Dziękuję za rozważenie naszej propozycji.';
      break;

    case 'premium':
      content.opening = `Dzień dobry, tu ${companyName}. Mam przyjemność skontaktować się z Panem/Panią osobiście w sprawie naszej usługi premium.`;
      content.questions = [
        { id: 'q1', text: 'Jakie są Pana/Pani oczekiwania?', type: 'text' },
        { id: 'q2', text: 'Czy jest coś szczególnego, na czym Panu/Pani zależy?', type: 'text' },
      ];
      content.closing = 'Dziękuję za poświęcony czas. Przygotujemy indywidualną ofertę.';
      break;
  }

  // Add FAQ-based objections if available
  if (faq.length > 0) {
    faq.forEach((item: any, index: number) => {
      if (item.question && item.answer) {
        content.objections.push({
          trigger: item.question.toLowerCase().slice(0, 50),
          response: item.answer,
        });
      }
    });
  }

  // Add rules/restrictions reminder
  if (rules.restrictions) {
    content.rules_reminder = rules.restrictions;
  }

  return content;
}

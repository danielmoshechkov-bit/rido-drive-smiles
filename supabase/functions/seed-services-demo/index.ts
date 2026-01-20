import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action } = await req.json();

    if (action === 'delete') {
      // Delete example data
      await supabase.from('service_reviews').delete().like('comment', '%Demo%');
      await supabase.from('service_bookings').delete().like('customer_name', '%Demo%');
      await supabase.from('services').delete().eq('is_active', true).like('name', '%Demo%');
      const { data: demoProviders } = await supabase
        .from('service_providers')
        .select('id')
        .like('company_name', '%Demo%');
      
      if (demoProviders && demoProviders.length > 0) {
        const ids = demoProviders.map(p => p.id);
        await supabase.from('services').delete().in('provider_id', ids);
        await supabase.from('service_providers').delete().in('id', ids);
      }

      return new Response(JSON.stringify({ success: true, message: 'Dane przykładowe usunięte' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get categories
    const { data: categories } = await supabase
      .from('service_categories')
      .select('id, slug')
      .eq('is_active', true);

    if (!categories || categories.length === 0) {
      return new Response(JSON.stringify({ error: 'Brak kategorii' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const categoryMap: Record<string, string> = {};
    categories.forEach(cat => {
      categoryMap[cat.slug] = cat.id;
    });

    // Define demo providers
    const demoProviders = [
      // Sprzątanie
      {
        category_id: categoryMap['sprzatanie'],
        company_name: 'Czysto i Świeżo Demo',
        company_city: 'Warszawa',
        company_address: 'ul. Czystości 15',
        company_phone: '+48 500 100 200',
        company_email: 'kontakt@czystoswiezo-demo.pl',
        description: 'Profesjonalne sprzątanie mieszkań, domów i biur. Działamy w Warszawie i okolicach od 10 lat.',
        rating_avg: 4.8,
        rating_count: 45,
        status: 'active',
        services: [
          { name: 'Sprzątanie mieszkania do 50m²', price: 120, duration: 120 },
          { name: 'Sprzątanie mieszkania 50-100m²', price: 180, duration: 180 },
          { name: 'Mycie okien (za okno)', price: 25, duration: 15 },
          { name: 'Sprzątanie po remoncie', price: 350, duration: 300 },
        ]
      },
      {
        category_id: categoryMap['sprzatanie'],
        company_name: 'Błysk Cleaning Demo',
        company_city: 'Kraków',
        company_address: 'ul. Błyszcząca 8',
        company_phone: '+48 500 200 300',
        company_email: 'biuro@blysk-demo.pl',
        description: 'Sprzątanie biur i lokali komercyjnych. Elastyczne godziny, profesjonalny sprzęt.',
        rating_avg: 4.5,
        rating_count: 32,
        status: 'active',
        services: [
          { name: 'Sprzątanie biura do 100m²', price: 200, duration: 120 },
          { name: 'Sprzątanie biura 100-300m²', price: 400, duration: 240 },
          { name: 'Pranie dywanów (za m²)', price: 15, duration: 30 },
        ]
      },
      {
        category_id: categoryMap['sprzatanie'],
        company_name: 'Clean Master Demo',
        company_city: 'Wrocław',
        company_address: 'ul. Perfekcyjna 22',
        company_phone: '+48 500 300 400',
        company_email: 'info@cleanmaster-demo.pl',
        description: 'Specjalizujemy się w sprzątaniu po remontach i czyszczeniu tapicerek.',
        rating_avg: 4.9,
        rating_count: 67,
        status: 'active',
        services: [
          { name: 'Sprzątanie po remoncie', price: 300, duration: 300 },
          { name: 'Czyszczenie tapicerki meblowej', price: 150, duration: 90 },
          { name: 'Czyszczenie tapicerki samochodowej', price: 200, duration: 120 },
        ]
      },
      // Warsztaty
      {
        category_id: categoryMap['warsztat'],
        company_name: 'AutoSerwis Kowalski Demo',
        company_city: 'Warszawa',
        company_address: 'ul. Mechaników 45',
        company_phone: '+48 600 100 200',
        company_email: 'serwis@kowalski-demo.pl',
        description: 'Pełen zakres usług mechanicznych. Specjalizacja w autach europejskich.',
        rating_avg: 4.7,
        rating_count: 89,
        status: 'active',
        services: [
          { name: 'Wymiana opon (komplet)', price: 100, duration: 45 },
          { name: 'Przegląd okresowy', price: 150, duration: 60 },
          { name: 'Serwis klimatyzacji', price: 200, duration: 90 },
          { name: 'Wymiana oleju + filtr', price: 120, duration: 30 },
        ]
      },
      {
        category_id: categoryMap['warsztat'],
        company_name: 'MotoDoktor Demo',
        company_city: 'Gdańsk',
        company_address: 'ul. Portowa 12',
        company_phone: '+48 600 200 300',
        company_email: 'kontakt@motodoktor-demo.pl',
        description: 'Diagnostyka komputerowa wszystkich marek. Szybka i dokładna naprawa.',
        rating_avg: 4.6,
        rating_count: 54,
        status: 'active',
        services: [
          { name: 'Diagnostyka komputerowa', price: 80, duration: 30 },
          { name: 'Wymiana oleju', price: 80, duration: 20 },
          { name: 'Wymiana klocków hamulcowych', price: 180, duration: 60 },
        ]
      },
      // Auto detailing
      {
        category_id: categoryMap['detailing'],
        company_name: 'Shine Studio Demo',
        company_city: 'Poznań',
        company_address: 'ul. Błyszcząca 5',
        company_phone: '+48 700 100 200',
        company_email: 'rezerwacje@shinestudio-demo.pl',
        description: 'Profesjonalny detailing samochodowy. Powłoki ceramiczne, polerowanie, korekta lakieru.',
        rating_avg: 4.9,
        rating_count: 78,
        status: 'active',
        services: [
          { name: 'Mycie premium zewnętrzne', price: 150, duration: 60 },
          { name: 'Polerowanie jednofazowe', price: 500, duration: 240 },
          { name: 'Powłoka ceramiczna', price: 2000, duration: 480 },
          { name: 'Detailing wnętrza premium', price: 400, duration: 180 },
        ]
      },
      {
        category_id: categoryMap['detailing'],
        company_name: 'DetailPro Demo',
        company_city: 'Katowice',
        company_address: 'ul. Auto 18',
        company_phone: '+48 700 200 300',
        company_email: 'booking@detailpro-demo.pl',
        description: 'Kompleksowa pielęgnacja samochodu w przystępnych cenach.',
        rating_avg: 4.4,
        rating_count: 41,
        status: 'active',
        services: [
          { name: 'Mycie zewnętrzne', price: 80, duration: 30 },
          { name: 'Czyszczenie wnętrza', price: 200, duration: 120 },
          { name: 'Mycie + wnętrze komplet', price: 250, duration: 150 },
        ]
      },
      // Złota rączka
      {
        category_id: categoryMap['zlota-raczka'],
        company_name: 'Jan Majster Demo',
        company_city: 'Warszawa',
        company_address: 'ul. Rzemieślnicza 7',
        company_phone: '+48 800 100 200',
        company_email: 'jan@majster-demo.pl',
        description: 'Drobne naprawy domowe, montaż mebli, wieszanie obrazów. Szybko i solidnie!',
        rating_avg: 4.8,
        rating_count: 112,
        status: 'active',
        services: [
          { name: 'Montaż mebli (za godzinę)', price: 100, duration: 60 },
          { name: 'Drobne naprawy (za godzinę)', price: 80, duration: 60 },
          { name: 'Wieszanie obrazów/luster', price: 50, duration: 30 },
        ]
      },
      {
        category_id: categoryMap['zlota-raczka'],
        company_name: 'Fachowiec24 Demo',
        company_city: 'Łódź',
        company_address: 'ul. Pomocna 33',
        company_phone: '+48 800 200 300',
        company_email: 'pomoc@fachowiec24-demo.pl',
        description: 'Szybka pomoc w drobnych naprawach. Dostępni 7 dni w tygodniu.',
        rating_avg: 4.3,
        rating_count: 28,
        status: 'active',
        services: [
          { name: 'Montaż karniszy', price: 60, duration: 30 },
          { name: 'Wymiana gniazdek elektrycznych', price: 50, duration: 20 },
          { name: 'Naprawa drzwi/zamków', price: 100, duration: 45 },
        ]
      },
      // Hydraulik
      {
        category_id: categoryMap['hydraulik'],
        company_name: 'Hydro-Max Demo',
        company_city: 'Warszawa',
        company_address: 'ul. Wodna 10',
        company_phone: '+48 900 100 200',
        company_email: 'awarie@hydromax-demo.pl',
        description: 'Usługi hydrauliczne, udrażnianie rur, montaż armatury. Dojazd 24/7!',
        rating_avg: 4.6,
        rating_count: 95,
        status: 'active',
        services: [
          { name: 'Udrażnianie rur', price: 150, duration: 60 },
          { name: 'Wymiana baterii', price: 100, duration: 45 },
          { name: 'Usuwanie awarii (dojazd + diagnoza)', price: 200, duration: 60 },
          { name: 'Montaż WC', price: 250, duration: 120 },
        ]
      },
    ];

    // Insert providers and services
    const createdProviders: Array<{ id: string; services: any[] }> = [];
    
    for (const providerData of demoProviders) {
      if (!providerData.category_id) continue;

      const { services, ...provider } = providerData;
      
      const { data: newProvider, error: providerError } = await supabase
        .from('service_providers')
        .insert(provider)
        .select('id')
        .single();

      if (providerError) {
        console.error('Error creating provider:', providerError);
        continue;
      }

      // Insert services
      const servicesToInsert = services.map((s, index) => ({
        provider_id: newProvider.id,
        name: s.name,
        price: s.price,
        duration_minutes: s.duration,
        is_active: true,
        sort_order: index + 1,
      }));

      const { data: createdServices } = await supabase
        .from('services')
        .insert(servicesToInsert)
        .select('id, name');

      createdProviders.push({ 
        id: newProvider.id, 
        services: createdServices || [] 
      });
    }

    // Create sample reviews
    const reviews = [
      { rating: 5, comment: 'Świetna usługa! Demo test - polecam każdemu.' },
      { rating: 5, comment: 'Profesjonalizm na najwyższym poziomie. Demo recenzja.' },
      { rating: 4, comment: 'Bardzo dobra jakość, drobne uwagi do punktualności. Demo.' },
      { rating: 5, comment: 'Rewelacja! Wrócę na pewno. Demo test.' },
      { rating: 4, comment: 'Solidna robota, polecam. Demo recenzja testowa.' },
      { rating: 5, comment: 'Najlepszy wykonawca w mieście! Demo.' },
      { rating: 4, comment: 'Dobra cena i jakość. Demo test review.' },
      { rating: 5, comment: 'Perfekcja! Demo - 100% satysfakcji.' },
    ];

    for (const provider of createdProviders) {
      // Add 2-4 random reviews per provider
      const numReviews = Math.floor(Math.random() * 3) + 2;
      for (let i = 0; i < numReviews; i++) {
        const review = reviews[Math.floor(Math.random() * reviews.length)];
        await supabase.from('service_reviews').insert({
          provider_id: provider.id,
          rating: review.rating,
          comment: review.comment,
          is_visible: true,
        });
      }
    }

    // Create sample bookings
    const bookingStatuses = ['new', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    const customerNames = [
      'Anna Kowalska Demo', 'Piotr Nowak Demo', 'Maria Wiśniewska Demo',
      'Jan Wójcik Demo', 'Katarzyna Kamińska Demo'
    ];

    for (const provider of createdProviders.slice(0, 5)) {
      if (provider.services.length === 0) continue;
      
      const service = provider.services[0];
      const status = bookingStatuses[Math.floor(Math.random() * bookingStatuses.length)];
      const customer = customerNames[Math.floor(Math.random() * customerNames.length)];
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + Math.floor(Math.random() * 7) + 1);

      await supabase.from('service_bookings').insert({
        provider_id: provider.id,
        service_id: service.id,
        customer_name: customer,
        customer_email: 'demo@example.com',
        customer_phone: '+48 123 456 789',
        scheduled_date: tomorrow.toISOString().split('T')[0],
        scheduled_time: '10:00',
        duration_minutes: 60,
        estimated_price: 150,
        status: status,
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Dane przykładowe utworzone',
      providersCreated: createdProviders.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

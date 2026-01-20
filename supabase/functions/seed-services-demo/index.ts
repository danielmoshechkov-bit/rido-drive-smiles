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
      // Delete all demo data
      await supabase.from('service_reviews').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('service_bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('services').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('service_providers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

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

    // Define 24 demo providers (3 per category for 8 categories)
    const demoProviders = [
      // ======== SPRZĄTANIE (3) ========
      {
        category_id: categoryMap['sprzatanie'],
        company_name: 'Czysto i Świeżo',
        company_city: 'Warszawa',
        company_address: 'ul. Czystości 15',
        company_phone: '+48 500 100 200',
        company_email: 'kontakt@czystoswiezo.pl',
        description: 'Profesjonalne sprzątanie mieszkań, domów i biur. Działamy w Warszawie i okolicach od 10 lat. Używamy ekologicznych środków czystości.',
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
        company_name: 'Błysk Cleaning',
        company_city: 'Kraków',
        company_address: 'ul. Błyszcząca 8',
        company_phone: '+48 500 200 300',
        company_email: 'biuro@blyskcleaning.pl',
        description: 'Sprzątanie biur i lokali komercyjnych. Elastyczne godziny, profesjonalny sprzęt. Obsługujemy firmy z całego Krakowa.',
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
        company_name: 'Clean Master Pro',
        company_city: 'Wrocław',
        company_address: 'ul. Perfekcyjna 22',
        company_phone: '+48 500 300 400',
        company_email: 'info@cleanmasterpro.pl',
        description: 'Specjalizujemy się w sprzątaniu po remontach i czyszczeniu tapicerek. Najwyższa jakość usług w przystępnych cenach.',
        rating_avg: 4.9,
        rating_count: 67,
        status: 'active',
        services: [
          { name: 'Sprzątanie po remoncie', price: 300, duration: 300 },
          { name: 'Czyszczenie tapicerki meblowej', price: 150, duration: 90 },
          { name: 'Czyszczenie tapicerki samochodowej', price: 200, duration: 120 },
        ]
      },

      // ======== WARSZTAT (3) ========
      {
        category_id: categoryMap['warsztat'],
        company_name: 'AutoSerwis Kowalski',
        company_city: 'Warszawa',
        company_address: 'ul. Mechaników 45',
        company_phone: '+48 600 100 200',
        company_email: 'serwis@autoserwiskowalski.pl',
        description: 'Pełen zakres usług mechanicznych. Specjalizacja w autach europejskich. 20 lat doświadczenia.',
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
        company_name: 'MotoDoktor',
        company_city: 'Gdańsk',
        company_address: 'ul. Portowa 12',
        company_phone: '+48 600 200 300',
        company_email: 'kontakt@motodoktor.pl',
        description: 'Diagnostyka komputerowa wszystkich marek. Szybka i dokładna naprawa. Gwarancja na usługi.',
        rating_avg: 4.6,
        rating_count: 54,
        status: 'active',
        services: [
          { name: 'Diagnostyka komputerowa', price: 80, duration: 30 },
          { name: 'Wymiana oleju', price: 80, duration: 20 },
          { name: 'Wymiana klocków hamulcowych', price: 180, duration: 60 },
        ]
      },
      {
        category_id: categoryMap['warsztat'],
        company_name: 'FastFix Garage',
        company_city: 'Poznań',
        company_address: 'ul. Motorowa 7',
        company_phone: '+48 600 300 400',
        company_email: 'rezerwacje@fastfixgarage.pl',
        description: 'Szybkie naprawy i przeglądy. Specjalizacja w autach japońskich i koreańskich.',
        rating_avg: 4.4,
        rating_count: 38,
        status: 'active',
        services: [
          { name: 'Przegląd przed zakupem', price: 200, duration: 60 },
          { name: 'Wymiana rozrządu', price: 800, duration: 240 },
          { name: 'Naprawa zawieszenia', price: 400, duration: 120 },
        ]
      },

      // ======== DETAILING (3) ========
      {
        category_id: categoryMap['detailing'],
        company_name: 'Shine Studio',
        company_city: 'Poznań',
        company_address: 'ul. Błyszcząca 5',
        company_phone: '+48 700 100 200',
        company_email: 'rezerwacje@shinestudio.pl',
        description: 'Profesjonalny detailing samochodowy. Powłoki ceramiczne, polerowanie, korekta lakieru. Tylko najlepsze produkty.',
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
        company_name: 'DetailPro',
        company_city: 'Katowice',
        company_address: 'ul. Auto 18',
        company_phone: '+48 700 200 300',
        company_email: 'booking@detailpro.pl',
        description: 'Kompleksowa pielęgnacja samochodu w przystępnych cenach. Kosmetyka samochodowa na najwyższym poziomie.',
        rating_avg: 4.4,
        rating_count: 41,
        status: 'active',
        services: [
          { name: 'Mycie zewnętrzne', price: 80, duration: 30 },
          { name: 'Czyszczenie wnętrza', price: 200, duration: 120 },
          { name: 'Mycie + wnętrze komplet', price: 250, duration: 150 },
        ]
      },
      {
        category_id: categoryMap['detailing'],
        company_name: 'Diamond Shine',
        company_city: 'Warszawa',
        company_address: 'ul. Luksusowa 33',
        company_phone: '+48 700 300 400',
        company_email: 'vip@diamondshine.pl',
        description: 'Auto SPA dla wymagających. Korekta lakieru, powłoki ochronne, pielęgnacja skóry. Obsługujemy auta premium.',
        rating_avg: 4.7,
        rating_count: 56,
        status: 'active',
        services: [
          { name: 'Korekta lakieru 2-fazowa', price: 1500, duration: 480 },
          { name: 'Pielęgnacja skóry', price: 350, duration: 120 },
          { name: 'Pakiet VIP komplet', price: 3000, duration: 600 },
        ]
      },

      // ======== ZŁOTA RĄCZKA (3) ========
      {
        category_id: categoryMap['zlota-raczka'],
        company_name: 'Jan Majster',
        company_city: 'Warszawa',
        company_address: 'ul. Rzemieślnicza 7',
        company_phone: '+48 800 100 200',
        company_email: 'jan@majster.pl',
        description: 'Drobne naprawy domowe, montaż mebli, wieszanie obrazów. Szybko i solidnie! Ponad 15 lat doświadczenia.',
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
        company_name: 'Fachowiec24',
        company_city: 'Łódź',
        company_address: 'ul. Pomocna 33',
        company_phone: '+48 800 200 300',
        company_email: 'pomoc@fachowiec24.pl',
        description: 'Szybka pomoc w drobnych naprawach. Dostępni 7 dni w tygodniu. Dojazd gratis.',
        rating_avg: 4.3,
        rating_count: 28,
        status: 'active',
        services: [
          { name: 'Montaż karniszy', price: 60, duration: 30 },
          { name: 'Wymiana gniazdek elektrycznych', price: 50, duration: 20 },
          { name: 'Naprawa drzwi/zamków', price: 100, duration: 45 },
        ]
      },
      {
        category_id: categoryMap['zlota-raczka'],
        company_name: 'Pomocna Dłoń',
        company_city: 'Kraków',
        company_address: 'ul. Sprawna 11',
        company_phone: '+48 800 300 400',
        company_email: 'kontakt@pomocnadlon.pl',
        description: 'Montaż, naprawa, konserwacja. Każde zlecenie traktujemy priorytetowo.',
        rating_avg: 4.6,
        rating_count: 64,
        status: 'active',
        services: [
          { name: 'Montaż TV na ścianie', price: 120, duration: 45 },
          { name: 'Montaż rolet/żaluzji', price: 80, duration: 40 },
          { name: 'Drobne prace remontowe (za godzinę)', price: 90, duration: 60 },
        ]
      },

      // ======== HYDRAULIK (3) ========
      {
        category_id: categoryMap['hydraulik'],
        company_name: 'Hydro-Max',
        company_city: 'Warszawa',
        company_address: 'ul. Wodna 10',
        company_phone: '+48 900 100 200',
        company_email: 'awarie@hydromax.pl',
        description: 'Usługi hydrauliczne 24/7, udrażnianie rur, montaż armatury. Dojazd w 30 minut!',
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
      {
        category_id: categoryMap['hydraulik'],
        company_name: 'Rury-Expert',
        company_city: 'Wrocław',
        company_address: 'ul. Kanalizacyjna 5',
        company_phone: '+48 900 200 300',
        company_email: 'serwis@ruryexpert.pl',
        description: 'Instalacje wodno-kanalizacyjne, naprawy, montaż. Gwarancja na wszystkie prace.',
        rating_avg: 4.5,
        rating_count: 52,
        status: 'active',
        services: [
          { name: 'Montaż umywalki', price: 150, duration: 60 },
          { name: 'Montaż prysznica', price: 300, duration: 120 },
          { name: 'Wymiana syfonu', price: 80, duration: 30 },
        ]
      },
      {
        category_id: categoryMap['hydraulik'],
        company_name: 'AquaService',
        company_city: 'Gdańsk',
        company_address: 'ul. Morska 22',
        company_phone: '+48 900 300 400',
        company_email: 'kontakt@aquaservice.pl',
        description: 'Kompleksowe usługi hydrauliczne. Specjalizacja w nowoczesnych systemach.',
        rating_avg: 4.7,
        rating_count: 73,
        status: 'active',
        services: [
          { name: 'Montaż pralki/zmywarki', price: 120, duration: 45 },
          { name: 'Instalacja filtra wody', price: 200, duration: 60 },
          { name: 'Wymiana grzejnika', price: 350, duration: 120 },
        ]
      },

      // ======== ELEKTRYK (3) ========
      {
        category_id: categoryMap['elektryk'],
        company_name: 'Elektro-Pro',
        company_city: 'Warszawa',
        company_address: 'ul. Prądowa 8',
        company_phone: '+48 501 100 200',
        company_email: 'serwis@elektropro.pl',
        description: 'Instalacje elektryczne, naprawy, przeglądy. Uprawniony elektryk z 20-letnim doświadczeniem.',
        rating_avg: 4.8,
        rating_count: 88,
        status: 'active',
        services: [
          { name: 'Wymiana gniazdka/włącznika', price: 60, duration: 20 },
          { name: 'Montaż lampy/żyrandola', price: 100, duration: 45 },
          { name: 'Przegląd instalacji', price: 200, duration: 60 },
          { name: 'Naprawa awaryjna', price: 150, duration: 45 },
        ]
      },
      {
        category_id: categoryMap['elektryk'],
        company_name: 'Światło i Prąd',
        company_city: 'Kraków',
        company_address: 'ul. Jasna 15',
        company_phone: '+48 501 200 300',
        company_email: 'kontakt@swiatloiprad.pl',
        description: 'Profesjonalne usługi elektryczne. Szybko, bezpiecznie, solidnie.',
        rating_avg: 4.5,
        rating_count: 46,
        status: 'active',
        services: [
          { name: 'Montaż oświetlenia LED', price: 150, duration: 60 },
          { name: 'Instalacja domofonu', price: 300, duration: 120 },
          { name: 'Wymiana rozdzielnicy', price: 500, duration: 180 },
        ]
      },
      {
        category_id: categoryMap['elektryk'],
        company_name: 'VoltMaster',
        company_city: 'Poznań',
        company_address: 'ul. Energetyczna 3',
        company_phone: '+48 501 300 400',
        company_email: 'biuro@voltmaster.pl',
        description: 'Nowoczesne instalacje elektryczne. Smart home, automatyka, fotowoltaika.',
        rating_avg: 4.6,
        rating_count: 62,
        status: 'active',
        services: [
          { name: 'Konsultacja smart home', price: 200, duration: 60 },
          { name: 'Montaż gniazdka USB', price: 80, duration: 30 },
          { name: 'Instalacja sterowania roletami', price: 400, duration: 180 },
        ]
      },

      // ======== OGRODNIK (3) ========
      {
        category_id: categoryMap['ogrodnik'],
        company_name: 'Zielony Ogród',
        company_city: 'Warszawa',
        company_address: 'ul. Kwiatowa 12',
        company_phone: '+48 502 100 200',
        company_email: 'kontakt@zielonyogrod.pl',
        description: 'Kompleksowa pielęgnacja ogrodów. Koszenie, przycinanie, projektowanie. Działamy całorocznie.',
        rating_avg: 4.7,
        rating_count: 71,
        status: 'active',
        services: [
          { name: 'Koszenie trawnika (do 500m²)', price: 150, duration: 90 },
          { name: 'Przycinanie żywopłotu (za mb)', price: 15, duration: 10 },
          { name: 'Grabienie liści', price: 100, duration: 60 },
          { name: 'Projektowanie ogrodu', price: 500, duration: 180 },
        ]
      },
      {
        category_id: categoryMap['ogrodnik'],
        company_name: 'EkoGarden',
        company_city: 'Wrocław',
        company_address: 'ul. Parkowa 7',
        company_phone: '+48 502 200 300',
        company_email: 'biuro@ekogarden.pl',
        description: 'Ekologiczna pielęgnacja terenów zielonych. Naturalne metody, dbałość o środowisko.',
        rating_avg: 4.4,
        rating_count: 35,
        status: 'active',
        services: [
          { name: 'Pielęgnacja rabat', price: 120, duration: 60 },
          { name: 'Sadzenie roślin', price: 80, duration: 45 },
          { name: 'Wertykulacja trawnika', price: 200, duration: 120 },
        ]
      },
      {
        category_id: categoryMap['ogrodnik'],
        company_name: 'GreenThumb',
        company_city: 'Kraków',
        company_address: 'ul. Ogrodowa 25',
        company_phone: '+48 502 300 400',
        company_email: 'info@greenthumb.pl',
        description: 'Profesjonalna pielęgnacja ogrodów i balkonów. Również małe przestrzenie!',
        rating_avg: 4.8,
        rating_count: 49,
        status: 'active',
        services: [
          { name: 'Pielęgnacja balkonu', price: 100, duration: 45 },
          { name: 'Automatyczny system nawadniania', price: 800, duration: 240 },
          { name: 'Sezonowe nasadzenia', price: 250, duration: 120 },
        ]
      },

      // ======== PRZEPROWADZKI (3) ========
      {
        category_id: categoryMap['przeprowadzki'],
        company_name: 'Trans-Move',
        company_city: 'Warszawa',
        company_address: 'ul. Transportowa 20',
        company_phone: '+48 503 100 200',
        company_email: 'biuro@transmove.pl',
        description: 'Przeprowadzki lokalne i międzynarodowe. Pakowanie, transport, montaż mebli. Ubezpieczenie w cenie.',
        rating_avg: 4.6,
        rating_count: 103,
        status: 'active',
        services: [
          { name: 'Przeprowadzka kawalerki', price: 600, duration: 180 },
          { name: 'Przeprowadzka 2-pokojowego', price: 900, duration: 300 },
          { name: 'Przeprowadzka domu', price: 2000, duration: 480 },
          { name: 'Pakowanie (za godzinę)', price: 100, duration: 60 },
        ]
      },
      {
        category_id: categoryMap['przeprowadzki'],
        company_name: 'Quick Move',
        company_city: 'Kraków',
        company_address: 'ul. Szybka 5',
        company_phone: '+48 503 200 300',
        company_email: 'kontakt@quickmove.pl',
        description: 'Szybkie i bezpieczne przeprowadzki. Konkurencyjne ceny, profesjonalna ekipa.',
        rating_avg: 4.5,
        rating_count: 67,
        status: 'active',
        services: [
          { name: 'Przeprowadzka mała (do 20m³)', price: 500, duration: 180 },
          { name: 'Przeprowadzka średnia (20-40m³)', price: 800, duration: 240 },
          { name: 'Transport pojedynczych mebli', price: 200, duration: 60 },
        ]
      },
      {
        category_id: categoryMap['przeprowadzki'],
        company_name: 'SafeTransport',
        company_city: 'Gdańsk',
        company_address: 'ul. Portowa 18',
        company_phone: '+48 503 300 400',
        company_email: 'info@safetransport.pl',
        description: 'Przeprowadzki z pełnym ubezpieczeniem. Specjalizacja w transporcie delikatnych przedmiotów.',
        rating_avg: 4.8,
        rating_count: 82,
        status: 'active',
        services: [
          { name: 'Transport antyków', price: 400, duration: 120 },
          { name: 'Przeprowadzka biura', price: 1500, duration: 480 },
          { name: 'Magazynowanie (za dzień)', price: 50, duration: 0 },
        ]
      },
    ];

    // Insert providers and services
    const createdProviders: Array<{ id: string; services: any[] }> = [];
    
    for (const providerData of demoProviders) {
      if (!providerData.category_id) {
        console.log('Skipping provider - no category:', providerData.company_name);
        continue;
      }

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

    // Create sample reviews with 3-part rating system
    const reviewComments = [
      { comment: 'Świetna usługa! Bardzo profesjonalne podejście, polecam każdemu.', quality: 5, communication: 5, punctuality: 5 },
      { comment: 'Profesjonalizm na najwyższym poziomie. Szybko i dokładnie.', quality: 5, communication: 5, punctuality: 5 },
      { comment: 'Bardzo dobra jakość, drobne uwagi do punktualności, ale ogólnie super.', quality: 5, communication: 4, punctuality: 3 },
      { comment: 'Rewelacja! Na pewno skorzystam ponownie. Polecam!', quality: 5, communication: 5, punctuality: 5 },
      { comment: 'Solidna robota, komunikacja mogłaby być lepsza.', quality: 4, communication: 3, punctuality: 4 },
      { comment: 'Najlepszy wykonawca w mieście! Dokładny i punktualny.', quality: 5, communication: 5, punctuality: 5 },
      { comment: 'Dobra cena i jakość. Drobne opóźnienie, ale się dogadaliśmy.', quality: 4, communication: 4, punctuality: 3 },
      { comment: 'Perfekcja! 100% satysfakcji z usługi.', quality: 5, communication: 5, punctuality: 5 },
      { comment: 'Polecam! Fachowa obsługa i miła atmosfera.', quality: 5, communication: 5, punctuality: 4 },
      { comment: 'Wszystko zgodnie z umową, bez zastrzeżeń.', quality: 4, communication: 4, punctuality: 4 },
    ];

    for (const provider of createdProviders) {
      // Add 3-5 random reviews per provider
      const numReviews = Math.floor(Math.random() * 3) + 3;
      for (let i = 0; i < numReviews; i++) {
        const review = reviewComments[Math.floor(Math.random() * reviewComments.length)];
        const avgRating = Math.round((review.quality + review.communication + review.punctuality) / 3);
        
        await supabase.from('service_reviews').insert({
          provider_id: provider.id,
          rating: avgRating,
          rating_quality: review.quality,
          rating_communication: review.communication,
          rating_punctuality: review.punctuality,
          comment: review.comment,
          is_visible: true,
        });
      }
    }

    // Create sample bookings
    const bookingStatuses = ['new', 'confirmed', 'in_progress', 'completed'];
    const customerNames = [
      'Anna Kowalska', 'Piotr Nowak', 'Maria Wiśniewska',
      'Jan Wójcik', 'Katarzyna Kamińska', 'Tomasz Zieliński'
    ];

    for (const provider of createdProviders.slice(0, 10)) {
      if (provider.services.length === 0) continue;
      
      const service = provider.services[0];
      const status = bookingStatuses[Math.floor(Math.random() * bookingStatuses.length)];
      const customer = customerNames[Math.floor(Math.random() * customerNames.length)];
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + Math.floor(Math.random() * 14) + 1);

      await supabase.from('service_bookings').insert({
        provider_id: provider.id,
        service_id: service.id,
        customer_name: customer,
        customer_email: 'klient@example.com',
        customer_phone: '+48 123 456 789',
        scheduled_date: futureDate.toISOString().split('T')[0],
        scheduled_time: ['09:00', '10:00', '11:00', '14:00', '15:00'][Math.floor(Math.random() * 5)],
        duration_minutes: 60,
        estimated_price: 150,
        status: status,
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Utworzono ${createdProviders.length} usługodawców z usługami i recenzjami`,
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

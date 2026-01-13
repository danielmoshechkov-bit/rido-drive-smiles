import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Geohash encoding for location-based caching
function encodeGeohash(lat: number, lon: number, precision: number = 7): string {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let minLat = -90, maxLat = 90;
  let minLon = -180, maxLon = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let isEven = true;

  while (hash.length < precision) {
    if (isEven) {
      const mid = (minLon + maxLon) / 2;
      if (lon >= mid) {
        ch |= (1 << (4 - bit));
        minLon = mid;
      } else {
        maxLon = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch |= (1 << (4 - bit));
        minLat = mid;
      } else {
        maxLat = mid;
      }
    }
    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      hash += base32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

// Calculate transport score based on indicators
function calculateTransportScore(data: {
  stopsWithin500m: number;
  stopsWithin1000m: number;
  transportTypes: string[];
  lineCount: number;
  hasNightService: boolean;
}): { score: number; rating: string } {
  let score = 0;

  // Stops within 500m (max 30 points)
  score += Math.min(data.stopsWithin500m * 6, 30);

  // Stops within 1000m (max 15 points)
  score += Math.min(data.stopsWithin1000m * 2, 15);

  // Transport types diversity (max 25 points)
  const typePoints: Record<string, number> = {
    metro: 10,
    tram: 7,
    bus: 5,
    rail: 8,
  };
  data.transportTypes.forEach(type => {
    score += typePoints[type] || 3;
  });
  score = Math.min(score, 70);

  // Line count (max 20 points)
  score += Math.min(data.lineCount * 2, 20);

  // Night service (10 points)
  if (data.hasNightService) {
    score += 10;
  }

  // Cap at 100
  score = Math.min(score, 100);

  // Determine rating
  let rating: string;
  if (score >= 80) rating = 'excellent';
  else if (score >= 60) rating = 'good';
  else if (score >= 40) rating = 'moderate';
  else if (score >= 20) rating = 'limited';
  else rating = 'poor';

  return { score, rating };
}

// Generate AI summary based on transport data
function generateAISummary(data: {
  score: number;
  rating: string;
  transportTypes: string[];
  lineCount: number;
  nearestStopDistance: number;
  hasNightService: boolean;
}): string {
  const typeLabels: Record<string, string> = {
    metro: 'metro',
    tram: 'tramwaj',
    bus: 'autobus',
    rail: 'kolej',
  };

  const typesText = data.transportTypes
    .map(t => typeLabels[t] || t)
    .join(', ');

  const ratingTexts: Record<string, string> = {
    excellent: 'Doskonała komunikacja miejska',
    good: 'Dobra komunikacja miejska',
    moderate: 'Umiarkowana dostępność transportu publicznego',
    limited: 'Ograniczona komunikacja miejska',
    poor: 'Słaba dostępność transportu publicznego',
  };

  let summary = ratingTexts[data.rating] || 'Brak danych';

  if (data.transportTypes.length > 0) {
    summary += ` – dostępne środki transportu: ${typesText}.`;
  }

  if (data.nearestStopDistance > 0) {
    summary += ` Najbliższy przystanek w odległości ${data.nearestStopDistance}m.`;
  }

  if (data.lineCount > 0) {
    summary += ` ${data.lineCount} linii w pobliżu.`;
  }

  if (data.hasNightService) {
    summary += ' Dostępna komunikacja nocna.';
  }

  return summary;
}

// Mock data generator (to be replaced with real GTFS data)
function generateMockTransitData(lat: number, lon: number) {
  // Simulate different areas having different transit quality
  // Based on city centers having better transit
  const warsawCenter = { lat: 52.2297, lon: 21.0122 };
  const krakowCenter = { lat: 50.0647, lon: 19.9450 };
  
  const distToWarsaw = Math.sqrt(
    Math.pow(lat - warsawCenter.lat, 2) + Math.pow(lon - warsawCenter.lon, 2)
  );
  const distToKrakow = Math.sqrt(
    Math.pow(lat - krakowCenter.lat, 2) + Math.pow(lon - krakowCenter.lon, 2)
  );
  
  const minDist = Math.min(distToWarsaw, distToKrakow);
  const isNearCity = minDist < 0.1;
  const isInSuburbs = minDist < 0.3;

  let transportTypes: string[] = [];
  let stopsWithin500m = 0;
  let stopsWithin1000m = 0;
  let lineCount = 0;
  let hasNightService = false;
  let nearestStopDistance = 0;
  let nearestStopName = '';

  if (isNearCity) {
    // City center - excellent transit
    transportTypes = ['metro', 'tram', 'bus'];
    stopsWithin500m = Math.floor(Math.random() * 5) + 3;
    stopsWithin1000m = Math.floor(Math.random() * 8) + 5;
    lineCount = Math.floor(Math.random() * 10) + 8;
    hasNightService = true;
    nearestStopDistance = Math.floor(Math.random() * 150) + 50;
    nearestStopName = 'Centrum';
  } else if (isInSuburbs) {
    // Suburbs - moderate transit
    transportTypes = ['bus', 'tram'];
    stopsWithin500m = Math.floor(Math.random() * 3) + 1;
    stopsWithin1000m = Math.floor(Math.random() * 5) + 2;
    lineCount = Math.floor(Math.random() * 6) + 3;
    hasNightService = Math.random() > 0.5;
    nearestStopDistance = Math.floor(Math.random() * 300) + 100;
    nearestStopName = 'Os. Mieszkaniowe';
  } else {
    // Rural/distant - limited transit
    transportTypes = ['bus'];
    stopsWithin500m = Math.floor(Math.random() * 2);
    stopsWithin1000m = Math.floor(Math.random() * 3) + 1;
    lineCount = Math.floor(Math.random() * 3) + 1;
    hasNightService = false;
    nearestStopDistance = Math.floor(Math.random() * 500) + 300;
    nearestStopName = 'Przystanek autobusowy';
  }

  return {
    stopsWithin500m,
    stopsWithin1000m,
    transportTypes,
    lineCount,
    hasNightService,
    nearestStopDistance,
    nearestStopName,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    let lat: number, lon: number;
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      lat = parseFloat(url.searchParams.get('lat') || '0');
      lon = parseFloat(url.searchParams.get('lng') || url.searchParams.get('lon') || '0');
    } else {
      const body = await req.json();
      lat = body.latitude || body.lat;
      lon = body.longitude || body.lng || body.lon;
    }

    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
      return new Response(
        JSON.stringify({ error: 'Invalid coordinates. Provide lat and lng/lon parameters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📍 Transit data request for: ${lat}, ${lon}`);

    // Generate geohash for caching
    const geohash = encodeGeohash(lat, lon, 7);

    // Check cache first
    const { data: cachedData, error: cacheError } = await supabase
      .from('transit_location_data')
      .select('*')
      .eq('geohash', geohash)
      .gte('valid_until', new Date().toISOString())
      .maybeSingle();

    if (cachedData && !cacheError) {
      console.log('✅ Returning cached transit data');
      return new Response(
        JSON.stringify({
          stops_within_500m: cachedData.stops_within_500m,
          stops_within_1000m: cachedData.stops_within_1000m,
          transport_types: cachedData.transport_types,
          line_count: cachedData.line_count,
          avg_frequency_minutes: cachedData.avg_frequency_minutes,
          has_night_service: cachedData.has_night_service,
          nearest_stop: {
            name: cachedData.nearest_stop_name,
            distance_m: cachedData.nearest_stop_distance_m,
          },
          transport_score: cachedData.transport_score,
          transport_rating: cachedData.transport_rating,
          ai_summary: cachedData.ai_summary,
          cached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate transit data (mock for now, will integrate with GTFS later)
    const mockData = generateMockTransitData(lat, lon);

    // Calculate score and rating
    const { score, rating } = calculateTransportScore({
      stopsWithin500m: mockData.stopsWithin500m,
      stopsWithin1000m: mockData.stopsWithin1000m,
      transportTypes: mockData.transportTypes,
      lineCount: mockData.lineCount,
      hasNightService: mockData.hasNightService,
    });

    // Generate AI summary
    const aiSummary = generateAISummary({
      score,
      rating,
      transportTypes: mockData.transportTypes,
      lineCount: mockData.lineCount,
      nearestStopDistance: mockData.nearestStopDistance,
      hasNightService: mockData.hasNightService,
    });

    // Cache the result (valid for 24 hours)
    const validUntil = new Date();
    validUntil.setHours(validUntil.getHours() + 24);

    const { error: insertError } = await supabase
      .from('transit_location_data')
      .upsert({
        latitude: lat,
        longitude: lon,
        geohash,
        stops_within_500m: mockData.stopsWithin500m,
        stops_within_1000m: mockData.stopsWithin1000m,
        transport_types: mockData.transportTypes,
        line_count: mockData.lineCount,
        avg_frequency_minutes: null, // Will be calculated with real GTFS data
        has_night_service: mockData.hasNightService,
        nearest_stop_distance_m: mockData.nearestStopDistance,
        nearest_stop_name: mockData.nearestStopName,
        transport_score: score,
        transport_rating: rating,
        ai_summary: aiSummary,
        calculated_at: new Date().toISOString(),
        valid_until: validUntil.toISOString(),
      }, {
        onConflict: 'geohash',
      });

    if (insertError) {
      console.error('Cache insert error:', insertError);
    }

    console.log(`✅ Generated transit data: score=${score}, rating=${rating}`);

    return new Response(
      JSON.stringify({
        stops_within_500m: mockData.stopsWithin500m,
        stops_within_1000m: mockData.stopsWithin1000m,
        transport_types: mockData.transportTypes,
        line_count: mockData.lineCount,
        avg_frequency_minutes: null,
        has_night_service: mockData.hasNightService,
        nearest_stop: {
          name: mockData.nearestStopName,
          distance_m: mockData.nearestStopDistance,
        },
        transport_score: score,
        transport_rating: rating,
        ai_summary: aiSummary,
        cached: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in transit-data function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

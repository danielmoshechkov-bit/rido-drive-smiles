import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Google Places API transit types
const TRANSIT_TYPES = [
  "transit_station",
  "bus_station", 
  "train_station",
  "subway_station",
  "light_rail_station"
];

// POI categories for Places API (New) - using includedTypes format
const POI_CATEGORIES_NEW: Record<string, string[]> = {
  grocery: ["supermarket", "grocery_store", "convenience_store"],
  school: ["school", "primary_school", "secondary_school"],
  pharmacy: ["pharmacy"],
  restaurant: ["restaurant", "cafe", "bakery", "coffee_shop"],
  health: ["hospital", "doctor", "dentist", "medical_lab"],
  park: ["park", "playground"],
  gym: ["gym", "fitness_center"],
  bank: ["bank", "atm"]
};

// Polish city centers for traffic calculation
const CITY_CENTERS: Record<string, { lat: number; lng: number; name: string }> = {
  "warszawa": { lat: 52.2297, lng: 21.0122, name: "Centrum Warszawy" },
  "krakow": { lat: 50.0647, lng: 19.9450, name: "Centrum Krakowa" },
  "kraków": { lat: 50.0647, lng: 19.9450, name: "Centrum Krakowa" },
  "wroclaw": { lat: 51.1079, lng: 17.0385, name: "Centrum Wrocławia" },
  "wrocław": { lat: 51.1079, lng: 17.0385, name: "Centrum Wrocławia" },
  "poznan": { lat: 52.4064, lng: 16.9252, name: "Centrum Poznania" },
  "poznań": { lat: 52.4064, lng: 16.9252, name: "Centrum Poznania" },
  "gdansk": { lat: 54.3520, lng: 18.6466, name: "Centrum Gdańska" },
  "gdańsk": { lat: 54.3520, lng: 18.6466, name: "Centrum Gdańska" },
  "lodz": { lat: 51.7592, lng: 19.4560, name: "Centrum Łodzi" },
  "łódź": { lat: 51.7592, lng: 19.4560, name: "Centrum Łodzi" },
  "katowice": { lat: 50.2649, lng: 19.0238, name: "Centrum Katowic" },
  "szczecin": { lat: 53.4285, lng: 14.5528, name: "Centrum Szczecina" },
  "lublin": { lat: 51.2465, lng: 22.5684, name: "Centrum Lublina" },
  "bydgoszcz": { lat: 53.1235, lng: 18.0084, name: "Centrum Bydgoszczy" },
  "bialystok": { lat: 53.1325, lng: 23.1688, name: "Centrum Białegostoku" },
  "białystok": { lat: 53.1325, lng: 23.1688, name: "Centrum Białegostoku" },
};

// Calculate distance between two coordinates in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

// Get Google API key from Supabase - prioritize backend key for POI
async function getGoogleApiKey(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    // Priority 1: Check for dedicated backend key in POI integration type
    const { data: poiIntegration } = await supabase
      .from("location_integrations")
      .select("config")
      .eq("integration_type", "poi")
      .eq("provider", "google_places")
      .limit(1)
      .maybeSingle();
    
    if (poiIntegration?.config?.google_places_api_key) {
      console.log("Using dedicated Google Places API key from POI integration");
      return poiIntegration.config.google_places_api_key;
    }

    // Priority 2: Check any google_places provider for backend key
    const { data: integrations } = await supabase
      .from("location_integrations")
      .select("config")
      .eq("provider", "google_places")
      .limit(10);
    
    if (integrations && integrations.length > 0) {
      // First look for google_places_api_key in any row
      for (const row of integrations) {
        if (row.config?.google_places_api_key) {
          console.log("Using Google Places API key from integration row");
          return row.config.google_places_api_key;
        }
      }
      // Fallback to general google_api_key
      for (const row of integrations) {
        if (row.config?.google_api_key) {
          console.log("Using general Google API key from integration");
          return row.config.google_api_key;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching API key from database:", error);
  }
  
  // Priority 3: Fallback to environment variable (Supabase Secrets)
  const envKey = Deno.env.get("GOOGLE_API_KEY");
  if (envKey) {
    console.log("Using Google API key from environment (Supabase Secrets)");
    return envKey;
  }
  
  console.warn("No Google API key found - will return mock data");
  return null;
}

// Get city center for traffic reference point
async function getCityCenter(
  latitude: number,
  longitude: number,
  apiKey: string,
  customReferencePoint?: { lat: number; lng: number }
): Promise<{ lat: number; lng: number; name: string }> {
  // If custom reference point is provided, use it
  if (customReferencePoint) {
    return { ...customReferencePoint, name: "Punkt referencyjny" };
  }

  // Try to get city from reverse geocoding
  try {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=pl`;
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      // Find city/locality component
      for (const result of data.results) {
        for (const component of result.address_components) {
          if (component.types.includes("locality")) {
            const cityName = component.long_name.toLowerCase();
            if (CITY_CENTERS[cityName]) {
              return CITY_CENTERS[cityName];
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Geocoding error:", error);
  }

  // Default fallback - use Kraków as default
  return CITY_CENTERS["krakow"];
}

// Fetch transit stops using Google Places API (New)
async function fetchTransitData(
  latitude: number,
  longitude: number,
  radius: number,
  apiKey: string
): Promise<{
  nearest_stop: { name: string; type: string; distance_m: number } | null;
  stops_within_radius: number;
  top_3_stops: Array<{ name: string; type: string; distance_m: number }>;
  transport_types: string[];
  radius_m: number;
}> {
  const stops: Array<{ name: string; type: string; distance_m: number; lat: number; lng: number }> = [];
  const foundTypes = new Set<string>();

  // Use Places API (New) for transit search
  const transitTypes = ["transit_station", "bus_station", "train_station", "subway_station"];
  
  try {
    const requestBody = {
      includedTypes: transitTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: radius
        }
      }
    };

    console.log(`[Transit] Fetching with types: ${transitTypes.join(", ")}, radius: ${radius}m`);

    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.displayName,places.location,places.types"
        },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await response.json();
    console.log(`[Transit] API response status: ${response.status}, places: ${data.places?.length || 0}`);

    if (data.places && data.places.length > 0) {
      for (const place of data.places) {
        const placeLat = place.location?.latitude;
        const placeLng = place.location?.longitude;
        
        if (placeLat && placeLng) {
          const distance = calculateDistance(latitude, longitude, placeLat, placeLng);
          
          if (distance <= radius) {
            const placeType = place.types?.[0] || "transit_station";
            stops.push({
              name: place.displayName?.text || "Unknown",
              type: placeType,
              distance_m: distance,
              lat: placeLat,
              lng: placeLng
            });
            foundTypes.add(placeType);
          }
        }
      }
    }
  } catch (error) {
    console.error("[Transit] Error fetching transit data:", error);
  }

  // Remove duplicates (same name within 50m)
  const uniqueStops = stops.filter((stop, index, self) =>
    index === self.findIndex(s => 
      s.name === stop.name && calculateDistance(s.lat, s.lng, stop.lat, stop.lng) < 50
    )
  );

  // Sort by distance
  uniqueStops.sort((a, b) => a.distance_m - b.distance_m);

  console.log(`[Transit] Found ${uniqueStops.length} unique stops`);

  return {
    nearest_stop: uniqueStops[0] ? {
      name: uniqueStops[0].name,
      type: uniqueStops[0].type,
      distance_m: uniqueStops[0].distance_m
    } : null,
    stops_within_radius: uniqueStops.length,
    top_3_stops: uniqueStops.slice(0, 3).map(s => ({
      name: s.name,
      type: s.type,
      distance_m: s.distance_m
    })),
    transport_types: Array.from(foundTypes),
    radius_m: radius
  };
}

// Fetch POI data using Google Places API (New)
async function fetchPoiData(
  latitude: number,
  longitude: number,
  radius: number,
  apiKey: string,
  filterCategories?: string[]
): Promise<{
  radius_m: number;
  categories: Record<string, { 
    count: number; 
    nearest: { name: string; distance_m: number } | null 
  }>;
}> {
  const categories: Record<string, { count: number; nearest: { name: string; distance_m: number } | null }> = {};

  // If specific categories are requested, filter
  const categoriesToFetch = filterCategories 
    ? Object.entries(POI_CATEGORIES_NEW).filter(([key]) => filterCategories.includes(key))
    : Object.entries(POI_CATEGORIES_NEW);

  console.log(`[POI] Fetching ${categoriesToFetch.length} categories for ${latitude}, ${longitude} with radius ${radius}m`);

  for (const [categoryKey, types] of categoriesToFetch) {
    const pois: Array<{ name: string; distance_m: number }> = [];

    try {
      // Use Places API (New) - nearbySearch endpoint
      const requestBody = {
        includedTypes: types,
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: radius
          }
        }
      };

      console.log(`[POI] Category ${categoryKey}: requesting types ${types.join(", ")}`);

      const response = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.displayName,places.location"
          },
          body: JSON.stringify(requestBody)
        }
      );

      const data = await response.json();
      console.log(`[POI] Category ${categoryKey}: API status ${response.status}, places: ${data.places?.length || 0}`);

      // Handle 403 errors (API key configuration issues)
      if (response.status === 403) {
        const errorReason = data.error?.details?.[0]?.reason || data.error?.status || "PERMISSION_DENIED";
        console.error(`[POI] Category ${categoryKey}: API Key blocked - ${errorReason}`);
        console.error(`[POI] Full error:`, JSON.stringify(data.error));
        // Continue to next category, this one will have 0 results
        continue;
      }

      if (data.places && data.places.length > 0) {
        for (const place of data.places) {
          const placeLat = place.location?.latitude;
          const placeLng = place.location?.longitude;
          
          if (placeLat && placeLng) {
            const distance = calculateDistance(latitude, longitude, placeLat, placeLng);
            
            if (distance <= radius) {
              pois.push({
                name: place.displayName?.text || "Unknown",
                distance_m: distance
              });
            }
          }
        }
      }

      // Check for API errors (non-403)
      if (data.error && response.status !== 403) {
        console.error(`[POI] Category ${categoryKey} API error:`, data.error);
      }
    } catch (error) {
      console.error(`[POI] Category ${categoryKey} fetch error:`, error);
    }

    // Remove duplicates by name
    const uniquePois = pois.filter((poi, index, self) =>
      index === self.findIndex(p => p.name === poi.name)
    );

    // Sort by distance
    uniquePois.sort((a, b) => a.distance_m - b.distance_m);

    categories[categoryKey] = {
      count: uniquePois.length,
      nearest: uniquePois[0] || null
    };

    console.log(`[POI] Category ${categoryKey}: final count = ${uniquePois.length}`);
  }

  return {
    radius_m: radius,
    categories
  };
}

// Fetch traffic data using Google Distance Matrix API
async function fetchTrafficData(
  latitude: number,
  longitude: number,
  apiKey: string,
  referencePoint?: { lat: number; lng: number }
): Promise<{
  destination: string;
  duration_minutes: number;
  duration_in_traffic_minutes: number;
  traffic_ratio: number;
  traffic_level: "low" | "medium" | "high";
  distance_km: number;
}> {
  const center = await getCityCenter(latitude, longitude, apiKey, referencePoint);

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${latitude},${longitude}&destinations=${center.lat},${center.lng}&mode=driving&departure_time=now&key=${apiKey}&language=pl`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.rows?.[0]?.elements?.[0]?.status === "OK") {
      const element = data.rows[0].elements[0];
      const durationSeconds = element.duration?.value || 0;
      const durationInTrafficSeconds = element.duration_in_traffic?.value || durationSeconds;
      const distanceMeters = element.distance?.value || 0;

      const durationMinutes = Math.round(durationSeconds / 60);
      const durationInTrafficMinutes = Math.round(durationInTrafficSeconds / 60);
      const ratio = durationInTrafficSeconds / Math.max(durationSeconds, 1);

      let trafficLevel: "low" | "medium" | "high";
      if (ratio < 1.2) {
        trafficLevel = "low";
      } else if (ratio <= 1.5) {
        trafficLevel = "medium";
      } else {
        trafficLevel = "high";
      }

      return {
        destination: center.name,
        duration_minutes: durationMinutes,
        duration_in_traffic_minutes: durationInTrafficMinutes,
        traffic_ratio: Math.round(ratio * 100) / 100,
        traffic_level: trafficLevel,
        distance_km: Math.round(distanceMeters / 100) / 10
      };
    }
  } catch (error) {
    console.error("Distance Matrix error:", error);
  }

  // Fallback response
  return {
    destination: center.name,
    duration_minutes: 0,
    duration_in_traffic_minutes: 0,
    traffic_ratio: 1,
    traffic_level: "low",
    distance_km: 0
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, latitude, longitude, radius = 300, reference_point, categories: filterCategories } = await req.json();

    if (!latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: "Missing latitude or longitude" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = await getGoogleApiKey(supabase);
    
    if (!apiKey) {
      console.log("Google API key not configured, returning mock data");
      return new Response(
        JSON.stringify({ 
          error: "Google API key not configured",
          mock: true,
          transit: {
            nearest_stop: { name: "Przystanek przykładowy", type: "bus_station", distance_m: 150 },
            stops_within_radius: 3,
            top_3_stops: [],
            transport_types: ["bus_station"],
            radius_m: radius
          },
          poi: {
            radius_m: radius,
            categories: {
              grocery: { count: 2, nearest: { name: "Biedronka", distance_m: 200 } },
              school: { count: 1, nearest: { name: "Szkoła Podstawowa", distance_m: 350 } },
              pharmacy: { count: 1, nearest: { name: "Apteka", distance_m: 180 } },
              restaurant: { count: 5, nearest: { name: "Restauracja", distance_m: 100 } },
              health: { count: 1, nearest: null },
              park: { count: 1, nearest: { name: "Park Miejski", distance_m: 400 } },
              gym: { count: 0, nearest: null },
              bank: { count: 1, nearest: { name: "Bank PKO", distance_m: 250 } }
            }
          },
          traffic: {
            destination: "Centrum miasta",
            duration_minutes: 15,
            duration_in_traffic_minutes: 20,
            traffic_ratio: 1.33,
            traffic_level: "medium",
            distance_km: 5.5
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${action || 'full'} request for ${latitude}, ${longitude} with radius ${radius}m`);

    let response: Record<string, unknown> = {};

    switch (action) {
      case "transit":
        response = await fetchTransitData(latitude, longitude, radius, apiKey);
        break;

      case "poi":
        response = await fetchPoiData(latitude, longitude, radius, apiKey, filterCategories);
        break;

      case "traffic":
        response = await fetchTrafficData(latitude, longitude, apiKey, reference_point);
        break;

      case "full":
      default:
        // Fetch all data in parallel
        const [transitData, poiData, trafficData] = await Promise.all([
          fetchTransitData(latitude, longitude, radius, apiKey),
          fetchPoiData(latitude, longitude, radius, apiKey),
          fetchTrafficData(latitude, longitude, apiKey, reference_point)
        ]);

        response = {
          transit: transitData,
          poi: poiData,
          traffic: trafficData,
          radius_m: radius
        };
        break;
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in google-location-data:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        mock: true 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

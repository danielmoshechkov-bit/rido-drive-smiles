import { useState, useEffect } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { supabase } from "@/integrations/supabase/client";

let googleMapsReady = false;
let loadingPromise: Promise<void> | null = null;

export function useGoogleMaps() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadGoogleMaps = async () => {
      // If already loaded
      if (googleMapsReady && window.google?.maps) {
        setIsLoaded(true);
        return;
      }

      // If loading in progress, wait for it
      if (loadingPromise) {
        try {
          await loadingPromise;
          setIsLoaded(true);
        } catch (err) {
          setError(err instanceof Error ? err : new Error("Failed to load Google Maps"));
        }
        return;
      }

      // Start loading
      loadingPromise = (async () => {
        try {
          // Get API key from Supabase config
          const { data: integration } = await supabase
            .from("location_integrations")
            .select("config")
            .eq("provider", "google_places")
            .limit(1)
            .maybeSingle();

          let apiKey = "";
          if (integration?.config && typeof integration.config === "object" && "google_api_key" in integration.config) {
            apiKey = (integration.config as { google_api_key?: string }).google_api_key || "";
          }

          if (!apiKey) {
            // Fallback: try env variable (for development)
            apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
          }

          if (!apiKey) {
            const error = new Error("GOOGLE_API_KEY_NOT_CONFIGURED");
            (error as any).isConfigError = true;
            throw error;
          }

          // Set options before loading
          setOptions({
            key: apiKey,
            v: "weekly",
            language: "pl",
            region: "PL",
          });

          // Load required libraries
          await Promise.all([
            importLibrary("places"),
            importLibrary("drawing"),
            importLibrary("geometry"),
            importLibrary("maps"),
          ]);

          googleMapsReady = true;
        } catch (err) {
          console.error("Error loading Google Maps:", err);
          loadingPromise = null;
          throw err;
        }
      })();

      try {
        await loadingPromise;
        setIsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load Google Maps"));
      }
    };

    loadGoogleMaps();
  }, []);

  return { isLoaded, error, google: isLoaded ? window.google : null };
}

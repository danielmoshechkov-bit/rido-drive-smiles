import { useState, useEffect, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    google: typeof google;
  }
}

const LOAD_TIMEOUT = 10000; // 10 seconds timeout

let googleMapsReady = false;
let loadingPromise: Promise<void> | null = null;

export function useGoogleMaps() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);

  const loadGoogleMaps = useCallback(async () => {
    // Reset states for retry
    setError(null);
    setIsTimedOut(false);

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
        console.error("[Google Maps] Waiting for existing load failed:", err);
        setError(err instanceof Error ? err : new Error("Failed to load Google Maps"));
      }
      return;
    }

    // Start loading
    loadingPromise = (async () => {
      try {
        console.log("[Google Maps] Starting to load...");

        // Get API key from Supabase config
        const { data: integration, error: dbError } = await supabase
          .from("location_integrations")
          .select("config")
          .eq("provider", "google_places")
          .limit(1)
          .maybeSingle();

        if (dbError) {
          console.error("[Google Maps] Database error:", dbError);
        }

        let apiKey = "";
        if (integration?.config && typeof integration.config === "object" && "google_api_key" in integration.config) {
          apiKey = (integration.config as { google_api_key?: string }).google_api_key || "";
        }

        if (!apiKey) {
          // Fallback: try env variable (for development)
          apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
        }

        if (!apiKey) {
          console.error("[Google Maps] API key not configured");
          const error = new Error("GOOGLE_API_KEY_NOT_CONFIGURED");
          (error as any).isConfigError = true;
          throw error;
        }

        console.log("[Google Maps] API key found, setting options...");

        // Set options before loading
        setOptions({
          key: apiKey,
          v: "weekly",
          language: "pl",
          region: "PL",
        });

        // Load required libraries with timeout (drawing library removed - deprecated)
        const loadPromise = Promise.all([
          importLibrary("places"),
          importLibrary("geometry"),
          importLibrary("maps"),
          importLibrary("marker"),
        ]);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("GOOGLE_MAPS_TIMEOUT"));
          }, LOAD_TIMEOUT);
        });

        console.log("[Google Maps] Loading libraries...");
        await Promise.race([loadPromise, timeoutPromise]);

        console.log("[Google Maps] Libraries loaded successfully");
        googleMapsReady = true;
      } catch (err) {
        console.error("[Google Maps] Load error:", err);
        loadingPromise = null;
        throw err;
      }
    })();

    try {
      await loadingPromise;
      setIsLoaded(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to load Google Maps");
      
      if (error.message === "GOOGLE_MAPS_TIMEOUT") {
        console.warn("[Google Maps] Load timed out after", LOAD_TIMEOUT / 1000, "seconds");
        setIsTimedOut(true);
      }
      
      setError(error);
    }
  }, []);

  useEffect(() => {
    loadGoogleMaps();
  }, [loadGoogleMaps]);

  const retryLoad = useCallback(() => {
    console.log("[Google Maps] Retrying load...");
    loadingPromise = null;
    googleMapsReady = false;
    loadGoogleMaps();
  }, [loadGoogleMaps]);

  return { 
    isLoaded, 
    error, 
    isTimedOut,
    retryLoad,
    google: isLoaded ? window.google : null 
  };
}

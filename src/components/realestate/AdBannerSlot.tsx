import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ImageIcon, Video, ExternalLink } from "lucide-react";

interface AdCampaign {
  id: string;
  title: string;
  media_type: "image" | "video";
  media_url: string;
  target_url: string | null;
}

interface AdBannerSlotProps {
  placement: "property_detail_map" | "property_detail_sidebar" | "search_results" | "listing_sidebar" | "property_detail_under_map";
  className?: string;
  height?: number; // Dynamic height for under_map placement
}

// Recommended sizes for each placement
const PLACEMENT_SIZES: Record<string, { width: string; height: string; description: string }> = {
  property_detail_map: { width: "100%", height: "120px", description: "Pod mapą (pełna szerokość)" },
  property_detail_under_map: { width: "100%", height: "auto", description: "Pod mapą z POI (pełna szerokość, wysokość do końca sekcji POI)" },
  property_detail_sidebar: { width: "300px", height: "250px", description: "Sidebar szczegółów" },
  search_results: { width: "100%", height: "90px", description: "Wyniki wyszukiwania (baner)" },
  listing_sidebar: { width: "300px", height: "600px", description: "Sidebar listy ogłoszeń (wieża)" },
};

export function AdBannerSlot({ placement, className = "", height }: AdBannerSlotProps) {
  const [ad, setAd] = useState<AdCampaign | null>(null);
  const [loading, setLoading] = useState(true);

  const placementInfo = PLACEMENT_SIZES[placement] || PLACEMENT_SIZES.property_detail_map;
  const containerHeight = height ? `${height}px` : placementInfo.height;

  useEffect(() => {
    const fetchAd = async () => {
      try {
        // For under_map, also check property_detail_map placement
        const placements = placement === "property_detail_under_map" 
          ? ["property_detail_under_map", "property_detail_map"]
          : [placement];

        const { data, error } = await supabase
          .from("ad_campaigns")
          .select("id, title, media_type, media_url, target_url")
          .in("placement", placements)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          setAd(data as AdCampaign);
          // Track impression
          await supabase
            .from("ad_campaigns")
            .update({ impressions: (data as any).impressions + 1 })
            .eq("id", data.id);
        }
      } catch (error) {
        console.error("Error fetching ad:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAd();
  }, [placement]);

  const handleClick = async () => {
    if (!ad) return;

    // Track click
    try {
      const { data: currentAd } = await supabase
        .from("ad_campaigns")
        .select("clicks")
        .eq("id", ad.id)
        .single();
        
      if (currentAd) {
        await supabase
          .from("ad_campaigns")
          .update({ clicks: currentAd.clicks + 1 })
          .eq("id", ad.id);
      }
    } catch (error) {
      console.error("Error tracking click:", error);
    }

    // Open link if exists
    if (ad.target_url) {
      window.open(ad.target_url, "_blank", "noopener,noreferrer");
    }
  };

  if (loading) {
    return (
      <div 
        className={`bg-muted/30 rounded-xl border border-dashed border-muted-foreground/20 flex items-center justify-center ${className}`}
        style={{ height: containerHeight }}
      >
        <div className="animate-pulse text-muted-foreground text-sm">Ładowanie...</div>
      </div>
    );
  }

  if (!ad) {
    return (
      <div 
        className={`bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2 ${className}`}
        style={{ height: containerHeight, minHeight: "80px" }}
      >
        <div className="flex items-center gap-2 text-muted-foreground/60">
          <ImageIcon className="h-5 w-5" />
          <span className="text-sm font-medium">Miejsce na reklamę</span>
        </div>
        <p className="text-xs text-muted-foreground/40">
          Skontaktuj się, aby wykupić przestrzeń reklamową
        </p>
      </div>
    );
  }

  return (
    <div 
      className={`relative rounded-xl overflow-hidden border bg-muted/10 cursor-pointer group transition-all hover:shadow-lg ${className}`}
      onClick={handleClick}
      style={{ height: containerHeight }}
    >
      {ad.media_type === "video" ? (
        <video
          src={ad.media_url}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <img
          src={ad.media_url}
          alt={ad.title}
          className="w-full h-full object-cover"
        />
      )}
      
      {/* Overlay with sponsor tag */}
      <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
        {ad.media_type === "video" ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
        Reklama
      </div>
      
      {/* Hover overlay with link icon */}
      {ad.target_url && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ExternalLink className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      )}
    </div>
  );
}

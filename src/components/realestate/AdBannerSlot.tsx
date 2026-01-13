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
  placement: "property_detail_map" | "search_results" | "listing_sidebar";
  className?: string;
}

export function AdBannerSlot({ placement, className = "" }: AdBannerSlotProps) {
  const [ad, setAd] = useState<AdCampaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAd = async () => {
      try {
        const { data, error } = await supabase
          .from("ad_campaigns")
          .select("id, title, media_type, media_url, target_url")
          .eq("placement", placement)
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
      <div className={`bg-muted/30 rounded-xl border border-dashed border-muted-foreground/20 h-[120px] flex items-center justify-center ${className}`}>
        <div className="animate-pulse text-muted-foreground text-sm">Ładowanie...</div>
      </div>
    );
  }

  if (!ad) {
    return (
      <div className={`bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border border-dashed border-muted-foreground/20 h-[120px] flex flex-col items-center justify-center gap-2 ${className}`}>
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
    >
      {ad.media_type === "video" ? (
        <video
          src={ad.media_url}
          className="w-full h-[120px] object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <img
          src={ad.media_url}
          alt={ad.title}
          className="w-full h-[120px] object-cover"
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

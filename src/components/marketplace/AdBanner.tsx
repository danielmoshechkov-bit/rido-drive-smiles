import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AdSlot {
  id: string;
  slot_key: string;
  name: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
}

interface AdBannerProps {
  slotKey: "search_below" | "sidebar";
  className?: string;
}

export function AdBanner({ slotKey, className }: AdBannerProps) {
  const [adSlot, setAdSlot] = useState<AdSlot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAdSlot = async () => {
      const { data, error } = await supabase
        .from("marketplace_ad_slots")
        .select("*")
        .eq("slot_key", slotKey)
        .eq("is_active", true)
        .single();

      if (!error && data) {
        setAdSlot(data);
      }
      setLoading(false);
    };

    loadAdSlot();
  }, [slotKey]);

  if (loading) {
    return null;
  }

  // No ad configured or no image
  if (!adSlot || !adSlot.image_url) {
    return null;
  }

  const content = (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted",
        slotKey === "search_below" ? "h-24 md:h-32" : "h-auto",
        className
      )}
    >
      <img
        src={adSlot.image_url}
        alt={adSlot.name}
        className="w-full h-full object-cover"
      />
    </div>
  );

  if (adSlot.link_url) {
    return (
      <a
        href={adSlot.link_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {content}
      </a>
    );
  }

  return content;
}

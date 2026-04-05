import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { ArrowLeft, GitCompare, Loader2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const CONDITION_LABELS: Record<string, string> = {
  nowy: "Nowy", jak_nowy: "Jak nowy", dobry: "Dobry", dostateczny: "Dostateczny", do_naprawy: "Do naprawy",
};

export default function MarketplaceCompare() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = (searchParams.get("ids") || "").split(",").filter(Boolean);
    if (ids.length === 0) { setLoading(false); return; }

    const load = async () => {
      const { data } = await supabase
        .from("general_listings")
        .select("id, title, price, condition, location, ai_score, description")
        .in("id", ids);
      if (data) setItems(data);

      const { data: photoData } = await supabase
        .from("general_listing_photos")
        .select("listing_id, url")
        .in("listing_id", ids)
        .order("display_order")
        .limit(ids.length);
      if (photoData) {
        const map: Record<string, string> = {};
        photoData.forEach(p => { if (!map[p.listing_id]) map[p.listing_id] = p.url; });
        setPhotos(map);
      }
      setLoading(false);
    };
    load();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <GitCompare className="h-16 w-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">Brak ogłoszeń do porównania</h2>
        <Button onClick={() => navigate("/marketplace")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Wróć do marketplace
        </Button>
      </div>
    );
  }

  // Find best/worst price
  const prices = items.map(i => i.price).filter(Boolean) as number[];
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const rows = [
    { label: "Cena", render: (i: any) => i.price ? `${i.price.toLocaleString("pl-PL")} zł` : "—", highlight: (i: any) => i.price === minPrice ? "bg-green-50 dark:bg-green-950/20" : i.price === maxPrice && prices.length > 1 ? "bg-red-50 dark:bg-red-950/20" : "" },
    { label: "Stan", render: (i: any) => CONDITION_LABELS[i.condition] || "—", highlight: () => "" },
    { label: "Lokalizacja", render: (i: any) => i.location || "—", highlight: () => "" },
    { label: "Ocena AI", render: (i: any) => i.ai_score ? `${Number(i.ai_score).toFixed(1)}/10` : "—", highlight: () => "" },
    { label: "Opis", render: (i: any) => i.description ? i.description.substring(0, 100) + "..." : "—", highlight: () => "" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Marketplace
            </Button>
          </div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" /> Porównanie
          </h1>
          <div />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr>
              <th className="p-3 text-left text-sm font-medium text-muted-foreground w-32" />
              {items.map(item => (
                <th key={item.id} className="p-3 text-center">
                  <div className="space-y-2">
                    <div className="w-24 h-24 mx-auto rounded-lg bg-muted overflow-hidden">
                      {photos[item.id] ? (
                        <img src={photos[item.id]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-sm line-clamp-2">{item.title}</p>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} className="border-t">
                <td className="p-3 text-sm font-medium text-muted-foreground">{row.label}</td>
                {items.map(item => (
                  <td key={item.id} className={cn("p-3 text-center text-sm", row.highlight(item))}>
                    {row.render(item)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t">
              <td className="p-3" />
              {items.map(item => (
                <td key={item.id} className="p-3 text-center">
                  <Button size="sm" onClick={() => navigate(`/marketplace/listing/${item.id}`)}>
                    Zobacz
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </main>
    </div>
  );
}

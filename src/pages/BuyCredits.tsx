import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { usePayment, useCredits } from "@/hooks/usePayment";
import { Loader2, MessageSquare, Sparkles, Star, ArrowLeft, Wallet, Tag, Check } from "lucide-react";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const typeConfig: Record<string, { label: string; icon: any; color: string }> = {
  sms: { label: "Kredyty SMS", icon: MessageSquare, color: "bg-blue-500/10 text-blue-600" },
  ai_photo: { label: "AI Zdjęcia", icon: Sparkles, color: "bg-purple-500/10 text-purple-600" },
  listing_featured: { label: "Wyróżnienia", icon: Star, color: "bg-amber-500/10 text-amber-600" },
};

export default function BuyCredits() {
  const navigate = useNavigate();
  const { initiatePayment, loading: paying } = usePayment();
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState<{ id: string; discount: number } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  const { balance: smsBalance } = useCredits("sms");
  const { balance: aiPhotoBalance } = useCredits("ai_photo");
  const { balance: featuredBalance } = useCredits("listing_featured");

  const balances: Record<string, number> = { sms: smsBalance, ai_photo: aiPhotoBalance, listing_featured: featuredBalance };

  useEffect(() => {
    supabase
      .from("billing_public_products" as any)
      .select("*")
      .order("amount_minor")
      .then(({ data, error }) => {
        if (error) {
          toast.error("Nie można bezpiecznie pobrać katalogu cen");
          setPackages([]);
          setLoading(false);
          return;
        }
        const canonicalPackages = ((data as any[]) || []).map((row) => ({
          ...row,
          id: row.price_id,
          credit_type: row.benefit_type,
          credits_amount: Number(row.benefit_amount),
          price: Number(row.amount_minor) / 100,
        }));
        setPackages(canonicalPackages);
        setLoading(false);
      });
  }, []);

  const applyPromo = async () => {
    if (!promo.trim()) return;
    setPromoChecking(true);
    const { data, error } = await supabase.rpc("validate_promo_code" as any, { _code: promo.trim() });
    setPromoChecking(false);
    const row = (data as any)?.[0];
    if (error || !row?.valid) {
      toast.error(row?.message || "Nieprawidłowy kod");
      setPromoApplied(null);
      return;
    }
    setPromoApplied({ id: row.id, discount: Number(row.discount_percent) });
    toast.success(`Kod aktywny: -${row.discount_percent}%`);
  };

  const handleBuy = async (pkg: any) => {
    if (promoApplied) {
      toast.error("Zakup z kodem promocyjnym wymaga serwerowej walidacji. Usuń kod, aby kontynuować bez rabatu.");
      return;
    }
    if (typeof pkg?.price_id !== "string" || !pkg.price_id) {
      toast.error("Pakiet nie ma kanonicznego identyfikatora. Zakup został zablokowany.");
      return;
    }

    await initiatePayment({
      priceId: pkg.price_id,
    });
  };

  const grouped = packages.reduce((acc: Record<string, any[]>, pkg) => {
    (acc[pkg.credit_type] = acc[pkg.credit_type] || []).push(pkg);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <UniversalHomeButton />
          <span className="font-bold text-lg text-primary">Kup kredyty</span>
          <div className="flex-1" />
          <LanguageSwitcher variant="outline" />
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Wróć
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-8">
        {/* Current balances */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(typeConfig).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <Card key={key} className="border-primary/10">
                <CardContent className="pt-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${cfg.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{cfg.label}</p>
                    <p className="text-xl font-bold">{balances[key] || 0}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Promo code */}
        <Card className="border-primary/20">
          <CardContent className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 text-primary font-medium">
              <Tag className="h-4 w-4"/> Kod promocyjny
            </div>
            <Input
              placeholder="Wpisz kod (np. WIOSNA20)"
              value={promo}
              onChange={(e) => { setPromo(e.target.value.toUpperCase()); setPromoApplied(null); }}
              className="flex-1"
              disabled={!!promoApplied}
            />
            {promoApplied ? (
              <Button variant="outline" onClick={() => { setPromoApplied(null); setPromo(""); }}>
                <Check className="h-4 w-4 mr-1 text-emerald-600"/> -{promoApplied.discount}% (usuń)
              </Button>
            ) : (
              <Button onClick={applyPromo} disabled={promoChecking || !promo.trim()}>
                {promoChecking ? <Loader2 className="h-4 w-4 animate-spin"/> : "Zastosuj"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Packages grouped by type */}
        {Object.entries(grouped).map(([type, pkgs]) => {
          const cfg = typeConfig[type] || { label: type, icon: Wallet, color: "bg-muted" };
          const Icon = cfg.icon;
          return (
            <div key={type} className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" /> {cfg.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(pkgs as any[]).map((pkg: any) => (
                  <Card key={pkg.id} className="hover:shadow-lg transition-shadow border-primary/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{pkg.name}</CardTitle>
                      <CardDescription>{pkg.credits_amount} kredytów</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {promoApplied ? (
                        <div>
                          <p className="text-sm line-through text-muted-foreground">{Number(pkg.price).toFixed(2)} zł</p>
                          <p className="text-2xl font-bold text-emerald-600">
                            {(Number(pkg.price) * (1 - promoApplied.discount / 100)).toFixed(2)} zł
                          </p>
                        </div>
                      ) : (
                        <p className="text-2xl font-bold text-primary">
                          {Number(pkg.price).toFixed(2)} zł
                        </p>
                      )}
                      <Button
                        className="w-full"
                        onClick={() => handleBuy(pkg)}
                        disabled={paying}
                      >
                        {paying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wallet className="h-4 w-4 mr-2" />}
                        Kup teraz
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}

        {packages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Brak dostępnych pakietów kredytów</p>
          </div>
        )}
      </main>
    </div>
  );
}

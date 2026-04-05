import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { useCart } from "@/hooks/useCart";
import { usePayment } from "@/hooks/usePayment";
import { ShoppingCart, X, ArrowLeft, Truck, Package, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function MarketplaceCart() {
  const navigate = useNavigate();
  const { items, removeFromCart, clearCart, loading } = useCart();
  const { initiatePayment, loading: paying } = usePayment();
  const [shipping, setShipping] = useState("inpost");
  const [inpostPoint, setInpostPoint] = useState("");

  const shippingCost = shipping === "personal" ? 0 : shipping === "inpost" ? 14.99 : 19.99;
  const subtotal = items.reduce((sum, i) => sum + (i.price || 0), 0);
  const total = subtotal + shippingCost;

  const handleCheckout = async () => {
    if (items.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Musisz być zalogowany");
      navigate("/gielda/logowanie");
      return;
    }

    // For now, process first item as a purchase
    const firstItem = items[0];
    const result = await initiatePayment({
      productType: "marketplace_purchase",
      productRefId: firstItem.listing_id,
      amount: total,
      description: `Zakup: ${firstItem.title}`,
      metadata: {
        seller_id: firstItem.user_id,
        listing_id: firstItem.listing_id,
        items_count: items.length,
      },
      deliveryType: shipping,
      inpostPointId: shipping === "inpost" ? inpostPoint : undefined,
      onSuccess: () => {
        clearCart();
        toast.success("Zamówienie złożone!");
      },
    });

    if (result?.simulated) {
      clearCart();
      navigate(`/payment/success?payment_id=${result.paymentId}`);
    }
  };

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
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <span className="font-bold text-lg text-primary">Koszyk</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Kontynuuj zakupy
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Twój koszyk jest pusty</h2>
            <p className="text-muted-foreground mb-4">Dodaj ogłoszenia do koszyka</p>
            <Button onClick={() => navigate("/marketplace")}>Przeglądaj ogłoszenia</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Items */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold">Produkty ({items.length})</h2>
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-destructive">Wyczyść</Button>
              </div>
              {items.map(item => (
                <Card key={item.listing_id} className="p-3 flex gap-3 items-center">
                  <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                    {item.photo_url ? (
                      <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => navigate(`/marketplace/listing/${item.listing_id}`)}
                      className="text-sm font-medium hover:text-primary transition truncate block text-left"
                    >
                      {item.title}
                    </button>
                    <span className="text-sm text-primary font-bold">
                      {item.price ? `${item.price.toLocaleString("pl-PL")}\u00A0zł` : "—"}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFromCart(item.listing_id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </Card>
              ))}

              {/* Shipping */}
              <Card className="p-4 mt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" /> Dostawa
                </h3>
                <RadioGroup value={shipping} onValueChange={setShipping} className="space-y-2">
                  <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted transition">
                    <RadioGroupItem value="inpost" id="inpost" />
                    <Label htmlFor="inpost" className="flex-1 cursor-pointer">
                      <span className="font-medium">InPost Paczkomat</span>
                      <span className="text-muted-foreground ml-2">14,99 zł</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted transition">
                    <RadioGroupItem value="dpd" id="dpd" />
                    <Label htmlFor="dpd" className="flex-1 cursor-pointer">
                      <span className="font-medium">Kurier DPD</span>
                      <span className="text-muted-foreground ml-2">19,99 zł</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted transition">
                    <RadioGroupItem value="personal" id="personal" />
                    <Label htmlFor="personal" className="flex-1 cursor-pointer">
                      <span className="font-medium">Odbiór osobisty</span>
                      <span className="text-muted-foreground ml-2">0 zł</span>
                    </Label>
                  </div>
                </RadioGroup>

                {shipping === "inpost" && (
                  <div className="mt-3">
                    <Label className="text-sm">Numer paczkomatu lub miejscowość</Label>
                    <Input
                      value={inpostPoint}
                      onChange={e => setInpostPoint(e.target.value)}
                      placeholder="np. WAW123M lub Warszawa"
                      className="mt-1"
                    />
                    {/* TODO: Podłączyć InPost Geowidget API po podpisaniu umowy ShipX */}
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Wyszukiwarka paczkomatów wkrótce
                    </p>
                  </div>
                )}
              </Card>
            </div>

            {/* Summary */}
            <div>
              <Card className="p-5 sticky top-24 shadow-lg border-primary/20">
                <h3 className="font-semibold text-lg mb-4">Podsumowanie</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Produkty</span>
                    <span>{subtotal.toLocaleString("pl-PL")}\u00A0zł</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dostawa</span>
                    <span>{shippingCost.toFixed(2)}\u00A0zł</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-base font-bold">
                    <span>Razem</span>
                    <span className="text-primary">{total.toLocaleString("pl-PL", { minimumFractionDigits: 2 })}\u00A0zł</span>
                  </div>
                </div>
                <Button
                  className="w-full mt-4"
                  size="lg"
                  onClick={handleCheckout}
                  disabled={paying}
                >
                  {paying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Zapłać {total.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł
                </Button>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

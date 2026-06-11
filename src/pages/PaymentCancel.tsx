import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft, ShoppingCart } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function PaymentCancel() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <LanguageSwitcher variant="outline" className="absolute top-4 right-4" />
      <Card className="max-w-md w-full shadow-xl">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          <XCircle className="h-16 w-16 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-bold">Płatność anulowana</h2>
          <p className="text-muted-foreground">Twoja płatność została anulowana. Żadne środki nie zostały pobrane.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Strona główna
            </Button>
            <Button className="flex-1" onClick={() => navigate("/marketplace/cart")}>
              <ShoppingCart className="h-4 w-4 mr-2" /> Wróć do koszyka
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

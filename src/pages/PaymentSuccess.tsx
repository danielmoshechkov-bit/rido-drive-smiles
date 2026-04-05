import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";

const productMessages: Record<string, { title: string; desc: string; back: string; backUrl: string }> = {
  marketplace_purchase: { title: "Zakup zakończony!", desc: "Gratulacje! Sprzedawca dostał Twoje dane kontaktowe.", back: "Wróć do marketplace", backUrl: "/marketplace" },
  ai_photo_package: { title: "Pakiet AI aktywowany!", desc: "Możesz teraz ulepszać zdjęcia w swoich ogłoszeniach.", back: "Moje ogłoszenia", backUrl: "/klient" },
  sms_credits: { title: "Kredyty SMS dodane!", desc: "Nowe kredyty SMS zostały dodane do Twojego konta.", back: "Panel klienta", backUrl: "/klient" },
  ai_credits: { title: "Kredyty AI dodane!", desc: "Możesz teraz korzystać z funkcji AI.", back: "Panel klienta", backUrl: "/klient" },
  listing_featured: { title: "Ogłoszenie wyróżnione!", desc: "Twoje ogłoszenie jest teraz wyróżnione na 7 dni.", back: "Moje ogłoszenia", backUrl: "/klient" },
};

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = params.get("payment_id");
  const [status, setStatus] = useState<"loading" | "paid" | "error">("loading");
  const [payment, setPayment] = useState<any>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!paymentId) { setStatus("error"); return; }

    const poll = async () => {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();

      if (data?.status === "paid") {
        setPayment(data);
        setStatus("paid");
        return;
      }
      if (data?.status === "failed" || data?.status === "cancelled") {
        setPayment(data);
        setStatus("error");
        return;
      }

      if (attempts < 15) {
        setTimeout(() => setAttempts(a => a + 1), 2000);
      } else {
        setStatus("error");
      }
    };

    poll();
  }, [paymentId, attempts]);

  const msg = payment ? productMessages[payment.product_type] || productMessages.marketplace_purchase : productMessages.marketplace_purchase;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-xl">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <h2 className="text-xl font-semibold">Weryfikujemy płatność...</h2>
              <p className="text-muted-foreground text-sm">To może potrwać kilka sekund</p>
            </>
          )}
          {status === "paid" && (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold text-green-700">{msg.title}</h2>
              <p className="text-muted-foreground">{msg.desc}</p>
              {payment?.amount && (
                <p className="text-lg font-semibold text-primary">
                  {Number(payment.amount).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł
                </p>
              )}
              <Button className="w-full mt-4" onClick={() => navigate(msg.backUrl)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> {msg.back}
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
              <h2 className="text-xl font-bold text-destructive">Błąd płatności</h2>
              <p className="text-muted-foreground">Płatność nie została potwierdzona. Spróbuj ponownie lub skontaktuj się z obsługą.</p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => navigate("/")}>
                  Strona główna
                </Button>
                <Button className="flex-1" onClick={() => navigate("/marketplace")}>
                  Spróbuj ponownie
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Smartphone, Home, Mail } from "lucide-react";

export default function RegisterSuccess() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <div className="container mx-auto max-w-md">
        <Card className="text-center">
          <CardHeader className="pb-2">
            <div className="flex justify-center mb-4">
              <img
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
                alt="RIDO"
                className="h-16 w-16"
              />
            </div>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Dziękujemy za rejestrację!
            </h1>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-center gap-2 text-primary">
                <Mail className="h-5 w-5" />
                <span className="font-medium">Sprawdź swoją pocztę</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Wysłaliśmy link aktywacyjny na podany adres e-mail.
                Kliknij w link, aby aktywować swoje konto.
              </p>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-4">
                W międzyczasie pobierz naszą aplikację na smartfona
              </p>
              <Button
                onClick={() => navigate("/install")}
                size="lg"
                className="w-full gap-2"
              >
                <Smartphone className="h-5 w-5" />
                Pobierz aplikację na smartfona
              </Button>
            </div>

            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="w-full gap-2"
            >
              <Home className="h-4 w-4" />
              Powrót do strony głównej
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

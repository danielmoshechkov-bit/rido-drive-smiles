import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, LogIn, Download } from "lucide-react";

const EmailConfirmed = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="Get RIDO Logo" 
              className="h-16 w-16 mx-auto mb-4"
            />
          </div>
          <div className="flex justify-center">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-green-600">
            Dziękujemy za potwierdzenie!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            Twoje konto zostało aktywowane. Możesz teraz zalogować się do portalu kierowcy.
          </p>
          
          <div className="space-y-3">
            <Button asChild className="w-full" size="lg">
              <Link to="/auth">
                <LogIn className="h-4 w-4 mr-2" />
                Zaloguj się
              </Link>
            </Button>
            
            <Button asChild variant="outline" className="w-full">
              <Link to="/install">
                <Download className="h-4 w-4 mr-2" />
                Pobierz aplikację na telefon
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailConfirmed;

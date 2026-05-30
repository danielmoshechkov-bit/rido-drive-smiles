import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Construction, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface ComingSoonProps {
  title: string;
  description?: string;
}

const ComingSoon = ({ title, description }: ComingSoonProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-16 flex items-center justify-center">
        <Card className="max-w-xl w-full p-10 text-center shadow-soft border-2 border-primary/10">
          <div className="w-16 h-16 rounded-full bg-gradient-hero text-primary-foreground flex items-center justify-center mx-auto mb-6">
            <Construction className="h-8 w-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">{title}</h1>
          <p className="text-muted-foreground mb-2">Strona w przygotowaniu — wkrótce dostępna.</p>
          {description && <p className="text-sm text-muted-foreground mb-6">{description}</p>}
          <Button asChild variant="default" className="mt-4">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Wróć na stronę główną
            </Link>
          </Button>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default ComingSoon;

import { Card } from "@/components/ui/card";

const ProsteModele = () => {
  return (
    <section id="proste-modele" className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Proste modele rozliczenia
          </h2>
        </div>

        {/* Two pricing models - Full width side by side */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Model pierwszy - 159 zł (LEFT SIDE) */}
          <Card className="relative p-8 bg-gradient-accent shadow-gold border-accent/20">
            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
              PROMOCJA
            </div>
            <div className="text-center space-y-4">
              <h3 className="text-xl font-bold text-accent-foreground">
                MODEL PIERWSZY
              </h3>
              <div className="text-5xl font-bold text-accent-foreground">
                159 zł + 0% podatku
              </div>
              <p className="text-sm text-accent-foreground/80">
                Warunek: aktywne korzystanie z karty paliwowej
              </p>
            </div>
          </Card>

          {/* Model drugi - 39 zł (RIGHT SIDE) */}
          <Card className="relative p-8 bg-gradient-accent shadow-gold border-accent/20">
            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
              PROMOCJA
            </div>
            <div className="text-center space-y-4">
              <h3 className="text-xl font-bold text-accent-foreground">
                MODEL DRUGI
              </h3>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl line-through text-accent-foreground/60">50 zł</span>
                <span className="text-lg text-accent-foreground">→</span>
                <span className="text-5xl font-bold text-accent-foreground">39 zł + 8% podatku</span>
              </div>
              <p className="text-sm text-accent-foreground/80">
                Dla pierwszych 50 kierowców
              </p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default ProsteModele;
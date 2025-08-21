import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Hero = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="home" className="relative overflow-hidden bg-gradient-subtle py-8">
      {/* Background Animation */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-primary/10 rounded-full animate-float-slow"></div>
        <div className="absolute top-3/4 right-1/4 w-24 h-24 bg-accent/10 rounded-full animate-float-medium"></div>
        <div className="absolute top-1/2 left-3/4 w-16 h-16 bg-primary/15 rounded-full animate-float-fast"></div>
        <div className="absolute top-1/6 right-1/3 w-20 h-20 bg-accent/15 rounded-full animate-float-slow"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Title with mascot */}
          <div className="space-y-4 text-left relative">
            {/* Animated mascot */}
            <div className="absolute -top-4 -right-4 md:-right-8">
              <img 
                src="/lovable-uploads/d636ba1c-61cd-484b-8be5-0cfe55d7386b.png" 
                alt="RIDO Mascot" 
                className="w-16 h-16 md:w-20 md:h-20 animate-bounce"
              />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              <span className="text-primary">RIDO</span> — partner kierowców 
              <span className="block">
                <span className="text-black">Uber</span>, <span className="text-[#34D186]">Bolt</span>, <span className="text-red-600">FreeNow</span>
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl">
              Zarabiaj więcej, rozliczaj się prosto. Wypłaty co tydzień. Zero ukrytych kosztów.
            </p>
          </div>


          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              variant="accent" 
              size="lg"
              onClick={() => scrollToSection('kontakt')}
              className="text-lg px-8"
            >
              Dołącz teraz
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => scrollToSection('jak-zaczac')}
              className="text-lg px-8"
            >
              Jak zacząć
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
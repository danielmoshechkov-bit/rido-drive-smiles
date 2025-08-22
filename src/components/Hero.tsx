import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

const Hero = () => {
  const { t } = useTranslation();
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth'
      });
    }
  };
  return <section id="home" className="relative overflow-hidden bg-gradient-subtle">
      {/* Background Animation with Mascots - 3x more mascots */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Row 1 */}
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[5%] left-[8%] h-8 w-8 animate-float-slow opacity-5" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[12%] left-[25%] h-6 w-6 animate-float-medium opacity-6" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[8%] left-[45%] h-10 w-10 animate-float-fast opacity-7" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[15%] left-[65%] h-7 w-7 animate-float-slow opacity-5" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[6%] left-[85%] h-9 w-9 animate-float-medium opacity-6" />
        
        {/* Row 2 */}
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[25%] left-[15%] h-6 w-6 animate-float-fast opacity-6" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[28%] left-[35%] h-8 w-8 animate-float-slow opacity-7" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[22%] left-[55%] h-7 w-7 animate-float-medium opacity-5" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[30%] left-[75%] h-10 w-10 animate-float-fast opacity-6" />

        {/* Row 3 */}
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[45%] left-[10%] h-9 w-9 animate-float-medium opacity-6" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[50%] left-[30%] h-6 w-6 animate-float-slow opacity-5" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[48%] left-[50%] h-8 w-8 animate-float-fast opacity-7" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[42%] left-[70%] h-7 w-7 animate-float-medium opacity-5" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[52%] left-[90%] h-9 w-9 animate-float-slow opacity-6" />

        {/* Row 4 */}
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[65%] left-[12%] h-8 w-8 animate-float-fast opacity-6" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[70%] left-[28%] h-6 w-6 animate-float-slow opacity-5" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[68%] left-[48%] h-10 w-10 animate-float-medium opacity-7" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[72%] left-[68%] h-7 w-7 animate-float-fast opacity-6" />

        {/* Row 5 */}
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[85%] left-[20%] h-9 w-9 animate-float-medium opacity-5" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[88%] left-[40%] h-6 w-6 animate-float-slow opacity-6" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[82%] left-[60%] h-8 w-8 animate-float-fast opacity-7" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[90%] left-[80%] h-7 w-7 animate-float-medium opacity-5" />
      </div>

      {/* Top Bar with purple frame */}
      <div className="bg-primary text-white py-4 text-center text-sm md:text-base font-medium relative z-10 shadow-soft">
        <div className="container mx-auto px-4">
          <span className="font-bold">Get RIDO</span> — Twój partner <span className="font-semibold">Uber</span>, <span className="font-semibold">Bolt</span>, <span className="font-semibold">FreeNow</span>. 
          <span className="block mt-1">Stworzone przez kierowców, dla kierowców.</span>
        </div>
      </div>

      {/* White rectangle with main slogan */}
      <Card className="mx-4 md:mx-8 mt-6 p-6 md:p-8 bg-white text-center relative z-10 shadow-soft">
        <div className="space-y-4">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">
            <span className="text-primary font-bold">Get RIDO</span> — {t('hero.description')}
          </h1>
          
        </div>
      </Card>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto space-y-6 md:space-y-8 pt-6 md:pt-8 py-0">
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 max-w-4xl mx-auto">
            <div className="bg-primary text-primary-foreground p-4 md:p-6 rounded-lg shadow-purple">
              <p className="text-base md:text-lg font-bold text-center">
                ODBIERZ SWOJĄ WYPŁATĘ GOTÓWKĄ KAŻDY WTOREK U NAS W BIURZE
              </p>
            </div>
            <img src="/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="Get RIDO Mascot" className="h-16 w-16 md:h-20 md:w-20 animate-bounce" />
          </div>

          {/* Two pricing models - Full width side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-4xl mx-auto">
            {/* Model drugi - 159 zł (Left) */}
            <Card className="relative p-6 md:p-8 bg-gradient-accent shadow-gold border-accent/20">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                PROMOCJA
              </div>
              <div className="text-center space-y-3 md:space-y-4">
                <h3 className="text-lg md:text-xl font-bold text-accent-foreground">
                  MODEL PIERWSZY
                </h3>
                <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-accent-foreground">159 zł + 0% podatku</div>
                <p className="text-xs md:text-sm text-accent-foreground/80">Za tygodniowe rozliczenie za jedną i więcej aplikacji 
Warunek: aktywne korzystanie z karty paliwowej</p>
              </div>
            </Card>

            {/* Model pierwszy - 39 zł (Right) */}
            <Card className="relative p-6 md:p-8 bg-gradient-accent shadow-gold border-accent/20">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                PROMOCJA
              </div>
              <div className="text-center space-y-3 md:space-y-4">
                <h3 className="text-lg md:text-xl font-bold text-accent-foreground">
                  MODEL DRUGI
                </h3>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 md:gap-3">
                  <span className="text-2xl md:text-3xl line-through text-accent-foreground/60 font-semibold">50 zł</span>
                  <span className="text-lg md:text-xl text-accent-foreground">→</span>
                  <span className="text-3xl md:text-4xl lg:text-5xl font-bold text-accent-foreground">39 zł + 8% podatku</span>
                </div>
                <p className="text-xs md:text-sm text-accent-foreground/80">Za tygodniowe rozliczenie za jedną i więcej aplikacji 
Dla pierwszych 50 kierowców</p>
              </div>
            </Card>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pb-6 md:pb-8">
            <Button variant="accent" size="lg" onClick={() => scrollToSection('kontakt')} className="text-base md:text-lg px-6 md:px-8 w-full sm:w-auto">
              {t('nav.joinNow')}
            </Button>
            <Button variant="outline" size="lg" onClick={() => scrollToSection('jak-zaczac')} className="text-base md:text-lg px-6 md:px-8 w-full sm:w-auto">
              {t('nav.howToStart')}
            </Button>
          </div>
        </div>
      </div>
    </section>;
};
export default Hero;
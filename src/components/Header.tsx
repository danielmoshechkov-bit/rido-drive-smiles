import { Button } from "@/components/ui/button";
import LanguageSelector from "@/components/LanguageSelector";
import { useTranslation } from "react-i18next";

const Header = () => {
  const { t } = useTranslation();
  
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center space-x-2">
          <img 
            src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
            alt="Get RIDO Logo" 
            className="h-8 w-8"
          />
          <span className="text-xl font-bold text-primary">Get RIDO</span>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          <button
            onClick={() => scrollToSection('home')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {t('nav.home')}
          </button>
          <button
            onClick={() => scrollToSection('cennik')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {t('nav.pricing')}
          </button>
          <button
            onClick={() => scrollToSection('jak-zaczac')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {t('nav.howToStart')}
          </button>
          <button
            onClick={() => scrollToSection('wymagania')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {t('nav.requirements')}
          </button>
          <button
            onClick={() => scrollToSection('karty-paliwowe')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {t('nav.fuelCards')}
          </button>
          <button
            onClick={() => scrollToSection('faq')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {t('nav.faq')}
          </button>
          <button
            onClick={() => scrollToSection('kontakt')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {t('nav.contact')}
          </button>
        </nav>

        {/* CTA Button and Language Selector */}
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <Button variant="accent" size="sm">
            {t('hero.buttons.join')}
          </Button>
        </div>
      </div>

      {/* Mobile menu - simplified for now */}
      <div className="md:hidden px-4 pb-4">
        <nav className="flex flex-wrap gap-4 text-sm">
          <button onClick={() => scrollToSection('cennik')} className="text-foreground hover:text-primary">
            {t('nav.pricing')}
          </button>
          <button onClick={() => scrollToSection('jak-zaczac')} className="text-foreground hover:text-primary">
            {t('nav.howToStart')}
          </button>
          <button onClick={() => scrollToSection('kontakt')} className="text-foreground hover:text-primary">
            {t('nav.contact')}
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;
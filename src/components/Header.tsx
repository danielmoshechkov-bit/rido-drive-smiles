import { Button } from "@/components/ui/button";

const Header = () => {
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
            src="/lovable-uploads/7503999e-6dce-49e0-b88d-2d447d2a0d2e.png" 
            alt="RIDO Logo" 
            className="h-8 w-8"
          />
          <span className="text-xl font-bold text-primary">RIDO</span>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          <button
            onClick={() => scrollToSection('home')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Strona główna
          </button>
          <button
            onClick={() => scrollToSection('proste-modele')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Modele
          </button>
          <button
            onClick={() => scrollToSection('cennik')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Cennik
          </button>
          <button
            onClick={() => scrollToSection('jak-zaczac')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Jak zacząć
          </button>
          <button
            onClick={() => scrollToSection('wymagania')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Wymagania
          </button>
          <button
            onClick={() => scrollToSection('karty-paliwowe')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Karty paliwowe
          </button>
          <button
            onClick={() => scrollToSection('faq')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            FAQ
          </button>
          <button
            onClick={() => scrollToSection('kontakt')}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Kontakt
          </button>
        </nav>

        {/* CTA Button */}
        <Button variant="accent" size="sm">
          Dołącz teraz
        </Button>
      </div>

      {/* Purple bar with text */}
      <div className="bg-primary text-primary-foreground py-3 text-center text-sm font-medium">
        Dwa modele rozliczeń - wybierz najlepszy dla siebie
      </div>

      {/* Mobile menu - simplified for now */}
      <div className="md:hidden px-4 pb-4">
        <nav className="flex flex-wrap gap-4 text-sm">
          <button onClick={() => scrollToSection('proste-modele')} className="text-foreground hover:text-primary">
            Modele
          </button>
          <button onClick={() => scrollToSection('jak-zaczac')} className="text-foreground hover:text-primary">
            Jak zacząć
          </button>
          <button onClick={() => scrollToSection('kontakt')} className="text-foreground hover:text-primary">
            Kontakt
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;
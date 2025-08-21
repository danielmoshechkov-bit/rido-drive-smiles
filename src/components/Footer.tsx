const Footer = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-primary text-primary-foreground py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="Get RIDO Logo" 
                className="h-8 w-8"
              />
              <span className="text-xl font-bold">Get RIDO</span>
            </div>
            <p className="text-primary-foreground/80 text-sm max-w-md">
              Partner kierowców Uber i Bolt. Proste rozliczenia, przejrzysty cennik, 
              wypłaty co tydzień, wsparcie 7 dni w tygodniu.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Menu</h4>
            <nav className="space-y-2 text-sm">
              <button 
                onClick={() => scrollToSection('home')}
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Strona główna
              </button>
              <button 
                onClick={() => scrollToSection('cennik')}
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Cennik
              </button>
              <button 
                onClick={() => scrollToSection('jak-zaczac')}
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Jak zacząć
              </button>
              <button 
                onClick={() => scrollToSection('kontakt')}
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Kontakt
              </button>
            </nav>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold mb-4">Informacje</h4>
            <nav className="space-y-2 text-sm">
              <a 
                href="#" 
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Polityka prywatności
              </a>
              <a 
                href="#" 
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                RODO
              </a>
              <a 
                href="#" 
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Regulamin
              </a>
            </nav>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-8 pt-8 text-center">
          <p className="text-primary-foreground/60 text-sm">
            getrido.pl - Get RIDO. Wszystkie prawa zastrzeżone.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
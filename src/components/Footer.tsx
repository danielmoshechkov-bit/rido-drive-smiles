import { Link } from "react-router-dom";

const Footer = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-primary text-primary-foreground py-3">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-6">
          {/* Logo and Description */}
          <div className="md:col-span-2">
            <div className="flex items-center space-x-2 mb-3">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="Get RIDO Logo" 
                className="h-8 w-8"
              />
              <span className="text-xl font-bold">GetRido</span>
            </div>
            <p className="text-primary-foreground/80 text-sm max-w-md">
              GetRido – inteligentny portal ogłoszeń i usług z AI na co dzień.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-3">Menu</h4>
            <nav className="space-y-1.5 text-sm">
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
            <h4 className="font-semibold mb-3">Informacje prawne</h4>
            <nav className="space-y-1.5 text-sm">
              <Link 
                to="/prawne?tab=polityka" 
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Polityka prywatności
              </Link>
              <Link 
                to="/prawne?tab=rodo" 
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                RODO
              </Link>
              <Link 
                to="/prawne?tab=regulamin" 
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Regulamin
              </Link>
              <Link 
                to="/prawne?tab=cookies" 
                className="block text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Cookies 🍪
              </Link>
            </nav>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-6 pt-4 text-center">
          <p className="text-primary-foreground/60 text-sm">
            © 2025 GetRido by CAR4RIDE SP. Z O.O. Wszystkie prawa zastrzeżone.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
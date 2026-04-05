import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const Footer = () => {
  const { t } = useTranslation();

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-primary text-primary-foreground py-3">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Logo and Description */}
          <div>
            <Link to="/easy" className="flex items-center space-x-2 mb-2">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="Get RIDO Logo" 
                className="h-6 w-6"
              />
              <span className="text-lg font-bold">GetRido</span>
            </Link>
            <p className="text-primary-foreground/80 text-xs max-w-xs">
              {t('footer.description', 'GetRido – inteligentny portal, gdzie sprzedajesz, kupujesz i zlecasz z AI na co dzień.')}
            </p>
          </div>

          {/* Menu */}
          <div>
            <h4 className="font-semibold mb-2 text-sm">{t('footer.menu', 'Menu')}</h4>
            <nav className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <button 
                onClick={() => scrollToSection('home')}
                className="text-left text-primary-foreground/80 hover:text-primary-foreground hover:underline transition-colors"
              >
                {t('footer.home', 'Strona główna')}
              </button>
              <button 
                onClick={() => scrollToSection('cennik')}
                className="text-left text-primary-foreground/80 hover:text-primary-foreground hover:underline transition-colors"
              >
                {t('footer.pricing', 'Cennik')}
              </button>
              <button 
                onClick={() => scrollToSection('jak-zaczac')}
                className="text-left text-primary-foreground/80 hover:text-primary-foreground hover:underline transition-colors"
              >
                {t('footer.howToStart', 'Jak zacząć')}
              </button>
              <button 
                onClick={() => scrollToSection('kontakt')}
                className="text-left text-primary-foreground/80 hover:text-primary-foreground hover:underline transition-colors"
              >
                {t('footer.contact', 'Kontakt')}
              </button>
            </nav>
          </div>

          {/* Legal Links */}
          <div>
            <Link 
              to="/prawne" 
              className="font-semibold mb-2 text-sm block hover:underline transition-colors"
            >
              {t('footer.info', 'Informacje prawne')}
            </Link>
            <nav className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Link 
                to="/prawne?tab=polityka" 
                className="text-primary-foreground/80 hover:text-primary-foreground hover:underline transition-colors"
              >
                {t('footer.privacy', 'Polityka prywatności')}
              </Link>
              <Link 
                to="/prawne?tab=rodo" 
                className="text-primary-foreground/80 hover:text-primary-foreground hover:underline transition-colors"
              >
                {t('footer.gdpr', 'RODO')}
              </Link>
              <Link 
                to="/prawne?tab=regulamin" 
                className="text-primary-foreground/80 hover:text-primary-foreground hover:underline transition-colors"
              >
                {t('footer.terms', 'Regulamin')}
              </Link>
              <Link 
                to="/prawne?tab=cookies" 
                className="text-primary-foreground/80 hover:text-primary-foreground hover:underline transition-colors"
              >
                {t('common.cookies', 'Cookies 🍪')}
              </Link>
            </nav>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-4 pt-3 text-center">
          <p className="text-primary-foreground/60 text-xs">
            © 2025 {t('footer.copyright', 'GetRido. Wszystkie prawa zastrzeżone.')}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

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
    <footer className="bg-primary text-primary-foreground py-10">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Logo and Description */}
          <div>
            <Link to="/" className="flex items-center space-x-2 mb-3">
              <img
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
                alt="Get RIDO Logo"
                className="h-8 w-8"
              />
              <span className="text-xl font-extrabold tracking-tight">GetRido</span>
            </Link>
            <p className="text-primary-foreground/90 text-sm md:text-base font-medium leading-relaxed max-w-xs">
              {t('footer.description', 'GetRido – inteligentny portal, gdzie sprzedajesz, kupujesz i zlecasz z AI na co dzień.')}
            </p>
          </div>

          {/* Menu */}
          <div>
            <h4 className="font-extrabold mb-3 text-base md:text-lg">{t('footer.menu', 'Menu')}</h4>
            <nav className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:text-base font-semibold">
              <Link to="/" className="text-primary-foreground/90 hover:text-primary-foreground hover:underline transition-colors">
                {t('footer.home', 'Strona główna')}
              </Link>
              <Link to="/cennik" className="text-primary-foreground/90 hover:text-primary-foreground hover:underline transition-colors">
                {t('footer.pricing', 'Cennik')}
              </Link>
              <Link to="/jak-zaczac" className="text-primary-foreground/90 hover:text-primary-foreground hover:underline transition-colors">
                {t('footer.howToStart', 'Jak zacząć')}
              </Link>
              <Link to="/kontakt" className="text-primary-foreground/90 hover:text-primary-foreground hover:underline transition-colors">
                {t('footer.contact', 'Kontakt')}
              </Link>
            </nav>
          </div>

          {/* Legal Links */}
          <div>
            <Link to="/prawne" className="font-extrabold mb-3 text-base md:text-lg block hover:underline transition-colors">
              {t('footer.info', 'Informacje prawne')}
            </Link>
            <nav className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:text-base font-semibold">
              <Link to="/prawne?tab=polityka" className="text-primary-foreground/90 hover:text-primary-foreground hover:underline transition-colors">
                {t('footer.privacy', 'Polityka prywatności')}
              </Link>
              <Link to="/prawne?tab=rodo" className="text-primary-foreground/90 hover:text-primary-foreground hover:underline transition-colors">
                {t('footer.gdpr', 'RODO')}
              </Link>
              <Link to="/prawne?tab=regulamin" className="text-primary-foreground/90 hover:text-primary-foreground hover:underline transition-colors">
                {t('footer.terms', 'Regulamin')}
              </Link>
              <Link to="/prawne?tab=cookies" className="text-primary-foreground/90 hover:text-primary-foreground hover:underline transition-colors">
                {t('common.cookies', 'Cookies 🍪')}
              </Link>
            </nav>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-8 pt-4 text-center">
          <p className="text-primary-foreground/70 text-sm font-medium">
            © 2025 {t('footer.copyright', 'GetRido. Wszystkie prawa zastrzeżone.')}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

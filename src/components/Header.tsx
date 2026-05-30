import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AuthModal } from "@/components/auth/AuthModal";

const navItems = [
  { label: 'Cennik', to: '/cennik' },
  { label: 'Jak zacząć', to: '/jak-zaczac' },
  { label: 'Kontakt', to: '/kontakt' },
];


const Header = () => {
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
          <img
            src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
            alt="GetRido Logo"
            className="h-8 w-8"
          />
          <span className="text-xl font-bold text-primary">GetRido</span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-5 lg:space-x-6">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* CTA Button and Language Selector */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Button variant="accent" size="sm" onClick={() => setShowLoginModal(true)}>
            Zaloguj się
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <div className="md:hidden px-4 pb-3 overflow-x-auto scrollbar-hide">
        <nav className="flex gap-4 text-sm w-max">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap text-foreground hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Auth Modal */}
      <AuthModal
        open={showLoginModal}
        onOpenChange={setShowLoginModal}
        redirectAfterLogin="/klient"
      />
    </header>
  );
};

export default Header;
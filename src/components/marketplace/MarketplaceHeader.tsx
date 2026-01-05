import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogIn, User, Heart, Bell } from "lucide-react";

interface MarketplaceHeaderProps {
  user: any;
  favoritesCount?: number;
}

export function MarketplaceHeader({ user, favoritesCount = 0 }: MarketplaceHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => navigate("/gielda")}
          >
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="RIDO Logo" 
              className="h-9 w-9"
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                RIDO <span className="text-primary">Marketplace</span>
              </h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <a href="/gielda" className="text-sm font-medium hover:text-primary transition-colors">
              Pojazdy
            </a>
            <span className="text-sm text-muted-foreground cursor-not-allowed">
              Usługi (wkrótce)
            </span>
            <span className="text-sm text-muted-foreground cursor-not-allowed">
              Mini-market (wkrótce)
            </span>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button variant="ghost" size="icon" className="relative">
                  <Heart className="h-5 w-5" />
                  {favoritesCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {favoritesCount}
                    </span>
                  )}
                </Button>
                <Button variant="ghost" size="icon">
                  <Bell className="h-5 w-5" />
                </Button>
                <Button variant="outline" onClick={() => navigate("/driver")}>
                  <User className="h-4 w-4 mr-2" />
                  Moje konto
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/")}>
                  Zaloguj się
                </Button>
                <Button onClick={() => navigate("/rejestracja")}>
                  <LogIn className="h-4 w-4 mr-2" />
                  Dołącz
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { captureReferralCodeFromUrl, getStoredReferralCode, clearReferralCode } from "@/lib/referralTracking";
import { Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const BANNER_DISMISSED_KEY = "getrido_ref_banner_dismissed";

export const ReferralCapture = () => {
  const location = useLocation();
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(BANNER_DISMISSED_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    // Capture on every navigation (handles both initial load and SPA route changes)
    captureReferralCodeFromUrl();
    setActiveCode(getStoredReferralCode());
  }, [location.pathname, location.search]);

  const handleDismiss = () => {
    try { sessionStorage.setItem(BANNER_DISMISSED_KEY, "1"); } catch {}
    setDismissed(true);
  };

  // Show banner only on landing/auth/register pages
  const showOnPaths = ["/", "/easy", "/gielda", "/gielda/rejestracja", "/gielda/logowanie", "/cennik", "/jak-zaczac"];
  const shouldShow = activeCode && !dismissed && showOnPaths.some(p => location.pathname === p);

  if (!shouldShow) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Gift className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">
            Polecenie aktywne — kod <strong>{activeCode}</strong>. Załóż konto, aby otrzymać <strong>20&nbsp;zł bonusu powitalnego</strong>.
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-7 w-7 p-0 text-primary-foreground hover:bg-white/20">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

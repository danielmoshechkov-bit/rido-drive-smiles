import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface UniversalHomeButtonProps {
  className?: string;
}

export function UniversalHomeButton({ className }: UniversalHomeButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (location.pathname === '/') {
      window.location.href = '/';
    } else {
      navigate('/');
    }
  };

  return (
    <button 
      onClick={handleClick}
      className={`flex items-center gap-2 hover:opacity-80 transition-opacity ${className || ''}`}
    >
      <img 
        src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
        alt="RIDO" 
        className="h-6 w-6"
      />
      <span className="text-sm font-medium text-foreground">
        {t('header.home')}
      </span>
    </button>
  );
}

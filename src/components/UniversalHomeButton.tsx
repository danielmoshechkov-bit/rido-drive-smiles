import { useNavigate, useLocation } from "react-router-dom";

interface UniversalHomeButtonProps {
  className?: string;
}

export function UniversalHomeButton({ className }: UniversalHomeButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // If we're already on home, force a refresh to reset any state
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
        Strona główna
      </span>
    </button>
  );
}

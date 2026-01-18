import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useModuleVisibility } from '@/hooks/useModuleVisibility';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MapsLayout from '@/components/maps/MapsLayout';

const GetRidoMaps = () => {
  const navigate = useNavigate();
  const { role, loading: roleLoading } = useUserRole();
  const { isVisible, loading: visibilityLoading } = useModuleVisibility('maps');

  const loading = roleLoading || visibilityLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If user doesn't have access and is not admin, redirect
  if (!isVisible && role !== 'admin') {
    navigate('/');
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Minimal Header */}
      <header className="border-b bg-card h-12 flex items-center px-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span 
          className="font-bold ml-2 cursor-pointer"
          onClick={() => navigate('/')}
        >
          GetRido
        </span>
        {role === 'admin' && (
          <Button 
            size="sm" 
            variant="outline" 
            className="ml-auto h-7 text-xs"
            onClick={() => navigate('/admin/mapy')}
          >
            Panel Admin
          </Button>
        )}
      </header>
      
      {/* Main Maps Layout */}
      <MapsLayout />
    </div>
  );
};

export default GetRidoMaps;

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useModuleVisibility } from '@/hooks/useModuleVisibility';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MapsLayout from '@/components/maps/MapsLayout';

const GetRidoMaps = () => {
  const navigate = useNavigate();
  const { role, loading: roleLoading } = useUserRole();
  const { isVisible, loading: visibilityLoading } = useModuleVisibility('maps');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setAuthLoading(false);
    };
    checkAuth();
  }, []);

  const loading = roleLoading || visibilityLoading || authLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If user is not logged in, redirect to auth with return URL
  if (!user) {
    navigate('/auth?redirect=/mapy');
    return null;
  }

  // If user doesn't have access and is not admin, show access denied
  if (!isVisible && role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Brak dostępu do Map</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Moduł Mapy jest dostępny tylko dla wybranych użytkowników. 
              Skontaktuj się z administratorem, aby uzyskać dostęp.
            </p>
            <Button onClick={() => navigate('/')} className="w-full">
              Wróć do strony głównej
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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

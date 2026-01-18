import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useModuleVisibility } from '@/hooks/useModuleVisibility';
import { Map, ArrowLeft, Construction, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div
                className="font-bold text-xl cursor-pointer"
                onClick={() => navigate('/')}
              >
                GetRido
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-12 pb-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="relative mb-6">
                <Map className="h-24 w-24 text-primary/20" />
                <Construction className="h-10 w-10 text-amber-500 absolute -bottom-1 -right-1" />
              </div>
              
              <h1 className="text-3xl font-bold mb-2">
                GetRido Maps
              </h1>
              <p className="text-lg text-primary mb-6">
                tryb testowy
              </p>
              
              <div className="bg-muted/50 rounded-lg p-6 max-w-md">
                <p className="text-muted-foreground">
                  Moduł w trakcie budowy.
                  <br />
                  Widoczny tylko dla wybranych kont.
                </p>
              </div>

              <div className="mt-8 flex gap-3">
                <Button variant="outline" onClick={() => navigate('/')}>
                  Powrót do strony głównej
                </Button>
                {role === 'admin' && (
                  <Button onClick={() => navigate('/admin/mapy')}>
                    Panel administracyjny
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default GetRidoMaps;

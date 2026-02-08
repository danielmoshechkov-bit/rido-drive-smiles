import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useModuleVisibility } from '@/hooks/useModuleVisibility';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, ShieldX, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import MapsLayout from '@/components/maps/MapsLayout';
// Owner emails with full access
const OWNER_EMAILS = [
  'daniel.moshechkov@gmail.com',
  'anastasiia.shapovalova1991@gmail.com'
];

const GetRidoMaps = () => {
  const navigate = useNavigate();
  const { role, loading: roleLoading } = useUserRole();
  const { isVisible, loading: visibilityLoading } = useModuleVisibility('maps');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setAuthLoading(false);
    };
    checkAuth();
  }, []);

  const loading = roleLoading || visibilityLoading || authLoading;

  // Check if user is an owner
  const isOwner = user?.email && OWNER_EMAILS.includes(user.email);

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

  // If user doesn't have access (not owner and not admin with visibility), show access denied
  if (!isOwner && !isVisible && role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 pt-[env(safe-area-inset-top)]">
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

  const handleBackToPortal = () => {
    // Check if navigation is active (we'll pass this from MapsLayout in future)
    // For now, just navigate - the MapsLayout will handle cleanup
    if (isNavigating) {
      setShowExitConfirm(true);
    } else {
      navigate('/easy');
    }
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    // Navigation will be stopped by MapsLayout unmounting
    navigate('/easy');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Minimal Header with Back to Portal */}
      <header className="border-b bg-card/95 backdrop-blur-md h-12 flex items-center px-3 flex-shrink-0 z-50">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm font-medium hover:bg-primary/10"
          onClick={handleBackToPortal}
        >
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Wróć do portalu</span>
        </Button>
        
        <div className="flex-1" />
        
        <span 
          className="font-bold text-sm cursor-pointer"
          onClick={() => navigate('/')}
        >
          GetRido <span className="text-primary">Maps</span>
        </span>
        
        <div className="flex-1" />
        
        {role === 'admin' && (
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 text-xs"
            onClick={() => navigate('/admin/mapy')}
          >
            Admin
          </Button>
        )}
      </header>
      
      {/* Main Maps Layout */}
      <MapsLayout />
      
      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nawigacja aktywna</AlertDialogTitle>
            <AlertDialogDescription>
              Nawigacja jest aktywna. Czy na pewno chcesz zakończyć i wrócić do portalu?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExit}>
              Zakończ i wróć
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GetRidoMaps;

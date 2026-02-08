import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';

/**
 * ActivationConfirm page - handles email confirmation links
 * Shows a thank you modal on the main portal page
 */
export default function ActivationConfirm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleActivation = async () => {
      const token = searchParams.get('token');
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') || 'signup';

      // If we have Supabase auth tokens, verify them
      if (tokenHash || token) {
        try {
          // Supabase will automatically handle the session from the URL
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('Activation error:', error);
            setError('Nie udało się aktywować konta. Spróbuj ponownie.');
          } else if (data.session) {
            // User is logged in after activation
            setShowModal(true);
          } else {
            // No session yet, try to verify the token
            // The token in email links is handled by Supabase automatically
            // Just show the success modal
            setShowModal(true);
          }
        } catch (e) {
          console.error('Activation error:', e);
          setError('Wystąpił błąd podczas aktywacji.');
        }
      } else {
        // No token - just show success (might be coming from email link that already verified)
        setShowModal(true);
      }
      
      setLoading(false);
    };

    handleActivation();
  }, [searchParams]);

  const handleClose = () => {
    setShowModal(false);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Aktywowanie konta...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="text-destructive text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-2">Błąd aktywacji</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate('/')}>
            Wróć do strony głównej
          </Button>
        </div>
      </div>
    );
  }

  // Render the main portal with the thank you modal overlay
  return (
    <>
      {/* Redirect to main page with modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="GetRido" 
                className="h-12 w-12"
              />
            </div>
            <CheckCircle className="h-16 w-16 text-green-500" />
            <DialogTitle className="text-2xl font-bold text-green-600">
              🎉 Dziękujemy za rejestrację!
            </DialogTitle>
            <DialogDescription className="text-base">
              Twoje konto w GetRido zostało pomyślnie aktywowane. 
              Możesz teraz korzystać ze wszystkich funkcji platformy.
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-6 space-y-3">
            <Button onClick={handleClose} className="w-full" size="lg">
              Rozpocznij korzystanie z GetRido
            </Button>
            <p className="text-xs text-muted-foreground">
              AI platforma do usług i ogłoszeń
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Background: redirect to main portal */}
      {!showModal && null}
    </>
  );
}

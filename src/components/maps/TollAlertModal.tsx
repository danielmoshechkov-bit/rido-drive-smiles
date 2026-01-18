// GetRido Maps - Toll Alert Modal
import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Route as RouteIcon } from 'lucide-react';
import { TollSegment, purchaseToll, calculateTollPrice, formatTollType } from './tollService';
import { RIDO_THEME_COLORS } from './ridoMapTheme';

interface TollAlertModalProps {
  open: boolean;
  onClose: () => void;
  segments: TollSegment[];
  userId: string | null;
  onPurchaseComplete: () => void;
  onSkip: () => void;
}

const TollAlertModal = ({ 
  open, 
  onClose, 
  segments, 
  userId, 
  onPurchaseComplete,
  onSkip 
}: TollAlertModalProps) => {
  const [purchasing, setPurchasing] = useState(false);
  
  const totalPrice = segments.reduce((sum, seg) => sum + calculateTollPrice(seg), 0);

  const handlePurchaseAll = async () => {
    if (!userId) return;
    setPurchasing(true);
    
    try {
      for (const segment of segments) {
        await purchaseToll(userId, segment.id);
      }
      onPurchaseComplete();
    } catch (error) {
      console.error('[TollAlert] Purchase error:', error);
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.violetSoft}, ${RIDO_THEME_COLORS.violetPrimary})` }}
            >
              <RouteIcon className="h-5 w-5 text-white" />
            </div>
            <AlertDialogTitle className="text-left">
              Płatne odcinki na trasie
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left">
            Na wyznaczonej trasie znajdują się płatne odcinki. Chcesz kupić przepustkę?
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {/* Segments list */}
        <div className="space-y-2 my-4">
          {segments.map(segment => (
            <div 
              key={segment.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div>
                <p className="font-medium text-sm">{segment.name}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  {formatTollType(segment.type)}
                </Badge>
              </div>
              <span className="font-bold">{calculateTollPrice(segment).toFixed(2)} PLN</span>
            </div>
          ))}
        </div>
        
        {/* Total */}
        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
          <span className="font-medium">Łącznie</span>
          <span className="font-bold text-lg">{totalPrice.toFixed(2)} PLN</span>
        </div>
        
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onSkip} className="sm:flex-1">
            Nie teraz
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handlePurchaseAll}
            disabled={purchasing || !userId}
            className="sm:flex-1 gap-2"
            style={{ 
              background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.violetSoft}, ${RIDO_THEME_COLORS.violetPrimary})`,
            }}
          >
            {purchasing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Kup przepustkę
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
        
        <p className="text-xs text-muted-foreground text-center mt-2">
          * Płatność symulowana (wersja testowa)
        </p>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default TollAlertModal;

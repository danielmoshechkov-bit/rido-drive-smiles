import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToSettings: () => void;
}

export function RidoPartsConfigModal({ open, onOpenChange, onGoToSettings }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t('workshop.parts.config.title')}
          </DialogTitle>
          <DialogDescription>
            {t('workshop.parts.config.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm font-semibold">{t('workshop.parts.config.availableIntegrations')}:</p>

          {/* HART */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🟡</span>
              <span className="font-semibold">HART</span>
              <span className="text-xs text-muted-foreground">(hartphp.com.pl)</span>
            </div>
            <p className="text-sm text-muted-foreground font-medium">{t('workshop.parts.config.howToAccess')}:</p>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>{t('workshop.parts.config.hartStep1')}</li>
              <li>{t('workshop.parts.config.hartStep2')}</li>
              <li>{t('workshop.parts.config.hartStep3')}</li>
              <li>{t('workshop.parts.config.hartStep4')}</li>
              <li>{t('workshop.parts.config.goToSettingsPrefix')} <span className="font-medium text-foreground">{t('workshop.parts.config.hartSettingsPath')}</span> {t('workshop.parts.config.andEnterData')}</li>
            </ol>
            <p className="text-xs text-muted-foreground">{t('workshop.parts.config.contact')}: hart@hartphp.com.pl</p>
          </div>

          {/* AUTO PARTNER */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔵</span>
              <span className="font-semibold">AUTO PARTNER</span>
              <span className="text-xs text-muted-foreground">(autopartner.dev)</span>
            </div>
            <p className="text-sm text-muted-foreground font-medium">{t('workshop.parts.config.howToAccess')}:</p>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>{t('workshop.parts.config.apStep1')}</li>
              <li>{t('workshop.parts.config.apStep2')}</li>
              <li>{t('workshop.parts.config.apStep3')}</li>
              <li>{t('workshop.parts.config.goToSettingsPrefix')} <span className="font-medium text-foreground">{t('workshop.parts.config.apSettingsPath')}</span> {t('workshop.parts.config.andEnterData')}</li>
            </ol>
            <p className="text-xs text-muted-foreground">{t('workshop.parts.config.contact')}: {t('workshop.parts.config.apContactValue')}</p>
          </div>

          <p className="text-sm text-muted-foreground italic">➕ {t('workshop.parts.config.moreSoon')}</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('workshop.parts.config.close')}</Button>
          <Button onClick={onGoToSettings}>{t('workshop.parts.config.goToSettings')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

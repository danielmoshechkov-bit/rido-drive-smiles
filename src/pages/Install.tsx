import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Share, MoreVertical, Download, ArrowLeft, Home } from 'lucide-react';

type Platform = 'none' | 'android' | 'iphone';

export default function Install() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('none');

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Capture the install prompt event
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="RIDO Logo" 
              className="h-16 w-16"
            />
          </div>
          <CardTitle className="text-center text-2xl">
            {isInstalled ? t('install.alreadyInstalled') : t('install.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isInstalled ? (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {t('install.installedMessage')}
              </p>
              <Button onClick={() => navigate('/')} className="w-full" size="lg">
                <Home className="mr-2 h-5 w-5" />
                {t('install.goToApp')}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-center text-muted-foreground">
                {t('install.description')}
              </p>

              {deferredPrompt && (
                <Button onClick={handleInstallClick} className="w-full" size="lg">
                  <Download className="mr-2 h-5 w-5" />
                  {t('install.installNow')}
                </Button>
              )}

              {selectedPlatform === 'none' ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">
                    {t('install.selectPlatform')}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setSelectedPlatform('android')}
                      className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all cursor-pointer group"
                    >
                      <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="text-4xl">🤖</span>
                      </div>
                      <div>
                        <p className="font-semibold text-lg">Android</p>
                        <p className="text-xs text-muted-foreground">Chrome / Edge</p>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setSelectedPlatform('iphone')}
                      className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-all cursor-pointer group"
                    >
                      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="text-4xl">🍎</span>
                      </div>
                      <div>
                        <p className="font-semibold text-lg">iPhone</p>
                        <p className="text-xs text-muted-foreground">Safari</p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedPlatform('none')}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('install.backToSelection')}
                  </Button>

                  {selectedPlatform === 'android' && (
                    <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2 justify-center">
                          <span className="text-2xl">🤖</span>
                          {t('install.androidTitle')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="bg-green-600 text-white rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
                          <p className="text-sm">{t('install.androidStep1')}</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="bg-green-600 text-white rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
                          <p className="text-sm flex items-center gap-1 flex-wrap">
                            {t('install.androidStep2')} <MoreVertical className="h-4 w-4 inline mx-1" />
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="bg-green-600 text-white rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
                          <p className="text-sm">{t('install.androidStep3')}</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="bg-green-600 text-white rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">4</div>
                          <p className="text-sm">{t('install.androidStep4')}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {selectedPlatform === 'iphone' && (
                    <Card className="bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2 justify-center">
                          <span className="text-2xl">🍎</span>
                          {t('install.iphoneTitle')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="bg-gray-600 text-white rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
                          <p className="text-sm">{t('install.iphoneStep1')}</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="bg-gray-600 text-white rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
                          <p className="text-sm flex items-center gap-1 flex-wrap">
                            {t('install.iphoneStep2')} <Share className="h-4 w-4 inline mx-1" />
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="bg-gray-600 text-white rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
                          <p className="text-sm">{t('install.iphoneStep3')}</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="bg-gray-600 text-white rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">4</div>
                          <p className="text-sm">{t('install.iphoneStep4')}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              <div className="pt-4 border-t">
                <Button variant="outline" onClick={() => navigate('/')} className="w-full">
                  {t('install.skip')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

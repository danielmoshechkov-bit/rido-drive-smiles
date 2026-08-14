import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, TestTube, Settings2, Lock, Info } from 'lucide-react';
import { usePartsIntegrations, useUpsertPartsIntegration, usePartsApi } from '@/hooks/useWorkshopParts';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Props {
  providerId: string;
}

interface IntegrationForm {
  supplier_code: string;
  supplier_name: string;
  api_username: string;
  api_password: string;
  api_url: string;
  default_branch_id: string;
  sales_margin_percent: number;
  is_enabled: boolean;
  environment: string;
  api_extra_json: Record<string, string>;
}

const HART_BRANCHES = [
  { id: '', labelKey: 'workshop.parts.wholesaler.branchDefault' },
  { id: '1', label: 'Centrala Opole - HUB' },
  { id: '2', label: 'Wrocław' },
  { id: '3', label: 'Bytom' },
  { id: '4', label: 'Wieliczka' },
  { id: '8', label: 'Poznań' },
  { id: '9', label: 'Katowice' },
  { id: '10', label: 'Łódź' },
  { id: '11', label: 'Częstochowa' },
  { id: '12', label: 'Zielona Góra' },
  { id: '13', label: 'Kraków' },
  { id: '15', label: 'Białystok' },
  { id: '16', label: 'Warszawa 1 (Targówek)' },
  { id: '17', label: 'Rzeszów' },
  { id: '18', label: 'Bielsko-Biała' },
  { id: '19', label: 'Warszawa 2' },
  { id: '20', label: 'Radom' },
  { id: '22', label: 'Psary' },
  { id: '23', label: 'Bydgoszcz' },
  { id: '27', label: 'Koluszki - HUB' },
  { id: '28', label: 'Szczecin' },
  { id: '29', label: 'Gdańsk' },
  { id: '30', label: 'Lublin' },
  { id: '32', label: 'Warszawa 3' },
];

const WHOLESALERS = [
  { code: 'hart', name: 'Hart', logo: '🟡', url: 'hartphp.com.pl', active: true, helpKey: 'workshop.parts.wholesaler.hart.help' },
  { code: 'auto_partner', name: 'Auto Partner', logo: '🔵', url: 'autopartner.dev', active: true, helpKey: 'workshop.parts.wholesaler.autoPartner.help' },
  { code: 'inter_cars', name: 'Inter Cars', logo: '🔴', url: 'intercars.com.pl', active: true, helpKey: 'workshop.parts.wholesaler.interCars.help' },
  { code: 'gordon', name: 'Gordon', logo: '🟢', url: 'gordon.com.pl', active: false, helpKey: '' },
  { code: 'motorro', name: 'Motorro', logo: '🟠', url: 'motorro.eu', active: false, helpKey: '' },
  { code: 'feber', name: 'Feber', logo: '🟣', url: 'feber.com.pl', active: false, helpKey: '' },
  { code: 'elit', name: 'Elit Polska', logo: '🔷', url: 'elit.pl', active: false, helpKey: '' },
  { code: 'autos', name: 'Autos', logo: '⬛', url: 'autos.pl', active: false, helpKey: '' },
  { code: 'stahlgruber', name: 'Stahlgruber', logo: '⚪', url: 'stahlgruber.pl', active: false, helpKey: '' },
  { code: 'autodoc_pro', name: 'Autodoc Pro', logo: '🔘', url: 'autodoc-pro.com', active: false, helpKey: '' },
];

export function WholesalerIntegrationsSettings({ providerId }: Props) {
  const { t } = useTranslation();
  const { data: integrations = [], isLoading } = usePartsIntegrations(providerId);
  const upsertIntegration = useUpsertPartsIntegration();
  const partsApi = usePartsApi();

  const [forms, setForms] = useState<Record<string, IntegrationForm>>({});
  const [testingSupplier, setTestingSupplier] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'error'>>({});
  const [openDialog, setOpenDialog] = useState<string | null>(null);

  useEffect(() => {
    const newForms: Record<string, IntegrationForm> = {};
    for (const w of WHOLESALERS) {
      if (!w.active) continue;
      const existing = (integrations as any[]).find((i: any) => i.supplier_code === w.code);
      newForms[w.code] = {
        supplier_code: w.code,
        supplier_name: w.name,
        api_username: existing?.api_username || '',
        api_password: existing?.api_password || '',
        api_url: existing?.api_url || '',
        default_branch_id: existing?.default_branch_id || '',
        sales_margin_percent: existing?.sales_margin_percent ?? 30,
        is_enabled: existing?.is_enabled ?? false,
        environment: existing?.environment || 'sandbox',
        api_extra_json: existing?.api_extra_json || {},
      };
      if (existing?.last_connection_status) {
        setTestResults(prev => ({ ...prev, [w.code]: existing.last_connection_status }));
      }
    }
    setForms(newForms);
  }, [integrations]);

  const updateForm = (code: string, updates: Partial<IntegrationForm>) => {
    setForms(prev => ({ ...prev, [code]: { ...prev[code], ...updates } }));
  };

  const getExtraField = (code: string, key: string) => forms[code]?.api_extra_json?.[key] || '';
  const setExtraField = (code: string, key: string, value: string) => {
    updateForm(code, { api_extra_json: { ...(forms[code]?.api_extra_json || {}), [key]: value } });
  };

  const saveIntegration = async (code: string) => {
    const form = forms[code];
    await upsertIntegration.mutateAsync({
      provider_id: providerId,
      supplier_code: form.supplier_code,
      supplier_name: form.supplier_name,
      api_username: form.api_username,
      api_password: form.api_password,
      api_url: form.api_url,
      default_branch_id: form.default_branch_id,
      sales_margin_percent: form.sales_margin_percent,
      is_enabled: form.is_enabled,
      environment: form.environment,
      api_extra_json: form.api_extra_json || {},
    });
  };

  const testConnection = async (code: string) => {
    setTestingSupplier(code);
    try {
      await saveIntegration(code);
      await partsApi.mutateAsync({
        action: 'test_connection',
        provider_id: providerId,
        supplier_code: code,
      });
      setTestResults(prev => ({ ...prev, [code]: 'ok' }));
      toast.success(t('workshop.parts.wholesaler.connectionWorks', { supplier: forms[code]?.supplier_name || code }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [code]: 'error' }));
      toast.error(t('workshop.parts.wholesaler.errorPrefix', { error: err.message || t('workshop.parts.wholesaler.checkApiData') }));
    } finally {
      setTestingSupplier(null);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t('workshop.parts.wholesaler.title')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('workshop.parts.wholesaler.subtitle')}
        </p>
      </div>

      {/* ── KAFELKI GRID ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {WHOLESALERS.map((w) => {
          const isComingSoon = !w.active;
          const status = testResults[w.code];
          const form = forms[w.code];
          const isEnabled = form?.is_enabled;

          return (
            <div
              key={w.code}
              role="button"
              tabIndex={isComingSoon ? -1 : 0}
              onClick={() => { if (!isComingSoon) setOpenDialog(w.code); }}
              onKeyDown={(e) => { if (!isComingSoon && (e.key === 'Enter' || e.key === ' ')) setOpenDialog(w.code); }}
              className={`
                relative flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all text-center select-none
                ${isComingSoon
                  ? 'opacity-40 cursor-not-allowed bg-muted/20 border-dashed border-muted'
                  : 'cursor-pointer hover:shadow-lg hover:border-primary/50 hover:-translate-y-0.5 bg-card border-border'
                }
                ${isEnabled && !isComingSoon ? 'ring-2 ring-primary/40 border-primary/60 shadow-md' : ''}
              `}
            >
              <span className="text-4xl leading-none">{w.logo}</span>
              <span className="font-bold text-sm text-foreground">{w.name}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{w.url}</span>

              {isComingSoon && (
                <Badge variant="secondary" className="text-[9px] px-2 py-0.5 gap-0.5">
                  <Lock className="h-2.5 w-2.5" /> {t('workshop.dashboard.comingSoon')}
                </Badge>
              )}

              {!isComingSoon && status === 'ok' && (
                <Badge className="bg-green-500/90 hover:bg-green-500 text-white text-[9px] px-2 py-0.5 gap-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" /> {t('workshop.parts.wholesaler.connected')}
                </Badge>
              )}
              {!isComingSoon && status === 'error' && (
                <Badge variant="destructive" className="text-[9px] px-2 py-0.5 gap-0.5">
                  <XCircle className="h-2.5 w-2.5" /> {t('workshop.parts.wholesaler.error')}
                </Badge>
              )}
              {!isComingSoon && !status && (
                <Badge variant="outline" className="text-[9px] px-2 py-0.5 gap-0.5">
                  <Settings2 className="h-2.5 w-2.5" /> {t('workshop.parts.wholesaler.configure')}
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* ── HART Dialog ── */}
      <Dialog open={openDialog === 'hart'} onOpenChange={(open) => { if (!open) setOpenDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-2xl">🟡</span> {t('workshop.parts.wholesaler.apiConfigTitle', { name: 'Hart' })}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t(WHOLESALERS[0].helpKey)}
            </DialogDescription>
          </DialogHeader>
          {forms.hart && (
            <div className="space-y-4 pt-2">
              {/* Info box */}
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                <div className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">{t('workshop.parts.wholesaler.hart.infoTitle')}</p>
                    <p className="mt-1">{t('workshop.parts.wholesaler.hart.infoIntro')}</p>
                    <ul className="list-disc ml-4 mt-1 space-y-0.5">
                      <li><strong>username</strong> {t('workshop.parts.wholesaler.hart.itemUsername')} <em>Username</em></li>
                      <li><strong>password</strong> {t('workshop.parts.wholesaler.hart.itemPassword')} <em>{t('workshop.parts.wholesaler.apiPassword')}</em></li>
                      <li><strong>{t('workshop.parts.wholesaler.hart.identifier')}</strong> {t('workshop.parts.wholesaler.hart.itemIdentifier')}</li>
                      <li><strong>kode</strong> {t('workshop.parts.wholesaler.hart.itemKode')}</li>
                    </ul>
                    <p className="mt-1.5">
                      {t('workshop.parts.wholesaler.production')}: <code className="text-[10px] bg-muted px-1 rounded">restapi.hartphp.com.pl</code><br />
                      {t('workshop.parts.wholesaler.sandbox')}: <code className="text-[10px] bg-muted px-1 rounded">sandbox.restapi.hartphp.com.pl</code>
                    </p>
                    <p className="mt-1 text-amber-600">⚠️ {t('workshop.parts.wholesaler.hart.separateCredsPrefix')} <strong>{t('workshop.parts.wholesaler.hart.separateWord')}</strong> {t('workshop.parts.wholesaler.hart.separateCredsSuffix')}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t('workshop.parts.wholesaler.integrationActive')}</Label>
                <Switch checked={forms.hart.is_enabled} onCheckedChange={(v) => updateForm('hart', { is_enabled: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.usernameLogin')} <span className="text-destructive">*</span></Label>
                  <Input
                    onFocus={e => e.currentTarget.select()}
                    value={forms.hart.api_username}
                    onChange={(e) => updateForm('hart', { api_username: e.target.value })}
                    placeholder={t('workshop.parts.wholesaler.hart.usernamePlaceholder')}
                  />
                  <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.hart.usernameHint')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.apiPassword')} <span className="text-destructive">*</span></Label>
                  <Input
                    onFocus={e => e.currentTarget.select()}
                    type="password"
                    value={forms.hart.api_password}
                    onChange={(e) => updateForm('hart', { api_password: e.target.value })}
                    placeholder="••••••••"
                  />
                  <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.hart.passwordHint')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.environment')}</Label>
                  <Select value={forms.hart.environment} onValueChange={(v) => updateForm('hart', { environment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">🧪 {t('workshop.parts.wholesaler.envSandbox')}</SelectItem>
                      <SelectItem value="production">🚀 {t('workshop.parts.wholesaler.envProduction')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.startWithSandbox')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.warehouseBranchId')}</Label>
                  <Select
                    value={forms.hart.default_branch_id || ''}
                    onValueChange={(v) => updateForm('hart', { default_branch_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder={t('workshop.parts.wholesaler.branchDefaultShort')} /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {HART_BRANCHES.map((b) => (
                        <SelectItem key={b.id} value={b.id || 'default'}>
                          {b.id ? `${b.id} — ${b.label}` : t(b.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.hart.nearestWarehouse')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.salesMargin')}</Label>
                  <Input
                    type="number"
                    onFocus={e => e.currentTarget.select()}
                    value={forms.hart.sales_margin_percent}
                    onChange={(e) => updateForm('hart', { sales_margin_percent: Number(e.target.value) })}
                  />
                  <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.marginHint')}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => testConnection('hart')} disabled={testingSupplier === 'hart' || !forms.hart.api_username || !forms.hart.api_password} className="gap-1.5">
                  {testingSupplier === 'hart' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                  {t('workshop.parts.wholesaler.testConnection')}
                </Button>
                <Button size="sm" onClick={async () => { await saveIntegration('hart'); toast.success(t('workshop.parts.wholesaler.savedToast', { name: 'Hart' })); setOpenDialog(null); }} disabled={!forms.hart.api_username || !forms.hart.api_password}>
                  {t('common.save')}
                </Button>
                {testResults.hart === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-green-600 ml-auto">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('workshop.parts.wholesaler.connectionActive')}
                  </span>
                )}
                {testResults.hart === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-destructive ml-auto">
                    <XCircle className="h-3.5 w-3.5" /> {t('workshop.parts.wholesaler.checkData')}
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AUTO PARTNER Dialog ── */}
      <Dialog open={openDialog === 'auto_partner'} onOpenChange={(open) => { if (!open) setOpenDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-2xl">🔵</span> {t('workshop.parts.wholesaler.apiConfigTitle', { name: 'Auto Partner' })}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t(WHOLESALERS[1].helpKey)}
            </DialogDescription>
          </DialogHeader>
          {forms.auto_partner && (
            <div className="space-y-4 pt-2">
              {/* Info box */}
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                <div className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">{t('workshop.parts.wholesaler.howToGetCreds')}</p>
                    <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                      <li>{t('workshop.parts.wholesaler.autoPartner.step1')}</li>
                      <li>{t('workshop.parts.wholesaler.autoPartner.step2Prefix')} <strong>Client Code, WS Password {t('workshop.parts.wholesaler.and')} Client Password</strong></li>
                      <li>{t('workshop.parts.wholesaler.autoPartner.step3Prefix')} <strong>{t('workshop.parts.wholesaler.autoPartner.md5Hash')}</strong> {t('workshop.parts.wholesaler.autoPartner.step3Suffix')}</li>
                    </ol>
                    <p className="mt-1.5">
                      API: <code className="text-[10px] bg-muted px-1 rounded">customerapi.autopartner.dev</code>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t('workshop.parts.wholesaler.integrationActive')}</Label>
                <Switch checked={forms.auto_partner.is_enabled} onCheckedChange={(v) => updateForm('auto_partner', { is_enabled: v })} />
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Client Code <span className="text-destructive">*</span></Label>
                  <Input onFocus={e => e.currentTarget.select()} value={getExtraField('auto_partner', 'clientCode')} onChange={(e) => setExtraField('auto_partner', 'clientCode', e.target.value)} placeholder={t('workshop.parts.wholesaler.autoPartner.clientCodePlaceholder')} />
                  <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.autoPartner.clientCodeHint')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WS Password <span className="text-destructive">*</span></Label>
                  <Input onFocus={e => e.currentTarget.select()} type="password" value={getExtraField('auto_partner', 'wsPassword')} onChange={(e) => setExtraField('auto_partner', 'wsPassword', e.target.value)} placeholder="••••••••" />
                  <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.autoPartner.wsPasswordHint')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client Password (MD5) <span className="text-destructive">*</span></Label>
                  <Input onFocus={e => e.currentTarget.select()} type="password" value={getExtraField('auto_partner', 'clientPassword')} onChange={(e) => setExtraField('auto_partner', 'clientPassword', e.target.value)} placeholder="np. e10adc3949ba59abbe56..." />
                  <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.autoPartner.clientPasswordHint')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.environment')}</Label>
                  <Select value={forms.auto_partner.environment} onValueChange={(v) => updateForm('auto_partner', { environment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">🧪 {t('workshop.parts.wholesaler.envSandbox')}</SelectItem>
                      <SelectItem value="production">🚀 {t('workshop.parts.wholesaler.envProduction')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.salesMargin')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} type="number" value={forms.auto_partner.sales_margin_percent} onChange={(e) => updateForm('auto_partner', { sales_margin_percent: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => testConnection('auto_partner')} disabled={testingSupplier === 'auto_partner' || !getExtraField('auto_partner', 'clientCode')} className="gap-1.5">
                  {testingSupplier === 'auto_partner' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                  {t('workshop.parts.wholesaler.testConnection')}
                </Button>
                <Button size="sm" onClick={async () => { await saveIntegration('auto_partner'); toast.success(t('workshop.parts.wholesaler.savedToast', { name: 'Auto Partner' })); setOpenDialog(null); }} disabled={!getExtraField('auto_partner', 'clientCode')}>
                  {t('common.save')}
                </Button>
                {testResults.auto_partner === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-green-600 ml-auto">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('workshop.parts.wholesaler.connectionActive')}
                  </span>
                )}
                {testResults.auto_partner === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-destructive ml-auto">
                    <XCircle className="h-3.5 w-3.5" /> {t('workshop.parts.wholesaler.checkData')}
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── INTER CARS Dialog ── */}
      <Dialog open={openDialog === 'inter_cars'} onOpenChange={(open) => { if (!open) setOpenDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-2xl">🔴</span> {t('workshop.parts.wholesaler.apiConfigTitle', { name: 'Inter Cars' })}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t(WHOLESALERS.find(w => w.code === 'inter_cars')?.helpKey || '')}
            </DialogDescription>
          </DialogHeader>
          {forms.inter_cars && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                <div className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">{t('workshop.parts.wholesaler.howToGetCreds')}</p>
                    <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                      <li>{t('workshop.parts.wholesaler.interCars.step1')}</li>
                      <li>{t('workshop.parts.wholesaler.interCars.step2Prefix')} <strong>Client ID</strong> {t('workshop.parts.wholesaler.and')} <strong>Client Secret</strong> {t('workshop.parts.wholesaler.interCars.step2Suffix')}</li>
                      <li>{t('workshop.parts.wholesaler.interCars.step3Prefix')} <strong>{t('workshop.parts.wholesaler.interCars.customerNumber')}</strong> {t('workshop.parts.wholesaler.interCars.step3Suffix')}</li>
                      <li>{t('workshop.parts.wholesaler.interCars.step4Prefix')} <strong>{t('workshop.parts.wholesaler.interCars.branch')}</strong></li>
                    </ol>
                    <p className="mt-1.5">
                      API: <code className="text-[10px] bg-muted px-1 rounded">webapi.intercars.eu</code>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t('workshop.parts.wholesaler.integrationActive')}</Label>
                <Switch checked={forms.inter_cars.is_enabled} onCheckedChange={(v) => updateForm('inter_cars', { is_enabled: v })} />
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Client ID <span className="text-destructive">*</span></Label>
                    <Input onFocus={e => e.currentTarget.select()} value={getExtraField('inter_cars', 'clientId')} onChange={(e) => setExtraField('inter_cars', 'clientId', e.target.value)} placeholder="np. isMb4_2m..." />
                    <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.interCars.clientIdHint')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Client Secret <span className="text-destructive">*</span></Label>
                    <Input onFocus={e => e.currentTarget.select()} type="password" value={getExtraField('inter_cars', 'clientSecret')} onChange={(e) => setExtraField('inter_cars', 'clientSecret', e.target.value)} placeholder="••••••••" />
                    <p className="text-[10px] text-muted-foreground">OAuth2 Client Secret</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('workshop.parts.wholesaler.interCars.customerNumberLabel')} <span className="text-destructive">*</span></Label>
                    <Input onFocus={e => e.currentTarget.select()} value={getExtraField('inter_cars', 'customerNumber')} onChange={(e) => setExtraField('inter_cars', 'customerNumber', e.target.value)} placeholder="np. 9AE06V" />
                    <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.interCars.customerNumberHint')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('workshop.parts.wholesaler.interCars.branchLabel')}</Label>
                    <Input onFocus={e => e.currentTarget.select()} value={getExtraField('inter_cars', 'branch')} onChange={(e) => setExtraField('inter_cars', 'branch', e.target.value)} placeholder="np. MAT" />
                    <p className="text-[10px] text-muted-foreground">{t('workshop.parts.wholesaler.interCars.branchHint')}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.environment')}</Label>
                  <Select value={forms.inter_cars.environment} onValueChange={(v) => updateForm('inter_cars', { environment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">🚀 {t('workshop.parts.wholesaler.envProduction')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('workshop.parts.wholesaler.salesMargin')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} type="number" value={forms.inter_cars.sales_margin_percent} onChange={(e) => updateForm('inter_cars', { sales_margin_percent: Number(e.target.value) })} />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => testConnection('inter_cars')} disabled={testingSupplier === 'inter_cars' || !getExtraField('inter_cars', 'clientId') || !getExtraField('inter_cars', 'clientSecret')} className="gap-1.5">
                  {testingSupplier === 'inter_cars' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                  {t('workshop.parts.wholesaler.testConnection')}
                </Button>
                <Button size="sm" onClick={async () => { await saveIntegration('inter_cars'); toast.success(t('workshop.parts.wholesaler.savedToast', { name: 'Inter Cars' })); setOpenDialog(null); }} disabled={!getExtraField('inter_cars', 'clientId') || !getExtraField('inter_cars', 'clientSecret')}>
                  {t('common.save')}
                </Button>
                {testResults.inter_cars === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-green-600 ml-auto">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('workshop.parts.wholesaler.connectionActive')}
                  </span>
                )}
                {testResults.inter_cars === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-destructive ml-auto">
                    <XCircle className="h-3.5 w-3.5" /> {t('workshop.parts.wholesaler.checkData')}
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


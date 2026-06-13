import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { CompanySetupWizard } from '@/components/invoices/CompanySetupWizard';
import { CostInvoiceModal } from '@/components/invoices/CostInvoiceModal';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { InvoiceExpandableRow } from '@/components/invoices/InvoiceExpandableRow';
import { InventoryModuleView } from '@/components/inventory';
import { InventoryPurchaseOCR } from '@/components/inventory/InventoryPurchaseOCR';
import { PendingInvoicesReview } from '@/components/invoices/PendingInvoicesReview';
import { InvoiceEmailSetup } from '@/components/invoices/InvoiceEmailSetup';
import { InvoiceNotificationBell } from '@/components/invoices/InvoiceNotificationBell';
import { KsefUserSettings } from '@/components/ksef/KsefUserSettings';

import { useKsefUnreadCount } from '@/hooks/useKsefUnreadCount';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  FileText, Plus, FileSpreadsheet, BarChart3, Clock, Package,
  CreditCard, ShoppingBag, Calculator, Building2, ChevronRight, Mail, Shield, AlertTriangle, Download
} from 'lucide-react';
import { toast } from 'sonner';

const accountingSubTabs = [
  { value: 'przeglad', labelKey: 'cp.accounting.przeglad', label: 'Przegląd', icon: BarChart3, visible: true },
  { value: 'faktury', labelKey: 'cp.accounting.invoices', label: 'Faktury', icon: FileText, visible: true },
  { value: 'zakupy', labelKey: 'cp.accounting.purchases', label: 'Zakupy', icon: ShoppingBag, visible: true },
  { value: 'oczekujace', labelKey: 'cp.accounting.review', label: 'Do sprawdzenia', icon: Mail, visible: true },
  { value: 'dokumenty', labelKey: 'cp.accounting.documents', label: 'Dokumenty', icon: FileSpreadsheet, visible: true },
  { value: 'platnosci', labelKey: 'cp.accounting.payments', label: 'Płatności', icon: CreditCard, visible: true },
  { value: 'magazyn', labelKey: 'cp.accounting.warehouse', label: 'Stan magazynowy', icon: Package, visible: true },
  { value: 'email-faktury', labelKey: 'cp.accounting.emailInvoices', label: 'Email faktury', icon: Mail, visible: true },
  { value: 'ksef', labelKey: '', label: 'KSeF', icon: Shield, visible: true },
  { value: 'cykliczne', labelKey: 'cp.accounting.recurring', label: 'Cykliczne', icon: Clock, visible: true },
];

export function ServiceProviderAccountingView() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState('przeglad');
  const { count: ksefUnread, markAllRead: markKsefRead } = useKsefUnreadCount();
  const [user, setUser] = useState<any>(null);
  const [userEntities, setUserEntities] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showCostInvoice, setShowCostInvoice] = useState(false);
  const [showCompanySetup, setShowCompanySetup] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any>(null);
  const [invoiceYear, setInvoiceYear] = useState(new Date().getFullYear());
  const [invoiceMonth, setInvoiceMonth] = useState(new Date().getMonth() + 1);
  const [showMissingCompanyModal, setShowMissingCompanyModal] = useState(false);
  

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    setUser(u);

    const { data: entities } = await supabase
      .from('entities')
      .select('id, name, type, nip, regon, address_street, address_city, address_postal_code, email, phone, bank_name, bank_account, logo_url, vat_payer, is_active')
      .eq('owner_user_id', u.id)
      .order('created_at', { ascending: false });
    if (entities) setUserEntities(entities);

    const { data: inv } = await supabase
      .from('user_invoices')
      .select('*')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (inv) setInvoices(inv);
  };

  const hasCompanySetup = userEntities.some((e: any) => e.is_active !== false);
  const hasNip = userEntities.some((e: any) => e.nip);

  const handleNewInvoice = () => {
    if (!hasCompanySetup || !hasNip) {
      setShowMissingCompanyModal(true);
    } else {
      setShowNewInvoice(true);
    }
  };

  return (
    <div className="space-y-4">
      <UniversalSubTabBar
        activeTab={subTab}
        onTabChange={(tab) => {
          setSubTab(tab);
          if (tab === 'ksef') markKsefRead();
        }}
        tabs={accountingSubTabs.map(tab => tab.value === 'ksef' && ksefUnread > 0 ? { ...tab, label: `KSeF (${ksefUnread})` } : { ...tab, label: tab.labelKey ? t(tab.labelKey) : tab.label })}
      />

      {/* Przegląd */}
      {subTab === 'przeglad' && (
        <div className="space-y-6">
          {!hasCompanySetup && (
            <Card className="border-dashed border-2 border-primary/30">
              <CardContent className="py-8 text-center">
                <Building2 className="h-12 w-12 mx-auto mb-4 text-primary/50" />
                <p className="font-semibold mb-2">{t('cp.accounting.configureCompany')}</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('cp.accounting.addCompanyDataHint')}
                </p>
                <Button onClick={() => setShowCompanySetup(true)}>
                  <Plus className="h-4 w-4 mr-2" />{t('cp.settings.addCompany')}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pending invoices alert */}
          <PendingInvoicesReview />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('cp.accounting.invoicesMonth')}</p>
                    <p className="text-3xl font-bold">{invoices.length}</p>
                    <p className="text-sm text-muted-foreground">
                      {invoices.filter(i => i.is_paid === true).length} {t('cp.accounting.paidCount')}
                    </p>
                  </div>
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('cp.accounting.grossRevenue')}</p>
                    <p className="text-3xl font-bold">
                      {invoices.reduce((sum, i) => sum + Number(i.gross_total || 0), 0).toLocaleString('pl-PL')} zł
                    </p>
                    <p className="text-sm text-muted-foreground">{t('cp.accounting.invoiceSum')}</p>
                  </div>
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('cp.accounting.toPay')}</p>
                    <p className="text-3xl font-bold text-destructive">
                      {invoices.filter(i => i.is_paid !== true).length}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('cp.accounting.unpaidInvoices')}</p>
                  </div>
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">{t('cp.accounting.quickActions')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={handleNewInvoice} className="h-auto py-3">
                  <Plus className="h-4 w-4 mr-2" />{t('cp.accounting.issueInvoice')}
                </Button>
                <Button variant="outline" className="h-auto py-3" onClick={() => setShowCostInvoice(true)}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />{t('cp.accounting.addCostInvoice')}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-auto py-3">
                  <BarChart3 className="h-4 w-4 mr-2" />Eksport CSV
                </Button>
                {userEntities.length === 0 ? (
                  <Button variant="outline" className="h-auto py-3" onClick={() => setShowCompanySetup(true)}>
                    <Building2 className="h-4 w-4 mr-2" />{t('cp.settings.addCompany')}
                  </Button>
                ) : (
                  <Button variant="outline" className="h-auto py-3" onClick={() => { setEditingEntity(userEntities[0]); setShowCompanySetup(true); }}>
                    <Building2 className="h-4 w-4 mr-2" />{t('cp.accounting.editCompany')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>{t('cp.accounting.recentInvoices')}</CardTitle>
                  <CardDescription>{t('cp.accounting.recentInvoicesDesc')}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <select value={invoiceMonth} onChange={e => setInvoiceMonth(parseInt(e.target.value))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('pl-PL', { month: 'long' })}</option>
                    ))}
                  </select>
                  <select value={invoiceYear} onChange={e => setInvoiceYear(parseInt(e.target.value))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    {[2024, 2025, 2026].map(year => (<option key={year} value={year}>{year}</option>))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const filtered = invoices.filter(inv => {
                  const d = new Date(inv.issue_date || inv.created_at);
                  return d.getFullYear() === invoiceYear && (d.getMonth() + 1) === invoiceMonth;
                });
                return filtered.length > 0 ? (
                  <div className="space-y-3 pb-20">
                    {filtered.slice(0, 5).map(invoice => (
                      <InvoiceExpandableRow key={invoice.id} invoice={invoice} onUpdate={() => user && loadData()} />
                    ))}
                    {filtered.length > 5 && (
                      <Button variant="ghost" className="w-full text-sm" onClick={() => setSubTab('faktury')}>
                        Zobacz wszystkie ({filtered.length})<ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('cp.accounting.noInvoicesPeriod')}</p>
                    <Button className="mt-4" onClick={handleNewInvoice}>
                      <Plus className="h-4 w-4 mr-2" />{t('cp.accounting.issueInvoice')}
                    </Button>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Faktury */}
      {subTab === 'faktury' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('cp.accounting.invoices')}</CardTitle>
                <CardDescription>{t('cp.accounting.allInvoices')}</CardDescription>
              </div>
              <Button onClick={handleNewInvoice}>
                <Plus className="h-4 w-4 mr-2" />{t('cp.accounting.issueInvoice')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {invoices.length > 0 ? (
              <div className="space-y-3 pb-20">
                {invoices.map(invoice => (
                  <InvoiceExpandableRow key={invoice.id} invoice={invoice} onUpdate={() => user && loadData()} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('cp.accounting.noInvoices')}</p>
                <Button className="mt-4" onClick={handleNewInvoice}>
                  <Plus className="h-4 w-4 mr-2" />{t('cp.accounting.issueInvoice')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Zakupy */}
      {subTab === 'zakupy' && (
        <InventoryPurchaseOCR entityId={userEntities[0]?.id} showKsefOption />
      )}

      {/* Oczekujące na sprawdzenie */}
      {subTab === 'oczekujace' && <PendingInvoicesReview />}

      {/* Email faktury setup */}
      {subTab === 'email-faktury' && <InvoiceEmailSetup />}

      {/* KSeF */}
      {subTab === 'ksef' && <KsefUserSettings />}

      {/* Stan magazynowy */}
      {subTab === 'magazyn' && <InventoryModuleView entityId={userEntities[0]?.id} />}

      {/* Placeholder for unbuilt tabs */}
      {!['przeglad', 'faktury', 'zakupy', 'magazyn', 'oczekujace', 'email-faktury', 'ksef'].includes(subTab) && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calculator className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="font-semibold mb-2">{(() => { const st = accountingSubTabs.find(s => s.value === subTab); return st?.labelKey ? t(st.labelKey) : st?.label; })()}</p>
            <p className="text-sm text-muted-foreground">{t('cp.accounting.underConstruction')}</p>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <Dialog open={showNewInvoice} onOpenChange={(open) => { setShowNewInvoice(open); if (!open) loadData(); }}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
          <DialogTitle className="sr-only">{t('cp.accounting.issueInvoice')}</DialogTitle>
          <SimpleFreeInvoice
            onClose={() => { setShowNewInvoice(false); loadData(); }}
            onSaved={() => { setShowNewInvoice(false); loadData(); }}
          />
        </DialogContent>
      </Dialog>

      <CostInvoiceModal
        open={showCostInvoice}
        onOpenChange={(v) => { setShowCostInvoice(v); if (!v) loadData(); }}
        entityId={userEntities[0]?.id}
        onCreated={() => { setShowCostInvoice(false); loadData(); }}
      />

      <CompanySetupWizard
        open={showCompanySetup}
        onOpenChange={(v) => { setShowCompanySetup(v); if (!v) { setEditingEntity(null); loadData(); } }}
        onCreated={() => { setShowCompanySetup(false); setEditingEntity(null); loadData(); }}
        editEntity={editingEntity}
      />

      {/* Missing company data modal */}
      <Dialog open={showMissingCompanyModal} onOpenChange={setShowMissingCompanyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('cp.accounting.fillCompanyData')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('cp.accounting.mustFillCompany')} 
            {t('cp.accounting.goToKsefToken')}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowMissingCompanyModal(false)}>
              Anuluj
            </Button>
            <Button onClick={() => {
              setShowMissingCompanyModal(false);
              if (!hasCompanySetup) {
                setShowCompanySetup(true);
              } else {
                setSubTab('ksef');
              }
            }}>
              {!hasCompanySetup ? t('cp.settings.addCompany') : t('cp.accounting.fillData')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

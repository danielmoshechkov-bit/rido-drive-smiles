import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Check, FileText, Layers, Search, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { WebsitePackage } from './WebsiteBuilderWizard';

interface PackageSelectionProps {
  selectedPackage: WebsitePackage | null;
  onSelectPackage: (pkg: WebsitePackage) => void;
  seoAddon: boolean;
  onSeoAddonChange: (value: boolean) => void;
  domainSetupAddon: boolean;
  onDomainSetupChange: (value: boolean) => void;
}

interface PricingData {
  one_page: {
    base_price: number;
    corrections_included: number;
    seo_addon_price: number;
    domain_setup_price: number;
  };
  multi_page: {
    base_price: number;
    corrections_included: number;
    seo_addon_price: number;
    domain_setup_price: number;
  };
}

export function PackageSelection({
  selectedPackage,
  onSelectPackage,
  seoAddon,
  onSeoAddonChange,
  domainSetupAddon,
  onDomainSetupChange,
}: PackageSelectionProps) {
  const [pricing, setPricing] = useState<PricingData | null>(null);

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    const { data } = await supabase
      .from('website_pricing')
      .select('*')
      .eq('is_active', true);

    if (data) {
      const pricingMap: any = {};
      data.forEach((p: any) => {
        pricingMap[p.package_type] = {
          base_price: p.base_price,
          corrections_included: p.corrections_included,
          seo_addon_price: p.seo_addon_price,
          domain_setup_price: p.domain_setup_price,
        };
      });
      setPricing(pricingMap);
    }
  };

  const packages = [
    {
      key: 'one_page' as WebsitePackage,
      title: 'One-Page',
      icon: FileText,
      description: 'Jedna strona przewijana',
      features: [
        'Sekcja Hero z CTA',
        'Lista usług',
        'O firmie',
        'Kontakt i formularz',
        `${pricing?.one_page?.corrections_included || 10} poprawek w cenie`,
      ],
      recommended: false,
    },
    {
      key: 'multi_page' as WebsitePackage,
      title: 'Multi-Page',
      icon: Layers,
      description: 'Pełna strona z podstronami',
      features: [
        'Strona główna',
        'Podstrona Usługi',
        'Podstrona O nas',
        'Podstrona Kontakt',
        'Blog (opcjonalnie)',
        `${pricing?.multi_page?.corrections_included || 20} poprawek w cenie`,
      ],
      recommended: true,
    },
  ];

  const calculateTotal = () => {
    if (!pricing || !selectedPackage) return 0;
    
    const pkg = pricing[selectedPackage];
    let total = pkg.base_price;
    if (seoAddon) total += pkg.seo_addon_price;
    if (domainSetupAddon) total += pkg.domain_setup_price;
    return total;
  };

  return (
    <div className="space-y-6">
      {/* Package Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {packages.map((pkg) => (
          <Card
            key={pkg.key}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md relative",
              selectedPackage === pkg.key && "ring-2 ring-primary",
              pkg.recommended && "border-primary"
            )}
            onClick={() => onSelectPackage(pkg.key)}
          >
            {pkg.recommended && (
              <Badge className="absolute -top-2 left-4 bg-primary">
                Polecany
              </Badge>
            )}
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  selectedPackage === pkg.key ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <pkg.icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{pkg.title}</CardTitle>
                  <CardDescription>{pkg.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <span className="text-3xl font-bold">
                  {pricing?.[pkg.key]?.base_price || '...'} zł
                </span>
              </div>
              <ul className="space-y-2">
                {pkg.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Addons */}
      {selectedPackage && pricing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opcje dodatkowe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Search className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="seo-addon" className="font-medium cursor-pointer">
                    Optymalizacja SEO
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Meta tagi, sitemap, schema.org
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  +{pricing[selectedPackage].seo_addon_price} zł
                </span>
                <Switch
                  id="seo-addon"
                  checked={seoAddon}
                  onCheckedChange={onSeoAddonChange}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="domain-addon" className="font-medium cursor-pointer">
                    Wdrożenie domeny przez GetRido
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Konfiguracja DNS, SSL, hosting
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  +{pricing[selectedPackage].domain_setup_price} zł
                </span>
                <Switch
                  id="domain-addon"
                  checked={domainSetupAddon}
                  onCheckedChange={onDomainSetupChange}
                />
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span className="font-semibold">Razem:</span>
              <span className="text-2xl font-bold text-primary">
                {calculateTotal()} zł
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

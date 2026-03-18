import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Key, Map, MessageSquare, Mail, Building2, Database } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SecurityApiKeysPanel } from './SecurityApiKeysPanel';
import { LocationIntegrationsPanel } from './LocationIntegrationsPanel';
import { SMSIntegrationsPanel } from './SMSIntegrationsPanel';
import { EmailSettings } from '@/components/EmailSettings';
import { RegistryIntegrationsPanel } from './RegistryIntegrationsPanel';
import { CRMIntegrationsPanel } from './CRMIntegrationsPanel';

const API_CATEGORIES = [
  { value: 'general', label: 'Ogólne / Bezpieczeństwo', icon: Key },
  { value: 'maps', label: 'Mapy i lokalizacja', icon: Map },
  { value: 'sms', label: 'Bramki SMS', icon: MessageSquare },
  { value: 'email', label: 'Email / SMTP', icon: Mail },
  { value: 'registries', label: 'Rejestry (GUS, VAT, KSeF)', icon: Building2 },
  { value: 'crm', label: 'CRM / Nieruchomości', icon: Database },
];

export function AdminApiKeysTab() {
  const [activeCategory, setActiveCategory] = useState('general');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Zarządzanie kluczami API
        </CardTitle>
        <CardDescription>
          Centralne zarządzanie wszystkimi kluczami API i integracjami platformy (oprócz AI — te zarządzaj w Centrum AI)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/50 p-1 mb-6">
            {API_CATEGORIES.map((cat) => (
              <TabsTrigger
                key={cat.value}
                value={cat.value}
                className="flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <cat.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{cat.label}</span>
                <span className="sm:hidden">{cat.label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="general">
            <SecurityApiKeysPanel />
          </TabsContent>

          <TabsContent value="maps">
            <LocationIntegrationsPanel />
          </TabsContent>

          <TabsContent value="sms">
            <SMSIntegrationsPanel />
          </TabsContent>

          <TabsContent value="email">
            <EmailSettings />
          </TabsContent>

          <TabsContent value="registries">
            <RegistryIntegrationsPanel />
          </TabsContent>

          <TabsContent value="crm">
            <CRMIntegrationsPanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

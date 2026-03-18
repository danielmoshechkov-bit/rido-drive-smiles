import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useWorkshopStatuses } from '@/hooks/useWorkshop';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Settings, Building2, FileText, Mail, Palette,
  CreditCard, Calendar, Users, Wrench, ClipboardList, Package,
  Plus, Trash2, GripVertical, Save, Loader2
} from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopSettings({ providerId, onBack }: Props) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections = {
    ogolne: {
      title: 'OGÓLNE',
      items: [
        { key: 'podstawowe', label: 'Podstawowe', icon: Settings },
        { key: 'dane-firmy', label: 'Dane firmy', icon: Building2 },
        { key: 'numeracja', label: 'Numeracja dokumentów', icon: FileText },
        { key: 'szablony-email', label: 'Szablony e-mail', icon: Mail },
        { key: 'wyglad', label: 'Wygląd dokumentów', icon: Palette },
        { key: 'karta-zlecenia', label: 'Elektroniczna karta zlecenia', icon: FileText },
        { key: 'kasy', label: 'Kasy', icon: CreditCard },
      ]
    },
    warsztat: {
      title: 'WARSZTAT',
      items: [
        { key: 'w-podstawowe', label: 'Podstawowe', icon: Settings },
        { key: 'w-zaawansowane', label: 'Zaawansowane', icon: Wrench },
        { key: 'w-wyceny', label: 'Wyceny', icon: CreditCard },
        { key: 'w-zlecenia', label: 'Zlecenia', icon: ClipboardList },
        { key: 'w-godziny', label: 'Godziny pracy', icon: Calendar },
        { key: 'w-statusy', label: 'Statusy zleceń', icon: ClipboardList },
        { key: 'w-rodzaje', label: 'Rodzaje zleceń', icon: FileText },
        { key: 'w-szablony-zadan', label: 'Szablony zadań', icon: ClipboardList },
        { key: 'w-szablony-tworzenia', label: 'Szablony tworzenia zleceń', icon: FileText },
        { key: 'w-stanowiska', label: 'Stanowiska warsztatowe', icon: Wrench },
        { key: 'w-pracownicy', label: 'Lista pracowników', icon: Users },
        { key: 'w-listy-kontrolne', label: 'Listy kontrolne', icon: ClipboardList },
        { key: 'w-pojazdy', label: 'Pojazdy', icon: Wrench },
      ]
    },
    terminarz: {
      title: 'TERMINARZ',
      items: [
        { key: 't-podstawowe', label: 'Podstawowe', icon: Calendar },
        { key: 't-kalendarze', label: 'Kalendarze dodatkowe', icon: Calendar },
      ]
    },
    magazyn: {
      title: 'MAGAZYN',
      items: [
        { key: 'm-towary', label: 'Towary', icon: Package },
        { key: 'm-producenci', label: 'Lista producentów', icon: Building2 },
        { key: 'm-grupy', label: 'Grupy cenowe', icon: CreditCard },
      ]
    },
    przechowalnia: {
      title: 'PRZECHOWALNIA',
      items: [
        { key: 'p-podstawowe', label: 'Podstawowe', icon: Settings },
        { key: 'p-szablony', label: 'Szablony zadań', icon: ClipboardList },
      ]
    },
    inne: {
      title: 'INNE',
      items: [
        { key: 'i-integracje', label: 'Integracje', icon: Wrench },
        { key: 'i-import', label: 'Import danych', icon: FileText },
        { key: 'i-eksport', label: 'Eksport danych', icon: FileText },
      ]
    },
  };

  if (activeSection) {
    return (
      <SettingSectionDetail
        sectionKey={activeSection}
        providerId={providerId}
        onBack={() => setActiveSection(null)}
        onBackToMain={onBack}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Ustawienia</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(sections).map(([key, section]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {section.items.map(item => (
                <button
                  key={item.key}
                  className="w-full text-left text-sm text-primary hover:underline py-1 flex items-center gap-2"
                  onClick={() => setActiveSection(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SettingSectionDetail({ sectionKey, providerId, onBack, onBackToMain }: {
  sectionKey: string; providerId: string; onBack: () => void; onBackToMain: () => void;
}) {
  const { data: statuses = [] } = useWorkshopStatuses(providerId);

  const titles: Record<string, string> = {
    'dane-firmy': 'Dane firmy',
    'w-statusy': 'Statusy zleceń',
    'w-stanowiska': 'Stanowiska warsztatowe',
    'w-pracownicy': 'Lista pracowników',
    'w-godziny': 'Godziny pracy',
    'karta-zlecenia': 'Elektroniczna karta zlecenia',
    'w-szablony-zadan': 'Szablony zadań',
  };

  const title = titles[sectionKey] || 'Ustawienia';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <button onClick={onBackToMain} className="text-primary hover:underline">🏠</button>
        <span className="text-muted-foreground">/</span>
        <button onClick={onBack} className="text-primary hover:underline">Ustawienia</button>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold">{title}</span>
      </div>

      {sectionKey === 'dane-firmy' && <CompanyDataSettings />}
      {sectionKey === 'w-statusy' && <StatusSettings statuses={statuses} />}
      {sectionKey === 'w-stanowiska' && <WorkstationSettings providerId={providerId} />}
      {sectionKey === 'w-pracownicy' && <WorkerSettings providerId={providerId} />}
      {sectionKey === 'w-godziny' && <WorkingHoursSettings />}
      {sectionKey === 'karta-zlecenia' && <OrderCardSettings />}

      {!['dane-firmy', 'w-statusy', 'w-stanowiska', 'w-pracownicy', 'w-godziny', 'karta-zlecenia'].includes(sectionKey) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Konfiguracja sekcji „{title}" — wkrótce dostępna
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CompanyDataSettings() {
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nazwa firmy</Label>
            <Input placeholder="Nazwa warsztatu / firmy" />
          </div>
          <div className="space-y-2">
            <Label>NIP</Label>
            <Input placeholder="0000000000" />
          </div>
          <div className="space-y-2">
            <Label>Adres</Label>
            <Input placeholder="ul. Przykładowa 1" />
          </div>
          <div className="space-y-2">
            <Label>Kod pocztowy i miasto</Label>
            <Input placeholder="00-000 Miasto" />
          </div>
          <div className="space-y-2">
            <Label>Telefon</Label>
            <Input placeholder="+48 000 000 000" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" placeholder="kontakt@warsztat.pl" />
          </div>
          <div className="space-y-2">
            <Label>Strona WWW</Label>
            <Input placeholder="https://warsztat.pl" />
          </div>
          <div className="space-y-2">
            <Label>Nr konta bankowego</Label>
            <Input placeholder="PL 00 0000 0000 0000 0000 0000 0000" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Logo firmy</Label>
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <p className="text-sm">Przeciągnij logo lub kliknij aby wybrać plik</p>
            <Button variant="outline" size="sm" className="mt-2">Wybierz plik</Button>
          </div>
        </div>
        <div className="flex justify-end">
          <Button className="gap-2"><Save className="h-4 w-4" /> Zapisz</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusSettings({ statuses }: { statuses: any[] }) {
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Zarządzaj statusami zleceń. Kolejność wpływa na przepływ pracy.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>NAZWA</TableHead>
              <TableHead>KOLOR</TableHead>
              <TableHead>KOLEJNOŚĆ</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statuses.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell><GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" /></TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-muted-foreground">{s.color}</span>
                  </div>
                </TableCell>
                <TableCell>{s.sort_order}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Dodaj status</Button>
      </CardContent>
    </Card>
  );
}

// ---- FUNCTIONAL Workstation Settings ----
function WorkstationSettings({ providerId }: { providerId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');

  const { data: workstations = [], isLoading } = useQuery({
    queryKey: ['workshop-workstations', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_workstations')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .insert({ provider_id: providerId, name, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success('Stanowisko dodane');
      setDialogOpen(false);
      setName('');
    },
    onError: (e: any) => {
      console.error('Workstation add error:', e);
      toast.error('Błąd: ' + e.message);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('workshop_workstations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-workstations'] });
      toast.success('Stanowisko usunięte');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Dodaj stanowiska pracy (podnośniki, stanowiska detailingowe itp.) widoczne w terminarzu.
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NAZWA STANOWISKA</TableHead>
                <TableHead>AKTYWNE</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workstations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Brak stanowisk — dodaj pierwsze stanowisko
                  </TableCell>
                </TableRow>
              ) : (
                workstations.map((ws: any) => (
                  <TableRow key={ws.id}>
                    <TableCell className="font-medium">{ws.name}</TableCell>
                    <TableCell>
                      <Badge variant={ws.is_active ? 'default' : 'secondary'}>
                        {ws.is_active ? 'Tak' : 'Nie'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(ws.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
        <Button variant="outline" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Dodaj stanowisko
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Dodaj stanowisko</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nazwa stanowiska *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="np. Podnośnik 1, Stanowisko detailing" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button onClick={() => addMut.mutate()} disabled={!name.trim() || addMut.isPending}>
                {addMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Dodaj
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ---- FUNCTIONAL Worker Settings ----
function WorkerSettings({ providerId }: { providerId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [empName, setEmpName] = useState('');
  const [phone, setPhone] = useState('');

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['workshop-employees', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_employees')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('workshop_employees')
        .insert({
          provider_id: providerId,
          name: empName,
          phone: phone || null,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-employees'] });
      toast.success('Pracownik dodany');
      setDialogOpen(false);
      setEmpName('');
      setPhone('');
    },
    onError: (e: any) => {
      console.error('Employee add error:', e);
      toast.error('Błąd: ' + e.message);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('workshop_employees')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-employees'] });
      toast.success('Pracownik usunięty');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Lista pracowników serwisu. Przypisywanie do zleceń i stanowisk.
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IMIĘ I NAZWISKO</TableHead>
                <TableHead>TELEFON</TableHead>
                <TableHead>AKTYWNY</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Brak pracowników — dodaj pierwszego pracownika
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp: any) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell>{emp.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                        {emp.is_active ? 'Tak' : 'Nie'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(emp.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
        <Button variant="outline" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Dodaj pracownika
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Dodaj pracownika</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Imię i nazwisko *</Label>
                <Input value={empName} onChange={e => setEmpName(e.target.value)} placeholder="Jan Kowalski" />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 000 000 000" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button onClick={() => addMut.mutate()} disabled={!empName.trim() || addMut.isPending}>
                {addMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Dodaj
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function WorkingHoursSettings() {
  const days = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Ustaw godziny pracy warsztatu. Wpływa na terminarz i dostępność.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>DZIEŃ</TableHead>
              <TableHead>OTWARTY</TableHead>
              <TableHead>OD</TableHead>
              <TableHead>DO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day, i) => (
              <TableRow key={day}>
                <TableCell className="font-medium">{day}</TableCell>
                <TableCell><Switch defaultChecked={i < 5} /></TableCell>
                <TableCell><Input type="time" defaultValue={i < 5 ? '08:00' : ''} className="w-28" disabled={i >= 5} /></TableCell>
                <TableCell><Input type="time" defaultValue={i < 5 ? '17:00' : ''} className="w-28" disabled={i >= 5} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end">
          <Button className="gap-2"><Save className="h-4 w-4" /> Zapisz</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderCardSettings() {
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <h3 className="font-semibold">Konfiguracja elektronicznej karty zlecenia</h3>
        <p className="text-sm text-muted-foreground">
          Ustawienia widoczne na karcie zlecenia wysyłanej klientowi przez SMS.
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Wymagaj podpisu protokołu przyjęcia</p>
              <p className="text-xs text-muted-foreground">Klient musi podpisać protokół przed zobaczeniem wyceny</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Wymagaj akceptacji wyceny</p>
              <p className="text-xs text-muted-foreground">Klient musi zaakceptować kosztorys przed rozpoczęciem prac</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Pokaż logo firmy na karcie</p>
              <p className="text-xs text-muted-foreground">Logo z danych firmy będzie widoczne na karcie klienta</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Powiadamiaj o zmianach w wycenie</p>
              <p className="text-xs text-muted-foreground">Klient otrzyma powiadomienie gdy warsztat zmieni pozycje po podpisaniu</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="space-y-2">
            <Label>Informacja RODO na karcie</Label>
            <Textarea
              rows={3}
              defaultValue="Wyrażam zgodę na przetwarzanie moich danych osobowych zgodnie z RODO w celu realizacji zlecenia serwisowego."
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button className="gap-2"><Save className="h-4 w-4" /> Zapisz</Button>
        </div>
      </CardContent>
    </Card>
  );
}

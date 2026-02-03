import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Phone, 
  Building, 
  Users, 
  Settings, 
  Plus, 
  Trash2, 
  Loader2,
  Power,
  Key,
  Globe,
  AlertCircle
} from "lucide-react";
import {
  useAICallCompanyWhitelist,
  useAICallUserWhitelist,
  useAddCompanyToWhitelist,
  useAddUserToWhitelist,
  useRemoveCompanyFromWhitelist,
  useRemoveUserFromWhitelist,
  useUpdateCompanyWhitelistStatus,
  useUpdateUserWhitelistStatus,
  useAICallGlobalFlag,
  useToggleAICallGlobalFlag,
  useAddMultipleCompaniesToWhitelist,
  useAddMultipleUsersToWhitelist,
} from "@/hooks/useAICallAdmin";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

export function AICallAdminPanel() {
  const [activeTab, setActiveTab] = useState("access");
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkType, setBulkType] = useState<"nip" | "email">("nip");
  const [bulkInput, setBulkInput] = useState("");

  // Single add inputs
  const [newNip, setNewNip] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Queries
  const { data: companies = [], isLoading: companiesLoading } = useAICallCompanyWhitelist();
  const { data: users = [], isLoading: usersLoading } = useAICallUserWhitelist();
  const { data: isGloballyEnabled } = useAICallGlobalFlag();

  // Mutations
  const addCompany = useAddCompanyToWhitelist();
  const addUser = useAddUserToWhitelist();
  const removeCompany = useRemoveCompanyFromWhitelist();
  const removeUser = useRemoveUserFromWhitelist();
  const updateCompanyStatus = useUpdateCompanyWhitelistStatus();
  const updateUserStatus = useUpdateUserWhitelistStatus();
  const toggleGlobal = useToggleAICallGlobalFlag();
  const bulkAddCompanies = useAddMultipleCompaniesToWhitelist();
  const bulkAddUsers = useAddMultipleUsersToWhitelist();

  const handleAddCompany = async () => {
    if (!newNip) return;
    await addCompany.mutateAsync({
      nip: newNip,
      company_name: newCompanyName || undefined,
      notes: newNotes || undefined,
    });
    setNewNip("");
    setNewCompanyName("");
    setNewNotes("");
    setIsAddCompanyOpen(false);
  };

  const handleAddUser = async () => {
    if (!newEmail) return;
    await addUser.mutateAsync({
      email: newEmail,
      notes: newNotes || undefined,
    });
    setNewEmail("");
    setNewNotes("");
    setIsAddUserOpen(false);
  };

  const handleBulkAdd = async () => {
    const items = bulkInput
      .split(/[\n,;]+/)
      .map(item => item.trim())
      .filter(Boolean);

    if (items.length === 0) return;

    if (bulkType === "nip") {
      await bulkAddCompanies.mutateAsync(items);
    } else {
      await bulkAddUsers.mutateAsync(items);
    }
    setBulkInput("");
    setIsBulkAddOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header with global toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Phone className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>AI Call Agent - Panel Administracyjny</CardTitle>
                <CardDescription>
                  Zarządzaj dostępem do modułu automatycznych połączeń AI
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">Status modułu</p>
                <p className="text-xs text-muted-foreground">
                  {isGloballyEnabled ? "Włączony globalnie" : "Wyłączony"}
                </p>
              </div>
              <Switch
                checked={isGloballyEnabled ?? false}
                onCheckedChange={(checked) => toggleGlobal.mutate(checked)}
                disabled={toggleGlobal.isPending}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Status Banner */}
      {!isGloballyEnabled && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Moduł wyłączony</span>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Włącz przełącznik powyżej, aby firmy z whitelist mogły korzystać z AI Call.
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="access" className="gap-2">
            <Users className="h-4 w-4" />
            Dostęp
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Key className="h-4 w-4" />
            Integracje API
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Ustawienia
          </TabsTrigger>
        </TabsList>

        {/* Access Control Tab */}
        <TabsContent value="access" className="space-y-6 mt-6">
          {/* Companies Whitelist */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Whitelist Firm (po NIP)
                </CardTitle>
                <CardDescription>
                  Firmy z listy mają dostęp do modułu AI Call
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Dialog open={isBulkAddOpen} onOpenChange={setIsBulkAddOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => setBulkType("nip")}>
                      Dodaj wiele
                    </Button>
                  </DialogTrigger>
                </Dialog>
                <Dialog open={isAddCompanyOpen} onOpenChange={setIsAddCompanyOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Dodaj NIP
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Dodaj firmę do whitelist</DialogTitle>
                      <DialogDescription>
                        Wpisz NIP firmy, która ma mieć dostęp do modułu AI Call
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>NIP *</Label>
                        <Input
                          placeholder="np. 5223252793"
                          value={newNip}
                          onChange={(e) => setNewNip(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Nazwa firmy (opcjonalnie)</Label>
                        <Input
                          placeholder="np. Car4Ride Sp. z o.o."
                          value={newCompanyName}
                          onChange={(e) => setNewCompanyName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Notatki (opcjonalnie)</Label>
                        <Input
                          placeholder="np. Partner premium"
                          value={newNotes}
                          onChange={(e) => setNewNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddCompanyOpen(false)}>
                        Anuluj
                      </Button>
                      <Button 
                        onClick={handleAddCompany} 
                        disabled={!newNip || addCompany.isPending}
                      >
                        {addCompany.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Dodaj
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {companiesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : companies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Brak firm na whitelist</p>
                  <p className="text-sm">Dodaj firmy po NIP, aby dać im dostęp do modułu</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NIP</TableHead>
                      <TableHead>Nazwa firmy</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dodano</TableHead>
                      <TableHead>Notatki</TableHead>
                      <TableHead className="w-[100px]">Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell className="font-mono">{company.nip}</TableCell>
                        <TableCell>{company.company_name || "-"}</TableCell>
                        <TableCell>
                          <Select
                            value={company.status}
                            onValueChange={(value: any) => 
                              updateCompanyStatus.mutate({ id: company.id, status: value })
                            }
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">
                                <Badge variant="default">Aktywna</Badge>
                              </SelectItem>
                              <SelectItem value="pending">
                                <Badge variant="secondary">Oczekuje</Badge>
                              </SelectItem>
                              <SelectItem value="disabled">
                                <Badge variant="outline">Wyłączona</Badge>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(company.created_at), "d MMM yyyy", { locale: pl })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                          {company.notes || "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCompany.mutate(company.id)}
                            disabled={removeCompany.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Users Whitelist */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Whitelist Użytkowników (po email)
                </CardTitle>
                <CardDescription>
                  Użytkownicy z listy mają dostęp do modułu AI Call
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setBulkType("email");
                    setIsBulkAddOpen(true);
                  }}
                >
                  Dodaj wiele
                </Button>
                <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Dodaj email
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Dodaj użytkownika do whitelist</DialogTitle>
                      <DialogDescription>
                        Wpisz email użytkownika, który ma mieć dostęp do modułu AI Call
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          placeholder="np. jan@firma.pl"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Notatki (opcjonalnie)</Label>
                        <Input
                          placeholder="np. Konto testowe"
                          value={newNotes}
                          onChange={(e) => setNewNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>
                        Anuluj
                      </Button>
                      <Button 
                        onClick={handleAddUser} 
                        disabled={!newEmail || addUser.isPending}
                      >
                        {addUser.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Dodaj
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Brak użytkowników na whitelist</p>
                  <p className="text-sm">Dodaj użytkowników po emailu</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dodano</TableHead>
                      <TableHead>Notatki</TableHead>
                      <TableHead className="w-[100px]">Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Select
                            value={user.status}
                            onValueChange={(value: any) => 
                              updateUserStatus.mutate({ id: user.id, status: value })
                            }
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">
                                <Badge variant="default">Aktywny</Badge>
                              </SelectItem>
                              <SelectItem value="disabled">
                                <Badge variant="outline">Wyłączony</Badge>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(user.created_at), "d MMM yyyy", { locale: pl })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                          {user.notes || "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeUser.mutate(user.id)}
                            disabled={removeUser.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Integrations Tab */}
        <TabsContent value="api" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Konfiguracja API (Placeholders)
              </CardTitle>
              <CardDescription>
                Integracje z zewnętrznymi serwisami - do podłączenia później
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Telephony */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <Label className="font-medium">Provider Telefonii</Label>
                  </div>
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="plivo">Plivo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Account SID" disabled />
                  <Input placeholder="API Key / Auth Token" type="password" disabled />
                  <Badge variant="outline">Do konfiguracji</Badge>
                </div>

                {/* STT */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <Label className="font-medium">Speech-to-Text (STT)</Label>
                  </div>
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deepgram">Deepgram</SelectItem>
                      <SelectItem value="google">Google Cloud</SelectItem>
                      <SelectItem value="azure">Azure</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="API Key" type="password" disabled />
                  <Badge variant="outline">Do konfiguracji</Badge>
                </div>

                {/* TTS */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <Label className="font-medium">Text-to-Speech (TTS)</Label>
                  </div>
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                      <SelectItem value="azure">Azure TTS</SelectItem>
                      <SelectItem value="google">Google TTS</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="API Key" type="password" disabled />
                  <Badge variant="outline">Do konfiguracji</Badge>
                </div>

                {/* LLM */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <Label className="font-medium">LLM (AI Konwersacja)</Label>
                  </div>
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="API Key" type="password" disabled />
                  <Badge variant="outline">Używa klucza z Admin Settings</Badge>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Uwaga:</strong> Na etapie MVP integracje API są placeholderami. 
                  Konfiguracja kluczy zostanie włączona po podłączeniu zewnętrznych serwisów.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Globalne ustawienia modułu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Domyślny język rozmów</Label>
                  <Select defaultValue="pl">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pl">Polski</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="ru">Русский</SelectItem>
                      <SelectItem value="ua">Українська</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Globalny limit minut / firmę / miesiąc</Label>
                  <Input type="number" defaultValue="500" />
                </div>

                <div className="space-y-2">
                  <Label>Domyślne godziny połączeń (od)</Label>
                  <Input type="time" defaultValue="09:00" />
                </div>

                <div className="space-y-2">
                  <Label>Domyślne godziny połączeń (do)</Label>
                  <Input type="time" defaultValue="20:00" />
                </div>
              </div>

              <div className="flex justify-end">
                <Button disabled>
                  Zapisz ustawienia
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bulk Add Dialog */}
      <Dialog open={isBulkAddOpen} onOpenChange={setIsBulkAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Dodaj wiele {bulkType === "nip" ? "firm (po NIP)" : "użytkowników (po email)"}
            </DialogTitle>
            <DialogDescription>
              Wpisz każdy {bulkType === "nip" ? "NIP" : "email"} w nowej linii lub rozdziel przecinkami
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={bulkType === "nip" 
                ? "5223252793\n1234567890\n9876543210" 
                : "jan@firma.pl\nanna@firma.pl\npiotr@firma.pl"
              }
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              rows={6}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkAddOpen(false)}>
              Anuluj
            </Button>
            <Button 
              onClick={handleBulkAdd} 
              disabled={!bulkInput || bulkAddCompanies.isPending || bulkAddUsers.isPending}
            >
              {(bulkAddCompanies.isPending || bulkAddUsers.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Dodaj wszystkie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Home, Users, Search, Calendar, BarChart3, 
  Sparkles, Trash2, Edit, Phone, Mail, MapPin,
  Building2, Eye, TrendingUp, Target, ArrowRight,
  GripVertical, X, FileText, Send
} from "lucide-react";

interface AgentCRMProps {
  agentId: string;
}

interface CRMListing {
  id: string;
  title: string;
  property_type: string;
  transaction_type: string;
  status: string;
  price: number | null;
  area_total: number | null;
  rooms_count: number | null;
  rooms_data: any[];
  address: any;
  photos: string[];
  created_at: string;
}

interface CRMContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  client_type: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface CRMDeal {
  id: string;
  stage: string;
  value: number | null;
  commission: number | null;
  notes: string | null;
  contact_id: string | null;
  listing_id: string | null;
  created_at: string;
}

const PROPERTY_TYPES = [
  { value: "mieszkanie", label: "Mieszkanie" },
  { value: "dom", label: "Dom" },
  { value: "dzialka", label: "Działka" },
  { value: "lokal", label: "Lokal użytkowy" },
  { value: "magazyn", label: "Magazyn" },
  { value: "biuro", label: "Biuro" },
];

const TRANSACTION_TYPES = [
  { value: "sprzedaz", label: "Sprzedaż" },
  { value: "wynajem", label: "Wynajem" },
];

const LISTING_STATUSES = [
  { value: "aktualna", label: "Aktualna", color: "bg-green-500" },
  { value: "rezerwacja", label: "Rezerwacja", color: "bg-yellow-500" },
  { value: "sprzedana", label: "Sprzedana", color: "bg-blue-500" },
  { value: "wycofana", label: "Wycofana", color: "bg-gray-500" },
  { value: "negocjacje", label: "W negocjacjach", color: "bg-orange-500" },
];

const CLIENT_TYPES = [
  { value: "kupujacy", label: "Kupujący" },
  { value: "sprzedajacy", label: "Sprzedający" },
  { value: "wynajmujacy", label: "Wynajmujący" },
  { value: "najemca", label: "Najemca" },
  { value: "inwestor", label: "Inwestor" },
];

const DEAL_STAGES = [
  { value: "nowy_kontakt", label: "Nowy kontakt", color: "bg-gray-400" },
  { value: "prezentacja", label: "Prezentacja", color: "bg-blue-400" },
  { value: "oferta", label: "Oferta", color: "bg-indigo-400" },
  { value: "negocjacje", label: "Negocjacje", color: "bg-yellow-400" },
  { value: "umowa_przedwstepna", label: "Umowa przedwstępna", color: "bg-orange-400" },
  { value: "finalizacja", label: "Finalizacja", color: "bg-green-400" },
  { value: "sprzedana", label: "Sprzedana", color: "bg-green-600" },
];

export function AgentCRM({ agentId }: AgentCRMProps) {
  const [activeSection, setActiveSection] = useState("oferty");
  const [listings, setListings] = useState<CRMListing[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [deals, setDeals] = useState<CRMDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddListing, setShowAddListing] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // New listing form
  const [newListing, setNewListing] = useState({
    title: "",
    description: "",
    property_type: "mieszkanie",
    transaction_type: "sprzedaz",
    status: "aktualna",
    price: "",
    area_total: "",
    area_usable: "",
    rooms_count: "",
    floor: "",
    floors_total: "",
    year_built: "",
    heating: "",
    ownership_form: "",
    city: "",
    district: "",
    street: "",
    rooms_data: [] as Array<{ name: string; area: string }>,
  });

  // New contact form
  const [newContact, setNewContact] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
    nip: "",
    client_type: "kupujacy",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, [agentId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [listingsRes, contactsRes, dealsRes] = await Promise.all([
        supabase.from("agent_listings").select("*").eq("agent_id", agentId).order("created_at", { ascending: false }),
        supabase.from("agent_contacts").select("*").eq("agent_id", agentId).order("created_at", { ascending: false }),
        supabase.from("agent_deals").select("*").eq("agent_id", agentId).order("created_at", { ascending: false }),
      ]);

      if (listingsRes.data) setListings(listingsRes.data as any);
      if (contactsRes.data) setContacts(contactsRes.data as any);
      if (dealsRes.data) setDeals(dealsRes.data as any);
    } catch (err) {
      console.error("CRM fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddListing = async () => {
    try {
      const priceNum = parseFloat(newListing.price) || null;
      const areaNum = parseFloat(newListing.area_total) || null;
      const pricePerM2 = priceNum && areaNum ? Math.round(priceNum / areaNum) : null;

      const { error } = await supabase.from("agent_listings").insert({
        agent_id: agentId,
        title: newListing.title,
        description: newListing.description,
        property_type: newListing.property_type,
        transaction_type: newListing.transaction_type,
        status: newListing.status,
        price: priceNum,
        price_per_m2: pricePerM2,
        area_total: areaNum,
        area_usable: parseFloat(newListing.area_usable) || null,
        rooms_count: parseInt(newListing.rooms_count) || 0,
        rooms_data: newListing.rooms_data.filter(r => r.name).map(r => ({
          name: r.name,
          area: parseFloat(r.area) || 0,
        })),
        floor: parseInt(newListing.floor) || null,
        floors_total: parseInt(newListing.floors_total) || null,
        year_built: parseInt(newListing.year_built) || null,
        heating: newListing.heating || null,
        ownership_form: newListing.ownership_form || null,
        address: {
          city: newListing.city,
          district: newListing.district,
          street: newListing.street,
        },
      });

      if (error) throw error;
      toast.success("Oferta dodana pomyślnie");
      setShowAddListing(false);
      setNewListing({
        title: "", description: "", property_type: "mieszkanie", transaction_type: "sprzedaz",
        status: "aktualna", price: "", area_total: "", area_usable: "", rooms_count: "",
        floor: "", floors_total: "", year_built: "", heating: "", ownership_form: "",
        city: "", district: "", street: "", rooms_data: [],
      });
      fetchData();
    } catch (err: any) {
      toast.error("Błąd: " + err.message);
    }
  };

  const handleAddContact = async () => {
    try {
      const { error } = await supabase.from("agent_contacts").insert({
        agent_id: agentId,
        ...newContact,
      });
      if (error) throw error;
      toast.success("Kontakt dodany");
      setShowAddContact(false);
      setNewContact({ first_name: "", last_name: "", email: "", phone: "", company: "", nip: "", client_type: "kupujacy", notes: "" });
      fetchData();
    } catch (err: any) {
      toast.error("Błąd: " + err.message);
    }
  };

  const handleGenerateDescription = async (listingId?: string) => {
    setAiGenerating(true);
    try {
      const data = listingId
        ? listings.find(l => l.id === listingId)
        : newListing;
      
      if (!data) return;

      const prompt = `Typ: ${(data as any).property_type}, Transakcja: ${(data as any).transaction_type}, Cena: ${(data as any).price} PLN, Powierzchnia: ${(data as any).area_total} m², Pokoje: ${(data as any).rooms_count}, Miasto: ${(data as any).address?.city || (data as any).city || ''}`;

      const { data: aiData, error } = await supabase.functions.invoke("ai-agent-test", {
        body: {
          model: "google/gemini-3-flash-preview",
          system_prompt: "Jesteś ekspertem od ogłoszeń nieruchomości. Napisz profesjonalny, atrakcyjny opis nieruchomości na podstawie podanych danych. Pisz po polsku, max 200 słów. Opisz zalety lokalizacji, standard, układ. Nie wymyślaj cech których nie ma w danych.",
          test_message: prompt,
        },
      });

      if (error) throw error;
      
      const generatedText = aiData?.response || aiData?.result || "Nie udało się wygenerować opisu";
      
      if (listingId) {
        await supabase.from("agent_listings").update({ 
          description: generatedText, 
          ai_description_generated: true 
        }).eq("id", listingId);
        toast.success("Opis AI wygenerowany");
        fetchData();
      } else {
        setNewListing(prev => ({ ...prev, description: generatedText }));
        toast.success("Opis AI wygenerowany");
      }
    } catch (err: any) {
      toast.error("Błąd AI: " + err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleDeleteListing = async (id: string) => {
    if (!confirm("Czy na pewno usunąć tę ofertę?")) return;
    const { error } = await supabase.from("agent_listings").delete().eq("id", id);
    if (error) toast.error("Błąd usuwania");
    else { toast.success("Oferta usunięta"); fetchData(); }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm("Czy na pewno usunąć ten kontakt?")) return;
    const { error } = await supabase.from("agent_contacts").delete().eq("id", id);
    if (error) toast.error("Błąd usuwania");
    else { toast.success("Kontakt usunięty"); fetchData(); }
  };

  const addRoom = () => {
    setNewListing(prev => ({
      ...prev,
      rooms_data: [...prev.rooms_data, { name: "", area: "" }],
    }));
  };

  const removeRoom = (idx: number) => {
    setNewListing(prev => ({
      ...prev,
      rooms_data: prev.rooms_data.filter((_, i) => i !== idx),
    }));
  };

  const updateRoom = (idx: number, field: "name" | "area", value: string) => {
    setNewListing(prev => ({
      ...prev,
      rooms_data: prev.rooms_data.map((r, i) => i === idx ? { ...r, [field]: value } : r),
    }));
  };

  const navItems = [
    { key: "oferty", label: "Oferty", icon: Home, count: listings.length },
    { key: "kontakty", label: "Kontakty", icon: Users, count: contacts.length },
    { key: "lejek", label: "Lejek", icon: Target, count: deals.length },
    { key: "kalendarz", label: "Kalendarz", icon: Calendar },
    { key: "statystyki", label: "Statystyki", icon: BarChart3 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Ładowanie CRM...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CRM Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {navItems.map(item => (
          <Button
            key={item.key}
            variant={activeSection === item.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection(item.key)}
            className="whitespace-nowrap gap-2"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.count !== undefined && (
              <Badge variant="secondary" className="ml-1 text-xs">{item.count}</Badge>
            )}
          </Button>
        ))}
      </div>

      {/* OFERTY */}
      {activeSection === "oferty" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Moje oferty</h2>
            <Button onClick={() => setShowAddListing(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Dodaj ofertę
            </Button>
          </div>

          {listings.length === 0 ? (
            <Card className="py-16 text-center">
              <Building2 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">Brak ofert</h3>
              <p className="text-muted-foreground mb-4">Dodaj swoją pierwszą ofertę nieruchomości</p>
              <Button onClick={() => setShowAddListing(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Dodaj ofertę
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {listings.map(listing => {
                const statusInfo = LISTING_STATUSES.find(s => s.value === listing.status);
                return (
                  <Card key={listing.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{listing.title || "Bez tytułu"}</h3>
                            <Badge className={cn("text-xs text-white", statusInfo?.color || "bg-gray-500")}>
                              {statusInfo?.label || listing.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            {listing.price && (
                              <span className="font-medium text-foreground">
                                {listing.price.toLocaleString("pl-PL")} zł
                              </span>
                            )}
                            {listing.area_total && <span>{listing.area_total} m²</span>}
                            {listing.rooms_count ? <span>{listing.rooms_count} pok.</span> : null}
                            {(listing.address as any)?.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {(listing.address as any).city}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleGenerateDescription(listing.id)}
                            disabled={aiGenerating}
                            title="Generuj opis AI"
                          >
                            <Sparkles className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteListing(listing.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Add Listing Dialog */}
          <Dialog open={showAddListing} onOpenChange={setShowAddListing}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Dodaj nową ofertę</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Typ nieruchomości</Label>
                    <Select value={newListing.property_type} onValueChange={v => setNewListing(p => ({ ...p, property_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Transakcja</Label>
                    <Select value={newListing.transaction_type} onValueChange={v => setNewListing(p => ({ ...p, transaction_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Tytuł</Label>
                  <Input value={newListing.title} onChange={e => setNewListing(p => ({ ...p, title: e.target.value }))} placeholder="np. Przestronne mieszkanie z widokiem" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Cena (PLN)</Label>
                    <Input type="number" value={newListing.price} onChange={e => setNewListing(p => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Powierzchnia całkowita (m²)</Label>
                    <Input type="number" value={newListing.area_total} onChange={e => setNewListing(p => ({ ...p, area_total: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Powierzchnia użytkowa (m²)</Label>
                    <Input type="number" value={newListing.area_usable} onChange={e => setNewListing(p => ({ ...p, area_usable: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label>Pokoje</Label>
                    <Input type="number" value={newListing.rooms_count} onChange={e => setNewListing(p => ({ ...p, rooms_count: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Piętro</Label>
                    <Input type="number" value={newListing.floor} onChange={e => setNewListing(p => ({ ...p, floor: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Pięter w budynku</Label>
                    <Input type="number" value={newListing.floors_total} onChange={e => setNewListing(p => ({ ...p, floors_total: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Rok budowy</Label>
                    <Input type="number" value={newListing.year_built} onChange={e => setNewListing(p => ({ ...p, year_built: e.target.value }))} />
                  </div>
                </div>

                {/* Rooms with areas */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Pokoje z metrażem</Label>
                    <Button variant="outline" size="sm" onClick={addRoom} className="gap-1">
                      <Plus className="h-3 w-3" /> Dodaj pokój
                    </Button>
                  </div>
                  {newListing.rooms_data.map((room, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <Input
                        placeholder="Nazwa (np. Salon)"
                        value={room.name}
                        onChange={e => updateRoom(idx, "name", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="m²"
                        type="number"
                        value={room.area}
                        onChange={e => updateRoom(idx, "area", e.target.value)}
                        className="w-24"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeRoom(idx)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Location */}
                <Separator />
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Miasto</Label>
                    <Input value={newListing.city} onChange={e => setNewListing(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Dzielnica</Label>
                    <Input value={newListing.district} onChange={e => setNewListing(p => ({ ...p, district: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Ulica</Label>
                    <Input value={newListing.street} onChange={e => setNewListing(p => ({ ...p, street: e.target.value }))} />
                  </div>
                </div>

                {/* Description with AI */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Opis</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerateDescription()}
                      disabled={aiGenerating}
                      className="gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      {aiGenerating ? "Generuję..." : "Generuj opis AI"}
                    </Button>
                  </div>
                  <Textarea
                    value={newListing.description}
                    onChange={e => setNewListing(p => ({ ...p, description: e.target.value }))}
                    rows={6}
                    placeholder="Opis nieruchomości..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAddListing(false)}>Anuluj</Button>
                  <Button onClick={handleAddListing} disabled={!newListing.title}>Dodaj ofertę</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* KONTAKTY */}
      {activeSection === "kontakty" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Kontakty</h2>
            <Button onClick={() => setShowAddContact(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Dodaj kontakt
            </Button>
          </div>

          {contacts.length === 0 ? (
            <Card className="py-16 text-center">
              <Users className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">Brak kontaktów</h3>
              <p className="text-muted-foreground mb-4">Dodaj pierwszy kontakt do bazy klientów</p>
              <Button onClick={() => setShowAddContact(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Dodaj kontakt
              </Button>
            </Card>
          ) : (
            <div className="grid gap-3">
              {contacts.map(contact => (
                <Card key={contact.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {(contact.first_name?.[0] || "").toUpperCase()}{(contact.last_name?.[0] || "").toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold">{contact.first_name} {contact.last_name}</h3>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {contact.phone && (
                              <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-primary">
                                <Phone className="h-3 w-3" /> {contact.phone}
                              </a>
                            )}
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-primary">
                                <Mail className="h-3 w-3" /> {contact.email}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {CLIENT_TYPES.find(t => t.value === contact.client_type)?.label || contact.client_type}
                        </Badge>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteContact(contact.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Add Contact Dialog */}
          <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dodaj kontakt</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Imię</Label>
                    <Input value={newContact.first_name} onChange={e => setNewContact(p => ({ ...p, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Nazwisko</Label>
                    <Input value={newContact.last_name} onChange={e => setNewContact(p => ({ ...p, last_name: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Firma</Label>
                    <Input value={newContact.company} onChange={e => setNewContact(p => ({ ...p, company: e.target.value }))} />
                  </div>
                  <div>
                    <Label>NIP</Label>
                    <Input value={newContact.nip} onChange={e => setNewContact(p => ({ ...p, nip: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Typ klienta</Label>
                  <Select value={newContact.client_type} onValueChange={v => setNewContact(p => ({ ...p, client_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notatki</Label>
                  <Textarea value={newContact.notes} onChange={e => setNewContact(p => ({ ...p, notes: e.target.value }))} rows={3} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAddContact(false)}>Anuluj</Button>
                  <Button onClick={handleAddContact} disabled={!newContact.first_name}>Dodaj kontakt</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* LEJEK SPRZEDAŻOWY */}
      {activeSection === "lejek" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Lejek sprzedażowy</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {DEAL_STAGES.map(stage => {
              const stageDeals = deals.filter(d => d.stage === stage.value);
              return (
                <div key={stage.value} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", stage.color)} />
                    <span className="text-xs font-medium">{stage.label}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">{stageDeals.length}</Badge>
                  </div>
                  <div className="min-h-[100px] bg-muted/30 rounded-lg p-2 space-y-2">
                    {stageDeals.map(deal => (
                      <Card key={deal.id} className="p-2 text-xs cursor-pointer hover:shadow-sm">
                        <p className="font-medium truncate">{deal.notes || "Transakcja"}</p>
                        {deal.value && <p className="text-muted-foreground">{deal.value.toLocaleString("pl-PL")} zł</p>}
                      </Card>
                    ))}
                    {stageDeals.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Brak</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KALENDARZ */}
      {activeSection === "kalendarz" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Kalendarz</h2>
          <Card className="py-16 text-center">
            <Calendar className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Kalendarz agenta</h3>
            <p className="text-muted-foreground">Planuj prezentacje, spotkania i wyceny</p>
            <p className="text-sm text-muted-foreground mt-2">Wkrótce dostępny</p>
          </Card>
        </div>
      )}

      {/* STATYSTYKI */}
      {activeSection === "statystyki" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Statystyki</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <Home className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-3xl font-bold">{listings.filter(l => l.status === "aktualna").length}</p>
                <p className="text-sm text-muted-foreground">Aktywne oferty</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Target className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold">{listings.filter(l => l.status === "sprzedana").length}</p>
                <p className="text-sm text-muted-foreground">Sprzedane</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Users className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="text-3xl font-bold">{contacts.length}</p>
                <p className="text-sm text-muted-foreground">Kontakty</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <TrendingUp className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                <p className="text-3xl font-bold">{deals.length}</p>
                <p className="text-sm text-muted-foreground">Transakcje</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

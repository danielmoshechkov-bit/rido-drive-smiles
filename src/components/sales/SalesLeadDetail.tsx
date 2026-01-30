import { useState } from "react";
import { SalesLead, useSalesLeadContacts, useSalesCallLogs, useUpdateSalesLead } from "@/hooks/useSalesLeads";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building,
  Phone,
  Mail,
  MapPin,
  Globe,
  FileText,
  User,
  PhoneCall,
  Clock,
  MessageSquare,
  Plus,
  Send,
} from "lucide-react";
import { SalesCallDialog } from "./SalesCallDialog";
import { SalesContactForm } from "./SalesContactForm";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface SalesLeadDetailProps {
  lead: SalesLead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS = [
  { value: "new", label: "Nowy" },
  { value: "contacted", label: "Kontakt" },
  { value: "interested", label: "Zainteresowany" },
  { value: "registered", label: "Zarejestrowany" },
  { value: "rejected", label: "Odrzucony" },
];

const CALL_STATUS_LABELS: Record<string, { label: string; icon: string }> = {
  answered: { label: "Odebrał", icon: "✅" },
  no_answer: { label: "Nie odebrał", icon: "📵" },
  busy: { label: "Zajęty", icon: "📞" },
  voicemail: { label: "Poczta głosowa", icon: "📧" },
  callback: { label: "Oddzwonić", icon: "🔄" },
  wrong_number: { label: "Zły numer", icon: "❌" },
};

export function SalesLeadDetail({ lead, open, onOpenChange }: SalesLeadDetailProps) {
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  
  const { data: contacts } = useSalesLeadContacts(lead.id);
  const { data: callLogs } = useSalesCallLogs(lead.id);
  const updateLead = useUpdateSalesLead();

  const handleStatusChange = (status: string) => {
    updateLead.mutate({ id: lead.id, status });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                {lead.company_name}
              </SheetTitle>
              {lead.category && (
                <Badge variant="outline" className="mt-1">
                  {lead.category.name}
                </Badge>
              )}
            </div>
            <Select value={lead.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Contact Info */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                  {lead.phone}
                </a>
              </div>
              {lead.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.city && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.address ? `${lead.address}, ` : ""}{lead.city}</span>
                </div>
              )}
              {lead.website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {lead.website}
                  </a>
                </div>
              )}
              {lead.nip && (
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>NIP: {lead.nip}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={() => setShowCallDialog(true)} className="flex-1 gap-2">
              <PhoneCall className="h-4 w-4" />
              Zapisz połączenie
            </Button>
            <Button variant="outline" className="flex-1 gap-2">
              <Send className="h-4 w-4" />
              Wyślij zaproszenie
            </Button>
          </div>

          <Separator />

          {/* Tabs */}
          <Tabs defaultValue="contacts">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="contacts">
                Kontakty ({contacts?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="calls">
                Połączenia ({callLogs?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="notes">
                Notatki
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contacts" className="mt-4 space-y-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full gap-2"
                onClick={() => setShowContactForm(true)}
              >
                <Plus className="h-4 w-4" />
                Dodaj osobę kontaktową
              </Button>
              
              {contacts?.map((contact) => (
                <Card key={contact.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{contact.full_name}</div>
                        {contact.position && (
                          <div className="text-sm text-muted-foreground">{contact.position}</div>
                        )}
                        <div className="flex gap-4 mt-2 text-sm">
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="text-primary hover:underline flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </a>
                          )}
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="text-primary hover:underline flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {contact.email}
                            </a>
                          )}
                        </div>
                      </div>
                      {contact.is_primary && (
                        <Badge variant="secondary">Główny</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {!contacts?.length && (
                <div className="text-center py-4 text-muted-foreground">
                  Brak osób kontaktowych
                </div>
              )}
            </TabsContent>

            <TabsContent value="calls" className="mt-4 space-y-3">
              {callLogs?.map((log) => (
                <Card key={log.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {CALL_STATUS_LABELS[log.call_status]?.icon || "📞"}
                        </span>
                        <div>
                          <div className="font-medium">
                            {CALL_STATUS_LABELS[log.call_status]?.label || log.call_status}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(log.call_date), "d MMM yyyy, HH:mm", { locale: pl })}
                          </div>
                        </div>
                      </div>
                      {log.callback_date && (
                        <Badge variant="outline" className="text-xs">
                          Oddzwonić: {format(new Date(log.callback_date), "d MMM", { locale: pl })}
                        </Badge>
                      )}
                    </div>
                    {log.notes && (
                      <div className="mt-2 text-sm bg-muted p-2 rounded flex gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        {log.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              
              {!callLogs?.length && (
                <div className="text-center py-4 text-muted-foreground">
                  Brak historii połączeń
                </div>
              )}
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              {lead.notes ? (
                <Card>
                  <CardContent className="pt-4">
                    <p className="whitespace-pre-wrap">{lead.notes}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  Brak notatek
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Dialogs */}
        {showCallDialog && (
          <SalesCallDialog
            lead={lead}
            open={showCallDialog}
            onOpenChange={setShowCallDialog}
          />
        )}
        
        {showContactForm && (
          <SalesContactForm
            leadId={lead.id}
            open={showContactForm}
            onOpenChange={setShowContactForm}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

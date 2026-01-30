import { useState } from "react";
import { useSalesLeads, SalesLead } from "@/hooks/useSalesLeads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Search, 
  Phone, 
  Building, 
  MapPin, 
  ExternalLink,
  MoreVertical,
  PhoneCall,
  Mail,
  UserPlus
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SalesLeadDetail } from "./SalesLeadDetail";
import { SalesCallDialog } from "./SalesCallDialog";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface SalesLeadsListProps {
  categorySlug?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Nowy", color: "bg-blue-100 text-blue-800" },
  contacted: { label: "Kontakt", color: "bg-yellow-100 text-yellow-800" },
  interested: { label: "Zainteresowany", color: "bg-green-100 text-green-800" },
  registered: { label: "Zarejestrowany", color: "bg-purple-100 text-purple-800" },
  rejected: { label: "Odrzucony", color: "bg-red-100 text-red-800" },
};

export function SalesLeadsList({ categorySlug }: SalesLeadsListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const [callDialogLead, setCallDialogLead] = useState<SalesLead | null>(null);
  
  const { data: leads, isLoading } = useSalesLeads(categorySlug, statusFilter);
  
  const filteredLeads = leads?.filter((lead) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      lead.company_name.toLowerCase().includes(searchLower) ||
      lead.phone.includes(search) ||
      lead.city?.toLowerCase().includes(searchLower) ||
      lead.email?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle>Baza leadów</CardTitle>
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj firmy, telefonu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full md:w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="new">Nowy</SelectItem>
                <SelectItem value="contacted">Kontakt</SelectItem>
                <SelectItem value="interested">Zainteresowany</SelectItem>
                <SelectItem value="registered">Zarejestrowany</SelectItem>
                <SelectItem value="rejected">Odrzucony</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : !filteredLeads?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            Brak leadów do wyświetlenia
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Miasto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data dodania</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads?.map((lead) => (
                  <TableRow 
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{lead.company_name}</div>
                          {lead.website && (
                            <a 
                              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {lead.website}
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.category && (
                        <Badge variant="outline">{lead.category.name}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <a 
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone className="h-4 w-4" />
                        {lead.phone}
                      </a>
                    </TableCell>
                    <TableCell>
                      {lead.city && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {lead.city}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_LABELS[lead.status]?.color || ""}>
                        {STATUS_LABELS[lead.status]?.label || lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(lead.created_at), "d MMM yyyy", { locale: pl })}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setCallDialogLead(lead)}>
                            <PhoneCall className="h-4 w-4 mr-2" />
                            Zapisz połączenie
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Mail className="h-4 w-4 mr-2" />
                            Wyślij zaproszenie
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Dodaj kontakt
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Lead Detail Sheet */}
      {selectedLead && (
        <SalesLeadDetail
          lead={selectedLead}
          open={!!selectedLead}
          onOpenChange={(open) => !open && setSelectedLead(null)}
        />
      )}

      {/* Call Dialog */}
      {callDialogLead && (
        <SalesCallDialog
          lead={callDialogLead}
          open={!!callDialogLead}
          onOpenChange={(open) => !open && setCallDialogLead(null)}
        />
      )}
    </Card>
  );
}

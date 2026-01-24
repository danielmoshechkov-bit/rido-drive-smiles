import { useState, useEffect } from "react";
import { 
  FileText, 
  Check, 
  X, 
  AlertTriangle, 
  Loader2, 
  Eye,
  MessageSquare,
  Sparkles,
  ChevronRight,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface Document {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  status: string;
  source: string;
  created_at: string;
  ai_extraction: Record<string, unknown> | null;
  detected_supplier: Record<string, unknown> | null;
  detected_amounts: Record<string, unknown> | null;
  notes: string | null;
  entity_id: string;
}

interface ExpenseReviewPanelProps {
  entityId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  inbox: { label: 'Nowe', color: 'bg-blue-100 text-blue-800' },
  processing: { label: 'Przetwarzanie', color: 'bg-yellow-100 text-yellow-800' },
  needs_review: { label: 'Do sprawdzenia', color: 'bg-orange-100 text-orange-800' },
  approved: { label: 'Zatwierdzone', color: 'bg-green-100 text-green-800' },
  booked: { label: 'Zaksięgowane', color: 'bg-primary/20 text-primary' },
  rejected: { label: 'Odrzucone', color: 'bg-red-100 text-red-800' },
};

export function ExpenseReviewPanel({ entityId }: ExpenseReviewPanelProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [filter, setFilter] = useState<string>('needs_review');
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [entityId, filter]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('document_inbox')
        .select('*')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setDocuments((data || []) as Document[]);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Błąd ładowania dokumentów');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (doc: Document) => {
    setProcessing(true);
    try {
      const extraction = doc.ai_extraction as Record<string, unknown> | null;
      
      // Create accounting entry
      const { error: entryError } = await supabase.from('accounting_entries').insert({
        entity_id: entityId,
        document_id: doc.id,
        entry_type: 'expense',
        entry_date: new Date().toISOString().split('T')[0],
        accounting_period: format(new Date(), 'yyyy-MM'),
        amount: (extraction?.gross_amount as number) || 0,
        description: `${(extraction?.supplier_name as string) || 'Dokument'} - ${doc.file_name}`,
        ai_suggested: true,
      });

      if (entryError) throw entryError;

      // Update document status
      const { error: updateError } = await supabase
        .from('document_inbox')
        .update({ 
          status: 'approved',
          notes: comment || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', doc.id);

      if (updateError) throw updateError;

      toast.success('Dokument zatwierdzony i zaksięgowany');
      setComment('');
      setSelectedDoc(null);
      fetchDocuments();
    } catch (error) {
      console.error('Error approving document:', error);
      toast.error('Błąd zatwierdzania dokumentu');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (doc: Document) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('document_inbox')
        .update({ 
          status: 'rejected',
          notes: comment || 'Odrzucono przez księgową',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', doc.id);

      if (error) throw error;

      toast.success('Dokument odrzucony');
      setComment('');
      setSelectedDoc(null);
      fetchDocuments();
    } catch (error) {
      console.error('Error rejecting document:', error);
      toast.error('Błąd odrzucania dokumentu');
    } finally {
      setProcessing(false);
    }
  };

  const handleRequestClarification = async (doc: Document) => {
    if (!comment.trim()) {
      toast.error('Wpisz pytanie do klienta');
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('document_inbox')
        .update({ 
          status: 'needs_review',
          notes: `[PYTANIE] ${comment}`,
        })
        .eq('id', doc.id);

      if (error) throw error;

      toast.success('Wysłano pytanie do klienta');
      setComment('');
      fetchDocuments();
    } catch (error) {
      console.error('Error requesting clarification:', error);
      toast.error('Błąd wysyłania pytania');
    } finally {
      setProcessing(false);
    }
  };

  const getExtractionData = (doc: Document) => {
    return doc.ai_extraction as Record<string, unknown> | null;
  };

  const formatCurrency = (amount: number | unknown) => {
    if (typeof amount !== 'number') return '-';
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);
  };

  const renderDocumentPreview = (doc: Document) => {
    const extraction = getExtractionData(doc);
    
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">{doc.file_name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(doc.created_at), 'dd MMM yyyy, HH:mm', { locale: pl })}
              </p>
            </div>
            <Badge className={STATUS_CONFIG[doc.status]?.color || 'bg-muted'}>
              {STATUS_CONFIG[doc.status]?.label || doc.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Document preview */}
          <div className="aspect-[4/3] bg-muted rounded-lg overflow-hidden">
            {doc.file_type?.startsWith('image/') ? (
              <img 
                src={doc.file_url} 
                alt={doc.file_name}
                className="w-full h-full object-contain"
              />
            ) : (
              <iframe
                src={doc.file_url}
                className="w-full h-full"
                title={doc.file_name}
              />
            )}
          </div>

          {/* AI Extraction */}
          {extraction && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                AI rozpoznał:
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Dostawca:</span>
                  <p className="font-medium">{(extraction.supplier_name as string) || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">NIP:</span>
                  <p className="font-medium">{(extraction.supplier_nip as string) || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Netto:</span>
                  <p className="font-medium">{formatCurrency(extraction.net_amount)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Brutto:</span>
                  <p className="font-medium">{formatCurrency(extraction.gross_amount)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Data:</span>
                  <p className="font-medium">{(extraction.invoice_date as string) || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Numer:</span>
                  <p className="font-medium">{(extraction.invoice_number as string) || '-'}</p>
                </div>
              </div>
              {extraction.confidence && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">Pewność AI:</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(extraction.confidence as number) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">
                    {Math.round((extraction.confidence as number) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {doc.notes && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">{doc.notes}</p>
            </div>
          )}

          {/* Comment */}
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Dodaj komentarz lub pytanie..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => handleReject(doc)}
              disabled={processing}
            >
              <X className="h-4 w-4 mr-1" />
              Odrzuć
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRequestClarification(doc)}
              disabled={processing || !comment.trim()}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => handleApprove(doc)}
              disabled={processing}
            >
              {processing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Zatwierdź
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const counts = {
    needs_review: documents.filter(d => d.status === 'needs_review').length,
    inbox: documents.filter(d => d.status === 'inbox').length,
    approved: documents.filter(d => d.status === 'approved').length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Panel weryfikacji dokumentów
          </h3>
          <p className="text-sm text-muted-foreground">
            Przeglądaj i zatwierdzaj dokumenty kosztowe
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="needs_review">
              Do sprawdzenia ({counts.needs_review})
            </SelectItem>
            <SelectItem value="inbox">Nowe ({counts.inbox})</SelectItem>
            <SelectItem value="approved">Zatwierdzone</SelectItem>
            <SelectItem value="all">Wszystkie</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-muted-foreground">Brak dokumentów do przeglądania</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map(doc => (
            <div key={doc.id}>
              {renderDocumentPreview(doc)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

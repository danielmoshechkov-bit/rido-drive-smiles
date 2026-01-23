import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Upload, 
  FileText, 
  Image, 
  Loader2, 
  Eye, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  X
} from 'lucide-react';
import { AIExtractionPanel, type ExtractionData } from './AIExtractionPanel';

interface Document {
  id: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  status: string;
  source: string | null;
  detected_supplier: unknown;
  detected_amounts: unknown;
  ai_extraction: unknown;
  created_at: string;
  notes: string | null;
}

interface DocumentInboxProps {
  entityId: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
  new: { label: 'Nowy', variant: 'default', icon: Clock },
  parsed: { label: 'Przetworzony', variant: 'secondary', icon: FileText },
  needs_review: { label: 'Do weryfikacji', variant: 'destructive', icon: AlertCircle },
  booked: { label: 'Zaksięgowany', variant: 'outline', icon: CheckCircle2 },
  rejected: { label: 'Odrzucony', variant: 'secondary', icon: X },
};

export function DocumentInbox({ entityId }: DocumentInboxProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [bookingDocument, setBookingDocument] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to safely cast ai_extraction to ExtractionData
  const getExtractionData = (doc: Document): ExtractionData | null => {
    if (!doc.ai_extraction) return null;
    const extraction = doc.ai_extraction as Record<string, unknown>;
    if (typeof extraction !== 'object') return null;
    return extraction as unknown as ExtractionData;
  };

  useEffect(() => {
    if (entityId) {
      fetchDocuments();
    }
  }, [entityId]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('document_inbox')
        .select('*')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      toast.error('Błąd ładowania dokumentów');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(file);
      }
      toast.success(`Przesłano ${files.length} dokument(ów)`);
      fetchDocuments();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Błąd przesyłania: ' + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const uploadFile = async (file: File) => {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Dozwolone formaty: PDF, JPG, PNG');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Maksymalny rozmiar pliku: 10MB');
    }

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const fileName = `${entityId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('document-inbox')
      .upload(fileName, file);

    if (uploadError) {
      // Create bucket if doesn't exist
      if (uploadError.message.includes('Bucket not found')) {
        await supabase.storage.createBucket('document-inbox', { public: false });
        const { error: retryError } = await supabase.storage
          .from('document-inbox')
          .upload(fileName, file);
        if (retryError) throw retryError;
      } else {
        throw uploadError;
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('document-inbox')
      .getPublicUrl(fileName);

    // Create document record
    const { error: dbError } = await supabase
      .from('document_inbox')
      .insert({
        entity_id: entityId,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: file.type.startsWith('image/') ? 'image' : 'pdf',
        source: 'upload',
        status: 'new',
      });

    if (dbError) throw dbError;
  };

  const handleAnalyzeWithAI = async (doc: Document) => {
    setAnalyzing(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke('ai-service', {
        body: {
          type: 'document_extract',
          payload: {
            document_url: doc.file_url,
            file_type: doc.file_type || 'image',
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'AI extraction failed');

      const extraction = data.extraction;
      
      // Update document with AI extraction results
      await supabase
        .from('document_inbox')
        .update({
          ai_extraction: extraction,
          detected_supplier: extraction?.supplier || null,
          detected_amounts: extraction?.amounts || null,
          status: 'needs_review',
        })
        .eq('id', doc.id);

      toast.success('Analiza AI zakończona');
      fetchDocuments();
    } catch (error: any) {
      console.error('AI analysis error:', error);
      toast.error('Błąd analizy AI: ' + error.message);
    } finally {
      setAnalyzing(null);
    }
  };

  const handleConfirmBooking = async (doc: Document, data: ExtractionData) => {
    setBookingDocument(doc.id);
    try {
      // Create accounting entry from extraction
      const { error } = await supabase.from('accounting_entries').insert({
        entity_id: entityId,
        document_id: doc.id,
        entry_type: 'cost',
        entry_date: data.issue_date || new Date().toISOString().split('T')[0],
        accounting_period: data.issue_date?.substring(0, 7) || new Date().toISOString().substring(0, 7),
        amount: data.amounts?.gross || 0,
        description: `${data.supplier?.name || 'Dostawca'} - ${data.invoice_number || 'Faktura'}`,
        vat_register: 'zakupy',
        ai_suggested: true,
        approved_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Update document status
      await supabase
        .from('document_inbox')
        .update({ status: 'booked' })
        .eq('id', doc.id);

      toast.success('Dokument zaksięgowany');
      fetchDocuments();
    } catch (error: any) {
      console.error('Booking error:', error);
      toast.error('Błąd księgowania: ' + error.message);
    } finally {
      setBookingDocument(null);
    }
  };

  const handleRejectExtraction = async (doc: Document) => {
    try {
      await supabase
        .from('document_inbox')
        .update({ 
          status: 'rejected',
          ai_extraction: null,
          detected_supplier: null,
          detected_amounts: null,
        })
        .eq('id', doc.id);

      toast.success('Wyniki AI odrzucone');
      fetchDocuments();
    } catch (error: any) {
      console.error('Reject error:', error);
      toast.error('Błąd odrzucania');
    }
  };

  const handleUpdateStatus = async (docId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('document_inbox')
        .update({ status: newStatus })
        .eq('id', docId);

      if (error) throw error;
      
      toast.success('Status zaktualizowany');
      fetchDocuments();
      if (selectedDocument?.id === docId) {
        setSelectedDocument(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Błąd aktualizacji');
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Czy na pewno usunąć ten dokument?')) return;

    try {
      const { error } = await supabase
        .from('document_inbox')
        .delete()
        .eq('id', docId);

      if (error) throw error;
      
      toast.success('Dokument usunięty');
      fetchDocuments();
      if (selectedDocument?.id === docId) {
        setSelectedDocument(null);
      }
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error('Błąd usuwania');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Document List */}
      <div className="space-y-4">
        {/* Upload area */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div 
              className="flex flex-col items-center justify-center py-8 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
              ) : (
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              )}
              <p className="text-sm font-medium">
                {uploading ? 'Przesyłanie...' : 'Kliknij lub przeciągnij pliki'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG, PNG (max 10MB)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </CardContent>
        </Card>

        {/* Documents list */}
        <div className="space-y-2">
          {documents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Brak dokumentów</p>
                <p className="text-sm">Wgraj pierwszą fakturę kosztową</p>
              </CardContent>
            </Card>
          ) : (
            documents.map((doc) => (
              <Card 
                key={doc.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  selectedDocument?.id === doc.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedDocument(doc)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {doc.file_type === 'image' ? (
                      <Image className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">
                        {doc.file_name || 'Dokument'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(doc.created_at)}
                      </p>
                    </div>
                    {getStatusBadge(doc.status)}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Right: Document Preview */}
      <div className="lg:sticky lg:top-20">
        {selectedDocument ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base truncate">
                  {selectedDocument.file_name || 'Dokument'}
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setSelectedDocument(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preview */}
              <div className="border rounded-lg overflow-hidden bg-muted">
                {selectedDocument.file_type === 'image' ? (
                  <img 
                    src={selectedDocument.file_url} 
                    alt="Podgląd dokumentu"
                    className="w-full h-auto max-h-[400px] object-contain"
                  />
                ) : (
                  <div className="aspect-[3/4] flex items-center justify-center">
                    <a 
                      href={selectedDocument.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 text-primary hover:underline"
                    >
                      <FileText className="h-16 w-16" />
                      <span>Otwórz PDF</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status:</span>
                {getStatusBadge(selectedDocument.status)}
              </div>

              {/* AI Extraction Panel */}
              {(() => {
                const extraction = getExtractionData(selectedDocument);
                if (extraction && selectedDocument.status === 'needs_review') {
                  return (
                    <AIExtractionPanel
                      extraction={extraction}
                      onConfirm={(data) => handleConfirmBooking(selectedDocument, data)}
                      onReject={() => handleRejectExtraction(selectedDocument)}
                      isLoading={bookingDocument === selectedDocument.id}
                    />
                  );
                }
                
                // Show simple extraction summary for already processed docs
                if (extraction) {
                  return (
                    <div className="p-3 bg-muted rounded-lg space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Wyniki AI:</p>
                      {extraction.supplier?.name && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Dostawca:</span>{' '}
                          {extraction.supplier.name}
                        </p>
                      )}
                      {extraction.amounts && (
                        <>
                          <p className="text-sm">
                            <span className="text-muted-foreground">Netto:</span>{' '}
                            {extraction.amounts.net ?? '-'} PLN
                          </p>
                          <p className="text-sm">
                            <span className="text-muted-foreground">Brutto:</span>{' '}
                            {extraction.amounts.gross ?? '-'} PLN
                          </p>
                        </>
                      )}
                    </div>
                  );
                }
                
                return null;
              })()}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAnalyzeWithAI(selectedDocument)}
                  disabled={analyzing === selectedDocument.id}
                >
                  {analyzing === selectedDocument.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Analizuj AI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a href={selectedDocument.file_url} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4 mr-2" />
                    Otwórz
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(selectedDocument.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Usuń
                </Button>
              </div>

              {/* Status change buttons */}
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground mb-2">Zmień status:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <Button
                      key={key}
                      variant={selectedDocument.status === key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleUpdateStatus(selectedDocument.id, key)}
                      disabled={selectedDocument.status === key}
                    >
                      {config.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Wybierz dokument z listy</p>
              <p className="text-sm">aby zobaczyć podgląd i szczegóły</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

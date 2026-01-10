import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, Calendar, CheckCircle, Clock, AlertTriangle, Loader2, Eye } from "lucide-react";
import { format, isPast, addDays } from "date-fns";
import { pl } from "date-fns/locale";

interface DriverDocument {
  id: string;
  file_url: string | null;
  file_name: string | null;
  expires_at: string | null;
  status: string | null;
  created_at: string;
  document_types: {
    id: string;
    name: string;
    required: boolean;
  } | null;
}

interface DriverDocumentsViewProps {
  driverId: string;
}

export function DriverDocumentsView({ driverId }: DriverDocumentsViewProps) {
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<DriverDocument | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, [driverId]);

  const fetchDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("driver_documents")
      .select(`
        id,
        file_url,
        file_name,
        expires_at,
        status,
        created_at,
        document_types (
          id,
          name,
          required
        )
      `)
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDocuments(data as unknown as DriverDocument[]);
    }
    setLoading(false);
  };

  const getStatusBadge = (doc: DriverDocument) => {
    if (!doc.expires_at) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          Brak daty
        </Badge>
      );
    }

    const expiryDate = new Date(doc.expires_at);
    const warningDate = addDays(new Date(), 30);

    if (isPast(expiryDate)) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Wygasły
        </Badge>
      );
    }

    if (expiryDate <= warningDate) {
      return (
        <Badge className="gap-1 bg-orange-500/10 text-orange-700 border-orange-500/20">
          <AlertTriangle className="h-3 w-3" />
          Wygasa wkrótce
        </Badge>
      );
    }

    return (
      <Badge className="gap-1 bg-green-500/10 text-green-700 border-green-500/20">
        <CheckCircle className="h-3 w-3" />
        Aktualny
      </Badge>
    );
  };

  const isPreviewable = (url: string | null) => {
    if (!url) return false;
    const ext = url.split('.').pop()?.toLowerCase();
    return ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '');
  };

  const isPdf = (url: string | null) => {
    if (!url) return false;
    return url.toLowerCase().endsWith('.pdf');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center p-4 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Brak dokumentów</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {documents.map((doc) => (
          <Card key={doc.id} className="overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-muted">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {doc.document_types?.name || "Dokument"}
                    </p>
                    {doc.expires_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Ważny do: {format(new Date(doc.expires_at), "d MMM yyyy", { locale: pl })}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {getStatusBadge(doc)}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPreviewDoc(doc)}
                    className="gap-1"
                  >
                    <Eye className="h-3 w-3" />
                    <span className="hidden sm:inline">Podgląd</span>
                  </Button>
                  {doc.file_url && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      asChild
                      className="gap-1"
                    >
                      <a href={doc.file_url} target="_blank" rel="noreferrer" download>
                        <Download className="h-3 w-3" />
                        <span className="hidden sm:inline">Pobierz</span>
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewDoc?.document_types?.name || "Dokument"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Document Info */}
            <div className="flex flex-wrap gap-4 text-sm">
              {previewDoc?.expires_at && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Ważny do: {format(new Date(previewDoc.expires_at), "d MMMM yyyy", { locale: pl })}</span>
                  {previewDoc && getStatusBadge(previewDoc)}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Dodano: {previewDoc && format(new Date(previewDoc.created_at), "d MMMM yyyy, HH:mm", { locale: pl })}</span>
              </div>
            </div>

            {/* Preview Content */}
            <div className="border rounded-lg overflow-hidden bg-muted/30">
              {previewDoc?.file_url && isPreviewable(previewDoc.file_url) ? (
                isPdf(previewDoc.file_url) ? (
                  <iframe
                    src={previewDoc.file_url}
                    className="w-full h-[60vh]"
                    title="Document preview"
                  />
                ) : (
                  <div className="flex items-center justify-center p-4">
                    <img
                      src={previewDoc.file_url}
                      alt="Document preview"
                      className="max-w-full max-h-[60vh] object-contain"
                    />
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                  <FileText className="h-16 w-16 mb-4 opacity-50" />
                  <p>Podgląd niedostępny dla tego typu pliku</p>
                  <p className="text-sm">{previewDoc?.file_name}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreviewDoc(null)}>
                Zamknij
              </Button>
              {previewDoc?.file_url && (
                <Button asChild>
                  <a href={previewDoc.file_url} target="_blank" rel="noreferrer" download>
                    <Download className="h-4 w-4 mr-2" />
                    Pobierz
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isPast, addDays } from "date-fns";
import { pl } from "date-fns/locale";
import { 
  FileText, 
  Download, 
  Calendar, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Eye, 
  Trash2,
  Plus,
  Loader2
} from "lucide-react";

interface DocumentType {
  id: string;
  name: string;
  required: boolean;
}

interface DriverDocument {
  id: string;
  file_url: string | null;
  file_name: string | null;
  expires_at: string | null;
  status: string | null;
  created_at: string;
  document_types: DocumentType | null;
}

interface DriverDocumentsPanelProps {
  driverId: string;
}

export function DriverDocumentsPanel({ driverId }: DriverDocumentsPanelProps) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<DriverDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<DriverDocument | null>(null);

  useEffect(() => {
    loadDocumentTypes();
    loadDocuments();
  }, [driverId]);

  const loadDocumentTypes = async () => {
    const { data } = await supabase
      .from("document_types")
      .select("id, name, required")
      .order("name");
    
    if (data) {
      setDocumentTypes(data);
      if (data.length > 0 && !selectedTypeId) {
        setSelectedTypeId(data[0].id);
      }
    }
  };

  const loadDocuments = async () => {
    setLoadingDocs(true);
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
      setDocs(data as unknown as DriverDocument[]);
    }
    setLoadingDocs(false);
  };

  const handleUpload = async () => {
    if (!file || !selectedTypeId) return;

    setLoading(true);
    try {
      const path = `${driverId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(path);

      const { error } = await supabase.from("driver_documents").insert([{
        driver_id: driverId,
        document_type_id: selectedTypeId,
        file_url: publicUrl,
        file_name: file.name,
        expires_at: expiresAt || null
      }]);

      if (error) throw error;

      toast.success("Dokument dodany pomyślnie");
      setFile(null);
      setExpiresAt("");
      loadDocuments();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten dokument?")) return;

    try {
      const { error } = await supabase
        .from("driver_documents")
        .delete()
        .eq("id", docId);

      if (error) throw error;
      toast.success("Dokument usunięty");
      loadDocuments();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getStatusBadge = (doc: DriverDocument) => {
    if (!doc.expires_at) {
      return (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Clock className="h-3 w-3" />
          Brak daty
        </Badge>
      );
    }

    const expiryDate = new Date(doc.expires_at);
    const warningDate = addDays(new Date(), 30);

    if (isPast(expiryDate)) {
      return (
        <Badge variant="destructive" className="gap-1 text-xs">
          <AlertTriangle className="h-3 w-3" />
          Wygasły
        </Badge>
      );
    }

    if (expiryDate <= warningDate) {
      return (
        <Badge className="gap-1 text-xs bg-orange-500/10 text-orange-700 border-orange-500/20">
          <AlertTriangle className="h-3 w-3" />
          Wygasa wkrótce
        </Badge>
      );
    }

    return (
      <Badge className="gap-1 text-xs bg-green-500/10 text-green-700 border-green-500/20">
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

  if (loadingDocs) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Document Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Dodaj dokument
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label>Typ dokumentu</Label>
              <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz typ dokumentu" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map(dt => (
                    <SelectItem key={dt.id} value={dt.id}>
                      {dt.name} {dt.required && <span className="text-destructive">*</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data ważności</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Plik</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="space-y-2">
              <Label className="invisible">Akcja</Label>
              <Button 
                onClick={handleUpload} 
                disabled={!file || !selectedTypeId || loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Dodawanie...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Dodaj dokument
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      {docs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Brak dokumentów</p>
            <p className="text-sm text-muted-foreground mt-1">
              Dodaj swój pierwszy dokument używając formularza powyżej
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <Card 
              key={doc.id} 
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setPreviewDoc(doc)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {doc.document_types?.name || "Dokument"}
                    </p>
                    
                    {doc.expires_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        Ważny do: {format(new Date(doc.expires_at), "d MMM yyyy", { locale: pl })}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground mt-1">
                      Dodano: {format(new Date(doc.created_at), "d MMM yyyy", { locale: pl })}
                    </p>

                    <div className="mt-2">
                      {getStatusBadge(doc)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewDoc(doc);
                    }}
                    className="flex-1"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Podgląd
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a href={doc.file_url || "#"} target="_blank" rel="noreferrer" download>
                      <Download className="h-3 w-3" />
                    </a>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
    </div>
  );
}

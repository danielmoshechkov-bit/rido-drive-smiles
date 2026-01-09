import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, Calendar, CheckCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";
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

  const handleDownload = (doc: DriverDocument) => {
    if (doc.file_url) {
      window.open(doc.file_url, "_blank");
    }
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
                {doc.file_url && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDownload(doc)}
                    className="gap-1"
                  >
                    <Download className="h-3 w-3" />
                    <span className="hidden sm:inline">Pobierz</span>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface B2BInvoiceCardProps {
  driverId: string;
  driverName: string;
  periodFrom: string;
  periodTo: string;
  invoiceAmount: number; // Suma platform z prowizją
  paidAmount: number; // Suma gotówek
  fleetId: string | null;
}

export function B2BInvoiceCard({
  driverId,
  driverName,
  periodFrom,
  periodTo,
  invoiceAmount,
  paidAmount,
  fleetId,
}: B2BInvoiceCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const { toast } = useToast();

  const remainingAmount = invoiceAmount - paidAmount;

  // Miesiąc faktury na podstawie początku okresu
  const invoiceMonth = format(new Date(periodFrom), "LLLL yyyy", { locale: pl });
  const invoiceMonthShort = format(new Date(periodFrom), "LLLL", { locale: pl });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: "PLN",
    }).format(amount);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(selectedFile.type)) {
        toast({
          title: "Nieprawidłowy format",
          description: "Dozwolone formaty: PDF, JPG, PNG, WEBP",
          variant: "destructive",
        });
        return;
      }
      // Validate file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "Plik za duży",
          description: "Maksymalny rozmiar pliku to 10MB",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmitInvoice = async () => {
    if (!file) {
      toast({
        title: "Brak pliku",
        description: "Wybierz plik faktury do wysłania",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");

      // Create unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${driverId}/${periodFrom}_${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("driver-invoices")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("driver-invoices")
        .getPublicUrl(fileName);

      // Get period month/year
      const periodDate = new Date(periodFrom);
      const periodMonth = periodDate.getMonth() + 1;
      const periodYear = periodDate.getFullYear();

      // Save invoice record
      const { error: insertError } = await supabase.from("driver_invoices").insert({
        driver_id: driverId,
        period_month: periodMonth,
        period_year: periodYear,
        invoice_amount: invoiceAmount,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        file_url: urlData.publicUrl,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
        status: "pending",
      });

      if (insertError) throw insertError;

      // Send email via edge function
      if (fleetId) {
        await supabase.functions.invoke("send-driver-invoice", {
          body: {
            driver_id: driverId,
            driver_name: driverName,
            fleet_id: fleetId,
            invoice_month: invoiceMonthShort,
            file_url: urlData.publicUrl,
            file_name: file.name,
            invoice_amount: invoiceAmount,
            paid_amount: paidAmount,
            remaining_amount: remainingAmount,
          },
        });
      }

      setUploaded(true);
      toast({
        title: "Faktura wysłana!",
        description: "Twoja faktura została przesłana do opiekuna floty",
      });
    } catch (error: any) {
      console.error("Error uploading invoice:", error);
      toast({
        title: "Błąd",
        description: error.message || "Nie udało się wysłać faktury",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (uploaded) {
    return (
      <Card className="border-2 border-green-200 bg-green-50">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="rounded-full bg-green-100 p-3 mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-lg font-semibold text-green-800">Faktura wysłana!</p>
          <p className="text-sm text-green-600 mt-1">
            Faktura za {invoiceMonth} została przesłana
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-blue-600" />
          <span>Faktura do wystawienia</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground capitalize">{invoiceMonth}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Kwota faktury */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Kwota faktury:</span>
          <span className="text-lg font-bold text-blue-600">
            {formatCurrency(invoiceAmount)}
          </span>
        </div>

        {/* Zapłacone (gotówka) */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Zapłacone (gotówka):</span>
          <span className="text-green-600 font-medium">
            -{formatCurrency(paidAmount)}
          </span>
        </div>

        {/* Pozostało */}
        <div className="flex justify-between items-center border-t pt-3">
          <span className="font-medium">Pozostało do zapłaty:</span>
          <span
            className={`text-lg font-bold ${
              remainingAmount > 0 ? "text-red-600" : "text-green-600"
            }`}
          >
            {formatCurrency(remainingAmount)}
          </span>
        </div>

        {/* Upload faktury */}
        <div className="border-t pt-4 space-y-3">
          <Label htmlFor="invoice-file" className="text-sm font-medium">
            Wgraj fakturę (PDF lub zdjęcie):
          </Label>
          <Input
            id="invoice-file"
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="bg-white"
          />
          {file && (
            <p className="text-xs text-muted-foreground">
              Wybrany plik: {file.name}
            </p>
          )}
          <Button
            onClick={handleSubmitInvoice}
            disabled={!file || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wysyłanie...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Wyślij fakturę
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { User, MapPin, Car, Stethoscope, FileText, Loader2, Pencil } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface DriverPersonalInfoProps {
  driverId: string;
}

interface DriverData {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  pesel: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  license_number: string | null;
  license_issue_date: string | null;
  license_expiry_date: string | null;
  license_is_unlimited: boolean | null;
}

interface DocumentData {
  document_type_id: string;
  expires_at: string | null;
  document_types: {
    name: string;
  } | null;
}

export function DriverPersonalInfo({ driverId }: DriverPersonalInfoProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [documents, setDocuments] = useState<DocumentData[]>([]);

  useEffect(() => {
    loadData();
  }, [driverId]);

  const loadData = async () => {
    try {
      // Fetch driver data
      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select(`
          first_name, last_name, email, phone, pesel,
          address_street, address_city, address_postal_code,
          license_number, license_issue_date, license_expiry_date, license_is_unlimited
        `)
        .eq("id", driverId)
        .single();

      if (driverError) throw driverError;
      setDriverData(driver);

      // Fetch documents with expiry dates
      const { data: docs } = await supabase
        .from("driver_documents")
        .select(`
          document_type_id,
          expires_at,
          document_types(name)
        `)
        .eq("driver_id", driverId)
        .not("expires_at", "is", null);

      setDocuments(docs || []);
    } catch (error) {
      console.error("Error loading driver info:", error);
    } finally {
      setLoading(false);
    }
  };

  const getExpiryBadge = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    
    const today = new Date();
    const expiry = parseISO(expiryDate);
    const daysUntilExpiry = differenceInDays(expiry, today);

    if (daysUntilExpiry < 0) {
      return <Badge variant="destructive">Wygasło</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge variant="destructive">Wygasa za {daysUntilExpiry} dni</Badge>;
    } else if (daysUntilExpiry <= 60) {
      return <Badge variant="secondary" className="bg-orange-100 text-orange-800">Wygasa wkrótce</Badge>;
    }
    return <Badge variant="secondary" className="bg-green-100 text-green-800">Ważne</Badge>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return format(parseISO(dateStr), "d MMMM yyyy", { locale: pl });
    } catch {
      return dateStr;
    }
  };

  const getMedicalExam = () => {
    return documents.find(d => 
      d.document_types?.name?.toLowerCase().includes("lekarsk")
    );
  };

  const getPsychologicalExam = () => {
    return documents.find(d => 
      d.document_types?.name?.toLowerCase().includes("psycholog")
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!driverData) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nie udało się załadować danych kierowcy
        </CardContent>
      </Card>
    );
  }

  const medicalExam = getMedicalExam();
  const psychologicalExam = getPsychologicalExam();

  return (
    <div className="space-y-4">
      {/* Personal Data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            {t('driverInfo.personalData')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.firstName')}</p>
              <p className="font-medium">{driverData.first_name || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.lastName')}</p>
              <p className="font-medium">{driverData.last_name || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.pesel')}</p>
              <p className="font-medium font-mono">{driverData.pesel || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.email')}</p>
              <p className="font-medium">{driverData.email || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.phone')}</p>
              <p className="font-medium">{driverData.phone || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            {t('driverInfo.address')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-2">
              <p className="text-sm text-muted-foreground">{t('driverInfo.street')}</p>
              <p className="font-medium">{driverData.address_street || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.postalCode')}</p>
              <p className="font-medium">{driverData.address_postal_code || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.city')}</p>
              <p className="font-medium">{driverData.address_city || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Driver's License */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            {t('driverInfo.driversLicense')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.licenseNumber')}</p>
              <p className="font-medium font-mono">{driverData.license_number || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.issueDate')}</p>
              <p className="font-medium">{formatDate(driverData.license_issue_date)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('driverInfo.expiryDate')}</p>
              <div className="flex items-center gap-2">
                {driverData.license_is_unlimited ? (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">Bezterminowe</Badge>
                ) : (
                  <>
                    <p className="font-medium">{formatDate(driverData.license_expiry_date)}</p>
                    {getExpiryBadge(driverData.license_expiry_date)}
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Medical Examinations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4" />
            {t('driverInfo.medicalExams')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 p-3 border rounded-lg">
              <p className="text-sm font-medium">{t('driverInfo.medicalExam')}</p>
              {medicalExam?.expires_at ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">{t('driverInfo.validUntil')}: {formatDate(medicalExam.expires_at)}</p>
                  {getExpiryBadge(medicalExam.expires_at)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('driverInfo.noData')}</p>
              )}
            </div>
            <div className="space-y-2 p-3 border rounded-lg">
              <p className="text-sm font-medium">{t('driverInfo.psychologicalExam')}</p>
              {psychologicalExam?.expires_at ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">{t('driverInfo.validUntil')}: {formatDate(psychologicalExam.expires_at)}</p>
                  {getExpiryBadge(psychologicalExam.expires_at)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('driverInfo.noData')}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info note */}
      <div className="p-3 bg-muted/50 rounded-lg">
        <p className="text-xs text-muted-foreground">
          ℹ️ {t('driverInfo.editNote')}
        </p>
      </div>
    </div>
  );
}

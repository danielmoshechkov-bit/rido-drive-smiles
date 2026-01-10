import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { User, MapPin, FileText, Stethoscope, Loader2, Pencil, Check, X, Home } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
  correspondence_street: string | null;
  correspondence_city: string | null;
  correspondence_postal_code: string | null;
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

type EditableField = keyof DriverData | null;

export function DriverPersonalInfo({ driverId }: DriverPersonalInfoProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  
  // Inline editing state
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [driverId]);

  const loadData = async () => {
    try {
      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select(`
          first_name, last_name, email, phone, pesel,
          address_street, address_city, address_postal_code,
          correspondence_street, correspondence_city, correspondence_postal_code,
          license_number, license_issue_date, license_expiry_date, license_is_unlimited
        `)
        .eq("id", driverId)
        .single();

      if (driverError) throw driverError;
      setDriverData(driver);

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

  // Format postal code to 99-999
  const formatPostalCode = (code: string | null) => {
    if (!code) return "—";
    const digits = code.replace(/\D/g, '');
    if (digits.length === 5) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return code;
  };

  // Start editing a field
  const startEditing = (field: EditableField, currentValue: string | boolean | null) => {
    if (field === 'license_is_unlimited') {
      // Toggle checkbox directly
      handleCheckboxChange(!(currentValue as boolean));
      return;
    }
    setEditingField(field);
    setEditValue(String(currentValue || ""));
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingField(null);
    setEditValue("");
  };

  // Handle checkbox change for license_is_unlimited
  const handleCheckboxChange = async (checked: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("drivers")
        .update({ license_is_unlimited: checked })
        .eq("id", driverId);

      if (error) throw error;

      setDriverData(prev => prev ? { ...prev, license_is_unlimited: checked } : null);
      toast.success("Dane zaktualizowane");
    } catch (error: any) {
      console.error("Error updating field:", error);
      toast.error(error.message || "Błąd podczas zapisywania");
    } finally {
      setSaving(false);
    }
  };

  // Save field value
  const saveField = async () => {
    if (!editingField || !driverData) return;
    
    setSaving(true);
    try {
      // Handle postal code formatting for storage
      let valueToSave: string | null = editValue.trim() || null;
      if (editingField.includes('postal_code') && valueToSave) {
        valueToSave = valueToSave.replace(/\D/g, '');
      }

      const { error } = await supabase
        .from("drivers")
        .update({ [editingField]: valueToSave })
        .eq("id", driverId);

      if (error) throw error;

      setDriverData(prev => prev ? { ...prev, [editingField]: valueToSave } : null);
      toast.success("Dane zaktualizowane");
      cancelEditing();
    } catch (error: any) {
      console.error("Error updating field:", error);
      toast.error(error.message || "Błąd podczas zapisywania");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveField();
    } else if (e.key === "Escape") {
      cancelEditing();
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

  // Editable field component
  const EditableField = ({ 
    field, 
    value, 
    label, 
    isDate = false,
    isPostalCode = false,
    className = ""
  }: { 
    field: keyof DriverData; 
    value: string | null; 
    label: string;
    isDate?: boolean;
    isPostalCode?: boolean;
    className?: string;
  }) => {
    const isEditing = editingField === field;
    const displayValue = isPostalCode ? formatPostalCode(value) : (value || "—");

    return (
      <div className={`space-y-0.5 ${className}`}>
        <p className="text-xs text-muted-foreground">{label}</p>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              type={isDate ? "date" : "text"}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-7 text-sm"
              autoFocus
            />
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7"
              onClick={saveField}
              disabled={saving}
            >
              <Check className="h-3.5 w-3.5 text-green-600" />
            </Button>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7"
              onClick={cancelEditing}
            >
              <X className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ) : (
          <div 
            className="flex items-center gap-1 group cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
            onClick={() => startEditing(field, value)}
          >
            <p className={`font-medium text-sm ${field.includes('pesel') || field.includes('license_number') ? 'font-mono' : ''}`}>
              {displayValue}
            </p>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!driverData) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          Nie udało się załadować danych kierowcy
        </CardContent>
      </Card>
    );
  }

  const medicalExam = getMedicalExam();
  const psychologicalExam = getPsychologicalExam();

  return (
    <div className="space-y-3">
      {/* Personal Data */}
      <Card className="shadow-sm">
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <User className="h-3.5 w-3.5" />
            {t('driverInfo.personalData')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <EditableField field="first_name" value={driverData.first_name} label={t('driverInfo.firstName')} />
            <EditableField field="last_name" value={driverData.last_name} label={t('driverInfo.lastName')} />
            <EditableField field="pesel" value={driverData.pesel} label={t('driverInfo.pesel')} />
            <EditableField field="email" value={driverData.email} label={t('driverInfo.email')} />
            <EditableField field="phone" value={driverData.phone} label={t('driverInfo.phone')} />
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="shadow-sm">
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-3.5 w-3.5" />
            {t('driverInfo.address')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <EditableField field="address_street" value={driverData.address_street} label={t('driverInfo.street')} className="col-span-2 md:col-span-1" />
            <EditableField field="address_city" value={driverData.address_city} label={t('driverInfo.city')} />
            <EditableField field="address_postal_code" value={driverData.address_postal_code} label={t('driverInfo.postalCode')} isPostalCode />
          </div>
        </CardContent>
      </Card>

      {/* Correspondence Address */}
      <Card className="shadow-sm">
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Home className="h-3.5 w-3.5" />
            Adres do korespondencji
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <EditableField field="correspondence_street" value={driverData.correspondence_street} label={t('driverInfo.street')} className="col-span-2 md:col-span-1" />
            <EditableField field="correspondence_city" value={driverData.correspondence_city} label={t('driverInfo.city')} />
            <EditableField field="correspondence_postal_code" value={driverData.correspondence_postal_code} label={t('driverInfo.postalCode')} isPostalCode />
          </div>
        </CardContent>
      </Card>

      {/* Driver's License */}
      <Card className="shadow-sm">
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-3.5 w-3.5" />
            {t('driverInfo.driversLicense')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <EditableField field="license_number" value={driverData.license_number} label={t('driverInfo.licenseNumber')} />
            <EditableField field="license_issue_date" value={driverData.license_issue_date} label={t('driverInfo.issueDate')} isDate />
            
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{t('driverInfo.expiryDate')}</p>
              {driverData.license_is_unlimited ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">Bezterminowe</Badge>
              ) : (
                <div className="flex items-center gap-1">
                  {editingField === 'license_expiry_date' ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveField} disabled={saving}>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEditing}>
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    <div 
                      className="flex items-center gap-1 group cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
                      onClick={() => startEditing('license_expiry_date', driverData.license_expiry_date)}
                    >
                      <p className="font-medium text-sm">{formatDate(driverData.license_expiry_date)}</p>
                      {getExpiryBadge(driverData.license_expiry_date)}
                      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Bezterminowe</p>
              <div className="flex items-center gap-2">
                <Checkbox 
                  checked={driverData.license_is_unlimited || false}
                  onCheckedChange={handleCheckboxChange}
                  disabled={saving}
                />
                <span className="text-sm text-muted-foreground">Tak</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Medical Examinations */}
      <Card className="shadow-sm">
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Stethoscope className="h-3.5 w-3.5" />
            {t('driverInfo.medicalExams')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="p-2 border rounded-md">
              <p className="text-xs font-medium mb-1">{t('driverInfo.medicalExam')}</p>
              {medicalExam?.expires_at ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs">{t('driverInfo.validUntil')}: {formatDate(medicalExam.expires_at)}</p>
                  {getExpiryBadge(medicalExam.expires_at)}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('driverInfo.noData')}</p>
              )}
            </div>
            <div className="p-2 border rounded-md">
              <p className="text-xs font-medium mb-1">{t('driverInfo.psychologicalExam')}</p>
              {psychologicalExam?.expires_at ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs">{t('driverInfo.validUntil')}: {formatDate(psychologicalExam.expires_at)}</p>
                  {getExpiryBadge(psychologicalExam.expires_at)}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('driverInfo.noData')}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info note */}
      <div className="p-2 bg-muted/50 rounded-md">
        <p className="text-xs text-muted-foreground">
          ℹ️ Kliknij na pole, aby je edytować. Zmiany są zapisywane automatycznie.
        </p>
      </div>
    </div>
  );
}

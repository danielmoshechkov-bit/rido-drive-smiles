import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Car, Plus, Calendar, Shield, FileText, Camera, Wrench, ChevronDown, ChevronUp, AlertTriangle, Search, Loader2, Upload, X } from "lucide-react";
import { CarBrandModelSelector } from "@/components/CarBrandModelSelector";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { VehicleLookupCreditsModal } from "@/components/vehicle/VehicleLookupCreditsModal";
import { format } from "date-fns";

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "elektryczny", label: "Elektryczny" },
  { value: "lpg", label: "LPG" },
  { value: "hybryda_gaz", label: "Hybryda + Gaz" },
];

interface ClientVehicle {
  id: string;
  plate_number: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  engine_capacity: string | null;
  fuel_type: string | null;
  color: string | null;
  mot_expiry: string | null;
  oc_expiry: string | null;
  photos: string[] | null;
  is_verified: boolean | null;
  is_sold: boolean | null;
  sold_at: string | null;
  created_at: string | null;
}

interface ServiceRecord {
  id: string;
  service_date: string;
  mileage: number | null;
  description: string | null;
  cost: number | null;
  workshop_name: string | null;
  signed_estimate_url: string | null;
  created_at: string | null;
}

interface OwnershipRequest {
  id: string;
  plate_number: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  engine_capacity: string | null;
  status: string | null;
  created_at: string | null;
  workshop_vehicle_id: string | null;
}

interface StoredDocument {
  name: string;
  path: string;
  publicUrl: string;
  createdAt?: string;
}

interface Props {
  userId: string;
  userPhone?: string;
}

const formatDisplayDate = (date: string | null | undefined) => {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd.MM.yyyy");
  } catch {
    return "—";
  }
};

const isDateExpiringSoon = (dateStr: string | null) => {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
};

const isDateExpired = (dateStr: string | null) => {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
};

const buildDocumentBadges = (vehicle: ClientVehicle) => {
  const badges: Array<{ label: string; variant: "destructive" | "success" | "warning" | "muted" }> = [];

  // OC badge
  if (!vehicle.oc_expiry) {
    badges.push({ label: "OC: —", variant: "destructive" });
  } else if (isDateExpired(vehicle.oc_expiry)) {
    badges.push({ label: `OC: ${formatDisplayDate(vehicle.oc_expiry)}`, variant: "destructive" });
  } else if (isDateExpiringSoon(vehicle.oc_expiry)) {
    badges.push({ label: `OC: ${formatDisplayDate(vehicle.oc_expiry)}`, variant: "warning" });
  } else {
    badges.push({ label: `OC: ${formatDisplayDate(vehicle.oc_expiry)}`, variant: "success" });
  }

  // Przegląd badge
  if (!vehicle.mot_expiry) {
    badges.push({ label: `${i18n.t('cp.vehicles.inspection')}: —`, variant: "muted" });
  } else if (isDateExpired(vehicle.mot_expiry)) {
    badges.push({ label: `${i18n.t('cp.vehicles.inspection')}: ${formatDisplayDate(vehicle.mot_expiry)}`, variant: "destructive" });
  } else if (isDateExpiringSoon(vehicle.mot_expiry)) {
    badges.push({ label: `${i18n.t('cp.vehicles.inspection')}: ${formatDisplayDate(vehicle.mot_expiry)}`, variant: "warning" });
  } else {
    badges.push({ label: `${i18n.t('cp.vehicles.inspection')}: ${formatDisplayDate(vehicle.mot_expiry)}`, variant: "success" });
  }

  return badges;
};

function DocumentBadge({ label, variant }: { label: string; variant: "destructive" | "success" | "warning" | "muted" }) {
  if (variant === "destructive") {
    return <Badge variant="destructive" className="rounded-full text-xs">{label}</Badge>;
  }
  if (variant === "warning") {
    return <Badge className="rounded-full bg-orange-500 text-white hover:bg-orange-500 text-xs">{label}</Badge>;
  }
  if (variant === "success") {
    return <Badge className="rounded-full bg-green-100 text-green-800 border border-green-300 hover:bg-green-100 text-xs">{label}</Badge>;
  }
  return <Badge variant="outline" className="rounded-full text-xs text-muted-foreground">{label}</Badge>;
}

function ClientVehicleInfoPanel({ vehicle, onSave }: { vehicle: ClientVehicle; onSave: (patch: Partial<ClientVehicle>) => Promise<void> }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    plate_number: vehicle.plate_number || "",
    vin: vehicle.vin || "",
    make: vehicle.make || "",
    model: vehicle.model || "",
    year: vehicle.year?.toString() || "",
    color: vehicle.color || "",
    fuel_type: vehicle.fuel_type || "",
    engine_capacity: vehicle.engine_capacity || "",
    mot_expiry: vehicle.mot_expiry || "",
    oc_expiry: vehicle.oc_expiry || "",
  });

  useEffect(() => {
    setFormData({
      plate_number: vehicle.plate_number || "",
      vin: vehicle.vin || "",
      make: vehicle.make || "",
      model: vehicle.model || "",
      year: vehicle.year?.toString() || "",
      color: vehicle.color || "",
      fuel_type: vehicle.fuel_type || "",
      engine_capacity: vehicle.engine_capacity || "",
      mot_expiry: vehicle.mot_expiry || "",
      oc_expiry: vehicle.oc_expiry || "",
    });
  }, [vehicle]);

  const saveField = async (field: keyof typeof formData, value: string) => {
    const normalizedValue = field === "plate_number" || field === "vin" ? value.toUpperCase() : value;
    setFormData((prev) => ({ ...prev, [field]: normalizedValue }));

    const patch: Partial<ClientVehicle> = {};

    if (field === "year") {
      patch.year = normalizedValue ? Number(normalizedValue) : null;
    } else {
      (patch as any)[field] = normalizedValue || null;
    }

    await onSave(patch);
  };

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Dane pojazdu</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Nr rejestracyjny</Label>
          <Input
            value={formData.plate_number}
            onChange={(e) => setFormData((prev) => ({ ...prev, plate_number: e.target.value.toUpperCase() }))}
            onBlur={(e) => saveField("plate_number", e.target.value)}
            className="uppercase"
            placeholder={t('cp.vehicles.enterPlate')}
          />
        </div>

        <div>
          <Label>VIN</Label>
          <Input
            value={formData.vin}
            onChange={(e) => setFormData((prev) => ({ ...prev, vin: e.target.value.toUpperCase() }))}
            onBlur={(e) => saveField("vin", e.target.value)}
            className="uppercase"
            placeholder={t('cp.vehicles.enterVin')}
          />
        </div>

        <div className="md:col-span-2">
          <CarBrandModelSelector
            brand={formData.make}
            model={formData.model}
            onBrandChange={async (value) => {
              setFormData((prev) => ({ ...prev, make: value, model: "" }));
              await onSave({ make: value, model: null });
            }}
            onModelChange={async (value) => {
              setFormData((prev) => ({ ...prev, model: value }));
              await onSave({ model: value || null });
            }}
          />
        </div>

        <div>
          <Label>{t('cp.vehicles.year')}</Label>
          <Input
            type="number"
            value={formData.year}
            onChange={(e) => setFormData((prev) => ({ ...prev, year: e.target.value }))}
            onBlur={(e) => saveField("year", e.target.value)}
            placeholder={t('cp.vehicles.yearPlaceholder')}
          />
        </div>

        <div>
          <Label>{t('cp.vehicles.color')}</Label>
          <Input
            value={formData.color}
            onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
            onBlur={(e) => saveField("color", e.target.value)}
            placeholder={t('cp.vehicles.colorPlaceholder')}
          />
        </div>

        <div>
          <Label>{t('cp.vehicles.engineCapacity')}</Label>
          <Input
            value={formData.engine_capacity}
            onChange={(e) => setFormData((prev) => ({ ...prev, engine_capacity: e.target.value }))}
            onBlur={(e) => saveField("engine_capacity", e.target.value)}
            placeholder={t('cp.vehicles.enginePlaceholder')}
          />
        </div>

        <div>
          <Label>Rodzaj paliwa</Label>
          <Select
            value={formData.fuel_type || undefined}
            onValueChange={async (value) => {
              setFormData((prev) => ({ ...prev, fuel_type: value }));
              await onSave({ fuel_type: value || null });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('cp.vehicles.selectFuel')} />
            </SelectTrigger>
            <SelectContent>
              {FUEL_TYPES.map((fuel) => (
                <SelectItem key={fuel.value} value={fuel.value}>{fuel.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{t('cp.vehicles.inspectionValidTo')}</Label>
          <Input
            type="date"
            value={formData.mot_expiry}
            onChange={(e) => setFormData((prev) => ({ ...prev, mot_expiry: e.target.value }))}
            onBlur={(e) => saveField("mot_expiry", e.target.value)}
          />
        </div>

        <div>
          <Label>{t('cp.vehicles.ocValidTo')}</Label>
          <Input
            type="date"
            value={formData.oc_expiry}
            onChange={(e) => setFormData((prev) => ({ ...prev, oc_expiry: e.target.value }))}
            onBlur={(e) => saveField("oc_expiry", e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ClientVehicleDocumentsPanel({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState(t('cp.vehicles.otherDocument'));

  const folder = useMemo(() => `client-vehicles/${vehicleId}/documents`, [vehicleId]);

  const loadDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from("documents").list(folder, {
      limit: 100,
      sortBy: { column: "name", order: "desc" },
    });

    if (error) {
      setLoading(false);
      return;
    }

    const mapped = (data || [])
      .filter((item) => item.name)
      .map((item) => ({
        name: item.name,
        path: `${folder}/${item.name}`,
        publicUrl: supabase.storage.from("documents").getPublicUrl(`${folder}/${item.name}`).data.publicUrl,
        createdAt: item.created_at,
      }));

    setDocuments(mapped);
    setLoading(false);
  };

  useEffect(() => {
    loadDocuments();
  }, [folder]);

  const uploadDocument = async () => {
    if (!file) return;
    setUploading(true);

    const safeType = type.trim().replace(/\s+/g, "-").toLowerCase();
    const path = `${folder}/${Date.now()}_${safeType}_${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: true });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('cp.vehicles.documentAdded'));
      setFile(null);
      await loadDocuments();
    }

    setUploading(false);
  };

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Dokumenty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input value={type} onChange={(e) => setType(e.target.value)} placeholder={t('cp.vehicles.documentType')} />
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={uploadDocument} disabled={!file || uploading}>{uploading ? t('cp.vehicles.adding') : t('cp.vehicles.add')}</Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('cp.vehicles.loadingDocuments')}</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('cp.vehicles.noDocuments')}</p>
        ) : (
          <div className="space-y-2">
            {documents.map((document) => {
              const typeLabel = document.name.split("_").slice(1, -1).join(" ") || t('cp.vehicles.documentFallback');

              return (
                <a
                  key={document.path}
                  href={document.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div>
                    <p className="font-medium">{typeLabel}</p>
                    <p className="text-sm text-muted-foreground">{document.createdAt ? formatDisplayDate(document.createdAt) : document.name}</p>
                  </div>
                  <FileText className="h-4 w-4 text-primary" />
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientVehicleServicePanel({ vehicleId, readOnly = false }: { vehicleId: string; readOnly?: boolean }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "",
    date: "",
    mileage: "",
    cost: "",
    notes: "",
    workshop: "",
    file: null as File | null,
  });

  const loadEntries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("client_vehicle_service_history")
      .select("*")
      .eq("client_vehicle_id", vehicleId)
      .order("service_date", { ascending: false });

    setEntries((data || []) as ServiceRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    loadEntries();
  }, [vehicleId]);

  const addEntry = async () => {
    if (!form.date || !form.notes.trim()) {
      toast.error(t('cp.vehicles.fillServiceDate'));
      return;
    }

    setSaving(true);
    let signedEstimateUrl: string | null = null;

    if (form.file) {
      const path = `client-vehicles/${vehicleId}/service/${Date.now()}_${form.file.name}`;
      const upload = await supabase.storage.from("documents").upload(path, form.file, { upsert: true });

      if (upload.error) {
        toast.error(upload.error.message);
        setSaving(false);
        return;
      }

      signedEstimateUrl = supabase.storage.from("documents").getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from("client_vehicle_service_history").insert({
      client_vehicle_id: vehicleId,
      service_date: form.date,
      mileage: form.mileage ? Number(form.mileage) : null,
      cost: form.cost ? Number(form.cost) : null,
      description: `${form.type ? `${form.type} • ` : ""}${form.notes}`,
      workshop_name: form.workshop || null,
      signed_estimate_url: signedEstimateUrl,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Zapisano wpis serwisowy");
      setForm({ type: "", date: "", mileage: "", cost: "", notes: "", workshop: "", file: null });
      await loadEntries();
    }

    setSaving(false);
  };

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>{t('cp.vehicles.service')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} placeholder={t('cp.vehicles.serviceTypePlaceholder')} />
            <Input type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
            <Input value={form.workshop} onChange={(e) => setForm((prev) => ({ ...prev, workshop: e.target.value }))} placeholder={t('cp.vehicles.workshop')} />
            <Input type="number" value={form.mileage} onChange={(e) => setForm((prev) => ({ ...prev, mileage: e.target.value }))} placeholder={t('cp.vehicles.mileagePlaceholder')} />
            <Input type="number" value={form.cost} onChange={(e) => setForm((prev) => ({ ...prev, cost: e.target.value }))} placeholder={t('cp.vehicles.costPlaceholder')} />
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setForm((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))} />
            <Input className="md:col-span-2" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder={t('cp.vehicles.workDescPlaceholder')} />
            <Button onClick={addEntry} disabled={saving}>{saving ? t('cp.vehicles.saving') : t('cp.vehicles.saveEntry')}</Button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('cp.vehicles.loadingServiceHistory')}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('cp.vehicles.noServiceEntries')}</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-medium">{entry.description || t('cp.vehicles.service')}</p>
                    <p className="text-sm text-muted-foreground">{entry.workshop_name || t('cp.vehicles.workshopUnknown')}</p>
                  </div>
                  <div className="text-sm md:text-right">
                    <p className="font-medium">{formatDisplayDate(entry.service_date)}</p>
                    {entry.cost ? <p className="text-muted-foreground">{entry.cost} zł</p> : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  {entry.mileage ? <span>Przebieg: {entry.mileage.toLocaleString("pl-PL")} km</span> : null}
                  {entry.signed_estimate_url ? (
                    <a href={entry.signed_estimate_url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                      {t('cp.vehicles.estimateAttachment')}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientVehiclePhotosPanel({ vehicle, onPhotosUpdated }: { vehicle: ClientVehicle; onPhotosUpdated: (photos: string[]) => void }) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<string[]>(vehicle.photos || []);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPhotos(vehicle.photos || []);
  }, [vehicle.photos]);

  const savePhotos = async (nextPhotos: string[]) => {
    const { error } = await supabase.from("client_vehicles").update({ photos: nextPhotos }).eq("id", vehicle.id);

    if (error) {
      toast.error(t('cp.vehicles.savePhotosError'));
      return false;
    }

    onPhotosUpdated(nextPhotos);
    return true;
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploaded: string[] = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const path = `client-vehicles/${vehicle.id}/photos/${Date.now()}_${index}_${file.name}`;
        const upload = await supabase.storage.from("documents").upload(path, file, { upsert: true });

        if (upload.error) throw upload.error;
        uploaded.push(supabase.storage.from("documents").getPublicUrl(path).data.publicUrl);
      }

      const nextPhotos = [...photos, ...uploaded];
      setPhotos(nextPhotos);
      const saved = await savePhotos(nextPhotos);
      if (saved) toast.success(t('cp.vehicles.photosAdded', { count: uploaded.length }));
    } catch (error: any) {
      toast.error(error.message || t('cp.vehicles.uploadPhotosError'));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const removePhoto = async (index: number) => {
    const nextPhotos = photos.filter((_, currentIndex) => currentIndex !== index);
    setPhotos(nextPhotos);
    const saved = await savePhotos(nextPhotos);
    if (saved) toast.success(t('cp.vehicles.photoDeleted'));
  };

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>{t('cp.vehicles.photos')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {photos.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <Camera className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="mb-4 text-sm text-muted-foreground">{t('cp.vehicles.noVehiclePhotos')}</p>
            <label>
              <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
              <Button variant="outline" asChild disabled={uploading}>
                <span className="cursor-pointer">{uploading ? t('cp.vehicles.loading') : t('cp.vehicles.addPhotos')}</span>
              </Button>
            </label>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {photos.map((photo, index) => (
                <div key={`${photo}-${index}`} className="relative overflow-hidden rounded-xl border bg-muted/20 aspect-square">
                  <img src={photo} alt={t('cp.vehicles.photoAlt', { n: index + 1 })} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute right-2 top-2 rounded-full bg-background/90 p-1 text-foreground shadow-sm transition-colors hover:bg-background"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border text-center transition-colors hover:bg-muted/30">
                <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
                <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{uploading ? t('cp.vehicles.loading') : t('cp.vehicles.add')}</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">{t('cp.vehicles.firstPhotoMain')}.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ClientVehicleCard({
  vehicle,
  defaultOpen,
  onSave,
  onPhotosUpdated,
}: {
  vehicle: ClientVehicle;
  defaultOpen?: boolean;
  onSave: (patch: Partial<ClientVehicle>) => Promise<void>;
  onPhotosUpdated: (photos: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!defaultOpen);
  const reminderBadges = buildDocumentBadges(vehicle);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={`overflow-hidden rounded-2xl border transition-all ${open ? "border-primary/50 shadow-md" : "border-border/70 shadow-sm"}`}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left">
            <div className="p-4 md:p-6 transition-colors hover:bg-muted/20">
              <div className="md:hidden flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-2xl bg-primary/10 p-3">
                    <Car className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{vehicle.make || t('cp.vehicles.autoFallback')} {vehicle.model || ""}</p>
                    <p className="text-sm text-muted-foreground">{vehicle.plate_number || "Bez tablic"}</p>
                  </div>
                </div>
                {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>

              <div className="hidden md:grid md:grid-cols-[140px_minmax(220px,1fr)_minmax(320px,1.4fr)_40px] items-center gap-6">
                <div>
                  <span className="text-xs text-muted-foreground">Nr rej.:</span>
                  <div className="font-bold text-lg">{vehicle.plate_number || "—"}</div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">{t('cp.vehicles.vehicleLabel')}</span>
                  <div className="font-semibold text-lg">{vehicle.make || "—"} {vehicle.model || ""}</div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">Dokumenty:</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {reminderBadges.map((badge) => (
                      <DocumentBadge key={badge.label} label={badge.label} variant={badge.variant} />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 md:hidden">
                {reminderBadges.map((badge) => (
                  <DocumentBadge key={badge.label} label={badge.label} variant={badge.variant} />
                ))}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-4 md:px-6 md:py-6">
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-4 rounded-xl bg-muted/50 p-1 text-xs md:text-sm">
                <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-[var(--nav-bar-color)] data-[state=active]:text-white hover:bg-accent hover:text-accent-foreground">{t('cp.vehicles.info')}</TabsTrigger>
                <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-[var(--nav-bar-color)] data-[state=active]:text-white hover:bg-accent hover:text-accent-foreground">{t('cp.vehicles.documents')}</TabsTrigger>
                <TabsTrigger value="service" className="rounded-lg data-[state=active]:bg-[var(--nav-bar-color)] data-[state=active]:text-white hover:bg-accent hover:text-accent-foreground">{t('cp.vehicles.service')}</TabsTrigger>
                <TabsTrigger value="photos" className="rounded-lg data-[state=active]:bg-[var(--nav-bar-color)] data-[state=active]:text-white hover:bg-accent hover:text-accent-foreground">{t('cp.vehicles.photos')}</TabsTrigger>
              </TabsList>

              <div className="mt-4">
                <TabsContent value="info">
                  <ClientVehicleInfoPanel vehicle={vehicle} onSave={onSave} />
                </TabsContent>

                <TabsContent value="documents">
                  <ClientVehicleDocumentsPanel vehicleId={vehicle.id} />
                </TabsContent>

                <TabsContent value="service">
                  <ClientVehicleServicePanel vehicleId={vehicle.id} />
                </TabsContent>

                <TabsContent value="photos">
                  <ClientVehiclePhotosPanel vehicle={vehicle} onPhotosUpdated={onPhotosUpdated} />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Read-only card for a sold vehicle: the owner keeps full access to the
// repair history (where/when/what was done) even after selling the car.
function SoldVehicleCard({ vehicle }: { vehicle: ClientVehicle }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={`overflow-hidden rounded-2xl border transition-all ${open ? "border-primary/40 shadow-md" : "border-border/60 shadow-sm"} opacity-90`}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left">
            <div className="p-4 md:p-5 transition-colors hover:bg-muted/20">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-2xl bg-muted p-3">
                    <Car className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{vehicle.make || t('cp.vehicles.autoFallback')} {vehicle.model || ""}</p>
                      <Badge variant="secondary" className="shrink-0">
                        {t('cp.vehicles.soldBadge', { defaultValue: 'Sprzedany' })}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {vehicle.plate_number || t('cp.vehicles.noPlate', { defaultValue: 'Bez tablic' })}
                      {vehicle.sold_at ? ` · ${t('cp.vehicles.soldOn', { defaultValue: 'sprzedano' })} ${formatDisplayDate(vehicle.sold_at)}` : ''}
                    </p>
                  </div>
                </div>
                {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-4 md:px-5 md:py-5">
            <p className="mb-3 text-xs text-muted-foreground">
              {t('cp.vehicles.soldHistoryNote', { defaultValue: 'Pojazd sprzedany — historia napraw pozostaje dostępna tylko do wglądu.' })}
            </p>
            <ClientVehicleServicePanel vehicleId={vehicle.id} readOnly />
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function ClientVehicleAddDialog({
  open,
  onOpenChange,
  onSaved,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  userId: string;
}) {
  const { t } = useTranslation();
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [color, setColor] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [engineCapacity, setEngineCapacity] = useState("");
  const [motExpiry, setMotExpiry] = useState("");
  const [ocExpiry, setOcExpiry] = useState("");
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  const { credits, loading: lookupLoading, checkRegistration, checkVin, purchaseCredits } = useVehicleLookup(userId || undefined);

  const resetForm = () => {
    setPlate("");
    setVin("");
    setBrand("");
    setModel("");
    setYear("");
    setColor("");
    setFuelType("");
    setEngineCapacity("");
    setMotExpiry("");
    setOcExpiry("");
    setValidationErrors(new Set());
  };

  const applyVehicleData = (data: any) => {
    if (data.make) setBrand(data.make);
    if (data.model) setModel(data.model);
    if (data.color) setColor(data.color);
    if (data.registration_year) setYear(data.registration_year);
    if (data.fuel_type) setFuelType(data.fuel_type.toLowerCase());
    if (data.vin && !vin) setVin(data.vin);
    if (data.registration_number && !plate) setPlate(data.registration_number);
  };

  const handleSearchPlate = async () => {
    if (!plate || plate.length < 3) {
      toast.error(t('cp.vehicles.enterPlate'));
      return;
    }
    if (!credits || credits.remaining_credits < 1) {
      setShowCreditsModal(true);
      return;
    }
    const data = await checkRegistration(plate);
    if (!data && credits && credits.remaining_credits < 1) setShowCreditsModal(true);
    else if (data) applyVehicleData(data);
  };

  const handleSearchVin = async () => {
    if (!vin || vin.length < 5) {
      toast.error(t('cp.vehicles.enterVin'));
      return;
    }
    if (!credits || credits.remaining_credits < 1) {
      setShowCreditsModal(true);
      return;
    }
    const data = await checkVin(vin);
    if (!data && credits && credits.remaining_credits < 1) setShowCreditsModal(true);
    else if (data) applyVehicleData(data);
  };

  const handleSave = async () => {
    const errors = new Set<string>();
    if (!plate.trim()) errors.add("plate");
    if (!brand.trim()) errors.add("brand");
    if (!model.trim()) errors.add("model");
    if (!fuelType) errors.add("fuelType");
    setValidationErrors(errors);

    if (errors.size > 0) {
      toast.error(t('cp.vehicles.requiredFields'));
      return;
    }

    setSavingVehicle(true);
    const vinClean = vin.trim().toUpperCase();
    const { data: inserted, error } = await supabase
      .from("client_vehicles")
      .insert({
        user_id: userId,
        plate_number: plate.trim().toUpperCase(),
        vin: vinClean || null,
        make: brand || null,
        model: model || null,
        year: year === "" ? null : Number(year),
        engine_capacity: engineCapacity || null,
        fuel_type: fuelType || null,
        color: color || null,
        mot_expiry: motExpiry || null,
        oc_expiry: ocExpiry || null,
        photos: [],
      })
      .select("id")
      .single();

    if (error || !inserted) {
      toast.error(t('cp.vehicles.addVehicleError'));
      setSavingVehicle(false);
      return;
    }

    // Option B: if a VIN was provided, try to verify ownership against
    // workshop records — a VIN known to a workshop proves the car was
    // serviced here, so we can pull its full repair history automatically.
    if (vinClean) {
      try {
        const { data: res } = await supabase.functions.invoke("client-verify-vehicle-ownership", {
          body: { verify_vehicle_id: inserted.id, vin: vinClean },
        });
        if (res?.verified) {
          toast.success(res.transferred
            ? t('cp.vehicles.vehicleTransferred', {
                defaultValue: 'Pojazd przypisany do Ciebie. Historia napraw została przeniesiona, a poprzedni właściciel powiadomiony.',
              })
            : t('cp.vehicles.vehicleVerifiedHistory', {
                defaultValue: 'Auto zweryfikowane po VIN — historia napraw z warsztatu została wczytana.',
              }));
        } else {
          toast.success(t('cp.vehicles.vehicleAddedNoHistory', {
            defaultValue: 'Auto zapisane. Historia napraw pojawi się, gdy warsztat obsłuży ten pojazd w systemie.',
          }));
        }
      } catch {
        toast.success(t('cp.vehicles.vehicleAdded'));
      }
    } else {
      toast.success(t('cp.vehicles.vehicleAdded'));
    }

    await onSaved();
    onOpenChange(false);
    resetForm();
    setSavingVehicle(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 sm:p-6 pb-0">
            <DialogTitle>{t('cp.vehicles.addVehicle')}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className={validationErrors.has("plate") ? "text-destructive" : ""}>Nr rejestracyjny *</Label>
                <div className="relative">
                  <Input
                    value={plate}
                    onChange={(e) => {
                      setPlate(e.target.value.toUpperCase());
                      setValidationErrors((prev) => {
                        const next = new Set(prev);
                        next.delete("plate");
                        return next;
                      });
                    }}
                    placeholder={t('cp.vehicles.platePlaceholder')}
                    className={`uppercase pr-10 ${validationErrors.has("plate") ? "border-destructive ring-1 ring-destructive" : ""}`}
                  />
                  <button type="button" onClick={handleSearchPlate} disabled={lookupLoading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:bg-accent">
                    {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Search className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>

              <div>
                <Label>VIN</Label>
                <div className="relative">
                  <Input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder={t('cp.vehicles.vinPlaceholder')} className="uppercase pr-10" />
                  <button type="button" onClick={handleSearchVin} disabled={lookupLoading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:bg-accent">
                    {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Search className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>

              <div className={`md:col-span-2 ${(validationErrors.has("brand") || validationErrors.has("model")) ? "rounded-md p-1 ring-1 ring-destructive" : ""}`}>
                <CarBrandModelSelector
                  brand={brand}
                  model={model}
                  onBrandChange={(value) => {
                    setBrand(value);
                    setValidationErrors((prev) => {
                      const next = new Set(prev);
                      next.delete("brand");
                      return next;
                    });
                  }}
                  onModelChange={(value) => {
                    setModel(value);
                    setValidationErrors((prev) => {
                      const next = new Set(prev);
                      next.delete("model");
                      return next;
                    });
                  }}
                />
              </div>

              <div>
                <Label>{t('cp.vehicles.year')}</Label>
                <Input type="number" value={year} onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} placeholder={t('cp.vehicles.yearPlaceholder')} />
              </div>

              <div>
                <Label>{t('cp.vehicles.color')}</Label>
                <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder={t('cp.vehicles.colorPlaceholder')} />
              </div>

              <div>
                <Label>{t('cp.vehicles.engineCapacity')}</Label>
                <Input value={engineCapacity} onChange={(e) => setEngineCapacity(e.target.value)} placeholder={t('cp.vehicles.enginePlaceholder')} />
              </div>

              <div>
                <Label className={validationErrors.has("fuelType") ? "text-destructive" : ""}>Rodzaj paliwa *</Label>
                <Select
                  value={fuelType}
                  onValueChange={(value) => {
                    setFuelType(value);
                    setValidationErrors((prev) => {
                      const next = new Set(prev);
                      next.delete("fuelType");
                      return next;
                    });
                  }}
                >
                  <SelectTrigger className={validationErrors.has("fuelType") ? "border-destructive ring-1 ring-destructive" : ""}>
                    <SelectValue placeholder={t('cp.vehicles.selectFuel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map((fuel) => (
                      <SelectItem key={fuel.value} value={fuel.value}>{fuel.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('cp.vehicles.inspectionValidTo')}</Label>
                <Input type="date" value={motExpiry} onChange={(e) => setMotExpiry(e.target.value)} />
              </div>

              <div>
                <Label>{t('cp.vehicles.ocValidTo')}</Label>
                <Input type="date" value={ocExpiry} onChange={(e) => setOcExpiry(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background p-4 pt-4 sm:p-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cp.vehicles.cancel')}</Button>
            <Button onClick={handleSave} disabled={savingVehicle}>{savingVehicle ? t('cp.vehicles.saving') : t('cp.vehicles.saveVehicle')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VehicleLookupCreditsModal
        open={showCreditsModal}
        onOpenChange={setShowCreditsModal}
        onPurchase={async (amount: number, priceNet: number) => {
          const ok = await purchaseCredits(amount, priceNet);
          if (ok) setShowCreditsModal(false);
        }}
      />
    </>
  );
}

export function ClientMyVehicles({ userId, userPhone }: Props) {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<ClientVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [ownershipRequests, setOwnershipRequests] = useState<OwnershipRequest[]>([]);
  const [verifyForm, setVerifyForm] = useState({ plate: "", vin: "", make: "", model: "" });
  const [verifyingRequestId, setVerifyingRequestId] = useState<string | null>(null);

  const activeVehicles = vehicles.filter((vehicle) => !vehicle.is_sold);
  const soldVehicles = vehicles.filter((vehicle) => vehicle.is_sold);

  const fetchVehicles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_vehicles")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error) setVehicles((data || []) as ClientVehicle[]);
    setLoading(false);
  };

  const fetchOwnershipRequests = async () => {
    if (!userPhone) return;

    // Ownership requests are keyed by the last 9 phone digits (see
    // normalize_pl_phone in the workshop->client history-bridge migration),
    // so match the same normalized form here.
    const phoneKey = userPhone.replace(/\D/g, "").slice(-9);
    if (!phoneKey) return;

    const { data } = await supabase
      .from("client_vehicle_ownership_requests")
      .select("*")
      .eq("phone", phoneKey)
      .eq("status", "pending");

    setOwnershipRequests((data || []) as OwnershipRequest[]);
  };

  useEffect(() => {
    fetchVehicles();
    fetchOwnershipRequests();
  }, [userId, userPhone]);

  const updateVehicle = async (vehicleId: string, patch: Partial<ClientVehicle>) => {
    const { error } = await supabase.from("client_vehicles").update(patch).eq("id", vehicleId);

    if (error) {
      toast.error(t('cp.vehicles.saveVehicleError'));
      return;
    }

    setVehicles((prev) => prev.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, ...patch } : vehicle)));
    toast.success("Zapisano");
  };

  const updateVehiclePhotos = (vehicleId: string, photos: string[]) => {
    setVehicles((prev) => prev.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, photos } : vehicle)));
  };

  const handleVerifyOwnership = async (requestId: string) => {
    const request = ownershipRequests.find((item) => item.id === requestId);
    if (!request) return;

    // Verification (incl. VIN-gated owner-change transfer + old-owner email)
    // runs server-side so it can write across RLS and detect sales safely.
    const { data, error } = await supabase.functions.invoke("client-verify-vehicle-ownership", {
      body: {
        request_id: requestId,
        plate: verifyForm.plate,
        vin: verifyForm.vin,
        make: verifyForm.make,
        model: verifyForm.model,
      },
    });

    if (error) {
      toast.error(t('cp.vehicles.verifyError'));
      return;
    }
    if (data?.needsManual) {
      // Contested plate but no VIN on file — can't auto-transfer safely.
      toast.error(t('cp.vehicles.ownershipNeedsManual', {
        defaultValue: 'Ten pojazd ma już właściciela, a w zgłoszeniu brak numeru VIN. Skontaktuj się z warsztatem, aby potwierdzić zmianę właściciela.',
      }));
      return;
    }
    if (data?.error === "vin_mismatch") {
      toast.error(t('cp.vehicles.vinMismatch', {
        defaultValue: 'Numer VIN nie zgadza się ze zgłoszeniem.',
      }));
      return;
    }
    if (data?.error || !data?.success) {
      toast.error(t('cp.vehicles.ownershipMismatch'));
      return;
    }

    if (data.transferred) {
      toast.success(t('cp.vehicles.vehicleTransferred', {
        defaultValue: 'Pojazd przypisany do Ciebie. Historia napraw została przeniesiona, a poprzedni właściciel powiadomiony.',
      }));
    } else {
      toast.success(t('cp.vehicles.vehicleVerified'));
    }
    setVerifyingRequestId(null);
    setVerifyForm({ plate: "", vin: "", make: "", model: "" });
    fetchVehicles();
    fetchOwnershipRequests();
  };

  return (
    <div className="space-y-4">
      {ownershipRequests.length > 0 && (
        <Card className="border-accent bg-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-primary" />
              {t('cp.vehicles.ownershipTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ownershipRequests.map((request) => (
              <div key={request.id} className="rounded-xl border bg-background p-4">
                <p className="text-sm">
                  {t('cp.vehicles.detectedVehicle', { vehicle: `${request.make} ${request.model}`, plate: request.plate_number })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('cp.vehicles.confirmFromReg')}
                </p>

                {verifyingRequestId === request.id ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Nr rejestracyjny</Label>
                        <Input value={verifyForm.plate} onChange={(e) => setVerifyForm((prev) => ({ ...prev, plate: e.target.value }))} />
                      </div>
                      <div>
                        <Label>VIN</Label>
                        <Input value={verifyForm.vin} onChange={(e) => setVerifyForm((prev) => ({ ...prev, vin: e.target.value }))} />
                      </div>
                      <div>
                        <Label>{t('cp.vehicles.brand')}</Label>
                        <Input value={verifyForm.make} onChange={(e) => setVerifyForm((prev) => ({ ...prev, make: e.target.value }))} />
                      </div>
                      <div>
                        <Label>{t('cp.vehicles.model')}</Label>
                        <Input value={verifyForm.model} onChange={(e) => setVerifyForm((prev) => ({ ...prev, model: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleVerifyOwnership(request.id)}>{t('cp.vehicles.confirm')}</Button>
                      <Button variant="outline" onClick={() => setVerifyingRequestId(null)}>{t('cp.vehicles.cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <Button className="mt-4" variant="outline" onClick={() => setVerifyingRequestId(request.id)}>
                    {t('cp.vehicles.verifyOwnership')}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Car className="h-5 w-5 text-primary" />
            {t('cp.vehicles.myVehicles')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('cp.vehicles.freeOneNote')}
          </p>
        </div>

        <Button size="sm" onClick={() => setShowAddVehicle(true)}>
          <Plus className="mr-1 h-4 w-4" />{" "}{t('cp.vehicles.addCar')}
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">{t('cp.vehicles.loading')}</div>
      ) : activeVehicles.length === 0 ? (
        <Card className="rounded-2xl border-dashed text-center">
          <CardContent className="py-10">
            <Car className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">{t('cp.vehicles.noVehicle')}</p>
            <Button className="mt-4" onClick={() => setShowAddVehicle(true)}>
              <Plus className="mr-1 h-4 w-4" />{" "}{t('cp.vehicles.addOwnCar')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeVehicles.map((vehicle, index) => (
            <ClientVehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              defaultOpen={index === 0}
              onSave={(patch) => updateVehicle(vehicle.id, patch)}
              onPhotosUpdated={(photos) => updateVehiclePhotos(vehicle.id, photos)}
            />
          ))}
        </div>
      )}

      {soldVehicles.length > 0 && (
        <div className="space-y-3 pt-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
            <Car className="h-5 w-5" />
            {t('cp.vehicles.soldSection', { defaultValue: 'Sprzedane / Archiwum' })}
          </h2>
          <p className="-mt-1 text-sm text-muted-foreground">
            {t('cp.vehicles.soldSectionNote', { defaultValue: 'Pojazdy, które sprzedałeś. Historia napraw pozostaje dostępna do wglądu.' })}
          </p>
          <div className="space-y-3">
            {soldVehicles.map((vehicle) => (
              <SoldVehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        </div>
      )}

      <ClientVehicleAddDialog
        open={showAddVehicle}
        onOpenChange={setShowAddVehicle}
        onSaved={fetchVehicles}
        userId={userId}
      />
    </div>
  );
}

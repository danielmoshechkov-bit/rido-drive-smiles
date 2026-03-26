import { useEffect, useMemo, useState } from "react";
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

const buildReminderBadges = (vehicle: ClientVehicle) => {
  const badges: Array<{ label: string; variant: "destructive" | "accent" | "outline" }> = [];

  if (isDateExpired(vehicle.mot_expiry)) badges.push({ label: "Przegląd minął", variant: "destructive" });
  else if (isDateExpiringSoon(vehicle.mot_expiry)) badges.push({ label: "Przegląd wkrótce", variant: "accent" });

  if (isDateExpired(vehicle.oc_expiry)) badges.push({ label: "OC minęło", variant: "destructive" });
  else if (isDateExpiringSoon(vehicle.oc_expiry)) badges.push({ label: "OC wkrótce", variant: "accent" });

  if (badges.length === 0) badges.push({ label: "Dokumenty aktualne", variant: "outline" });

  return badges;
};

function ReminderBadge({ label, variant }: { label: string; variant: "destructive" | "accent" | "outline" }) {
  if (variant === "destructive") {
    return <Badge variant="destructive" className="rounded-full">{label}</Badge>;
  }

  if (variant === "accent") {
    return <Badge className="rounded-full bg-accent text-accent-foreground hover:bg-accent">{label}</Badge>;
  }

  return <Badge variant="outline" className="rounded-full">{label}</Badge>;
}

function ClientVehicleInfoPanel({ vehicle, onSave }: { vehicle: ClientVehicle; onSave: (patch: Partial<ClientVehicle>) => Promise<void> }) {
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
            placeholder="Wpisz numer rejestracyjny"
          />
        </div>

        <div>
          <Label>VIN</Label>
          <Input
            value={formData.vin}
            onChange={(e) => setFormData((prev) => ({ ...prev, vin: e.target.value.toUpperCase() }))}
            onBlur={(e) => saveField("vin", e.target.value)}
            className="uppercase"
            placeholder="Wpisz numer VIN"
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
          <Label>Rok</Label>
          <Input
            type="number"
            value={formData.year}
            onChange={(e) => setFormData((prev) => ({ ...prev, year: e.target.value }))}
            onBlur={(e) => saveField("year", e.target.value)}
            placeholder="np. 2018"
          />
        </div>

        <div>
          <Label>Kolor</Label>
          <Input
            value={formData.color}
            onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
            onBlur={(e) => saveField("color", e.target.value)}
            placeholder="np. biały"
          />
        </div>

        <div>
          <Label>Pojemność silnika</Label>
          <Input
            value={formData.engine_capacity}
            onChange={(e) => setFormData((prev) => ({ ...prev, engine_capacity: e.target.value }))}
            onBlur={(e) => saveField("engine_capacity", e.target.value)}
            placeholder="np. 2.0"
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
              <SelectValue placeholder="Wybierz rodzaj paliwa" />
            </SelectTrigger>
            <SelectContent>
              {FUEL_TYPES.map((fuel) => (
                <SelectItem key={fuel.value} value={fuel.value}>{fuel.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Przegląd ważny do</Label>
          <Input
            type="date"
            value={formData.mot_expiry}
            onChange={(e) => setFormData((prev) => ({ ...prev, mot_expiry: e.target.value }))}
            onBlur={(e) => saveField("mot_expiry", e.target.value)}
          />
        </div>

        <div>
          <Label>OC ważne do</Label>
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
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("Inny dokument");

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
      toast.success("Dodano dokument");
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
          <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Typ dokumentu" />
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={uploadDocument} disabled={!file || uploading}>{uploading ? "Dodawanie..." : "Dodaj"}</Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Ładowanie dokumentów...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak dokumentów.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((document) => {
              const typeLabel = document.name.split("_").slice(1, -1).join(" ") || "Dokument";

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

function ClientVehicleServicePanel({ vehicleId }: { vehicleId: string }) {
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
      toast.error("Uzupełnij datę i opis serwisu");
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
        <CardTitle>Serwis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} placeholder="Typ serwisu" />
          <Input type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
          <Input value={form.workshop} onChange={(e) => setForm((prev) => ({ ...prev, workshop: e.target.value }))} placeholder="Warsztat" />
          <Input type="number" value={form.mileage} onChange={(e) => setForm((prev) => ({ ...prev, mileage: e.target.value }))} placeholder="Przebieg (km)" />
          <Input type="number" value={form.cost} onChange={(e) => setForm((prev) => ({ ...prev, cost: e.target.value }))} placeholder="Koszt (zł)" />
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setForm((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))} />
          <Input className="md:col-span-2" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Opis wykonanych prac" />
          <Button onClick={addEntry} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz wpis"}</Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Ładowanie historii serwisowej...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak wpisów serwisowych.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-medium">{entry.description || "Serwis"}</p>
                    <p className="text-sm text-muted-foreground">{entry.workshop_name || "Warsztat niepodany"}</p>
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
                      Kosztorys / załącznik
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
  const [photos, setPhotos] = useState<string[]>(vehicle.photos || []);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPhotos(vehicle.photos || []);
  }, [vehicle.photos]);

  const savePhotos = async (nextPhotos: string[]) => {
    const { error } = await supabase.from("client_vehicles").update({ photos: nextPhotos }).eq("id", vehicle.id);

    if (error) {
      toast.error("Błąd zapisu zdjęć");
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
      if (saved) toast.success(`Dodano ${uploaded.length} zdjęć`);
    } catch (error: any) {
      toast.error(error.message || "Błąd przesyłania zdjęć");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const removePhoto = async (index: number) => {
    const nextPhotos = photos.filter((_, currentIndex) => currentIndex !== index);
    setPhotos(nextPhotos);
    const saved = await savePhotos(nextPhotos);
    if (saved) toast.success("Zdjęcie usunięte");
  };

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Zdjęcia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {photos.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <Camera className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="mb-4 text-sm text-muted-foreground">Brak zdjęć pojazdu</p>
            <label>
              <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
              <Button variant="outline" asChild disabled={uploading}>
                <span className="cursor-pointer">{uploading ? "Ładowanie..." : "Dodaj zdjęcia"}</span>
              </Button>
            </label>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {photos.map((photo, index) => (
                <div key={`${photo}-${index}`} className="relative overflow-hidden rounded-xl border bg-muted/20 aspect-square">
                  <img src={photo} alt={`Zdjęcie pojazdu ${index + 1}`} className="h-full w-full object-cover" />
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
                <span className="text-sm text-muted-foreground">{uploading ? "Ładowanie..." : "Dodaj"}</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Pierwsze zdjęcie będzie głównym zdjęciem pojazdu.</p>
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
  const [open, setOpen] = useState(!!defaultOpen);
  const reminderBadges = buildReminderBadges(vehicle);

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
                    <p className="truncate font-semibold">{vehicle.make || "Auto"} {vehicle.model || ""}</p>
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
                  <span className="text-xs text-muted-foreground">Pojazd:</span>
                  <div className="font-semibold text-lg">{vehicle.make || "—"} {vehicle.model || ""}</div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">Dokumenty:</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {reminderBadges.map((badge) => (
                      <ReminderBadge key={badge.label} label={badge.label} variant={badge.variant} />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 md:hidden">
                {reminderBadges.map((badge) => (
                  <ReminderBadge key={badge.label} label={badge.label} variant={badge.variant} />
                ))}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-4 md:px-6 md:py-6">
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-4 rounded-xl bg-muted/50 p-1 text-xs md:text-sm">
                <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-[var(--nav-bar-color)] data-[state=active]:text-white hover:bg-accent hover:text-accent-foreground">Info</TabsTrigger>
                <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-[var(--nav-bar-color)] data-[state=active]:text-white hover:bg-accent hover:text-accent-foreground">Dokumenty</TabsTrigger>
                <TabsTrigger value="service" className="rounded-lg data-[state=active]:bg-[var(--nav-bar-color)] data-[state=active]:text-white hover:bg-accent hover:text-accent-foreground">Serwis</TabsTrigger>
                <TabsTrigger value="photos" className="rounded-lg data-[state=active]:bg-[var(--nav-bar-color)] data-[state=active]:text-white hover:bg-accent hover:text-accent-foreground">Zdjęcia</TabsTrigger>
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
      toast.error("Wpisz numer rejestracyjny");
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
      toast.error("Wpisz numer VIN");
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
      toast.error("Uzupełnij wymagane pola podświetlone na czerwono.");
      return;
    }

    setSavingVehicle(true);
    const { error } = await supabase.from("client_vehicles").insert({
      user_id: userId,
      plate_number: plate.trim().toUpperCase(),
      vin: vin.trim().toUpperCase() || null,
      make: brand || null,
      model: model || null,
      year: year === "" ? null : Number(year),
      engine_capacity: engineCapacity || null,
      fuel_type: fuelType || null,
      color: color || null,
      mot_expiry: motExpiry || null,
      oc_expiry: ocExpiry || null,
      photos: [],
    });

    if (error) {
      toast.error("Błąd dodawania pojazdu");
    } else {
      toast.success("Pojazd dodany");
      await onSaved();
      onOpenChange(false);
      resetForm();
    }

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
            <DialogTitle>Dodaj pojazd</DialogTitle>
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
                    placeholder="np. WX1234A"
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
                  <Input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17 znaków" className="uppercase pr-10" />
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
                <Label>Rok</Label>
                <Input type="number" value={year} onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} placeholder="np. 2018" />
              </div>

              <div>
                <Label>Kolor</Label>
                <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="np. biały" />
              </div>

              <div>
                <Label>Pojemność silnika</Label>
                <Input value={engineCapacity} onChange={(e) => setEngineCapacity(e.target.value)} placeholder="np. 2.0" />
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
                    <SelectValue placeholder="Wybierz rodzaj paliwa" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map((fuel) => (
                      <SelectItem key={fuel.value} value={fuel.value}>{fuel.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Przegląd ważny do</Label>
                <Input type="date" value={motExpiry} onChange={(e) => setMotExpiry(e.target.value)} />
              </div>

              <div>
                <Label>OC ważne do</Label>
                <Input type="date" value={ocExpiry} onChange={(e) => setOcExpiry(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background p-4 pt-4 sm:p-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={savingVehicle}>{savingVehicle ? "Zapisywanie..." : "Zapisz pojazd"}</Button>
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
  const [vehicles, setVehicles] = useState<ClientVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [ownershipRequests, setOwnershipRequests] = useState<OwnershipRequest[]>([]);
  const [verifyForm, setVerifyForm] = useState({ plate: "", vin: "", make: "", model: "" });
  const [verifyingRequestId, setVerifyingRequestId] = useState<string | null>(null);

  const activeVehicles = vehicles.filter((vehicle) => !vehicle.is_sold);

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

    const { data } = await supabase
      .from("client_vehicle_ownership_requests")
      .select("*")
      .eq("phone", userPhone)
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
      toast.error("Błąd zapisu pojazdu");
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

    const matches = [
      verifyForm.plate.toLowerCase() === (request.plate_number || "").toLowerCase(),
      verifyForm.vin.toLowerCase() === (request.vin || "").toLowerCase(),
      verifyForm.make.toLowerCase() === (request.make || "").toLowerCase(),
      verifyForm.model.toLowerCase() === (request.model || "").toLowerCase(),
    ].filter(Boolean).length;

    if (matches < 3) {
      toast.error("Dane nie pasują do pojazdu. Sprawdź i spróbuj ponownie.");
      return;
    }

    const { error: vehicleError } = await supabase.from("client_vehicles").insert({
      user_id: userId,
      plate_number: request.plate_number,
      vin: request.vin,
      make: request.make,
      model: request.model,
      year: request.year,
      engine_capacity: request.engine_capacity,
      is_verified: true,
    });

    if (vehicleError) {
      toast.error("Błąd weryfikacji");
      return;
    }

    await supabase
      .from("client_vehicle_ownership_requests")
      .update({ status: "verified", verified_by_user_id: userId, verified_at: new Date().toISOString() })
      .eq("id", requestId);

    toast.success("Pojazd zweryfikowany i dodany do konta");
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
              Potwierdzenie własności pojazdu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ownershipRequests.map((request) => (
              <div key={request.id} className="rounded-xl border bg-background p-4">
                <p className="text-sm">
                  Wykryto pojazd <strong>{request.make} {request.model}</strong> ({request.plate_number}) powiązany z Twoim numerem telefonu.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Potwierdź dane z dowodu rejestracyjnego, aby przenieść historię pojazdu na swoje konto.
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
                        <Label>Marka</Label>
                        <Input value={verifyForm.make} onChange={(e) => setVerifyForm((prev) => ({ ...prev, make: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Model</Label>
                        <Input value={verifyForm.model} onChange={(e) => setVerifyForm((prev) => ({ ...prev, model: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleVerifyOwnership(request.id)}>Potwierdź</Button>
                      <Button variant="outline" onClick={() => setVerifyingRequestId(null)}>Anuluj</Button>
                    </div>
                  </div>
                ) : (
                  <Button className="mt-4" variant="outline" onClick={() => setVerifyingRequestId(request.id)}>
                    Weryfikuj własność
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
            Moje auta
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            1 auto za darmo. Kolejne będą płatne — kwota zostanie ogłoszona wkrótce.
          </p>
        </div>

        <Button size="sm" onClick={() => setShowAddVehicle(true)}>
          <Plus className="mr-1 h-4 w-4" /> Dodaj auto
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Ładowanie...</div>
      ) : activeVehicles.length === 0 ? (
        <Card className="rounded-2xl border-dashed text-center">
          <CardContent className="py-10">
            <Car className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nie masz jeszcze żadnego pojazdu</p>
            <Button className="mt-4" onClick={() => setShowAddVehicle(true)}>
              <Plus className="mr-1 h-4 w-4" /> Dodaj swoje auto
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

      <ClientVehicleAddDialog
        open={showAddVehicle}
        onOpenChange={setShowAddVehicle}
        onSaved={fetchVehicles}
        userId={userId}
      />
    </div>
  );
}

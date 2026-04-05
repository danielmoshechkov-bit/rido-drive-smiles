import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { AIPhotoSection } from "@/components/marketplace/AIPhotoSection";
import { ArrowLeft, Upload, X, Loader2, Save } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
}

const CONDITIONS = [
  { value: "nowy", label: "Nowy" },
  { value: "jak_nowy", label: "Jak nowy" },
  { value: "dobry", label: "Dobry" },
  { value: "dostateczny", label: "Dostateczny" },
  { value: "do_naprawy", label: "Do naprawy" },
];

export default function GeneralListingEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [priceNegotiable, setPriceNegotiable] = useState(false);
  const [location, setLocation] = useState("");

  const [existingPhotos, setExistingPhotos] = useState<{ id: string; url: string; is_ai_enhanced?: boolean }[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPhotoUrls, setNewPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { navigate("/gielda/logowanie"); return; }
      setUser(u);

      const [catRes, listRes, photoRes] = await Promise.all([
        supabase.from("general_listing_categories").select("id, name, slug").order("name"),
        supabase.from("general_listings").select("*").eq("id", id).eq("user_id", u.id).single(),
        supabase.from("general_listing_photos").select("id, url").eq("listing_id", id!).order("display_order"),
      ]);

      if (catRes.data) setCategories(catRes.data);
      if (!listRes.data) { toast.error("Ogłoszenie nie znalezione"); navigate("/klient"); return; }

      const l = listRes.data;
      setTitle(l.title);
      setDescription(l.description || "");
      setCategoryId(l.category_id || "");
      setCondition(l.condition || "");
      setPrice(l.price?.toString() || "");
      setPriceNegotiable(!!l.price_negotiable);
      setLocation(l.location || "");
      setExistingPhotos(photoRes.data || []);
      setLoading(false);
    };
    init();
  }, [id, navigate]);

  const handleNewPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 10 - existingPhotos.length - newPhotos.length;
    const toAdd = files.slice(0, remaining);
    setNewPhotos(prev => [...prev, ...toAdd]);
    toAdd.forEach(f => setNewPhotoUrls(prev => [...prev, URL.createObjectURL(f)]));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    const remaining = 10 - existingPhotos.length - newPhotos.length;
    const toAdd = files.slice(0, remaining);
    setNewPhotos(prev => [...prev, ...toAdd]);
    toAdd.forEach(f => setNewPhotoUrls(prev => [...prev, URL.createObjectURL(f)]));
  }, [existingPhotos.length, newPhotos.length]);

  const removeExistingPhoto = async (photoId: string) => {
    await supabase.from("general_listing_photos").delete().eq("id", photoId);
    setExistingPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const removeNewPhoto = (index: number) => {
    URL.revokeObjectURL(newPhotoUrls[index]);
    setNewPhotos(prev => prev.filter((_, i) => i !== index));
    setNewPhotoUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Wypełnij tytuł i opis");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("general_listings")
        .update({
          title,
          description,
          price: parseFloat(price) || null,
          price_negotiable: priceNegotiable,
          category_id: categoryId || null,
          condition: condition || null,
          location: location || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      if (newPhotos.length > 0) {
        setUploadingPhotos(true);
        const startOrder = existingPhotos.length;
        for (let i = 0; i < newPhotos.length; i++) {
          const file = newPhotos[i];
          const ext = file.name.split(".").pop();
          const path = `${user.id}/${id}/${Date.now()}_${i}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from("listing-photos")
            .upload(path, file, { upsert: true });

          if (uploadErr) continue;

          const { data: urlData } = supabase.storage
            .from("listing-photos")
            .getPublicUrl(path);

          await supabase.from("general_listing_photos").insert({
            listing_id: id,
            url: urlData.publicUrl,
            display_order: startOrder + i,
          });
        }
        setUploadingPhotos(false);
      }

      toast.success("Zapisano zmiany!");
      navigate(`/marketplace/listing/${id}`);
    } catch (err: any) {
      toast.error(err.message || "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <UniversalHomeButton />
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Edytuj ogłoszenie</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dane ogłoszenia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Tytuł</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Opis</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} className="min-h-[120px]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Kategoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stan</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cena (zł)</Label>
                <Input type="number" value={price} onChange={e => setPrice(e.target.value)} />
              </div>
              <div>
                <Label>Lokalizacja</Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={priceNegotiable} onCheckedChange={setPriceNegotiable} id="negotiable" />
              <Label htmlFor="negotiable">Cena do negocjacji</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Zdjęcia ({existingPhotos.length + newPhotos.length}/10)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {existingPhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {existingPhotos.map(p => (
                  <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden border">
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeExistingPhoto(p.id)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {newPhotoUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {newPhotoUrls.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-primary/30">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeNewPhoto(i)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {existingPhotos.length + newPhotos.length < 10 && (
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => document.getElementById("edit-photo-input")?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Przeciągnij lub kliknij aby dodać zdjęcia</p>
                <input
                  id="edit-photo-input"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleNewPhotoSelect}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving || uploadingPhotos} size="lg" className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Zapisz zmiany
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate(-1)}>
            Anuluj
          </Button>
        </div>
      </main>
    </div>
  );
}

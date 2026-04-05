import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { AuthModal } from "@/components/auth/AuthModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import {
  ArrowLeft, Sparkles, Upload, X, Image as ImageIcon,
  Loader2, CheckCircle2, AlertCircle, Star, GripVertical
} from "lucide-react";

interface AIParsedData {
  title: string;
  description: string;
  category_name: string;
  condition: string;
  price_suggestion: number;
  price_min: number;
  price_max: number;
  location: string;
  missing_fields: string[];
  ai_score: number;
  ai_tips: string[];
}

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

export default function GeneralListingAdd() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Step management
  const [step, setStep] = useState<"prompt" | "edit" | "photos" | "assessment">("prompt");

  // AI prompt
  const [userPrompt, setUserPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState<AIParsedData | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [priceNegotiable, setPriceNegotiable] = useState(false);
  const [location, setLocation] = useState("");

  // Missing fields follow-up
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // Photos
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Assessment
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessment, setAssessment] = useState<any>(null);

  // Publishing
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) setShowAuth(true);
    });
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const { data } = await supabase
      .from("general_listing_categories" as any)
      .select("id, name, slug")
      .order("name");
    if (data) setCategories(data as any);
  };

  const handleAIGenerate = async () => {
    if (!userPrompt.trim()) {
      toast.error("Opisz co chcesz sprzedać");
      return;
    }
    if (!user) {
      setShowAuth(true);
      return;
    }

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-general-listing", {
        body: { prompt: userPrompt },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const parsed = data.data as AIParsedData;
      setAiData(parsed);
      setTitle(parsed.title || "");
      setDescription(parsed.description || "");
      setCondition(parsed.condition || "dobry");
      setPrice(parsed.price_suggestion?.toString() || "");
      setLocation(parsed.location || "");
      setMissingFields(parsed.missing_fields || []);

      // Match category
      if (parsed.category_name) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === parsed.category_name.toLowerCase()
        );
        if (match) setCategoryId(match.id);
      }

      setStep("edit");
      toast.success("AI wygenerował ogłoszenie!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Błąd AI — spróbuj ponownie");
    } finally {
      setAiLoading(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followUpText.trim()) return;
    setFollowUpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-general-listing", {
        body: {
          prompt: userPrompt,
          follow_up: followUpText,
          previous_data: aiData,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const parsed = data.data as AIParsedData;
      setAiData(parsed);
      setTitle(parsed.title || title);
      setDescription(parsed.description || description);
      setCondition(parsed.condition || condition);
      setPrice(parsed.price_suggestion?.toString() || price);
      setLocation(parsed.location || location);
      setMissingFields(parsed.missing_fields || []);
      setFollowUpText("");

      if (parsed.category_name) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === parsed.category_name.toLowerCase()
        );
        if (match) setCategoryId(match.id);
      }

      toast.success("Zaktualizowano dane!");
    } catch (err: any) {
      toast.error(err.message || "Błąd");
    } finally {
      setFollowUpLoading(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 10 - photos.length;
    const toAdd = files.slice(0, remaining);
    setPhotos((prev) => [...prev, ...toAdd]);
    // Preview URLs
    toAdd.forEach((f) => {
      const url = URL.createObjectURL(f);
      setPhotoUrls((prev) => [...prev, url]);
    });
  };

  const handlePhotoDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      const remaining = 10 - photos.length;
      const toAdd = files.slice(0, remaining);
      setPhotos((prev) => [...prev, ...toAdd]);
      toAdd.forEach((f) => {
        const url = URL.createObjectURL(f);
        setPhotoUrls((prev) => [...prev, url]);
      });
    },
    [photos.length]
  );

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoUrls[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAssessment = async () => {
    setAssessmentLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-listing-assessment", {
        body: {
          listing: {
            title,
            price: parseFloat(price) || 0,
            location,
            propertyType: "general",
          },
        },
      });
      if (error) throw error;
      setAssessment(data?.assessment || null);
    } catch (err: any) {
      toast.error("Nie udało się ocenić ogłoszenia");
    } finally {
      setAssessmentLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    if (!title.trim() || !description.trim()) {
      toast.error("Wypełnij tytuł i opis");
      return;
    }

    setPublishing(true);
    try {
      // Create or find category
      let finalCategoryId = categoryId;
      if (!finalCategoryId && aiData?.category_name) {
        // Auto-create category
        const slug = aiData.category_name
          .toLowerCase()
          .replace(/[^a-z0-9ąćęłńóśźż]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const { data: newCat } = await supabase
          .from("general_listing_categories" as any)
          .insert({ name: aiData.category_name, slug: slug + "-" + Date.now(), auto_created: true } as any)
          .select("id")
          .single();

        if (newCat) finalCategoryId = (newCat as any).id;
      }

      // Insert listing
      const { data: listing, error: listingError } = await supabase
        .from("general_listings" as any)
        .insert({
          user_id: user.id,
          title,
          description,
          price: parseFloat(price) || null,
          price_negotiable: priceNegotiable,
          category_id: finalCategoryId || null,
          condition: condition || null,
          location: location || null,
          ai_score: aiData?.ai_score || null,
          ai_tips: aiData?.ai_tips || null,
          ai_price_min: aiData?.price_min || null,
          ai_price_max: aiData?.price_max || null,
          status: "active",
        } as any)
        .select("id")
        .single();

      if (listingError) throw listingError;
      const listingId = (listing as any).id;

      // Upload photos
      if (photos.length > 0) {
        setUploadingPhotos(true);
        for (let i = 0; i < photos.length; i++) {
          const file = photos[i];
          const ext = file.name.split(".").pop();
          const path = `${user.id}/${listingId}/${i}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from("listing-photos")
            .upload(path, file, { upsert: true });

          if (uploadErr) {
            console.error("Upload error:", uploadErr);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from("listing-photos")
            .getPublicUrl(path);

          await supabase.from("general_listing_photos" as any).insert({
            listing_id: listingId,
            url: urlData.publicUrl,
            display_order: i,
          } as any);
        }
        setUploadingPhotos(false);
      }

      toast.success("Ogłoszenie opublikowane! 🎉");
      navigate("/marketplace");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Nie udało się opublikować");
    } finally {
      setPublishing(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 7) return "text-green-600";
    if (score >= 5) return "text-yellow-600";
    return "text-red-500";
  };

  const scoreProgressColor = (score: number) => {
    if (score >= 7) return "bg-green-500";
    if (score >= 5) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <UniversalHomeButton />
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Dodaj ogłoszenie</h1>
            <p className="text-xs text-muted-foreground">RidoMarket — sprzedawaj z AI</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Step indicators */}
        <div className="flex items-center gap-2 text-sm">
          {[
            { key: "prompt", label: "1. Opisz" },
            { key: "edit", label: "2. Edytuj" },
            { key: "photos", label: "3. Zdjęcia" },
            { key: "assessment", label: "4. Oceń" },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <Badge
                variant={step === s.key ? "default" : "outline"}
                className={`cursor-pointer text-xs ${step === s.key ? "" : "opacity-60"}`}
                onClick={() => {
                  if (s.key === "prompt" || aiData) setStep(s.key as any);
                }}
              >
                {s.label}
              </Badge>
              {i < 3 && <span className="text-muted-foreground">→</span>}
            </div>
          ))}
        </div>

        {/* STEP 1: AI Prompt */}
        {step === "prompt" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Opisz co chcesz sprzedać
              </CardTitle>
              <CardDescription>
                Napisz naturalnie — AI wygeneruje profesjonalne ogłoszenie
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Np. Sprzedam iPhone 14 Pro, kolor czarny, używany 8 miesięcy, stan bardzo dobry, oryginalne opakowanie i ładowarka, cena 3200 zł, Warszawa"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="min-h-[140px] text-base"
                autoFocus
              />
              <Button
                onClick={handleAIGenerate}
                disabled={aiLoading || !userPrompt.trim()}
                className="w-full sm:w-auto"
                size="lg"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generuję...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generuj ogłoszenie z AI
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground">
                Możesz też pominąć AI i wypełnić ręcznie —{" "}
                <button
                  className="underline text-primary"
                  onClick={() => setStep("edit")}
                >
                  przejdź do formularza
                </button>
              </p>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: Edit fields */}
        {step === "edit" && (
          <div className="space-y-4">
            {/* Missing fields follow-up */}
            {missingFields.length > 0 && (
              <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                    <AlertCircle className="h-4 w-4" />
                    AI potrzebuje dodatkowych informacji
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ol className="list-decimal list-inside text-sm space-y-1">
                    {missingFields.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Odpowiedz na pytania..."
                      value={followUpText}
                      onChange={(e) => setFollowUpText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFollowUp()}
                    />
                    <Button
                      onClick={handleFollowUp}
                      disabled={followUpLoading}
                      size="sm"
                    >
                      {followUpLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Wyślij"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI price range hint */}
            {aiData && (aiData.price_min || aiData.price_max) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 text-sm">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Szacowana cena rynkowa:{" "}
                  <strong>
                    {aiData.price_min?.toLocaleString("pl-PL")} –{" "}
                    {aiData.price_max?.toLocaleString("pl-PL")} zł
                  </strong>
                </span>
              </div>
            )}

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <Label>Tytuł ogłoszenia</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Np. iPhone 14 Pro 256GB — stan idealny"
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{title.length}/100</p>
                </div>

                <div>
                  <Label>Opis</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[120px]"
                    placeholder="Szczegółowy opis produktu..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Kategoria</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz kategorię" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Stan</Label>
                    <Select value={condition} onValueChange={setCondition}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz stan" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Cena (PLN)</Label>
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      min={0}
                    />
                  </div>
                  <div>
                    <Label>Lokalizacja</Label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Np. Warszawa"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={priceNegotiable}
                    onCheckedChange={setPriceNegotiable}
                  />
                  <Label className="cursor-pointer">Cena do negocjacji</Label>
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep("prompt")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Wróć
                  </Button>
                  <Button onClick={() => setStep("photos")}>
                    Dalej — zdjęcia →
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 3: Photos */}
        {step === "photos" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-primary" />
                Zdjęcia produktu
              </CardTitle>
              <CardDescription>
                Dodaj do 10 zdjęć. Pierwsze zdjęcie będzie głównym.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drop zone */}
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/5"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handlePhotoDrop}
                onClick={() => document.getElementById("photo-input")?.click()}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">
                  Przeciągnij zdjęcia tutaj lub kliknij
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, WebP • max 10 zdjęć • {photos.length}/10
                </p>
                <input
                  id="photo-input"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>

              {/* Photo previews */}
              {photoUrls.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {photoUrls.map((url, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded-lg overflow-hidden border group"
                    >
                      <img
                        src={url}
                        alt={`Zdjęcie ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {i === 0 && (
                        <Badge className="absolute bottom-1 left-1 text-[10px]" variant="secondary">
                          Główne
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("edit")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Wróć
                </Button>
                <Button onClick={() => { setStep("assessment"); handleAssessment(); }}>
                  Dalej — ocena AI →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 4: Assessment + Publish */}
        {step === "assessment" && (
          <div className="space-y-4">
            {/* AI Assessment card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Ocena AI
                </CardTitle>
              </CardHeader>
              <CardContent>
                {assessmentLoading ? (
                  <div className="flex items-center gap-3 py-8 justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>Analizuję ogłoszenie...</span>
                  </div>
                ) : assessment ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className={`text-4xl font-bold ${scoreColor(assessment.rating * 2)}`}>
                        {(assessment.rating * 2).toFixed(1)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">Jakość ogłoszenia</p>
                        <div className="h-3 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${scoreProgressColor(assessment.rating * 2)}`}
                            style={{ width: `${(assessment.rating / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {assessment.pros?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1 text-green-600">✅ Zalety</p>
                        <ul className="text-sm space-y-1">
                          {assessment.pros.map((p: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {assessment.cons?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1 text-yellow-600">⚠️ Do poprawy</p>
                        <ul className="text-sm space-y-1">
                          {assessment.cons.map((c: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {assessment.summary && (
                      <p className="text-sm text-muted-foreground italic">
                        {assessment.summary}
                      </p>
                    )}
                  </div>
                ) : aiData?.ai_tips?.length ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className={`text-4xl font-bold ${scoreColor(aiData.ai_score)}`}>
                        {aiData.ai_score?.toFixed(1)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">Jakość ogłoszenia</p>
                        <div className="h-3 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${scoreProgressColor(aiData.ai_score)}`}
                            style={{ width: `${(aiData.ai_score / 10) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">💡 Wskazówki</p>
                      <ul className="text-sm space-y-1">
                        {aiData.ai_tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>Brak oceny — kliknij ponownie aby ocenić</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleAssessment}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Oceń ponownie
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preview card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Podgląd ogłoszenia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  {photoUrls[0] && (
                    <img
                      src={photoUrls[0]}
                      alt="Główne zdjęcie"
                      className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base truncate">{title}</h3>
                    <p className="text-xl font-bold text-primary mt-1">
                      {price ? `${parseFloat(price).toLocaleString("pl-PL")} zł` : "Cena do uzgodnienia"}
                      {priceNegotiable && (
                        <Badge variant="outline" className="ml-2 text-xs">do negocjacji</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">{location}</p>
                    <div className="flex gap-2 mt-2">
                      {condition && (
                        <Badge variant="secondary" className="text-xs">
                          {CONDITIONS.find((c) => c.value === condition)?.label}
                        </Badge>
                      )}
                      {photos.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          📷 {photos.length} zdjęć
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => setStep("photos")} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Wróć do zdjęć
              </Button>
              <Button
                onClick={handlePublish}
                disabled={publishing || !title.trim() || !description.trim()}
                className="flex-1"
                size="lg"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploadingPhotos ? "Przesyłanie zdjęć..." : "Publikuję..."}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Opublikuj ogłoszenie
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </main>

      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </div>
  );
}

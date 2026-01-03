import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Search,
  Car,
  X,
  Check,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CarBrand {
  id: string;
  name: string;
}

interface CarModel {
  id: string;
  brand_id: string;
  name: string;
}

export function CarBrandsManagement() {
  const [brands, setBrands] = useState<CarBrand[]>([]);
  const [models, setModels] = useState<Record<string, CarModel[]>>({});
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [addingModelToBrand, setAddingModelToBrand] = useState<string | null>(null);
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBrands();
  }, []);

  const loadBrands = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("car_brands")
      .select("*")
      .order("name");
    if (error) {
      toast({ title: "Błąd", description: "Nie udało się załadować marek", variant: "destructive" });
    } else {
      setBrands(data || []);
    }
    setLoading(false);
  };

  const loadModelsForBrand = async (brandId: string) => {
    const { data, error } = await supabase
      .from("car_models")
      .select("*")
      .eq("brand_id", brandId)
      .order("name");
    if (!error && data) {
      setModels((prev) => ({ ...prev, [brandId]: data }));
    }
  };

  const toggleBrand = async (brandId: string) => {
    const newExpanded = new Set(expandedBrands);
    if (newExpanded.has(brandId)) {
      newExpanded.delete(brandId);
    } else {
      newExpanded.add(brandId);
      if (!models[brandId]) {
        await loadModelsForBrand(brandId);
      }
    }
    setExpandedBrands(newExpanded);
  };

  const addBrand = async () => {
    if (!newBrandName.trim()) return;
    const { error } = await supabase.from("car_brands").insert({ name: newBrandName.trim() });
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sukces", description: "Marka została dodana" });
      setNewBrandName("");
      loadBrands();
    }
  };

  const addModel = async (brandId: string) => {
    if (!newModelName.trim()) return;
    const { error } = await supabase.from("car_models").insert({
      brand_id: brandId,
      name: newModelName.trim(),
    });
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sukces", description: "Model został dodany" });
      setNewModelName("");
      setAddingModelToBrand(null);
      loadModelsForBrand(brandId);
    }
  };

  const updateBrand = async (brandId: string) => {
    if (!editValue.trim()) return;
    const { error } = await supabase
      .from("car_brands")
      .update({ name: editValue.trim() })
      .eq("id", brandId);
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sukces", description: "Marka została zaktualizowana" });
      setEditingBrand(null);
      setEditValue("");
      loadBrands();
    }
  };

  const updateModel = async (modelId: string, brandId: string) => {
    if (!editValue.trim()) return;
    const { error } = await supabase
      .from("car_models")
      .update({ name: editValue.trim() })
      .eq("id", modelId);
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sukces", description: "Model został zaktualizowany" });
      setEditingModel(null);
      setEditValue("");
      loadModelsForBrand(brandId);
    }
  };

  const deleteBrand = async (brandId: string) => {
    const { error } = await supabase.from("car_brands").delete().eq("id", brandId);
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sukces", description: "Marka została usunięta" });
      loadBrands();
    }
  };

  const deleteModel = async (modelId: string, brandId: string) => {
    const { error } = await supabase.from("car_models").delete().eq("id", modelId);
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sukces", description: "Model został usunięty" });
      loadModelsForBrand(brandId);
    }
  };

  const filteredBrands = brands.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (models[b.id] &&
        models[b.id].some((m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase())
        ))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="h-5 w-5" />
          Lista marek i modeli
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Add Brand */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj markę lub model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Nowa marka..."
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              className="w-48"
              onKeyDown={(e) => e.key === "Enter" && addBrand()}
            />
            <Button onClick={addBrand} disabled={!newBrandName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Dodaj markę
            </Button>
          </div>
        </div>

        {/* Brands List */}
        <div className="border rounded-lg divide-y max-h-[600px] overflow-auto">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">Ładowanie...</div>
          ) : filteredBrands.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              Nie znaleziono marek
            </div>
          ) : (
            filteredBrands.map((brand) => (
              <div key={brand.id}>
                {/* Brand Row */}
                <div className="flex items-center gap-2 p-3 hover:bg-accent/50">
                  <button
                    onClick={() => toggleBrand(brand.id)}
                    className="p-1 hover:bg-accent rounded"
                  >
                    {expandedBrands.has(brand.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  {editingBrand === brand.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateBrand(brand.id);
                          if (e.key === "Escape") setEditingBrand(null);
                        }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => updateBrand(brand.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingBrand(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 font-medium">{brand.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {models[brand.id]?.length || "..."} modeli
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingBrand(brand.id);
                          setEditValue(brand.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Usuń markę {brand.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Usunięcie marki spowoduje usunięcie wszystkich jej modeli. Tej operacji nie można cofnąć.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Anuluj</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteBrand(brand.id)}>
                              Usuń
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>

                {/* Models List */}
                {expandedBrands.has(brand.id) && (
                  <div className="bg-muted/30 border-t">
                    {models[brand.id]?.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center gap-2 px-10 py-2 hover:bg-accent/30"
                      >
                        {editingModel === model.id ? (
                          <div className="flex-1 flex items-center gap-2">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-7 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") updateModel(model.id, brand.id);
                                if (e.key === "Escape") setEditingModel(null);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateModel(model.id, brand.id)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingModel(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-sm">├─ {model.name}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                setEditingModel(model.id);
                                setEditValue(model.name);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Usuń model {model.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tej operacji nie można cofnąć.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Anuluj</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteModel(model.id, brand.id)}
                                  >
                                    Usuń
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    ))}

                    {/* Add Model */}
                    {addingModelToBrand === brand.id ? (
                      <div className="flex items-center gap-2 px-10 py-2">
                        <Input
                          value={newModelName}
                          onChange={(e) => setNewModelName(e.target.value)}
                          placeholder="Nazwa modelu..."
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addModel(brand.id);
                            if (e.key === "Escape") {
                              setAddingModelToBrand(null);
                              setNewModelName("");
                            }
                          }}
                        />
                        <Button size="sm" onClick={() => addModel(brand.id)}>
                          Dodaj
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAddingModelToBrand(null);
                            setNewModelName("");
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingModelToBrand(brand.id)}
                        className="flex items-center gap-2 px-10 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 w-full"
                      >
                        <Plus className="h-3 w-3" /> Dodaj model
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Łącznie: {brands.length} marek
        </p>
      </CardContent>
    </Card>
  );
}

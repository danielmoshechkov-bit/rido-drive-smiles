import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ImageIcon,
  Video,
  Plus,
  Trash2,
  Eye,
  MousePointer,
  Upload,
  Loader2,
  BarChart3,
} from "lucide-react";

interface AdCampaign {
  id: string;
  title: string;
  placement: string;
  media_type: "image" | "video";
  media_url: string;
  target_url: string | null;
  is_active: boolean;
  impressions: number;
  clicks: number;
  created_at: string;
}

const PLACEMENT_OPTIONS = [
  { value: "property_detail_map", label: "Strona szczegółów - pod mapą" },
  { value: "search_results", label: "Wyniki wyszukiwania" },
  { value: "listing_sidebar", label: "Sidebar ogłoszenia" },
];

const PLACEMENT_LABELS: Record<string, string> = {
  property_detail_map: "Pod mapą",
  search_results: "Wyszukiwarka",
  listing_sidebar: "Sidebar",
};

export function AdCampaignsPanel() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("ad_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns((data as AdCampaign[]) || []);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      toast({
        title: "Błąd",
        description: "Nie udało się pobrać kampanii",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    
    if (!isImage && !isVideo) {
      toast({
        title: "Błąd",
        description: "Obsługiwane formaty: JPG, PNG, GIF, MP4, WebM",
        variant: "destructive",
      });
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Błąd",
        description: "Maksymalny rozmiar pliku to 10MB",
        variant: "destructive",
      });
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleCreateCampaign = async () => {
    if (!title || !placement || !mediaFile) {
      toast({
        title: "Błąd",
        description: "Wypełnij wszystkie wymagane pola",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // Upload file to storage
      const fileExt = mediaFile.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("ad-media")
        .upload(fileName, mediaFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("ad-media")
        .getPublicUrl(fileName);

      // Create campaign
      const mediaType = mediaFile.type.startsWith("video/") ? "video" : "image";
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: insertError } = await supabase
        .from("ad_campaigns")
        .insert({
          title,
          placement,
          media_type: mediaType,
          media_url: urlData.publicUrl,
          target_url: targetUrl || null,
          created_by: user?.id,
          is_active: false,
        });

      if (insertError) throw insertError;

      toast({
        title: "Sukces",
        description: "Kampania została utworzona",
      });

      // Reset form
      setTitle("");
      setPlacement("");
      setTargetUrl("");
      setMediaFile(null);
      setMediaPreview(null);
      setDialogOpen(false);
      fetchCampaigns();
    } catch (error) {
      console.error("Error creating campaign:", error);
      toast({
        title: "Błąd",
        description: "Nie udało się utworzyć kampanii",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from("ad_campaigns")
        .update({ is_active: !currentState })
        .eq("id", id);

      if (error) throw error;

      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_active: !currentState } : c))
      );

      toast({
        title: "Sukces",
        description: `Kampania ${!currentState ? "aktywowana" : "dezaktywowana"}`,
      });
    } catch (error) {
      console.error("Error toggling campaign:", error);
      toast({
        title: "Błąd",
        description: "Nie udało się zmienić statusu",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć tę kampanię?")) return;

    try {
      const { error } = await supabase
        .from("ad_campaigns")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast({
        title: "Sukces",
        description: "Kampania została usunięta",
      });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast({
        title: "Błąd",
        description: "Nie udało się usunąć kampanii",
        variant: "destructive",
      });
    }
  };

  const calculateCTR = (impressions: number, clicks: number) => {
    if (impressions === 0) return "0%";
    return ((clicks / impressions) * 100).toFixed(2) + "%";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Kampanie reklamowe
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nowa kampania
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Utwórz nową kampanię reklamową</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Nazwa kampanii *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="np. Promocja letnia"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="placement">Umiejscowienie *</Label>
                  <Select value={placement} onValueChange={setPlacement}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz lokalizację" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLACEMENT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="media">Zdjęcie lub wideo *</Label>
                  <div className="border-2 border-dashed rounded-xl p-4 text-center">
                    {mediaPreview ? (
                      <div className="space-y-2">
                        {mediaFile?.type.startsWith("video/") ? (
                          <video
                            src={mediaPreview}
                            className="max-h-32 mx-auto rounded-lg"
                            controls
                          />
                        ) : (
                          <img
                            src={mediaPreview}
                            alt="Preview"
                            className="max-h-32 mx-auto rounded-lg"
                          />
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setMediaFile(null);
                            setMediaPreview(null);
                          }}
                        >
                          Zmień plik
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                        <div className="flex flex-col items-center gap-2 py-4">
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Kliknij, aby przesłać plik
                          </span>
                          <span className="text-xs text-muted-foreground/60">
                            Max 10MB • JPG, PNG, GIF, MP4, WebM
                          </span>
                        </div>
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetUrl">Link docelowy (opcjonalnie)</Label>
                  <Input
                    id="targetUrl"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://example.com"
                    type="url"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreateCampaign}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Przesyłanie...
                    </>
                  ) : (
                    "Utwórz kampanię"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Brak kampanii reklamowych</p>
            <p className="text-sm">Utwórz pierwszą kampanię, aby wyświetlić reklamy na portalu</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kampania</TableHead>
                <TableHead>Lokalizacja</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="text-center">Wyświetlenia</TableHead>
                <TableHead className="text-center">Kliknięcia</TableHead>
                <TableHead className="text-center">CTR</TableHead>
                <TableHead className="text-center">Aktywna</TableHead>
                <TableHead>Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {campaign.media_type === "video" ? (
                          <video
                            src={campaign.media_url}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={campaign.media_url}
                            alt={campaign.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <span className="font-medium">{campaign.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {PLACEMENT_LABELS[campaign.placement] || campaign.placement}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {campaign.media_type === "video" ? (
                      <Video className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      {campaign.impressions.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <MousePointer className="h-3.5 w-3.5" />
                      {campaign.clicks.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {calculateCTR(campaign.impressions, campaign.clicks)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={campaign.is_active}
                      onCheckedChange={() =>
                        handleToggleActive(campaign.id, campaign.is_active)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(campaign.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

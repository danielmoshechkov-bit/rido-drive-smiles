import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function VehicleDocuments({ vehicleId }: { vehicleId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("Inny dokument");

  const fetchDocs = async () => {
    const { data } = await supabase.from("documents").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false });
    setDocs(data || []);
  };
  
  useEffect(() => { fetchDocs(); }, [vehicleId]);

  const upload = async () => {
    if (!file) return;
    const path = `${vehicleId}/${Date.now()}_${file.name}`;
    const up = await supabase.storage.from("documents").upload(path, file, { upsert: true });
    if (up.error) return toast.error(up.error.message);
    const pub = supabase.storage.from("documents").getPublicUrl(path);
    const fileUrl = pub.data?.publicUrl;
    const { error } = await supabase.from("documents").insert([{ type, vehicle_id: vehicleId, file_url: fileUrl }]);
    if (error) return toast.error(error.message);
    toast.success("Dodano dokument");
    setFile(null);
    fetchDocs();
  };

  return (
    <Card>
      <CardHeader><CardTitle>Dokumenty</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input value={type} onChange={e => setType(e.target.value)} placeholder="Typ dokumentu" />
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={upload}>Dodaj</Button>
        </div>
        {docs.length === 0 ? <p className="text-muted-foreground">Brak dokumentów.</p> :
          <ul className="list-disc pl-5">
            {docs.map(d => (
              <li key={d.id}>
                <a className="text-primary underline" href={d.file_url} target="_blank" rel="noreferrer">
                  {d.type} • {new Date(d.created_at).toLocaleString()}
                </a>
              </li>
            ))}
          </ul>
        }
      </CardContent>
    </Card>
  );
}
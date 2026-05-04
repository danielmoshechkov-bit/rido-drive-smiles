import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Tag } from "lucide-react";

export function PromoCodesPanel() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState<string>("10");
  const [maxUses, setMaxUses] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("promo_codes" as any).select("*").order("created_at", { ascending: false });
    setCodes((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!code.trim() || !discount) { toast.error("Podaj kod i procent zniżki"); return; }
    setSaving(true);
    const { error } = await supabase.from("promo_codes" as any).insert({
      code: code.trim().toUpperCase(),
      discount_percent: Number(discount),
      max_uses: maxUses ? Number(maxUses) : null,
      valid_until: validUntil || null,
      description: description || null,
      is_active: true,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Kod utworzony");
    setCode(""); setDiscount("10"); setMaxUses(""); setValidUntil(""); setDescription("");
    load();
  };

  const toggleActive = async (id: string, val: boolean) => {
    await supabase.from("promo_codes" as any).update({ is_active: val } as any).eq("id", id);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Usunąć kod?")) return;
    await supabase.from("promo_codes" as any).delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5"/>Nowy kod promocyjny</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><Label>Kod</Label><Input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="WIOSNA20"/></div>
          <div><Label>Zniżka %</Label><Input type="number" min={1} max={100} value={discount} onChange={e=>setDiscount(e.target.value)}/></div>
          <div><Label>Max użyć (puste=∞)</Label><Input type="number" value={maxUses} onChange={e=>setMaxUses(e.target.value)}/></div>
          <div><Label>Ważny do (puste=bezterm.)</Label><Input type="datetime-local" value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></div>
          <div className="flex items-end"><Button onClick={create} disabled={saving} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4 mr-1"/>}Dodaj</Button></div>
          <div className="md:col-span-5"><Label>Opis (opcjonalnie)</Label><Input value={description} onChange={e=>setDescription(e.target.value)} placeholder="np. Promocja dla nowych użytkowników"/></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lista kodów</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-5 w-5 animate-spin"/> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Kod</TableHead><TableHead>Zniżka</TableHead><TableHead>Użycia</TableHead>
                <TableHead>Ważny do</TableHead><TableHead>Aktywny</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {codes.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                    <TableCell><Badge>{c.discount_percent}%</Badge></TableCell>
                    <TableCell>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : " / ∞"}</TableCell>
                    <TableCell>{c.valid_until ? new Date(c.valid_until).toLocaleString("pl-PL") : "bezterminowo"}</TableCell>
                    <TableCell><Switch checked={c.is_active} onCheckedChange={v=>toggleActive(c.id, v)}/></TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={()=>remove(c.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                  </TableRow>
                ))}
                {codes.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Brak kodów</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

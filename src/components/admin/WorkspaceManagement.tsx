import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Briefcase, Plus, Trash2, Mail } from "lucide-react";

export function WorkspaceManagement() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [emails, setEmails] = useState<{ id: string; email: string; created_at: string }[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load feature toggle state
    const { data: toggle } = await supabase
      .from("feature_toggles")
      .select("is_enabled")
      .eq("feature_key", "ai_workspace_enabled")
      .single();
    setIsEnabled(toggle?.is_enabled || false);

    // Load whitelist
    const { data: wl } = await (supabase as any)
      .from("workspace_email_whitelist")
      .select("*")
      .order("created_at", { ascending: false });
    setEmails(wl || []);
    setLoading(false);
  };

  const handleToggle = async () => {
    setUpdating(true);
    const { error } = await supabase
      .from("feature_toggles")
      .update({ is_enabled: !isEnabled })
      .eq("feature_key", "ai_workspace_enabled");
    if (error) {
      toast.error("Błąd aktualizacji");
    } else {
      setIsEnabled(!isEnabled);
      toast.success(`Workspace ${!isEnabled ? "włączony" : "wyłączony"}`);
    }
    setUpdating(false);
  };

  const handleAddEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Podaj poprawny adres email");
      return;
    }
    setAdding(true);
    const { data, error } = await (supabase as any)
      .from("workspace_email_whitelist")
      .insert({ email })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") toast.error("Ten email jest już na liście");
      else toast.error("Błąd dodawania");
    } else {
      setEmails(prev => [data, ...prev]);
      setNewEmail("");
      toast.success(`Dodano ${email}`);
    }
    setAdding(false);
  };

  const handleRemoveEmail = async (id: string, email: string) => {
    const { error } = await (supabase as any)
      .from("workspace_email_whitelist")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Błąd usuwania");
    } else {
      setEmails(prev => prev.filter(e => e.id !== id));
      toast.success(`Usunięto ${email}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Workspace / Task Manager
          </CardTitle>
          <CardDescription>
            Zarządzaj modułem Workspace — projekty, zadania, komunikacja i AI Planner
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Global toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="text-base font-semibold">Moduł Workspace</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Włącz aby udostępnić Workspace wybranym użytkownikom
              </p>
            </div>
            <div className="flex items-center gap-2">
              {updating && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch checked={isEnabled} onCheckedChange={handleToggle} disabled={updating} />
            </div>
          </div>

          {/* Email whitelist */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Dostęp dla wybranych użytkowników</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Workspace będzie widoczny tylko dla poniższych adresów email (gdy moduł jest włączony)
              </p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="Wpisz adres email..."
                  className="pl-9"
                  onKeyDown={e => e.key === "Enter" && handleAddEmail()}
                />
              </div>
              <Button onClick={handleAddEmail} disabled={adding} className="gap-2">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Dodaj
              </Button>
            </div>

            <div className="border rounded-lg divide-y">
              {emails.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Brak dodanych adresów — Workspace nie będzie widoczny dla nikogo
                </div>
              ) : (
                emails.map(e => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{e.email}</span>
                      <Badge variant="outline" className="text-xs">
                        {new Date(e.created_at).toLocaleDateString("pl")}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveEmail(e.id, e.email)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

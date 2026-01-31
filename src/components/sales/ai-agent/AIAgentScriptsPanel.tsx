import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FileText, Plus, Edit2, Trash2, Wand2, Copy } from "lucide-react";
import { 
  useAIAgentScripts, 
  useCreateAIAgentScript, 
  useUpdateAIAgentScript,
  useDeleteAIAgentScript,
  SCRIPT_TYPE_LABELS,
  DEFAULT_SCRIPTS,
  type AIAgentScript 
} from "@/hooks/useAIAgentScripts";
import { toast } from "sonner";

interface AIAgentScriptsPanelProps {
  configId: string;
}

export function AIAgentScriptsPanel({ configId }: AIAgentScriptsPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<AIAgentScript | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    script_type: "greeting" as AIAgentScript["script_type"],
    content: "",
    is_active: true,
    sort_order: 0,
  });

  const { data: scripts = [], isLoading } = useAIAgentScripts(configId);
  const createScript = useCreateAIAgentScript();
  const updateScript = useUpdateAIAgentScript();
  const deleteScript = useDeleteAIAgentScript();

  const handleOpenDialog = (script?: AIAgentScript) => {
    if (script) {
      setEditingScript(script);
      setFormData({
        name: script.name,
        script_type: script.script_type,
        content: script.content,
        is_active: script.is_active,
        sort_order: script.sort_order,
      });
    } else {
      setEditingScript(null);
      setFormData({
        name: "",
        script_type: "greeting",
        content: "",
        is_active: true,
        sort_order: scripts.length,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.content) {
      toast.error("Wypełnij nazwę i treść skryptu");
      return;
    }

    if (editingScript) {
      await updateScript.mutateAsync({
        id: editingScript.id,
        ...formData,
        variables: editingScript.variables,
        conditions: editingScript.conditions,
      });
    } else {
      await createScript.mutateAsync({
        config_id: configId,
        ...formData,
        variables: {},
        conditions: {},
      });
    }

    setIsDialogOpen(false);
  };

  const handleDelete = async (scriptId: string) => {
    if (confirm("Czy na pewno chcesz usunąć ten skrypt?")) {
      await deleteScript.mutateAsync(scriptId);
    }
  };

  const handleLoadDefaults = async () => {
    for (const script of DEFAULT_SCRIPTS) {
      await createScript.mutateAsync({
        config_id: configId,
        ...script,
      });
    }
    toast.success("Domyślne skrypty zostały dodane");
  };

  const groupedScripts = scripts.reduce((acc, script) => {
    if (!acc[script.script_type]) {
      acc[script.script_type] = [];
    }
    acc[script.script_type].push(script);
    return acc;
  }, {} as Record<string, AIAgentScript[]>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Skrypty rozmów
            </CardTitle>
            <CardDescription>
              Zarządzaj scenariuszami rozmów dla AI Agenta
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {scripts.length === 0 && (
              <Button variant="outline" onClick={handleLoadDefaults} className="gap-2">
                <Wand2 className="h-4 w-4" />
                Załaduj domyślne
              </Button>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nowy skrypt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingScript ? "Edytuj skrypt" : "Nowy skrypt"}
                  </DialogTitle>
                  <DialogDescription>
                    Skrypt określa co AI Agent ma powiedzieć w danej sytuacji
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nazwa</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="np. Powitanie standardowe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Typ skryptu</Label>
                      <Select
                        value={formData.script_type}
                        onValueChange={(v) => setFormData({ ...formData, script_type: v as AIAgentScript["script_type"] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SCRIPT_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Treść skryptu</Label>
                    <Textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Dzień dobry, nazywam się {{agent_name}} i dzwonię z {{company_name}}..."
                      rows={8}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Użyj {"{{zmienna}}"} aby wstawić dynamiczne dane (np. nazwa firmy, imię klienta)
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={formData.is_active}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                      />
                      <Label>Aktywny</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label>Kolejność</Label>
                      <Input
                        type="number"
                        value={formData.sort_order}
                        onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) })}
                        className="w-20"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Anuluj
                  </Button>
                  <Button 
                    onClick={handleSave} 
                    disabled={createScript.isPending || updateScript.isPending}
                  >
                    {editingScript ? "Zapisz" : "Utwórz"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : scripts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak skryptów</p>
              <p className="text-sm">Dodaj własne skrypty lub załaduj domyślne</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {Object.entries(SCRIPT_TYPE_LABELS).map(([type, label]) => {
                const typeScripts = groupedScripts[type] || [];
                if (typeScripts.length === 0) return null;

                return (
                  <AccordionItem key={type} value={type}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span>{label}</span>
                        <Badge variant="secondary">{typeScripts.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        {typeScripts.map((script) => (
                          <div
                            key={script.id}
                            className="border rounded-lg p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{script.name}</span>
                                {!script.is_active && (
                                  <Badge variant="outline">Nieaktywny</Badge>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    navigator.clipboard.writeText(script.content);
                                    toast.success("Skopiowano do schowka");
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenDialog(script)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(script.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <pre className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md whitespace-pre-wrap font-mono">
                              {script.content.slice(0, 200)}
                              {script.content.length > 200 && "..."}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

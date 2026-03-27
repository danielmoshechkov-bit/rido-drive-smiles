import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WorkspaceDocument {
  id: string;
  project_id: string;
  title: string;
  content: string;
  content_html: string;
  icon: string;
  cover_color: string | null;
  created_by: string;
  last_edited_by: string | null;
  last_edited_by_name: string | null;
  parent_document_id: string | null;
  is_template: boolean;
  template_category: string | null;
  is_archived: boolean;
  is_pinned: boolean;
  word_count: number;
  version: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DocVersion {
  id: string;
  document_id: string;
  version: number;
  title: string;
  content: string;
  content_html: string;
  edited_by: string;
  edited_by_name: string | null;
  change_summary: string | null;
  created_at: string;
}

export interface DocComment {
  id: string;
  document_id: string;
  user_id: string;
  user_name: string | null;
  content: string;
  selection_text: string | null;
  is_resolved: boolean;
  created_at: string;
}

const TEMPLATES: { title: string; icon: string; category: string; content: string }[] = [
  {
    title: "Protokół spotkania",
    icon: "📋",
    category: "spotkania",
    content: `# Protokół spotkania\n\n**Data:** ${new Date().toLocaleDateString('pl-PL')}\n**Uczestnicy:** \n**Miejsce:** \n\n---\n\n## Agenda\n\n1. \n2. \n3. \n\n## Omówione tematy\n\n### Temat 1\n\n\n### Temat 2\n\n\n## Ustalenia i zadania\n\n- [ ] Zadanie 1 — odpowiedzialny: @osoba — termin: \n- [ ] Zadanie 2 — odpowiedzialny: @osoba — termin: \n\n## Następne spotkanie\n\n**Data:** \n**Temat:** `,
  },
  {
    title: "Raport tygodniowy",
    icon: "📊",
    category: "raporty",
    content: `# Raport tygodniowy\n\n**Okres:** \n**Autor:** \n\n---\n\n## Zrealizowane zadania\n\n- \n- \n\n## W trakcie\n\n- \n\n## Blokery\n\n- \n\n## Plan na następny tydzień\n\n- \n- \n\n## Wnioski i uwagi\n\n`,
  },
  {
    title: "Oferta handlowa",
    icon: "💼",
    category: "sprzedaż",
    content: `# Oferta handlowa\n\n**Firma:** \n**Data:** ${new Date().toLocaleDateString('pl-PL')}\n**Ważna do:** \n\n---\n\n## Podsumowanie\n\n\n## Zakres usług\n\n| Usługa | Opis | Cena netto |\n|--------|------|------------|\n|        |      |            |\n|        |      |            |\n\n## Warunki współpracy\n\n- Termin realizacji: \n- Warunki płatności: \n- Gwarancja: \n\n## Kontakt\n\n**Imię i nazwisko:** \n**Telefon:** \n**Email:** `,
  },
  {
    title: "Umowa współpracy",
    icon: "📝",
    category: "dokumenty prawne",
    content: `# Umowa współpracy\n\n**Nr umowy:** \n**Data zawarcia:** ${new Date().toLocaleDateString('pl-PL')}\n\n---\n\n## §1 Strony umowy\n\n**Zleceniodawca:** \n**Zleceniobiorca:** \n\n## §2 Przedmiot umowy\n\n\n## §3 Wynagrodzenie\n\n\n## §4 Czas trwania\n\n\n## §5 Postanowienia końcowe\n\n\n---\n\n**Podpis Zleceniodawcy:**\n\n**Podpis Zleceniobiorcy:**`,
  },
  {
    title: "Baza wiedzy",
    icon: "📚",
    category: "baza wiedzy",
    content: `# Baza wiedzy\n\n## Wprowadzenie\n\n\n## Jak zacząć?\n\n### Krok 1\n\n\n### Krok 2\n\n\n### Krok 3\n\n\n## FAQ\n\n**P: Pytanie?**\nO: Odpowiedź.\n\n**P: Pytanie?**\nO: Odpowiedź.\n\n## Przydatne linki\n\n- [Link](url)\n- [Link](url)`,
  },
];

export function useWorkspaceDocs(projectId: string, userId: string | null, userEmail: string | null) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [comments, setComments] = useState<DocComment[]>([]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("workspace_documents")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_archived", false)
      .eq("is_template", false)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) console.error("Docs load error:", error);
    setDocuments((data || []) as WorkspaceDocument[]);
    setLoading(false);
  }, [projectId]);

  const createDocument = useCallback(async (title: string, content = "", icon = "📄", parentId?: string) => {
    if (!userId) return null;
    const { data, error } = await (supabase as any)
      .from("workspace_documents")
      .insert({
        project_id: projectId,
        title,
        content,
        icon,
        created_by: userId,
        last_edited_by: userId,
        last_edited_by_name: userEmail,
        parent_document_id: parentId || null,
        word_count: content.split(/\s+/).filter(Boolean).length,
      })
      .select()
      .single();
    if (error) { toast.error("Błąd tworzenia dokumentu"); return null; }
    toast.success("Dokument utworzony");
    await loadDocuments();
    return data as WorkspaceDocument;
  }, [projectId, userId, userEmail, loadDocuments]);

  const createFromTemplate = useCallback(async (templateIndex: number) => {
    const t = TEMPLATES[templateIndex];
    if (!t) return null;
    return createDocument(t.title, t.content, t.icon);
  }, [createDocument]);

  const updateDocument = useCallback(async (id: string, updates: Partial<WorkspaceDocument>, saveVersion = false) => {
    if (!userId) return;
    const updateData: any = {
      ...updates,
      last_edited_by: userId,
      last_edited_by_name: userEmail,
    };
    if (updates.content) {
      updateData.word_count = updates.content.split(/\s+/).filter(Boolean).length;
    }

    // Save version before updating
    if (saveVersion) {
      const doc = documents.find(d => d.id === id);
      if (doc) {
        await (supabase as any).from("workspace_document_versions").insert({
          document_id: id,
          version: doc.version,
          title: doc.title,
          content: doc.content,
          edited_by: userId,
          edited_by_name: userEmail,
        });
        updateData.version = doc.version + 1;
      }
    }

    const { error } = await (supabase as any)
      .from("workspace_documents")
      .update(updateData)
      .eq("id", id);
    if (error) { toast.error("Błąd zapisu"); return; }
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updateData } : d));
  }, [userId, userEmail, documents]);

  const deleteDocument = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from("workspace_documents")
      .delete()
      .eq("id", id);
    if (error) { toast.error("Błąd usuwania"); return; }
    toast.success("Dokument usunięty");
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const archiveDocument = useCallback(async (id: string) => {
    await (supabase as any)
      .from("workspace_documents")
      .update({ is_archived: true })
      .eq("id", id);
    toast.success("Dokument zarchiwizowany");
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const togglePin = useCallback(async (id: string, isPinned: boolean) => {
    await (supabase as any)
      .from("workspace_documents")
      .update({ is_pinned: !isPinned })
      .eq("id", id);
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, is_pinned: !isPinned } : d));
  }, []);

  const loadVersions = useCallback(async (docId: string) => {
    const { data } = await (supabase as any)
      .from("workspace_document_versions")
      .select("*")
      .eq("document_id", docId)
      .order("version", { ascending: false })
      .limit(20);
    setVersions((data || []) as DocVersion[]);
  }, []);

  const restoreVersion = useCallback(async (docId: string, version: DocVersion) => {
    await updateDocument(docId, {
      title: version.title,
      content: version.content,
    }, true);
    toast.success(`Przywrócono wersję ${version.version}`);
    await loadDocuments();
  }, [updateDocument, loadDocuments]);

  const loadComments = useCallback(async (docId: string) => {
    const { data } = await (supabase as any)
      .from("workspace_document_comments")
      .select("*")
      .eq("document_id", docId)
      .order("created_at");
    setComments((data || []) as DocComment[]);
  }, []);

  const addComment = useCallback(async (docId: string, content: string, selectionText?: string) => {
    if (!userId) return;
    await (supabase as any).from("workspace_document_comments").insert({
      document_id: docId,
      user_id: userId,
      user_name: userEmail,
      content,
      selection_text: selectionText || null,
    });
    loadComments(docId);
  }, [userId, userEmail, loadComments]);

  const resolveComment = useCallback(async (commentId: string) => {
    if (!userId) return;
    await (supabase as any)
      .from("workspace_document_comments")
      .update({ is_resolved: true, resolved_by: userId })
      .eq("id", commentId);
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, is_resolved: true } : c));
  }, [userId]);

  return {
    documents, loading, versions, comments, templates: TEMPLATES,
    loadDocuments, createDocument, createFromTemplate,
    updateDocument, deleteDocument, archiveDocument, togglePin,
    loadVersions, restoreVersion,
    loadComments, addComment, resolveComment,
  };
}

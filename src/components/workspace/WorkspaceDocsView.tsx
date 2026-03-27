import { useState, useEffect, useRef, useCallback } from "react";
import { WorkspaceProject } from "@/hooks/useWorkspace";
import { useWorkspaceDocs, WorkspaceDocument, DocVersion } from "@/hooks/useWorkspaceDocs";
import { useGetRidoAI } from "@/hooks/useGetRidoAI";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, FileText, Search, Pin, PinOff, Archive, Trash2,
  MoreHorizontal, ArrowLeft, Clock, MessageSquare, History,
  Sparkles, BookTemplate, Download, ChevronRight, Eye, Edit3,
  Wand2, FileDown, ListChecks, CheckCircle2, Send, X, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

const AI_ACTIONS = [
  { key: "expand", label: "Rozwiń", icon: "✍️", prompt: "Rozwiń poniższy tekst, dodając więcej szczegółów i kontekstu. Zachowaj formatowanie markdown:" },
  { key: "improve", label: "Popraw", icon: "✨", prompt: "Popraw poniższy tekst pod kątem gramatyki, stylu i czytelności. Zachowaj formatowanie markdown:" },
  { key: "summarize", label: "Podsumuj", icon: "📝", prompt: "Napisz zwięzłe podsumowanie poniższego tekstu w punktach. Użyj markdown:" },
  { key: "translate_en", label: "Przetłumacz EN", icon: "🇬🇧", prompt: "Przetłumacz poniższy tekst na angielski. Zachowaj formatowanie markdown:" },
  { key: "translate_de", label: "Przetłumacz DE", icon: "🇩🇪", prompt: "Przetłumacz poniższy tekst na niemiecki. Zachowaj formatowanie markdown:" },
];

export function WorkspaceDocsView({ project, workspace }: Props) {
  const docs = useWorkspaceDocs(project.id, workspace.userId, workspace.userEmail);
  const ai = useGetRidoAI();
  const [activeDoc, setActiveDoc] = useState<WorkspaceDocument | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { docs.loadDocuments(); }, [project.id]);

  // Autosave with debounce
  const autosave = useCallback((docId: string, title: string, content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await docs.updateDocument(docId, { title, content });
    }, 1500);
  }, [docs.updateDocument]);

  const openDoc = (doc: WorkspaceDocument) => {
    setActiveDoc(doc);
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setIsEditing(false);
    docs.loadComments(doc.id);
  };

  const startEditing = () => {
    if (!activeDoc) return;
    setEditTitle(activeDoc.title);
    setEditContent(activeDoc.content);
    setIsEditing(true);
  };

  const saveDoc = async () => {
    if (!activeDoc) return;
    await docs.updateDocument(activeDoc.id, {
      title: editTitle,
      content: editContent,
    }, true);
    setActiveDoc(prev => prev ? { ...prev, title: editTitle, content: editContent } : null);
    setIsEditing(false);
    toast.success("Zapisano");
  };

  const handleContentChange = (val: string) => {
    setEditContent(val);
    if (activeDoc) autosave(activeDoc.id, editTitle, val);
  };

  const handleTitleChange = (val: string) => {
    setEditTitle(val);
    if (activeDoc) autosave(activeDoc.id, val, editContent);
  };

  const handleCreate = async () => {
    const doc = await docs.createDocument("Nowy dokument");
    if (doc) { openDoc(doc); setIsEditing(true); }
  };

  const handleCreateFromTemplate = async (idx: number) => {
    const doc = await docs.createFromTemplate(idx);
    if (doc) { openDoc(doc); setIsEditing(true); setShowTemplates(false); }
  };

  const handleAIAction = async (action: typeof AI_ACTIONS[0]) => {
    if (!editContent.trim()) { toast.error("Brak treści do przetworzenia"); return; }
    setAiLoading(true);
    const result = await ai.execute({
      taskType: "document_ai",
      query: `${action.prompt}\n\n${editContent}`,
    });
    if (result?.result) {
      setEditContent(result.result);
      if (activeDoc) autosave(activeDoc.id, editTitle, result.result);
      toast.success(`AI: ${action.label} — gotowe`);
    }
    setAiLoading(false);
  };

  const handleExportPDF = () => {
    if (!activeDoc) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${activeDoc.title}</title>
      <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}
      h1{font-size:24px}h2{font-size:20px}h3{font-size:16px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}
      code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:16px;border-radius:8px;overflow-x:auto}
      </style></head><body>
    `);
    // Simple markdown to HTML
    const html = activeDoc.content
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    printWindow.document.write(`<p>${html}</p></body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handleAddComment = async () => {
    if (!commentInput.trim() || !activeDoc) return;
    await docs.addComment(activeDoc.id, commentInput.trim());
    setCommentInput("");
  };

  const handleOpenVersions = async () => {
    if (!activeDoc) return;
    await docs.loadVersions(activeDoc.id);
    setShowVersions(true);
  };

  const handleRestoreVersion = async (v: DocVersion) => {
    if (!activeDoc) return;
    await docs.restoreVersion(activeDoc.id, v);
    setEditTitle(v.title);
    setEditContent(v.content);
    setActiveDoc(prev => prev ? { ...prev, title: v.title, content: v.content } : null);
    setShowVersions(false);
  };

  const filtered = searchQuery
    ? docs.documents.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()) || d.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : docs.documents;

  const pinnedDocs = filtered.filter(d => d.is_pinned);
  const otherDocs = filtered.filter(d => !d.is_pinned);

  // Document detail view
  if (activeDoc) {
    return (
      <div className="space-y-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => { setActiveDoc(null); docs.loadDocuments(); }} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Dokumenty
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                {/* AI actions */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={aiLoading}>
                      {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      AI Asystent
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="end">
                    {AI_ACTIONS.map(a => (
                      <button key={a.key}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
                        onClick={() => handleAIAction(a)}
                        disabled={aiLoading}
                      >
                        <span>{a.icon}</span> {a.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} className="gap-1 text-xs">
                  <Eye className="h-3.5 w-3.5" /> Podgląd
                </Button>
                <Button size="sm" onClick={saveDoc} className="gap-1 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Zapisz wersję
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={startEditing} className="gap-1 text-xs">
                  <Edit3 className="h-3.5 w-3.5" /> Edytuj
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1 text-xs">
                  <FileDown className="h-3.5 w-3.5" /> Drukuj/PDF
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowComments(!showComments)} className="gap-1 text-xs">
              <MessageSquare className="h-3.5 w-3.5" /> {docs.comments.length}
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenVersions} className="gap-1 text-xs">
              <History className="h-3.5 w-3.5" /> Historia
            </Button>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Main editor / preview */}
          <div className="flex-1 min-w-0">
            <Card className="min-h-[500px]">
              <CardContent className="p-6 md:p-8">
                {isEditing ? (
                  <div className="space-y-4">
                    <Input
                      value={editTitle}
                      onChange={e => handleTitleChange(e.target.value)}
                      className="text-2xl font-bold border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
                      placeholder="Tytuł dokumentu..."
                    />
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span>Markdown • *bold* _italic_ # nagłówek - lista</span>
                      <Badge variant="outline" className="text-[9px] py-0">{editContent.split(/\s+/).filter(Boolean).length} słów</Badge>
                    </div>
                    <Textarea
                      value={editContent}
                      onChange={e => handleContentChange(e.target.value)}
                      className="min-h-[400px] font-mono text-sm leading-relaxed border-0 focus-visible:ring-0 resize-none"
                      placeholder="Zacznij pisać... (markdown obsługiwany)"
                    />
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
                      <span>{activeDoc.icon}</span> {activeDoc.title}
                    </h1>
                    <div className="text-xs text-muted-foreground mb-6 flex items-center gap-3">
                      <span>Ostatnia edycja: {new Date(activeDoc.updated_at).toLocaleString('pl-PL')}</span>
                      {activeDoc.last_edited_by_name && <span>przez {activeDoc.last_edited_by_name}</span>}
                      <Badge variant="outline" className="text-[9px] py-0">v{activeDoc.version}</Badge>
                      <Badge variant="outline" className="text-[9px] py-0">{activeDoc.word_count} słów</Badge>
                    </div>
                    <ReactMarkdown>{activeDoc.content || "*Brak treści*"}</ReactMarkdown>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Comments sidebar */}
          {showComments && (
            <div className="w-72 shrink-0 hidden lg:block">
              <Card className="h-[500px] flex flex-col">
                <div className="p-3 border-b flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4" /> Komentarze ({docs.comments.length})
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowComments(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {docs.comments.filter(c => !c.is_resolved).map(c => (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[8px]">{(c.user_name || '?')[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{c.user_name || 'Użytkownik'}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(c.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      {c.selection_text && (
                        <div className="text-[10px] bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded border-l-2 border-yellow-400 italic">
                          „{c.selection_text}"
                        </div>
                      )}
                      <p className="text-xs">{c.content}</p>
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => docs.resolveComment(c.id)}>
                        <CheckCircle2 className="h-3 w-3 mr-0.5" /> Rozwiąż
                      </Button>
                    </div>
                  ))}
                  {docs.comments.filter(c => !c.is_resolved).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Brak komentarzy</p>
                  )}
                </div>
                <div className="p-3 border-t flex gap-1.5">
                  <Input
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    placeholder="Dodaj komentarz..."
                    className="h-8 text-xs"
                    onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                  />
                  <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleAddComment} disabled={!commentInput.trim()}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Versions Sheet */}
        <Sheet open={showVersions} onOpenChange={setShowVersions}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> Historia wersji
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-3 mt-4">
              {docs.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Brak wcześniejszych wersji</p>
              ) : (
                docs.versions.map(v => (
                  <Card key={v.id} className="cursor-pointer hover:bg-accent/30 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">v{v.version}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(v.created_at).toLocaleString('pl-PL')}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{v.title}</p>
                      <p className="text-xs text-muted-foreground">Edytował: {v.edited_by_name || 'Nieznany'}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{v.content?.slice(0, 120)}...</p>
                      <Button variant="outline" size="sm" className="mt-2 h-7 text-xs w-full" onClick={() => handleRestoreVersion(v)}>
                        Przywróć tę wersję
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // Document list view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={handleCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Nowy dokument
        </Button>
        <Button onClick={() => setShowTemplates(true)} size="sm" variant="outline" className="gap-1.5">
          <BookTemplate className="h-4 w-4" /> Z szablonu
        </Button>
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Szukaj dokumentów..."
            className="h-8 w-48 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Pinned docs */}
      {pinnedDocs.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
            <Pin className="h-3 w-3" /> Przypięte
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedDocs.map(doc => <DocCard key={doc.id} doc={doc} onOpen={openDoc} docs={docs} />)}
          </div>
        </div>
      )}

      {/* All docs */}
      {docs.loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm">Ładowanie dokumentów...</p>
        </div>
      ) : otherDocs.length === 0 && pinnedDocs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Brak dokumentów</p>
            <p className="text-xs">Utwórz pierwszy dokument lub wybierz szablon</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {otherDocs.map(doc => <DocCard key={doc.id} doc={doc} onOpen={openDoc} docs={docs} />)}
        </div>
      )}

      {/* Templates dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BookTemplate className="h-5 w-5" /> Szablony dokumentów</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {docs.templates.map((t, idx) => (
              <button
                key={idx}
                className="text-left p-4 border rounded-xl hover:bg-accent/30 hover:border-primary/30 transition-all space-y-1"
                onClick={() => handleCreateFromTemplate(idx)}
              >
                <div className="text-2xl">{t.icon}</div>
                <p className="text-sm font-semibold">{t.title}</p>
                <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Document card component
function DocCard({ doc, onOpen, docs }: { doc: WorkspaceDocument; onOpen: (d: WorkspaceDocument) => void; docs: any }) {
  return (
    <Card className="group cursor-pointer hover:shadow-md hover:border-primary/20 transition-all" onClick={() => onOpen(doc)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg shrink-0">{doc.icon}</span>
            <h3 className="text-sm font-semibold truncate">{doc.title}</h3>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => docs.togglePin(doc.id, doc.is_pinned)}>
                {doc.is_pinned ? <><PinOff className="h-3.5 w-3.5 mr-2" /> Odepnij</> : <><Pin className="h-3.5 w-3.5 mr-2" /> Przypnij</>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => docs.archiveDocument(doc.id)}>
                <Archive className="h-3.5 w-3.5 mr-2" /> Archiwizuj
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => docs.deleteDocument(doc.id)} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Usuń
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[32px]">
          {doc.content?.slice(0, 120).replace(/[#*_\[\]]/g, '') || "Pusty dokument"}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {new Date(doc.updated_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
          </span>
          <Badge variant="outline" className="text-[9px] py-0">v{doc.version}</Badge>
          <span>{doc.word_count} słów</span>
          {doc.is_pinned && <Pin className="h-3 w-3 text-primary" />}
        </div>
      </CardContent>
    </Card>
  );
}

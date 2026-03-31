import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, FileText } from 'lucide-react';

interface TemplatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: { name: string; content: string; version: string } | null;
  onFillAndSend?: () => void;
}

function highlightPlaceholders(content: string): string {
  return content.replace(
    /\{\{([A-Z0-9_]+)\}\}/g,
    '<span style="background-color: #6C5CE730; color: #6C5CE7; padding: 2px 6px; border-radius: 4px; font-weight: 600;">{{$1}}</span>'
  );
}

export const TemplatePreviewModal = ({ open, onOpenChange, template, onFillAndSend }: TemplatePreviewModalProps) => {
  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Podgląd: {template.name} (v{template.version})
          </DialogTitle>
        </DialogHeader>
        <div
          className="border rounded-lg p-6 bg-white dark:bg-muted/30 whitespace-pre-wrap text-sm leading-relaxed font-serif"
          dangerouslySetInnerHTML={{ __html: highlightPlaceholders(template.content) }}
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij</Button>
          {onFillAndSend && (
            <Button onClick={onFillAndSend} style={{ backgroundColor: '#6C5CE7' }} className="gap-2">
              <FileText className="h-4 w-4" /> Uzupełnij i wyślij
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

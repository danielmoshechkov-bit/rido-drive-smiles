import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAISalesConversations } from '@/hooks/useAISalesAgents';
import { MessageSquare, Phone, Mail } from 'lucide-react';
import { format } from 'date-fns';

const CHANNEL_ICONS: Record<string, any> = {
  sms: MessageSquare,
  call: Phone,
  email: Mail,
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😟',
};

export function AISalesConversationsList() {
  const { data: conversations = [], isLoading } = useAISalesConversations();
  const [selectedConv, setSelectedConv] = useState<any>(null);

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {conversations.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Brak konwersacji</p>
            <p className="text-sm">Konwersacje pojawią się gdy agent skontaktuje się z leadami</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv: any) => {
            const Icon = CHANNEL_ICONS[conv.channel] || MessageSquare;
            const msgCount = conv.messages?.length || 0;
            return (
              <Card key={conv.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedConv(conv)}>
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{conv.channel}</span>
                        <Badge variant={conv.status === 'completed' ? 'default' : 'secondary'} className="text-xs">{conv.status}</Badge>
                        {conv.ai_sentiment && <span className="text-lg">{SENTIMENT_EMOJI[conv.ai_sentiment]}</span>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{conv.ai_summary || `${msgCount} wiadomości`}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{format(new Date(conv.created_at), 'dd.MM.yyyy HH:mm')}</p>
                    {conv.ai_outcome && (
                      <Badge variant="outline" className="text-xs mt-1">{conv.ai_outcome}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Conversation detail */}
      <Dialog open={!!selectedConv} onOpenChange={() => setSelectedConv(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rozmowa — {selectedConv?.channel?.toUpperCase()}</DialogTitle>
          </DialogHeader>
          {selectedConv && (
            <div className="space-y-4">
              {/* Chat bubbles */}
              <div className="space-y-3 max-h-[400px] overflow-y-auto p-4 bg-muted/30 rounded-lg">
                {(selectedConv.messages || []).map((msg: any, i: number) => (
                  <div key={i} className={`flex ${msg.role === 'agent' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      msg.role === 'agent' 
                        ? 'bg-primary text-primary-foreground rounded-br-md' 
                        : 'bg-background border rounded-bl-md'
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                      {msg.timestamp && (
                        <p className={`text-xs mt-1 ${msg.role === 'agent' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {format(new Date(msg.timestamp), 'HH:mm')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* AI insights */}
              {(selectedConv.ai_objections_detected?.length > 0 || selectedConv.ai_buying_signals?.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedConv.ai_objections_detected?.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">Wykryte obiekcje</h4>
                      <ul className="text-sm space-y-1">
                        {selectedConv.ai_objections_detected.map((o: string, i: number) => (
                          <li key={i} className="text-red-600 dark:text-red-400">• {o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedConv.ai_buying_signals?.length > 0 && (
                    <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">Sygnały zakupowe</h4>
                      <ul className="text-sm space-y-1">
                        {selectedConv.ai_buying_signals.map((s: string, i: number) => (
                          <li key={i} className="text-green-600 dark:text-green-400">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {selectedConv.ai_learning_notes && (
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Czego się nauczył</h4>
                  <p className="text-sm text-blue-600 dark:text-blue-400">{selectedConv.ai_learning_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

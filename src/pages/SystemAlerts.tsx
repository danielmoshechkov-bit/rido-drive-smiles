import { useState } from 'react';
import { useSystemAlerts } from '@/hooks/useSystemAlerts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  UserPlus,
  X,
  Check,
  Eye,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManualMatchModal } from '@/components/ManualMatchModal';

export default function SystemAlerts() {
  const { alerts, loading, markAsResolved, markAsIgnored } = useSystemAlerts();
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved' | 'ignored'>('all');
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);

  const handleOpenMatchModal = (alert: any) => {
    setSelectedAlert(alert);
    setMatchModalOpen(true);
  };

  const handleMatchComplete = () => {
    // Refresh alerts after successful match
    window.location.reload();
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === 'all') return true;
    return alert.status === filter;
  });

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'new_driver':
        return <UserPlus className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getAlertBadgeVariant = (type: string): "default" | "destructive" | "outline" | "secondary" => {
    switch (type) {
      case 'error':
        return 'destructive';
      case 'warning':
        return 'outline';
      case 'new_driver':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'import':
        return 'Import';
      case 'matching':
        return 'Dopasowanie';
      case 'validation':
        return 'Walidacja';
      case 'system':
        return 'System';
      default:
        return category;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Ładowanie...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Informacje z systemu</h1>
          <p className="text-muted-foreground">
            Historia alertów, błędów i nowych kierowców
          </p>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full">
        <TabsList>
          <TabsTrigger value="all">
            Wszystkie ({alerts.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Oczekujące ({alerts.filter(a => a.status === 'pending').length})
          </TabsTrigger>
          <TabsTrigger value="resolved">
            Rozwiązane ({alerts.filter(a => a.status === 'resolved').length})
          </TabsTrigger>
          <TabsTrigger value="ignored">
            Zignorowane ({alerts.filter(a => a.status === 'ignored').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-6 space-y-4">
          {filteredAlerts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Brak alertów w tej kategorii
              </CardContent>
            </Card>
          ) : (
            filteredAlerts.map((alert) => (
              <Card key={alert.id} className={cn(
                'transition-all',
                alert.status === 'pending' && 'border-l-4',
                alert.type === 'error' && 'border-l-destructive',
                alert.type === 'warning' && 'border-l-yellow-500',
                alert.type === 'new_driver' && 'border-l-green-500'
              )}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {getAlertIcon(alert.type)}
                      <div className="flex-1 space-y-1">
                        <CardTitle className="text-lg">{alert.title}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {alert.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={getAlertBadgeVariant(alert.type)}>
                            {alert.type}
                          </Badge>
                          <Badge variant="outline">
                            {getCategoryLabel(alert.category)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(alert.created_at).toLocaleString('pl-PL')}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {alert.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        {(alert.type === 'error' && (alert.category === 'matching' || alert.category === 'validation')) && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleOpenMatchModal(alert)}
                          >
                            <Link2 className="h-4 w-4 mr-1" />
                            Dopasuj kierowcę
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsResolved(alert.id)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Rozwiąż
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markAsIgnored(alert.id)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Ignoruj
                        </Button>
                      </div>
                    )}
                    
                    {alert.status === 'resolved' && (
                      <Badge variant="default" className="bg-green-500 text-white">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Rozwiązane
                      </Badge>
                    )}
                    
                    {alert.status === 'ignored' && (
                      <Badge variant="secondary">
                        <Eye className="h-3 w-3 mr-1" />
                        Zignorowane
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                
                {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                  <CardContent>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Szczegóły techniczne
                      </summary>
                      <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                        {JSON.stringify(alert.metadata, null, 2)}
                      </pre>
                    </details>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Manual Match Modal */}
      {selectedAlert && (
        <ManualMatchModal
          open={matchModalOpen}
          onOpenChange={setMatchModalOpen}
          alertId={selectedAlert.id}
          alertMetadata={selectedAlert.metadata}
          onMatchComplete={handleMatchComplete}
        />
      )}
    </div>
  );
}

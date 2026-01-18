// GetRido Maps - Admin Reports Moderation Panel
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Shield, CheckCircle, XCircle, Trash2, AlertTriangle, MapPin, Clock, ThumbsUp, ThumbsDown } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface MapReport {
  id: string;
  user_id: string | null;
  type: string;
  lat: number;
  lng: number;
  road_name: string | null;
  description: string | null;
  severity: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  expires_at: string;
  upvotes: number;
  downvotes: number;
}

const REPORT_TYPES: Record<string, { label: string; color: string }> = {
  police: { label: 'Policja', color: 'bg-blue-500' },
  accident: { label: 'Wypadek', color: 'bg-red-500' },
  traffic: { label: 'Korek', color: 'bg-orange-500' },
  roadwork: { label: 'Roboty drogowe', color: 'bg-yellow-500' },
  hazard: { label: 'Zagrożenie', color: 'bg-red-600' },
  closure: { label: 'Zamknięcie', color: 'bg-gray-600' },
  speed_cam: { label: 'Fotoradar', color: 'bg-purple-500' },
  red_light_cam: { label: 'Kamera świateł', color: 'bg-purple-600' },
  avg_speed_zone: { label: 'Odcinkowy', color: 'bg-purple-400' },
  other: { label: 'Inne', color: 'bg-gray-500' },
};

export function MapReportsModerationPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  // Fetch reports
  const { data: reports, isLoading } = useQuery({
    queryKey: ['map-reports-admin', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('map_reports')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        road_name: r.road_name || null,
        severity: r.severity || 1,
        upvotes: r.votes_up || r.upvotes || 0,
        downvotes: r.votes_down || r.downvotes || 0,
      })) as MapReport[];
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('map_reports')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['map-reports-admin'] });
      toast.success('Status zgłoszenia zaktualizowany');
    },
    onError: () => toast.error('Błąd aktualizacji'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('map_reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['map-reports-admin'] });
      toast.success('Zgłoszenie usunięte');
    },
    onError: () => toast.error('Błąd usuwania'),
  });

  const getTypeInfo = (type: string) => {
    return REPORT_TYPES[type] || REPORT_TYPES.other;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Zatwierdzony</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/30">Odrzucony</Badge>;
      default:
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Oczekuje</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingCount = reports?.filter(r => r.status === 'pending').length || 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Moderacja zgłoszeń
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-2">{pendingCount} oczekuje</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Przeglądaj i moderuj zgłoszenia użytkowników
              </CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="pending">Oczekujące</SelectItem>
                <SelectItem value="approved">Zatwierdzone</SelectItem>
                <SelectItem value="rejected">Odrzucone</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Typ</TableHead>
                  <TableHead>Lokalizacja</TableHead>
                  <TableHead>Opis</TableHead>
                  <TableHead>Głosy</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!reports || reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Brak zgłoszeń do wyświetlenia
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((report) => {
                    const typeInfo = getTypeInfo(report.type);
                    return (
                      <TableRow key={report.id}>
                        <TableCell>
                          <Badge className={`${typeInfo.color} text-white`}>
                            {typeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {report.road_name || `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-40 truncate">
                          {report.description || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="flex items-center gap-0.5 text-green-600">
                              <ThumbsUp className="h-3 w-3" />
                              {report.upvotes}
                            </span>
                            <span className="flex items-center gap-0.5 text-red-600">
                              <ThumbsDown className="h-3 w-3" />
                              {report.downvotes}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(report.created_at), 'dd.MM HH:mm', { locale: pl })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(report.status)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {report.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateStatusMutation.mutate({ id: report.id, status: 'approved' })}
                                  disabled={updateStatusMutation.isPending}
                                  className="h-8 w-8 p-0 text-green-600 hover:bg-green-500/10"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateStatusMutation.mutate({ id: report.id, status: 'rejected' })}
                                  disabled={updateStatusMutation.isPending}
                                  className="h-8 w-8 p-0 text-red-600 hover:bg-red-500/10"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteMutation.mutate(report.id)}
                              disabled={deleteMutation.isPending}
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-amber-600">{reports?.filter(r => r.status === 'pending').length || 0}</p>
            <p className="text-sm text-muted-foreground">Oczekujące</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">{reports?.filter(r => r.status === 'approved').length || 0}</p>
            <p className="text-sm text-muted-foreground">Zatwierdzone</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-red-600">{reports?.filter(r => r.status === 'rejected').length || 0}</p>
            <p className="text-sm text-muted-foreground">Odrzucone</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default MapReportsModerationPanel;

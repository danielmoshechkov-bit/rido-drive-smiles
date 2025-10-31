import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VehicleList } from '@/components/VehicleList';
import { FleetSettlementsView } from '@/components/FleetSettlementsView';
import { DocumentsManagement } from '@/components/DocumentsManagement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, Car, Users, FileText, DollarSign } from 'lucide-react';

export default function FleetDashboard() {
  const navigate = useNavigate();
  const { role, fleetId, loading: roleLoading } = useUserRole();
  const [fleetName, setFleetName] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    if (!roleLoading && (!role || (role !== 'fleet_settlement' && role !== 'fleet_rental'))) {
      navigate('/auth');
    }
  }, [role, roleLoading, navigate]);

  useEffect(() => {
    if (fleetId) {
      fetchFleetName();
    }
  }, [fleetId]);

  const fetchFleetName = async () => {
    const { data, error } = await supabase
      .from('fleets')
      .select('name')
      .eq('id', fleetId)
      .single();

    if (!error && data) {
      setFleetName(data.name);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Ładowanie...</p>
        </div>
      </div>
    );
  }

  if (!fleetId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardHeader>
            <CardTitle>Błąd dostępu</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Nie znaleziono przypisanej floty.</p>
            <Button onClick={handleSignOut}>Wyloguj się</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Panel Flotowy</h1>
            <p className="text-muted-foreground mt-1">{fleetName}</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Wyloguj
          </Button>
        </div>

        <Tabs defaultValue="vehicles" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="vehicles">
              <Car className="h-4 w-4 mr-2" />
              Moje auta
            </TabsTrigger>
            <TabsTrigger value="drivers">
              <Users className="h-4 w-4 mr-2" />
              Kierowcy
            </TabsTrigger>
            <TabsTrigger value="settlements">
              <DollarSign className="h-4 w-4 mr-2" />
              Rozliczenia
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText className="h-4 w-4 mr-2" />
              Dokumenty
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles">
            <Card>
              <CardHeader>
                <CardTitle>Zarządzanie pojazdami</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Panel zarządzania pojazdami floty będzie dostępny wkrótce.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drivers">
            <Card>
              <CardHeader>
                <CardTitle>Kierowcy przypisani do floty</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Lista kierowców będzie dostępna w rozliczeniach oraz przy zarządzaniu pojazdami.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settlements">
            <FleetSettlementsView
              fleetId={fleetId}
              viewType={role === 'fleet_settlement' ? 'settlement' : 'rental'}
              periodFrom={selectedPeriod?.from}
              periodTo={selectedPeriod?.to}
            />
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Dokumenty</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Panel zarządzania dokumentami będzie dostępny wkrótce.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

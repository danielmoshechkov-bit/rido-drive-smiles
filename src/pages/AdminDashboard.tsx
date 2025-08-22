import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import LanguageSelector from "@/components/LanguageSelector";

const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('weekly-report');

  const handleLogout = () => {
    navigate('/');
  };

  // Mock data for demonstration
  const weeklyStats = {
    totalDrivers: 157,
    totalEarnings: 45230.50,
    totalTrips: 2341,
    averageRating: 4.8
  };

  const drivers = [
    { id: 1, name: 'Jan Kowalski', service: 'Uber', earnings: 1250.00, trips: 45, status: 'active' },
    { id: 2, name: 'Anna Nowak', service: 'Bolt', earnings: 980.50, trips: 38, status: 'active' },
    { id: 3, name: 'Piotr Wiśniewski', service: 'FreeNow', earnings: 1100.75, trips: 42, status: 'inactive' },
    { id: 4, name: 'Maria Dąbrowska', service: 'Uber', earnings: 1450.25, trips: 52, status: 'active' },
    { id: 5, name: 'Tomasz Lewandowski', service: 'Bolt', earnings: 890.00, trips: 33, status: 'active' },
  ];

  const getServiceColor = (service: string) => {
    switch (service) {
      case 'Uber': return 'bg-black text-white';
      case 'Bolt': return 'bg-green-500 text-white';
      case 'FreeNow': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="Get RIDO Logo" 
              className="h-8 w-8"
            />
            <h1 className="text-xl font-bold text-primary">{t('admin.dashboard')}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <LanguageSelector />
            <Button variant="outline" onClick={handleLogout}>
              {t('admin.logout')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="weekly-report">{t('admin.weeklyReport')}</TabsTrigger>
            <TabsTrigger value="drivers-list">{t('admin.driversList')}</TabsTrigger>
            <TabsTrigger value="data-import">{t('admin.dataImport')}</TabsTrigger>
            <TabsTrigger value="settings">{t('admin.settings')}</TabsTrigger>
            <TabsTrigger value="reports">{t('admin.reports')}</TabsTrigger>
          </TabsList>

          <TabsContent value="weekly-report" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Łączna liczba kierowców
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalDrivers}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Łączne zarobki
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalEarnings.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Łączna liczba kursów
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.totalTrips}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Średnia ocena
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{weeklyStats.averageRating}/5</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="drivers-list" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.driversList')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {drivers.map((driver) => (
                    <div key={driver.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div>
                          <h3 className="font-semibold">{driver.name}</h3>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge className={getServiceColor(driver.service)}>
                              {driver.service}
                            </Badge>
                            <Badge variant={driver.status === 'active' ? 'default' : 'secondary'}>
                              {driver.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{driver.earnings.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</p>
                        <p className="text-sm text-muted-foreground">{driver.trips} kursów</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data-import" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.dataImport')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">Funkcja importu danych zostanie wkrótce dodana.</p>
                <Button disabled>Importuj dane CSV</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">Panel ustawień systemu zostanie wkrótce dodany.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.reports')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">Dodatkowe raporty i analizy zostaną wkrótce dodane.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
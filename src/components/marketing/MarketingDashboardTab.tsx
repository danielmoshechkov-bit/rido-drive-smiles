import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, DollarSign, Target, Users, Megaphone } from 'lucide-react';

export function MarketingDashboardTab() {
  const stats = [
    { label: 'Aktywne kampanie', value: '0', icon: Megaphone, color: 'text-primary' },
    { label: 'Wydatki (miesiąc)', value: '0 zł', icon: DollarSign, color: 'text-emerald-600' },
    { label: 'Średni ROAS', value: '—', icon: TrendingUp, color: 'text-blue-600' },
    { label: 'Klienci agencji', value: '0', icon: Users, color: 'text-orange-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-20`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Wydatki vs Przychody (30 dni)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Podłącz konto Meta lub Google Ads, aby zobaczyć dane
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Top kampanie (ROAS)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Brak kampanii do wyświetlenia
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
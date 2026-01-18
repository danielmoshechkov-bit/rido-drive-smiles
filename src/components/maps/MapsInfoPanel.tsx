import { useState, useEffect } from 'react';
import { Activity, AlertTriangle, Shield, Clock, MapPin, Navigation, RefreshCw, Sparkles, TrendingUp, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import GpsStatusPanel from './GpsStatusPanel';
import FleetLiveToggle from './FleetLiveToggle';
import { GpsState } from './useUserLocation';
import { RouteResult } from './routingService';
import { Incident } from './incidentsService';
import { incidentsService } from './incidentsService';
import { AiAnalysisResult, getFriendlyMessage } from './freeAiAnalysis';
import { RiskAssessment } from './routeRiskService';
import { format, addMinutes } from 'date-fns';

interface MapsInfoPanelProps {
  gps: GpsState;
  routing?: {
    route: RouteResult | null;
    aiAnalysis: AiAnalysisResult | null;
    incidents?: Incident[];
    incidentsLoading?: boolean;
    onRefreshIncidents?: () => void;
  };
  riskAssessment?: RiskAssessment | null;
}

const MapsInfoPanel = ({ gps, routing, riskAssessment }: MapsInfoPanelProps) => {
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  
  const route = routing?.route;
  const aiAnalysis = routing?.aiAnalysis;
  const incidents = routing?.incidents || [];
  const incidentsLoading = routing?.incidentsLoading || false;

  // Update cooldown remaining every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCooldownRemaining(incidentsService.getCooldownRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate ETA
  const eta = route ? addMinutes(new Date(), route.duration) : null;

  const handleRefreshIncidents = () => {
    if (cooldownRemaining === 0 && routing?.onRefreshIncidents) {
      routing.onRefreshIncidents();
    }
  };

  // Use riskAssessment if provided, fallback to aiAnalysis
  const displayRiskLevel = riskAssessment?.riskLevel || aiAnalysis?.riskLevel || null;

  return (
    <div className="w-72 flex-shrink-0 bg-card border-l flex flex-col h-full rido-panel-right">
      <ScrollArea className="flex-1">
        {/* GPS Status */}
        <GpsStatusPanel gps={gps} />

        {/* Fleet Live Toggle */}
        <FleetLiveToggle gps={gps} />

        {/* Route Info Card - Premium Display */}
        {route && (
          <div className="p-4 border-b">
            <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm text-muted-foreground uppercase tracking-wide">
              <Navigation className="h-4 w-4 text-primary" />
              Twoja trasa
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-background rounded-xl border text-center">
                <p className="text-2xl font-bold text-foreground">
                  {route.distance.toFixed(1)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">km</p>
              </div>
              <div className="p-3 bg-background rounded-xl border text-center">
                <p className="text-2xl font-bold text-foreground">
                  {Math.round(route.duration)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">min</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 text-center">
                <p className="text-2xl font-bold text-primary">
                  {eta ? format(eta, 'HH:mm') : '--:--'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">przyjazd</p>
              </div>
            </div>

            {/* RidoAI Analysis + Risk Assessment */}
            {(aiAnalysis || riskAssessment) && (
              <div className="mt-4 p-3 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">RidoAI przeanalizowało trasę</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">FREE</Badge>
                </div>
                <p className="text-sm text-foreground/80">
                  {getFriendlyMessage(displayRiskLevel || 'low')}
                </p>
                
                {/* Risk Messages from Assessment */}
                {riskAssessment && riskAssessment.messages.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {riskAssessment.messages.slice(0, 3).map((msg, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{msg}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Incidents near route count */}
                {riskAssessment && riskAssessment.incidentsNearRoute.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-600">
                      {riskAssessment.incidentsNearRoute.length} zdarzeń na trasie
                    </span>
                  </div>
                )}
                
                {/* Risk Level Badge */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-primary/10">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Poziom ryzyka</span>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] ${
                      displayRiskLevel === 'low' 
                        ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                        : displayRiskLevel === 'medium' 
                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' 
                        : 'bg-red-500/10 text-red-600 border-red-500/30'
                    }`}
                  >
                    {displayRiskLevel === 'low' ? 'Niski' : displayRiskLevel === 'medium' ? 'Średni' : 'Wysoki'}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Road Events - Dynamic */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Zdarzenia drogowe
            </h3>
            {routing?.onRefreshIncidents && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={handleRefreshIncidents}
                disabled={cooldownRemaining > 0 || incidentsLoading}
              >
                <RefreshCw className={`h-3 w-3 ${incidentsLoading ? 'animate-spin' : ''}`} />
                {cooldownRemaining > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">{cooldownRemaining}s</span>
                )}
              </Button>
            )}
          </div>
          
          {incidents.length > 0 ? (
            <div className="space-y-2">
              {incidents.slice(0, 5).map((incident, idx) => (
                <div key={incident.id || idx} className="p-3 rounded-lg border bg-background">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge 
                      variant={incident.type === 'closure' ? 'destructive' : 'secondary'} 
                      className="text-xs px-1.5 py-0"
                    >
                      {incident.type === 'closure' ? 'Zamknięte' : 
                       incident.type === 'roadwork' || incident.type === 'construction' ? 'Roboty' : 
                       'Zdarzenie'}
                    </Badge>
                  </div>
                  <p className="text-sm flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    {incident.title || 'Zdarzenie na trasie'}
                  </p>
                </div>
              ))}
              {incidents.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{incidents.length - 5} więcej zdarzeń
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {incidentsLoading ? 'Ładowanie zdarzeń...' : route ? 'Brak zdarzeń na trasie' : 'Wyznacz trasę, aby sprawdzić'}
            </p>
          )}
        </div>

        {/* Traffic Status - Dynamic based on Risk */}
        <div className="p-4 border-b">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Status ruchu
          </h3>
          <div className="space-y-2">
            {displayRiskLevel ? (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                displayRiskLevel === 'low' 
                  ? 'bg-green-500/10 border-green-500/20' 
                  : displayRiskLevel === 'medium'
                  ? 'bg-yellow-500/10 border-yellow-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}>
                <div className={`h-3 w-3 rounded-full ${
                  displayRiskLevel === 'low' ? 'bg-green-500 animate-pulse' :
                  displayRiskLevel === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="text-sm font-medium">
                  {displayRiskLevel === 'low' ? 'Płynnie' : 
                   displayRiskLevel === 'medium' ? 'Spowolnienie' : 'Utrudnienia'}
                </span>
                {aiAnalysis?.estimatedDelay && aiAnalysis.estimatedDelay > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    +{aiAnalysis.estimatedDelay} min
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border">
                <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                <span className="text-sm text-muted-foreground">Wyznacz trasę, aby sprawdzić</span>
              </div>
            )}
          </div>
        </div>

        {/* Weather placeholder */}
        <div className="p-4 border-b">
          <h3 className="font-semibold mb-3 text-sm text-muted-foreground">Pogoda na trasie</h3>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="text-2xl">☀️</span>
              <div><p className="text-sm font-medium">12°C</p><p className="text-xs text-muted-foreground">Słonecznie</p></div>
            </div>
            <div className="text-right text-xs text-muted-foreground"><p>Wiatr: 8 km/h</p><p>Widoczność: dobra</p></div>
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 bg-primary/5 border-t">
        <div className="flex items-center gap-2 mb-2"><Shield className="h-4 w-4 text-primary" /><span className="font-semibold text-sm">Dostęp: TEST / ADMIN</span></div>
        <p className="text-xs text-muted-foreground">Widok widoczny tylko dla wybranych kont</p>
      </div>
    </div>
  );
};

export default MapsInfoPanel;

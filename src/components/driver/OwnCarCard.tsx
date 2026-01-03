import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { Car, FileText, Wrench, Info } from "lucide-react";
import { VehicleDocuments } from "@/components/VehicleDocuments";
import { VehicleServiceTab } from "@/components/VehicleServiceTab";

interface OwnVehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
  year?: number;
  color?: string;
  vin?: string;
  odometer?: number;
  fuel_type?: string;
  assigned_at: string;
  vehicle_inspections?: Array<{ valid_to: string; id?: string; date?: string; result?: string; notes?: string }>;
  vehicle_policies?: Array<{ valid_to: string; type: string; id?: string; policy_no?: string; provider?: string; valid_from?: string }>;
}

export const OwnCarCard = ({ vehicle }: { vehicle: OwnVehicle }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("info");

  return (
    <Card className="rounded-2xl border shadow-soft">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{vehicle.brand} {vehicle.model}</CardTitle>
              <p className="text-sm text-muted-foreground font-mono">{vehicle.plate}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">Własne auto</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-2">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="info" className="text-xs">
              <Info className="h-3 w-3 mr-1" />
              Info
            </TabsTrigger>
            <TabsTrigger value="docs" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Dokumenty
            </TabsTrigger>
            <TabsTrigger value="service" className="text-xs">
              <Wrench className="h-3 w-3 mr-1" />
              Serwis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Rok:</span>
                <span className="ml-2 font-medium">{vehicle.year || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Kolor:</span>
                <span className="ml-2 font-medium">{vehicle.color || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Paliwo:</span>
                <span className="ml-2 font-medium">{vehicle.fuel_type || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Przebieg:</span>
                <span className="ml-2 font-medium">{vehicle.odometer ? `${vehicle.odometer.toLocaleString()} km` : "-"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">VIN:</span>
                <span className="ml-2 font-mono text-xs">{vehicle.vin || "-"}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="docs" className="space-y-3">
            <VehicleDocuments vehicleId={vehicle.id} />
          </TabsContent>

          <TabsContent value="service" className="space-y-3">
            <VehicleServiceTab vehicleId={vehicle.id} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

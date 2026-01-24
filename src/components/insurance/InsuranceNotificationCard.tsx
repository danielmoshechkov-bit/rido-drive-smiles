import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Car, Calendar, DollarSign, FileText, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, differenceInDays, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

interface Notification {
  id: string;
  vehicle_id: string;
  policy_id: string | null;
  fleet_id: string | null;
  notification_type: string;
  status: string;
  policy_type: string | null;
  current_premium: number | null;
  expiry_date: string;
  vehicle_plate: string | null;
  vehicle_vin: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  fleet_name: string | null;
  created_at: string;
}

interface InsuranceNotificationCardProps {
  notification: Notification;
  onPrepareOffer: () => void;
}

export function InsuranceNotificationCard({ notification, onPrepareOffer }: InsuranceNotificationCardProps) {
  const expiryDate = parseISO(notification.expiry_date);
  const daysUntilExpiry = differenceInDays(expiryDate, new Date());
  
  const getUrgencyColor = () => {
    if (daysUntilExpiry <= 7) return "bg-red-500";
    if (daysUntilExpiry <= 14) return "bg-orange-500";
    return "bg-yellow-500";
  };

  const getUrgencyText = () => {
    if (daysUntilExpiry <= 0) return "Wygasła!";
    if (daysUntilExpiry === 1) return "Wygasa jutro";
    return `Wygasa za ${daysUntilExpiry} dni`;
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Vehicle Info */}
          <div className="flex items-start gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <Car className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg">
                  {notification.vehicle_plate || "—"}
                </h3>
                <Badge variant="outline">{notification.policy_type || "OC"}</Badge>
              </div>
              <p className="text-muted-foreground">
                {notification.vehicle_brand} {notification.vehicle_model}
              </p>
              {notification.vehicle_vin && (
                <p className="text-sm text-muted-foreground font-mono">
                  VIN: {notification.vehicle_vin}
                </p>
              )}
              {notification.fleet_name && (
                <p className="text-sm text-muted-foreground mt-1">
                  Flota: {notification.fleet_name}
                </p>
              )}
            </div>
          </div>

          {/* Expiry & Premium Info */}
          <div className="flex flex-col md:items-end gap-2">
            <Badge className={getUrgencyColor()}>
              <AlertTriangle className="h-3 w-3 mr-1" />
              {getUrgencyText()}
            </Badge>
            
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {expiryDate.toLocaleDateString("pl-PL", { 
                    day: "numeric", 
                    month: "long", 
                    year: "numeric" 
                  })}
                </span>
              </div>
              
              {notification.current_premium && (
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{notification.current_premium} PLN</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-4 pt-4 border-t flex justify-end">
          <Button onClick={onPrepareOffer} className="gap-2">
            <FileText className="h-4 w-4" />
            Przygotuj ofertę
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

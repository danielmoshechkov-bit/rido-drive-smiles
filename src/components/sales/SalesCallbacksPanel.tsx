import { useMyCallbacks } from "@/hooks/useSalesLeads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Clock, Building } from "lucide-react";
import { format, isToday, isPast } from "date-fns";
import { pl } from "date-fns/locale";

export function SalesCallbacksPanel() {
  const { data: callbacks, isLoading } = useMyCallbacks();

  const sortedCallbacks = callbacks?.sort((a, b) => {
    const dateA = new Date(a.callback_date);
    const dateB = new Date(b.callback_date);
    return dateA.getTime() - dateB.getTime();
  });

  const todayCallbacks = sortedCallbacks?.filter(c => isToday(new Date(c.callback_date)));
  const overdueCallbacks = sortedCallbacks?.filter(c => isPast(new Date(c.callback_date)) && !isToday(new Date(c.callback_date)));
  const upcomingCallbacks = sortedCallbacks?.filter(c => !isPast(new Date(c.callback_date)) && !isToday(new Date(c.callback_date)));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const renderCallbackCard = (callback: any, isOverdue?: boolean) => (
    <Card key={callback.id} className={isOverdue ? "border-red-200 bg-red-50/50" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isOverdue ? "bg-red-100" : "bg-primary/10"}`}>
              <Phone className={`h-5 w-5 ${isOverdue ? "text-red-600" : "text-primary"}`} />
            </div>
            <div>
              <div className="font-medium flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                {callback.lead?.company_name || "Nieznana firma"}
              </div>
              <a href={`tel:${callback.lead?.phone}`} className="text-primary hover:underline text-sm">
                {callback.lead?.phone}
              </a>
              {callback.lead?.category && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {callback.lead.category.name}
                </Badge>
              )}
              {callback.notes && (
                <p className="text-sm text-muted-foreground mt-1">{callback.notes}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className={`flex items-center gap-1 text-sm ${isOverdue ? "text-red-600" : "text-muted-foreground"}`}>
              <Clock className="h-4 w-4" />
              {format(new Date(callback.callback_date), "d MMM, HH:mm", { locale: pl })}
            </div>
            <Button size="sm" className="mt-2" asChild>
              <a href={`tel:${callback.lead?.phone}`}>Zadzwoń</a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Overdue */}
      {overdueCallbacks && overdueCallbacks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-red-600 mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Zaległe ({overdueCallbacks.length})
          </h3>
          <div className="space-y-3">
            {overdueCallbacks.map(c => renderCallbackCard(c, true))}
          </div>
        </div>
      )}

      {/* Today */}
      {todayCallbacks && todayCallbacks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-primary mb-3 flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Dzisiaj ({todayCallbacks.length})
          </h3>
          <div className="space-y-3">
            {todayCallbacks.map(c => renderCallbackCard(c))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcomingCallbacks && upcomingCallbacks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-muted-foreground mb-3">
            Nadchodzące ({upcomingCallbacks.length})
          </h3>
          <div className="space-y-3">
            {upcomingCallbacks.map(c => renderCallbackCard(c))}
          </div>
        </div>
      )}

      {!callbacks?.length && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Brak zaplanowanych oddzwonień
          </CardContent>
        </Card>
      )}
    </div>
  );
}

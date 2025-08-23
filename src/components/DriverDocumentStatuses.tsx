import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

interface DocumentStatus {
  document_type: string;
  status: string;
  date_uploaded: string | null;
}

interface DriverDocumentStatusesProps {
  documentStatuses: DocumentStatus[];
}

const documentNames = {
  rodo: "Zgoda RODO",
  lease_agreement: "Umowa najmu",
  service_contract: "Umowa zlecenia"
};

export function DriverDocumentStatuses({ documentStatuses }: DriverDocumentStatusesProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
      case 'approved':
        return <Check size={14} className="text-green-600" />;
      default:
        return <X size={14} className="text-red-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
      case 'approved':
        return "bg-green-500/10 text-green-700 border-green-500/20";
      default:
        return "bg-red-500/10 text-red-700 border-red-500/20";
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-sm">Status dokumentów</h4>
      <div className="grid gap-2">
        {Object.entries(documentNames).map(([type, name]) => {
          const status = documentStatuses.find(d => d.document_type === type);
          const currentStatus = status?.status || 'pending';
          
          return (
            <div key={type} className="flex items-center justify-between">
              <span className="text-sm">{name}</span>
              <Badge className={getStatusColor(currentStatus)} variant="outline">
                {getStatusIcon(currentStatus)}
                <span className="ml-1">
                  {currentStatus === 'uploaded' || currentStatus === 'approved' ? 'Wysłane' : 'Brak'}
                </span>
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
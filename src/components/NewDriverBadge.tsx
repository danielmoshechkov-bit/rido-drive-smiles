import { Badge } from "@/components/ui/badge";

interface NewDriverBadgeProps {
  registrationDate: string;
}

export function NewDriverBadge({ registrationDate }: NewDriverBadgeProps) {
  const regDate = new Date(registrationDate);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const isNew = regDate > weekAgo;
  
  if (!isNew) return null;
  
  return (
    <Badge className="bg-green-500/10 text-green-700 border-green-500/20 animate-pulse">
      NOWY
    </Badge>
  );
}
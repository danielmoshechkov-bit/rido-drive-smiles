import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface UniversalCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}

export const UniversalCard = ({ title, children, className, headerAction }: UniversalCardProps) => {
  return (
    <Card className={cn(
      "w-full max-w-3xl transition-all duration-300",
      "border-2 border-border/30 hover:border-primary/30",
      "hover:bg-white hover:shadow-soft",
      "bg-card rounded-lg",
      className
    )}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-foreground">
            {title}
          </CardTitle>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {children}
      </CardContent>
    </Card>
  );
};
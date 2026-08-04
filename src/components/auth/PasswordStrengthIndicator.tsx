import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPasswordRequirements } from "@/security/passwordPolicy";

export { validatePassword } from "@/security/passwordPolicy";

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const requirements = getPasswordRequirements(password);

  const allMet = requirements.every(r => r.met);

  return (
    <div className="mt-2 space-y-1">
      {requirements.map((req, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-2 text-xs transition-colors",
            req.met ? "text-green-600" : "text-muted-foreground"
          )}
        >
          {req.met ? (
            <Check className="h-3 w-3 text-green-600" />
          ) : (
            <X className="h-3 w-3 text-muted-foreground" />
          )}
          <span>{req.label}</span>
        </div>
      ))}
      {password.length > 0 && allMet && (
        <div className="flex items-center gap-2 text-xs text-green-600 font-medium mt-1">
          <Check className="h-3 w-3" />
          Hasło spełnia wszystkie wymagania
        </div>
      )}
    </div>
  );
}

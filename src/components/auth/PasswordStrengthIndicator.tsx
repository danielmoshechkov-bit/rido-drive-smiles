import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const requirements = [
    {
      label: "Minimum 6 znaków",
      met: password.length >= 6,
    },
    {
      label: "Jedna duża litera",
      met: /[A-Z]/.test(password),
    },
    {
      label: "Jeden znak specjalny (!@#$%^&*)",
      met: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~`]/.test(password),
    },
  ];

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

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 6) {
    errors.push("Hasło musi mieć minimum 6 znaków");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Hasło musi zawierać przynajmniej jedną dużą literę");
  }
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~`]/.test(password)) {
    errors.push("Hasło musi zawierać przynajmniej jeden znak specjalny");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

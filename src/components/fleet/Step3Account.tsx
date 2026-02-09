import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, ShieldCheck } from "lucide-react";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";

interface Step3AccountProps {
  formData: {
    email: string;
    password: string;
    confirmPassword: string;
    acceptTerms: boolean;
    acceptRodo: boolean;
    [key: string]: any;
  };
  setFormData: (data: any) => void;
  fieldErrors: { [key: string]: string | undefined };
  setFieldErrors: (errors: any) => void;
  isHuman: boolean;
  setIsHuman: (value: boolean) => void;
  renderField: (
    name: string,
    label: string,
    icon: React.ReactNode,
    type?: string,
    placeholder?: string,
    required?: boolean
  ) => JSX.Element;
}

export function Step3Account({
  formData,
  setFormData,
  fieldErrors,
  setFieldErrors,
  isHuman,
  setIsHuman,
  renderField,
}: Step3AccountProps) {
  // Real-time password match validation
  const passwordMismatch = useMemo(() => {
    if (!formData.confirmPassword) return false;
    return formData.password !== formData.confirmPassword;
  }, [formData.password, formData.confirmPassword]);

  return (
    <>
      <div className="p-4 bg-muted rounded-lg mb-4">
        <h4 className="font-medium mb-1">Konto administratora floty</h4>
        <p className="text-sm text-muted-foreground">Dane do logowania w portalu do zarządzania flotą</p>
      </div>
      
      {renderField("email", "Email do logowania", <Mail className="h-4 w-4" />, "email", "admin@firma.pl")}
      
      {/* Password field with strength indicator */}
      <div className="space-y-2">
        <Label htmlFor="password">Hasło *</Label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={(e) => {
              setFormData({ ...formData, password: e.target.value });
              if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
            }}
            placeholder="Minimum 6 znaków, 1 duża litera, 1 znak specjalny"
            className={`pl-10 ${fieldErrors.password ? 'border-destructive ring-1 ring-destructive' : ''}`}
            required
          />
        </div>
        {formData.password && (
          <PasswordStrengthIndicator password={formData.password} />
        )}
        {fieldErrors.password && (
          <p className="text-sm text-destructive">{fieldErrors.password}</p>
        )}
      </div>
      
      {/* Confirm password with real-time validation */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Potwierdź hasło *</Label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <Input
            id="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => {
              setFormData({ ...formData, confirmPassword: e.target.value });
              if (fieldErrors.confirmPassword) setFieldErrors({ ...fieldErrors, confirmPassword: undefined });
            }}
            placeholder="Powtórz hasło"
            className={`pl-10 ${(fieldErrors.confirmPassword || passwordMismatch) ? 'border-destructive ring-1 ring-destructive' : ''}`}
            required
          />
        </div>
        {passwordMismatch && (
          <p className="text-sm text-destructive">Hasła nie są takie same</p>
        )}
        {fieldErrors.confirmPassword && !passwordMismatch && (
          <p className="text-sm text-destructive">{fieldErrors.confirmPassword}</p>
        )}
      </div>
      
      <div className="space-y-3 pt-4">
        <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg border">
          <Checkbox
            id="human"
            checked={isHuman}
            onCheckedChange={(checked) => setIsHuman(checked === true)}
          />
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-500" />
            <label htmlFor="human" className="text-sm font-medium">Nie jestem robotem</label>
          </div>
        </div>
        
        <div className="flex items-start space-x-2">
          <Checkbox
            id="terms"
            checked={formData.acceptTerms}
            onCheckedChange={(checked) => setFormData({ ...formData, acceptTerms: checked === true })}
          />
          <label htmlFor="terms" className="text-sm text-muted-foreground">
            Akceptuję <a href="/prawne?tab=regulamin" className="text-primary hover:underline">regulamin</a> *
          </label>
        </div>

        <div className="flex items-start space-x-2">
          <Checkbox
            id="rodo"
            checked={formData.acceptRodo}
            onCheckedChange={(checked) => setFormData({ ...formData, acceptRodo: checked === true })}
          />
          <label htmlFor="rodo" className="text-sm text-muted-foreground">
            Akceptuję <a href="/prawne?tab=prywatnosc" className="text-primary hover:underline">politykę prywatności</a> *
          </label>
        </div>
      </div>
    </>
  );
}
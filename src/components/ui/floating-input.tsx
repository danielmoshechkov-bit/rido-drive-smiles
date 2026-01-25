import * as React from "react";
import { cn } from "@/lib/utils";

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ className, label, required, value, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const hasValue = value !== undefined && value !== '';
    const isActive = isFocused || hasValue;

    return (
      <div className="relative">
        <input
          ref={ref}
          value={value}
          className={cn(
            "peer flex h-12 w-full rounded-md border border-input bg-background px-3 pt-5 pb-1 text-sm ring-offset-background placeholder:text-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          placeholder={label}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        <label
          className={cn(
            "absolute left-3 transition-all duration-200 pointer-events-none text-muted-foreground",
            isActive
              ? "top-1 text-xs text-primary"
              : "top-1/2 -translate-y-1/2 text-sm"
          )}
        >
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      </div>
    );
  }
);

FloatingInput.displayName = "FloatingInput";

export { FloatingInput };

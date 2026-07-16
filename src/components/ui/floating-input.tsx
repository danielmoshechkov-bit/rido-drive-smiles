import * as React from "react";
import { cn } from "@/lib/utils";

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  error?: boolean; // czerwona ramka gdy pole niepoprawne (np. brak ceny)
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ className, label, required, error, value, type, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const hasValue = value !== undefined && value !== '';
    const isActive = isFocused || hasValue;

    return (
      <div className="relative">
        <input
          ref={ref}
          type={type}
          value={value}
          className={cn(
            // Ramka wyraźnie widoczna na białym tle (slate-400), czerwona przy błędzie.
            "peer flex h-12 w-full rounded-md border bg-background px-3 pt-5 pb-1 text-sm ring-offset-background placeholder:text-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-2 border-destructive" : "border-slate-400",
            type === "number" && "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
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
          onKeyDown={(e) => {
            // Pola kwot/ilości: tylko cyfry i separator dziesiętny. HTML number
            // dopuszcza notację naukową ("e") i znaki +/- — użytkownik mógł
            // wpisać "12e5" i zepsuć kwotę. Klawisze edycyjne działają normalnie.
            if (type === "number" && ["e", "E", "+", "-"].includes(e.key)) {
              e.preventDefault();
              return;
            }
            props.onKeyDown?.(e);
          }}
          onWheel={(e) => {
            // Scroll na sfokusowanym polu liczbowym ZMIENIAŁ wartość (natywny spin)
            // — przypadkowe przewinięcie mogło zmienić kwotę/ilość na fakturze.
            // Blur zdejmuje fokus, więc scroll przewija stronę zamiast kręcić liczbą.
            if (type === "number") (e.currentTarget as HTMLInputElement).blur();
            props.onWheel?.(e);
          }}
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

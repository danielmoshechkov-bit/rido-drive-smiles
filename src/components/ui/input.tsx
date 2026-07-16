import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
        onKeyDown={(e) => {
          // Notacja naukowa ("e"/"E") w polach liczbowych nigdy nie jest tu
          // zamierzona — blokujemy globalnie (minus zostaje: bywa legalny).
          if (type === "number" && (e.key === "e" || e.key === "E")) {
            e.preventDefault()
            return
          }
          props.onKeyDown?.(e)
        }}
        onWheel={(e) => {
          // Pola liczbowe: scroll przy fokusie zmieniał wartość (natywny spin) —
          // groźne przy kwotach. Blur → scroll przewija stronę, nie kręci liczbą.
          if (type === "number") (e.currentTarget as HTMLInputElement).blur()
          props.onWheel?.(e)
        }}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

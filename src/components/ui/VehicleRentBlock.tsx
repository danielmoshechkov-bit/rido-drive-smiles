import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, Calendar } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

// VehicleRentBlock — GÓRA: "Wynajem: zł/tydz." | DÓŁ: kwota + data "Wynajęte od"
export function VehicleRentBlock({
  value,
  onChange,
  readOnly = false,
  className,
  assignedAt,
  onAssignedAtChange,
  userRole = "fleet",
}: {
  value: number | string | null | undefined;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  className?: string;
  assignedAt?: string | null;
  onAssignedAtChange?: (date: Date) => void;
  userRole?: "admin" | "fleet";
}) {
  const [buf, setBuf] = useState(
    value == null ? "" : String(value).replace(",", ".")
  );

  const commit = () => {
    if (!onChange) return;
    const n = Number(String(buf).replace(",", "."));
    if (!isNaN(n)) onChange(n);
  };

  return (
    <div className={`flex flex-col gap-1 ${className || ""}`}>
      {/* Górny pasek z etykietą (wspólny rząd z innymi polami) */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground font-medium">Wynajem:</span>
        <span className="text-muted-foreground">zł/tydz.</span>
        {!readOnly && <ChevronDown className="h-3 w-3 text-primary" />}
      </div>

      {/* Rząd z kwotą i datą wynajmu */}
      <div className="flex items-center gap-4">
        {/* POD spodem: kwota (edytowalna lub tylko do odczytu) */}
        {readOnly ? (
          <span className="font-semibold text-primary">
            {value == null || value === ""
              ? "—"
              : Number(value).toLocaleString("pl-PL")}
          </span>
        ) : (
          <Input
            inputMode="decimal"
            value={buf}
            onChange={(e) => setBuf(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="h-9 w-32 font-semibold"
            placeholder="Wpisz kwotę"
          />
        )}

        {/* Data "Wynajęte od" - edytowalna dla admina, tylko widok dla fleet */}
        {assignedAt && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Wynajęte od:</span>
            {userRole === "admin" && onAssignedAtChange ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 hover:bg-accent"
                  >
                    <Calendar className="h-3 w-3" />
                    {format(new Date(assignedAt), "dd.MM.yyyy", { locale: pl })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={new Date(assignedAt)}
                    onSelect={(date) => date && onAssignedAtChange(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-xs font-medium">
                {format(new Date(assignedAt), "dd.MM.yyyy", { locale: pl })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
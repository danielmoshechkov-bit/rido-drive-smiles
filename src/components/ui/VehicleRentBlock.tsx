import React, { useState } from "react";
import { Input } from "@/components/ui/input";

// VehicleRentBlock — GÓRA: "Wynajem: zł/tydz." | DÓŁ: kwota
export function VehicleRentBlock({
  value,
  onChange,
  readOnly = false,
  className,
}: {
  value: number | string | null | undefined;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  className?: string;
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
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-medium">Wynajem:</span>
        <span className="text-muted-foreground">zł/tydz.</span>
      </div>

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
    </div>
  );
}
// ===================================================================
// File: src/ridoUiPack.tsx
// RIDO UI PACK v3 – TabsPill + DriverHeaderActions + LeasedCarCard + Rent + Modal
// ===================================================================

import * as React from "react";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ---------------------------------------------------------------
   Auto-inject drobnych styli (scrollbar off do tabsów)
---------------------------------------------------------------- */
(function injectRidoStyles(){
  if (typeof document === "undefined") return;
  const id = "rido-ui-pack-styles";
  if (document.getElementById(id)) return;
  const css = `
    .no-scrollbar::-webkit-scrollbar{display:none}
    .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
  `;
  const tag = document.createElement("style");
  tag.id = id;
  tag.appendChild(document.createTextNode(css));
  document.head.appendChild(tag);
})();

/* ---------------------------------------------------------------
   1) TabsPill – pasek zakładek (stabilny, aktywna biała)
---------------------------------------------------------------- */
export function TabsPill(props: React.ComponentProps<typeof Tabs>) {
  return (
    <Tabs {...props}>
      <div className="rounded-[9999px] bg-[#6C3CF0] p-[2px] shadow-[0_8px_30px_rgba(108,60,240,0.18)]">
        <TabsList
          className="
            flex w-full items-center gap-1 overflow-x-auto no-scrollbar
            rounded-[9999px] bg-[#F3F0FF] px-1 min-h-[44px]
          "
        >
          {React.Children.map(props.children as any, (child: any) => {
            if (child?.type?.displayName === "TabsTrigger") {
              return React.cloneElement(child, {
                className:
                  "px-5 h-10 flex items-center rounded-full text-sm whitespace-nowrap transition " +
                  "data-[state=active]:bg-white data-[state=active]:text-[#6C3CF0] " +
                  "hover:bg-white hover:text-[#6C3CF0] focus-visible:outline-none",
              });
            }
            return null;
          })}
        </TabsList>
      </div>

      {/* contenty */}
      {React.Children.toArray(props.children).filter(
        (c: any) => c?.type?.displayName === "TabsContent"
      )}
    </Tabs>
  );
}
TabsPill.displayName = "TabsPill";

/* ---------------------------------------------------------------
   2) DriverHeaderActions – lewy górny guzik „+ Dodaj pojazd"
   Użycie: wstaw pod paskiem zakładek (ten sam rząd/linia).
---------------------------------------------------------------- */
export function DriverHeaderActions({
  onAddVehicle,
  className,
}: {
  onAddVehicle: () => void;
  className?: string;
}) {
  return (
    <div className={["flex items-center", className || ""].join(" ")}>
      <Button
        onClick={onAddVehicle}
        className="rounded-2xl shadow-[0_10px_30px_rgba(108,60,240,0.18)]"
      >
        + Dodaj pojazd
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------
   3) VehicleRentBlock – „Wynajem: zł/tydz." (góra) + kwota (dół)
---------------------------------------------------------------- */
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
    <div className={["flex flex-col gap-1", className || ""].join(" ")}>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-medium">Wynajem:</span>
        <span className="text-muted-foreground">zł/tydz.</span>
      </div>
      {readOnly ? (
        <span className="font-semibold text-[#6C3CF0]">
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

/* ---------------------------------------------------------------
   4) LeasedCarCard – karta auta (układ jak na screenie)
      Prawy panel „Flota:" – nagłówek jak „Zaloguj się"
      + poniżej NIP / Adres / Osoba kontaktowa / Telefon
---------------------------------------------------------------- */
type FleetInfo = {
  name?: string | null;
  nip?: string | null;
  address?: string | null;
  contact_name?: string | null;
  phone?: string | null;
};
export function LeasedCarCard({
  vehicle,
  assignment,
  fleet,
  readOnlyRent = true,
}: {
  vehicle: any;
  assignment?: any;
  fleet?: FleetInfo;
  readOnlyRent?: boolean;
}) {
  return (
    <div
      className="
        rounded-2xl border border-[#E9E5FF] bg-white
        shadow-[0_8px_30px_rgba(108,60,240,0.08)] p-6
      "
    >
      <div className="grid grid-cols-12 gap-6">
        {/* LEWA */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="text-[#6C3CF0]">🚗</span>
            Wynajęte auto
          </div>

          <h3 className="text-3xl font-extrabold mt-2 tracking-tight">
            {vehicle.brand} {vehicle.model}
          </h3>
          <div className="text-2xl font-bold text-[#6C3CF0]">{vehicle.plate}</div>

          <div className="mt-4 grid grid-cols-12 gap-y-2">
            <div className="col-span-6 text-muted-foreground">Rok produkcji:</div>
            <div className="col-span-6">{vehicle.year || "—"}</div>

            <div className="col-span-6 text-muted-foreground">Kolor:</div>
            <div className="col-span-6">{vehicle.color || "—"}</div>

            <div className="col-span-12 mt-2">
              <VehicleRentBlock
                value={vehicle.weekly_rent || 0}
                readOnly={readOnlyRent}
              />
            </div>
          </div>

          <hr className="my-5" />
          <div className="text-muted-foreground">VIN:</div>
          <div className="font-mono text-[15px]">{vehicle.vin || "—"}</div>
        </div>

        {/* PRAWA */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* Nagłówek w stylu „Zaloguj się" (krótszy fioletowy pasek) */}
          <div className="rounded-2xl border border-[#E9E5FF] p-0 overflow-hidden">
            <div className="bg-[#6C3CF0] text-white px-5 py-3 font-semibold">
              Flota: <span className="font-extrabold ml-1">{fleet?.name || "—"}</span>
            </div>
            <div className="bg-[#F8F7FF] p-4 space-y-2">
              <InfoRow label="NIP" value={fleet?.nip} />
              <InfoRow label="Adres" value={fleet?.address} />
              <InfoRow label="Osoba kontaktowa" value={fleet?.contact_name} />
              <InfoRow label="Telefon" value={fleet?.phone} />
            </div>
          </div>

          <div className="rounded-2xl bg-[#F6F3FF] p-4 border border-[#E9E5FF]">
            <div className="text-muted-foreground">Od kiedy korzystasz z auta:</div>
            <div className="font-semibold text-lg">
              {assignment?.start_date
                ? new Date(assignment.start_date).toLocaleDateString("pl-PL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-5 gap-2 text-[15px]">
      <div className="col-span-2 text-muted-foreground">{label}:</div>
      <div className="col-span-3 font-medium">{value || "—"}</div>
    </div>
  );
}

/* ---------------------------------------------------------------
   5) AddOwnCarModal – kierowca dodaje auto (bez pola Flota)
---------------------------------------------------------------- */
export function AddOwnCarModal({
  open,
  onClose,
  driverId,
}: {
  open: boolean;
  onClose: () => void;
  driverId: string;
}) {
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [color, setColor] = useState("");

  const save = async () => {
    if (!plate || !brand || !model) {
      toast.error("Uzupełnij: nr rejestracyjny, marka, model");
      return;
    }
    const payload: any = {
      plate: plate.toUpperCase().trim(),
      vin: vin.toUpperCase().trim() || null,
      brand: brand.trim(),
      model: model.trim(),
      year: year || null,
      color: color || null,
      status: "aktywne",
    };
    const { data: veh, error: e1 } = await supabase
      .from("vehicles")
      .insert(payload)
      .select("id")
      .single();
    if (e1) {
      toast.error("Błąd dodawania pojazdu");
      return;
    }
    const today = new Date().toISOString();
    await supabase
      .from("driver_vehicle_assignments")
      .insert({ driver_id: driverId, vehicle_id: veh!.id, assigned_at: today });
    toast.success("Pojazd dodany");
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 z-[70] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Dodaj pojazd</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <LabeledInput label="Nr rejestracyjny *">
            <Input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="NP. WX1234A"
            />
          </LabeledInput>
          <LabeledInput label="VIN">
            <Input
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="17 ZNAKÓW"
            />
          </LabeledInput>
          <LabeledInput label="Marka *">
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="np. Toyota"
            />
          </LabeledInput>
          <LabeledInput label="Model *">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="np. Auris"
            />
          </LabeledInput>
          <LabeledInput label="Rok">
            <Input
              value={year}
              onChange={(e) => setYear(e.target.value as any)}
              placeholder="np. 2018"
            />
          </LabeledInput>
          <LabeledInput label="Kolor">
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="np. Biały"
            />
          </LabeledInput>
          <div className="md:col-span-2 flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button onClick={save}>Zapisz pojazd</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function LabeledInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------
   6) useDriverId – pomocnik user->driver_id
---------------------------------------------------------------- */
export function useDriverId() {
  const [driverId, setDriverId] = useState<string>("");
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return;
      const { data } = await supabase
        .from("driver_app_users")
        .select("driver_id")
        .eq("user_id", user.id)
        .single();
      setDriverId(data?.driver_id || "");
    })();
  }, []);
  return driverId;
}
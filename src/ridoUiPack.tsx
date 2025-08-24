// ===================================================================
// File: src/ridoUiPack.tsx
// RIDO UI PACK v2 – wszystko w jednym pliku (Tabs + Rent + Cards + Modal)
// - Nie trzeba edytować innych plików CSS: style są wstrzykiwane poniżej.
// - Po dodaniu: importuj z "@/ridoUiPack" tam, gdzie potrzebujesz.
// ===================================================================

import * as React from "react";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExpiryBadges } from "@/components/ExpiryBadges";

/* ---------------------------------------------------------------
   0) Minimalne style globalne (auto-inject; nic nie dopisujesz)
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
   1) TabsPill – pasek zakładek (stała wysokość, hover/active ok)
   UŻYCIE:
     <TabsPill value={tab} onValueChange={setTab}>
       <TabsTrigger value="weekly">Rozliczenie tygodniowe</TabsTrigger>
       <TabsContent value="weekly">...</TabsContent>
       ...
     </TabsPill>
---------------------------------------------------------------- */
export function TabsPill(props: React.ComponentProps<typeof Tabs>) {
  return (
    <Tabs {...props}>
      <div className="rounded-[9999px] bg-[#6C3CF0] p-1 shadow-[0_8px_30px_rgba(108,60,240,0.18)]">
        <TabsList
          className="
            flex w-full items-center gap-1 overflow-x-auto no-scrollbar
            rounded-[9999px] bg-[#6C3CF0] px-1
            min-h-[44px]
          "
        >
          {React.Children.map(props.children as any, (child: any) => {
            if (child?.type?.displayName === "TabsTrigger") {
              return React.cloneElement(child, {
                className:
                  "px-5 h-10 flex items-center rounded-full text-sm whitespace-nowrap transition text-white " +
                  "data-[state=active]:bg-white data-[state=active]:text-[#6C3CF0] data-[state=active]:font-semibold " +
                  "hover:bg-white/20 focus-visible:outline-none",
              });
            }
            return null;
          })}
        </TabsList>
      </div>

      {/* treści zakładek */}
      {React.Children.toArray(props.children).filter(
        (c: any) => c?.type?.displayName === "TabsContent"
      )}
    </Tabs>
  );
}
TabsPill.displayName = "TabsPill";

/* ---------------------------------------------------------------
   2) VehicleRentBlock – „Wynajem: zł/tydz." (góra) + kwota (dół)
   WYMAGANIE: etykieta w jednym rzędzie z innymi polami,
   a POD spodem edytowalna/tylko-do-odczytu kwota.
   ADMIN:
     <VehicleRentBlock value={vehicle.weekly_rent}
                       onChange={(n)=>updateRent(vehicle.id,n)} />
   DRIVER (podgląd):
     <VehicleRentBlock value={vehicle.weekly_rent} readOnly />
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
      {/* rząd etykiety – idzie razem z innymi polami w nagłówku karty */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-medium">Wynajem:</span>
        <span className="text-muted-foreground">zł/tydz.</span>
      </div>
      {/* kwota pod spodem */}
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
   3) LeasedCarCard – karta auta kierowcy:
      • równe kolumny (Rok/Kolor),
      • mniejsze odstępy,
      • ramka i glow jak przy „Zaloguj się",
      • „Wynajem: zł/tydz." u góry + kwota pod spodem.
   UŻYCIE:
     <LeasedCarCard vehicle={vehicle} assignment={assign} fleet={fleet} readOnlyRent />
---------------------------------------------------------------- */
export function LeasedCarCard({
  vehicle,
  assignment,
  fleet,
  readOnlyRent = true,
}: {
  vehicle: any;
  assignment?: any;
  fleet?: any;
  readOnlyRent?: boolean;
}) {
  if (!vehicle) {
    return (
      <div
        className="
          rounded-2xl border border-[#E9E5FF] bg-white
          shadow-[0_8px_30px_rgba(108,60,240,0.08)]
          p-6 text-center
        "
      >
        <div className="text-muted-foreground py-8">
          <span className="text-4xl block mb-4">🚗</span>
          <p className="text-lg">Brak przypisanego pojazdu</p>
          <p className="text-sm mt-2">Skontaktuj się z administratorem</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="
        rounded-2xl border border-[#E9E5FF] bg-white
        shadow-[0_8px_30px_rgba(108,60,240,0.08)]
        p-6
      "
    >
      <div className="grid grid-cols-12 gap-6">
        {/* lewa część */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="text-[#6C3CF0]">🚗</span>
            Wynajęte auto
          </div>

          <h3 className="text-3xl font-extrabold mt-2 tracking-tight">
            {vehicle.brand} {vehicle.model}
          </h3>
          <div className="text-2xl font-bold text-[#6C3CF0]">{vehicle.plate}</div>

          {/* OC i Przegląd */}
          {vehicle.id && (
            <div className="mt-3">
              <ExpiryBadges vehicleId={vehicle.id} />
            </div>
          )}

          {/* bardziej zwarte rozmieszczenie */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="text-muted-foreground">Rok produkcji:</div>
            <div className="font-medium">{vehicle.year || "—"}</div>
            <div className="text-muted-foreground">Kolor:</div>
            <div className="font-medium">{vehicle.color || "—"}</div>
          </div>

          {/* „Wynajem" – etykieta w rzędzie, kwota pod spodem */}
          <div className="mt-4">
            <VehicleRentBlock
              value={vehicle.weekly_rental_fee || 0}
              readOnly={readOnlyRent}
            />
          </div>

          {vehicle.vin && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-muted-foreground text-sm">VIN:</div>
              <div className="font-mono text-sm">{vehicle.vin}</div>
            </div>
          )}
        </div>

        {/* prawa część */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* Flota - nazwa obok, dane pod spodem */}
          <div className="rounded-2xl border border-[#E9E5FF] p-0 overflow-hidden">
            <div className="bg-[#6C3CF0] text-white px-4 py-3 font-semibold">
              Flota: <span className="font-extrabold">{fleet?.name || "—"}</span>
            </div>
            {fleet && (
              <div className="bg-[#F8F7FF] p-4 space-y-2 text-sm">
                {fleet.nip && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-muted-foreground">NIP:</div>
                    <div className="col-span-2 font-medium">{fleet.nip}</div>
                  </div>
                )}
                {(fleet.city || fleet.postal_code || fleet.street || fleet.house_number) && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-muted-foreground">Adres:</div>
                    <div className="col-span-2 font-medium">
                      {[fleet.street, fleet.house_number].filter(Boolean).join(" ")}<br/>
                      {[fleet.postal_code, fleet.city].filter(Boolean).join(" ")}
                    </div>
                  </div>
                )}
                {fleet.contact_name && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-muted-foreground">Kontakt:</div>
                    <div className="col-span-2 font-medium">{fleet.contact_name}</div>
                  </div>
                )}
                {fleet.contact_phone_for_drivers && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-muted-foreground">Tel. dla kierowcy:</div>
                    <div className="col-span-2 font-medium">{fleet.contact_phone_for_drivers}</div>
                  </div>
                )}
                {fleet.owner_name && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-muted-foreground">Właściciel:</div>
                    <div className="col-span-2 font-medium">{fleet.owner_name}</div>
                  </div>
                )}
                {fleet.owner_phone && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-muted-foreground">Tel. właściciela:</div>
                    <div className="col-span-2 font-medium">{fleet.owner_phone}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Data przypisania */}
          <div className="rounded-2xl bg-[#F6F3FF] p-4 border border-[#E9E5FF]">
            <div className="text-muted-foreground text-sm">Od kiedy korzystasz z auta:</div>
            <div className="font-semibold text-lg">
              {assignment?.assigned_at
                ? new Date(assignment.assigned_at).toLocaleDateString("pl-PL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </div>
            {assignment?.unassigned_at && (
              <>
                <div className="text-muted-foreground text-sm mt-2">Do kiedy:</div>
                <div className="font-semibold">
                  {new Date(assignment.unassigned_at).toLocaleDateString("pl-PL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   4) AddOwnCarModal – kierowca dodaje auto (bez pola Flota)
   UŻYCIE:
     const [open,setOpen]=useState(false);
     const driverId = useDriverId();
     <Button onClick={()=>setOpen(true)}>+ Dodaj pojazd</Button>
     {open && <AddOwnCarModal open={open} onClose={()=>setOpen(false)} driverId={driverId} />}
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
          <div>
            <label className="text-sm text-muted-foreground">Nr rejestracyjny *</label>
            <Input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="NP. WX1234A"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">VIN</label>
            <Input
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="17 ZNAKÓW"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Marka *</label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="np. Toyota"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Model *</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="np. Auris"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Rok</label>
            <Input
              value={year}
              onChange={(e) => setYear(e.target.value as any)}
              placeholder="np. 2018"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Kolor</label>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="np. Biały"
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={onClose}>Anuluj</Button>
            <Button onClick={save}>Zapisz pojazd</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------
   5) useDriverId – pomocnik do mapowania user -> driver_id
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
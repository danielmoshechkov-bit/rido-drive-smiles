import { useState } from "react";
import { UniversalSubTabBar } from "@/components/UniversalSubTabBar";
import { FleetPaymentNotifications } from "./FleetPaymentNotifications";
import { RentalPaymentReminders } from "./RentalPaymentReminders";
import { FleetOwnerPayments } from "./FleetOwnerPayments";

const PAYMENT_TABS = [
  { value: "nam-winni", label: "Nam winni" },
  { value: "my-winni", label: "My winni" },
];

interface PaymentSubTabsProps {
  fleetId: string;
}

export function PaymentSubTabs({ fleetId }: PaymentSubTabsProps) {
  const [activeTab, setActiveTab] = useState("nam-winni");

  return (
    <div className="space-y-6">
      <UniversalSubTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={PAYMENT_TABS}
      />

      {activeTab === "nam-winni" && (
        <div className="space-y-6">
          <FleetPaymentNotifications fleetId={fleetId} />
          <RentalPaymentReminders fleetId={fleetId} />
        </div>
      )}

      {activeTab === "my-winni" && (
        <FleetOwnerPayments fleetId={fleetId} />
      )}
    </div>
  );
}

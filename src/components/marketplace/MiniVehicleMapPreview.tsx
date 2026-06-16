import { MiniMapPreview } from "@/components/realestate/MiniMapPreview";

interface MiniVehicleMapPreviewProps {
  listings: Array<{ lat?: number; lng?: number; price?: number; transactionType?: string }>;
  onClick: () => void;
  className?: string;
}

/**
 * Mini map preview for vehicle marketplace (sidebar / list teaser).
 * Thin wrapper around the shared MiniMapPreview — same marker/cluster style,
 * no drawing tools. Click opens the full vehicle map.
 */
export function MiniVehicleMapPreview({ listings, onClick, className }: MiniVehicleMapPreviewProps) {
  return <MiniMapPreview listings={listings} onClick={onClick} className={className} />;
}

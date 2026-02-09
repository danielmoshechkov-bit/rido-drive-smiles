import { HelpButton } from "./HelpButton";
import { HelpPanel } from "./HelpPanel";
import { TourOverlay } from "./TourOverlay";

export function OnboardingWidget() {
  return (
    <>
      <HelpButton />
      <HelpPanel />
      <TourOverlay />
    </>
  );
}

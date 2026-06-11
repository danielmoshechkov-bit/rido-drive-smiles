// Custom Google Maps OverlayView factory.
// Extracted from src/components/realestate/FullscreenMapView.tsx so price/cluster
// markers built from arbitrary HTML can be reused by the vehicle map view.
//
// Google Maps' OverlayView is only defined once the JS API has loaded, so the
// class has to be created lazily — hence a factory that takes the loaded
// `google` namespace rather than a top-level `class extends`.

import type { LatLng } from "./geometry";

export interface CustomOverlayInstance {
  setMap(map: google.maps.Map | null): void;
}

export type CustomOverlayClass = new (
  position: LatLng,
  content: HTMLElement,
  map: google.maps.Map,
  onClick: () => void,
) => google.maps.OverlayView & CustomOverlayInstance;

export interface CreateOverlayOptions {
  /**
   * Pane to attach the overlay to. `floatPane` (default) sits above markers and
   * receives pointer events — right for clickable price/cluster pins.
   */
  pane?: keyof google.maps.MapPanes;
  /**
   * Optional guard evaluated on each click; return true to swallow the click
   * (e.g. to suppress a marker click that lands right after a drawing gesture).
   */
  shouldSuppressClick?: () => boolean;
}

/**
 * Build a CustomOverlay class bound to the loaded `google` namespace.
 *
 * Each instance renders `content` (any HTMLElement — typically a price tag or a
 * cluster bubble) anchored at `position`, and invokes `onClick` when clicked.
 */
export function createCustomOverlayClass(
  googleNs: typeof google,
  options: CreateOverlayOptions = {},
): CustomOverlayClass {
  const pane = options.pane ?? "floatPane";
  const shouldSuppressClick = options.shouldSuppressClick;

  return class CustomOverlay extends googleNs.maps.OverlayView {
    private pos: google.maps.LatLng;
    private div: HTMLDivElement;
    private handler: () => void;

    constructor(position: LatLng, content: HTMLElement, map: google.maps.Map, onClick: () => void) {
      super();
      this.pos = new googleNs.maps.LatLng(position.lat, position.lng);
      this.handler = () => {
        if (shouldSuppressClick?.()) return;
        onClick();
      };
      this.div = document.createElement("div");
      this.div.style.position = "absolute";
      this.div.appendChild(content);
      this.div.addEventListener("click", this.handler);
      this.setMap(map);
    }

    onAdd() {
      const panes = this.getPanes();
      panes?.[pane].appendChild(this.div);
    }

    draw() {
      const projection = this.getProjection();
      const pt = projection?.fromLatLngToDivPixel(this.pos);
      if (pt) {
        this.div.style.left = `${pt.x}px`;
        this.div.style.top = `${pt.y}px`;
      }
    }

    onRemove() {
      this.div.removeEventListener("click", this.handler);
      this.div.parentNode?.removeChild(this.div);
    }
  };
}

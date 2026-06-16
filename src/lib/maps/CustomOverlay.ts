// Shared Google Maps custom overlay.
//
// A lightweight `OverlayView` that pins an arbitrary HTMLElement at a lat/lng and
// fires `onClick` when tapped. Used to render price-tag / cluster markers as DOM
// (cheaper and far more styleable than `google.maps.Marker`). Factory form because
// `google.maps.OverlayView` only exists after the Maps JS API has loaded.

import type { LatLngLiteral } from "./geometry";

export interface CustomOverlayOptions {
  /**
   * Optional guard called before firing `onClick`. Return `true` to swallow the
   * click — e.g. right after finishing a freehand drawing, to stop the gesture's
   * mouseup from "clicking through" onto a marker underneath.
   */
  shouldSuppressClick?: () => boolean;
}

export interface CustomOverlayInstance {
  setMap(map: google.maps.Map | null): void;
}

export type CustomOverlayClass = new (
  position: LatLngLiteral,
  content: HTMLElement,
  map: google.maps.Map,
  onClick: () => void,
) => CustomOverlayInstance;

/**
 * Build a `CustomOverlay` class bound to a loaded `google` namespace.
 * Returns a constructor `new Overlay(pos, contentEl, map, onClick)`.
 */
export function createCustomOverlayClass(
  google: typeof window.google,
  options: CustomOverlayOptions = {},
): CustomOverlayClass {
  const { shouldSuppressClick } = options;

  return class CustomOverlay extends google.maps.OverlayView {
    private pos: google.maps.LatLng;
    private div: HTMLDivElement;
    private handler: () => void;

    constructor(
      p: LatLngLiteral,
      content: HTMLElement,
      map: google.maps.Map,
      onClick: () => void,
    ) {
      super();
      this.pos = new google.maps.LatLng(p.lat, p.lng);
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
      this.getPanes()?.floatPane.appendChild(this.div);
    }

    draw() {
      const pt = this.getProjection().fromLatLngToDivPixel(this.pos);
      if (pt) {
        this.div.style.left = pt.x + "px";
        this.div.style.top = pt.y + "px";
      }
    }

    onRemove() {
      this.div.removeEventListener("click", this.handler);
      this.div.parentNode?.removeChild(this.div);
    }
  };
}

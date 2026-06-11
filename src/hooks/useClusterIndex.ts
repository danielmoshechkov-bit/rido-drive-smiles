// Supercluster wrapper hook.
// Extracted from the duplicated supercluster setup in
// src/components/realestate/FullscreenMapView.tsx and MiniMapPreview.tsx so the
// real-estate and vehicle map views share one indexing path.

import { useEffect, useMemo, useRef } from "react";
import Supercluster from "supercluster";

export interface ClusterableItem {
  lat?: number | null;
  lng?: number | null;
}

export interface UseClusterIndexOptions {
  /** Cluster radius in pixels (Supercluster default 40). FullscreenMap used 40, MiniMap 80. */
  radius?: number;
  maxZoom?: number;
  minZoom?: number;
}

export interface ClusterBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// A cluster feature carries `cluster: true` + `point_count`; a leaf carries our payload.
export type ClusterFeature<T> = Supercluster.PointFeature<
  ({ cluster?: false; item: T } | Supercluster.ClusterProperties)
>;

export interface UseClusterIndexResult<T> {
  /** Mutable ref to the live index (null when there are no positioned items). */
  indexRef: React.MutableRefObject<Supercluster | null>;
  /** Clusters/leaves within `bounds` at the given (integer) zoom. */
  getClusters: (bounds: ClusterBounds, zoom: number) => ClusterFeature<T>[];
  /** Zoom at which a given cluster id expands. */
  getClusterExpansionZoom: (clusterId: number) => number;
}

/**
 * Index `items` with Supercluster, keyed by each item's lat/lng. Items without
 * coordinates are dropped. The original item is preserved under
 * `feature.properties.item` for leaf features.
 */
export function useClusterIndex<T extends ClusterableItem>(
  items: T[],
  options: UseClusterIndexOptions = {},
): UseClusterIndexResult<T> {
  const { radius = 40, maxZoom = 20, minZoom = 3 } = options;
  const indexRef = useRef<Supercluster | null>(null);

  useEffect(() => {
    const withCoords = items.filter((l) => l.lat != null && l.lng != null);
    if (!withCoords.length) {
      indexRef.current = null;
      return;
    }
    const index = new Supercluster({ radius, maxZoom, minZoom });
    index.load(
      withCoords.map((item) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [item.lng as number, item.lat as number] },
        properties: { item },
      })),
    );
    indexRef.current = index;
  }, [items, radius, maxZoom, minZoom]);

  return useMemo<UseClusterIndexResult<T>>(() => ({
    indexRef,
    getClusters: (bounds, zoom) => {
      const index = indexRef.current;
      if (!index) return [];
      return index.getClusters(
        [bounds.west, bounds.south, bounds.east, bounds.north],
        Math.floor(zoom),
      ) as ClusterFeature<T>[];
    },
    getClusterExpansionZoom: (clusterId) => {
      const index = indexRef.current;
      if (!index) return maxZoom;
      return index.getClusterExpansionZoom(clusterId);
    },
  }), [maxZoom]);
}

// Shared Supercluster index hook.
//
// Builds a `Supercluster` index from any list of items that expose a lat/lng, and
// keeps it in a ref (Supercluster instances aren't React state — markers are drawn
// imperatively on map `idle`). Returns the ref plus a monotonically increasing
// `version` so callers can re-run their marker drawing when the index is rebuilt.
//
// Used by the fullscreen map views (real-estate, marketplace) so each portal only
// describes how to read coordinates and what payload to attach to a point.

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import Supercluster from "supercluster";

export interface ClusterIndexOptions {
  /** Cluster radius in pixels (default 40). */
  radius?: number;
  /** Max zoom to cluster at (default 20). */
  maxZoom?: number;
  /** Min zoom to cluster at (default 3). */
  minZoom?: number;
}

export interface UseClusterIndexResult<T> {
  /** The current index, or null when there is nothing to cluster. */
  indexRef: MutableRefObject<Supercluster<{ item: T }> | null>;
  /** Increments every time the index is rebuilt; use as an effect dependency. */
  version: number;
}

/**
 * @param items     Source records.
 * @param getCoords Returns `[lng, lat]` for an item, or `null` to skip it.
 */
export function useClusterIndex<T>(
  items: T[],
  getCoords: (item: T) => [number, number] | null,
  options: ClusterIndexOptions = {},
): UseClusterIndexResult<T> {
  const { radius = 40, maxZoom = 20, minZoom = 3 } = options;
  const indexRef = useRef<Supercluster<{ item: T }> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const features = items
      .map((item) => {
        const coords = getCoords(item);
        if (!coords) return null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: coords },
          properties: { item },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    if (!features.length) {
      indexRef.current = null;
      setVersion((v) => v + 1);
      return;
    }

    const index = new Supercluster<{ item: T }>({ radius, maxZoom, minZoom });
    index.load(features);
    indexRef.current = index;
    setVersion((v) => v + 1);
    // getCoords is expected to be stable (defined inline is fine — items identity drives rebuilds).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, radius, maxZoom, minZoom]);

  return { indexRef, version };
}

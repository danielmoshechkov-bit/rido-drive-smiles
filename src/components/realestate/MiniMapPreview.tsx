import { useRef, useEffect, useCallback } from "react";
import Supercluster from "supercluster";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { Loader2, MapPin } from "lucide-react";

interface MiniMapPreviewProps {
  listings: Array<{ lat?: number; lng?: number; price?: number; transactionType?: string }>;
  onClick: () => void;
  className?: string;
}

export function MiniMapPreview({ listings, onClick, className }: MiniMapPreviewProps) {
  const { isLoaded, google, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<any[]>([]);
  const clusterRef = useRef<Supercluster | null>(null);

  // Build supercluster
  useEffect(() => {
    const withCoords = listings.filter(l => l.lat && l.lng);
    if (!withCoords.length) { clusterRef.current = null; return; }
    const idx = new Supercluster({ radius: 80, maxZoom: 14, minZoom: 3 });
    idx.load(withCoords.map(l => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [l.lng!, l.lat!] },
      properties: { price: l.price, transactionType: l.transactionType },
    })));
    clusterRef.current = idx;
  }, [listings]);

  const updateMarkers = useCallback(() => {
    if (!mapRef.current || !google || !clusterRef.current) return;
    const map = mapRef.current;
    overlaysRef.current.forEach(o => o.setMap?.(null));
    overlaysRef.current = [];

    const bounds = map.getBounds();
    if (!bounds) return;
    const zoom = map.getZoom() ?? 10;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const clusters = clusterRef.current.getClusters(
      [sw.lng(), sw.lat(), ne.lng(), ne.lat()],
      Math.floor(zoom)
    );

    clusters.forEach(cluster => {
      const [lng, lat] = cluster.geometry.coordinates;
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        icon: cluster.properties.cluster ? {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#7c3aed',
          fillOpacity: 0.9,
          strokeColor: '#fff',
          strokeWeight: 2,
        } : {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#10b981',
          fillOpacity: 0.9,
          strokeColor: '#fff',
          strokeWeight: 1,
        },
        clickable: false,
      });
      overlaysRef.current.push(marker);
    });
  }, [google]);

  useEffect(() => {
    if (!isLoaded || !google) return;
    const container = containerRef.current;
    if (!container) return;

    const timer = setTimeout(() => {
      if (container.offsetWidth < 50) return;

      const withCoords = listings.filter(l => l.lat && l.lng);
      let center = { lat: 52.2297, lng: 21.0122 };
      let zoom = 10;
      if (withCoords.length > 0) {
        const avgLat = withCoords.reduce((s, l) => s + l.lat!, 0) / withCoords.length;
        const avgLng = withCoords.reduce((s, l) => s + l.lng!, 0) / withCoords.length;
        center = { lat: avgLat, lng: avgLng };
      }

      const map = new google.maps.Map(container, {
        center,
        zoom,
        disableDefaultUI: true,
        gestureHandling: 'none',
        clickableIcons: false,
        draggable: false,
        zoomControl: false,
      });

      mapRef.current = map;

      map.addListener('idle', updateMarkers);
    }, 200);

    return () => {
      clearTimeout(timer);
      overlaysRef.current.forEach(o => o.setMap?.(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [isLoaded, google, listings]);

  return (
    <div 
      className={`relative rounded-xl overflow-hidden border cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all ${className || ''}`}
      onClick={onClick}
    >
      {!isLoaded || error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          {error ? (
            <div className="px-4 text-center">
              <p className="text-sm font-medium text-foreground">Mapa chwilowo niedostępna</p>
              <p className="text-xs text-muted-foreground mt-1">Kliknij, aby otworzyć widok mapy z listą wyników</p>
            </div>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>
      ) : (
        <div ref={containerRef} className="absolute inset-0" />
      )}
      {/* Overlay label */}
      <div className="absolute bottom-2 left-2 right-2 z-10">
        <div className="bg-background/90 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">Kliknij, aby otworzyć mapę</span>
        </div>
      </div>
    </div>
  );
}

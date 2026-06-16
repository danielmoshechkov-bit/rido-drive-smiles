// Slug helpers — kept in sync with the SQL `slugify()` / `build_vehicle_slug()`
// functions in supabase/migrations/20260616120000_vehicle_listings_slug.sql.
//
// The database trigger is the source of truth for the persisted `slug` column;
// these client helpers exist for building canonical URLs and optimistic navigation
// (e.g. linking to a listing right after creating it, before the row round-trips).

const POLISH_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

/** Lowercase, transliterate Polish letters, collapse everything else to single '-'. */
export function slugify(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => POLISH_MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

const idFragment = (id: string, length = 6): string =>
  id.replace(/-/g, "").slice(0, Math.max(length, 4));

/**
 * Build the canonical vehicle-listing slug: brand-model-year-city-<short-id>.
 * Mirrors `build_vehicle_slug` in SQL. Empty parts are dropped.
 */
export function buildVehicleSlug(params: {
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  city?: string | null;
  id: string;
}): string {
  const { brand, model, year, city, id } = params;
  return slugify(
    [brand, model, year ? String(year) : "", city, idFragment(id)]
      .filter(Boolean)
      .join("-"),
  );
}

/**
 * A slug may carry a leading numeric/uuid prefix in legacy links; this extracts the
 * id fragment trailing a vehicle slug (last dash-separated token) for fallback lookup.
 */
export function slugIdFragment(slug: string): string {
  const parts = slug.split("-");
  return parts[parts.length - 1] ?? "";
}

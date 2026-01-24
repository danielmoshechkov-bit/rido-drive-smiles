// Category cover images mapping
import warsztatCover from '@/assets/services/warsztat-cover.jpg';
import detailingCover from '@/assets/services/detailing-cover.jpg';
import sprzatanieCover from '@/assets/services/sprzatanie-cover.jpg';
import zlotaRaczkaCover from '@/assets/services/zlota-raczka-cover.jpg';
import hydraulikCover from '@/assets/services/hydraulik-cover.jpg';
import elektrykCover from '@/assets/services/elektryk-cover.jpg';
import ogrodnikCover from '@/assets/services/ogrodnik-cover.jpg';
import przeprowadzkiCover from '@/assets/services/przeprowadzki-cover.jpg';
import ppfCover from '@/assets/services/ppf-cover.jpg';
import projektanciCover from '@/assets/services/projektanci-cover.jpg';
import remontyCover from '@/assets/services/remonty-cover.jpg';
import budowlankaCover from '@/assets/services/budowlanka-cover.jpg';

export const serviceCategoryImages: Record<string, string> = {
  'warsztaty': warsztatCover,
  'detailing': detailingCover,
  'sprzatanie': sprzatanieCover,
  'zlota-raczka': zlotaRaczkaCover,
  'hydraulik': hydraulikCover,
  'elektryk': elektrykCover,
  'ogrodnik': ogrodnikCover,
  'przeprowadzki': przeprowadzkiCover,
  'ppf': ppfCover,
  'projektanci': projektanciCover,
  'remonty': remontyCover,
  'budowlanka': budowlankaCover,
};

export function getServiceCoverImage(categorySlug?: string): string {
  if (!categorySlug) return warsztatCover;
  return serviceCategoryImages[categorySlug] || warsztatCover;
}

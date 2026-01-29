// Category cover images mapping
import warsztatCover from '@/assets/services/warsztat-cover.jpg';
import warsztat2 from '@/assets/services/warsztat-2.jpg';
import warsztat3 from '@/assets/services/warsztat-3.jpg';
import detailingCover from '@/assets/services/detailing-cover.jpg';
import detailing2 from '@/assets/services/detailing-2.jpg';
import detailing3 from '@/assets/services/detailing-3.jpg';
import sprzatanieCover from '@/assets/services/sprzatanie-cover.jpg';
import sprzatanie2 from '@/assets/services/sprzatanie-2.jpg';
import sprzatanie3 from '@/assets/services/sprzatanie-3.jpg';
import zlotaRaczkaCover from '@/assets/services/zlota-raczka-cover.jpg';
import zlotaRaczka2 from '@/assets/services/zlota-raczka-2.jpg';
import zlotaRaczka3 from '@/assets/services/zlota-raczka-3.jpg';
import hydraulikCover from '@/assets/services/hydraulik-cover.jpg';
import hydraulik2 from '@/assets/services/hydraulik-2.jpg';
import hydraulik3 from '@/assets/services/hydraulik-3.jpg';
import elektrykCover from '@/assets/services/elektryk-cover.jpg';
import elektryk2 from '@/assets/services/elektryk-2.jpg';
import elektryk3 from '@/assets/services/elektryk-3.jpg';
import ogrodnikCover from '@/assets/services/ogrodnik-cover.jpg';
import ogrodnik2 from '@/assets/services/ogrodnik-2.jpg';
import ogrodnik3 from '@/assets/services/ogrodnik-3.jpg';
import przeprowadzkiCover from '@/assets/services/przeprowadzki-cover.jpg';
import przeprowadzki2 from '@/assets/services/przeprowadzki-2.jpg';
import przeprowadzki3 from '@/assets/services/przeprowadzki-3.jpg';
import ppfCover from '@/assets/services/ppf-cover.jpg';
import ppf2 from '@/assets/services/ppf-2.jpg';
import ppf3 from '@/assets/services/ppf-3.jpg';
import projektanciCover from '@/assets/services/projektanci-cover.jpg';
import projektanci2 from '@/assets/services/projektanci-2.jpg';
import projektanci3 from '@/assets/services/projektanci-3.jpg';
import remontyCover from '@/assets/services/remonty-cover.jpg';
import remonty2 from '@/assets/services/remonty-2.jpg';
import remonty3 from '@/assets/services/remonty-3.jpg';
import budowlankaCover from '@/assets/services/budowlanka-cover.jpg';
import budowlanka2 from '@/assets/services/budowlanka-2.jpg';
import budowlanka3 from '@/assets/services/budowlanka-3.jpg';

// Single cover image per category (for backwards compatibility)
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

// Gallery of 3 images per category for carousel/gallery display
export const serviceCategoryGallery: Record<string, string[]> = {
  'warsztaty': [warsztatCover, warsztat2, warsztat3],
  'detailing': [detailingCover, detailing2, detailing3],
  'sprzatanie': [sprzatanieCover, sprzatanie2, sprzatanie3],
  'zlota-raczka': [zlotaRaczkaCover, zlotaRaczka2, zlotaRaczka3],
  'hydraulik': [hydraulikCover, hydraulik2, hydraulik3],
  'elektryk': [elektrykCover, elektryk2, elektryk3],
  'ogrodnik': [ogrodnikCover, ogrodnik2, ogrodnik3],
  'przeprowadzki': [przeprowadzkiCover, przeprowadzki2, przeprowadzki3],
  'ppf': [ppfCover, ppf2, ppf3],
  'projektanci': [projektanciCover, projektanci2, projektanci3],
  'remonty': [remontyCover, remonty2, remonty3],
  'budowlanka': [budowlankaCover, budowlanka2, budowlanka3],
};

// Category ID to slug mapping (for API responses)
export const categoryIdToSlug: Record<string, string> = {
  '290bfdce-dac0-48d4-a950-1998e43fea5b': 'warsztaty',
  'a77413e6-020a-4857-b419-d858c4e0c97d': 'detailing',
  'f0c9cb8b-2417-428a-a8e4-155723dda76d': 'sprzatanie',
  '5ee501b0-0c91-4d35-8a10-5e91bbabaaae': 'zlota-raczka',
  '2a8804aa-f8db-4210-a840-0ef9799c1aed': 'hydraulik',
  'c31149db-3160-4680-9d15-0471065ff3c6': 'elektryk',
  'f6a90d92-aff7-4b38-9159-8554f05d4e67': 'ogrodnik',
  'd8aeaf01-993b-43e2-9caf-267b81298fbf': 'przeprowadzki',
  'ad442d6d-0908-4a1c-a6e9-1cf4cb7cf0da': 'ppf',
  '166b19d9-0364-4807-8da3-1b95868f1cba': 'projektanci',
  '7a4cf1f1-2a42-451d-ae29-3da8de5cfa67': 'remonty',
  '5991f591-30d0-44e1-84b2-c4a31cf55b8b': 'budowlanka',
};

export function getServiceCoverImage(categorySlug?: string): string {
  if (!categorySlug) return warsztatCover;
  return serviceCategoryImages[categorySlug] || warsztatCover;
}

export function getServiceGallery(categorySlug?: string): string[] {
  if (!categorySlug) return [warsztatCover];
  return serviceCategoryGallery[categorySlug] || [warsztatCover];
}

export function getServiceGalleryByCategoryId(categoryId?: string): string[] {
  if (!categoryId) return [warsztatCover];
  const slug = categoryIdToSlug[categoryId];
  if (!slug) return [warsztatCover];
  return serviceCategoryGallery[slug] || [warsztatCover];
}

// ASARI XML Parser for EbiuroV2 format

import {
  ASARI_FIELD_MAP,
  parseAmenities,
  normalizePrice,
  normalizeInt,
  normalizeCoordinate,
  mapTransactionType,
  mapPropertyType,
} from './dictionaries.ts';

export interface ParsedOffer {
  external_id: string;
  title: string | null;
  description: string | null;
  property_type: string;
  transaction_type: string;
  price: number | null;
  area: number | null;
  area_total: number | null;
  area_usable: number | null;
  area_plot: number | null;
  rooms: number | null;
  rooms_data: Array<{ name: string; area: number }>;
  floor: number | null;
  total_floors: number | null;
  build_year: number | null;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  has_balcony: boolean;
  has_garden: boolean;
  has_parking: boolean;
  has_elevator: boolean;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  video_url: string | null;
  virtual_tour_url: string | null;
  photos: string[];
  crm_agent_id: string | null;
  crm_agent_name: string | null;
  crm_raw_data: Record<string, unknown>;
}

export interface ParsedDeleteSection {
  signatures: string[];
}

// Parse single param element from ASARI XML
function parseParam(paramXml: string): { id: string; value: string } | null {
  const idMatch = paramXml.match(/id="(\d+)"/);
  const valueMatch = paramXml.match(/<value[^>]*>([\s\S]*?)<\/value>/i);
  
  if (!idMatch) return null;
  
  return {
    id: idMatch[1],
    value: valueMatch ? valueMatch[1].trim() : '',
  };
}

// Extract all params from offer XML
function extractParams(offerXml: string): Map<string, string> {
  const params = new Map<string, string>();
  
  // Match all <param> elements
  const paramMatches = offerXml.matchAll(/<param[^>]*>[\s\S]*?<\/param>/gi);
  
  for (const match of paramMatches) {
    const parsed = parseParam(match[0]);
    if (parsed) {
      params.set(parsed.id, parsed.value);
    }
  }
  
  return params;
}

// Extract photos from offer XML
function extractPhotos(offerXml: string): string[] {
  const photos: string[] = [];
  
  // Match <foto> or <photo> elements with URL
  const photoMatches = offerXml.matchAll(/<(?:foto|photo)[^>]*>[\s\S]*?<(?:url|src|path)[^>]*>([\s\S]*?)<\/(?:url|src|path)>[\s\S]*?<\/(?:foto|photo)>/gi);
  
  for (const match of photoMatches) {
    const url = match[1]?.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      photos.push(url);
    }
  }
  
  // Alternative format: <foto url="..."/>
  const altPhotoMatches = offerXml.matchAll(/<(?:foto|photo)[^>]*(?:url|src)="([^"]+)"[^>]*\/?>/gi);
  for (const match of altPhotoMatches) {
    const url = match[1]?.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      photos.push(url);
    }
  }
  
  // Also check for <pictures> section
  const picturesMatch = offerXml.match(/<pictures>([\s\S]*?)<\/pictures>/i);
  if (picturesMatch) {
    const pictureMatches = picturesMatch[1].matchAll(/<picture[^>]*>([\s\S]*?)<\/picture>/gi);
    for (const match of pictureMatches) {
      const url = match[1]?.trim();
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        photos.push(url);
      }
    }
  }
  
  return photos;
}

// Extract signature (offer ID) from offer XML
function extractSignature(offerXml: string): string | null {
  // Try <signature> element
  const sigMatch = offerXml.match(/<signature[^>]*>([\s\S]*?)<\/signature>/i);
  if (sigMatch) return sigMatch[1].trim();
  
  // Try signature attribute
  const attrMatch = offerXml.match(/signature="([^"]+)"/i);
  if (attrMatch) return attrMatch[1].trim();
  
  // Try <numer> element
  const numerMatch = offerXml.match(/<numer[^>]*>([\s\S]*?)<\/numer>/i);
  if (numerMatch) return numerMatch[1].trim();
  
  return null;
}

// Parse single offer from XML
export function parseOffer(offerXml: string): ParsedOffer | null {
  const signature = extractSignature(offerXml);
  if (!signature) {
    console.warn('Offer without signature, skipping');
    return null;
  }
  
  const params = extractParams(offerXml);
  const photos = extractPhotos(offerXml);
  
  // Build raw data for storage
  const rawData: Record<string, unknown> = {};
  params.forEach((value, key) => {
    rawData[`param_${key}`] = value;
  });
  
  // Parse amenities for boolean fields
  const amenitiesText = params.get('82') || '';
  const amenities = parseAmenities(amenitiesText);
  
  // Extract agent info
  const agentName = params.get('305') || null;
  const agentPhone = params.get('170') || null;
  const agentEmail = params.get('171') || null;
  
  // Build CRM agent ID (use email or name as identifier)
  const crmAgentId = agentEmail || agentName || null;
  
  return {
    external_id: signature,
    title: params.get('491') || `Oferta ${signature}`,
    description: params.get('64') || null,
    property_type: mapPropertyType(params.get('36')),
    transaction_type: mapTransactionType(params.get('43')),
    price: normalizePrice(params.get('10')),
    area: normalizePrice(params.get('58')),
    rooms: normalizeInt(params.get('79')),
    floor: normalizeInt(params.get('62')),
    total_floors: normalizeInt(params.get('63')),
    build_year: normalizeInt(params.get('71')),
    city: params.get('48') || null,
    district: params.get('49') || null,
    address: params.get('300') || null,
    latitude: normalizeCoordinate(params.get('201')),
    longitude: normalizeCoordinate(params.get('202')),
    has_balcony: amenities.has_balcony,
    has_garden: amenities.has_garden,
    has_parking: amenities.has_parking,
    has_elevator: amenities.has_elevator,
    contact_person: agentName,
    contact_phone: agentPhone,
    contact_email: agentEmail,
    video_url: params.get('496') || null,
    virtual_tour_url: params.get('497') || null,
    photos,
    crm_agent_id: crmAgentId,
    crm_agent_name: agentName,
    crm_raw_data: rawData,
  };
}

// Parse all offers from XML content
export function parseOffers(xmlContent: string): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  
  // Match all <offer> or <oferta> elements
  const offerMatches = xmlContent.matchAll(/<(?:offer|oferta)[^>]*>[\s\S]*?<\/(?:offer|oferta)>/gi);
  
  for (const match of offerMatches) {
    const parsed = parseOffer(match[0]);
    if (parsed) {
      offers.push(parsed);
    }
  }
  
  return offers;
}

// Parse DELETE section from XML
export function parseDeleteSection(xmlContent: string): ParsedDeleteSection {
  const signatures: string[] = [];
  
  // Find DELETE section
  const deleteMatch = xmlContent.match(/<DELETE[^>]*>([\s\S]*?)<\/DELETE>/i);
  if (!deleteMatch) {
    return { signatures };
  }
  
  const deleteContent = deleteMatch[1];
  
  // Extract signatures from <offers> section
  const sigMatches = deleteContent.matchAll(/<signature[^>]*>([\s\S]*?)<\/signature>/gi);
  for (const match of sigMatches) {
    const sig = match[1]?.trim();
    if (sig) {
      signatures.push(sig);
    }
  }
  
  return { signatures };
}

// Sanitize text content (remove CDATA, decode entities)
export function sanitizeText(text: string | null): string | null {
  if (!text) return null;
  
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, '') // Strip HTML tags
    .trim();
}

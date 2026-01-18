// GetRido Maps - Voice Navigation Phrases (Multi-language)

export type VoiceLanguage = 'pl' | 'en' | 'ru' | 'uk';

export interface VoicePhrases {
  turnLeft: string;
  turnRight: string;
  turnSlightLeft: string;
  turnSlightRight: string;
  turnSharpLeft: string;
  turnSharpRight: string;
  continue: string;
  uturn: string;
  roundaboutExit: string; // {exit} placeholder
  destination: string;
  inMeters: string; // {distance} placeholder
  inKilometers: string; // {distance} placeholder
  keepLeft: string;
  keepRight: string;
  merge: string;
  fork: string;
  ramp: string;
  speedWarning: string; // {over} placeholder
  recalculating: string;
  arrivedLeft: string;
  arrivedRight: string;
}

export const VOICE_PHRASES: Record<VoiceLanguage, VoicePhrases> = {
  pl: {
    turnLeft: 'Skręć w lewo',
    turnRight: 'Skręć w prawo',
    turnSlightLeft: 'Łagodnie w lewo',
    turnSlightRight: 'Łagodnie w prawo',
    turnSharpLeft: 'Ostro w lewo',
    turnSharpRight: 'Ostro w prawo',
    continue: 'Kontynuuj prosto',
    uturn: 'Zawróć',
    roundaboutExit: 'Na rondzie {exit} zjazd',
    destination: 'Dotarłeś do celu',
    inMeters: 'Za {distance} metrów',
    inKilometers: 'Za {distance} kilometr',
    keepLeft: 'Trzymaj się lewego pasa',
    keepRight: 'Trzymaj się prawego pasa',
    merge: 'Wjedź na drogę',
    fork: 'Na rozwidleniu',
    ramp: 'Zjedź na zjazd',
    speedWarning: 'Przekroczenie prędkości o {over} kilometrów',
    recalculating: 'Przeliczam trasę',
    arrivedLeft: 'Cel po lewej stronie',
    arrivedRight: 'Cel po prawej stronie',
  },
  en: {
    turnLeft: 'Turn left',
    turnRight: 'Turn right',
    turnSlightLeft: 'Keep slightly left',
    turnSlightRight: 'Keep slightly right',
    turnSharpLeft: 'Turn sharp left',
    turnSharpRight: 'Turn sharp right',
    continue: 'Continue straight',
    uturn: 'Make a U-turn',
    roundaboutExit: 'At the roundabout, take exit {exit}',
    destination: 'You have arrived at your destination',
    inMeters: 'In {distance} meters',
    inKilometers: 'In {distance} kilometer',
    keepLeft: 'Keep left',
    keepRight: 'Keep right',
    merge: 'Merge onto the road',
    fork: 'At the fork',
    ramp: 'Take the exit',
    speedWarning: 'Speed limit exceeded by {over} kilometers',
    recalculating: 'Recalculating route',
    arrivedLeft: 'Destination on your left',
    arrivedRight: 'Destination on your right',
  },
  ru: {
    turnLeft: 'Поверните налево',
    turnRight: 'Поверните направо',
    turnSlightLeft: 'Держитесь левее',
    turnSlightRight: 'Держитесь правее',
    turnSharpLeft: 'Резко налево',
    turnSharpRight: 'Резко направо',
    continue: 'Продолжайте прямо',
    uturn: 'Развернитесь',
    roundaboutExit: 'На кольце {exit} съезд',
    destination: 'Вы прибыли в пункт назначения',
    inMeters: 'Через {distance} метров',
    inKilometers: 'Через {distance} километр',
    keepLeft: 'Держитесь левой полосы',
    keepRight: 'Держитесь правой полосы',
    merge: 'Въезжайте на дорогу',
    fork: 'На развилке',
    ramp: 'Съезжайте',
    speedWarning: 'Превышение скорости на {over} километров',
    recalculating: 'Пересчитываю маршрут',
    arrivedLeft: 'Пункт назначения слева',
    arrivedRight: 'Пункт назначения справа',
  },
  uk: {
    turnLeft: 'Поверніть ліворуч',
    turnRight: 'Поверніть праворуч',
    turnSlightLeft: 'Тримайтеся лівіше',
    turnSlightRight: 'Тримайтеся правіше',
    turnSharpLeft: 'Різко ліворуч',
    turnSharpRight: 'Різко праворуч',
    continue: 'Продовжуйте прямо',
    uturn: 'Розверніться',
    roundaboutExit: 'На кільці {exit} з\'їзд',
    destination: 'Ви прибули до місця призначення',
    inMeters: 'Через {distance} метрів',
    inKilometers: 'Через {distance} кілометр',
    keepLeft: 'Тримайтеся лівої смуги',
    keepRight: 'Тримайтеся правої смуги',
    merge: 'В\'їжджайте на дорогу',
    fork: 'На роздоріжжі',
    ramp: 'З\'їжджайте',
    speedWarning: 'Перевищення швидкості на {over} кілометрів',
    recalculating: 'Перераховую маршрут',
    arrivedLeft: 'Місце призначення ліворуч',
    arrivedRight: 'Місце призначення праворуч',
  },
};

// Language code to BCP 47 locale mapping for speechSynthesis
export const VOICE_LANG_MAP: Record<VoiceLanguage, string> = {
  pl: 'pl-PL',
  en: 'en-US',
  ru: 'ru-RU',
  uk: 'uk-UA',
};

// Helper to build phrase with placeholders
export function buildPhrase(
  lang: VoiceLanguage,
  key: keyof VoicePhrases,
  replacements?: Record<string, string | number>
): string {
  let phrase = VOICE_PHRASES[lang][key];
  if (replacements) {
    Object.entries(replacements).forEach(([k, v]) => {
      phrase = phrase.replace(`{${k}}`, String(v));
    });
  }
  return phrase;
}

// Get maneuver phrase key from OSRM maneuver type/modifier
export function getManeuverPhraseKey(
  type: string,
  modifier?: string
): keyof VoicePhrases | null {
  switch (type) {
    case 'turn':
      switch (modifier) {
        case 'left': return 'turnLeft';
        case 'right': return 'turnRight';
        case 'slight left': return 'turnSlightLeft';
        case 'slight right': return 'turnSlightRight';
        case 'sharp left': return 'turnSharpLeft';
        case 'sharp right': return 'turnSharpRight';
        case 'uturn': return 'uturn';
        default: return 'continue';
      }
    case 'merge':
      return 'merge';
    case 'fork':
      if (modifier === 'left') return 'keepLeft';
      if (modifier === 'right') return 'keepRight';
      return 'fork';
    case 'ramp':
    case 'off ramp':
    case 'on ramp':
      return 'ramp';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return 'roundaboutExit';
    case 'end of road':
      if (modifier === 'left') return 'turnLeft';
      if (modifier === 'right') return 'turnRight';
      return 'continue';
    case 'continue':
    case 'new name':
    case 'notification':
      return null; // No voice for these
    case 'arrive':
      if (modifier === 'left') return 'arrivedLeft';
      if (modifier === 'right') return 'arrivedRight';
      return 'destination';
    case 'depart':
      return null;
    default:
      return null;
  }
}

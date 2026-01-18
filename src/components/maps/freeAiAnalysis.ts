// GetRido Maps - AI FREE Analysis Module v1.0
// Provides basic route analysis using heuristics and static data
// Prepares structure for future AI PRO integration
// Updated: 2026-01-18

import { RouteResult } from './routingService';

export interface AiAnalysisResult {
  messages: string[];
  confidence: 'low' | 'medium' | 'high';
  suggestAlternative: boolean;
  alternativeReason?: string;
  estimatedDelay?: number; // in minutes
  riskLevel: 'low' | 'medium' | 'high';
}

export interface TimeContext {
  hour: number;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  isWeekend: boolean;
  isPeakHours: boolean;
  timeOfDay: 'morning' | 'day' | 'evening' | 'night';
}

// Mock road reports (static data for FREE version)
interface RoadReport {
  type: 'accident' | 'roadwork' | 'congestion' | 'event';
  severity: 'low' | 'medium' | 'high';
  description: string;
  active: boolean;
}

const MOCK_ROAD_REPORTS: RoadReport[] = [
  { type: 'roadwork', severity: 'medium', description: 'Prace drogowe na głównych trasach wylotowych', active: true },
  { type: 'congestion', severity: 'low', description: 'Typowe spowolnienia w godzinach szczytu', active: true },
];

/**
 * Get current time context for analysis
 */
function getTimeContext(): TimeContext {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  // Peak hours: 7-9 AM and 4-7 PM on weekdays
  const isMorningPeak = !isWeekend && hour >= 7 && hour <= 9;
  const isEveningPeak = !isWeekend && hour >= 16 && hour <= 19;
  const isPeakHours = isMorningPeak || isEveningPeak;
  
  let timeOfDay: 'morning' | 'day' | 'evening' | 'night';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'day';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';
  
  return { hour, dayOfWeek, isWeekend, isPeakHours, timeOfDay };
}

/**
 * Estimate road type based on route characteristics
 */
function estimateRoadType(route: RouteResult): 'highway' | 'main' | 'local' | 'mixed' {
  const distance = route.distance;
  const avgSpeed = distance / (route.duration / 60); // km/h
  
  if (avgSpeed > 80) return 'highway';
  if (avgSpeed > 50) return 'main';
  if (avgSpeed < 30) return 'local';
  return 'mixed';
}

/**
 * Calculate risk score based on various factors
 */
function calculateRiskScore(
  route: RouteResult,
  timeContext: TimeContext,
  roadType: string
): number {
  let score = 0;
  
  // Distance factor (longer routes = higher risk)
  if (route.distance > 50) score += 20;
  else if (route.distance > 20) score += 10;
  else if (route.distance > 10) score += 5;
  
  // Peak hours factor
  if (timeContext.isPeakHours) score += 25;
  
  // Time of day factor
  if (timeContext.timeOfDay === 'evening' && !timeContext.isWeekend) score += 15;
  if (timeContext.timeOfDay === 'morning' && !timeContext.isWeekend) score += 10;
  
  // Road type factor
  if (roadType === 'mixed') score += 10;
  if (roadType === 'main') score += 5;
  
  // Weekend bonus (less traffic)
  if (timeContext.isWeekend) score -= 15;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Get friendly user message based on risk level (no technical jargon)
 */
export function getFriendlyMessage(riskLevel: 'low' | 'medium' | 'high'): string {
  const messages = {
    low: 'Trasa wygląda dobrze. Jedź spokojnie! 🚗',
    medium: 'Możliwe lekkie utrudnienia na trasie. Zachowaj czujność.',
    high: 'Wykryto utrudnienia. Rozważ alternatywną trasę.',
  };
  return messages[riskLevel];
}

/**
 * Generate analysis messages based on route and context
 */
function generateMessages(
  route: RouteResult,
  timeContext: TimeContext,
  roadType: string,
  riskScore: number
): string[] {
  const messages: string[] = [];
  
  // Peak hours message
  if (timeContext.isPeakHours) {
    if (timeContext.hour >= 7 && timeContext.hour <= 9) {
      messages.push('Wzmożony ruch poranny (7-9). Możliwe spowolnienia.');
    } else {
      messages.push('Wzmożony ruch popołudniowy (16-19). Możliwe spowolnienia.');
    }
  }
  
  // Distance-based messages
  if (route.distance > 30) {
    messages.push('Długa trasa – warunki mogą się zmieniać.');
  }
  
  // Road type messages (simplified)
  if (roadType === 'mixed') {
    messages.push('Trasa przez różne typy dróg.');
  }
  
  // Weekend message
  if (timeContext.isWeekend) {
    messages.push('Weekend – mniejszy ruch niż w dni robocze.');
  }
  
  // High risk message
  if (riskScore > 50) {
    messages.push('Warto sprawdzić alternatywną trasę.');
  }
  
  // Default message if no specific conditions
  if (messages.length === 0) {
    messages.push('Warunki przejazdu wyglądają optymalnie.');
  }
  
  return messages;
}

/**
 * Main AI FREE analysis function
 * Analyzes route asynchronously and returns insights
 */
export async function analyzeRouteFree(route: RouteResult): Promise<AiAnalysisResult> {
  // Simulate async processing (real AI would take time)
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const timeContext = getTimeContext();
  const roadType = estimateRoadType(route);
  const riskScore = calculateRiskScore(route, timeContext, roadType);
  
  const messages = generateMessages(route, timeContext, roadType, riskScore);
  
  // Determine confidence level
  let confidence: 'low' | 'medium' | 'high';
  if (route.distance < 5) confidence = 'high';
  else if (route.distance < 20) confidence = 'medium';
  else confidence = 'low';
  
  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high';
  if (riskScore < 25) riskLevel = 'low';
  else if (riskScore < 50) riskLevel = 'medium';
  else riskLevel = 'high';
  
  // Suggest alternative if risk is high
  const suggestAlternative = riskScore > 40;
  
  // Estimate potential delay
  let estimatedDelay = 0;
  if (timeContext.isPeakHours) {
    estimatedDelay = Math.round(route.duration * 0.15); // 15% delay in peak
  } else if (riskScore > 30) {
    estimatedDelay = Math.round(route.duration * 0.08); // 8% delay
  }
  
  return {
    messages,
    confidence,
    suggestAlternative,
    alternativeReason: suggestAlternative 
      ? 'GetRido AI sugeruje sprawdzenie alternatywnej trasy'
      : undefined,
    estimatedDelay: estimatedDelay > 0 ? estimatedDelay : undefined,
    riskLevel,
  };
}

/**
 * Get alternative route suggestion
 * For FREE version, this returns a different OSRM profile result
 */
export function getAlternativeRouteParams(): { profile: 'fastest' | 'shortest' } {
  // Toggle between fastest and shortest for alternative
  return { profile: 'shortest' };
}

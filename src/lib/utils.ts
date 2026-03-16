import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getSettlementExecutionDate(periodEnd?: string) {
  const baseDate = periodEnd ? parseLocalDate(periodEnd) : new Date();
  const executionDate = new Date(baseDate);
  executionDate.setDate(executionDate.getDate() + 1);
  return executionDate;
}

// Get available weeks up to current week (no future weeks)
export function getAvailableWeeks(year: number) {
  const allWeeks = getWeekDates(year);
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  // If today is Sunday (0), adjust to Saturday (previous week)
  const adjustedDate = new Date(now);
  if (dayOfWeek === 0) {
    adjustedDate.setDate(now.getDate() - 1);
  }
  
  // Filter out future weeks - check weekEnd instead of weekStart
  // This ensures that in Sunday, the new week (starting Monday) is NOT visible yet
  return allWeeks.filter(w => {
    const weekEnd = new Date(w.end);
    return weekEnd <= adjustedDate;
  });
}

export function getCurrentWeekNumber(year: number): number {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  // If today is Sunday (0), we still want to show the previous week
  // New week starts on Monday
  const adjustedDate = new Date(now);
  if (dayOfWeek === 0) {
    adjustedDate.setDate(now.getDate() - 1); // Go back to Saturday
  }
  
  const weeks = getAvailableWeeks(year);
  const currentWeek = weeks.find(w => {
    const start = new Date(w.start);
    const end = new Date(w.end);
    return adjustedDate >= start && adjustedDate <= end;
  });
  
  return currentWeek ? currentWeek.number : (weeks[0]?.number || 1);
}

export function getWeekDates(year: number) {
  const weeks = [];
  const startDate = new Date(year, 0, 1);
  
  while (startDate.getDay() !== 1) {
    startDate.setDate(startDate.getDate() + 1);
  }

  for (let week = 1; week <= 52; week++) {
    const weekStart = new Date(startDate);
    const weekEnd = new Date(startDate);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startFormatted = weekStart.toLocaleDateString('pl-PL', { 
      day: 'numeric', 
      month: 'short' 
    });
    const endFormatted = weekEnd.toLocaleDateString('pl-PL', { 
      day: 'numeric', 
      month: 'short' 
    });

    // Format dates as YYYY-MM-DD in local timezone (not UTC)
    const formatLocalDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    weeks.push({
      number: week,
      start: formatLocalDate(weekStart),
      end: formatLocalDate(weekEnd),
      label: `Tydzień ${week} (${startFormatted} - ${endFormatted})`,
      displayLabel: `${startFormatted} - ${endFormatted} pon.-ndz.`
    });

    startDate.setDate(startDate.getDate() + 7);
  }

  // Return in reverse order (newest first)
  return weeks.reverse();
}

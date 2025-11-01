import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

    weeks.push({
      number: week,
      start: weekStart.toISOString().split('T')[0],
      end: weekEnd.toISOString().split('T')[0],
      label: `Tydzień ${week} (${startFormatted} - ${endFormatted})`,
      displayLabel: `${startFormatted} - ${endFormatted} pon.-ndz.`
    });

    startDate.setDate(startDate.getDate() + 7);
  }

  // Return in reverse order (newest first)
  return weeks.reverse();
}

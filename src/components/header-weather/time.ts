import type { DayPhase } from './types';

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function localHour(date: Date, timeZone: string): number {
  try {
    const part = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hourCycle: 'h23', timeZone,
    }).formatToParts(date).find((item) => item.type === 'hour');
    const hour = Number(part?.value);
    return Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : date.getHours();
  } catch {
    return date.getHours();
  }
}

export function phaseAt(date: Date, timeZone: string): DayPhase {
  const hour = localHour(date, timeZone);
  if (hour >= 5 && hour < 7) return 'earlyMorning';
  if (hour >= 7 && hour < 11) return 'lateMorning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'lateAfternoon';
  if (hour >= 17 && hour < 19) return 'sunset';
  if (hour >= 19 && hour < 22) return 'night';
  return 'lateNight';
}

export function formatLocalClock(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  }
}

export const PHASE_LABELS: Record<DayPhase, string> = {
  earlyMorning: 'Sáng sớm', lateMorning: 'Buổi sáng', midday: 'Buổi trưa',
  lateAfternoon: 'Xế chiều', sunset: 'Hoàng hôn', night: 'Buổi tối', lateNight: 'Đêm khuya',
};

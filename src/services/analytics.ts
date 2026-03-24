import { AnalyticsEvent } from '../types';

const DB_KEY_ANALYTICS = 'then-what-db-analytics';

export function getAnalytics(): AnalyticsEvent[] {
  const data = localStorage.getItem(DB_KEY_ANALYTICS);
  return data ? JSON.parse(data) : [];
}

export function trackEvent(
  type: AnalyticsEvent['type'],
  puzzleId: string,
  data?: any
) {
  const events = getAnalytics();
  const event: AnalyticsEvent = {
    id: crypto.randomUUID(),
    type,
    puzzleId,
    date: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    data,
  };
  events.push(event);
  localStorage.setItem(DB_KEY_ANALYTICS, JSON.stringify(events));
}

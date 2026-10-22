/** Regions the top-bar clock can follow. The first entry is the default. */
export const TIMEZONES = [
  { id: 'America/New_York', label: 'US Eastern', place: 'New York' },
  { id: 'America/Chicago', label: 'US Central', place: 'Chicago' },
  { id: 'America/Denver', label: 'US Mountain', place: 'Denver' },
  { id: 'America/Phoenix', label: 'US Arizona', place: 'Phoenix' },
  { id: 'America/Los_Angeles', label: 'US Pacific', place: 'Los Angeles' },
  { id: 'America/Anchorage', label: 'US Alaska', place: 'Anchorage' },
  { id: 'Pacific/Honolulu', label: 'US Hawaii', place: 'Honolulu' },
  { id: 'Europe/London', label: 'United Kingdom', place: 'London' },
  { id: 'Europe/Paris', label: 'Central Europe', place: 'Paris' },
  { id: 'Asia/Dubai', label: 'Gulf', place: 'Dubai' },
  { id: 'Asia/Karachi', label: 'Pakistan', place: 'Karachi' },
  { id: 'Asia/Kolkata', label: 'India', place: 'Kolkata' },
  { id: 'Asia/Singapore', label: 'Singapore', place: 'Singapore' },
  { id: 'Asia/Tokyo', label: 'Japan', place: 'Tokyo' },
  { id: 'Australia/Sydney', label: 'Australia Eastern', place: 'Sydney' },
  { id: 'UTC', label: 'UTC', place: 'UTC' }
];

export const DEFAULT_TIMEZONE = TIMEZONES[0].id;

/** @param {string | null | undefined} id */
export function timezoneById(id) {
  return TIMEZONES.find((zone) => zone.id === id) || TIMEZONES[0];
}

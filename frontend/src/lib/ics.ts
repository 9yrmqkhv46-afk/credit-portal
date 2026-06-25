/**
 * Minimal client-side .ics (iCalendar) generation + download.
 *
 * Works entirely in the browser via a Blob URL — no API or keys required.
 * Compatible with Google Calendar, Apple Calendar, and Outlook.
 */

/** Format a Date to the iCalendar UTC stamp form: YYYYMMDDTHHMMSSZ. */
function toICSDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Escape characters that have meaning in iCalendar text fields. */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  url?: string;
}

/** Build a single-event VCALENDAR string. */
export function buildICS(event: CalendarEvent): string {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@lendvision`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LendVision//Credit Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(event.start)}`,
    `DTEND:${toICSDate(event.end)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    event.description ? `DESCRIPTION:${escapeICS(event.description)}` : '',
    event.location ? `LOCATION:${escapeICS(event.location)}` : '',
    event.url ? `URL:${escapeICS(event.url)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  // iCalendar uses CRLF line endings.
  return lines.join('\r\n');
}

/** Trigger a download of an .ics file for the given event. */
export function downloadICS(event: CalendarEvent, fileName = 'meeting.ics'): void {
  const blob = new Blob([buildICS(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL on the next tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

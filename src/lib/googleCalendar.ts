import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { ScheduleEvent, CalendarResult } from '@/types/schedule';

export async function createCalendarEvents(
  auth: OAuth2Client,
  events: ScheduleEvent[],
  calendarId: string = 'primary'
): Promise<CalendarResult> {
  const calendar = google.calendar({ version: 'v3', auth });

  const results: CalendarResult = {
    success: [],
    errors: [],
  };

  for (const event of events) {
    try {
      // Determine color based on event type
      const colorId = getColorIdByType(event.type);

      // Build description
      let description = `Тип: ${event.type}\nДень: ${event.dayOfWeek}`;

      if (event.teacherName) {
        description += `\nВикладач: ${event.teacherName}`;
      }

      if (event.meetingLink) {
        description += `\n\n🔗 Посилання на заняття:\n${event.meetingLink}`;
      } else if (event.location) {
        const locationLower = event.location.toLowerCase();
        if (locationLower.includes('zoom')) {
          description += `\n\n📹 Zoom (посилання буде надано викладачем)`;
        } else if (locationLower.includes('meet')) {
          description += `\n\n📹 Google Meet (посилання буде надано викладачем)`;
        }
      }

      const calendarEvent = {
        summary: event.subject,
        location: event.location,
        description: description,
        start: {
          dateTime: event.startDateTime.toISOString(),
          timeZone: 'Europe/Kiev',
        },
        end: {
          dateTime: event.endDateTime.toISOString(),
          timeZone: 'Europe/Kiev',
        },
        colorId: colorId,
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 10 }],
        },
      };

      const response = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: calendarEvent,
      });

      results.success.push({
        event: event.subject,
        link: response.data.htmlLink || '',
      });
    } catch (error) {
      results.errors.push({
        event: event.subject,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

export async function deleteCalendarEvents(
  auth: OAuth2Client,
  startDate: Date,
  endDate: Date,
  calendarId: string = 'primary'
): Promise<{ deleted: number; errors: number }> {
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.list({
    calendarId,
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    maxResults: 100,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];

  let deleted = 0;
  let errors = 0;

  for (const event of events) {
    try {
      await calendar.events.delete({
        calendarId,
        eventId: event.id!,
      });
      deleted++;
    } catch {
      errors++;
    }
  }

  return { deleted, errors };
}

function getColorIdByType(type: string): string {
  const colorMap: Record<string, string> = {
    'л': '9', // Лекція - синій
    'пр': '10', // Практика - зелений
    'ККР': '11', // Контроль - червоний
  };
  return colorMap[type] || '1'; // За замовчуванням - блакитний
}

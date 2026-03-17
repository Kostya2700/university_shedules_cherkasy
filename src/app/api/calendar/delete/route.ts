import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

function getTwoWeeksRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  // Start of previous week (Monday)
  const prevMonday = new Date(now);
  prevMonday.setHours(0, 0, 0, 0);
  prevMonday.setDate(now.getDate() + diffToMonday - 7);

  // End of current week (Sunday)
  const currentSunday = new Date(now);
  currentSunday.setHours(23, 59, 59, 999);
  currentSunday.setDate(now.getDate() + diffToMonday + 6);

  return { startDate: prevMonday, endDate: currentSunday };
}

export async function POST(request: NextRequest) {
  try {
    const tokens = request.cookies.get('google_tokens')?.value;

    if (!tokens) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials(JSON.parse(tokens));

    const { sheetId, groupCell, deleteBothWeeks } = await request.json();

    if (!sheetId || !groupCell) {
      return NextResponse.json({ error: 'Missing sheetId or groupCell' }, { status: 400 });
    }

    let startDate: Date;
    let endDate: Date;

    if (deleteBothWeeks) {
      const range = getTwoWeeksRange();
      startDate = range.startDate;
      endDate = range.endDate;
      console.log('Deleting both weeks:', startDate.toLocaleDateString(), '-', endDate.toLocaleDateString());
    } else {
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      const spreadsheetId = process.env.SPREADSHEET_ID;

      if (!spreadsheetId) {
        return NextResponse.json({ error: 'SPREADSHEET_ID not configured' }, { status: 500 });
      }

      const sheetMetadata = await sheets.spreadsheets.get({ spreadsheetId });
      const sheet = sheetMetadata.data.sheets?.find(s => s.properties?.sheetId === sheetId);

      if (!sheet || !sheet.properties?.title) {
        return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
      }

      const sheetName = sheet.properties.title;
      const sheetResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!B:B`,
      });

      const values = sheetResponse.data.values || [];
      const dates: Date[] = [];

      for (const row of values) {
        if (row[0]) {
          const dateMatch = row[0].match(/(\d+)\s+(\S+)\s+(\d{4})/);
          if (dateMatch) {
            const [, day, month, year] = dateMatch;
            const monthMap: Record<string, number> = {
              'січня': 0, 'лютого': 1, 'березня': 2, 'квітня': 3,
              'травня': 4, 'червня': 5, 'липня': 6, 'серпня': 7,
              'вересня': 8, 'жовтня': 9, 'листопада': 10, 'грудня': 11,
            };
            const monthNum = monthMap[month];
            if (monthNum !== undefined) {
              dates.push(new Date(parseInt(year), monthNum, parseInt(day)));
            }
          }
        }
      }

      if (dates.length === 0) {
        return NextResponse.json({ deleted: 0, errors: 0, message: 'Не знайдено дат в аркуші' });
      }

      startDate = new Date(Math.min(...dates.map(d => d.getTime())));
      endDate = new Date(Math.max(...dates.map(d => d.getTime())));
      endDate.setDate(endDate.getDate() + 1);
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const calendarResponse = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = calendarResponse.data.items || [];

    const universityEvents = events.filter(event => {
      const description = event.description || '';
      return description.includes('Тип:') && description.includes('День:');
    });

    let deleted = 0;
    let errors = 0;

    for (const event of universityEvents) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: event.id!,
        });
        deleted++;
      } catch (error) {
        errors++;
        console.error('Error deleting event:', event.id, error);
      }
    }

    return NextResponse.json({
      deleted,
      errors,
      total: events.length,
      universityEvents: universityEvents.length,
      rangeStart: startDate.toISOString(),
      rangeEnd: endDate.toISOString(),
    });
  } catch (error) {
    console.error('Error deleting events:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

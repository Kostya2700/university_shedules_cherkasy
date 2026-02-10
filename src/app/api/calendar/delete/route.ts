import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

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

    const { sheetId, groupCell } = await request.json();
    
    if (!sheetId || !groupCell) {
      return NextResponse.json({ error: 'Missing sheetId or groupCell' }, { status: 400 });
    }

    // Get dates from sheet to determine range
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json({ error: 'SPREADSHEET_ID not configured' }, { status: 500 });
    }

    // Get sheet name
    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheet = sheetMetadata.data.sheets?.find(s => s.properties?.sheetId === sheetId);
    
    if (!sheet || !sheet.properties?.title) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
    }

    const sheetName = sheet.properties.title;

    // Fetch dates column to find date range
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!B:B`, // Column B contains dates
    });

    const values = sheetResponse.data.values || [];
    const dates: Date[] = [];

    // Parse all dates from the sheet
    for (const row of values) {
      if (row[0]) {
        const dateMatch = row[0].match(/(\d+)\s+(\S+)\s+(\d{4})/);
        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          const monthMap: Record<string, number> = {
            'січня': 0, 'лютого': 1, 'березня': 2, 'квітня': 3,
            'травня': 4, 'червня': 5, 'липня': 6, 'серпня': 7,
            'вересня': 8, 'жовтня': 9, 'листопада': 10, 'грудня': 11
          };
          const monthNum = monthMap[month];
          if (monthNum !== undefined) {
            dates.push(new Date(parseInt(year), monthNum, parseInt(day)));
          }
        }
      }
    }

    if (dates.length === 0) {
      return NextResponse.json({ 
        deleted: 0, 
        errors: 0,
        message: 'Не знайдено дат в аркуші'
      });
    }

    // Find min and max dates
    const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const endDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Add one day to end date to include it
    endDate.setDate(endDate.getDate() + 1);

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

    // Delete all events
    let deleted = 0;
    let errors = 0;

    for (const event of events) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: event.id!,
        });
        deleted++;
      } catch (error) {
        errors++;
        console.error(`Error deleting event ${event.id}:`, error);
      }
    }

    return NextResponse.json({ deleted, errors, total: events.length });
  } catch (error) {
    console.error('Error deleting events:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

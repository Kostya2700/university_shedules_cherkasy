import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { parseSchedule } from '@/lib/scheduleParser';

// Fetch teacher links from external API
async function fetchTeacherLinks() {
  try {
    const response = await fetch('https://shedulem.e-u.edu.ua/config/links.json');
    if (!response.ok) {
      console.warn('Failed to fetch teacher links:', response.statusText);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn('Error fetching teacher links:', error);
    return null;
  }
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

    const { sheetId, groupCell } = await request.json();
    
    if (!sheetId || !groupCell) {
      return NextResponse.json({ error: 'Missing sheetId or groupCell' }, { status: 400 });
    }

    // Fetch data from Google Sheets
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

    if (!groupCell || groupCell.trim() === '') {
      return NextResponse.json({ error: 'Group cell is empty' }, { status: 400 });
    }

    console.log(`Sheet name: ${sheetName}`);
    console.log(`Group cell: ${groupCell}`);

    // Fetch teacher links
    console.log('📥 Fetching teacher links...');
    const teacherLinks = await fetchTeacherLinks();
    if (teacherLinks) {
      console.log(`✅ Loaded links for ${Object.keys(teacherLinks).length} teachers`);
    } else {
      console.log('⚠️  No teacher links available');
    }

    // Calculate end column (groupCell + 2 columns for type and location)
    // Example: if groupCell is 'AK', we need 'AK:AM' (AK, AL, AM)
    const startCol = groupCell;
    const charCode = startCol.charCodeAt(startCol.length - 1);
    const endCol = startCol.slice(0, -1) + String.fromCharCode(charCode + 2);

    // Fetch schedule data using the CORRECT ranges (starting from row 4!)
    const ranges = [
      `'${sheetName}'!${startCol}4:${endCol}99`,  // Schedule data (subject, type, location)
      `'${sheetName}'!A4:B99`,                     // Dates (columns A-B)
      `'${sheetName}'!C4:C99`,                     // Times (column C)
    ];

    console.log('Ranges:', ranges);

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges || [];
    
    console.log(`Fetched ${valueRanges.length} ranges`);
    if (valueRanges.length > 0 && valueRanges[0].values) {
      console.log('Schedule data rows:', valueRanges[0].values.length);
      console.log('Dates data rows:', valueRanges[1]?.values?.length);
      console.log('Times data rows:', valueRanges[2]?.values?.length);
      console.log('First schedule row:', valueRanges[0].values[0]);
    }
    
    // Parse events
    const events = parseSchedule(
      valueRanges.map(vr => ({ values: vr.values as string[][] })),
      groupCell,
      teacherLinks
    );

    console.log(`Parsed ${events.length} events`);

    if (events.length === 0) {
      return NextResponse.json({ 
        success: [],
        errors: [],
        message: 'Не знайдено подій для додавання'
      });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const success: Array<{ event: string; link: string }> = [];
    const errors: Array<{ event: string; error: string }> = [];

    for (const event of events) {
      try {
        const colorId = getColorIdByType(event.type);
        
        let description = `Тип: ${event.type}\nДень: ${event.dayOfWeek}`;
        
        if (event.teacherName) {
          description += `\nВикладач: ${event.teacherName}`;
        }
        
        if (event.meetingLink) {
          description += `\n\n🔗 Посилання на заняття:\n${event.meetingLink}`;
        }

        // Format datetime for Kyiv timezone without converting to UTC
        const formatKyivDateTime = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        };

        const response = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: event.subject,
            location: event.location,
            description: description,
            start: {
              dateTime: formatKyivDateTime(event.startDateTime),
              timeZone: 'Europe/Kiev',
            },
            end: {
              dateTime: formatKyivDateTime(event.endDateTime),
              timeZone: 'Europe/Kiev',
            },
            colorId: colorId,
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup', minutes: 10 },
              ],
            },
          },
        });

        success.push({
          event: event.subject,
          link: response.data.htmlLink || '',
        });
      } catch (error) {
        errors.push({
          event: event.subject,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`Error creating event ${event.subject}:`, error);
      }
    }

    return NextResponse.json({ success, errors });
  } catch (error) {
    console.error('Error adding events:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getColorIdByType(type: string): string {
  const colorMap: Record<string, string> = {
    'л': '9',    // Лекція - синій
    'пр': '10',  // Практика - зелений
    'ККР': '11', // Контроль - червоний
  };
  return colorMap[type] || '1';
}

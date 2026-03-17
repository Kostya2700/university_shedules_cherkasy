import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

// Returns the range: Monday of previous week → Sunday of current week
function getTwoWeeksRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const prevMonday = new Date(now);
  prevMonday.setHours(0, 0, 0, 0);
  prevMonday.setDate(now.getDate() + diffToMonday - 7);

  const currentSunday = new Date(now);
  currentSunday.setHours(23, 59, 59, 999);
  currentSunday.setDate(now.getDate() + diffToMonday + 6);

  return { start: prevMonday, end: currentSunday };
}

// Format: "3 курс ФБК 16.03.2026" — single date = Monday of that week
// We treat the sheet as covering [date .. date+6 days]
function parseSheetWeekFromTitle(title: string): { start: Date; end: Date } | null {
  const m = title.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const start = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), 0, 0, 0);
  const end = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), 23, 59, 59);
  end.setDate(end.getDate() + 6); // full week Mon–Sun
  return { start, end };
}

function overlaps(s1: Date, e1: Date, s2: Date, e2: Date): boolean {
  return s1 <= e2 && e1 >= s2;
}

export async function GET(request: NextRequest) {
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

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json({ error: 'SPREADSHEET_ID not configured' }, { status: 500 });
    }

    const url = new URL(request.url);
    const level = url.searchParams.get('level');
    const course = url.searchParams.get('course');
    const currentYear = new Date().getFullYear();

    const twoWeeks = getTwoWeeksRange();

    const response = await sheets.spreadsheets.get({ spreadsheetId });

    const sheetsList = response.data.sheets
      ?.filter(sheet => {
        const title = sheet.properties?.title || '';

        // Filter by current year
        if (!title.includes(currentYear.toString())) {
          return false;
        }

        // Filter by level (бакалавр / магістр)
        if (level && !title.toLowerCase().includes(level.toLowerCase())) {
          return false;
        }

        // Filter by course ("3 курс")
        if (course && !title.includes(`${course} курс`)) {
          return false;
        }

        // Filter by week: only sheets whose week overlaps with prev+current week
        const sheetWeek = parseSheetWeekFromTitle(title);
        if (!sheetWeek) {
          // No date in title — hide it
          return false;
        }

        return overlaps(sheetWeek.start, sheetWeek.end, twoWeeks.start, twoWeeks.end);
      })
      .map(sheet => ({
        id: sheet.properties?.sheetId,
        title: sheet.properties?.title,
      })) || [];

    return NextResponse.json({ sheets: sheetsList });
  } catch (error) {
    console.error('Error fetching sheets:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

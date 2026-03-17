import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

// Returns the range covering previous week (Mon) to current week (Sun)
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

// Try to parse a date range from a sheet title.
// Supports formats like:
//   "10.03-16.03.2026"  → 10 Mar – 16 Mar 2026
//   "10.03.2026-16.03.2026"
//   "10-16.03.2026"
function parseDateRangeFromTitle(title: string): { start: Date; end: Date } | null {
  // Pattern: DD.MM-DD.MM.YYYY  (e.g. 10.03-16.03.2026)
  let m = title.match(/(\d{1,2})\.(\d{2})-(\d{1,2})\.(\d{2})\.(\d{4})/);
  if (m) {
    const [, d1, mo1, d2, mo2, y] = m;
    const start = new Date(parseInt(y), parseInt(mo1) - 1, parseInt(d1), 0, 0, 0);
    const end   = new Date(parseInt(y), parseInt(mo2) - 1, parseInt(d2), 23, 59, 59);
    return { start, end };
  }

  // Pattern: DD.MM.YYYY-DD.MM.YYYY
  m = title.match(/(\d{1,2})\.(\d{2})\.(\d{4})-(\d{1,2})\.(\d{2})\.(\d{4})/);
  if (m) {
    const [, d1, mo1, y1, d2, mo2, y2] = m;
    const start = new Date(parseInt(y1), parseInt(mo1) - 1, parseInt(d1), 0, 0, 0);
    const end   = new Date(parseInt(y2), parseInt(mo2) - 1, parseInt(d2), 23, 59, 59);
    return { start, end };
  }

  // Pattern: DD-DD.MM.YYYY  (e.g. 10-16.03.2026)
  m = title.match(/(\d{1,2})-(\d{1,2})\.(\d{2})\.(\d{4})/);
  if (m) {
    const [, d1, d2, mo, y] = m;
    const start = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d1), 0, 0, 0);
    const end   = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d2), 23, 59, 59);
    return { start, end };
  }

  return null;
}

// Returns true if [sheetStart, sheetEnd] overlaps with [rangeStart, rangeEnd]
function overlaps(sheetStart: Date, sheetEnd: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return sheetStart <= rangeEnd && sheetEnd >= rangeStart;
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

    // Get filter parameters from query string
    const url = new URL(request.url);
    const level = url.searchParams.get('level');
    const course = url.searchParams.get('course');
    const currentYear = new Date().getFullYear();

    // Two-week window for filtering sheets by date
    const twoWeeks = getTwoWeeksRange();

    const response = await sheets.spreadsheets.get({ spreadsheetId });

    const sheetsList = response.data.sheets
      ?.filter(sheet => {
        const title = sheet.properties?.title || '';

        // Always filter by current year
        if (!title.includes(currentYear.toString())) {
          return false;
        }

        // Apply level filter
        if (level && !title.toLowerCase().includes(level.toLowerCase())) {
          return false;
        }

        // Apply course filter
        if (course && !title.includes(`${course} курс`)) {
          return false;
        }

        // Filter by date range: keep only sheets whose dates overlap
        // with the previous + current week window
        const dateRange = parseDateRangeFromTitle(title);
        if (dateRange) {
          return overlaps(dateRange.start, dateRange.end, twoWeeks.start, twoWeeks.end);
        }

        // If no date found in title — keep the sheet (don't hide it)
        return true;
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

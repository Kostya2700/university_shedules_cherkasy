import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

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
    const level = url.searchParams.get('level'); // 'бакалавр' or 'магістр'
    const course = url.searchParams.get('course'); // '1', '2', '3', '4'
    const currentYear = new Date().getFullYear();

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetsList = response.data.sheets
      ?.filter(sheet => {
        const title = sheet.properties?.title || '';
        
        // Always filter by current year (2026)
        if (!title.includes(currentYear.toString())) {
          return false;
        }

        // Apply level filter if provided
        if (level && !title.toLowerCase().includes(level.toLowerCase())) {
          return false;
        }

        // Apply course filter if provided
        if (course && !title.includes(`${course} курс`)) {
          return false;
        }

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

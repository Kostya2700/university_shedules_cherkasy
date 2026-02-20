import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { parseSchedule } from '@/lib/scheduleParser';

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
      return NextResponse.json({ error: 'Missing sheetId ors  groupCell' }, { status: 400 });
    }

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json({ error: 'SPREADSHEET_ID not configured please fix it' }, { status: 500 });
    }

    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheet = sheetMetadata.data.sheets?.find(s => s.properties?.sheetId === sheetId);
    
    if (!sheet || !sheet.properties?.title) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
    }

    const sheetName = sheet.properties.title;

    // Fetch all data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:Z100`,
    });

    const values = response.data.values || [];
    
    // Return raw data for inspection
    return NextResponse.json({
      sheetName,
      groupCell,
      totalRows: values.length,
      headerRow: values[0] || [],
      firstDataRows: values.slice(0, 10),
      // Try to parse
      parsedEvents: parseSchedule([{ values: values as string[][] }], groupCell),
    });
  } catch (error) {
    console.error('Test parse error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

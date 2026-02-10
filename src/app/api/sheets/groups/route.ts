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

    const { sheetId } = await request.json();
    
    if (!sheetId) {
      return NextResponse.json({ error: 'Missing sheetId' }, { status: 400 });
    }

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

    // Fetch row 3 to get group names (header row before data starts at row 4)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!3:3`, // Row 3 contains group names
    });

    const values = response.data.values?.[0] || [];
    const groups: Array<{ cell: string; name: string }> = [];

    console.log('Row 3 values:', values);

    // Parse groups from columns
    // Find columns that have group identifiers (like AK, AL, etc.)
    for (let i = 0; i < values.length; i++) {
      const cellValue = values[i];
      if (cellValue && cellValue.trim() !== '') {
        // Convert column index to letters (0="A", 1="B", ..., 26="AA", etc.)
        let columnLetter = '';
        let num = i;
        while (num >= 0) {
          columnLetter = String.fromCharCode(65 + (num % 26)) + columnLetter;
          num = Math.floor(num / 26) - 1;
        }
        
        // Only add if it looks like a group identifier (2-3 uppercase letters)
        const trimmed = cellValue.trim();
        if (/^[A-ZА-ЯҐЄІЇ]{2,3}(-\d+)?$/.test(trimmed) || trimmed.includes('СПГ') || trimmed.includes('СПм')) {
          groups.push({
            cell: columnLetter,
            name: trimmed,
          });
          console.log(`Found group: ${trimmed} at column ${columnLetter}`);
        }
      }
    }

    console.log(`Total groups found: ${groups.length}`);

    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

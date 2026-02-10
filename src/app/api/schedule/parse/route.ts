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

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const { spreadsheetId, sheetName, groupCell } = await request.json();

    const ranges = [
      `'${sheetName}'!${groupCell}4:${String.fromCharCode(groupCell.charCodeAt(0) + 2)}99`,
      `'${sheetName}'!A4:B99`,
      `'${sheetName}'!C4:C99`,
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    const valueRanges = response.data.valueRanges || [];

    // Fetch teacher links
    const linksResponse = await fetch('https://shedulem.e-u.edu.ua/config/links.json');
    const teacherLinks = await linksResponse.json();

    // Parse schedule
    const events = parseSchedule(valueRanges, groupCell, teacherLinks);

    return NextResponse.json({ events, count: events.length });
  } catch (error) {
    console.error('Error parsing schedule:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseSchedule(valueRanges: unknown[], groupCell: string, teacherLinks: Record<string, Record<string, string>>) {
  const events: Array<{
    subject: string;
    type: string;
    location: string;
    startDateTime: Date;
    endDateTime: Date;
    dayOfWeek: string | null;
    teacherName: string | null;
    meetingLink: string | null;
  }> = [];
  
  const scheduleData = (valueRanges[0] as { values?: string[][] })?.values || [];
  const datesData = (valueRanges[1] as { values?: string[][] })?.values || [];
  const timesData = (valueRanges[2] as { values?: string[][] })?.values || [];
  
  let currentDate: string | null = null;
  let currentDayOfWeek: string | null = null;
  
  const maxLength = Math.max(scheduleData.length, datesData.length, timesData.length);
  
  for (let i = 0; i < maxLength; i++) {
    const scheduleRow = scheduleData[i] || [];
    const dateRow = datesData[i] || [];
    const timeRow = timesData[i] || [];
    
    if (dateRow[0] && dateRow[1]) {
      currentDayOfWeek = dateRow[0];
      currentDate = dateRow[1];
    }
    
    if (!timeRow[0] || !currentDate) continue;
    
    const timeSlot = timeRow[0];
    const timeMatch = timeSlot.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
    if (!timeMatch) continue;
    
    const [, startHour, startMin, endHour, endMin] = timeMatch;
    
    const subject = scheduleRow[0];
    const type = scheduleRow[1];
    const location = scheduleRow[2];
    
    if (!subject || subject.trim() === '' || subject.includes('ЗАТВЕРДЖУЮ')) continue;
    
    const dateMatch = currentDate.match(/(\d+)\s+(\S+)\s+(\d{4})/);
    if (!dateMatch) continue;
    
    const [, day, month, year] = dateMatch;
    const monthMap: Record<string, number> = {
      'січня': 0, 'лютого': 1, 'березня': 2, 'квітня': 3,
      'травня': 4, 'червня': 5, 'липня': 6, 'серпня': 7,
      'вересня': 8, 'жовтня': 9, 'листопада': 10, 'грудня': 11
    };
    const monthNum = monthMap[month];
    
    if (monthNum === undefined) continue;
    
    const startDateTime = new Date(parseInt(year), monthNum, parseInt(day), parseInt(startHour), parseInt(startMin));
    const endDateTime = new Date(parseInt(year), monthNum, parseInt(day), parseInt(endHour), parseInt(endMin));
    
    const teacherName = extractTeacherName(subject);
    let meetingLink = null;
    
    if (teacherName && teacherLinks && location) {
      const platform = location.toLowerCase().trim();
      if (platform === 'zoom' || platform === 'meet') {
        const teacher = teacherLinks[teacherName];
        if (teacher) {
          meetingLink = teacher[platform];
        }
      }
    }
    
    events.push({
      subject: subject.trim(),
      type: type?.trim() || '',
      location: location?.trim() || '',
      startDateTime,
      endDateTime,
      dayOfWeek: currentDayOfWeek,
      teacherName,
      meetingLink,
    });
  }
  
  return events;
}

function extractTeacherName(subject: string): string | null {
  if (!subject) return null;
  
  const match = subject.match(/(?:проф\.|доц\.|викл\.|ст\.викл\.|к\.т\.н\.,?\s*доц\.)\s*([А-ЯҐЄІЇ][а-яґєії']+\s+[А-ЯҐЄІЇ]\.[А-ЯҐЄІЇ]\.)/);
  if (match) {
    return match[1].trim();
  }
  
  return null;
}

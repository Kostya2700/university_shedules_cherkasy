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

// Normalize teacher name for matching
function normalizeTeacherName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/['"«»]/g, '')
    .replace(/проф\.|доц\.|викл\.|ст\.викл\.|к\.т\.н\.,?\s*/gi, '');
}

// Fetch links from Google Classroom/Meet spreadsheet
async function fetchClassroomLinks(oauth2Client: typeof google.auth.OAuth2.prototype) {
  try {
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const classroomSpreadsheetId = '1rJLdJ2fF0WETg7jOs_BBitC-cZIS2n0iEv-ZpbPkc5Y';
    
    console.log('📥 Fetching classroom/meet/zoom links from Google Sheets...');
    console.log(`   Spreadsheet ID: ${classroomSpreadsheetId}`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: classroomSpreadsheetId,
      range: 'A1:Z1000', // Read all data including header
    });

    const rows = response.data.values || [];
    console.log(`  📊 Read ${rows.length} rows from classroom spreadsheet`);
    
    if (rows.length === 0) {
      console.warn('  ⚠️  No data in classroom spreadsheet!');
      return {};
    }

    // Log header row to understand column structure
    const headerRow = rows[0];
    console.log('  📋 Header row:', headerRow);
    console.log('  📋 Columns:', headerRow.map((col: string, i: number) => `${i}: ${col}`).join(', '));
    
    const linksMap: Record<string, { meet?: string; zoom?: string; classroom?: string }> = {};

    // Parse rows and build links map by teacher/subject (starting from row 2)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) {
        continue;
      }
      
      const key = row[0]?.trim(); // Teacher name or subject
      if (!key) {
        continue;
      }

      // Log raw row for debugging
      console.log(`  📝 Row ${i + 1}: [${row.join(', ')}]`);

      // Extract links from columns
      // We need to find which columns contain meet/zoom/classroom links
      const links: { meet?: string; zoom?: string; classroom?: string } = {};
      
      // Try to detect links by URL patterns
      for (let j = 1; j < row.length; j++) {
        const cell = row[j]?.trim();
        if (!cell) continue;
        
        const cellLower = cell.toLowerCase();
        
        // Detect Meet links
        if (cellLower.includes('meet.google.com') && !links.meet) {
          links.meet = cell;
          console.log(`     ✅ Meet found in column ${j}: ${cell}`);
        }
        // Detect Zoom links
        else if (cellLower.includes('zoom.us') && !links.zoom) {
          links.zoom = cell;
          console.log(`     ✅ Zoom found in column ${j}: ${cell}`);
        }
        // Detect Classroom links
        else if (cellLower.includes('classroom.google.com') && !links.classroom) {
          links.classroom = cell;
          console.log(`     ✅ Classroom found in column ${j}: ${cell}`);
        }
      }

      // Only add if at least one link exists
      if (links.meet || links.zoom || links.classroom) {
        // Store with both original and normalized key
        linksMap[key] = links;
        const normalizedKey = normalizeTeacherName(key);
        if (normalizedKey !== key) {
          linksMap[normalizedKey] = links;
        }
        
        console.log(`  ✅ Row ${i + 1} - "${key}":`);
        console.log(`     Normalized: "${normalizedKey}"`);
        console.log(`     Meet: ${links.meet || 'немає'}`);
        console.log(`     Zoom: ${links.zoom || 'немає'}`);
        console.log(`     Classroom: ${links.classroom || 'немає'}`);
      }
    }

    console.log(`✅ Loaded classroom links for ${Object.keys(linksMap).length} entries`);
    console.log(`📝 Keys in linksMap:`, Object.keys(linksMap));
    return linksMap;
  } catch (error) {
    console.error('❌ Error fetching classroom links:', error);
    if (error instanceof Error) {
      console.error('   Error details:', error.message);
      console.error('   Stack:', error.stack);
    }
    return {};
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

    // Fetch teacher links from external API
    console.log('📥 Fetching teacher links from external API...');
    const teacherLinks = await fetchTeacherLinks();
    if (teacherLinks) {
      console.log(`✅ Loaded links for ${Object.keys(teacherLinks).length} teachers from API`);
      console.log(`📝 API teacher keys:`, Object.keys(teacherLinks).join(', '));
    } else {
      console.log('⚠️  No teacher links available from API');
    }

    // Fetch classroom/meet links from Google Sheets
    console.log('📥 Fetching classroom/meet links from Google Sheets...');
    const classroomLinks = await fetchClassroomLinks(oauth2Client);
    console.log(`✅ Loaded classroom links for ${Object.keys(classroomLinks).length} entries`);

    // Merge links (classroom links take priority)
    const mergedLinks = { ...teacherLinks };
    console.log('🔀 Merging links...');
    
    let mergedCount = 0;
    let addedCount = 0;
    
    for (const [key, links] of Object.entries(classroomLinks)) {
      if (!mergedLinks[key]) {
        mergedLinks[key] = {};
        addedCount++;
        console.log(`  ➕ Adding new entry: "${key}"`);
      } else {
        mergedCount++;
        console.log(`  🔄 Updating entry: "${key}"`);
      }
      
      if (links.meet) {
        mergedLinks[key].meet = links.meet;
        console.log(`     ✅ Meet: ${links.meet.substring(0, 50)}...`);
      }
      if (links.zoom) {
        mergedLinks[key].zoom = links.zoom;
        console.log(`     ✅ Zoom: ${links.zoom.substring(0, 50)}...`);
      }
      if (links.classroom) {
        mergedLinks[key].classroom = links.classroom;
        console.log(`     ✅ Classroom: ${links.classroom.substring(0, 50)}...`);
      }
    }

    console.log(`📊 Merge summary:`);
    console.log(`   - Total merged links: ${Object.keys(mergedLinks).length}`);
    console.log(`   - Updated existing: ${mergedCount}`);
    console.log(`   - Added new: ${addedCount}`);
    console.log(`📝 Final merged keys:`, Object.keys(mergedLinks).join(', '));

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
    
    // Parse events with merged links
    const events = parseSchedule(
      valueRanges.map(vr => ({ values: vr.values as string[][] })),
      groupCell,
      mergedLinks
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
        
        console.log(`\n📅 Creating event: ${event.subject}`);
        console.log(`   Teacher: ${event.teacherName || 'N/A'}`);
        console.log(`   Location: ${event.location || 'N/A'}`);
        console.log(`   Meeting Link: ${event.meetingLink || 'N/A'}`);
        console.log(`   Classroom Link: ${event.classroomLink || 'N/A'}`);
        
        // Add meeting link (Zoom/Meet)
        if (event.meetingLink) {
          description += `\n\n🔗 Посилання на заняття:\n${event.meetingLink}`;
          console.log(`   ✅ Added meeting link to description`);
        } else {
          console.log(`   ⚠️  No meeting link to add`);
        }
        
        // Add classroom link if available
        if (event.classroomLink) {
          description += `\n\n📚 Google Classroom:\n${event.classroomLink}`;
          console.log(`   ✅ Added classroom link to description`);
        } else {
          console.log(`   ⚠️  No classroom link to add`);
        }
        
        console.log(`   📝 Final description:\n${description.split('\n').map(line => `      ${line}`).join('\n')}`);

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

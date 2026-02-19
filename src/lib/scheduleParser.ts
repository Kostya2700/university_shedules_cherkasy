import type { ScheduleEvent, TeacherLinks } from '@/types/schedule';

// Normalize teacher name for matching
function normalizeTeacherName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/['"«»]/g, '')
    .replace(/проф\.|доц\.|викл\.|ст\.викл\.|к\.т\.н\.,?\s*/gi, '');
}

export function extractTeacherName(subject: string): string | null {
  if (!subject) return null;

  const match = subject.match(
    /(?:проф\.|доц\.|викл\.|ст\.викл\.|к\.т\.н\.,?\s*доц\.)\s*([А-ЯҐЄІЇ][а-яґєії']+\s+[А-ЯҐЄІЇ]\.[А-ЯҐЄІЇ]\.)/
  );

  return match ? match[1].trim() : null;
}

export function parseSchedule(
  valueRanges: Array<{ values?: string[][] }>,
  groupCell: string,
  teacherLinks: TeacherLinks | null = null
): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];

  // Extract the three ranges
  const scheduleData = valueRanges[0]?.values || [];
  const datesData = valueRanges[1]?.values || [];
  const timesData = valueRanges[2]?.values || [];

  // Map to track which row corresponds to which date
  let currentDate: string | null = null;
  let currentDayOfWeek: string | null = null;

  // Find the maximum length to iterate through all rows
  const maxLength = Math.max(scheduleData.length, datesData.length, timesData.length);

  for (let i = 0; i < maxLength; i++) {
    const scheduleRow = scheduleData[i] || [];
    const dateRow = datesData[i] || [];
    const timeRow = timesData[i] || [];

    // Update current date if this row contains a date
    if (dateRow[0] && dateRow[1]) {
      currentDayOfWeek = dateRow[0];
      currentDate = dateRow[1];
    }

    // Skip if no time slot in this row
    if (!timeRow[0]) {
      continue;
    }

    // Skip if no current date set yet
    if (!currentDate) {
      continue;
    }

    // Parse time slot (e.g., "09:00 - 10:00")
    const timeSlot = timeRow[0];
    const timeMatch = timeSlot.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
    if (!timeMatch) continue;

    const [, startHour, startMin, endHour, endMin] = timeMatch;

    // Get the subject from column 0, type from column 1, location from column 2
    const subject = scheduleRow[0];
    const type = scheduleRow[1];
    const location = scheduleRow[2];

    // Skip empty cells
    if (!subject || subject.trim() === '') continue;

    // Skip approval stamps
    if (subject.includes('ЗАТВЕРДЖУЮ')) continue;

    // Parse date (e.g., "13 жовтня 2025 р.")
    const dateMatch = currentDate.match(/(\d+)\s+(\S+)\s+(\d{4})/);
    if (!dateMatch) continue;

    const [, day, month, year] = dateMatch;
    const monthMap: Record<string, number> = {
      'січня': 0, 'лютого': 1, 'березня': 2, 'квітня': 3,
      'травня': 4, 'червня': 5, 'липня': 6, 'серпня': 7,
      'вересня': 8, 'жовтня': 9, 'листопада': 10, 'грудня': 11
    };
    const monthNum = monthMap[month];

    // Skip if month not found
    if (monthNum === undefined) continue;

    // Create start and end datetime in Kyiv timezone (UTC+2)
    // We create date string in ISO format and explicitly set timezone
    const dateStr = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const startTimeStr = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
    const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`;
    
    // Parse as local time (Kyiv timezone on server)
    const startDateTime = new Date(`${dateStr}T${startTimeStr}`);
    const endDateTime = new Date(`${dateStr}T${endTimeStr}`);

    // Extract teacher name and get meeting links
    const teacherName = extractTeacherName(subject);
    let meetingLink: string | undefined = undefined;
    let classroomLink: string | undefined = undefined;

    if (teacherLinks) {
      console.log(`\n🔍 Searching links for event: "${subject}"`);
      console.log(`   Teacher extracted: ${teacherName || 'N/A'}`);
      console.log(`   Location: ${location || 'N/A'}`);
      
      let teacher = null;
      let matchType = '';
      
      // Strategy 1: Try exact teacher name match
      if (teacherName && teacherLinks[teacherName]) {
        teacher = teacherLinks[teacherName];
        matchType = 'exact teacher name';
      }
      
      // Strategy 2: Try normalized teacher name
      if (!teacher && teacherName) {
        const normalizedName = normalizeTeacherName(teacherName);
        if (teacherLinks[normalizedName]) {
          teacher = teacherLinks[normalizedName];
          matchType = `normalized teacher name (${normalizedName})`;
        }
      }
      
      // Strategy 3: Try full subject as key
      if (!teacher && teacherLinks[subject]) {
        teacher = teacherLinks[subject];
        matchType = 'full subject';
      }
      
      // Strategy 4: Try normalized subject
      if (!teacher) {
        const normalizedSubject = normalizeTeacherName(subject);
        if (teacherLinks[normalizedSubject]) {
          teacher = teacherLinks[normalizedSubject];
          matchType = `normalized subject (${normalizedSubject})`;
        }
      }
      
      // Strategy 5: Try partial match (search in keys)
      if (!teacher && teacherName) {
        const lowerTeacher = teacherName.toLowerCase();
        for (const [key, value] of Object.entries(teacherLinks)) {
          if (key.toLowerCase().includes(lowerTeacher) || lowerTeacher.includes(key.toLowerCase())) {
            teacher = value;
            matchType = `partial match (${key})`;
            break;
          }
        }
      }
      
      if (teacher) {
        console.log(`   ✅ Found match: ${matchType}`);
        
        // Get meeting link based on location (Zoom or Meet)
        if (location) {
          const platform = location.toLowerCase().trim();
          if (platform === 'zoom' && teacher.zoom) {
            meetingLink = teacher.zoom;
            console.log(`     ✅ Zoom: ${meetingLink}`);
          } else if (platform === 'meet' && teacher.meet) {
            meetingLink = teacher.meet;
            console.log(`     ✅ Meet: ${meetingLink}`);
          } else if (platform === 'zoom' || platform === 'meet') {
            console.log(`     ⚠️  ${platform}: not found`);
          }
        }
        
        // Always try to get classroom link (independent of location)
        if (teacher.classroom) {
          classroomLink = teacher.classroom;
          console.log(`     ✅ Classroom: ${classroomLink}`);
        } else {
          console.log(`     ⚠️  Classroom: not found`);
        }
      } else {
        console.log(`   ❌ No links found`);
        console.log(`   📝 Available ${Object.keys(teacherLinks).length} keys:`, Object.keys(teacherLinks).slice(0, 10).join(', '));
      }
    }

    const parsedEvent: ScheduleEvent = {
      subject: subject.trim(),
      type: type?.trim() || '',
      location: location?.trim() || '',
      startDateTime,
      endDateTime,
      dayOfWeek: currentDayOfWeek || '',
      teacherName: teacherName || undefined,
      meetingLink,
      classroomLink,
    };
    
    console.log(`   📅 Event created:`, {
      subject: parsedEvent.subject,
      teacher: parsedEvent.teacherName || 'N/A',
      meetingLink: parsedEvent.meetingLink ? 'YES' : 'NO',
      classroomLink: parsedEvent.classroomLink ? 'YES' : 'NO',
    });
    
    events.push(parsedEvent);
  }

  return events;
}

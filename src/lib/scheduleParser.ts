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

    if (teacherName && teacherLinks) {
      // Try to find links with exact name match first
      let teacher = teacherLinks[teacherName];
      
      // If not found, try normalized name
      if (!teacher) {
        const normalizedName = normalizeTeacherName(teacherName);
        teacher = teacherLinks[normalizedName];
        console.log(`  👤 ${teacherName} (normalized: ${normalizedName}):`);
      } else {
        console.log(`  👤 ${teacherName}:`);
      }
      
      if (teacher) {
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
        console.log(`  ⚠️  No links found for teacher: ${teacherName}`);
        // Log all available keys for debugging
        console.log(`  📝 Available keys:`, Object.keys(teacherLinks).join(', '));
      }
    }

    events.push({
      subject: subject.trim(),
      type: type?.trim() || '',
      location: location?.trim() || '',
      startDateTime,
      endDateTime,
      dayOfWeek: currentDayOfWeek || '',
      teacherName: teacherName || undefined,
      meetingLink,
      classroomLink,
    });
  }

  return events;
}

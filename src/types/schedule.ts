export interface ScheduleEvent {
  subject: string;
  type: string;
  location: string;
  startDateTime: Date;
  endDateTime: Date;
  dayOfWeek: string;
  teacherName?: string;
  meetingLink?: string;
  classroomLink?: string;
}

export interface Sheet {
  id: number;
  title: string;
}

export interface TeacherLinks {
  [teacherName: string]: {
    zoom?: string;
    meet?: string;
    classroom?: string;
  };
}

export interface CalendarResult {
  success: Array<{ event: string; link: string }>;
  errors: Array<{ event: string; error: string }>;
}

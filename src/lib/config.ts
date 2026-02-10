import type { TeacherLinks } from '@/types/schedule';

const CONFIG_BASE_URL = 'https://shedulem.e-u.edu.ua/config';

export async function fetchTeacherLinks(): Promise<TeacherLinks> {
  try {
    const response = await fetch(`${CONFIG_BASE_URL}/links.json`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch teacher links: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching teacher links:', error);
    return {};
  }
}

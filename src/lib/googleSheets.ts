import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export async function getGoogleAuth(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return oauth2Client;
}

export async function fetchSchedule(auth: OAuth2Client, spreadsheetId: string, sheetName: string, ranges: string[]) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    fields: 'valueRanges(range,values)',
  });

  return response.data.valueRanges || [];
}

export async function getAvailableSheets(auth: OAuth2Client, spreadsheetId: string) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  return response.data.sheets?.map((sheet) => ({
    id: sheet.properties?.sheetId || 0,
    title: sheet.properties?.title || '',
  })) || [];
}

import { getAccessToken } from './googleAuth';

export interface SessionRecord {
  id: string;
  timestamp: string;
  scenario: string;
  durationSeconds: number;
  wordCount: number;
  wpm: number;
  clarityScore: number;
  fillerCount: number;
  presenceScore: number;
  keyStrength: string;
  improvement: string;
  coachVerdict: string;
}

export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // Match standard Google Sheets URL format: /spreadsheets/d/([a-zA-Z0-9-_]+)
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Creates a dedicated, styled Google Spreadsheet for Clarity Communication Coach.
 */
export async function createCoachingJournalSheet(
  customTitle = 'Clarity Communication Coach - Journal'
): Promise<{ id: string; url: string; title: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Sheets.');

  const headers = [
    'Session ID',
    'Date & Time',
    'Scenario',
    'Duration (s)',
    'Words',
    'WPM',
    'Clarity (%)',
    'Fillers',
    'Presence (%)',
    'Key Strength',
    'Priority Focus',
    'Coach Summary',
  ];

  const payload = {
    properties: {
      title: customTitle,
    },
    sheets: [
      {
        properties: {
          title: 'Coaching Sessions',
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: headers.map((header) => ({
                  userEnteredValue: { stringValue: header },
                  userEnteredFormat: {
                    backgroundColor: { red: 0.31, green: 0.27, blue: 0.90 }, // Indigo #4F46E5
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                      fontSize: 10,
                    },
                    horizontalAlignment: 'CENTER',
                  },
                })),
              },
            ],
          },
        ],
      },
    ],
  };

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to create Google Spreadsheet.');
  }

  const result = await response.json();
  const id = result.spreadsheetId;
  const url = result.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}/edit`;

  return { id, url, title: result.properties?.title || customTitle };
}

/**
 * Appends a coaching session record into the spreadsheet.
 */
export async function appendSessionToSheet(
  spreadsheetId: string,
  record: SessionRecord
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Sheets.');

  // First fetch spreadsheet metadata to dynamically find the first sheet name
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Could not verify spreadsheet tab structure.');
  }

  const meta = await metaRes.json();
  const firstSheetName = meta.sheets?.[0]?.properties?.title || 'Sheet1';

  const rowValues = [
    record.id,
    record.timestamp,
    record.scenario,
    record.durationSeconds,
    record.wordCount,
    record.wpm,
    `${record.clarityScore}%`,
    record.fillerCount,
    `${record.presenceScore}%`,
    record.keyStrength,
    record.improvement,
    record.coachVerdict,
  ];

  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
    firstSheetName
  )}'!A:L:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(appendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [rowValues],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to log session row to Google Sheets.');
  }
}

/**
 * Reads existing session rows from the spreadsheet.
 */
export async function fetchJournalRows(
  spreadsheetId: string
): Promise<{ rows: any[][]; title: string; sheetName: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Sheets.');

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to read spreadsheet details.');
  }

  const meta = await metaRes.json();
  const sheetTitle = meta.properties?.title || 'Coaching Journal';
  const firstTabName = meta.sheets?.[0]?.properties?.title || 'Sheet1';

  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
      firstTabName
    )}'!A1:L100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!valuesRes.ok) {
    const err = await valuesRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to fetch rows from spreadsheet.');
  }

  const valuesData = await valuesRes.json();
  return {
    rows: valuesData.values || [],
    title: sheetTitle,
    sheetName: firstTabName,
  };
}

/**
 * Clears logged session rows from row 2 onwards (preserving header row).
 */
export async function clearSessionRows(
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Sheets.');

  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
    sheetName
  )}'!A2:L500:clear`;

  const res = await fetch(clearUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to clear rows in spreadsheet.');
  }
}

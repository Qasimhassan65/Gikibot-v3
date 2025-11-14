import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { promises as fs } from "fs";
import path from "path";

const TAB_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Feedback";

// Parse credentials from environment variable
let credentials: any = null;
try {
  const credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (credentialsJson) {
    credentials = JSON.parse(credentialsJson);
  }
} catch (err) {
  console.warn("Failed to parse GOOGLE_SHEETS_CREDENTIALS:", err);
}

if (!credentials) {
  console.warn("Google Sheets feedback credentials are not configured (GOOGLE_SHEETS_CREDENTIALS missing or invalid).");
}

const ENV_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
const SHEET_ID_CACHE_PATH = path.join(process.cwd(), ".feedback-sheet-id.cache");

let cachedSpreadsheetId = ENV_SPREADSHEET_ID || "";
let sheetsClientPromise: Promise<ReturnType<typeof google.sheets>> | null = null;

async function getSheetsClient() {
  if (sheetsClientPromise) {
    return sheetsClientPromise;
  }

  if (!credentials) {
    throw new Error("Google Sheets feedback integration is missing required credentials (GOOGLE_SHEETS_CREDENTIALS).");
  }

  sheetsClientPromise = (async () => {
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    return google.sheets({ version: "v4", auth });
  })();

  return sheetsClientPromise;
}

async function ensureSpreadsheetId(sheets: ReturnType<typeof google.sheets>): Promise<string> {
  if (cachedSpreadsheetId) {
    // Verify the spreadsheet still exists and is accessible
    try {
      await sheets.spreadsheets.get({ spreadsheetId: cachedSpreadsheetId });
      return cachedSpreadsheetId;
    } catch (err: any) {
      console.warn("Cached spreadsheet ID is no longer accessible, clearing cache:", err?.message);
      cachedSpreadsheetId = '';
    }
  }

  // Check environment variable first
  if (ENV_SPREADSHEET_ID) {
    try {
      await sheets.spreadsheets.get({ spreadsheetId: ENV_SPREADSHEET_ID });
      cachedSpreadsheetId = ENV_SPREADSHEET_ID;
      return cachedSpreadsheetId;
    } catch (err: any) {
      console.error("Environment spreadsheet ID is not accessible:", err?.message);
      // Continue to try cache or create new
    }
  }

  try {
    const stored = await fs.readFile(SHEET_ID_CACHE_PATH, "utf8");
    const parsed = stored.trim();
    if (parsed) {
      try {
        await sheets.spreadsheets.get({ spreadsheetId: parsed });
        cachedSpreadsheetId = parsed;
        return cachedSpreadsheetId;
      } catch (err: any) {
        console.warn("Cached spreadsheet ID from file is not accessible:", err?.message);
      }
    }
  } catch (err) {
    // ignore missing file
  }

  console.warn("GOOGLE_SHEETS_SPREADSHEET_ID is not set or not accessible. Creating a fallback spreadsheet using the service account.");

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: "GIKI Chatbot Feedback",
      },
      sheets: [
        {
          properties: {
            title: TAB_NAME,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    },
  });

  const spreadsheetId = created.data.spreadsheetId;

  if (!spreadsheetId) {
    throw new Error("Failed to auto-create fallback spreadsheet.");
  }

  cachedSpreadsheetId = spreadsheetId;

  await fs.writeFile(SHEET_ID_CACHE_PATH, spreadsheetId, "utf8");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB_NAME}!A1:H1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["timestamp", "feedbackType", "userComment", "lastQuestion", "lastResponse", "fullConversation", "sessionId", "Type"]],
    },
  });

  console.warn(`Created fallback spreadsheet with ID ${spreadsheetId}. Share this sheet with stakeholders as needed.`);

  return spreadsheetId;
}

async function ensureSheetTab(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const details = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });

  const hasTab = (details.data.sheets || []).some((sheet) => sheet.properties?.title === TAB_NAME);

  if (hasTab) {
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: TAB_NAME,
              gridProperties: {
                frozenRowCount: 1,
              },
            },
          },
        },
      ],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB_NAME}!A1:H1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["timestamp", "feedbackType", "userComment", "lastQuestion", "lastResponse", "fullConversation", "sessionId", "Type"]],
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));

    const feedbackType = (payload.feedbackType || "").toString().trim();
    const userComment = (payload.userComment || "").toString();
    const lastQuestion = (payload.lastQuestion || "").toString();
    const lastResponse = (payload.lastResponse || "").toString();
    const sessionId = (payload.sessionId || "").toString();
    const typeLabel = (payload.type || payload.admissionsType || "").toString().trim();
    const providedTimestamp = (payload.timestamp || "").toString().trim();
    const fullConversation = Array.isArray(payload.fullConversation) ? payload.fullConversation : [];

    if (!feedbackType || !["positive", "negative"].includes(feedbackType)) {
      return NextResponse.json({ error: 'feedbackType must be "positive" or "negative".' }, { status: 400 });
    }

    const timestamp = providedTimestamp ? new Date(providedTimestamp).toISOString() : new Date().toISOString();

    const conversationString = JSON.stringify(fullConversation);

    const sheets = await getSheetsClient();
    const spreadsheetId = await ensureSpreadsheetId(sheets);
    await ensureSheetTab(sheets, spreadsheetId);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB_NAME}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[timestamp, feedbackType, userComment, lastQuestion, lastResponse, conversationString, sessionId, typeLabel]],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error submitting feedback:", err);
    return NextResponse.json(
      {
        error: err?.message || "Failed to submit feedback. Please try again in a moment.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

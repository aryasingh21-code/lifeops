import { google } from "googleapis";
import { z } from "zod";
import { config } from "../config.js";
import { defineTool } from "./types.js";

function client() {
  const { clientId, clientSecret, refreshToken } = config.google;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google credentials. See README: Google setup.");
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth });
}

const iso = z.string().describe("ISO 8601 datetime with UTC offset, e.g. 2026-11-20T15:00:00+05:30");

export const calendarListEvents = defineTool({
  name: "calendar_list_events",
  description:
    "List events on the user's primary calendar between two times. Use it to check availability.",
  schema: z.object({ timeMin: iso, timeMax: iso }),
  run: async ({ timeMin, timeMax }) => {
    const res = await client().events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });
    return (res.data.items ?? []).map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
    }));
  },
});

export const calendarCreateEvent = defineTool({
  name: "calendar_create_event",
  description: "Create an event on the user's primary calendar. Optionally invite attendees by email.",
  schema: z.object({
    summary: z.string(),
    start: iso,
    end: iso,
    attendees: z.array(z.string().email()).optional(),
  }),
  run: async ({ summary, start, end, attendees }) => {
    const res = await client().events.insert({
      calendarId: "primary",
      sendUpdates: attendees?.length ? "all" : "none",
      requestBody: {
        summary,
        start: { dateTime: start, timeZone: config.timezone },
        end: { dateTime: end, timeZone: config.timezone },
        attendees: attendees?.map((email) => ({ email })),
      },
    });
    return { eventId: res.data.id, link: res.data.htmlLink };
  },
});

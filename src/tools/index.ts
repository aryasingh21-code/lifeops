import { browsePage } from "./browser.js";
import { calendarCreateEvent, calendarListEvents } from "./calendar.js";
import { gmailCreateDraft, gmailSearch, gmailSend } from "./gmail.js";
import type { Tool } from "./types.js";

export type { Tool } from "./types.js";

export const realTools: Tool[] = [
  gmailSearch,
  gmailCreateDraft,
  gmailSend,
  calendarListEvents,
  calendarCreateEvent,
  browsePage,
];

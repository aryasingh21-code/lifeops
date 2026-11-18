import type { Planner } from "./planner.js";
import type { PlanStep } from "./state.js";
import type { Tool } from "../tools/index.js";
import { config } from "../config.js";

function getEmail(request: string): string | undefined {
  return request.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
}

function getOffsetMinutes(timestamp: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((localAsUtc - timestamp) / 60000);
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const mins = String(abs % 60).padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}

function localDateTime(
  dayOffset: number,
  hour: number,
  minute: number,
): string {
  const timezone = config.timezone;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + dayOffset,
    ),
  );

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let offset = getOffsetMinutes(localAsUtc, timezone);

  // Recalculate near the actual target time for timezone transitions.
  let timestamp = localAsUtc - offset * 60000;
  offset = getOffsetMinutes(timestamp, timezone);
  timestamp = localAsUtc - offset * 60000;

  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00${formatOffset(offset)}`;
}

function parseRequestedTime(request: string) {
  const match = request.match(
    /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  );

  let hour = match ? Number(match[1]) : 15;
  const minute = match?.[2] ? Number(match[2]) : 0;

  if (match) {
    const period = match[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
  }

  const dayOffset = /\btomorrow\b/i.test(request) ? 1 : 0;

  return { dayOffset, hour, minute };
}

function findTool(tools: Tool[], name: string): void {
  if (!tools.some((tool) => tool.name === name)) {
    throw new Error(`Mock planner requires unavailable tool: ${name}`);
  }
}

export class MockPlanner implements Planner {
  constructor(private allowRecovery = false) {}
  async plan({
    request,
    tools,
  }: {
    request: string;
    memories: string[];
    tools: Tool[];
  }): Promise<PlanStep[]> {
    const text = request.toLowerCase();
    const email = getEmail(request);

    // Calendar scheduling: check availability before creating an event.
    if (
      /\b(schedule|book|create|add)\b/i.test(text) &&
      /\b(meeting|event|appointment|call)\b/i.test(text)
    ) {
      const { dayOffset, hour, minute } = parseRequestedTime(request);
      const durationMatch = text.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?)/i);

      const duration = durationMatch
        ? Number(durationMatch[1]) *
          (/hour|hr/i.test(durationMatch[2]) ? 60 : 1)
        : 30;

      const start = localDateTime(dayOffset, hour, minute);
      const startDate = new Date(start);
      const end = new Date(startDate.getTime() + duration * 60000);

      // Preserve the local offset in the generated end time.
      const endLocal = localDateTime(dayOffset, hour, minute + duration);

      void end;

      findTool(tools, "calendar_list_events");
      findTool(tools, "calendar_create_event");

      const endTime = endLocal;

      return [
        {
          id: 1,
          tool: "calendar_list_events",
          description: "Check calendar availability",
          args: {
            timeMin: start,
            timeMax: endTime,
          },
        },
        {
          id: 2,
          tool: "calendar_create_event",
          description: "Create the requested calendar event",
          args: {
            summary: email ? `Meeting with ${email}` : "Scheduled meeting",
            start,
            end: endTime,
            ...(email ? { attendees: [email] } : {}),
          },
        },
      ];
    }

    // Gmail search.
    if (
      /\b(search|find|check|look for|show)\b/i.test(text) &&
      /\b(email|emails|inbox|gmail|messages)\b/i.test(text)
    ) {
      findTool(tools, "gmail_search");

      return [
        {
          id: 1,
          tool: "gmail_search",
          description: "Search Gmail messages",
          args: {
            query:
              [
                email ? `from:${email}` : "",
                /\bunread\b/i.test(text) ? "is:unread" : "",
                /\bthis week\b/i.test(text) ? "newer_than:7d" : "",
              ]
                .filter(Boolean)
                .join(" ") || "newer_than:7d",
            maxResults: 5,
          },
        },
      ];
    }

    // Gmail draft.
    if (/\b(draft|compose)\b/i.test(text) && email) {
      findTool(tools, "gmail_create_draft");

      return [
        {
          id: 1,
          tool: "gmail_create_draft",
          description: "Create a simulated email draft",
          args: {
            to: email,
            subject: "Draft created by LifeOps",
            body: "This is a simulated draft created in LifeOps mock mode.",
          },
        },
      ];
    }

    // Gmail send (simulated only in mock mode).
    if (/\bsend\b/i.test(text) && /\b(email|message)\b/i.test(text) && email) {
      findTool(tools, "gmail_send");

      return [
        {
          id: 1,
          tool: "gmail_send",
          description: "Simulate sending an email",
          args: {
            to: email,
            subject: "Test email from LifeOps",
            body: "This is a simulated email. No real email will be sent.",
          },
        },
      ];
    }

    // Browser.
    const url = request.match(/https?:\/\/[^\s]+/i)?.[0];

    if (url) {
      findTool(tools, "browse_page");

      return [
        {
          id: 1,
          tool: "browse_page",
          description: "Simulate opening a web page",
          args: { url },
        },
      ];
    }

    // Calendar lookup.
    if (/\b(calendar|schedule|events|availability)\b/i.test(text)) {
      findTool(tools, "calendar_list_events");

      const start = localDateTime(0, 0, 0);
      const end = localDateTime(1, 0, 0);

      return [
        {
          id: 1,
          tool: "calendar_list_events",
          description: "Check upcoming calendar events",
          args: { timeMin: start, timeMax: end },
        },
      ];
    }

    // Unknown requests are deliberately not guessed.
    return [];
  }

  async recover(input: {
    request: string;
    step: PlanStep;
    error: string;
    tools: Tool[];
  }): Promise<PlanStep | null> {
    // Retry the failed step when recovery mode is enabled.
    return this.allowRecovery ? input.step : null;
  }
}

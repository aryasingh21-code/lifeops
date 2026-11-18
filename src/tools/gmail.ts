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
  return google.gmail({ version: "v1", auth });
}

function raw(m: { to: string; subject: string; body: string }) {
  const subject = `=?UTF-8?B?${Buffer.from(m.subject).toString("base64")}?=`;
  const msg = [
    `To: ${m.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    m.body,
  ].join("\r\n");
  return Buffer.from(msg).toString("base64url");
}

const emailArgs = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const gmailSearch = defineTool({
  name: "gmail_search",
  description:
    "Search Gmail using Gmail query syntax (e.g. 'from:hr is:unread newer_than:7d'). Returns sender, subject, date and snippet.",
  schema: z.object({
    query: z.string(),
    maxResults: z.number().int().min(1).max(20).default(5),
  }),
  run: async ({ query, maxResults }) => {
    const gmail = client();
    const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
    const out = [];
    for (const m of list.data.messages ?? []) {
      const d = await gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const h = (name: string) =>
        d.data.payload?.headers?.find((x) => x.name === name)?.value ?? "";
      out.push({
        id: m.id,
        from: h("From"),
        subject: h("Subject"),
        date: h("Date"),
        snippet: d.data.snippet,
      });
    }
    return out;
  },
});

export const gmailCreateDraft = defineTool({
  name: "gmail_create_draft",
  description: "Create a Gmail draft (does not send).",
  schema: emailArgs,
  run: async (args) => {
    const res = await client().users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: raw(args) } },
    });
    return { draftId: res.data.id };
  },
});

export const gmailSend = defineTool({
  name: "gmail_send",
  description: "Send an email immediately from the user's Gmail account.",
  schema: emailArgs,
  run: async (args) => {
    const res = await client().users.messages.send({
      userId: "me",
      requestBody: { raw: raw(args) },
    });
    return { messageId: res.data.id };
  },
});

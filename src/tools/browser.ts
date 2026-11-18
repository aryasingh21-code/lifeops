import { chromium } from "playwright";
import { z } from "zod";
import { defineTool } from "./types.js";

export const browsePage = defineTool({
  name: "browse_page",
  description:
    "Open a web page in a headless browser (Playwright) and return its title and visible text (truncated).",
  schema: z.object({ url: z.string().url() }),
  run: async ({ url }) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const title = await page.title();
      const text = (await page.innerText("body")).slice(0, 4000);
      return { title, text };
    } finally {
      await browser.close();
    }
  },
});

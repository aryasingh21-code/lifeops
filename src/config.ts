import "dotenv/config";

export const config = {
  model: process.env.LLM_MODEL ?? "claude-sonnet-5-5",
  databaseUrl:
    process.env.DATABASE_URL ?? "postgresql://lifeops:lifeops@localhost:5432/lifeops",
  timezone: process.env.TIMEZONE ?? "UTC",
  maxRetries: Number(process.env.MAX_RETRIES ?? 3),
  maxRecoveries: Number(process.env.MAX_RECOVERIES ?? 2),
  retryBaseMs: Number(process.env.RETRY_BASE_MS ?? 500),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  },
};

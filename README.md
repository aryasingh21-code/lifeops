# LifeOps – Personal AI Execution Agent

**LifeOps** is a TypeScript-based personal AI execution agent that converts natural-language requests into structured, multi-step workflows and executes them through external tools with human approval.

Built with **LangGraph.js, TypeScript, PostgreSQL, MCP, and Playwright**, LifeOps is designed to go beyond conversational responses by planning actions, validating tool inputs, handling failures, and maintaining persistent memory.

## Key Features

- **Multi-step Planning:** Converts natural-language requests into structured execution plans using an LLM-powered planner.
- **Human-in-the-Loop Approval:** Presents proposed actions for user approval before execution.
- **Tool Integration:** Supports Gmail, Google Calendar, and browser automation tools.
- **Failure Handling:** Implements retries with exponential backoff and a recovery mechanism for failed steps.
- **Persistent Memory:** Stores and retrieves previous interaction context using PostgreSQL.
- **MCP Support:** Exposes agent capabilities through a Model Context Protocol server.
- **Input Validation:** Uses Zod schemas to validate tool arguments before execution.
- **Evaluation Pipeline:** Tracks tool selection, execution success, task completion, and error recovery.

## Architecture

```mermaid
flowchart TD
    A[User Request] --> B[Recall Memory]
    B --> C[LLM Planner]
    C --> D[Human Approval]
    D -->|Approved| E[Execute Tools]
    D -->|Rejected| H[Remember Result]
    E -->|Success| H
    E -->|Failure| F[Retry / Recovery]
    F -->|Recoverable| E
    F -->|Unrecoverable| H
    H --> I[End]
```

### Execution Workflow

1. **Recall:** Retrieves relevant information from stored memory.
2. **Plan:** Generates a sequence of tool calls based on the user's request and available tools.
3. **Approval:** Displays the proposed plan and waits for user confirmation.
4. **Execution:** Validates arguments and executes the selected tools.
5. **Recovery:** Retries failed operations and attempts to recover from execution errors.
6. **Remember:** Stores the outcome for future context.

## Tech Stack

| Category               | Technologies                   |
| ---------------------- | ------------------------------ |
| Language & Runtime     | TypeScript, Node.js            |
| Agent Framework        | LangGraph.js, LangChain        |
| LLM                    | Anthropic Claude               |
| Database               | PostgreSQL                     |
| Validation             | Zod                            |
| Integrations           | Gmail API, Google Calendar API |
| Browser Automation     | Playwright                     |
| Agent Interoperability | Model Context Protocol (MCP)   |
| Infrastructure         | Docker, Docker Compose         |

## Available Tools

| Tool                    | Description                                  |
| ----------------------- | -------------------------------------------- |
| `gmail_search`          | Search emails using a query                  |
| `gmail_create_draft`    | Create an email draft                        |
| `gmail_send`            | Send an email                                |
| `calendar_list_events`  | Retrieve calendar events within a time range |
| `calendar_create_event` | Create a calendar event                      |
| `browse_page`           | Open and inspect web pages using Playwright  |

## Project Structure

```text
lifeops/
├── src/
│   ├── agent/
│   │   ├── graph.ts
│   │   ├── planner.ts
│   │   ├── mock-planner.ts
│   │   ├── run.ts
│   │   └── state.ts
│   ├── tools/
│   │   ├── browser.ts
│   │   ├── calendar.ts
│   │   ├── gmail.ts
│   │   ├── mock.ts
│   │   ├── index.ts
│   │   └── types.ts
│   ├── eval/
│   ├── mcp/
│   ├── config.ts
│   ├── memory.ts
│   └── cli.ts
├── tests/
├── eval/
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js
- npm
- Docker Desktop
- Anthropic API key (required for LLM-powered execution)
- Google API credentials (required for Gmail and Calendar integrations)

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/lifeops.git
cd lifeops
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install Playwright browser

```bash
npx playwright install chromium
```

### 4. Configure environment variables

Create your local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Configure the required values in `.env`:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key
LLM_MODEL=claude-sonnet-5-5

DATABASE_URL=postgresql://lifeops:lifeops@localhost:5432/lifeops
TIMEZONE=Asia/Kolkata

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

MAX_RETRIES=3
MAX_RECOVERIES=2
```

Keep `.env` private. Never commit API keys, OAuth credentials, or refresh tokens.

### 5. Start PostgreSQL

```bash
docker compose up -d db
```

### 6. Run the agent

**Mock mode (no API keys or database required):**

```bash
npm run dev -- --mock "Schedule a 30 minute meeting with alice@example.com tomorrow at 3pm"
```

Mock mode uses a deterministic planner, simulated tools, in-memory storage, and an in-memory checkpointer. It is useful for testing the workflow without making external API calls.

**Real mode:**

```bash
npm run dev -- "Search my unread emails"
```

Real mode requires the configured Anthropic API, PostgreSQL database, and relevant Google credentials.

## Development & Testing

Run the TypeScript type checker:

```bash
npm run typecheck
```

Run the test suite:

```bash
npm test
```

Build the project:

```bash
npm run build
```

Run the evaluation pipeline:

```bash
npm run eval
```

The evaluation pipeline measures:

- Tool selection accuracy
- Execution success rate
- Task completion rate
- Error recovery performance

## Safety & Reliability

LifeOps is designed with safeguards around automated execution:

- Actions are presented for approval before execution.
- Tool arguments are validated against predefined Zod schemas.
- Failed operations are retried with exponential backoff.
- Recovery attempts are bounded by configurable limits.
- Mock mode enables workflow testing without executing real external actions.
- API credentials are loaded through environment variables.

**Note:** Real Gmail and Calendar operations can modify external accounts. Review proposed actions carefully before approving them.

## Current Status

LifeOps currently includes the agent workflow, mock execution mode, tool abstractions, PostgreSQL-backed memory and checkpointing, and an automated test suite.

Real-world Gmail, Calendar, and browser integration testing, along with broader evaluation benchmarking, are ongoing.

## Future Improvements

- Expand the evaluation dataset and benchmark agent performance.
- Add more integrations and reusable tools.
- Improve context retrieval and long-term memory.
- Add execution tracing and observability.
- Introduce more robust recovery strategies for complex workflows.

---

**LifeOps – From natural-language intent to approved execution.**

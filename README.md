# XLIFF AI Translator

Production-ready web application that translates **XLIFF** files (`.xlf` / `.xliff`) into **German** using Google Gemini, while preserving the original XLIFF structure, IDs, metadata, placeholders, and inline tags — so the output remains usable in Text-to-Speech workflows.

## Features

- Upload `.xlf` / `.xliff` (one file at a time)
- Automatic XLIFF **1.2** and **2.0** detection
- Automatic source language detection (from XLIFF attributes, with text fallback)
- Target language: **German** (v1)
- Placeholder & inline-tag protection (`{name}`, `{{var}}`, `%CODE%`, `<ph>`, `<g>`, `<x>`, SSML-like tags)
- Batched Gemini translation with retries and rate-limit handling
- Translation preview (search + pagination)
- Download translated XLIFF (`*_de.xlf` / `*_de.xliff`)
- Translation history (MySQL when configured; in-memory fallback otherwise)
- Secure API key handling (backend only)

## Technology stack

| Layer    | Stack                                      |
| -------- | ------------------------------------------ |
| Frontend | React, Vite, TypeScript, Tailwind CSS      |
| Backend  | Node.js, Express, TypeScript               |
| Database | MySQL                                      |
| AI       | Google Gemini (`@google/generative-ai`)    |

## Folder structure

```
translator/
├── frontend/               # React + Vite UI
├── backend/                # Express API + XLIFF/Gemini pipeline
├── database/schema.sql     # MySQL schema
├── uploads/                # Temporary uploads
├── output/                 # Generated XLIFF files
├── tests/samples/          # Sample XLIFF fixtures
├── .env.example
└── README.md
```

## Prerequisites

- **Node.js** 18+ (recommended 20+)
- **MySQL** 8+ (optional for first run — app falls back to in-memory job store)
- A **Google Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)

## MySQL setup

1. Install and start MySQL.
2. Create the database and tables:

```bash
mysql -u root -p < database/schema.sql
```

Or run the SQL in `database/schema.sql` from your MySQL client.

## Environment configuration

1. Copy the example env file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

2. Edit `.env` and set at least:

```env
GEMINI_API_KEY=your_real_api_key_here
PORT=4000
FRONTEND_URL=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=xliff_translator
```

**Where to add the Gemini key:** put it only in the project-root `.env` file as `GEMINI_API_KEY`. Never put it in frontend code or commit `.env`.

## Install dependencies

From the repository root:

```bash
npm run install:all
```

Or separately:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## Start the application

### Backend (port 4000)

```bash
npm run dev:backend
```

### Frontend (port 5173)

```bash
npm run dev:frontend
```

Open **http://localhost:5173** in your browser.

The Vite dev server proxies `/api` to the backend.

## How to test an XLIFF file

1. Start backend + frontend.
2. Open the Translator page.
3. Upload a sample from `tests/samples/`:
   - `sample_en_1.2.xliff`
   - `sample_en_2.0.xliff`
4. Confirm detected version, source language, and segment count.
5. Click **Start Translation**.
6. Wait for progress to reach **Completed**.
7. Review the preview table.
8. Click **Download German XLIFF**.
9. Open the downloaded file and verify:
   - XML / XLIFF is valid
   - Placeholders like `{username}` and `{{minutes}}` are unchanged
   - `<ph>` / `<g>` tags are preserved
   - `<target>` contains German text

### Backend unit tests (parser / placeholders / rebuild)

```bash
cd backend
npm test
```

## Supported XLIFF versions

- **XLIFF 1.2** — `<trans-unit>`, `<source>`, `<target>`
- **XLIFF 2.0** — `<unit>`, `<segment>`, `<source>`, `<target>`

## How translation works

1. Upload & validate file type / XML / XLIFF
2. Detect version and source language
3. Extract translatable segments
4. Protect placeholders and inline tags with temporary tokens (`__PH_N__`)
5. Send batches to Gemini (default batch size 25, configurable)
6. Validate placeholder integrity; retry with a stricter prompt if needed
7. Restore placeholders and surgically insert `<target>` text into the original XML
8. Re-validate generated XLIFF before download

The Gemini API key never leaves the backend.

## Adding new languages later

V1 hard-codes German, but the code is structured for extension:

1. Add entries to `SUPPORTED_TARGET_LANGUAGES` in `backend/src/types/index.ts`
2. Accept a `targetLanguage` on `POST /api/translate/start`
3. Pass the language name into `GeminiTranslator.translateBatch`
4. Update the frontend language display / selection UI

Future candidates called out in the product brief: French, Spanish, Arabic, Hindi, Portuguese, Italian.

## API overview

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/translate/upload` | Upload XLIFF (`multipart` field `file`) |
| `POST` | `/api/translate/start` | Start job `{ "jobId": "..." }` |
| `GET`  | `/api/translate/:jobId` | Job status / progress |
| `GET`  | `/api/translate/:jobId/preview` | Preview segments (`q`, `page`, `pageSize`) |
| `GET`  | `/api/translate/:jobId/download` | Download translated XLIFF |
| `GET`  | `/api/translation-history` | History list |
| `GET`  | `/api/health` | Health + Gemini/DB status |

## Security notes

- File type and size limits
- DOCTYPE / ENTITY blocked (XXE protection)
- Gemini key only in backend `.env`
- CORS limited to `FRONTEND_URL`
- Temporary uploads cleaned after successful translation
- User-facing errors are sanitized; details logged server-side

## Production build

```bash
npm run build
npm run start:backend
# serve frontend/dist with any static host, or `npm run preview --prefix frontend`
```

## License

Private / project use unless otherwise specified.

# XLIFF AI Translator

Production-ready web application that translates **XLIFF** files (`.xlf` / `.xliff`) into a selected target language using **Gemini** or **Anthropic**, while preserving the original XLIFF structure, IDs, metadata, placeholders, and inline tags — so the output remains usable in Text-to-Speech workflows.

## Features

- Upload `.xlf` / `.xliff` (one file at a time)
- Automatic XLIFF **1.2** and **2.0** detection
- Automatic source language detection (from XLIFF attributes, with text fallback)
- Target language selection: German, French, Spanish, Italian, Portuguese, Dutch
- Dynamic AI provider/model configuration (Settings page, stored in MySQL)
- Placeholder & inline-tag protection (`{name}`, `{{var}}`, `%CODE%`, `<ph>`, `<g>`, `<x>`, SSML-like tags)
- Batched AI translation with retries and rate-limit handling
- Translation preview (search + pagination)
- Download translated XLIFF (`*_{lang}.xlf`)
- Translation history (MySQL)
- Automatic output backup to dated backup folders
- Secure API key handling (MySQL only, never returned to frontend)

## Technology stack

| Layer    | Stack                                      |
| -------- | ------------------------------------------ |
| Frontend | React, Vite, TypeScript, Tailwind CSS      |
| Backend  | Node.js, Express, TypeScript               |
| Database | MySQL                                      |
| AI       | Google Gemini or Anthropic (configured in Settings) |

## Folder structure

```
translator/
├── frontend/               # React + Vite UI
├── backend/                # Express API + XLIFF/Gemini pipeline
├── database/schema.sql     # MySQL schema
├── uploads/                # Temporary uploads (removed after successful translation)
├── output/                 # Primary translated XLIFF files (served for download)
├── backup/                 # Dated backup copies (YYYY/MM/DD/)
├── tests/samples/          # Sample XLIFF fixtures
├── .env.example
└── README.md
```

## Prerequisites

- **Node.js** 18+ (recommended 20+)
- **MySQL** 8+ (required for settings persistence and translation history)
- AI provider API key (configure in **Settings** after first run)

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
PORT=4010
FRONTEND_URL=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=xliff_translator
```

Configure the AI provider, model, and API key from the **Settings** page in the UI. Keys are stored in MySQL and are never returned to the browser.

**VPS storage (recommended for production):**

```env
UPLOAD_DIR=storage/uploads
OUTPUT_DIR=storage/output
BACKUP_DIR=storage/backup
```

These directories are created automatically on startup if they do not exist.

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
5. Select a **target language** and click **Start Translation**.
6. Wait for progress to reach **Completed**.
7. Review the preview table.
8. Click **Download** for the translated XLIFF.
9. Open the downloaded file and verify:
   - XML / XLIFF is valid
   - Placeholders like `{username}` and `{{minutes}}` are unchanged
   - `<ph>` / `<g>` tags are preserved
   - `<target>` contains text in the selected language
   - `target-language` / `trgLang` matches the selected language code

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
5. Send batches to the configured AI provider (default batch size 8, configurable)
6. Validate placeholder integrity; retry with a stricter prompt if needed
7. Restore placeholders and surgically insert `<target>` text into the original XML
8. Write output to `output/`, create a dated backup copy in `backup/YYYY/MM/DD/`
9. Remove the temporary upload file
10. Re-validate generated XLIFF before download

AI credentials are loaded from MySQL on every translation — no restart required after changing Settings.

## Adding new target languages

1. Add entries to `SUPPORTED_TARGET_LANGUAGES` in `backend/src/types/index.ts`
2. Add matching entries to `TARGET_LANGUAGES` in `frontend/src/types/index.ts`
3. Restart is not required — the backend validates against the updated map on the next deploy

## API overview

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/translate/upload` | Upload XLIFF (`multipart` field `file`) |
| `POST` | `/api/translate/start` | Start job `{ "jobId": "...", "targetLanguage": "de" }` |
| `GET`  | `/api/settings` | AI provider settings (`hasApiKey` only, no key) |
| `PUT`  | `/api/settings` | Save AI provider settings |
| `GET`  | `/api/health` | Health + DB/AI configuration status |

| `GET`  | `/api/translate/:jobId` | Job status / progress |
| `GET`  | `/api/translate/:jobId/preview` | Preview segments (`q`, `page`, `pageSize`) |
| `GET`  | `/api/translate/:jobId/download` | Download translated XLIFF |
| `GET`  | `/api/translation-history` | History list |

## Security notes

- File type and size limits
- DOCTYPE / ENTITY blocked (XXE protection)
- AI API keys stored in MySQL only; never returned to the frontend
- CORS limited to `FRONTEND_URL`
- Temporary uploads removed after successful translation
- User-facing errors are sanitized; details logged server-side

## Production deployment (VPS)

### Directory layout

```text
/var/www/xliff-translator/
├── app/          # application code (git checkout or release artifact)
├── uploads/      # temporary uploads
├── output/       # primary translated files (served for download)
└── backup/       # dated backup copies (YYYY/MM/DD/)
```

Set in `.env`:

```env
UPLOAD_DIR=storage/uploads
OUTPUT_DIR=storage/output
BACKUP_DIR=storage/backup
```

### Preserve data across deployments

**Do not delete** `backend/storage/` during deploy. Only replace application code (`backend/dist`, `frontend/dist`).

Recommended deploy steps:

1. Pull or copy new code into `app/`
2. Run `npm run build` inside `app/`
3. Restart the backend process (`npm run start:backend` or your process manager)
4. Serve `frontend/dist` with nginx or another static host

### Filesystem permissions

The backend automatically creates `backend/storage/{uploads,output,backup}` on startup. Ensure the user running the Node process has read/write permissions in the `backend` folder.


### Backup strategy

Every successful translation:

1. Writes the output file to `OUTPUT_DIR`
2. Copies it to `BACKUP_DIR/YYYY/MM/DD/{jobId}_{filename}`

Primary downloads always use `OUTPUT_DIR`. If a primary file is lost, restore from the dated backup tree.

### Process restarts

Output files and backups live on disk — they survive application restarts, server reboots, and code updates as long as the storage directories are preserved.

## Production build

```bash
npm run build
npm run start:backend
# serve frontend/dist with any static host, or `npm run preview --prefix frontend`
```

## License

Private / project use unless otherwise specified.

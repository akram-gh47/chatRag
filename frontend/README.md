# Chat RAG Frontend

Single-page React application that talks to the FastAPI backend:

1. Uploads a PDF via `/upload-pdf`.
2. Stores the returned `doc_id`.
3. Sends chat prompts plus history to `/chat` and renders answers + sources.

## Prerequisites

- Node.js 18+ (ships with npm)
- Backend running locally on `http://localhost:8000` (default FastAPI port)

## Getting started

```bash
cd frontend
npm install
cp env.example .env   # adjust when backend runs on a different host
npm run dev
```

Visit `http://localhost:5173`. Upload a PDF, wait for the success banner, then start asking questions.

## Environment

| Variable            | Default                 | Description                               |
|---------------------|-------------------------|-------------------------------------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL of the FastAPI backend endpoints |

## Available scripts

| Script        | Description                              |
|---------------|------------------------------------------|
| `npm run dev` | Starts Vite in dev mode with hot reload  |
| `npm run build` | Builds the production bundle |
| `npm run preview` | Serves the production build locally |

## Folder structure

```
frontend/
├── src/
│   ├── lib/api.js        # REST helpers
│   ├── App.jsx           # Main UI
│   └── main.jsx          # React bootstrap
├── public/               # (add static assets here)
├── index.html
└── vite.config.js
```


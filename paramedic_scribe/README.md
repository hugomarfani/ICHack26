# SMART ePCR (Paramedic Scribe)

A Flutter handover-first ePCR capture tool with **semantic search** and optional **AI augmentation** to speed up documentation and reduce missed fields.

This repo contains:
- `paramedic_scribe/`: the Flutter app (this folder)
- `semantic_search_backend/`: a lightweight FastAPI service that powers semantic suggestions and pathway inference
- `proxy_server.py`: an optional local proxy for API calls (used for some web / local setups)

> Disclaimer: Navigation aid only; not clinical decision support.

## What It Does
The app helps a clinician capture a structured patient report with fewer clicks:

- **Simplified workflow**: start from either **Manual** mode (fill fields as normal) or **Prompt** mode (describe the case and generate a smart, reduced form).
- **Semantic field suggestions**: in Prompt mode, the app calls the semantic backend to select the most relevant AEPR/NHS-style fields for the situation.
- **Protocol guidance (JRCalc)**: optionally infer or select a pathway; the app can surface protocol-relevant fields and step-through a protocol wizard.
- **AI augmentation (optional)**: with a Claude API key, the app can extract structured values from a free-text prompt and **auto-fill** matching fields (without guessing).
- **Local-first**: report progress is stored locally so sessions can be resumed.

## Using The App
- Home -> **New Report** -> choose **Manual** (full form) or **Prompt** (smart reduced form).
- Prompt mode: write a short case description, optionally pick a JRCalc pathway, optionally enable **AI Autofill**, then generate the report.
- During a report: complete sections, run protocol wizards where available, export/share a PDF when finished.

## How Prompt Mode Works (High Level)
1. You type a short free-text description (and optionally choose a JRCalc pathway).
2. The app asks the backend to **infer a likely pathway** (`POST /pathways/suggest`) when you haven't selected one.
3. The app asks the backend for **semantic suggestions** (`POST /suggest`) and maps the returned IDs to field IDs in the form schema.
4. The report is built as a small set of sections:
   - Essential fields
   - Baseline required fields
   - Protocol-driven fields (if a pathway is selected)
   - Suggested fields (semantic search)
5. If **AI Autofill** is enabled, the app sends your prompt + field list to Claude (via a local proxy endpoint) and fills only fields with explicit values.

## Data Sources (NHS / AEPR / JRCalc)
The form schema and protocol content are loaded from JSON assets shipped with the app:
- `paramedic_scribe/assets/Merged_Clinical_Attributes.json` and `paramedic_scribe/assets/Macro_Category_Mapping.json` drive the section/field layout (AEPR-style attributes).
- `paramedic_scribe/assets/JRCALC_Protocols.json` provides JRCalc pathways used for searching and the protocol wizard.

The semantic backend's `categories.json` is aligned to these field IDs, enabling "suggested fields" to map directly back into the form.

## Prerequisites
- Flutter / Dart (the app targets Dart SDK `^3.10.8` per `pubspec.yaml`)
- Python (for the semantic backend)

## Quickstart (Windows PowerShell)
### 1) Start the semantic backend (required for semantic suggestions)
From the repo root:

```powershell
cd semantic_search_backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Optional: avoid model downloads (forces TF-IDF embeddings)
$env:EMBEDDER_MODE = "tfidf"

uvicorn main:app --host 0.0.0.0 --port 8000
```

Health check (in a new terminal):
```powershell
curl.exe http://localhost:8000/docs
```

If you don't run the backend, the app can still be used in Manual mode, and Prompt mode will still build baseline/protocol sections, but it won't add semantic "Suggested Fields" or auto-infer pathways.

### 2) Run the Flutter app
In a separate terminal:

```powershell
cd paramedic_scribe
flutter pub get

# Desktop / web (example)
flutter run -d chrome

# Or Android (emulator/device)
flutter run
```

## Configuration (AI / Keys)
The app stores API keys in the platform secure store (`flutter_secure_storage`) via the **Settings** screen.

## Privacy & Safety
- This is a hack/demo project and is **not** clinical decision support.
- If you enable **AI Autofill**, your free-text prompt (which may include patient data) is sent to the local backend and then forwarded to the configured AI provider. Only enable this in environments where that is acceptable.
- The semantic suggestion backend is intended to be lightweight and deterministic, but you should still validate all captured data before handover.

### Claude (AI Autofill)
AI autofill uses `paramedic_scribe/lib/services/claude_service.dart`, which calls:
- `POST http://localhost:8000/claude`

That endpoint is implemented by the FastAPI backend in `semantic_search_backend/main.py` and forwards requests to Anthropic.

Notes:
- If you run on an **Android emulator/device**, `localhost` refers to the device itself. You may need to run the backend on the device, tunnel it, or update the base URL to your host IP.
- Autofill is designed to be conservative: it only fills fields Claude can extract explicitly and does not fabricate values.

### ElevenLabs (speech-to-text)
There is a stub service at `paramedic_scribe/lib/services/elevenlabs_service.dart` that posts to `POST /transcribe`.

If you want to enable it locally, use `proxy_server.py` (it provides `POST /transcribe` and `POST /claude`) or implement `/transcribe` in the FastAPI backend. The UI wiring for speech-to-text may still be in progress.

## Running On Android (Backend Connectivity)
Semantic suggestions use `paramedic_scribe/lib/services/semantic_search_service.dart`:
- Android emulator: calls `http://10.0.2.2:8000` (host machine's localhost)
- Web/desktop: calls `http://localhost:8000`

For a physical device, you'll typically need to point to your machine's LAN IP (and ensure firewall rules allow inbound connections).

## What "Semantic Search" Means Here
The backend (`semantic_search_backend/`) ranks AEPR/NHS-style fields using:
- Embedding similarity (SentenceTransformers if available, otherwise TF-IDF)
- A small deterministic rules layer to boost/force safety-critical categories
- Thresholding to avoid flooding results on vague input

The app then uses those IDs to show only the most relevant fields for the current case.

## Export / Sharing
The app can export a report to PDF via `pdf` + `printing` and share it via `share_plus` (see `paramedic_scribe/lib/services/pdf_export_service.dart`).

## Troubleshooting
- Backend not reachable on Android emulator: confirm the backend is running on your host and reachable at `http://10.0.2.2:8000/docs`.
- Backend not reachable on web: confirm `http://localhost:8000/docs` loads and nothing else is using port `8000`.
- Model download slow/offline: set `EMBEDDER_MODE=tfidf` before starting the backend.

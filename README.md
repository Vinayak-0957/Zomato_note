# Zomato_note
capstone project of zomato_note
# Zomato Notes — AI-Augmented Internal Knowledge Base

A capstone project: an internal notes/knowledgebase app for on-call support engineers,
with a FastAPI + SQLAlchemy backend, a plain HTML/CSS/JS dashboard, a hand-written
ranking/search engine, and an LLM-based auto-tagger + local semantic search layer.

---

## 1. Setup

### Prerequisites
- Python 3.10+
- pip

### Database
This project uses **SQLite** (local file, no signup, works fully offline) — `notes.db`
is created automatically in `backend/` the first time the app or seed script runs.

### Steps

```bash
# 1. Clone the repo
git clone <YOUR_REPO_URL>
cd zomato-notes/backend

# 2. Create and activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux
# Leave MOCK_AI=1 — this is the graded default and needs no API key.

# 5. Seed the database (creates notes.db, resets and reloads all seed data)
python seed.py
```

Expected output:
```
Success: Database seeded with Part 1, 2, and 3 data!
```

---

## 2. Running the app

### Backend
```bash
cd backend
uvicorn main:app --reload
```
Runs on `http://127.0.0.1:8000`. Interactive API docs at `http://127.0.0.1:8000/docs`.

### Frontend
In a second terminal:
```bash
cd frontend
python -m http.server 5500
```
Open `http://127.0.0.1:5500` in a browser.

### CORS configuration
The backend explicitly allows only these origins (see `ALLOWED_ORIGINS` in
`backend/main.py`) — **not** a wildcard:
```
http://127.0.0.1:5500
http://localhost:5500
```

---

## 3. Part 1 — Core App (Backend + Dashboard)

### 3.1 CRUD endpoints
All 6 Notes/Users CRUD endpoints, visible and testable at `/docs`:
`POST /users`, `POST /notes`, `GET /notes`, `GET /notes/{id}`, `PUT /notes/{id}`, `DELETE /notes/{id}`.

### 3.2 Validation errors (422)

**Missing required field:**
```
Request: POST /users  { "email": "a@a.com", "password": "password123" }
Response: 422
<PASTE YOUR ACTUAL RESPONSE BODY HERE>
```

**Malformed email:**
```
Request: POST /users  { "name": "Test", "email": "not-an-email", "password": "password123" }
Response: 422
<PASTE YOUR ACTUAL RESPONSE BODY HERE>
```

**Over-length title:**
```
Request: POST /notes  { "title": "<121+ character string>", "content": "x", "owner_id": 1 }
Response: 422
<PASTE YOUR ACTUAL RESPONSE BODY HERE>
```

### 3.3 NOT NULL / UNIQUE constraint violations

**Duplicate email (violates UNIQUE):**
```
Request: POST /users  { "name": "Dup", "email": "alice@example.com", "password": "password123" }
Response: 400
<PASTE YOUR ACTUAL RESPONSE BODY HERE>
```

### 3.4 Auth-gated delete
```
DELETE /notes/1  (no x-token header)          -> 401 <paste response>
DELETE /notes/1  (x-token: wrong)              -> 403 <paste response>
DELETE /notes/1  (x-token: zomato-admin-secret) -> 200 <paste response>
```

### 3.5 X-Process-Time header
```
<PASTE a curl -i or Swagger response header showing X-Process-Time: ...>
```

### 3.6 Background task (non-blocking)
```
Request sent at:      <timestamp from your response / client>
Response returned at: <timestamp — should be near-instant>
Background log line:  <paste the "[Background] Indexing complete..." log from
                        the uvicorn terminal, ~2s later>
```

### 3.7 owner_id validation
```
POST /notes  { owner_id: 999 (does not exist) } -> 404 <paste response>
POST /notes  { owner_id: 1   (exists) }          -> 200 <paste response>
```

### 3.8 Bulk import
```
POST /notes/import?owner_id=1  (sample_import.txt, valid owner)
-> <paste response, e.g. {"message":"Successfully imported 6 notes"}>

POST /notes/import?owner_id=999 (sample_import.txt, invalid owner)
-> 404 <paste response> — confirm GET /notes shows zero new notes from this call
```

### 3.9 Raw SQL reporting endpoints

```
GET /reports/tag-summary
<PASTE RESPONSE — must show exactly: work(3), health(2), recipes(2), random(2)>

GET /reports/long-notes
<PASTE RESPONSE>

GET /reports/user-notes
<PASTE RESPONSE>
```

### 3.10 Frontend — end-to-end integration

```
1. Added a note via the UI form.
   Network tab: POST /notes -> 200
   <paste request/response>

2. Refreshed the browser (F5) — note was still present (confirms server-side
   persistence, not just in-memory state).

3. Deleted a note via the UI.
   Network tab: DELETE /notes/{id} -> 200, request headers included x-token
   <paste request/response>

4. Refreshed the browser — note stayed deleted.
```

### 3.11 Responsive layout
The following media query switches the layout to a single column below 600px width
(`frontend/style.css`):
```css
@media (max-width: 600px) {
    main { flex-direction: column; }
    .nav-group { flex-direction: column; }
    aside { order: 2; }
    #content-area { order: 1; }
}
```
Verified by resizing the browser window / using DevTools device toolbar below 600px —
sidebar moves below the main content.

### 3.12 Debounced search
Verified by typing in the search box while watching DevTools Network tab: no
`GET /notes/search` request fires per keystroke — exactly one request fires ~400ms
after typing stops. (Implemented via `setTimeout`/`clearTimeout` in `script.js`.)

### 3.13 Recursive category tree
`CATEGORY_TREE` (9 nodes, 4 displayed levels) renders via a single recursive function
(`renderTreeNode` in `script.js`) and every node's expand/collapse toggle works via
`classList.toggle()`.

---

## 4. Part 2 — Integrated Ranking Engine

None of `insertion_sort_by_key`, `binary_search_iterative`, `binary_search_recursive`,
or `linear_search` (in `backend/algorithms.py`) call `sorted()`, `.sort()`, or any
imported search/sort utility.

### 4.1 Keyword relevance search
```
GET /notes/search?keyword=apple
<PASTE RESPONSE — top result should be an apple-heavy note>

GET /notes/search?keyword=coffee
<PASTE RESPONSE — visibly different top result>
```

### 4.2 Date sort (same function, different key — proves reuse)
```
GET /notes/search?sort_by=date
<PASTE RESPONSE>
```

### 4.3 Exact title lookup (both algorithms)
```
GET /notes/lookup?title=Apple Harvest Notes&algo=iterative
<PASTE RESPONSE>

GET /notes/lookup?title=Apple Harvest Notes&algo=recursive
<PASTE RESPONSE — same result>

GET /notes/lookup?title=Nonexistent Title A&algo=iterative -> 404
GET /notes/lookup?title=Nonexistent Title B&algo=recursive -> 404
<paste both — total of 5 present-title tests + 2 absent-title tests across both algos>
```

### 4.4 Quick tag jump
```
GET /notes/quick-find?tag=work
<PASTE RESPONSE>

GET /notes/quick-find?tag=doesnotexist
<PASTE RESPONSE — {"message": "not found", ...}, not a crash>
```

### 4.5 Frontend integration (Network tab evidence)
```
- "Sort by" control -> fired GET /notes/search?sort_by=date, rendered results
- "Jump to exact title" -> fired GET /notes/lookup?..., rendered matching note
- "Quick tag jump" buttons -> fired GET /notes/quick-find?tag=..., rendered result
<paste the actual Network tab request/response text for each>
```

---

## 5. Part 3 — Integrated Intelligence Layer

### 5.1 AI service — mock mode
`MOCK_AI=1` is set by default; `get_ai_response()` never raises on a missing API key
in this mode — no signup, no key, no internet required. This is the graded baseline.

The five-part prompt template (Instructions / Context / Input / Constraints / Output
Format) lives verbatim in `backend/ai_service.py` as `PROMPT_TEMPLATE`.

*(Optional real-path extension, if you wired one up:)*
```
Real AI path: Groq free tier
Signup: https://console.groq.com — free account, no payment required
Rate limits (as of testing): <fill in current limits from Groq's docs>
```

### 5.2 Auto-tagging on real note creation
```
POST /notes  { "title": "...", "content": "...", "owner_id": 1 }
<PASTE FULL RESPONSE — must include populated ai_suggestion: {tags: [...], summary: "..."}>
```
Frontend: the new note's card rendered an "AI Suggests" panel with tags/summary and
a working "Apply as tag" button (confirmed via `PUT /notes/{id}` in Network tab).

### 5.3 JSON parse failure handling
`json.loads` failures in `main.py`'s `POST /notes` handler are caught and logged;
the note is still created with `ai_suggestion: null` rather than the request crashing.

### 5.4 Local semantic search (no LLM call, no API key)
Uses `sentence-transformers==3.0.0` (pinned exactly in `requirements.txt`) with the
required `sentence-transformers/all-MiniLM-L6-v2` model.

**One-time setup note:** the first time this model runs on any machine, it downloads
and caches the pretrained weights under `~/.cache/huggingface` — this first run needs
internet access. Every run after that, on any machine, uses the cached weights and
needs zero internet access and zero API key.

```
GET /notes/smart-search?q=leg day exercise plan
<PASTE RESPONSE — "Gym schedule change" must be in the top 3>

GET /notes/smart-search?q=dinner ideas with vegetables
<PASTE RESPONSE — "Recipe idea" must be in the top 3>
```

The "Smart Search (AI)" control in the frontend is visually and functionally distinct
from the plain keyword search box (Part 2): one ranks by embedding cosine similarity,
the other by literal keyword-occurrence count.

---

## 6. Git workflow

Work was done on one feature branch per part, each merged into `main` via a Pull
Request:
- `part1-core-app` → PR → merged
- `part2-ranking-engine` → PR → merged
- `part3-intelligence-layer` → PR → merged

See the repository's Pull Requests / commit history for the full trail of
incremental, meaningfully-messaged commits.

---

## 7. Secrets

`backend/.env.example` lists only the required variable names (`MOCK_AI`,
`GROQ_API_KEY`) with no real values. The actual `backend/.env` (with any real key)
is excluded from version control via `.gitignore` and was never committed.

---

## 8. Repository layout

```
zomato-notes/
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   ├── crud.py
│   ├── algorithms.py
│   ├── ai_service.py
│   ├── semantic_search.py
│   ├── ranking_dataset.py
│   ├── ai_sample_notes.py
│   ├── seed.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── sample_import.txt
└── README.md
```

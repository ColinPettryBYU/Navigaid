# GovAid Assistance

## App Summary
GovAid Assistance is a full-stack web application prototype designed to help individuals locate and understand government aid programs, particularly housing-related assistance. The primary user is an applicant who may feel overwhelmed by complex eligibility requirements and unclear processes. The application provides a guided, chat-style experience to make navigating available resources more intuitive and approachable.
This iteration introduces a backend service and persistent data layer, transforming the application from a static frontend into a data-driven system. A PostgreSQL database stores system data using the schema defined in /db/schema.sql, with realistic sample records provided in /db/seed.sql. The implemented vertical slice enables persistent chat messaging: when a user sends a message in the Search Results view, it is saved to the database through the Express API and immediately rendered in the UI. Refreshing the page confirms the message persists. Saved conversations can also be starred to keep important threads pinned near the top, and conversations can be permanently deleted from the results view.

## Working Features
- **Site logo** — Custom logo displayed in the header (all pages) and as the hero image on the landing page
- **Persistent chat history** — Messages sent on the Chat page are saved to PostgreSQL and survive page refreshes
- **Conversation management** — Create, star/unstar, and delete saved chat sessions from the chat view
- **LLM-powered responses** — User messages are answered by Google Gemini (2.5 Flash), with full conversation context passed for multi-turn dialogue
- **Typewriter effect** — Assistant replies type out character-by-character for a polished chatbot feel
- **Guided landing page** — Users describe their situation on the home page and are routed into a new chat session
- **User authentication** — Full login and signup flow with PBKDF2-SHA512 password hashing; protected routes redirect unauthenticated users to login
- **Guest chat mode** — Users can chat with the AI without creating an account; conversations are stored locally in the browser and a banner prompts sign-up to save them
- **Guest-to-account migration** — When a guest creates an account, all local conversations are automatically migrated to their new database account
- **Eligibility profile** — Authenticated users can save household size, income, employment, housing, disability, and veteran status; the save button only appears when a field has changed
- **Informational pages** — Fully themed Privacy Policy, Terms of Service, Accessibility statement, and Contact/FAQ pages accessible from the footer
- **Logout functionality** — Authenticated users can securely log out, which clears their session from localStorage and redirects them to the login page.
- **Cross-page chat entry points** — The chat (`/results`) is reachable from multiple pages: the home page search bar and "Smart Match" button, the Benefits Guide "Chat with our AI" button, the Contact page "Open Chat" button, and the top navigation bar.
- **Program cards in chat** — When the AI recommends an aid program, a structured program card appears inline. Users can click "Add to Applications" to save that program to their applications list (POST to the API), "Learn More" to ask the AI a follow-up question about it, or visit the program's official site directly.
- **Application progress in chat** — If the user has added an application, a step-progress card is rendered inside the chat showing the required steps. Users can check off individual steps as they complete them; each toggle is saved immediately to the database.
- **Profile prompts in chat** — The AI can trigger inline form prompts (dropdowns, number inputs) to collect or update profile fields (income, household size, employment status, etc.) without leaving the chat.
- **Context-aware AI responses** — For authenticated users the backend builds a rich context object (added applications + progress, profile data, full program catalog, required documents) and passes it to Gemini so answers are personalized to the user's situation.

## EARS Requirements
**Complete**
- The system shall securely store and protect all user-provided personal and housing information while limiting AI’s ability to access such information
- The system shall track users’ and processes’ data to better understand the users’ needs and situations
- While the user is logged in on the website, the views will be customized to them to make it feel more comfortable and personal
- The system shall provide centralized access to government aid information
- The system shall allow users to access aid information without creating an account
- The system shall securely authenticate users before granting access to personal data

**Not Complete**
- The system shall display clear, plain-language explanations of eligibility requirements
- When a user submits an application, the system shall update the application status
- When the user creates an account, the listings and information shall be tailored to the user’s location by default
- When an application is approved, the next steps will be linked
- While a user is on a waitlist/pending, the system shall show waitlist/pending status and any required user actions

## Tech Stack
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, React Query
- **Backend:** Node.js, Express, CORS, dotenv
- **Database:** PostgreSQL (`pg` driver)
- **LLM:** Google Gemini 2.5 Flash (`@google/generative-ai`)
- **Authentication:** Custom PBKDF2-SHA512 password hashing; localStorage session with server-side validation

## Architecture Diagram
```mermaid
flowchart LR
    U[User] -->|Clicks Send, types message| FE[Frontend React App\n(Vite on :5173)]
    FE -->|HTTP GET/POST /api/sessions/:id/messages| BE[Backend Express API\n(Node on :3001)]
    BE -->|SQL queries| DB[(PostgreSQL aiddb)]
    DB -->|Rows returned| BE
    BE -->|Chat prompt + history| LLM[Google Gemini 2.5 Flash]
    LLM -->|Generated reply| BE
    BE -->|JSON response| FE
    FE -->|Updated thread shown| U
```

## Prerequisites
Install the following tools:

1. **Node.js (LTS)** + npm  
   Install: https://nodejs.org/
2. **PostgreSQL** (server + `psql` client)  
   Install: https://www.postgresql.org/download/
3. **Git**  
   Install: https://git-scm.com/downloads

Verify installations:

```bash
node -v
npm -v
psql --version
git --version
```

## Installation and Setup

1. **Clone the repository**
```bash
git clone <https://github.com/ryan-skyles/GovAidAssistance.git>
cd GovAidAssistance
```

2. **Install backend dependencies:**
```bash
cd backend
npm install
```
3. **Install frontend dependencies:**
```bash
cd ../frontend
npm install
```

4. **Create database** (example using default user)
```bash
createdb aiddb
```

5. **Run schema and seed scripts**
```bash
psql -d aiddb -f db/schema.sql
psql -d aiddb -f db/seed.sql
```

The checked-in schema and seed data already include the `chat_session.is_starred` field used by the conversation pinning UI.

6. **Configure backend environment variables**
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` as needed for your local PostgreSQL credentials and add your Gemini API key:
```
GEMINI_API_KEY=your_key_from_https://aistudio.google.com/apikey
```

7. **(Optional) Configure frontend API base URL**  
If your backend runs somewhere other than `http://localhost:3001`, create `frontend/.env`:
```bash
VITE_API_BASE_URL=http://localhost:3001
```

## Running the Application

Start backend (Terminal 1):
```bash
npm run dev:backend
```

Start frontend (Terminal 2):
```bash
npm run dev:frontend
```

Open in browser:
- Frontend: `http://localhost:8080`
- Backend health check: `http://localhost:3001/health`

## Verifying the Vertical Slice

### Full-stack chat with LLM
The **Send** button on the Search Results page performs a full stack flow:
1. Frontend sends `POST /api/sessions/:id/messages` with the user's text
2. Backend inserts the user message into `chat_message`
3. Backend loads conversation history and sends it to Google Gemini
4. Gemini returns an assistant reply; backend saves it to `chat_message`
5. Backend returns both messages to the frontend
6. Frontend displays the user message instantly, then types out the assistant reply character-by-character
7. Refresh still shows all messages because they reload from DB (`GET /api/sessions/:id/messages`)

### Conversation management
1. Users can star a conversation to pin it near the top of the list.
2. Users can collapse or reveal the starred section from the results page.
3. Users can permanently delete a conversation, which also removes its saved messages through the database cascade.

### Manual verification steps
1. Start backend + frontend.
2. Navigate to the home page (`/`).
3. Type a housing-related question (e.g. "How do I apply for Section 8?") and press Send.
4. Confirm you are taken to the results page and the assistant reply types out.
5. Refresh the browser page.
6. Select the conversation from the list and confirm all messages are still visible.

### Database verification (SQL)
Run this query to verify persisted messages for a session:

```bash
psql -d aiddb -c "SELECT message_id, session_id, sender_type, message_text, timestamp FROM chat_message ORDER BY message_id DESC LIMIT 10;"
```


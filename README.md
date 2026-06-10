# GenFrenzy v2 — Full Feature Build

Real-time multiplayer quiz platform for the GenLayer community.

## Quick Start

```bash
# 1. Start Redis
docker run -d -p 6379:6379 redis:alpine

# 2. Backend
cd backend && npm install && npm run dev   # → http://localhost:4000

# 3. Frontend (new terminal)
cd frontend && npm install && npm run dev  # → http://localhost:3000
```

- **Players:** http://localhost:3000  
- **Admin:**   http://localhost:3000/admin  (password: `genfrenzy2024`)

---

## Features

### Feature 1 — Flexible Questions
Each question supports:
- **Text only** — type the question in the text field
- **Image only** — upload an image, leave text blank
- **Text + Image** — both combined

Images are stored as base64 data URLs (max 5 MB per image).  
Supported formats: JPG, PNG, GIF, WebP.

### Feature 2 — Multi-Correct Questions
- Mark **one or more options** as correct in the admin builder
- Questions with multiple correct answers automatically show a **"SELECT ALL THAT APPLY"** badge
- Players use **checkboxes** and a **Confirm** button instead of immediate single-tap
- **Scoring (time-based, always applies):**
  - Full correct (all options selected, no wrong) = `1000 × (timeLeft/20)` pts
  - Partial correct (some correct, no wrong picks) = `(hits/total) × 1000 × (timeLeft/20)` pts
  - Any wrong option selected OR no correct selected = 0 pts
- Single-answer questions behave exactly as before

### Feature 3 — XLSX Export
- "Download XLSX" button appears on the admin dashboard after the quiz ends
- Generates a native `.xlsx` file (no external libraries) with **3 sheets:**
  1. **Leaderboard** — Rank, Username, Score, Correct, Partial, Wrong, Max Streak
  2. **Q Breakdown** — Per-player per-question result (Correct/Partial/Wrong) + points
  3. **Questions** — Question text, type, and correct answers for reference
- Download happens instantly in the browser — no server roundtrip for file generation

---

## Scoring Reference

| Scenario | Formula |
|---|---|
| Single-answer, correct | `1000 × (timeLeft / 20)` |
| Single-answer, wrong | `0` |
| Multi, all correct, no wrong picks | `1000 × (timeLeft / 20)` |
| Multi, some correct (n/total), no wrong picks | `(n/total) × 1000 × (timeLeft / 20)` |
| Multi, any wrong pick selected | `0` |
| No answer submitted | `0` |

---

## Design System

| Token | Value | Use |
|---|---|---|
| `ink` | `#0A0A0F` | Page background |
| `panel` | `#18181F` | Cards, forms |
| `brand` | `#6C47FF` | Primary accent |
| `blue` | `#3B6EFF` | Option A, links |
| `violet` | `#9B59FF` | Option B, multi-select |
| `teal` | `#00D4B4` | Success, live status |
| `amber` | `#FFB547` | Points, warnings |
| `rose` | `#FF4D6A` | Errors, wrong |
| `emerald` | `#00C98D` | Correct answers |

**Fonts:** Clash Display · Plus Jakarta Sans · JetBrains Mono

---

## File Structure

```
genfrenzy2/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express + Socket.IO entry
│   │   ├── quizEngine.ts         # Timing, scoring, achievements
│   │   ├── redisClient.ts        # Redis ops
│   │   ├── socketHandlers/       # All socket events
│   │   └── types/                # Shared TS types
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Phase router
│   │   │   ├── layout.tsx
│   │   │   ├── globals.css       # Full design system
│   │   │   └── admin/page.tsx    # Admin dashboard
│   │   ├── components/
│   │   │   ├── quiz/             # Landing, Lobby, Question, Feedback
│   │   │   ├── leaderboard/      # Podium + list
│   │   │   ├── achievements/     # Achievement overlay
│   │   │   └── ui/               # Toast, ReconnectBanner
│   │   ├── store/gameStore.ts    # Zustand state
│   │   ├── lib/                  # socket, sounds, useSocketEvents
│   │   └── types/index.ts
│   └── package.json
└── docker-compose.yml
```

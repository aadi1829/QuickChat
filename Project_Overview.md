# QuickChat — Project Overview
> Full-stack astrology consultation platform · Free 3-minute live sessions · FIFO queue · Real-time Socket.IO

---

## Table of Contents
1. [Architecture at a Glance](#1-architecture-at-a-glance)
2. [Tech Stack](#2-tech-stack)
3. [Database Schema](#3-database-schema)
4. [Authentication Flow](#4-authentication-flow)
5. [Client Flow — End to End](#5-client-flow--end-to-end)
6. [Astrologer Flow — End to End](#6-astrologer-flow--end-to-end)
7. [Slot Lifecycle (Cron Jobs)](#7-slot-lifecycle-cron-jobs)
8. [Session Timer Architecture](#8-session-timer-architecture)
9. [Socket.IO — Event Reference](#9-socketio--event-reference)
10. [REST API Reference](#10-rest-api-reference)
11. [Frontend — Context & State](#11-frontend--context--state)
12. [Frontend — Page & Component Map](#12-frontend--page--component-map)
13. [Disconnect & Reconnect Handling](#13-disconnect--reconnect-handling)
14. [Free Chat Eligibility Guard](#14-free-chat-eligibility-guard)
15. [Known Issues & Bugs](#15-known-issues--bugs)
16. [Potential Improvements](#16-potential-improvements)

---

## 1. Architecture at a Glance

```
Browser (React + Vite)
│
├── HTTP (REST via axios)  ──────────────────────────────────────┐
│                                                                │
└── WebSocket (Socket.IO)  ──────────────────────────────────── Express + Socket.IO (Node.js)
                                                                │
                                                                ├── MongoDB (Mongoose)
                                                                │   ├── User
                                                                │   ├── Slot
                                                                │   ├── SlotQueue
                                                                │   ├── Booking
                                                                │   ├── FreeChatUsage
                                                                │   └── Message
                                                                │
                                                                ├── Cloudinary (image uploads)
                                                                │
                                                                └── node-cron (slot lifecycle)
                                                                    ├── every 30s  → activate open slots
                                                                    ├── every 60s  → warn astrologer 5 min before end
                                                                    └── every 60s  → close expired slots
```

**Key design decisions:**
- The session timer lives **entirely on the server**. The client never owns the countdown — it only receives authoritative ticks from `sessionManager.js`.
- Queue ordering is **pure FIFO** based on `SlotQueue.createdAt`, sorted ascending. No priority system.
- Every socket connection is **JWT-authenticated** — no anonymous sockets.
- The server uses **per-user rooms** (`user:<userId>`) and **per-session rooms** (`session:<bookingId>`) so targeted events never bleed across users.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS v4, React Router v6, Socket.IO client |
| State | React Context (AuthContext + ChatContext) |
| HTTP Client | Axios (cookie-based auth + Bearer fallback) |
| Backend | Node.js (ESM), Express 5, Socket.IO v4 |
| Database | MongoDB via Mongoose |
| Auth | JWT (access 15 min · HttpOnly cookie) + Refresh token (7 days · HttpOnly, path-scoped) |
| Media | Cloudinary (profile pics, chat images) |
| Scheduling | node-cron |
| Security | helmet, bcryptjs (12 rounds), constant-time login, role-based route guards |

---

## 3. Database Schema

### `User`
```
_id         ObjectId
email       String  (unique, indexed)
fullName    String
password    String  (bcrypt, 12 rounds)
profilePic  String  (Cloudinary URL)
bio         String
role        Enum["astrologer", "client"]
createdAt / updatedAt
```

### `Slot`
```
_id           ObjectId
astrologerId  ref → User   (indexed)
startAt       Date
endAt         Date
maxClients    Number (default 10)
status        Enum["open", "active", "closed"]  (indexed)
```
**Compound indexes:** `{ astrologerId, startAt }` · `{ status, startAt }`

### `SlotQueue`
```
_id                ObjectId
slotId             ref → Slot     (indexed)
clientId           ref → User
status             Enum["waiting", "active", "completed", "skipped", "cancelled"]
bookedAt           Date
reconnectDeadline  Date | null   ← grace window on disconnect
createdAt / updatedAt
```
**Compound indexes:**
- `{ slotId, status, createdAt }` — FIFO ordering
- `{ slotId, clientId }` unique — prevents double-booking

### `Booking`
```
_id             ObjectId
queueEntryId    ref → SlotQueue   (unique)
chatStartedAt   Date
sessionEndTime  Date              ← authoritative expiry timestamp
chatEndedAt     Date | null
status          Enum["active", "completed"]
```

### `FreeChatUsage`
```
_id           ObjectId
clientId      ref → User
astrologerId  ref → User
usedAt        Date
```
**Unique index:** `{ clientId, astrologerId }` — one free session per pair, ever.

### `Message`
```
_id         ObjectId
senderId    ref → User
receiverId  ref → User
text        String
image       String (Cloudinary URL)
seen        Boolean (default false)
createdAt / updatedAt
```

---

## 4. Authentication Flow

```
User fills Login/Signup form
│
▼
POST /api/auth/signup  or  POST /api/auth/login
│
├── Signup: validate → check astrologer limit (max 2) → hash pw (bcrypt 12)
│           → create User → issueTokens()
│
└── Login:  validate → find user (constant-time if not found) → compare pw
            → issueTokens()
│
issueTokens():
  ├── accessToken  (JWT, 15 min) → Set-Cookie: accessToken; HttpOnly; SameSite=Strict
  └── refreshToken (JWT, 7 days) → Set-Cookie: refreshToken; HttpOnly; Path=/api/auth/refresh
│
Client receives { userData, token }
│
├── axios.defaults.headers.Authorization = "Bearer <token>"  (in-memory)
└── connectSocket(userData, token)
    └── socket = io(backendUrl, { auth: { token } })
        └── server io.use() middleware: jwt.verify(token) → socket.userId = decoded.userId
```

**Token refresh:**
```
On mount → checkAuth() → GET /api/auth/check (sends HttpOnly cookie)
         → if 200: refreshToken() → POST /api/auth/refresh
                                  → server verifies refreshToken cookie
                                  → issues new accessToken cookie + returns token in body
                                  → client stores token in memory, sets axios header
```

**protectRoute middleware:**
- Reads `req.cookies.accessToken` first, then `Authorization: Bearer <token>` as fallback
- Verifies JWT, loads user from DB (minus password), sets `req.user`

**authorizeRole middleware:**
- Checks `req.user.role` against allowed roles array

---

## 5. Client Flow — End to End

### Step 1 — Browse Astrologers (`/slots`)

```
GET /api/slots
│
├── filter: { status: { $in: ["open","active"] } }
├── populate astrologerId (fullName, profilePic, bio)
└── annotate each slot with live queueCount from SlotQueue

→ SlotBrowsePage renders astrologer cards
  ├── Online badge: slot.status === "active"
  ├── Tags: extracted from bio text via keyword matching
  └── Rating: deterministic mock from name charCode
```

### Step 2 — Book a Slot (BookingModal)

```
Client clicks "Book Slot" → opens BookingModal with astrologer's slots
Client clicks "Book Free →" on a slot
│
POST /api/slots/:slotId/book
│
Validations (in order):
  1. Slot exists and status is "open" or "active"
  2. Client has no existing active/waiting entry in ANY slot
  3. FreeChatUsage not already consumed for this astrologer
  4. Queue not full (count < maxClients)
  5. No duplicate entry (unique index catches race condition)
│
→ SlotQueue.create({ slotId, clientId })
→ Compute position (count waiting entries with createdAt ≤ entry.createdAt)
→ broadcastQueueUpdate(io, slotId)  ← notifies all waiting clients of new positions
→ Response: { queueEntryId, position, slotId }
│
→ navigate(`/waiting?queueEntryId=...&slotId=...`)
```

### Step 3 — Waiting Room (`/waiting`)

```
WaitingRoomPage mounts
│
socket.emit("join_waiting_room", { queueEntryId })
│
Server (join_waiting_room handler):
  1. SlotQueue.findOne({ _id: queueEntryId, clientId: socket.userId })  ← ownership check
  2. Clear reconnectDeadline if present
  3. socket.join(`slot:${entry.slotId}`)
  4. emitWaitingRoomState(io, entry, socket.id)  ← sends current state to this socket only
  5. emitQueueUpdated(io, entry.slotId)  ← refreshes all waiters in this slot
│
Client receives "waiting_room_state":
  { status: "waiting", position: N, queueEntryId, slotId, astrologer }
│
Client UI:
  ├── Shows position ring with animated glow (#N)
  ├── Estimated wait = (position-1) * 3 min
  ├── 4-step progress bar (BOOKED → WAITING → YOUR TURN → CHATTING)
  └── "Keep this page open" notice
```

### Step 4 — Turn Activation

```
Astrologer clicks "FETCH CLIENT" on ManageSlotsPage
  → socket.emit("astrologer_fetch_client", { slotId })
  → server validates slot ownership, calls activateNextClient(io, slotId)

activateNextClient():
  1. Confirm slot.status === "active"
  2. Confirm no existing active SlotQueue entry (one session at a time)
  3. Auto-skip entries where reconnectDeadline has passed
  4. Loop: pick oldest waiting entry (FIFO by createdAt)
     a. Check FreeChatUsage — if consumed → cancel that entry, emit "booking_cancelled", loop again
     b. Write FreeChatUsage record (before session starts, to block race-condition re-use)
     c. SlotQueue status → "active"
     d. Booking.create({ queueEntryId, sessionEndTime: now + 180s })
     e. Fetch client User record
     f. Emit "client_activated" → astrologer's personal room
     g. Emit "your_turn"       → client's personal room
     h. Emit "session_started" → session room (both sides)
     i. broadcastQueueUpdate   → updates all remaining waiters' positions
  5. Return { success, bookingId, queueEntryId, slotId }
```

**Client receives "your_turn":**
```
WaitingRoomPage.handleYourTurn():
  1. Guard: didHandleTurnRef (prevents double-fire)
  2. setStatus("your_turn")
  3. socket.emit("join_session_room", { bookingId })
  4. setSelectedUser(astrologer)
  5. setCurrentQueueEntryId(queueEntryId)
  6. setRemainingSeconds(remainingSeconds from server)
  7. toast.success("It's your turn!")
  8. setTimeout → navigate("/"), 1500ms
```

### Step 5 — Chat Session (`/`)

```
Both parties land on HomePage (ChatContainer)
│
Timer: remainingSeconds counts down from 180
  - ChatContext listens to "timer_tick" (every 10s from server) → setRemainingSeconds(secs)
  - Timer display: green → amber (<30s) → red + blink (expired)
│
Sending a message:
  POST /api/messages/send/:receiverId { text, image }
  │
  Server guard (sendMessage):
    1. findActiveEntry(senderId, receiverId)
       → finds SlotQueue entry where both users are in the same session
    2. Booking.findOne({ queueEntryId, status: "active" })
    3. If remainingSeconds <= 0 → 403 "Session has expired"
    4. If image → Cloudinary upload
    5. Message.create(...)
    6. io.to(`user:${receiverId}`).emit("newMessage", ...)
  │
  Client receives "newMessage":
    - If selectedUser matches senderId → append to messages + mark seen
    - Else → toast + increment unseenMessages counter
│
Session expiry:
  sessionSweeper (setInterval 5s):
    → Booking.find({ status:"active", sessionEndTime: { $lte: now } })
    → endBookingSession(io, booking):
       1. Booking status → "completed", chatEndedAt = now
       2. SlotQueue status → "completed"
       3. io.to(`session:${bookingId}`).emit("session_expired")
       4. io.socketsLeave(`session:${bookingId}`)  ← force-evict both sockets
       5. broadcastQueueUpdate → remaining waiters' positions shift
│
Client receives "session_expired":
  ChatContext.onSessionExpired():
    → setRemainingSeconds(0) → setCurrentBookingId(null)
  ChatContainer.onExpired():
    → client: toast → 1.8s delay → navigate("/slots?from=session")
    → astrologer: toast → clear selectedUser
```

---

## 6. Astrologer Flow — End to End

### Step 1 — Login & Land on Dashboard

```
Astrologer logs in → role === "astrologer"
→ navigate("/")  but HomePage just shows ChatContainer (no active session → empty state)
→ Sidebar shows "My Workspace →" button → navigate("/manage-slots")
```

### Step 2 — Create a Slot (`/manage-slots`)

```
Astrologer fills Start, End, Max Clients → submit
│
POST /api/slots  (authorizeRole("astrologer"))
  → Slot.create({ astrologerId: req.user._id, startAt, endAt, maxClients })
  → Response: { slot }
│
→ fetchSlots() refreshes the slot list
→ Slot appears as "UPCOMING" card (status: "open")
```

### Step 3 — Slot Goes Live (Automatic)

```
node-cron (every 30s):
  Slot.find({ status: "open", startAt: { $lte: now } })
  → Slot.findByIdAndUpdate(slot._id, { status: "active" })
```
The astrologer does not need to manually start a slot. The cron handles it.
The UI fetches slots on load; socket events (`queue_updated`, `slot_closed`) trigger re-fetches.

### Step 4 — Manage the Queue

```
ManageSlotsPage on load:
  1. GET /api/slots → shows all astrologer's slots
  2. For each active slot: GET /api/slots/:id/queue
     → SlotQueue.find({ slotId }).populate("clientId").sort({ createdAt: 1 })
     → also emits broadcastQueueUpdate (keeps socket in sync with HTTP fetch)

Socket listener "queue_updated":
  → re-fetches the queue for that slotId
  → UI updates without page refresh

Astrologer sees:
  ├── Stats: In Queue count, Done Today, Active Slot time
  ├── Slot cards with LIVE green glow for active slot
  ├── Queue rows: #1 "NEXT UP" card with "FETCH CLIENT" CTA
  └── Completed history at the bottom
```

### Step 5 — Fetch Next Client

```
Astrologer clicks "FETCH CLIENT"
→ socket.emit("astrologer_fetch_client", { slotId })
→ (see activateNextClient() in Client Flow Step 4)
→ receives "client_activated": { client, queueEntryId, bookingId }

ManageSlotsPage.onActivated():
  → setSelectedUser(client)
  → setRemainingSeconds(180)
  → socket.emit("join_session_room", { bookingId })
  → navigate("/")  ← goes to ChatContainer with active session
```

### Step 6 — Slot Management Tools

```
Extend a slot:
  POST /api/slots/:id/extend { minutes: N }
  → slot.endAt += N * 60_000
  → prevents cron from closing it early

Cancel remaining queue:
  POST /api/slots/:id/cancel-remaining
  → cancelRemainingQueue(io, slotId)
     → find all waiting SlotQueue entries
     → status → "cancelled"
     → emit "booking_cancelled" to each client's personal room
     → slot.status → "closed"
```

---

## 7. Slot Lifecycle (Cron Jobs)

All cron jobs are initialized in `server/lib/slotActivator.js`, called once from `server.js` after MongoDB connects.

```
Cron 1 — every 30 seconds
  Query: Slot.find({ status: "open", startAt: { $lte: now } })
  Action: Set status → "active"
  Effect: Slot becomes bookable AND astrologer can now fetch clients

Cron 2 — every 60 seconds
  Query: Slot.find({ status: "active", endAt: between (now+4m) and (now+5m) })
  Action: emit "slot_ending_soon" → astrologer's personal room
  Effect: Toast warning "⚠️ Slot ends in N min"

Cron 3 — every 60 seconds
  Query: Slot.find({ status: "active", endAt: { $lt: now } })
  Action:
    1. cancelRemainingQueue(io, slot._id)  ← cancel all waiting clients
    2. Slot status → "closed"
    3. emit "slot_closed" → astrologer's personal room
  Effect: Slot is dead; all queued clients see "Booking Cancelled"
```

**Session Sweeper** — in `server/lib/sessionManager.js`, initialized alongside cron jobs:

```
Sweeper 1 — every 5 seconds
  Query: Booking.find({ status: "active", sessionEndTime: { $lte: now } })
  Action: endBookingSession(io, booking)
    → Booking status → "completed"
    → SlotQueue status → "completed"
    → emit "session_expired" to session room
    → socketsLeave the session room (hard eviction)
    → broadcastQueueUpdate (remaining waiters shift up)

Sweeper 2 — every 10 seconds (timer sync)
  Query: Booking.find({ status: "active" })
  Action: emit "timer_tick" { remainingSeconds } to each session room
  Effect: Corrects any client-side drift
```

---

## 8. Session Timer Architecture

The timer is **server-authoritative**. Here's the complete lifecycle:

```
1. Booking is created:
   sessionEndTime = Date.now() + 180_000ms

2. Both parties join session room:
   socket.emit("join_session_room", { bookingId })
   → socket.join(`session:${bookingId}`)

3. Client receives "your_turn" with remainingSeconds:
   → setRemainingSeconds(remainingSeconds)  ← seeds UI from server

4. Every 10s — Sweeper 2 emits "timer_tick":
   → ChatContext.onTimerTick({ remainingSeconds }) → setRemainingSeconds(secs)
   ← this corrects any drift from client-side countdown

5. At sessionEndTime — Sweeper 1 detects expired booking:
   → endBookingSession():
      a. Updates DB
      b. emit "session_expired" → session room
      c. io.socketsLeave(`session:${bookingId}`)  ← force both sockets out

6. Client-side response to "session_expired":
   ChatContext: setRemainingSeconds(0), clear bookingId + queueEntryId
   ChatContainer: toast → navigate("/slots?from=session")  [client]
                   toast → clear selectedUser              [astrologer]
```

**Why server-authoritative?**
- Clock skew between clients would cause timers to end at different times
- A malicious client could manipulate a local timer
- Reconnecting clients need the real remaining time from the server

---

## 9. Socket.IO — Event Reference

### Rooms
| Room | Members | Purpose |
|------|---------|---------|
| `user:<userId>` | All sockets for one user | Personal notifications |
| `slot:<slotId>` | All clients in a slot's queue + astrologer | Queue position updates |
| `session:<bookingId>` | Active client + astrologer | Chat session, timer ticks, expiry |

### Client → Server (emits)
| Event | Payload | Description |
|-------|---------|-------------|
| `join_slot_room` | `{ slotId }` | Subscribe to queue updates for a slot |
| `join_session_room` | `{ bookingId }` | Enter active session room |
| `join_waiting_room` | `{ queueEntryId }` | Restore waiting room state on (re)load |
| `astrologer_fetch_client` | `{ slotId }` | Astrologer requests next client |
| `rejoin` | `{ queueEntryId?, bookingId? }` | Client reconnect clears grace deadline |

### Server → Client (emits)
| Event | Room Target | Payload | Description |
|-------|-------------|---------|-------------|
| `getOnlineUsers` | broadcast | `[userId, ...]` | Online user list update |
| `queue_updated` | `slot:<id>` + each `user:<id>` | `{ slotId, positions[] }` | Position changes after any queue mutation |
| `waiting_room_state` | `user:<id>` | `{ status, position, queueEntryId, slotId, bookingId?, remainingSeconds?, astrologer? }` | Full waiting room state |
| `your_turn` | `user:<clientId>` | `{ slotId, queueEntryId, bookingId, remainingSeconds, astrologer }` | Client's session is starting |
| `client_activated` | `user:<astrologerId>` | `{ client, queueEntryId, bookingId, slotId }` | Astrologer gets new client info |
| `session_started` | `session:<bookingId>` | `{ bookingId, startedAt, sessionEndTime }` | Both sides: session is live |
| `timer_tick` | `session:<bookingId>` | `{ bookingId, remainingSeconds, sessionEndTime }` | Every 10s — authoritative timer sync |
| `session_expired` | `session:<bookingId>` | `{ bookingId, reason }` | Timer reached 0 — messaging locked |
| `booking_cancelled` | `user:<clientId>` | `{ slotId, reason }` | Client's booking was cancelled |
| `slot_closing_soon` | `user:<astrologerId>` | `{ slotId, minutesLeft }` | 5-min warning before slot ends |
| `slot_closed` | `user:<astrologerId>` | `{ slotId, reason }` | Slot has closed |
| `client_disconnected` | `session:<bookingId>` | `{ message }` | Astrologer: active client went offline |
| `newMessage` | `user:<receiverId>` | `{ ...message, senderName }` | Incoming chat message |
| `astrologer_fetch_result` | requesting socket | `{ success, message?, bookingId? }` | Result of fetch-client attempt |
| `waiting_room_error` | requesting socket | `{ message }` | Error during waiting room join |

---

## 10. REST API Reference

**Base URL:** `/api`  
All routes except `/status` require `protectRoute`.

### Auth — `/api/auth`
| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/signup` | public | Create account |
| POST | `/login` | public | Login |
| POST | `/logout` | any | Clear cookies |
| POST | `/refresh` | any (cookie) | Refresh access token |
| GET | `/check` | any | Verify current session |
| PUT | `/update-profile` | any | Update fullName, bio, profilePic |

### Messages — `/api/messages`
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/users` | any | Get opposite-role contacts + unseen counts |
| GET | `/:id` | any | Message history + session hydration |
| POST | `/send/:id` | any | Send message (requires active booking) |
| PUT | `/mark/:id` | any | Mark message as seen |

### Slots — `/api/slots`
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/` | any | Browse slots (clients: open/active; astrologers: own) |
| POST | `/` | astrologer | Create new slot |
| POST | `/:id/book` | client | Book a slot → join queue |
| GET | `/:id/queue` | astrologer | Get full queue for a slot |
| GET | `/current/active-waiting-queue` | astrologer | Active slot's waiting queue |
| POST | `/:id/extend` | astrologer | Extend slot endAt |
| POST | `/:id/cancel-remaining` | astrologer | Cancel all waiting clients + close slot |

### Bookings — `/api/bookings`
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/:id` | participant | Get booking details (client or astrologer only) |

---

## 11. Frontend — Context & State

### AuthContext (`client/context/AuthContext.jsx`)
Provides authentication state and the axios instance to all components.

```
State:
  authUser        Object | null   ← logged-in user (no password)
  onlineUsers     string[]        ← userIds with active sockets
  socket          Socket | null   ← Socket.IO instance
  accessToken     string | null   ← in-memory only (not localStorage)
  isLoading       boolean

Functions:
  login(state, credentials)    ← "signup" or "login"
  logout()
  updateProfile(body)
  refreshToken()               ← POST /api/auth/refresh
  connectSocket(userData, token)

Socket events consumed:
  "getOnlineUsers" → setOnlineUsers(userIds)
```

### ChatContext (`client/context/ChatContext.jsx`)
Manages the chat UI state and the session timer.

```
State:
  messages              Message[]
  users                 User[]        ← sidebar contacts
  selectedUser          User | null
  unseenMessages        { [userId]: number }
  remainingSeconds      number | null   ← null=no session, 0=expired, >0=active
  currentQueueEntryId   string | null
  currentBookingId      string | null

Functions:
  getUsers()                       ← GET /api/messages/users
  getMessages(userId)              ← GET /api/messages/:id (also hydrates session)
  sendMessage(messageData)         ← POST /api/messages/send/:id

Socket events consumed:
  "newMessage"       → append to messages or increment unseen
  "timer_tick"       → setRemainingSeconds(secs)  [server-authoritative]
  "session_expired"  → setRemainingSeconds(0), clear booking state
  "client_activated" → setSelectedUser, setRemainingSeconds(180)
  "session_started"  → ensure remainingSeconds is seeded
```

**Session state machine in ChatContext:**
```
null → (your_turn or client_activated) → 180
180 → (timer_tick every 10s) → N
N → (session_expired) → 0
0 → (user navigates away) → null
```

---

## 12. Frontend — Page & Component Map

```
App.jsx
├── /login              → LoginPage.jsx
│     Multi-step form: credentials → bio
│     Role selection: client | astrologer
│
├── /                   → HomePage.jsx
│     └── grid layout:
│         ├── Sidebar.jsx        ← contact list, search, profile strip
│         ├── ChatContainer.jsx  ← messages, timer, send input, expired overlay
│         └── RightSidebar.jsx   ← profile, live session pill, quick links, media gallery
│
├── /profile            → ProfilePage.jsx  (profile photo, name, bio edit)
│
├── /slots              → SlotBrowsePage.jsx   [client only]
│     ├── TopNav (role toggle)
│     ├── Astrologer cards grid (online status, tags, rating, slot count)
│     ├── BookingModal (per-astrologer slot list + book CTA)
│     └── Post-session paid options modal
│
├── /waiting            → WaitingRoomPage.jsx  [client only]
│     ├── Astrologer chip (who they're waiting for)
│     ├── Animated position ring (#N)
│     ├── 4-step progress bar
│     └── Terminal states: Your Turn / Cancelled / Skipped
│
└── /manage-slots       → ManageSlotsPage.jsx  [astrologer only]
      ├── TopNav (role toggle + New Slot CTA)
      ├── Stats row (In Queue, Done Today, Active Slot)
      ├── Create Slot form
      ├── Today's Slots horizontal scroll (live glow on active)
      ├── Queue Control panel (FIFO rows, FETCH CLIENT CTA)
      └── Recent Sessions history
```

---

## 13. Disconnect & Reconnect Handling

### Client disconnects while WAITING in queue

```
socket disconnect handler (server):
1. removeUserSocket(userId, socketId)
2. Check remainingSocketCount — if >0, user still has another tab open → skip
3. Find SlotQueue entry: { clientId: userId, status: "waiting", reconnectDeadline: null }
4. Set reconnectDeadline = now + 2 minutes
5. setTimeout(2 min):
   → Re-fetch the entry
   → If still "waiting" AND reconnectDeadline is set (not cleared) → status = "skipped"
   → broadcastQueueUpdate → other clients shift up

Client reconnects within 2 minutes:
  socket.emit("join_waiting_room", { queueEntryId })
  → Server clears reconnectDeadline (entry.reconnectDeadline = null)
  → Client gets current waiting_room_state back
```

### Client disconnects while ACTIVE in session

```
socket disconnect handler:
1. Find SlotQueue: { clientId, status: "active" }
2. Find Booking: { queueEntryId, status: "active" }
3. Emit "client_disconnected" to session room → astrologer sees notification
4. Timer keeps running on server regardless — no grace window for active sessions
5. If client reconnects → ChatContext.getMessages() hydrates remainingSeconds from DB
```

### Astrologer disconnects

No specific grace handling — the astrologer can reconnect and continue fetching. Active booking timers run independently on the server.

---

## 14. Free Chat Eligibility Guard

The `FreeChatUsage` collection enforces the one-free-session-per-client-per-astrologer rule.

**Two check points (defense in depth):**

```
Guard 1 — at booking time (bookSlot controller):
  FreeChatUsage.findOne({ clientId, astrologerId: slot.astrologerId })
  → If found: 403 "You have already used your free chat with this astrologer"
  → Prevents the client from even joining the queue

Guard 2 — at session start (activateNextClient):
  FreeChatUsage.findOne({ clientId: next.clientId, astrologerId: slot.astrologerId })
  → If found: cancel that entry, emit "booking_cancelled", loop to next waiter
  → This covers a race condition: client A books slot B before slot is active,
    then somehow the usage check at book-time was bypassed (e.g. concurrent request)

Write timing:
  FreeChatUsage.create() happens BEFORE Booking.create()
  → If the session creation fails partway, FreeChatUsage already exists
  → The client cannot retry and claim another free session
  → This is intentionally conservative (blocks false-positive re-use)
```

---

## 15. Known Issues & Bugs

### CRITICAL

**[C1] Race condition in `bookSlot` — double booking possible under load**
- The check-then-insert pattern (`findOne` + `create`) is not atomic.
- Under high concurrency, two simultaneous requests for the same `{slotId, clientId}` can both pass the `findOne` check before either creates the entry.
- The unique index on `{ slotId, clientId }` catches this and returns error code `11000`, which is handled → 409.
- **Risk:** Not a data-corruption bug, but the first request wins and the second gets a confusing generic "already booked" error instead of clean UX handling.
- **Fix:** Use `findOneAndUpdate` with `upsert: true` or a MongoDB transaction.

**[C2] `FreeChatUsage.create()` at fetch-time is not rolled back on partial failure**
- If `activateNextClient` writes `FreeChatUsage` but then `Booking.create()` throws, the client is permanently blocked from that astrologer's free session despite never actually chatting.
- **Fix:** Use a MongoDB transaction wrapping the FreeChatUsage write + SlotQueue status update + Booking creation.

**[C3] Server restart loses all in-memory timer state**
- `initSessionSweeper` uses `setInterval`. If the server crashes and restarts mid-session, the sweeper will catch expired bookings on the next 5-second tick (because it queries DB, not memory).
- However, sockets in `session:<bookingId>` rooms are lost — the `session_expired` event won't reach the clients unless they reconnect and re-join the room.
- **Fix:** On reconnect, if `Booking.status === "completed"`, emit `session_expired` directly to the reconnecting socket.

### HIGH

**[H1] `connectSocket` in AuthContext doesn't wait for previous socket to fully disconnect**
- On login, `connectSocket()` does `prev.off(); prev.disconnect()` inside `setSocket(prev => ...)` but doesn't await the disconnect acknowledgment before opening the new socket.
- Can result in two sockets for the same user briefly both connected, doubling the `user:<userId>` room membership and potentially firing events twice.
- **Fix:** Use `socket.once("disconnect", callback)` before creating the new socket.

**[H2] `timer_tick` is the only client-side timer correction, but clients have no local countdown**
- `ChatContext` stores `remainingSeconds` as a number but never decrements it locally (no `setInterval`).
- Between server ticks (10s), the displayed timer freezes at whatever the last tick value was.
- Users see the timer jump: `2:30 → 2:30 → 2:30 → 2:20` (10s intervals).
- **Fix:** Run a local `setInterval(1s)` to decrement `remainingSeconds` locally, and override with server ticks when they arrive.

**[H3] `ManageSlotsPage` fetches queue via both HTTP and socket, but they can desync**
- On load, `fetchQueue(slotId)` is called over HTTP.
- Socket `queue_updated` then calls `fetchQueue` again.
- If the HTTP response arrives after a socket update, stale data overwrites fresh data.
- **Fix:** Add a timestamp or version field to queue responses; only apply if newer than current state.

**[H4] `astrologer_fetch_client` result has no UI feedback on failure**
- `setFetching(false)` runs after a 3-second `setTimeout`, regardless of whether the fetch succeeded.
- If `activateNextClient` returns `{ success: false }`, the `astrologer_fetch_result` event is received but `ManageSlotsPage` has no handler for it.
- The astrologer sees no error — the button just un-freezes.
- **Fix:** Listen for `"astrologer_fetch_result"` in `ManageSlotsPage` and toast the failure message.

**[H5] `findActiveEntry` in messageController is O(N) over active sessions**
- Queries all active `SlotQueue` entries where the user is a client, then iterates to find the matching astrologer.
- In high-traffic conditions (many concurrent sessions), this is a full collection scan on `status: "active"`.
- **Fix:** Index `{ clientId, status }` on SlotQueue; or store `astrologerId` directly on the Booking document.

### MEDIUM

**[M1] No pagination on message history**
- `GET /api/messages/:id` returns ALL messages between two users with no limit.
- For users who had previous sessions, this could be a large payload.
- **Fix:** Limit to last N messages with cursor-based pagination.

**[M2] `getSlots` annotates each slot with a separate `countDocuments` call — N+1 query**
- For a list of 20 slots, this fires 20 separate MongoDB queries.
- **Fix:** Use `$lookup` aggregation or a batch query.

**[M3] Image uploads are synchronous in the request lifecycle**
- `cloudinary.uploader.upload(image)` is awaited inline in `sendMessage` and `updateProfile`.
- A large image causes the entire request to hang for the upload duration.
- **Fix:** Upload to Cloudinary before sending the message (client-side pre-upload), or use a background job.

**[M4] `reconnectDeadline` setTimeout runs in Node.js process memory**
- The 2-minute grace timer (`setTimeout(() => skip entry, 2 min)`) is held in the Node.js event loop.
- A server restart between disconnect and deadline causes the timeout to never fire → disconnected client stays in "waiting" forever.
- **Fix:** Use a DB-level scheduled job or a cron that checks `reconnectDeadline < now` every 30 seconds (similar to how `slotActivator` works).

**[M5] Astrologer registration hard-capped at 2 in code**
- `userController.signup`: `if (astrologerCount >= 2) → 403`.
- This is a hardcoded constant — not configurable via env var or admin panel.
- **Fix:** Move the cap to an environment variable `MAX_ASTROLOGERS=2`.

**[M6] No CSRF protection**
- The app uses `SameSite=Strict` cookies which provides good protection against cross-site requests.
- However, there's no explicit CSRF token verification for state-changing routes.
- **Acceptable for now** given `SameSite=Strict`, but a CSRF token would be belt-and-suspenders for production.

**[M7] `slot_closing_soon` event name in slotActivator emits as `slot_ending_soon` but ManageSlotsPage listens on `slot_ending_soon`**
- These match — but the comment in `server.js` references `slot_closing_soon`.
- Minor naming inconsistency, not a functional bug, but can confuse during debugging.

### LOW

**[L1] `getMockRating` on SlotBrowsePage generates fake ratings from name charCode**
- Not persisted, not real — purely decorative.
- Different name capitalizations return different ratings for the same person.
- **Fix:** Add a real `rating` field to User, or remove ratings entirely until the feature is built.

**[L2] `getTagsFromBio` uses simple substring matching — can produce false positives**
- "Astro" matches inside "Gastrology", "Crystal" matches inside "Crystallography".
- **Fix:** Use word-boundary regex or a curated tag list the astrologer explicitly selects.

**[L3] `estWait` in WaitingRoomPage assumes every session is exactly 3 minutes**
- If the previous client's session ended early (astrologer didn't send a message, session expired naturally), the next client still sees `~3 min * (pos-1)` wait.
- **Fix:** Track average actual session duration and use that for estimation.

**[L4] `SlotBrowsePage` shows slots from ALL statuses via filtering, but offline astrologers still appear**
- An astrologer with only `closed` or `open` (not yet started) slots still appears in the astrologer list with "Offline" badge.
- A client could still open the booking modal (no slots would show).
- **Fix:** Filter `astrologers` list to only those with at least one `open` or `active` slot.

**[L5] No loading state on ChatContainer when switching conversations**
- `getMessages(userId)` is async. Between click and response, the old messages briefly remain visible.
- **Fix:** Set `messages = []` immediately on `selectedUser` change (before the fetch resolves).

**[L6] ProfilePage is not rebuilt with the dark theme**
- `ProfilePage.jsx` exists in the codebase but was not part of the UI rebuild.
- It likely still uses the old light theme, creating a visual inconsistency.

---

## 16. Potential Improvements

### Reliability
- **MongoDB Transactions** — wrap `FreeChatUsage.create + SlotQueue.update + Booking.create` in a session transaction (requires replica set or Atlas).
- **Redis-backed session state** — replace Node.js in-memory `setTimeout` for disconnect grace windows with a Redis TTL key.
- **Process manager** — use PM2 or a Docker container with health checks and auto-restart.

### Features
- **Session extension** — allow the astrologer to extend an active 3-minute session by N seconds (similar to slot extension).
- **Skip client** — astrologer can skip the current "NEXT UP" client (not just cancel the whole queue).
- **Client rating** — after session ends, client rates the astrologer (1-5 stars → stored, shown as real rating).
- **Paid session booking** — the post-session upsell screen already exists in the UI; the backend for paid sessions needs to be built (Razorpay/Stripe integration).
- **Push notifications** — use Web Push API so clients are alerted even if the waiting room tab is in background.
- **Admin panel** — manage astrologers, view all sessions, moderate content.

### Performance
- **Aggregation pipeline** for `getSlots` queue annotation (eliminate N+1).
- **Message pagination** with cursor-based API.
- **Client-side timer decrement** between server ticks (eliminates perceived freeze).
- **Socket namespace** for astrologers vs clients (reduces event broadcast surface).

### Security
- **Rate limiting** on auth routes (`express-rate-limit`) to prevent brute force.
- **Input sanitization** beyond express-validator — strip HTML from bio/fullName.
- **Image type validation on server** — currently trusts the client's file type claim.
- **Log scrubbing** — remove any PII from error logs (currently logs `email` on signup errors).


Implementation Plan — Remaining Fixes
Backend
1. M5 — Configurable astrologer cap

File: userController.js:56-61
Replace literal 2 with parseInt(process.env.MAX_ASTROLOGERS ?? "2", 10) (clamp to ≥ 1).
Document MAX_ASTROLOGERS in server/.env.
Optional: send the cap and current count in the 403 message for clearer UX.
2. M6a — Rate limiting on auth (the dependency is already installed)

New file server/middleware/rateLimit.js exporting authLimiter (e.g. windowMs: 15*60*1000, max: 20, standardHeaders: true, legacyHeaders: false, skip: req => req.method === "OPTIONS").
Wire in userRoutes.js: apply authLimiter to /signup, /login, /refresh. Add a smaller passwordResetLimiter later if needed.
Trust proxy: in server.js add app.set("trust proxy", 1) so the limiter sees the real client IP behind a reverse proxy.
3. M6b — CSRF (lower priority while SameSite=Strict)

If you keep cookie-based auth in prod, add csurf (or roll a double-submit token) on state-changing routes (/api/slots/*, /api/bookings/*, /api/messages/send/*, /api/auth/update-profile, /api/auth/logout).
Expose GET /api/auth/csrf to issue a token; require X-CSRF-Token header on mutating verbs.
Plumb through axios.defaults.headers.common['X-CSRF-Token'] in AuthContext after login/refresh.
4. Optional housekeeping (not in §15 but worth doing while you're in there)

Strip HTML from fullName/bio in signup and updateProfile (use express-validator's escape() / trim()).
Add User.email index — schema marks it unique, which is fine, but verifying it materialises in production avoids surprises.
Image MIME validation: when receiving the Cloudinary URL on the server, you trust the client; consider calling Cloudinary's cloudinary.api.resource to verify type/size before persisting on Message/User. Not free — skip if not needed.
Frontend
5. L6 — Rebuild ProfilePage in the dark theme

Replace hard-coded amber palette with the same CSS variables used by SlotBrowsePage.jsx / ManageSlotsPage.jsx: var(--bg), var(--card), var(--surface), var(--border), var(--text), var(--muted), var(--gold), etc.
Reuse the TopNav exported from SlotBrowsePage.jsx (or extract to components/TopNav.jsx and import it in all three pages).
Apply btn-gold / btn-ghost / dark-input utility classes already defined in index.css.
File preview should match the rounded-2xl avatar style used in ChatContainer. Fail gracefully if selectedImg is not an image (mirror handleImage in ChatContainer).
Ratings/avg-session badges (read-only) for astrologer-role users would close the loop with the new User.ratingAvg/avgSessionSeconds fields — a nice add-on.
6. Frontend wiring for CSRF (if you do M6b)

After every successful /api/auth/login, /signup, /refresh, fetch /api/auth/csrf and set axios.defaults.headers.common['X-CSRF-Token'].
Clear it on logout.
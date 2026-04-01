# Architecture Manifest: Squadra CRM

## Chat & Communication System (v2.0)

### 1. Data Model: `messages` Collection
- **Field `type`**: `'public'` (default) or `'internal'`.
  - `public`: Visible to Client, Pilot, and Admin.
  - `internal`: Visible only to Pilot and Admin (staff channel).
- **Field `senderName`**: Stores the display name at the time of sending to avoid redundant profile fetches.
- **Field `requestId`**: Foreign key linking to the `requests` collection.

### 2. Notifications & Telegram Integration
- **Proxy Endpoint**: `/api/notifications/send`
  - Accepts `telegramId`, `message`, and `options`.
  - Supports `parse_mode: 'HTML'` and `reply_markup` (inline keyboards).
- **Aesthetics**: Telegram notifications now use HTML (`<b>`) for headers and names.
- **Interactive UI**: Messages include an inline button "💬 Открыть чат" instead of raw text links.

### 3. Navigation & Deep Linking (TWA)
- **Format**: `https://t.me/squadraby_bot/app?startapp=task_chat_{requestId}`.
- **Logic**: Handled in `src/App.tsx` via `WebApp.initDataUnsafe?.start_param`.
- **Parsing**: `task_chat_` prefix is stripped to extract the Firestore `requestId`, then `useNavigate` moves the user directly to `Chat.tsx`.

### 4. Visibility & Archiving
- **`TaskDetails.tsx`**: Chat button remains visible for all tasks where a pilot was assigned (including `completed` and `cancelled`).
- **Read-Only Mode**: `Chat.tsx` blocks input and quick responses if `request.status` is archived. Displays a banner: "Это архивное поручение. Чат доступен только для чтения."
- **Quick Access**: `PilotHistory.tsx` items feature a direct "Чат" button on history cards.

### 5. Security Context (`firestore.rules`)
- **Profile Visibility**: `match /users/{userId}` now allows `read` for `isAuthenticated()`. This enables clients to see their assigned pilots and pilots/admins to identify each other in multi-staff contexts.
- **Message Validation**: `isValidMessage` rule updated to allow `type` and `senderName` fields.

---
*Created by Antigravity AI Agent on 2026-03-31*

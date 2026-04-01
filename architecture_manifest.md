# Architecture Manifest: Squadra CRM

## Core Systems & Logic

### 1. Navigation & Geodata
- **Utility**: `src/utils/navigation.ts`
- **Logic**: Extracts `(lat, lng)` from address strings.
- **Mapping**:
  - Yandex: Uses `pt` parameter (point) for exact location.
  - Google: Uses `destination` parameter to trigger navigation mode directly.

### 2. Administrative Workflows
- **Dashboard**: `src/pages/admin/AdminDashboard.tsx`
- **Categorization**:
  - `pending`: New tasks awaiting assignment.
  - `active`: Tasks in `accepted`, `driving`, or `in_progress` states.
  - `review`: Finished tasks awaiting admin approval (Critical state).
  - `completed`: Archived tasks.
- **Assignment**: Two-step flow (Select -> Confirm + Comment). Comments are saved as `internal` chat messages.

### 3. Notification Engine
- **Backend**: `api/index.ts` (`notifyAdmins` helper).
- **Channels**: 
  - Firestore `notifications` collection (In-app).
  - Telegram Bot via `sendNotification` with `inline_keyboard` support.
- **Deep Linking**: Telegram buttons use `t.me/.../?startapp=task_ID` for direct access.

### 4. Persistence & Session Management
- **Auth Provider**: `src/components/FirebaseProvider.tsx`
- **Background Handling**: `visibilitychange` listener triggers `refreshAuth` (calls `/api/auth/me` and refreshes Firebase custom token).
- **Explicit Auth Checks**: Added to critical actions like photo uploads to ensure `auth.currentUser` is active after app resume.

### 5. Media & Utilities
- **Uploader**: `TaskDetails.tsx` utilizes `Promise.all` for parallel photo uploads via `upload-proxy`.
- **Keyboard Handling**: `useKeyboard.ts` hook manages UI layout when keyboard is visible. Inputs use `enterKeyHint="done"` for better mobile UX.

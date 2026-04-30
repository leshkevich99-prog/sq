# Architecture Manifest: Squadra CRM
_Последнее обновление: 2026-04-30_

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
- **Notifications on assign**: Pilot gets Telegram push + in-app. Client ALSO gets Telegram push with "Открыть поручение" button.

### 3. Notification Engine
- **Backend**: `api/index.ts` (`notifyAdmins` helper), `server/bot.ts` (`sendNotification`).
- **Frontend manager**: `src/components/NotificationManager.tsx` — слушает Firestore `notifications` (onSnapshot, limit 1, desc), показывает кастомный toast с вибрацией.
- **Channels**:
  - Firestore `notifications` collection (`{ userId, title, message, type, link, read, createdAt }`) → In-app toast.
  - Telegram Bot via `sendNotification` с `inline_keyboard` DeepLink на задачу.
- **createNotification**: `src/firebase.ts` — пишет в Firestore с полем `message` (не `body`!).
- **Покрытие уведомлений**:
  - Тест-драйв оплачен → Telegram админам
  - Пилот назначен → In-app toast клиенту + Telegram клиенту и пилоту
  - Статус изменён → In-app toast клиенту + Telegram клиенту
  - Баланс пополнен → Telegram клиенту

### 4. Тест-Драйв Flow (ПОФИКШЕНО 2026-04-30)
- **Frontend**: `src/pages/TestDrive.tsx`
  - Создаёт `pending_order` → открывает modal оплаты
  - Поддерживает: Card (Telegram Invoice), ERIP, B2B
- **Payment payload**: хранится в `payment_payloads` с полями `{ u: userId, t: type, po: pendingOrderId, a: amount }`
- **Обработка Telegram Invoice**: `server/bot.ts` → `handleSuccessfulPayment`
- **Обработка bePaid/ERIP webhook**: `api/index.ts` → `/api/payments/bepaid/webhook`
- **Создание поручения** (оба места — bot.ts и api/index.ts):
  - `serviceType: 'test_drive'` ← **КРИТИЧНО** (иначе показывается "СТО/ТО")
  - `pickupAddress: o.address` ← маппинг для TaskDetails
  - `orderDate: o.date`, `orderTime: o.time` ← маппинг для отображения дат
  - `carId: null` ← чтобы UI не пытался грузить несуществующий doc
  - `carModel` из pending_order ← отображается в TaskCard и TaskDetails
- **Fallback**: если `pending_order` не найден → алерт всем админам в Telegram с просьбой создать вручную

### 5. Отображение поручений
- **TaskDetails.tsx**: 
  - Авто: `car.make model` → `carModel` (текст) → `ID: carId` → "Не указан"
  - Услуга: через `SERVICE_LABELS[serviceType]` (включая `test_drive: 'Тест-драйв'`)
  - Дата/время: читает `orderDate || date` и `orderTime || time`
- **AdminDashboard.tsx** (TaskCard + таблица): аналогичный `SERVICE_LABELS` с `test_drive`
- **SERVICE_LABELS** должны быть одинаковы везде: logistics, valet, parking, bureaucracy, wash, service, **test_drive**

### 6. Cloud Storage Security (RBAC)
- **Rules**: `storage.rules` implements strict Role-Based Access Control synchronized with Firestore.
- **Paths**:
  - `recommendations/`: Private write (Pilots/Admins), public read for Auth users.
  - `cars/`: Sensitive documents - read/write restricted to Owner and Admin.
  - `requests/`: Shared evidence - read for Admin, Pilot, or Request User (verified via Firestore cross-lookup).
  - `receipts/`: Payment evidence - read for Auth users.
- **Enforcement**: Integrated into `firebase.json` for automatic deployment.

### 7. Persistence & Session Management
- **Auth Provider**: `src/components/FirebaseProvider.tsx`
- **Background Handling**: `visibilitychange` listener triggers `refreshAuth` (calls `/api/auth/me` and refreshes Firebase custom token).
- **Explicit Auth Checks**: Added to critical actions like photo uploads to ensure `auth.currentUser` is active after app resume.

### 8. Media & Utilities
- **Uploader**: `TaskDetails.tsx` utilizes `Promise.all` for parallel photo uploads via `upload-proxy`.
- **Keyboard Handling**: `useKeyboard.ts` hook manages UI layout when keyboard is visible. Inputs use `enterKeyHint="done"` for better mobile UX.
- **Safe Area**: всегда использовать `pt-safe`, `pb-safe` и `pb-[max(env(safe-area-inset-bottom),1rem)]` в sticky/fixed элементах.

## Known Issues (Resolved)
| # | Баг | Решение | Коммит |
|---|---|---|---|
| 1 | Тест-драйв не создавал поручение | serviceType + маппинг полей + fallback алерт | d66458b |
| 2 | Авто показывало `ID: undefined` | carModel fallback в TaskDetails и TaskCard | d66458b |
| 3 | Тип "СТО/ТО" для тест-драйва | `serviceType: 'test_drive'` + SERVICE_LABELS | d66458b |
| 4 | Даты/время не отображались | `orderDate || date`, `orderTime || time` | d66458b |
| 5 | Нет Telegram-пуша клиенту при назначении пилота | Добавлен fetch `/api/notifications/send` | b6f49bf |

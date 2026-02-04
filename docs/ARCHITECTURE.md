# Voice Engine PoC - システムアーキテクチャ

## システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client (Debug Console)                        │
│                    Browser Foreground Only                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                      Main UI                               │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │ │
│  │  │ Cockpit     │  │ Voice       │  │ Conversation    │   │ │
│  │  │ (User Mgmt) │  │ Interface   │  │ Log             │   │ │
│  │  │             │  │             │  │                 │   │ │
│  │  │ • Enrollment│  │ • WebRTC    │  │ • Transcript    │   │ │
│  │  │ • Selection │  │ • Mute/Unmute│ │ • History       │   │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │ │
│  │                                                           │ │
│  │  ┌───────────────────────────────────────────────────┐   │ │
│  │  │            Simulation Tools (同一画面)              │   │ │
│  │  │  ┌─────────────────┐  ┌─────────────────────┐     │   │ │
│  │  │  │ Location        │  │ Notification        │     │   │ │
│  │  │  │ Simulator       │  │ Simulator           │     │   │ │
│  │  │  │ (緯度経度/地名)  │  │ (テキスト入力)       │     │   │ │
│  │  │  └─────────────────┘  └─────────────────────┘     │   │ │
│  │  └───────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Server (Core Logic)                          │
│                    Next.js API Routes                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    API Routes                             │  │
│  │                                                           │  │
│  │  POST /api/session                                       │  │
│  │  └─ Fetch Memory Slots → Create Realtime Session        │  │
│  │                                                           │  │
│  │  POST /api/tools/calendar                                │  │
│  │  POST /api/tools/docs                                    │  │
│  │  POST /api/tools/location                                │  │
│  │  POST /api/tools/memo                                    │  │
│  │                                                           │  │
│  │  POST /api/simulate/location                             │  │
│  │  POST /api/simulate/notification                         │  │
│  │                                                           │  │
│  │  POST /api/cockpit/enroll                                │  │
│  │  GET  /api/cockpit/users                                 │  │
│  │  POST /api/cockpit/select                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Database (Supabase)                    │  │
│  │                                                           │  │
│  │  user_profiles                                           │  │
│  │  ├─ id: UUID                                             │  │
│  │  └─ voice_profile_blob: TEXT (Base64)                    │  │
│  │                                                           │  │
│  │  user_memory_slots (固定10スロット)                       │  │
│  │  ├─ id: UUID                                             │  │
│  │  ├─ user_id: UUID → user_profiles.id                     │  │
│  │  ├─ slot_number: INTEGER (1-10)                          │  │
│  │  ├─ content: TEXT (max 200文字)                          │  │
│  │  └─ updated_at: TIMESTAMP                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │   OpenAI      │  │ Google APIs   │  │   Supabase    │      │
│  │  Realtime     │  │               │  │   Auth        │      │
│  │     API       │  │  Calendar     │  │               │      │
│  │               │  │  Docs         │  │               │      │
│  │  GPT-4o       │  │  Geocoding    │  │               │      │
│  │  TTS/STT      │  │               │  │               │      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## 音声パイプライン詳細

```
┌─────────────────┐         WebRTC (SDP)         ┌──────────────────────┐
│   Browser       │◄────────────────────────────►│   OpenAI Realtime    │
│   Client        │      (Data Channel)          │      API Server      │
└────────┬────────┘                                └──────────────────────┘
         │                                                 │
         │                                                 │
         │ REST API                                        │ Function Call
         │                                                 │ (via Data Channel)
         ▼                                                 ▼
┌─────────────────┐         Tool Execution        ┌──────────────────────┐
│  Next.js API    │◄──────────────────────────────│  External Services   │
│   /api/tools/*  │                                │  (Calendar/Docs/etc) │
└─────────────────┘                                └──────────────────────┘
```

## セッションフロー

```typescript
// Step 1: Client → POST /api/session
const response = await fetch('/api/session', {
  method: 'POST',
  body: JSON.stringify({ userId: selectedUserId })
});

// Step 2: API → Supabase (Fetch Memory Slots)
const { data: slots } = await supabase
  .from('user_memory_slots')
  .select('*')
  .eq('user_id', userId)
  .order('slot_number');

// Step 3: API → OpenAI (Create Realtime Session)
const systemPrompt = buildSystemPrompt(slots);
const session = await openai.realtime.sessions.create({
  model: 'gpt-4o-realtime-preview',
  voice: 'alloy',
});

// Step 4: Client ← { sessionId, clientSecret, model }
return {
  sessionId: generateId(),
  clientSecret: session.client_secret,
  model: session.model
};

// Step 5: Client → WebRTC PeerConnection 確立
const pc = new RTCPeerConnection();
// ... SDP Exchange
```

## Function Calling

```
OpenAI → (response.function_call_arguments.done)
       → { call_id, name, arguments }
       → Client → /api/tools/{name}
       → External API
       → Response → Client
       → (conversation.item.create + response.create)
       → OpenAI
```

## 記憶システム (固定スロット方式)

### スロット構造

1ユーザーにつき10個の固定スロット（各200文字）

### ロジック

- **Load**: セッション開始時に全スロット取得 → System Prompt に注入
- **Update**: LLMツール経由で特定スロットを UPSERT
- **Delete**: content を空文字にセットでクリア

### System Prompt 注入例

```
## あなたが覚えていること:
1. コーヒーはブラックが好き
2. 毎週水曜にジムに行く
3. (空)
...
上記の情報を会話に自然に活用してください。
```

## 位置情報処理フロー

```
Client (シミュレータ or 本番GPS)
    ↓ { lat: 35.6762, lng: 139.6503 }
POST /api/tools/location (Next.js)
    ↓
┌─────────────────────────────────────┐
│ 1. Geocoding API (逆ジオコーディング) │
│    座標 → "渋谷区道玄坂1-2-3"        │
│                                      │
│ 2. Places API (周辺検索)             │
│    座標 → [渋谷駅, ハチ公像, ...]    │
│                                      │
│ 3. コンテキスト生成                   │
│    "渋谷駅付近。観光名所: ハチ公像"   │
└─────────────────────────────────────┘
    ↓ function_call_response
AI: "渋谷駅に着きましたね！ここは若者に人気のスポットで、
     近くにはハチ公像があります。"
```

## データベーススキーマ

### user_profiles

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary Key, auto-generated |
| name | TEXT | ユーザー識別名（UI表示用） |
| voice_profile_blob | TEXT | Base64 encoded voice profile |
| created_at | TIMESTAMP | Auto-generated timestamp |

### user_memory_slots

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary Key, auto-generated |
| user_id | UUID | Foreign Key → user_profiles.id |
| slot_number | INTEGER | 1-10 |
| content | TEXT | 最大200文字 |
| updated_at | TIMESTAMP | 自動更新 |

**制約**: `UNIQUE(user_id, slot_number)`

## 技術スタック

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 16 (App Router) | SSR, API Routes |
| Language | TypeScript 5.x | Type safety |
| UI | React 19, Tailwind CSS | Simple debug UI |
| Voice AI | OpenAI Realtime API (Direct) | GPT-4o, TTS/STT, Function Calling |
| Database | Supabase PostgreSQL | user_profiles, user_memory_slots |
| External APIs | Google Calendar, Docs, Geocoding, Places | Tool execution |
| Deployment | Cloud Run | Serverless container |

## 設計思想

### Client is Thin, Server is Fat

- **クライアント**: Debug Console として機能
  - 音声/模擬データを送信
  - サーバーからのレスポンスを確認
  - ブラウザForeground前提

- **サーバー**: Core Logic を完全集約
  - 記憶管理
  - 判断ロジック
  - ツール実行
  - **必須**: ネイティブアプリ移行時にAPIサーバーを修正なしで利用できる設計

### One API 原則

全クライアント（Web / iOS / Meta Glass）が同一のAPIエンドポイントを使用する。

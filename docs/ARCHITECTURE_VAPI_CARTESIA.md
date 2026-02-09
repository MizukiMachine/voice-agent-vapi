# Voice Engine PoC - Vapi + Cartesia Architecture

**バージョン**: 2.0
**更新日**: 2025-02-09
**ステータス**: Issues #4-11 完了

---

## 概要

本ドキュメントは、OpenAI Realtime API から **Vapi + Cartesia** への移行に伴う新しいアーキテクチャを説明します。

### 移行の理由

- **柔軟性**: VapiはSTT+LLM+Function Callingを統合されたソリューションを提供
- **音質**: Cartesia Sonicは高速かつ高品質なTTSを実現
- **速度制御**: 0.5x - 2.0xの再生速度制御が可能
- **カスタムボイス**: ユーザーごとのボイスプロファイルに対応

---

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
│  │  │ • Settings  │  │ • Audio I/O │  │                 │   │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │ │
│  │                                                           │
│  │  ┌───────────────────────────────────────────────────┐   │ │
│  │  │            Simulation Tools (同一画面)              │   │ │
│  │  │  ┌─────────────────┐  ┌─────────────────────┐     │   │ │
│  │  │  │ Location        │  │ Notification        │     │   │ │
│  │  │  │ Simulator       │  │ Simulator (TTS)     │     │   │ │
│  │  │  │ (緯度経度/地名)  │  │ (テキスト入力)       │     │   │ │
│  │  │  │ (POI通知履歴)   │  │ (ユーザー設定対応)   │     │   │ │
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
│  │  POST /api/webrtc/session                                │  │
│  │  └─ Create Vapi+Cartesia session                         │  │
│  │                                                           │  │
│  │  POST /api/tools/calendar                                │  │
│  │  POST /api/tools/docs                                    │  │
│  │  POST /api/tools/location (Enhanced with POI cool-time)   │  │
│  │  POST /api/tools/memo                                    │  │
│  │                                                           │  │
│  │  POST /api/simulate/location                             │  │
│  │  POST /api/simulate/notification (Enhanced with TTS)     │  │
│  │                                                           │  │
│  │  GET/PUT /api/cockpit/settings                           │  │
│  │  POST /api/cockpit/enroll                                │  │
│  │  GET  /api/cockpit/users                                 │  │
│  │  POST /api/cockpit/select                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Voice Pipeline                          │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │  │
│  │  │   Vapi      │    │  Cartesia   │    │    Audio    │    │  │
│  │  │   Client    │◄──►│   Client    │◄──►│   Gateway    │    │  │
│  │  │  (STT+LLM)  │    │    (TTS)    │    │ (Orchestr.)  │    │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Database (Supabase)                    │  │
│  │                                                           │  │
│  │  user_profiles (Enhanced with settings columns)          │  │
│  │  ├─ location_cool_time: INTEGER                           │  │
│  │  ├─ location_search_radius: INTEGER                      │  │
│  │  ├─ notification_tts_enabled: BOOLEAN                    │  │
│  │  ├─ notification_tts_max_length: INTEGER                 │  │
│  │  ├─ notification_tts_include_title: BOOLEAN              │  │
│  │  └─ notification_tts_include_body: BOOLEAN               │  │
│  │                                                           │  │
│  │  user_poi_notifications (NEW - POI通知履歴管理)         │  │
│  │  ├─ poi_id: TEXT                                         │  │
│  │  ├─ poi_name: TEXT                                       │  │
│  │  ├─ notified_at: TIMESTAMPTZ                              │  │
│  │  └─ latitude/longitude: REAL                             │  │
│  │                                                           │  │
│  │  user_memory_slots (固定10スロット)                       │  │
│  │  └─ content: TEXT (max 200文字)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │     Vapi     │  │   Cartesia   │  │ Google APIs   │      │
│  │              │  │   Sonic API  │  │               │      │
│  │  • STT       │  │              │  │  Calendar     │      │
│  │  • LLM       │  │  • TTS       │  │  Docs         │      │
│  │  • Function  │  │  • Speed     │  │  Geocoding    │      │
│  │    Calling   │  │  • Custom    │  │  Places       │      │
│  │              │  │    Voice     │  │               │      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 音声パイプライン詳細

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Voice Engine                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐         ┌─────────────┐         ┌──────────┐  │
│  │   Client    │◄───────►│ Audio       │◄───────►│  Vapi    │  │
│  │  (WebRTC)   │  Audio  │  Gateway    │  Text   │  (STT+   │  │
│  │             │         │             │         │   LLM)   │  │
│  └─────────────┘         └─────────────┘         └─────┬────┘  │
│                                                       │         │
│                                                       ▼         │
│                                                  ┌──────────┐   │
│                                                  │ Cartesia │   │
│                                                  │   (TTS)  │   │
│                                                  └─────┬────┘   │
│                                                       │         │
│                                                       ▼         │
│                                                  ┌──────────┐   │
│                                                  │  Client  │   │
│                                                  │ (Playback│   │
│                                                  └──────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Audio Pipeline Flow

```
1. Client → Vapi (Audio Input)
   ├─ WebRTC Audio Track (Opus/PCM, 16kHz)
   ├─ AudioGateway: sendClientAudio()
   └─ VapiClient: sendAudio() with format conversion (to mu-law 8kHz)

2. Vapi → Gateway (Text Response)
   ├─ WebSocket message: conversation-item
   ├─ VapiClient: onMessage() handler
   └─ AudioGateway routes to Cartesia

3. Gateway → Cartesia (TTS Request)
   ├─ AudioGateway detects assistant text
   └─ CartesiaClient: synthesize(text) with speed control

4. Cartesia → Client (Audio Output)
   ├─ WebSocket message: audio (base64)
   ├─ CartesiaClient: onAudio() handler
   └─ AudioGateway: onAudio() callback → WebRTC Track
```

### WebSocket Signaling

```
Client                    Server                    Vapi/Cartesia
  │                          │                            │
  │──────── POST /session ───▶│                            │
  │                          │────── Vapi WS ──────────────▶│
  │                          │────── Cartesia WS ──────────▶│
  │◀───── session config ────│                            │
  │                          │                            │
  │──── WebRTC Audio ───────▶│                            │
  │                          │────── Audio Data ─────────▶│
  │                          │                            │
  │                          │◀───── Text Response ────────│
  │                          │────── TTS Request ─────────▶│
  │                          │                            │
  │                          │◀───── Audio Response ───────│
  │◀── WebRTC Audio ─────────│                            │
```

---

## セッションフロー

### 1. セッション作成 (POST /api/webrtc/session)

```typescript
// Request
{
  userId: string,
  config?: {
    voiceId?: string,
    speed?: number
  }
}

// Response
{
  sessionId: string,
  serverConfig: {
    sdpOffer: string,
    iceServers: RTCIceServer[]
  },
  vapiConfig: {
    publicKey: string,
    assistantId: string
  }
}
```

### 2. Vapi+Cartesia 接続

1. **VapiClient** 接続:
   - WebSocket to `wss://api.vapi.ai/ws`
   - Authorization: `Bearer {VAPI_API_KEY}`
   - Send config message with assistantId

2. **CartesiaClient** 接続:
   - WebSocket to `wss://api.cartesia.ai/tts/websocket`
   - Query params: `api_key={CARTESIA_API_KEY}&cartesia_version=2024-06-10`

3. **AudioGateway** 設定:
   - Vapi → Cartesia ルーティング
   - Function Call イベント処理
   - Audio データ転送

---

## 新機能詳細

### Issue #8: Settings UI

**ファイル**: `src/app/api/cockpit/settings/route.ts` (新規)

#### GET /api/cockpit/settings

```typescript
// Request
GET /api/cockpit/settings?userId={userId}

// Response
{
  success: true,
  settings: {
    location_cool_time: number,        // ms (default: 1800000 = 30分)
    location_search_radius: number,    // m (default: 100)
    notification_tts_enabled: boolean, // (default: true)
    notification_tts_max_length: number, // 文字数 (default: 200)
    notification_tts_include_title: boolean, // (default: true)
    notification_tts_include_body: boolean   // (default: true)
  }
}
```

#### PUT /api/cockpit/settings

```typescript
// Request
PUT /api/cockpit/settings
{
  userId: string,
  settings: {
    location_cool_time?: number,
    location_search_radius?: number,
    notification_tts_enabled?: boolean,
    notification_tts_max_length?: number,
    notification_tts_include_title?: boolean,
    notification_tts_include_body?: boolean
  }
}
```

**UIコンポーネント**: `src/app/components/cockpit/SettingsPanel.tsx` (新規)

---

### Issue #9: Location Feature Enhancement

**ファイル**: `src/app/api/tools/location/route.ts` (修正)

#### POIクールタイム判定

```typescript
// Check cool-time before notifying
const coolTimeCheck = await checkPoiCoolTime(userId, poiId, coolTimeMs);

if (coolTimeCheck.skipped) {
  return {
    success: true,
    skipped: true,
    remainingTime: number,  // ms until next notification allowed
    lastNotification: { poi_name, notified_at }
  };
}
```

#### POI通知履歴記録

```sql
-- user_poi_notifications table
CREATE TABLE user_poi_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  poi_id TEXT NOT NULL,           -- Google Places place_id
  poi_name TEXT NOT NULL,
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL
);
```

#### TTS説明文生成

```typescript
// Generate POI description
const description = `${poiName}は${typeText}です。`;

// Generate TTS using Cartesia
const ttsAudio = await generatePOITTS(description);

// Record notification
await recordPoiNotification(userId, poiId, poiName, latitude, longitude);
```

---

### Issue #10: Notification TTS Feature

**ファイル**: `src/app/api/simulate/notification/route.ts` (修正)

#### TTS生成

```typescript
// Build TTS message
let ttsText = `${appPrefix}${messageType}${titlePart}${bodyPart}`;
ttsText = cleanTextForTTS(ttsText);  // Remove emojis, URLs
ttsText = truncateText(ttsText, maxLength);  // Apply user settings

// Generate TTS audio
const ttsAudio = await generateNotificationTTS(ttsText);
```

#### テキストフォーマット

```
{app_name}から通知です。{messageType}{title}。{content}
```

例: `LINEから通知です。新しいメッセージです。田中さん。今度の週末は有空ですか？`

---

## データベーススキーマ更新

### user_profiles 追加カラム

| Column | Type | Default | 説明 |
|--------|------|---------|------|
| location_cool_time | INTEGER | 1800000 | クールタイム |
| location_search_radius | INTEGER | 100 | 検索半径 |
| notification_tts_enabled | BOOLEAN | true | TTS有効/無効 |
| notification_tts_max_length | INTEGER | 200 | 最大文字数 |
| notification_tts_include_title | BOOLEAN | true | タイトル読み上げ |
| notification_tts_include_body | BOOLEAN | true | 本文読み上げ |

### user_poi_notifications (新規)

| Column | Type | 説明 |
|--------|------|------|
| id | UUID | Primary Key |
| user_id | UUID | Foreign Key → user_profiles |
| poi_id | TEXT | Google Places place_id |
| poi_name | TEXT | POI名 (例: "東京駅") |
| notified_at | TIMESTAMPTZ | 通知時刻 |
| latitude | REAL | 緯度 |
| longitude | REAL | 経度 |

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| VapiClient | `src/app/lib/vapi-client.ts` | WebSocket client for Vapi STT+LLM |
| CartesiaClient | `src/app/lib/cartesia-client.ts` | WebSocket client for Cartesia TTS |
| AudioGateway | `src/app/lib/audio-gateway.ts` | Audio routing orchestration |
| AudioConverter | `src/app/lib/audio-converter.ts` | Opus/PCM → mu-law conversion |
| WebRTCPeerManager | `src/app/lib/webrtc-peer-manager.ts` | WebRTC peer connection management |
| WebRTCSessionManager | `src/app/lib/webrtc-session-manager.ts` | Session lifecycle management |

---

## Audio Format Requirements

| Stage | Format | Sample Rate | Bit Depth |
|-------|--------|-------------|-----------|
| WebRTC Input | Opus/PCM | 16kHz | 16-bit |
| Vapi Required | mu-law | 8kHz | 8-bit |
| Cartesia Output | PCM16 | 24kHz | 16-bit |

---

## 環境変数

```bash
# ============================================================
# Server-side only (MUST NOT BE PUBLIC)
# ============================================================

# Vapi
VAPI_API_KEY=           # Vapi API key
VAPI_PUBLIC_KEY=        # Vapi public key (for client)
VAPI_ASSISTANT_ID=      # Vapi Assistant ID

# Cartesia
CARTESIA_API_KEY=       # Cartesia API key
CARTESIA_VOICE_ID=      # Voice ID (default: 79a125e6-c5a2-4b9d-8b3f-5c2a1b2d3e4f)
CARTESIA_DEFAULT_SPEED= # Playback speed 0.5-2.0 (default: 1.0)
CARTESIA_SAMPLE_RATE=   # Audio sample rate (default: 24000)
CARTESIA_OUTPUT_FORMAT= # Output format (default: pcm16)

# Google APIs
GOOGLE_MAPS_API_KEY=    # Google Maps API key (for location features)
```

---

## テスト

### 単体テスト

```bash
npm test
```

- `__tests__/lib/vapi-client.test.ts` - Vapi WebSocket client tests
- `__tests__/lib/cartesia-client.test.ts` - Cartesia WebSocket client tests
- `__tests__/lib/audio-gateway.test.ts` - Audio routing tests
- `__tests__/lib/webrtc-peer-manager.test.ts` - Connection management tests

### 統合テスト

```bash
npm run test:integration
```

- `__tests__/integration/audio-pipeline.test.ts` - End-to-end pipeline tests

---

## パフォーマンス目標

| 指標 | 目標値 | 現在値 |
|------|--------|--------|
| E2Eレイテンシ | < 800ms | TBD |
| 音声変換レイテンシ | < 50ms | ✅ |
| TTS生成レイテンシ | < 500ms | TBD |
| WebRTC接続確立 | < 2s | ✅ |

---

## 次のステップ

1. **Issue #7**: Client-Side Updates - 新しいセッション形式対応
2. **E2Eテスト**: 全機能の統合テスト実施
3. **パフォーマンス最適化**: レイテンシ測定と改善
4. **ネイティブアプリ移行**: APIサーバーを修正なしで利用

---

**ドキュメントバージョン**: 2.0
**最終更新**: 2025-02-09
**Issues**: #4-11 完了

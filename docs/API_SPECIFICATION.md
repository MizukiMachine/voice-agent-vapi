# Voice Engine Studio - API仕様書

## 概要

Voice Engine Studioは、**OpenAI Realtime API**を直接使用したWebRTCベースの音声対話サービスです。
サーバーサイドのCore Logicを完全集約し、クライアント（iOS/Android/Meta Glass）が変更なしで利用可能な設計です。

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        iOS App (Client)                          │
│                                                                  │
│  RTCPeerConnection ──────┐                                       │
│  ├─ Audio Track (Mic)    │                                       │
│  ├─ Audio Track (Remote) │                                       │
│  └─ Data Channel         │                                       │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            │ HTTP         │ WebRTC       │ WebRTC
            ▼              ▼              ▼
┌─────────────────┐  ┌─────────────┐  ┌──────────────┐
│  Voice Engine   │  │    OpenAI   │  │   OpenAI     │
│   Studio API    │  │ Realtime    │  │  Realtime    │
│                 │  │   API       │  │    API       │
│  /api/session   │  │  (Token)    │  │   (Audio)    │
│  /api/tools/*   │  │             │  │              │
└─────────────────┘  └─────────────┘  └──────────────┘
        │
        ▼
┌─────────────────┐
│  Supabase DB    │
│  - user_profiles│
│  - memories     │
└─────────────────┘
```

---

## Session API

### POST /api/session

**OpenAI Realtime API**のセッションを作成し、Ephemeral Token（一時トークン）を発行します。

**リクエストヘッダー**:
```http
Content-Type: application/json
```

**リクエストボディ**:
```json
{
  "userId": "uuid-string"
}
```

| パラメータ | タイプ | 必須 | 説明 |
|-----------|-------|------|------|
| userId | string | Yes | UUID v4形式のユーザーID |

**成功時のレスポンス（200 OK）**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "clientSecret": "ek_68af296e8e408191a1120ab6383263c2",
  "model": "gpt-realtime"
}
```

| フィールド | 説明 | 用途 |
|-----------|------|------|
| sessionId | セッション識別子 | ログ用 |
| clientSecret | OpenAI用Ephemeral Token | **WebRTC接続に必須** |
| model | 使用するモデル名 | SDP Exchange URL |

**エラーレスポンス**:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーの説明"
  }
}
```

**エラーコード**:

| コード | HTTP | 説明 |
|-------|------|------|
| INVALID_REQUEST | 400 | userIdが無効なUUID形式 |
| USER_NOT_FOUND | 404 | ユーザーが存在しない |
| SUPABASE_ERROR | 500 | データベース接続エラー |
| OPENAI_ERROR | 502 | OpenAI APIエラー |

**処理フロー**:
```
1. Supabaseから user_profiles を取得
2. Supabaseから user_memory_slots (10スロット) を取得
3. System Promptを構築（ユーザー名 + メモリスロットを注入）
4. OpenAI Realtime APIにセッション作成リクエスト
5. Ephemeral Tokenを取得
6. セッションをインメモリストアに保存（1時間で自動削除）
7. クライアントへ返却
```

---

## Cockpit API（開発用）

ユーザー管理用のAPIです。主に開発・テスト用に使用します。

### POST /api/cockpit/enroll

新規ユーザーを登録します。

**リクエストボディ**:
```json
{
  "name": "ユーザー名"
}
```

**成功時のレスポンス（200 OK）**:
```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### GET /api/cockpit/users

登録済みユーザーの一覧を取得します。

**成功時のレスポンス（200 OK）**:
```json
{
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "田中太郎",
      "createdAt": "2024-01-15T10:00:00Z"
    },
    {
      "id": "65f95411-e6a7-8921-bcde-f12345678901",
      "name": "山田花子",
      "createdAt": "2024-01-14T09:00:00Z"
    }
  ],
  "count": 2
}
```

### POST /api/cockpit/select

検証用ユーザーを選択します（Web版Cockpitでの使用）。

**リクエストボディ**:
```json
{
  "userId": "uuid-string"
}
```

---

## Tools API

Function Call実行時にクライアントから呼び出されるAPIです。

### POST /api/tools/calendar

Google Calendarとの連携。予定の取得・作成。

**リクエストボディ**:
```json
{
  "message": {
    "toolCallList": [
      {
        "id": "call_abc123",
        "function": {
          "name": "calendar_action",
          "arguments": {
            "action": "list",
            "timeMin": "2024-01-15T00:00:00Z",
            "timeMax": "2024-01-15T23:59:59Z"
          }
        }
      }
    ]
  }
}
```

**成功時のレスポンス（200 OK）**:
```json
{
  "results": [
    {
      "toolCallId": "call_abc123",
      "result": "{\"success\":true,\"events\":[...],\"count\":2}"
    }
  ]
}
```

### POST /api/tools/docs

Google Docsとの連携。ドキュメントの作成・編集。

**リクエストボディ**:
```json
{
  "message": {
    "toolCallList": [
      {
        "id": "call_def456",
        "function": {
          "name": "docs_action",
          "arguments": {
            "action": "create",
            "title": "新規ドキュメント"
          }
        }
      }
    ]
  }
}
```

### POST /api/tools/memo

ユーザーメモの保存（スロット1-10）。

**リクエストボディ**:
```json
{
  "message": {
    "toolCallList": [
      {
        "id": "call_ghi789",
        "function": {
          "name": "memo_action",
          "arguments": {
            "slot_number": 1,
            "content": "覚えておいてほしい内容"
          }
        }
      }
    ]
  }
}
```

### POST /api/tools/location

位置情報処理。逆ジオコーディングと周辺施設検索。

**リクエストボディ**:
```json
{
  "message": {
    "toolCallList": [
      {
        "id": "call_jkl012",
        "function": {
          "name": "map_action",
          "arguments": {
            "latitude": 35.6762,
            "longitude": 139.6503
          }
        }
      }
    ]
  }
}
```

---

## Health Check API

### GET /api/health

サーバーの稼働状態を確認します。

**成功時のレスポンス（200 OK）**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-28T10:00:00Z",
  "traceId": "869167f7-b757-4c36-a5ca-af0101efc714",
  "services": {
    "supabase": true,
    "openai": true
  },
  "version": "0.1.0",
  "environment": "production"
}
```

---

## WebRTC接続フロー

### 1. セッション作成

```bash
curl -X POST https://your-app-url.com/api/session \
  -H "Content-Type: application/json" \
  -d '{"userId":"550e8400-e29b-41d4-a716-446655440000"}'
```

### 2. WebRTC接続確立

**Ephemeral Tokenを使用したSDP Exchange**:

```http
POST https://api.openai.com/v1/realtime/calls
Authorization: Bearer {clientSecret}
Content-Type: application/sdp

[SDP Offer]
```

**レスポンス（SDP Answer）**:
```
v=0
o=- 123456789 2 IN IP4 127.0.0.1
...
[SDP Answer]
```

### 3. Data Channelイベント

**受信イベント例**:

```json
// AI発話完了 (GA: response.output_audio_transcript.done)
{"type":"response.output_audio_transcript.done","transcript":"こんにちは！"}

// Function Call要求
{"type":"response.function_call_arguments.done","call_id":"call_123","name":"calendar_action","arguments":"{\"action\":\"list\"}"}

// ユーザー発話認識
{"type":"conversation.item.input_audio_transcription.completed","transcript":"今日の予定を教えて"}
```

**送信イベント例**:

```json
// Function Call結果送信
{"type":"conversation.item.create","item":{"type":"function_call_output","call_id":"call_123","output":"{\"success\":true}"}}

// AI応答要求
{"type":"response.create"}
```

---

## Function Callツール定義

### calendar_action

Google Calendarで予定を確認・作成。

| パラメータ | タイプ | 必須 | 説明 |
|-----------|-------|------|------|
| action | string | Yes | `"list"` または `"create"` |
| timeMin | string | No | 開始日時（ISO 8601、list時） |
| timeMax | string | No | 終了日時（ISO 8601、list時） |
| maxResults | number | No | 最大取得件数（デフォルト10） |
| summary | string | Yes* | 予定タイトル（create時） |
| startTime | string | Yes* | 開始日時（create時） |
| endTime | string | Yes* | 終了日時（create時） |

### docs_action

Google Docsでドキュメントを作成・編集。

| パラメータ | タイプ | 必須 | 説明 |
|-----------|-------|------|------|
| action | string | Yes | `"create"`, `"read"`, `"append"` |
| title | string | No | ドキュメントタイトル（create時） |
| documentId | string | No | ドキュメントID（read/append時） |
| content | string | No | 追加内容（append時） |

### memo_action

ユーザーメモを保存（スロット1-10）。

| パラメータ | タイプ | 必須 | 説明 |
|-----------|-------|------|------|
| slot_number | number | No | スロット番号（1-10、省略時は空きスロット） |
| content | string | Yes | 保存内容（200文字以内） |

### map_action

座標から位置情報を取得。

| パラメータ | タイプ | 必須 | 説明 |
|-----------|-------|------|------|
| latitude | number | Yes | 緯度 |
| longitude | number | Yes | 経度 |

---

## エラーレスポンス

すべてのAPIは以下の形式でエラーを返します。

**Response (4xx/5xx)**:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーの説明"
  }
}
```

### エラーコード一覧

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_REQUEST | 400 | リクエストパラメータが不正 |
| USER_NOT_FOUND | 404 | 指定されたユーザーが存在しない |
| SUPABASE_ERROR | 500 | Supabase接続エラー |
| OPENAI_ERROR | 502 | OpenAI APIエラー |
| GOOGLE_API_ERROR | 502 | Google APIエラー |
| INTERNAL_ERROR | 500 | 内部エラー |

---

## 環境変数（サーバー側）

iOSクライアントからは直接参照しませんが、サーバー側で設定されている環境変数は以下の通りです。

| 変数名 | 用途 |
|--------|------|
| OPENAI_API_KEY | OpenAI Realtime API |
| SUPABASE_SERVICE_ROLE_KEY | Supabase RLS bypass |
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase Anon Key |
| GOOGLE_CLIENT_ID | Google OAuth |
| GOOGLE_CLIENT_SECRET | Google OAuth |
| GOOGLE_REFRESH_TOKEN | Google OAuth |
| GOOGLE_MAPS_API_KEY | Maps/Geocoding |

---

## 制限事項

- **セッション有効期限**: Ephemeral Tokenの有効期限は約1時間
- **メモリ管理**: PoC版はインメモリストアを使用（本番ではRedis等が必要）
- **同時セッション数**: サーバーリソースに依存
- **同時接続数**: 1ユーザーあたり1セッション推奨

---

## 参考ドキュメント

- [iOS統合ガイド](./IOS_INTEGRATION_GUIDE.md) - iOSクライアント実装者向け詳細ガイド
- [アーキテクチャ](./ARCHITECTURE.md) - システムアーキテクチャ詳細
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)

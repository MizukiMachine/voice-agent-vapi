# Voice Engine Studio - iOSクライアント接続ガイド

## 1. まず最初に理解すること（5W1H）

### What（これは何？）

Voice Engine Studioは、**OpenAI Realtime API**を使った音声対話機能を提供するバックエンドサービスです。iOSアプリからこのサーバーに接続することで、以下の機能が利用できます：

- **リアルタイム音声対話**: GPT-realtime (GA) との低遅延な音声会話（WebRTC直接接続）
- **ツール実行**: Google Calendar、Google Docs、メモ機能、地図機能
- **記憶管理**: ユーザーごとの会話履歴・記憶の保存と呼び出し（サーバー側自動管理）

**重要**: このサーバーは「Fat Server, Thin Client」設計です。複雑なロジックはサーバー側が担当するため、iOSクライアントは以下のことに集中できます：

1. 音声の入出力（マイク・スピーカー）
2. WebRTCによるOpenAI Realtime APIへの直接接続
3. Function Callのプロキシ（サーバーへ転送）

**アーキテクチャの特徴**:
- Webブラウザ版の実装（VoiceInterface.tsx）がそのまま参考になります
- サーバーはEphemeral Token（一時トークン）の発行のみ担当
- 音声ストリームはiOSアプリ ↔ OpenAI Realtime APIで直接やり取り

### Why（なぜ必要？）

- **時短開発**: 音声AI、記憶システム、外部API連携を自作する必要がありません
- **品質保証**: サーバー側でテスト済みのロジックをそのまま利用できます
- **スケーラビリティ**: サーバー側の改善が、iOSアプリに自動的に反映されます
- **カスタマイズ自由**: System Prompt、ツール定義をサーバー側で変更可能

### Who（誰が使う？）

iOSネイティブアプリ開発者です。WebRTCの深い知識は不要です。

**想定スキルセット**:
- Swift、iOS SDKの基本知識
- URLSession等のHTTP通信経験
- （必須ではない）WebRTCや音声処理の知識

### When（いつ使う？）

- iOSアプリに音声アシスタント機能を実装する際
- Meta Glasses等のウェアラブルデバイスと連携する際
- 既存のVoice Engine Studio Web版をネイティブアプリ化する際

### Where（どこで使う？）

- **本番環境**: Cloud Run等のサーバーにデプロイされたAPI
- **開発環境**: ローカルのNext.js開発サーバー（`http://localhost:3000`）

### How（どうやって使う？）

**基本フロー**:
```
iOSアプリ → WebRTC → OpenAI Realtime API (gpt-realtime GA)
           ↓                    ↓
     Function Call時      音声ストリーム・イベント
           ↓                    ↓
    Voice Engine API ←──────────┘
           ↓
    Google Calendar/Docs等
```

**重要な違い**:
- **古い方式（VAPI）**: iOS → VAPIサーバー → OpenAI
- **新しい方式（現在）**: iOS ↔ OpenAI Realtime API（直接接続）

---

## 2. 全体の流れ（ステップバイステップ）

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                        iOS App (Client)                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              音声入出力レイヤ（AVFoundation等）           │  │
│  │  • マイクからの音声収集                                  │  │
│  │  • スピーカーへの音声再生                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↑↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           WebRTCレイヤ（RTCPeerConnection相当）           │  │
│  │  • WebRTC PeerConnectionの確立                           │  │
│  │  • Data Channel ("oai-events")でのイベント送受信          │  │
│  │  • 音声Trackの送受信                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↑↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Function Call プロキシ                        │  │
│  │  • Function Callイベントを検知                           │  │
│  │  • Voice Engine APIへHTTPリクエスト                      │  │
│  │  • 結果をData Channelへ返送                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌─────▼──────┐   ┌─────▼──────┐
    │  HTTP(S)    │   │   WebRTC   │   │   WebRTC   │
    └──────┬──────┘   └─────┬──────┘   └─────┬──────┘
           │                 │                 │
┌──────────▼─────────────────▼─────────────────▼──────────────────┐
│              Voice Engine Studio (Next.js Server)               │
│                                                                  │
│  POST /api/session         → Ephemeral Token発行                │
│  POST /api/tools/calendar  → カレンダー操作                     │
│  POST /api/tools/docs      → ドキュメント操作                   │
│  POST /api/tools/memo      → メモ保存                           │
│  POST /api/tools/location  → 位置情報取得                       │
│  GET  /api/cockpit/users   → ユーザー一覧取得                   │
│  POST /api/cockpit/enroll  → 新規ユーザー登録                   │
└──────────────────────────────────────────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │   PostgreSQL     │
                    │   (Supabase)     │
                    └──────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│              OpenAI Realtime API & External Services             │
│                                                                  │
│  OpenAI Realtime API     → 音声対話・Function Call呼び出し      │
│  Google Calendar/Docs    → 外部ツール実行                       │
└──────────────────────────────────────────────────────────────────┘
```

### ステップ0: 準備（userIdの取得方法）

音声セッションを開始する前に、**userId**（ユーザーID）が必要です。

#### 方法A: 既存ユーザー一覧から選択

```bash
# ユーザー一覧を取得
curl -X GET https://your-app-url.com/api/cockpit/users
```

**レスポンス例**:
```json
{
  "users": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "田中太郎",
      "createdAt": "2024-01-15T10:00:00Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "山田花子",
      "createdAt": "2024-01-14T09:00:00Z"
    }
  ],
  "count": 2
}
```

#### 方法B: 新規ユーザー登録

```bash
# 新規ユーザーを登録
curl -X POST https://your-app-url.com/api/cockpit/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新規ユーザー"
  }'
```

**レスポンス例**:
```json
{
  "success": true,
  "userId": "c3d4e5f6-a7b8-9012-cdef-123456789012"
}
```

**注意点**:
- `userId`はUUID形式です（例: `550e8400-e29b-41d4-a716-446655440000`）
- ユーザー登録時に声紋登録は不要です（PoCでは声紋認証は必須ではありません）
- 複数のユーザーを作成して切り替えてテスト可能です

### ステップ1: セッションを作る

Voice Engine Studio APIから**Ephemeral Token**（一時トークン）を取得します。

#### リクエスト

```bash
curl -X POST https://your-app-url.com/api/session \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }'
```

#### レスポンス（成功時）

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "clientSecret": "ek_68af296e8e408191a1120ab6383263c2",
  "model": "gpt-realtime"
}
```

**レスポンス項目の説明**:

| 項目 | 説明 | 使用箇所 |
|------|------|---------|
| `sessionId` | セッション識別子 | ログ用（WebRTC接続には不要） |
| `clientSecret` | OpenAI Realtime API接続用Ephemeral Token | **WebRTC接続時に必須** |
| `model` | 使用するモデル名 | SDP Exchange時のURLパラメータ |

#### エラーレスポンス例

```json
// 400 Bad Request - userIdが無効
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "userId must be a valid UUID"
  }
}

// 404 Not Found - ユーザーが存在しない
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found"
  }
}

// 500 Internal Server Error - サーバー設定エラー
{
  "error": {
    "code": "OPENAI_ERROR",
    "message": "OpenAI API key is not configured"
  }
}

// 502 Bad Gateway - OpenAI APIエラー
{
  "error": {
    "code": "OPENAI_ERROR",
    "message": "Failed to create Realtime session: 401"
  }
}
```

**注意点**:
- `clientSecret`は**機密情報**です。ログに出力しないよう注意してください
- `clientSecret`の有効期限は約1時間です（OpenAIの仕様）
- 同じ`userId`で複数回セッションを作成可能です（都度新しいトークンが発行されます）

### ステップ2: WebRTCで接続する

取得した`clientSecret`を使って、**OpenAI Realtime APIと直接WebRTC接続**を確立します。

#### WebRTC接続フロー（詳細）

```
iOS App                          OpenAI Realtime API
   │                                    │
   │  1. RTCPeerConnection作成          │
   │  2. Data Channel作成 ("oai-events") │
   │  3. マイクTrack追加               │
   │  4. SDP Offer作成                  │
   │                                    │
   │─────── 5. SDP Offer ──────────────>│
   │      (POST https://api.openai.com/v1/realtime/calls)
   │      (Authorization: Bearer clientSecret)
   │      (Content-Type: application/sdp)
   │                                    │
   │<────── 6. SDP Answer ──────────────│
   │      (text/plainでSDPが返る)       │
   │                                    │
   │  7. Remote Description設定         │
   │  8. ICE Connection State完了      │
   │  9. 接続完了 ✓                      │
   │                                    │
   │  ═══════ 音声ストリーム開始 ═══════│
   │                                    │
   │  ═══════ Data Channelイベント開始 ═│
```

#### 実装のポイント

**重要**: WebRTCの実装は複雑です。以下のライブラリ使用を推奨します：

| ライブラリ | 説明 | URL |
|-----------|------|-----|
| [GoogleWebRTC](https://github.com/google/GoogleWebRTC) | Google公式のWebRTCライブラリ | https://github.com/google/GoogleWebRTC |
| [SwiftWebRTC](https://github.com/stasel/WebRTC) | Swiftでの実装例 | https://github.com/stasel/WebRTC |

**最小限の実装要件**:

1. **RTCPeerConnectionの作成**
   - STUNサーバーの設定（`stun:stun.l.google.com:19302`等）
   - ICE candidateの収集

2. **Data Channelの作成**
   - ラベル: `oai-events`（**必須**）
   - 送受信するイベントはJSON形式

3. **音声Trackの追加**
   - マイク入力を`RTCPeerConnection`に追加
   - 受信した音声Trackをスピーカーにルーティング

4. **SDP Exchange**
   - Offerを作成してOpenAI APIに送信
   - URL: `https://api.openai.com/v1/realtime/calls`
   - ヘッダー: `Authorization: Bearer {clientSecret}`
   - ヘッダー: `Content-Type: application/sdp`
   - Answerを受信してRemote Descriptionに設定

### ステップ3: 会話する

WebRTC接続が確立すると、自動的に音声対話が開始されます。

#### Data Channelイベントの例

**AI側の発話開始**:
```json
{
  "type": "response.output_audio.delta"
}
```

**AI側の発話内容（テキスト）**:
```json
{
  "type": "response.output_audio_transcript.done",
  "transcript": "こんにちは！田中さん。今日はどのようなお手伝いをしましょうか？"
}
```

**ユーザーの発話認識結果**:
```json
{
  "type": "conversation.item.input_audio_transcription.completed",
  "transcript": "今日の予定を教えて"
}
```

**Function Callの実行要求**:
```json
{
  "type": "response.function_call_arguments.done",
  "call_id": "call_abc123",
  "name": "calendar_action",
  "arguments": "{\"action\":\"list\"}"
}
```

### ステップ4: 切断する

セッションを終了する際は、WebRTC接続をクリーンアップします。

**手順**:
1. Data Channelを閉じる
2. RTCPeerConnectionを閉じる
3. 音声Trackを停止する
4. リソースを解放する

---

## 3. それぞれのステップの詳細

### ステップ1詳細: セッション作成API

#### エンドポイント

```
POST /api/session
```

#### リクエストヘッダー

```http
Content-Type: application/json
```

#### リクエストボディ

```json
{
  "userId": "uuid-string"
}
```

#### Swift実装例（URLSession）

```swift
import Foundation

// MARK: - Models

struct SessionResponse: Codable {
    let sessionId: String
    let clientSecret: String
    let model: String
}

struct SessionRequest: Codable {
    let userId: String
}

struct ErrorResponse: Codable {
    let error: ErrorDetail
}

struct ErrorDetail: Codable {
    let code: String
    let message: String
}

// MARK: - API Client

class VoiceEngineAPIClient {
    private let baseURL: String
    private let session: URLSession

    init(baseURL: String = "https://your-app-url.com") {
        self.baseURL = baseURL
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30.0
        self.session = URLSession(configuration: configuration)
    }

    /// セッションを作成してEphemeral Tokenを取得
    func createSession(userId: String) async throws -> SessionResponse {
        let url = URL(string: "\(baseURL)/api/session")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let requestBody = SessionRequest(userId: userId)
        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            // エラーレスポンスのパース
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverError(
                    code: errorResponse.error.code,
                    message: errorResponse.error.message,
                    statusCode: httpResponse.statusCode
                )
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }

        return try JSONDecoder().decode(SessionResponse.self, from: data)
    }

    /// ユーザー一覧を取得
    func getUsers() async throws -> [User] {
        struct UsersResponse: Codable {
            let users: [User]
            let count: Int
        }

        struct User: Codable {
            let id: String
            let name: String
            let createdAt: Date
        }

        let url = URL(string: "\(baseURL)/api/cockpit/users")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let usersResponse = try JSONDecoder().decode(UsersResponse.self, from: data)
        return usersResponse.users
    }

    /// 新規ユーザーを登録
    func enrollUser(name: String) async throws -> String {
        struct EnrollRequest: Codable {
            let name: String
        }

        struct EnrollResponse: Codable {
            let success: Bool
            let userId: String
        }

        let url = URL(string: "\(baseURL)/api/cockpit/enroll")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let requestBody = EnrollRequest(name: name)
        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let enrollResponse = try JSONDecoder().decode(EnrollResponse.self, from: data)
        return enrollResponse.userId
    }
}

// MARK: - Errors

enum APIError: Error, LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int)
    case serverError(code: String, message: String, statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let statusCode):
            return "HTTP error: \(statusCode)"
        case .serverError(let code, let message, _):
            return "[\(code)] \(message)"
        }
    }
}
```

#### レスポンス詳細

**成功時（200 OK）**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "clientSecret": "ek_68af296e8e408191a1120ab6383263c2",
  "model": "gpt-realtime"
}
```

**エラー時**:

| HTTP Status | エラーコード | 原因 | 対処法 |
|-------------|-------------|------|--------|
| 400 | INVALID_REQUEST | userIdの形式が不正 | UUID形式か確認 |
| 404 | USER_NOT_FOUND | ユーザーが存在しない | `/api/cockpit/users`で確認 |
| 500 | SUPABASE_ERROR | データベース接続エラー | サーバー管理者に連絡 |
| 502 | OPENAI_ERROR | OpenAI APIエラー | APIキー設定を確認 |

### ステップ2詳細: WebRTC接続

#### WebRTC実装に必要なコンポーネント

**必須要素**:

1. **RTCPeerConnection**: WebRTC接続を管理
2. **RTCDataChannel**: イベント送受信用チャネル（ラベル: `oai-events`）
3. **RTCAudioTrack**: 音声送受信
4. **ICEServer**: STUN/TURNサーバー設定

#### Data Channelイベント一覧

**受信する主なイベント**:

| イベントタイプ | 説明 | ハンドリングが必要？ | 実装例 |
|---------------|------|-------------------|--------|
| `session.created` | セッション作成完了 | 不要（ログ用） | `print("Session created")` |
| `session.updated` | セッション更新 | 不要 | - |
| `response.output_audio.delta` | AI発話の音声データ開始 | UI更新用 | `isSpeaking = true` |
| `response.output_audio_transcript.done` | AI発話のテキスト完了 | 会話ログ表示用 | `appendLog(transcript)` |
| `response.output_audio.done` | AI発話完了 | UI更新用 | `isSpeaking = false` |
| `response.function_call_arguments.done` | Function Callの実行要求 | **必須** | `executeFunctionCall()` |
| `conversation.item.input_audio_transcription.completed` | ユーザー発話の認識結果 | 会話ログ表示用 | `appendLog(transcript)` |
| `input_audio_buffer.speech_started` | ユーザーの発話開始検知 | UI更新用 | `isListening = true` |
| `input_audio_buffer.speech_stopped` | ユーザーの発話終了検知 | UI更新用 | `isListening = false` |
| `error` | エラー発生 | エラー表示用 | `showError(error)` |
| `rate_limits.updated` | レート制限情報 | 不要 | - |

#### Swift実装例（概念コード）

※ 実際のWebRTC実装は複雑なため、主要なフローのみ示します。詳細はライブラリのドキュメントを参照してください。

```swift
import Foundation
import WebRTC

// MARK: - Voice Engine Client

class VoiceEngineClient: NSObject, RTCPeerConnectionDelegate, RTCDataChannelDelegate {
    // MARK: - Properties

    private let apiClient: VoiceEngineAPIClient
    private var peerConnection: RTCPeerConnection?
    private var dataChannel: RTCDataChannel?
    private var remoteAudioTrack: RTCAudioTrack?
    private let audioSession = AVAudioSession.sharedInstance()

    // Callbacks
    var onTranscriptReceived: ((String, Bool) -> Void)? // (text, isUser)
    var onSpeakingChanged: ((Bool) -> Void)?
    var onError: ((String) -> Void)?

    // MARK: - Initialization

    init(apiClient: VoiceEngineAPIClient = VoiceEngineAPIClient()) {
        self.apiClient = apiClient
        super.init()
        setupAudioSession()
    }

    private func setupAudioSession() {
        do {
            try audioSession.setCategory(.playAndRecord, mode: .default)
            try audioSession.setActive(true)
        } catch {
            print("Failed to setup audio session: \(error)")
        }
    }

    // MARK: - Session Management

    /// 音声セッションを開始
    func startSession(userId: String) async throws {
        // 1. セッション作成（Ephemeral Token取得）
        let session = try await apiClient.createSession(userId: userId)

        // 2. WebRTC接続確立
        try await connectWebRTC(clientSecret: session.clientSecret, model: session.model)

        print("Session started successfully")
    }

    /// WebRTC接続を確立
    private func connectWebRTC(clientSecret: String, model: String) async throws {
        // 1. RTCPeerConnectionの作成
        let config = RTCConfiguration()
        config.iceServers = [
            RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])
        ]
        config.sdpSemantics = .unifiedPlan

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: nil
        )
        let pcFactory = RTCPeerConnectionFactory()

        peerConnection = pcFactory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: self
        )

        guard let peerConnection = peerConnection else {
            throw VoiceEngineError.peerConnectionFailed
        }

        // 2. Data Channelの作成
        let dataConfig = RTCDataChannelConfiguration()
        dataConfig.isOrdered = true
        dataChannel = peerConnection.dataChannel(
            forLabel: "oai-events",
            configuration: dataConfig
        )
        dataChannel?.delegate = self

        // 3. マイクTrackの追加
        let audioSource = pcFactory.audioSource(with: constraints)
        let audioTrack = audioSource.track(withId: "audio0")
        let stream = pcFactory.mediaStream(withStreamId: "stream0")
        stream.addAudioTrack(audioTrack!)
        peerConnection.add(stream)

        // 4. SDP Offerの作成
        let offer = try await peerConnection.offer(for: constraints)
        try await peerConnection.setLocalDescription(offer)

        // ICE収集完了を待つ
        try await waitForIceGathering()

        // 5. SDP OfferをOpenAI APIに送信
        let answerSDP = try await sendSDPOffer(
            sdp: offer.sdp,
            clientSecret: clientSecret,
            model: model
        )

        // 6. SDP Answerを設定
        let answer = RTCSessionDescription(type: .answer, sdp: answerSDP)
        try await peerConnection.setRemoteDescription(answer)

        print("WebRTC connection established")
    }

    /// ICE収集完了を待つ
    private func waitForIceGathering() async throws {
        return try await withCheckedThrowingContinuation { continuation in
            guard let peerConnection = peerConnection else {
                continuation.resume(throwing: VoiceEngineError.peerConnectionFailed)
                return
            }

            // 既に完了している場合
            if peerConnection.iceGatheringState == .complete {
                continuation.resume()
                return
            }

            // 状態変化を監視
            let observer = peerConnection.observe(\.iceGatheringState) { pc, _ in
                if pc.iceGatheringState == .complete {
                    continuation.resume()
                }
            }

            // タイムアウト処理（30秒）
            Task {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                observer.invalidate()
                continuation.resume(throwing: VoiceEngineError.timeout)
            }
        }
    }

    /// SDP OfferをOpenAI APIに送信
    private func sendSDPOffer(sdp: String?, clientSecret: String, model: String) async throws -> String {
        guard let sdp = sdp else {
            throw VoiceEngineError.invalidSDP
        }

        let url = URL(string: "https://api.openai.com/v1/realtime/calls")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(clientSecret)", forHTTPHeaderField: "Authorization")
        request.setValue("application/sdp", forHTTPHeaderField: "Content-Type")
        request.httpBody = sdp.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw VoiceEngineError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw VoiceEngineError.sdpExchangeFailed(statusCode: httpResponse.statusCode)
        }

        guard let answerSDP = String(data: data, encoding: .utf8) else {
            throw VoiceEngineError.invalidSDP
        }

        return answerSDP
    }

    /// セッションを終了
    func endSession() {
        dataChannel?.close()
        peerConnection?.close()
        dataChannel = nil
        peerConnection = nil
        print("Session ended")
    }

    // MARK: - RTCDataChannelDelegate

    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard let data = buffer.data.data(using: .utf8),
              let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = event["type"] as? String else {
            return
        }

        handleEvent(event: event, type: type)
    }

    /// Data Channelイベントを処理
    private func handleEvent(event: [String: Any], type: String) {
        switch type {
        // GA: response.output_audio_transcript.done (fallback for beta compatibility)
        case "response.output_audio_transcript.done", "response.audio_transcript.done":
            if let transcript = event["transcript"] as? String {
                onTranscriptReceived?(transcript, false)
            }

        case "conversation.item.input_audio_transcription.completed":
            if let transcript = event["transcript"] as? String {
                onTranscriptReceived?(transcript, true)
            }

        // GA: response.output_audio.delta (fallback for beta compatibility)
        case "response.output_audio.delta", "response.audio.delta":
            onSpeakingChanged?(true)

        case "response.output_audio.done", "response.audio.done", "response.done":
            onSpeakingChanged?(false)

        case "response.function_call_arguments.done":
            handleFunctionCall(event: event)

        case "error":
            if let error = event["error"] as? [String: Any],
               let message = error["message"] as? String {
                onError?(message)
            }

        case "session.created", "session.updated",
             "input_audio_buffer.speech_started",
             "input_audio_buffer.speech_stopped",
             "rate_limits.updated":
            // ログ用イベント
            print("Event: \(type)")

        default:
            print("Unhandled event: \(type)")
        }
    }

    // MARK: - Function Call Handling

    /// Function Callを実行
    private func handleFunctionCall(event: [String: Any]) {
        guard let callId = event["call_id"] as? String,
              let name = event["name"] as? String,
              let argumentsString = event["arguments"] as? String,
              let argumentsData = argumentsString.data(using: .utf8),
              var arguments = try? JSONSerialization.jsonObject(with: argumentsData) as? [String: Any] else {
            print("Invalid function call format")
            return
        }

        print("Function Call: \(name) \(arguments)")

        // 非同期で実行
        Task {
            do {
                let result = try await executeFunctionCall(
                    callId: callId,
                    name: name,
                    arguments: arguments
                )
                await sendFunctionResult(callId: callId, result: result)
            } catch {
                print("Function Call error: \(error)")
                let errorResult = "{\"success\":false,\"error\":\"\(error.localizedDescription)\"}"
                await sendFunctionResult(callId: callId, result: errorResult)
            }
        }
    }

    /// Function CallをAPI経由で実行
    private func executeFunctionCall(callId: String, name: String, arguments: [String: Any]) async throws -> String {
        let endpoint: String
        switch name {
        case "calendar_action":
            endpoint = "/api/tools/calendar"
        case "docs_action":
            endpoint = "/api/tools/docs"
        case "memo_action":
            endpoint = "/api/tools/memo"
        case "map_action":
            endpoint = "/api/tools/location"
        default:
            throw VoiceEngineError.unknownTool(name)
        }

        // userIdを引数に追加（必要な場合）
        // arguments["userId"] = userId

        let url = URL(string: "\(apiClient.baseURL)\(endpoint)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let requestBody: [String: Any] = [
            "message": [
                "toolCallList": [
                    [
                        "id": callId,
                        "function": [
                            "name": name,
                            "arguments": arguments
                        ]
                    ]
                ]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw VoiceEngineError.toolExecutionFailed
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let results = json["results"] as? [[String: Any]],
              let result = results.first?["result"] as? String else {
            throw VoiceEngineError.invalidToolResponse
        }

        return result
    }

    /// Function Callの結果をData Channelに送信
    private func sendFunctionResult(callId: String, result: String) async {
        // 結果を送信
        let outputEvent: [String: Any] = [
            "type": "conversation.item.create",
            "item": [
                "type": "function_call_output",
                "call_id": callId,
                "output": result
            ]
        ]

        if let data = try? JSONSerialization.data(withJSONObject: outputEvent),
           let dataBuffer = RTCDataBuffer(data: data, isBinary: false) {
            dataChannel?.sendData(dataBuffer)
        }

        // AIに応答をリクエスト
        let createEvent: [String: Any] = ["type": "response.create"]
        if let data = try? JSONSerialization.data(withJSONObject: createEvent),
           let dataBuffer = RTCDataBuffer(data: data, isBinary: false) {
            dataChannel?.sendData(dataBuffer)
        }
    }

    // MARK: - RTCPeerConnectionDelegate

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        // 受信した音声Trackをスピーカーにルーティング
        if let audioTrack = stream.audioTracks.first {
            remoteAudioTrack = audioTrack
            audioTrack.isEnabled = true
            print("Remote audio track received")
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        print("Remote stream removed")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange state: RTCIceConnectionState) {
        print("ICE Connection State: \(state)")
        switch state {
        case .connected, .completed:
            print("WebRTC connected")
        case .disconnected, .failed, .closed:
            onError?("Connection lost")
        case .checking:
            print("Checking connection...")
        case .new:
            print("New connection")
        @unknown default:
            break
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange state: RTCSignalingState) {
        print("Signaling State: \(state)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange state: RTCIceGatheringState) {
        print("ICE Gathering State: \(state)")
    }

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        print("Should negotiate")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("ICE Candidate generated")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {
        print("ICE Candidates removed")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        print("Data Channel opened")
    }
}

// MARK: - Errors

enum VoiceEngineError: Error, LocalizedError {
    case peerConnectionFailed
    case invalidSDP
    case invalidResponse
    case sdpExchangeFailed(statusCode: Int)
    case timeout
    case unknownTool(String)
    case toolExecutionFailed
    case invalidToolResponse

    var errorDescription: String? {
        switch self {
        case .peerConnectionFailed:
            return "Failed to create peer connection"
        case .invalidSDP:
            return "Invalid SDP"
        case .invalidResponse:
            return "Invalid response from server"
        case .sdpExchangeFailed(let statusCode):
            return "SDP exchange failed with status: \(statusCode)"
        case .timeout:
            return "Operation timed out"
        case .unknownTool(let name):
            return "Unknown tool: \(name)"
        case .toolExecutionFailed:
            return "Tool execution failed"
        case .invalidToolResponse:
            return "Invalid tool response"
        }
    }
}
```

**注意点**:
- 上記は概念コードです。実際にはエラーハンドリング、メモリ管理、スレッド安全性を考慮する必要があります
- WebRTCライブラリの初期化には時間がかかる場合があります。メインスレッドをブロックしないよう注意してください
- 音声セッションの設定（AVAudioSession）は、バックグラウンド再生を考慮する必要があります

### よくあるミスと対策

| ミス | 症状 | 対策 |
|-----|------|------|
| Data Channelラベルが間違っている | イベントが受信できない | ラベルを`oai-events`にする |
| ICE candidateの収集待ち不備 | 接続が確立されない | `iceGatheringState`が`complete`になるまで待つ |
| 音声Trackが追加されていない | AIが喋らない | マイクTrackを必ず追加する |
| SDP Offer/Answerの型が間違っている | 400エラー | Content-Typeを`application/sdp`にする |
| Authorizationヘッダーがない | 401エラー | `Bearer {clientSecret}`を含める |
| modelパラメータがない | 400エラー | URLに`?model={model名}`を含める |

---

## 4. 関数呼び出し（カレンダーなど）の流れ

### Function Callの全体フロー

```
┌─────────────────────────────────────────────────────────────────┐
│  1. AIがFunction Callを要求                                       │
│                                                                  │
│  Data Channelから受信:                                           │
│  {                                                               │
│    "type": "response.function_call_arguments.done",             │
│    "call_id": "call_123",                                        │
│    "name": "calendar_action",                                    │
│    "arguments": "{\"action\":\"list\"}"                          │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. iOSアプリがHTTPリクエストを送信                              │
│                                                                  │
│  POST https://your-app-url.com/api/tools/calendar               │
│  Content-Type: application/json                                 │
│  {                                                               │
│    "message": {                                                  │
│      "toolCallList": [{                                          │
│        "id": "call_123",                                         │
│        "function": {                                             │
│          "name": "calendar_action",                              │
│          "arguments": {                                          │
│            "action": "list",                                     │
│            "userId": "user-uuid"                                 │
│          }                                                       │
│        }                                                         │
│      }]                                                          │
│    }                                                             │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Voice Engine APIがツールを実行                              │
│                                                                  │
│  - Google Calendar APIと通信                                    │
│  - 結果をJSON文字列で整形                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. APIがレスポンスを返す                                        │
│                                                                  │
│  {                                                               │
│    "results": [{                                                 │
│      "toolCallId": "call_123",                                   │
│      "result": "{\"success\":true,\"events\":[...]}"             │
│    }]                                                            │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. iOSアプリが結果をData Channelへ送信                         │
│                                                                  │
│  送信イベント1:                                                  │
│  {                                                               │
│    "type": "conversation.item.create",                          │
│    "item": {                                                     │
│      "type": "function_call_output",                            │
│      "call_id": "call_123",                                      │
│      "output": "{\"success\":true,\"events\":[...]}"             │
│    }                                                             │
│  }                                                               │
│                                                                  │
│  送信イベント2:                                                  │
│  {                                                               │
│    "type": "response.create"                                     │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. AIが結果を認識して応答                                       │
│                                                                  │
│  Data Channelから受信:                                           │
│  {                                                               │
│    "type": "response.output_audio_transcript.done",             │
│    "transcript": "今日は3件の予定があります。まず10時に..."        │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 対応しているツール一覧

| ツール名 | 機能 | エンドポイント | 引数の例 |
|---------|------|---------------|---------|
| `calendar_action` | Google Calendar操作 | `/api/tools/calendar` | `{"action":"list"}` または `{"action":"create","summary":"会議","startTime":"2024-01-15T10:00:00","endTime":"2024-01-15T11:00:00"}` |
| `docs_action` | Google Docs操作 | `/api/tools/docs` | `{"action":"create","title":"新規ドキュメント"}` または `{"action":"read","documentId":"..."}` |
| `memo_action` | ユーザーメモの保存 | `/api/tools/memo` | `{"slot_number":1,"content":"覚えておいてほしい内容"}` |
| `map_action` | 位置情報の取得 | `/api/tools/location` | `{"latitude":35.6762,"longitude":139.6503}` |

### 各ツールの詳細

#### 1. calendar_action

**機能**: Google Calendarで予定の確認・作成

**引数**:
- `action` (string, 必須): `"list"` または `"create"`
- `timeMin` (string, オプション): 開始日時（ISO 8601形式、listの場合）
- `timeMax` (string, オプション): 終了日時（ISO 8601形式、listの場合）
- `maxResults` (number, オプション): 最大取得件数（listの場合、デフォルト10）
- `summary` (string, 必須): 予定のタイトル（createの場合）
- `description` (string, オプション): 予定の説明（createの場合）
- `startTime` (string, 必須): 開始日時（ISO 8601形式、createの場合）
- `endTime` (string, 必須): 終了日時（ISO 8601形式、createの場合）
- `location` (string, オプション): 場所（createの場合）

**戻り値例（list）**:
```json
{
  "success": true,
  "events": [
    {
      "id": "evt1",
      "title": "朝会",
      "start": "2024-01-15T10:00:00",
      "end": "2024-01-15T10:30:00"
    }
  ],
  "count": 1
}
```

**戻り値例（create）**:
```json
{
  "success": true,
  "message": "予定を作成しました",
  "eventId": "evt2",
  "title": "会議"
}
```

#### 2. docs_action

**機能**: Google Docsでドキュメントの作成・編集・読み取り

**引数**:
- `action` (string, 必須): `"create"`, `"read"`, `"append"` のいずれか
- `title` (string, 必須): ドキュメントタイトル（createの場合）
- `documentId` (string, 必須): ドキュメントID（read/appendの場合）
- `content` (string, オプション): 追加する内容（appendの場合）

**戻り値例（create）**:
```json
{
  "success": true,
  "documentId": "doc123",
  "title": "新規ドキュメント",
  "url": "https://docs.google.com/document/d/doc123"
}
```

**戻り値例（read）**:
```json
{
  "success": true,
  "content": "ドキュメントの内容...",
  "title": "ドキュメントタイトル"
}
```

#### 3. memo_action

**機能**: ユーザーが覚えておいてほしい情報を保存（スロット1-10）

**引数**:
- `slot_number` (number, オプション): スロット番号（1-10、指定しない場合は空きスロットを使用）
- `content` (string, 必須): 保存する内容（200文字以内）

**戻り値例**:
```json
{
  "success": true,
  "message": "スロット1に保存しました",
  "slotNumber": 1,
  "content": "覚えておいてほしい内容",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

**特徴**:
- スロット番号を省略すると、空いているスロットを自動的に使用
- 全スロットが埋まっている場合は、スロット1を上書き
- 保存した内容は次回以降のセッションでSystem Promptに自動的に反映される

#### 4. map_action

**機能**: 座標から位置情報（住所、近隣の場所）を取得

**引数**:
- `latitude` (number, 必須): 緯度
- `longitude` (number, 必須): 経度

**戻り値例**:
```json
{
  "success": true,
  "location": {
    "address": "東京都渋谷区道玄坂1-2-3",
    "nearbyPlaces": ["渋谷駅", "ハチ公像", "渋谷109"],
    "summary": "渋谷区道玄坂1-2-3付近。周辺: 渋谷駅, ハチ公像, 渋谷109"
  }
}
```

### カレンダーツールの実装例

#### ユーザーが「今日の予定を教えて」と言った場合

**1. Function Callイベント受信**:

```json
{
  "type": "response.function_call_arguments.done",
  "call_id": "call_abc123",
  "name": "calendar_action",
  "arguments": "{\"action\":\"list\"}"
}
```

**2. HTTPリクエスト送信**:

```bash
curl -X POST https://your-app-url.com/api/tools/calendar \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "toolCallList": [{
        "id": "call_abc123",
        "function": {
          "name": "calendar_action",
          "arguments": {
            "action": "list",
            "timeMin": "2024-01-15T00:00:00Z",
            "timeMax": "2024-01-15T23:59:59Z",
            "maxResults": 10
          }
        }
      }]
    }
  }'
```

**3. APIレスポンス受信**:

```json
{
  "results": [{
    "toolCallId": "call_abc123",
    "result": "{\"success\":true,\"events\":[{\"id\":\"evt1\",\"title\":\"朝会\",\"start\":\"2024-01-15T10:00:00\",\"end\":\"2024-01-15T10:30:00\"},{\"id\":\"evt2\",\"title\":\"ランチ\",\"start\":\"2024-01-15T12:00:00\",\"end\":\"2024-01-15T13:00:00\"}],\"count\":2}"
  }]
}
```

**4. Data Channelへ送信**:

```swift
// 結果を送信
let outputEvent: [String: Any] = [
    "type": "conversation.item.create",
    "item": [
        "type": "function_call_output",
        "call_id": "call_abc123",
        "output": "{\"success\":true,\"events\":[...],\"count\":2}"
    ]
]
dataChannel?.sendData(outputEvent)

// AIに応答をリクエスト
let createEvent: [String: Any] = ["type": "response.create"]
dataChannel?.sendData(createEvent)
```

**5. AIの応答**:

```
AI: 「今日は2件の予定があります。10時から朝会、12時からランチです。」
```

---

## 5. よくある質問（FAQ）

### Q1: WebRTCの実装が難しい場合、どうすればよいですか？

**A**: 以下の選択肢があります：

1. **ライブラリを使用する**: [GoogleWebRTC](https://github.com/google/GoogleWebRTC)や[SwiftWebRTC](https://github.com/stasel/WebRTC)などのライブラリを使用することを推奨します

2. **サンプルコードを参照**:
   - [OpenAI Swift SDK](https://github.com/openai/openai-swift)
   - このプロジェクトのWeb版実装（`src/app/components/voice/VoiceInterface.tsx`）

3. **シンプルな実装から始める**: まずはData Channelイベントのログ出力だけ実装し、後から音声を追加するアプローチもあります

### Q2: テスト環境で動作確認するには？

**A**: 以下の手順で確認できます：

1. **ローカルサーバーを起動**:
   ```bash
   npm run dev
   # http://localhost:3000 で起動
   ```

2. **APIのエンドポイントを変更**:
   ```
   本番環境: https://your-app-url.com/api/session
   開発環境: http://localhost:3000/api/session
   ```

3. **シミュレーターで動作確認**: Macのターミナルからcurlでテスト可能です

### Q3: userIdはどこで管理すべきですか？

**A**: いくつかのアプローチがあります：

1. **UserDefaultsに保存**: シンプルな実装の場合
   ```swift
   UserDefaults.standard.set(userId, forKey: "voice_engine_user_id")
   ```

2. **Keychainに保存**: セキュアに保存する場合
   ```swift
   let query = [
       kSecClass: kSecClassGenericPassword,
       kSecAttrAccount: "voice_engine_user_id",
       kSecValueData: userId.data(using: .utf8)!
   ] as CFDictionary
   ```

3. **バックエンドと連携**: 認証システムと統合する場合

**推奨**: 最初はUserDefaultsで実装し、必要に応じてKeychainに移行してください。

### Q4: 音声の遅延が大きい場合の対策は？

**A**: 以下のポイントを確認してください：

1. **ネットワーク環境**: WiFiまたは5G等の高速通信を使用
2. **STUNサーバー**: 複数の公開STUNサーバーを試す
   ```swift
   config.iceServers = [
       RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
       RTCIceServer(urlStrings: ["stun:stun1.l.google.com:19302"])
   ]
   ```
3. **コーデック設定**: Opus等の低遅延コーデックを使用（デフォルトで有効）
4. **サーバーの場所**: 可能な限り近いリージョンのサーバーを使用

### Q5: Function Callが失敗する場合のデバッグ方法は？

**A**: 以下の手順で確認してください：

1. **Data Channelのログを確認**: イベントが正しく受信できているか
2. **HTTPリクエストのログを確認**: リクエストボディが正しい形式か
3. **APIレスポンスを確認**: ステータスコードとエラーメッセージを確認

**デバッグ用コード例**:

```swift
// ログ出力の例
print("Function Call Received:")
print("  call_id: \(callId)")
print("  name: \(name)")
print("  arguments: \(arguments)")

print("Sending HTTP Request:")
print("  endpoint: \(endpoint)")
print("  body: \(requestBody)")

if let httpResponse = response as? HTTPURLResponse {
    print("HTTP Response:")
    print("  status: \(httpResponse.statusCode)")
    print("  body: \(String(data: data, encoding: .utf8) ?? "")")
}
```

### Q6: セッションの有効期限は？

**A**:
- `clientSecret`（Ephemeral Token）の有効期限は**約1時間**です
- 1時間を超える使用には、新しいセッションを作成する必要があります
- ユーザー体験のため、セッション切れの場合は自動で再接続することを推奨します

### Q7: バックグラウンドでの動作は？

**A**:
- **WebRTC接続の維持**: iOSのバックグラウンド実行制限により、難しい場合があります
- **推奨アプローチ**: フォアグラウンドでの使用を前提としてください
- **回避策**: 音声再生中はバックグラウンド実行が可能です（Audio Session設定）

```swift
try audioSession.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetooth])
try audioSession.setActive(true)
```

### Q8: ユーザーの記憶（メモリ）はどう管理されていますか？

**A**:
- サーバー側（Supabase PostgreSQL）で自動管理されています
- 会話の内容から重要な情報を自動抽出し、保存します
- 次回セッション作成時に、自動的にSystem Promptに注入されます
- iOSアプリ側での実装は不要です
- 明示的に保存したい場合は`memo_action`ツールを使用できます

### Q9: 複数のユーザーを切り替えるには？

**A**:
1. `/api/cockpit/users`でユーザー一覧を取得
2. 選択したユーザーの`userId`で新しいセッションを作成
3. 既存のWebRTC接続を切断して、新しいセッションで接続

```swift
// セッションを終了
endSession()

// 新しいユーザーでセッション開始
try await startSession(userId: newUserId)
```

### Q10: エラーハンドリングのベストプラクティスは？

**A**: 以下のエラーケースを考慮してください：

| エラー種類 | 対応方法 |
|-----------|---------|
| ネットワークエラー | リトライ処理（指数バックオフ） |
| セッション作成失敗 | ユーザーにエラーを表示して終了 |
| WebRTC接続失敗 | STUNサーバーを変更してリトライ |
| Function Call失敗 | エラーをAIに通知して代替案を提案 |

**実装例**:

```swift
func handleSessionError(_ error: Error) {
    if let voiceError = error as? VoiceEngineError {
        switch voiceError {
        case .sdpExchangeFailed(let statusCode):
            if statusCode == 401 {
                // トークン期限切れ → 再接続
                reconnect()
            } else {
                showError("接続に失敗しました")
            }
        case .peerConnectionFailed:
            // STUNサーバーを変更してリトライ
            retryWithDifferentSTUNServer()
        default:
            showError(voiceError.localizedDescription)
        }
    }
}
```

### Q11: 音声認識の精度を上げるには？

**A**:
- **マイクの品質**: ノイズキャンセリング機能付きのマイクを使用
- **音量レベル**: 適切な音量で話す（大きすぎ・小さすぎはNG）
- **環境**: 静かな場所で使用する
- **Server VAD設定**: サーバー側で調整可能（デフォルト設定で最適化済み）

### Q12: テスト用のモックデータを使いたい場合は？

**A**:
- Web版のシミュレーター機能を参考にしてください
- 位置情報シミュレーター: `POST /api/simulate/location`
- 通知シミュレーター: `POST /api/simulate/notification`

---

## 付録: 用語集

| 用語 | 説明 |
|-----|------|
| **WebRTC** | ブラウザやアプリでリアルタイム通信を行うための技術標準 |
| **SDP (Session Description Protocol)** | WebRTCセッションの設定情報を記述する形式 |
| **Data Channel** | WebRTC接続上で任意のデータを送受信するチャネル |
| **Ephemeral Token** | 短期間有効な一時トークン。OpenAI Realtime API接続に使用 |
| **ICE Candidate** | WebRTC接続に使用するネットワーク経路の候補 |
| **STUN Server** | NAT越えのための公開サーバー |
| **Function Call** | AIが外部ツールを実行するための仕組み |
| **System Prompt** | AIのふるまいを定義する初期プロンプト |
| **Server VAD** | サーバー側の音声活動検出 |

---

## 付録: 参考リンク

- [OpenAI Realtime API ドキュメント](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime API リファレンス](https://platform.openai.com/docs/api-reference/realtime)
- [WebRTC公式サイト](https://webrtc.org/)
- [GoogleWebRTC (Swift)](https://github.com/google/GoogleWebRTC)
- [SwiftWebRTC](https://github.com/stasel/WebRTC)
- [このプロジェクトのアーキテクチャ](./ARCHITECTURE.md)
- [API仕様書](./API_SPECIFICATION.md)
- [Web版実装（VoiceInterface.tsx）](../src/app/components/voice/VoiceInterface.tsx)

---

## 付録: クイックスタートチェックリスト

iOS実装を開始する前に、以下のチェックリストを確認してください：

### 準備

- [ ] Voice Engine Studioサーバーが稼働している
- [ ] サーバーのURLを確認している（`https://your-app-url.com`）
- [ ] テスト用のuserIdを取得している（`/api/cockpit/users`または`/api/cockpit/enroll`）

### 実装

- [ ] `VoiceEngineAPIClient`クラスを実装（HTTP通信）
- [ ] `VoiceEngineClient`クラスを実装（WebRTC）
- [ ] WebRTCライブラリを導入（GoogleWebRTCまたはSwiftWebRTC）
- [ ] Data Channelイベントハンドラーを実装
- [ ] Function Callハンドラーを実装

### テスト

- [ ] セッション作成が成功する
- [ ] WebRTC接続が確立される
- [ ] 音声対話ができる
- [ ] Function Callが動作する
- [ ] エラーハンドリングが動作する

---

## サポート

実装に関する質問やバグ報告は、GitHub Issuesにて受け付けています。

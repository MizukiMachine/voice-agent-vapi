# トラブルシューティングガイド

このガイドでは、Voice Agent プロジェクトで遭遇する可能性のある一般的な問題とその解決方法を説明します。

## 目次

1. [AsyncLocalStorage エラー](#asynclocalstorage-エラー)
2. [WebSocket 接続の問題](#websocket-接続の問題)
3. [サーバー起動の問題](#サーバー起動の問題)
4. [ビルドエラー](#ビルドエラー)
5. [API 関連の問題](#api-関連の問題)
6. [Vapi/Cartesia 関連の問題](#vapicartesia-関連の問題)
7. [Supabase 関連の問題](#supabase-関連の問題)
8. [パフォーマンスの問題](#パフォーマンスの問題)

## AsyncLocalStorage エラー

### 症状

```
Error: Invariant: AsyncLocalStorage accessed in runtime where it is not available
```

または

```
Invariant: AsyncLocalStorage is not available in this runtime
```

### 原因

これは **CVE-2025-59466** に関連する問題です。Node.js v22.22.0 未満のバージョンには、AsyncLocalStorage の実装に脆弱性があり、Next.js 15 でカスタムサーバーを使用する際にエラーが発生します。

### 解決方法

**1. Node.js バージョンを確認**

```bash
node --version
```

v22.22.0 以上である必要があります。

**2. Node.js をアップグレード**

```bash
# nvm を使用
nvm install 22.22.0
nvm use 22.22.0

# または n を使用
sudo n 22.22.0
```

**3. node_modules を再インストール**

```bash
rm -rf node_modules package-lock.json
npm install
```

**4. サーバーを再起動**

```bash
npm run dev
```

### 代替解決方法（デュアルサーバーモード）

Node.js のアップグレードができない場合、デュアルサーバーモードを試してください：

```bash
npm run dev:all
```

このモードでは、Next.js と WebSocket サーバーが別々に起動するため、AsyncLocalStorage の問題を回避できます。

## WebSocket 接続の問題

### 症状

- "WebSocket connection failed"
- "Connection refused"
- WebSocket で音声が流れない

### 解決方法

**1. デュアルサーバーモードを試す**

```bash
npm run dev:all
```

**2. WebSocket URL 環境変数を確認**

`.env.local` で：

```bash
# 開発環境
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:3001/api/webrtc

# 本番環境
NEXT_PUBLIC_WEBSOCKET_URL=wss://your-domain.com/api/webrtc
```

**3. ファイアウォールを確認**

ポート 3001（または設定した WebSocket ポート）がブロックされていないか確認してください。

**4. ブラウザコンソールを確認**

開発者ツールの Console タブでエラーメッセージを確認してください。

## サーバー起動の問題

### 症状

```
Error: listen EADDRINUSE: address already in use :::3000
```

### 解決方法

**1. 使用中のポートを特定**

```bash
lsof -ti:3000
# または
netstat -tlnp | grep :3000
```

**2. プロセスを終了**

```bash
kill -9 $(lsof -ti:3000)
# または
kill -9 <PID>
```

**3. またはポートを変更**

`.env.local` で：

```bash
PORT=3001
WEBSOCKET_PORT=3002
```

### 症状: "Cannot find module"

```
Error: Cannot find module 'xxx'
```

### 解決方法

```bash
# 依存関係を再インストール
rm -rf node_modules package-lock.json
npm install

# グローバルパッケージの確認
npm list -g --depth=0
```

## ビルドエラー

### 症状: TypeScript エラー

```
Type error: xxx is not assignable to type yyy
```

### 解決方法

**1. 型チェック**

```bash
npm run build
```

**2. 型定義を再生成**

```bash
npm run db:types
```

**3. TypeScript を再インストール**

```bash
npm install --save-dev typescript@latest
```

### 症状: ESLint エラー

```
ESLint errors found
```

### 解決方法

```bash
# 自動修正
npm run lint:fix

# 手動修正が必要な場合
npm run lint
```

## API 関連の問題

### 症状: 404 Not Found

```
POST /api/session 404
```

### 解決方法

**1. ルートが存在することを確認**

```bash
ls src/app/api/
```

**2. カスタムサーバーを使用している場合は、パスを確認**

```bash
# src/server.ts でルーティングを確認
cat src/server.ts | grep pathname
```

**3. プレーンモードを試す**

```bash
npm run dev:plain
```

### 症状: CORS エラー

```
Access to fetch at 'xxx' has been blocked by CORS policy
```

### 解決方法

**1. 環境変数を確認**

`.env.local` で：

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**2. API ルートで CORS ヘッダーを設定**

```typescript
export async function GET() {
  return new Response(JSON.stringify(data), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

## Vapi/Cartesia 関連の問題

### 症状: 認証エラー

```
VapiError: Invalid API key
```

### 解決方法

**1. API キーを確認**

```bash
# .env.local で確認
echo $VAPI_API_KEY
```

**2. API キーが正しく設定されているか確認**

`.env.local` で：

```bash
VAPI_API_KEY=your-actual-api-key
```

**3. サーバーを再起動**

環境変数の変更後、サーバーを再起動する必要があります。

### 症状: TTS が再生されない

### 解決方法

**1. Cartesia API キーを確認**

```bash
echo $CARTESIA_API_KEY
```

**2. Cartesia 設定を確認**

`.env.local` で：

```bash
CARTESIA_VOICE_ID=79a125e6-c5a2-4b9d-8b3f-5c2a1b2d3e4f
CARTESIA_DEFAULT_SPEED=1.0
CARTESIA_SAMPLE_RATE=24000
CARTESIA_OUTPUT_FORMAT=pcm16
```

**3. ブラウザコンソールを確認**

オーディオ関連のエラーメッセージを確認してください。

## Supabase 関連の問題

### 症状: 接続エラー

```
Error: Connecting to database failed
```

### 解決方法

**1. Supabase URL とキーを確認**

```bash
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

**2. Supabase プロジェクトが一時停止されていないか確認**

https://supabase.com/dashboard で確認してください。

**3. データベーススキーマを確認**

```bash
npm run db:migrate
```

### 症状: RLS（Row Level Security）エラー

```
Error: Permission denied
```

### 解決方法

**1. RLS ポリシーを確認**

Supabase ダッシュボードで "Authentication" → "Policies" を確認してください。

**2. Service Role Key を使用**

サーバーサイドでは `SUPABASE_SERVICE_ROLE_KEY` を使用してください。

## パフォーマンスの問題

### 症状: 音声遅延が大きい

### 解決方法

**1. Cartesia 設定を調整**

`.env.local` で：

```bash
# 再生速度を上げる
CARTESIA_DEFAULT_SPEED=1.2

# サンプルレートを下げる（処理が軽くなる）
CARTESIA_SAMPLE_RATE=16000
```

**2. ネットワークを確認**

高速で安定したネットワーク接続を使用してください。

### 症状: メモリ使用量が多い

### 解決方法

**1. Node.js ヒープサイズを制限**

```bash
node --max-old-space-size=4096 node_modules/.bin/next dev
```

**2. 依存関係を更新**

```bash
npm update
```

## まだ問題が解決しない場合

1. **ログを確認**
   ```bash
   npm run dev 2>&1 | tee dev.log
   ```

2. **GitHub Issues** を確認
   https://github.com/your-org/voice-agent-vapi-cartesia/issues

3. **新しい Issue** を作成
   - 環境情報（OS, Node.js バージョン）
   - エラーメッセージ
   - 再現手順
   - 期待する動作

4. **ログファイルを添付**
   - `dev.log`
   - ブラウザコンソールのスクリーンショット

# Cloud Run デプロイ実装計画

## 概要

Voice Engine Studio を Google Cloud Run にデプロイするための実装計画。

**アーキテクチャ**: OpenAI Realtime API 直接統合（VAPI/Qwen削除済み）

## 前提条件

### 1. Google Cloud プロジェクト設定

```bash
# プロジェクトIDの設定
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# 必要なAPIを有効化
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

### 2. Artifact Registry の作成

```bash
# Dockerリポジトリの作成
gcloud artifacts repositories create voice-engine-studio \
  --repository-format=docker \
  --location=us-central1 \
  --description="Voice Engine Studio Docker images"
```

### 3. シークレットの設定

```bash
# Supabase
echo "your-service-role-key" | \
  gcloud secrets create supabase-service-role-key --data-file=-

# OpenAI
echo "sk-your-openai-key" | \
  gcloud secrets create openai-api-key --data-file=-

# Google Cloud (OAuth)
echo "your-client-id" | \
  gcloud secrets create google-client-id --data-file=-
echo "your-client-secret" | \
  gcloud secrets create google-client-secret --data-file=-
echo "your-refresh-token" | \
  gcloud secrets create google-refresh-token --data-file=-
echo "your-maps-api-key" | \
  gcloud secrets create google-maps-api-key --data-file=-
```

## デプロイ手順

### 方法1: Cloud Build で自動デプロイ

```bash
# Cloud Build トリガーの作成
gcloud builds submit --config cloudbuild.yaml
```

### 方法2: 手動デプロイ

```bash
# 1. Dockerイメージのビルド
gcloud builds submit --tag \
  us-central1-docker.pkg.dev/$PROJECT_ID/voice-engine-studio/app:latest

# 2. Cloud Run にデプロイ
gcloud run deploy voice-engine-studio \
  --image=us-central1-docker.pkg.dev/$PROJECT_ID/voice-engine-studio/app:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --concurrency=10 \
  --min-instances=0 \
  --set-secrets=OPENAI_API_KEY=openai-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest,GOOGLE_REFRESH_TOKEN=google-refresh-token:latest,GOOGLE_MAPS_API_KEY=google-maps-api-key:latest
```

## 設定詳細

### リソース制限

| 設定 | 値 | 理由 |
|------|-----|------|
| CPU | 1 vCPU | Next.js + API処理に十分 |
| Memory | 512Mi | VAPI/Qwen削除で低メモリ化 |
| Max Instances | 10 | スパイク時のスケーリング |
| Min Instances | 0 | アイドル時は0（コスト削減） |
| Timeout | 300s | OpenAI Realtimeセッション考慮 |
| Concurrency | 10 | デフォルト値 |

### 環境変数

| 変数名 | 分類 | 必須 |
|--------|------|------|
| `NODE_ENV` | 固定値 (production) | ✓ |
| `OPENAI_API_KEY` | Secret Manager | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Manager | ✓ |
| `GOOGLE_CLIENT_ID` | Secret Manager | ✓ |
| `GOOGLE_CLIENT_SECRET` | Secret Manager | ✓ |
| `GOOGLE_REFRESH_TOKEN` | Secret Manager | ✓ |
| `GOOGLE_MAPS_API_KEY` | Secret Manager | ✓ |

### シークレット管理

シークレットは以下の形式で参照:

```yaml
--set-secrets=SECRET_NAME=secret-name:latest
```

例: `OPENAI_API_KEY=openai-api-key:latest`

## CI/CD パイプライン

### GitHub Actions 連携

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_CREDENTIALS }}

      - name: Deploy to Cloud Run
        run: |-
          gcloud builds submit --config cloudbuild.yaml
```

### GitHub Secrets の設定

| Secret名 | 説明 |
|----------|------|
| `GCP_CREDENTIALS` | サービスアカウントのJSONキー |

## ヘルスチェック

### ヘルスチェックエンドポイント

```
GET /api/health
```

### レスポンス

```json
{
  "status": "healthy",
  "checks": {
    "supabase": "ok",
    "openai": "ok"
  },
  "timestamp": "2026-01-27T12:00:00Z"
}
```

## モニタリングとログ

### Cloud Logging

ログは自動的に Cloud Logging に送信されます:

```bash
# ログのストリーミング
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=voice-engine-studio"

# 特定のログ検索
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=50
```

### Cloud Monitoring

メトリクスは自動的に収集:

- リクエスト数
- レイテンシ
- エラー率
- インスタンス数

```bash
# メトリクスの表示
gcloud monitoring metrics list \
  --filter='resource.type="cloud_run_revision"'
```

## トラブルシューティング

### デプロイ失敗

```bash
# Cloud Build ログの確認
gcloud builds list --limit=10
gcloud builds log BUILD_ID

# Cloud Run ステータスの確認
gcloud run services describe voice-engine-studio --region=us-central1
```

### 実行時エラー

```bash
# ログの確認
gcloud run services logs voice-engine-studio \
  --region=us-central1 \
  --limit=100
```

### シークレットエラー

```bash
# シークレットの一覧
gcloud secrets list

# シークレットのバージョン確認
gcloud secrets versions list openai-api-key
```

## セキュリティ

### IAM 権限

Cloud Build サービスアカウントに必要な権限:

- `roles/cloudbuild.builds.builder`
- `roles/run.admin`
- `roles/artifactregistry.writer`
- `roles/secretmanager.secretAccessor`

### 通信の暗号化

- HTTPS 強制（Cloud Run デフォルト）
- mTLS で Secret Manager アクセス

### コスト最適化

| 項目 | 設定 | 月間見積もり |
|------|------|--------------|
| CPU | 1 vCPU | - |
| Memory | 512Mi | - |
| Min Instances | 0 | $0（アイドル時） |
| Max Instances | 10 | スケーリングに応じて |

## 次のステップ

1. ✅ 前提条件の設定（GCPプロジェクト、API有効化）
2. ✅ Artifact Registry の作成
3. ✅ シークレットの登録
4. ⬜ デプロイ実行（Cloud Build）
5. ⬜ ヘルスチェック確認
6. ⬜ CI/CD パイプライン設定（任意）

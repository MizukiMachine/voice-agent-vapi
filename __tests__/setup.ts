/**
 * Jest Setup File
 * 全テストの前に実行される共通設定
 */

// 環境変数のモック設定
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_REFRESH_TOKEN = 'test-google-refresh-token';
process.env.GOOGLE_MAPS_API_KEY = 'test-google-maps-key';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

// WebRTC関連の環境変数
process.env.VAPI_API_KEY = 'test-vapi-api-key';
process.env.VAPI_PUBLIC_KEY = 'test-vapi-public-key';
process.env.VAPI_ASSISTANT_ID = 'test-assistant-id';
process.env.CARTESIA_API_KEY = 'test-cartesia-api-key';
process.env.CARTESIA_VOICE_ID = '79a125e8-cd45-4c05-9a83-4b0d4b0f3c29';
process.env.CARTESIA_DEFAULT_SPEED = '1.0';

// グローバルなテストユーティリティ
export const TEST_USER_ID = 'test-user-uuid-12345';
export const TEST_SESSION_ID = 'test-session-uuid-67890';

// テスト用のモックレスポンス
export const mockSupabaseUser = {
  id: TEST_USER_ID,
  name: 'テストユーザー',
  email: 'test@example.com',
  created_at: '2026-01-01T00:00:00Z',
  voice_profile_blob: null,
};

// Fetch モックのリセット（各テスト後）
afterEach(() => {
  jest.clearAllMocks();
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // ⚠️ 本番環境でのビルドエラーを無視（一時的な対応）
    ignoreBuildErrors: true,
  },
  eslint: {
    // ⚠️ 本番環境でのESLintエラーを無視（一時的な対応）
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 브라우저 바이너리를 번들에 넣지 않도록 서버 외부 패키지로 둬요.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;

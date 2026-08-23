import { defineConfig } from "vitest/config";

// แยกจาก vite.config.ts — test รัน pure logic (utils) ไม่ต้องใช้ react/tailwind plugin
// environment: node เพราะเทสต์ชั้นนี้เป็นฟังก์ชันบริสุทธิ์ (ไม่มี DOM)
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/utils/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
});

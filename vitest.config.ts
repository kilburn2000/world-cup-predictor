import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// One test run, two projects:
//   shared - pure scoring/standings logic, plain Node, fast.
//   web    - React components/hooks in jsdom with Testing Library.
// The server keeps its own node:test suite (npm test --workspace=server).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          root: "./shared",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          root: "./web",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});

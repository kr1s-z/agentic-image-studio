import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Load `.env` from the current working directory, then the parent (repo root
 * when cwd is `backend/`). Avoids walking past `backend/` via __dirname so
 * Docker (`WORKDIR /app`, `dist/index.js`) does not resolve to `/.env`.
 */
function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file });
      return;
    }
  }

  dotenv.config();
}

loadEnv();

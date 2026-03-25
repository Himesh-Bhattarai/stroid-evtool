import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const staticDir = join(root, "static", "extension");
const readmePath = join(root, "README.md");

rmSync(distDir, { recursive: true, force: true });

const compile =
  process.platform === "win32"
    ? spawnSync("cmd", ["/c", "tsc.cmd", "-p", "tsconfig.json"], {
        cwd: root,
        stdio: "inherit",
        shell: false,
      })
    : spawnSync("tsc", ["-p", "tsconfig.json"], {
        cwd: root,
        stdio: "inherit",
        shell: false,
      });

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

mkdirSync(distDir, { recursive: true });

if (existsSync(staticDir)) {
  cpSync(staticDir, distDir, { recursive: true });
}

if (existsSync(readmePath)) {
  cpSync(readmePath, join(distDir, "README.md"));
}

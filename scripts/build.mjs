import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
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

createJsAliasesForJsx(distDir);

function createJsAliasesForJsx(rootDir) {
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!fullPath.endsWith(".jsx")) {
        continue;
      }

      const jsPath = fullPath.slice(0, -1);
      copyFileSync(fullPath, jsPath);
    }
  }
}

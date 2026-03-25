export type DiffChangeKind = "added" | "removed" | "modified";

export interface DiffChange {
  kind: DiffChangeKind;
  path: string[];
  before?: unknown;
  after?: unknown;
}

export interface DiffResult {
  changes: DiffChange[];
  added: number;
  removed: number;
  modified: number;
}

export function diff(before: unknown, after: unknown): DiffResult {
  const changes: DiffChange[] = [];
  walkDiff(before, after, [], changes);

  return {
    changes,
    added: changes.filter((change) => change.kind === "added").length,
    removed: changes.filter((change) => change.kind === "removed").length,
    modified: changes.filter((change) => change.kind === "modified").length,
  };
}

export function hasDiff(result: DiffResult): boolean {
  return result.changes.length > 0;
}

export function summarizeDiff(result: DiffResult): string {
  const parts: string[] = [];

  if (result.added > 0) {
    parts.push(`+${result.added}`);
  }

  if (result.removed > 0) {
    parts.push(`-${result.removed}`);
  }

  if (result.modified > 0) {
    parts.push(`~${result.modified}`);
  }

  return parts.length > 0 ? parts.join(" ") : "no structural changes";
}

function walkDiff(
  before: unknown,
  after: unknown,
  path: string[],
  changes: DiffChange[],
): void {
  if (Object.is(before, after)) {
    return;
  }

  if (isComposite(before) && isComposite(after)) {
    const keys = new Set<string>([...listKeys(before), ...listKeys(after)]);

    for (const key of keys) {
      const beforeHas = hasKey(before, key);
      const afterHas = hasKey(after, key);
      const nextPath = [...path, key];

      if (!beforeHas && afterHas) {
        changes.push({
          kind: "added",
          path: nextPath,
          after: readValue(after, key),
        });
        continue;
      }

      if (beforeHas && !afterHas) {
        changes.push({
          kind: "removed",
          path: nextPath,
          before: readValue(before, key),
        });
        continue;
      }

      walkDiff(readValue(before, key), readValue(after, key), nextPath, changes);
    }

    return;
  }

  changes.push({
    kind: "modified",
    path,
    before,
    after,
  });
}

function isComposite(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function listKeys(value: Record<string, unknown> | unknown[]): string[] {
  return Array.isArray(value)
    ? value.map((_, index) => String(index))
    : Object.keys(value);
}

function hasKey(value: Record<string, unknown> | unknown[], key: string): boolean {
  if (Array.isArray(value)) {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < value.length;
  }

  return Object.prototype.hasOwnProperty.call(value, key);
}

function readValue(value: Record<string, unknown> | unknown[], key: string): unknown {
  return value[key as keyof typeof value];
}

import { afterEach, describe, expect, test } from "bun:test";
import {
    chmodSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

const JOURNAL = [
    "[Veil] 2026-11-03T13:47:17.195Z INFO: Veil extension enabled",
    "Unrelated service message",
    "Extension veil@dagimg-dot had an error",
    "JS ERROR: TypeError: oops",
    "first@file:///one.js:1:1",
    "second@file:///two.js:2:2",
    "",
    "Message after the error block",
    "Stack trace:",
    "  asyncCallback@resource:///core/Gio.js:114:23",
    "",
    "Another unrelated message",
].join("\n");

let binDir;

function runLogScript(...args) {
    binDir = mkdtempSync(join(tmpdir(), "veil-log-test-"));
    const stub = join(binDir, "journalctl");
    writeFileSync(
        stub,
        `#!/bin/sh\necho "$@" > "${binDir}/args"\ncat <<'JOURNAL'\n${JOURNAL}\nJOURNAL\n`,
    );
    chmodSync(stub, 0o755);
    const result = Bun.spawnSync(["bash", "scripts/log.sh", ...args], {
        cwd: ROOT,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    return {
        exitCode: result.exitCode,
        output: result.stdout.toString(),
    };
}

afterEach(() => {
    if (binDir) rmSync(binDir, { recursive: true, force: true });
    binDir = undefined;
});

describe("filtered", () => {
    test("follows the user journal", () => {
        runLogScript("-f");
        expect(readFileSync(join(binDir, "args"), "utf8").trim()).toBe(
            "--user -f -o cat",
        );
    });

    test("keeps the extension's own lines", () => {
        const { output } = runLogScript("-f");
        expect(output).toContain("[Veil] 2026-11-03T13:47:17.195Z INFO:");
        expect(output).toContain("Extension veil@dagimg-dot had an error");
    });

    test("keeps a JS error with its whole stack", () => {
        const { output } = runLogScript("--filtered");
        expect(output).toContain(
            "JS ERROR: TypeError: oops\nfirst@file:///one.js:1:1\nsecond@file:///two.js:2:2\n",
        );
    });

    test("keeps a stack trace block", () => {
        const { output } = runLogScript("-f");
        expect(output).toContain(
            "Stack trace:\n  asyncCallback@resource:///core/Gio.js:114:23\n",
        );
    });

    test("drops unrelated lines", () => {
        const { output } = runLogScript("-f");
        expect(output).not.toContain("Unrelated service message");
        expect(output).not.toContain("Another unrelated message");
        expect(output).not.toContain("Message after the error block");
    });
});

test("without a flag prints every line", () => {
    const { output } = runLogScript();
    expect(output).toContain("Filtered: false");
    expect(output).toContain("Unrelated service message");
});

test("names the extension from metadata.json", () => {
    expect(runLogScript().output).toContain("Listening to logs for Veil");
});

test("rejects an unknown flag", () => {
    const { exitCode, output } = runLogScript("--bogus");
    expect(exitCode).toBe(1);
    expect(output).toContain("Unknown parameter passed: --bogus");
});

test("--help exits cleanly without reading the journal", () => {
    const { exitCode, output } = runLogScript("--help");
    expect(exitCode).toBe(0);
    expect(output).toContain("Usage:");
    expect(() => readFileSync(join(binDir, "args"))).toThrow();
});

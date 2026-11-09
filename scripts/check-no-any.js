#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { Glob } from "bun";
import ts from "typescript";

const FORBIDDEN = new Map([
    [ts.SyntaxKind.AnyKeyword, "any"],
    [ts.SyntaxKind.UnknownKeyword, "unknown"],
]);

const files = [
    "ambient.d.ts",
    ...new Glob("src/**/*.ts").scanSync({ onlyFiles: true }),
];

const violations = [];

for (const file of files) {
    const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.ES2022,
        true,
    );

    const visit = (node) => {
        const name = FORBIDDEN.get(node.kind);
        if (name) {
            const { line, character } = source.getLineAndCharacterOfPosition(
                node.getStart(source),
            );
            violations.push(`${file}:${line + 1}:${character + 1} ${name}`);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
}

if (violations.length > 0) {
    console.error(`Forbidden types found:\n  ${violations.join("\n  ")}`);
    process.exit(1);
}

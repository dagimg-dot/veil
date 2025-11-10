#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const BLANK_LINE_MARKER = "//! _BLANK_LINE_";

/**
 * Check if a line is blank (only whitespace)
 */
function isBlankLine(line) {
	return line.trim().length === 0;
}

/**
 * Add markers to blank lines in a file
 */
async function addMarkers(filePath) {
	const content = await readFile(filePath, "utf-8");
	const lines = content.split("\n");
	const modifiedLines = lines.map((line) =>
		isBlankLine(line) ? BLANK_LINE_MARKER : line,
	);
	await writeFile(filePath, modifiedLines.join("\n"), "utf-8");
	return content; // Return original content for restoration
}

/**
 * Remove markers from a file and restore blank lines
 */
async function removeMarkers(filePath) {
	const content = await readFile(filePath, "utf-8");
	// Match the marker with any leading/trailing whitespace and replace with empty line
	const cleanedContent = content.replace(
		new RegExp(`^\\s*${BLANK_LINE_MARKER}\\s*$`, "gm"),
		"",
	);
	await writeFile(filePath, cleanedContent, "utf-8");
}

/**
 * Restore original content to a file
 */
async function restoreContent(filePath, originalContent) {
	await writeFile(filePath, originalContent, "utf-8");
}

/**
 * Main execution
 */
async function main() {
	const startTime = Date.now();
	console.log("🚀 Starting gnext-transpiler...\n");

	// Step 1: Find all TypeScript files in src/
	console.log("📂 Finding TypeScript files...");
	const srcFiles = await glob("src/**/*.ts", {
		cwd: projectRoot,
		absolute: true,
		nodir: true,
	});
	console.log(`   Found ${srcFiles.length} TypeScript files\n`);

	// Step 2: Add markers to blank lines and store original content
	console.log("✏️  Adding blank line markers...");
	const originalContents = new Map();

	try {
		await Promise.all(
			srcFiles.map(async (file) => {
				const originalContent = await addMarkers(file);
				originalContents.set(file, originalContent);
				const relativePath = relative(projectRoot, file);
				console.log(`   ✓ ${relativePath}`);
			}),
		);
		console.log("   All markers added successfully\n");

		// Step 3: Run esbuild
		console.log("🔨 Running esbuild...");
		try {
			execSync("node scripts/esbuild.js", {
				cwd: projectRoot,
				stdio: "inherit",
			});
			console.log("   esbuild completed successfully\n");
		} catch (error) {
			console.error("❌ esbuild failed:", error.message);
			throw error;
		}

		// Step 4: Find generated JavaScript files in dist/
		console.log("📂 Finding generated JavaScript files...");
		const distFiles = await glob("dist/**/*.js", {
			cwd: projectRoot,
			absolute: true,
			nodir: true,
		});
		console.log(`   Found ${distFiles.length} JavaScript files\n`);

		// Step 5: Remove markers from dist files
		console.log("🧹 Removing markers from output files...");
		await Promise.all(
			distFiles.map(async (file) => {
				await removeMarkers(file);
				const relativePath = relative(projectRoot, file);
				console.log(`   ✓ ${relativePath}`);
			}),
		);
		console.log("   All markers removed from output\n");
	} finally {
		// Step 6: Always restore original content to src files
		console.log("♻️  Restoring source files...");
		await Promise.all(
			Array.from(originalContents.entries()).map(async ([file, content]) => {
				await restoreContent(file, content);
				const relativePath = relative(projectRoot, file);
				console.log(`   ✓ ${relativePath}`);
			}),
		);
		console.log("   All source files restored\n");
	}

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`✅ gnext-transpiler completed successfully in ${duration}s`);
}

// Run the script
main().catch((error) => {
	console.error("\n❌ Error during transpilation:");
	console.error(error);
	process.exit(1);
});

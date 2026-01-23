/**
 * Gmail Integration Module
 *
 * Provides OAuth2 authentication, email parsing, and rules extraction
 * for trading reports.
 *
 * @module gmail
 */

export * from "./client";
export * from "./report-parser";
export * from "./rules-extractor";
export * from "./image-analyzer";

export { default as gmailClient } from "./client";
export { default as reportParser } from "./report-parser";
export { default as rulesExtractor } from "./rules-extractor";
export { default as imageAnalyzer } from "./image-analyzer";

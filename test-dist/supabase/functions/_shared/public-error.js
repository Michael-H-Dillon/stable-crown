"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicAiErrorMessage = publicAiErrorMessage;
const PRIVATE_PROVIDER_ERROR = /(?:platform\.openai\.com|openai(?: api)?|api[_ -]?key|billing|add credits?|credits? remaining|insufficient[_ -]?quota|exceeded.*quota|quota.*exceeded|organization.*(?:balance|limit))/i;
function publicAiErrorMessage(error, fallback) {
    const message = error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
            ? String(error.message || "")
            : typeof error === "string"
                ? error
                : "";
    return !message || PRIVATE_PROVIDER_ERROR.test(message) ? fallback : message;
}

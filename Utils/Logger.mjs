import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirName = path.dirname(fileURLToPath(import.meta.url));

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export default class Logger {
  #level;
  #logFile;

  constructor() {
    const configuredLevel = (process.env.LOG_LEVEL ?? "INFO").toUpperCase();
    this.#level = Object.prototype.hasOwnProperty.call(LEVELS, configuredLevel)
      ? configuredLevel
      : "INFO";

    const logFilePath = path.join(__dirName, "../Logs/app.log");
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    this.#logFile = fs.createWriteStream(logFilePath, { flags: "a" });
  }

  #write(level, message) {
    if (LEVELS[level] < LEVELS[this.#level]) return;

    const formatted = `[${new Date().toISOString()}] [${level}] ${message}`;
    const writer = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
    writer(formatted);
    this.#logFile.write(`${formatted}\n`);
  }

  debug(message) {
    this.#write("DEBUG", message);
  }

  info(message) {
    this.#write("INFO", message);
  }

  warn(message) {
    this.#write("WARN", message);
  }

  error(message) {
    this.#write("ERROR", message);
  }
}

export const logger = new Logger();

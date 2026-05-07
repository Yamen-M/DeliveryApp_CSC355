import "dotenv/config";

export default class Config {
  static #instance = null;

  static getInstance() {
    if (!Config.#instance) Config.#instance = new Config();
    return Config.#instance;
  }

  constructor() {
    this.port = Number(process.env.PORT ?? "3000");
    this.dbHost = process.env.DB_HOST;
    this.dbPort = Number(process.env.DB_PORT);
    this.dbUser = process.env.DB_USER;
    this.dbPassword = process.env.DB_PASSWORD;
    this.dbName = process.env.DB_NAME;
    this.dbConnLimit = Number(process.env.DB_CONNECTION_LIMIT ?? "10");
    this.dbQueueLimit = Number(process.env.DB_QUEUE_LIMIT ?? "0");
    this.logLevel = process.env.LOG_LEVEL ?? "INFO";

    this.#validate();
  }

  #validate() {
    const required = [
      ["DB_HOST", this.dbHost],
      ["DB_PORT", this.dbPort],
      ["DB_USER", this.dbUser],
      ["DB_PASSWORD", this.dbPassword],
      ["DB_NAME", this.dbName],
      ["PORT", this.port]
    ];

    for (const [name, value] of required) {
      if (value === undefined || value === null || Number.isNaN(value) || value === "") {
        throw new Error(`Missing required config: ${name}`);
      }
    }
  }
}

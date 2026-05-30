const fs = require("fs");
const path = require("path");

const apiBaseUrl = process.env.API_BASE_URL || "";
const configPath = path.join(__dirname, "..", "public", "config.js");

fs.writeFileSync(
  configPath,
  `window.APP_CONFIG = ${JSON.stringify({ API_BASE_URL: apiBaseUrl }, null, 2)};\n`
);

console.log(`Generated frontend config with API_BASE_URL=${apiBaseUrl || "(same origin)"}`);

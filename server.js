const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const BACKUP_DIR = path.join(ROOT, "backups");
const PORT = 3000;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

fs.mkdirSync(BACKUP_DIR, { recursive: true });

http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  if (req.method === "POST" && req.url === "/api/backup") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks);
        let parsed;
        try { parsed = JSON.parse(body.toString()); } catch (_) { parsed = {}; }
        let name;
        if (parsed && typeof parsed._name === "string" && parsed._name) {
          name = parsed._name.replace(/[^a-zA-Z0-9._-]/g, "");
          if (!name.endsWith(".json")) name += ".json";
        } else {
          name = "gamenet-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".json";
        }
        const file = path.join(BACKUP_DIR, name);
        if (!file.startsWith(BACKUP_DIR)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "forbidden" }));
        }
        fs.writeFileSync(file, body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, file: name }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }

  let u;
  try {
    u = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch (e) {
    res.writeHead(400);
    return res.end("bad request");
  }
  if (u === "/") u = "/index.html";
  const file = path.resolve(ROOT, "." + u);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log("open http://127.0.0.1:" + PORT);
});

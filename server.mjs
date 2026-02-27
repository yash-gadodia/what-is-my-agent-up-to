import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = 8788;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : (req.url || "/index.html");
  const safePath = path.normalize(urlPath).replace(/^\.\.(\/|\\|$)/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = contentTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
});

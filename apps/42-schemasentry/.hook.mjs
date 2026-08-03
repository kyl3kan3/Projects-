import http from "node:http";
import { appendFileSync } from "node:fs";
const LOG = process.argv[2];
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    appendFileSync(LOG, `${new Date().toISOString()} ${req.method} ${req.url} ${body.length}b\n${body}\n---\n`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
}).listen(3142, () => console.log("hook listening on 3142"));

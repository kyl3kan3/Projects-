import http from "node:http";
import crypto from "node:crypto";
const SECRET = process.argv[2];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const ts = req.headers["x-launchlist-timestamp"];
    const sig = req.headers["x-launchlist-signature"];
    const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
    console.log("event:", req.headers["x-launchlist-event"]);
    console.log("signature valid:", sig === expected);
    console.log("payload:", body.slice(0, 200));
    res.writeHead(200).end("ok");
    setTimeout(() => server.close(), 200);
  });
});
server.listen(4915, () => console.log("listening"));

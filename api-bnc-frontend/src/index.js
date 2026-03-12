import http from "http";

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "api-bnc-frontend" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("API BNC Frontend - Node bootstrap");
});

server.listen(PORT, () => {
  console.log(`Servidor Node corriendo en http://localhost:${PORT}`);
});

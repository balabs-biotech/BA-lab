import http from "node:http";

const upstream = process.env.BA_ENGINE_TEST_PROXY_UPSTREAM;
const port = Number(process.env.BA_ENGINE_TEST_PROXY_PORT ?? "18081");
if (!upstream) throw new Error("BA_ENGINE_TEST_PROXY_UPSTREAM is required");

let bieResponses = 0;
const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ok", bie_responses: bieResponses }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/execute") {
    response.writeHead(404).end();
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const requestBody = Buffer.concat(chunks).toString("utf8");
  let parsedRequest;
  try { parsedRequest = JSON.parse(requestBody); } catch {
    response.writeHead(400).end("invalid test proxy request");
    return;
  }

  try {
    const upstreamResponse = await fetch(new URL("/v1/execute", upstream), {
      method: "POST",
      headers: {
        authorization: request.headers.authorization ?? "",
        "content-type": "application/json",
      },
      body: requestBody,
    });
    const body = await upstreamResponse.text();
    if (!upstreamResponse.ok) {
      response.writeHead(upstreamResponse.status, { "content-type": upstreamResponse.headers.get("content-type") ?? "application/json" });
      response.end(body);
      return;
    }

    if (parsedRequest.engine?.engine_id === "biological.context.features") {
      bieResponses += 1;
      if (bieResponses === 2) {
        let workerResult;
        try { workerResult = JSON.parse(body); } catch {
          response.writeHead(502).end("worker returned invalid JSON");
          return;
        }
        const flags = workerResult?.result?.value?.environmental_quality_control?.quality_flags;
        if (!Array.isArray(flags)) {
          response.writeHead(502).end("BIE QC artifact missing from worker response");
          return;
        }
        flags.push("ci_worker_response_tampered");
        response.setHeader("x-ba-ci-worker-mutation", "applied");
        process.stdout.write("ok test proxy: tampered second BIE worker QC artifact response\\n");
        response.writeHead(upstreamResponse.status, { "content-type": "application/json" });
        response.end(JSON.stringify(workerResult));
        return;
      }
    }

    response.writeHead(upstreamResponse.status, { "content-type": upstreamResponse.headers.get("content-type") ?? "application/json" });
    response.end(body);
  } catch (error) {
    response.writeHead(502).end(error instanceof Error ? error.message : "test proxy upstream failure");
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`BA Labs CI worker mutation proxy listening on ${port}; upstream ${upstream}\\n`);
});

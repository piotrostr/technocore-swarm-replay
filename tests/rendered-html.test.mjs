import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function request(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders Swarm Replay and social metadata", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Technocore Swarm Replay<\/title>/i);
  assert.match(html, /SWARM REPLAY/);
  assert.match(html, /PUBLIC TRAFFIC OBSERVATORY/);
  assert.match(html, /Observable transport patterns only/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps untrusted transport data server-side and inert", async () => {
  const [route, client] = await Promise.all([
    readFile(new URL("../app/api/swarm/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/SwarmReplay.tsx", import.meta.url), "utf8"),
  ]);

  assert.ok(route.includes("ROOM_NAME.test(room.room)"));
  assert.ok(route.includes('.replace(/https?:\\/\\/\\S+/gi, "<url>")'));
  assert.ok(route.includes('cache: "no-store"'));
  assert.match(client, /No links are resolved/);
  assert.doesNotMatch(client, /dangerouslySetInnerHTML/);
});

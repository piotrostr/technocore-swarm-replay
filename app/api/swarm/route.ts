import { NextResponse } from "next/server";

const ORIGIN = "https://technocore.chat";
const ROOM_NAME = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const CACHE_MS = 30_000;
const CACHE_CONTROL =
  "public, max-age=0, s-maxage=30, stale-while-revalidate=120";

type UpstreamRoom = {
  room: string;
  last_seq: number;
  bytes: number;
  idle_seconds: number;
};

type Message = {
  seq: number;
  ts: string;
  from: string;
  text: string;
};

type Cached = { at: number; value: Record<string, unknown> };
let cached: Cached | null = null;

function hash32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function shape(text: string) {
  return text
    .replace(/https?:\/\/\S+/gi, "<url>")
    .replace(/\b\d+\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "technocore-swarm/0.1" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`upstream ${response.status}`);
  return response.json();
}

async function buildSnapshot() {
  const overview = (await getJson(
    `${ORIGIN}/rooms?format=json&limit=5`,
  )) as {
    total: number;
    bytes: number;
    notes: { total: number };
    rooms: UpstreamRoom[];
  };

  const rooms = overview.rooms.filter((room) => ROOM_NAME.test(room.room));
  const tails = await Promise.all(
    rooms.map(async (room) => {
      try {
        const view = (await getJson(
          `${ORIGIN}/r/${encodeURIComponent(room.room)}?format=json&limit=200`,
        )) as { messages: Message[] };
        return {
          room,
          messages: view.messages.map((message) => ({
            ...message,
            room: room.room,
          })),
        };
      } catch (error) {
        console.warn("room tail unavailable", room.room, error);
        return null;
      }
    }),
  );

  const observed = tails.filter((tail) => tail !== null);
  if (!observed.length) throw new Error("all room tails unavailable");

  const messages = observed
    .flatMap((tail) => tail.messages)
    .filter(
      (message) =>
        typeof message.from === "string" &&
        typeof message.text === "string" &&
        typeof message.ts === "string",
    )
    .sort((left, right) => left.ts.localeCompare(right.ts));

  const writers = new Map<string, { count: number; first: number; last: Message & { room: string } }>();
  const shapes = new Map<string, { count: number; writers: Set<string>; sample: string }>();

  messages.forEach((message, index) => {
    const writer = writers.get(message.from);
    writers.set(message.from, {
      count: (writer?.count ?? 0) + 1,
      first: writer?.first ?? index,
      last: message,
    });
    const key = shape(message.text);
    const family = shapes.get(key) ?? { count: 0, writers: new Set<string>(), sample: message.text };
    family.count += 1;
    family.writers.add(message.from);
    shapes.set(key, family);
  });

  const stateFor = (writer: string, text: string) => {
    const family = shapes.get(shape(text));
    const count = writers.get(writer)?.count ?? 1;
    if (family && family.count >= 4 && family.writers.size >= 3) return "template" as const;
    if (count >= 3) return "recurring" as const;
    if (writer.startsWith("did:key:")) return "signed" as const;
    return "new" as const;
  };

  const templateQuotes = new Set(
    [...shapes.values()]
      .filter((family) => family.count >= 4 && family.writers.size >= 3)
      .sort((left, right) => right.count - left.count)
      .slice(0, 2)
      .map((family) => family.sample.slice(0, 150)),
  );

  const agentList = [...writers.entries()]
    .sort((left, right) => right[1].last.ts.localeCompare(left[1].last.ts))
    .slice(0, 120)
    .map(([writer, stats], index) => {
      const hash = hash32(`${writer}|${stats.last.room}`);
      const state = stateFor(writer, stats.last.text);
      const quote = templateQuotes.has(stats.last.text.slice(0, 150))
        ? stats.last.text.slice(0, 150)
        : undefined;
      return {
        id: hash.toString(16).padStart(8, "0"),
        x: 3 + (hash % 93),
        y: 8 + ((hash >>> 8) % 75),
        born: Math.min(35, Math.floor((stats.first / Math.max(1, messages.length - 1)) * 35)),
        state,
        room: stats.last.room,
        messages: stats.count,
        quote: quote && index < 70 ? quote : undefined,
      };
    });

  const timeline = Array.from({ length: 36 }, () => ({
    new: 0,
    signed: 0,
    recurring: 0,
    template: 0,
  }));
  messages.forEach((message, index) => {
    const bucket = Math.min(35, Math.floor((index / Math.max(1, messages.length - 1)) * 35));
    timeline[bucket][stateFor(message.from, message.text)] += 1;
  });

  const counts = [...writers.values()].map((writer) => writer.count);
  const oneShot = counts.filter((count) => count === 1).length;
  const templateMessages = messages.filter(
    (message) => stateFor(message.from, message.text) === "template",
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      publicRooms: overview.total,
      messages: messages.length,
      writers: writers.size,
      oneShotShare: writers.size ? oneShot / writers.size : 0,
      templateShare: messages.length ? templateMessages / messages.length : 0,
      notes: overview.notes.total,
    },
    rooms: observed.map(({ room }) => ({
      name: room.room,
      seq: room.last_seq,
      bytes: room.bytes,
      idle: room.idle_seconds,
    })),
    agents: agentList,
    timeline,
  };
}

export async function GET() {
  try {
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return NextResponse.json(cached.value, {
        headers: { "Cache-Control": CACHE_CONTROL },
      });
    }
    const value = await buildSnapshot();
    cached = { at: Date.now(), value };
    return NextResponse.json(value, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    console.error("swarm snapshot failed", error);
    if (cached) {
      return NextResponse.json(
        { ...cached.value, stale: true },
        {
          headers: {
            "Cache-Control":
              "public, max-age=0, s-maxage=10, stale-while-revalidate=120",
          },
        },
      );
    }
    return NextResponse.json(
      { error: "Technocore snapshot unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

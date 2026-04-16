const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const TICK_RATE = 30;
const DT = 1 / TICK_RATE;

const WORLD = {
  width: 1100,
  height: 700,
  lake: { x: 350, y: 180, w: 380, h: 270 },
};

const GUNS = {
  rifle: { speed: 620, spread: 0.05, cooldown: 0.12, damage: 20, pellets: 1 },
  shotgun: { speed: 520, spread: 0.35, cooldown: 0.48, damage: 10, pellets: 6 },
  smg: { speed: 700, spread: 0.12, cooldown: 0.08, damage: 11, pellets: 1 },
};

const rooms = new Map();
const clientMeta = new Map();

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function insideRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function spawnPoint() {
  return { x: rand(50, WORLD.width - 50), y: rand(50, WORLD.height - 50) };
}

function createRoom(code) {
  const room = {
    code,
    players: new Map(),
    bullets: [],
    startedAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function roomSummary(room) {
  return {
    code: room.code,
    playerCount: room.players.size,
  };
}

function addPlayerToRoom(room, ws, name) {
  const id = Math.random().toString(36).slice(2, 10);
  const p = spawnPoint();
  room.players.set(id, {
    id,
    name: (name || "Player").slice(0, 16),
    x: p.x,
    y: p.y,
    r: 14,
    hp: 100,
    score: 0,
    gun: "rifle",
    input: { up: false, down: false, left: false, right: false, mx: p.x, my: p.y, shooting: false },
    cooldown: 0,
    ws,
  });
  clientMeta.set(ws, { roomCode: room.code, playerId: id });
  return room.players.get(id);
}

function removeClient(ws) {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const room = rooms.get(meta.roomCode);
  if (room) {
    room.players.delete(meta.playerId);
    if (room.players.size === 0) rooms.delete(room.code);
  }
  clientMeta.delete(ws);
}

function broadcastRoomList() {
  const payload = JSON.stringify({
    type: "rooms",
    rooms: [...rooms.values()].map(roomSummary),
  });
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function emitToRoom(room, message) {
  const payload = JSON.stringify(message);
  for (const p of room.players.values()) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(payload);
  }
}

function movePlayer(p, dt) {
  let dx = 0;
  let dy = 0;
  if (p.input.up) dy -= 1;
  if (p.input.down) dy += 1;
  if (p.input.left) dx -= 1;
  if (p.input.right) dx += 1;

  if (dx || dy) {
    const m = Math.hypot(dx, dy);
    dx /= m;
    dy /= m;
  }

  const inLake = insideRect(p.x, p.y, WORLD.lake);
  const speed = inLake ? 130 : 200;

  p.x = Math.max(p.r, Math.min(WORLD.width - p.r, p.x + dx * speed * dt));
  p.y = Math.max(p.r, Math.min(WORLD.height - p.r, p.y + dy * speed * dt));
}

function fireBullets(room, p) {
  const gun = GUNS[p.gun] || GUNS.rifle;
  if (!p.input.shooting || p.cooldown > 0 || p.hp <= 0) return;

  p.cooldown = gun.cooldown;
  const base = Math.atan2(p.input.my - p.y, p.input.mx - p.x);

  for (let i = 0; i < gun.pellets; i += 1) {
    const spread = rand(-gun.spread, gun.spread);
    room.bullets.push({
      owner: p.id,
      x: p.x,
      y: p.y,
      vx: Math.cos(base + spread) * gun.speed,
      vy: Math.sin(base + spread) * gun.speed,
      damage: gun.damage,
      ttl: 1.2,
    });
  }
}

function respawn(p) {
  const s = spawnPoint();
  p.x = s.x;
  p.y = s.y;
  p.hp = 100;
}

function stepRoom(room, dt) {
  for (const p of room.players.values()) {
    p.cooldown = Math.max(0, p.cooldown - dt);
    movePlayer(p, dt);
    fireBullets(room, p);
  }

  for (let i = room.bullets.length - 1; i >= 0; i -= 1) {
    const b = room.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ttl -= dt;

    if (b.ttl <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) {
      room.bullets.splice(i, 1);
      continue;
    }

    for (const p of room.players.values()) {
      if (p.id === b.owner || p.hp <= 0) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) <= p.r + 3) {
        p.hp -= b.damage;
        room.bullets.splice(i, 1);

        if (p.hp <= 0) {
          const killer = room.players.get(b.owner);
          if (killer) killer.score += 1;
          respawn(p);
        }
        break;
      }
    }
  }

  emitToRoom(room, {
    type: "state",
    world: WORLD,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      r: p.r,
      hp: p.hp,
      score: p.score,
      gun: p.gun,
      mx: p.input.mx,
      my: p.input.my,
    })),
    bullets: room.bullets.map((b) => ({ x: b.x, y: b.y })),
    elapsed: Math.floor((Date.now() - room.startedAt) / 1000),
  });
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "welcome", message: "Connected" }));
  ws.send(JSON.stringify({ type: "rooms", rooms: [...rooms.values()].map(roomSummary) }));

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    if (msg.type === "list_rooms") {
      ws.send(JSON.stringify({ type: "rooms", rooms: [...rooms.values()].map(roomSummary) }));
      return;
    }

    if (msg.type === "join") {
      const name = String(msg.name || "Player");
      let code = String(msg.code || "").toUpperCase().trim();
      const create = Boolean(msg.create);

      if (create || !code) {
        do {
          code = makeCode();
        } while (rooms.has(code));
      }

      const room = rooms.get(code) || createRoom(code);
      const player = addPlayerToRoom(room, ws, name);

      ws.send(JSON.stringify({ type: "joined", playerId: player.id, code }));
      emitToRoom(room, { type: "notice", text: `${player.name} joined room ${code}` });
      broadcastRoomList();
      return;
    }

    const meta = clientMeta.get(ws);
    if (!meta) return;
    const room = rooms.get(meta.roomCode);
    const player = room?.players.get(meta.playerId);
    if (!room || !player) return;

    if (msg.type === "input") {
      player.input = {
        up: Boolean(msg.up),
        down: Boolean(msg.down),
        left: Boolean(msg.left),
        right: Boolean(msg.right),
        shooting: Boolean(msg.shooting),
        mx: Number(msg.mx) || player.x,
        my: Number(msg.my) || player.y,
      };
    } else if (msg.type === "gun") {
      if (["rifle", "shotgun", "smg"].includes(msg.gun)) player.gun = msg.gun;
    }
  });

  ws.on("close", () => {
    removeClient(ws);
    broadcastRoomList();
  });
});

setInterval(() => {
  for (const room of rooms.values()) stepRoom(room, DT);
}, 1000 / TICK_RATE);

app.use(express.static(path.join(__dirname)));

server.listen(PORT, () => {
  console.log(`Lake Fight Royale server running on http://localhost:${PORT}`);
});

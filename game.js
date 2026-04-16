const lobbyPanel = document.getElementById("lobbyPanel");
const gamePanel = document.getElementById("gamePanel");
const nameInput = document.getElementById("nameInput");
const codeInput = document.getElementById("codeInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const refreshBtn = document.getElementById("refreshBtn");
const roomsList = document.getElementById("roomsList");
const lobbyStatus = document.getElementById("lobbyStatus");
const statusEl = document.getElementById("status");

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${protocol}//${window.location.host}`);

let roomCode = "";
let myId = "";
let state = {
  world: { width: 1100, height: 700, lake: { x: 350, y: 180, w: 380, h: 270 } },
  players: [],
  bullets: [],
  elapsed: 0,
};

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  shooting: false,
  mx: 100,
  my: 100,
};

function send(msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function setLobbyStatus(text) {
  lobbyStatus.textContent = text;
}

function joinRoom(create = false) {
  send({
    type: "join",
    name: nameInput.value || "Player",
    code: codeInput.value,
    create,
  });
}

createBtn.addEventListener("click", () => joinRoom(true));
joinBtn.addEventListener("click", () => joinRoom(false));
refreshBtn.addEventListener("click", () => send({ type: "list_rooms" }));

ws.addEventListener("open", () => {
  setLobbyStatus("Connected. Choose a room.");
  send({ type: "list_rooms" });
});

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "rooms") {
    roomsList.innerHTML = "";
    if (!msg.rooms.length) {
      const li = document.createElement("li");
      li.textContent = "No rooms yet. Create one!";
      roomsList.appendChild(li);
      return;
    }

    for (const room of msg.rooms) {
      const li = document.createElement("li");
      li.textContent = `${room.code} (${room.playerCount} players)`;
      roomsList.appendChild(li);
    }
  }

  if (msg.type === "joined") {
    roomCode = msg.code;
    myId = msg.playerId;
    codeInput.value = roomCode;
    lobbyPanel.classList.add("hidden");
    gamePanel.classList.remove("hidden");
  }

  if (msg.type === "notice") {
    setLobbyStatus(msg.text);
  }

  if (msg.type === "state") {
    state = msg;
  }
});

ws.addEventListener("close", () => {
  setLobbyStatus("Disconnected from server.");
});

window.addEventListener("keydown", (event) => {
  const k = event.key.toLowerCase();
  if (k === "w") input.up = true;
  if (k === "s") input.down = true;
  if (k === "a") input.left = true;
  if (k === "d") input.right = true;
  if (k === "1") send({ type: "gun", gun: "rifle" });
  if (k === "2") send({ type: "gun", gun: "shotgun" });
  if (k === "3") send({ type: "gun", gun: "smg" });
});

window.addEventListener("keyup", (event) => {
  const k = event.key.toLowerCase();
  if (k === "w") input.up = false;
  if (k === "s") input.down = false;
  if (k === "a") input.left = false;
  if (k === "d") input.right = false;
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  input.mx = ((event.clientX - rect.left) / rect.width) * canvas.width;
  input.my = ((event.clientY - rect.top) / rect.height) * canvas.height;
});

canvas.addEventListener("mousedown", () => {
  input.shooting = true;
});

window.addEventListener("mouseup", () => {
  input.shooting = false;
});

setInterval(() => {
  send({ type: "input", ...input });
}, 1000 / 30);

function drawMap() {
  const { world } = state;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2f6d38";
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.fillStyle = "#2f8be7";
  ctx.fillRect(world.lake.x, world.lake.y, world.lake.w, world.lake.h);

  ctx.fillStyle = "#6f4d35";
  ctx.fillRect(820, 430, 190, 150);
}

function drawState() {
  for (const b of state.bullets) {
    ctx.fillStyle = "#ffe39f";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of state.players) {
    const me = p.id === myId;
    ctx.fillStyle = me ? "#a6f4ff" : "#ff94ab";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    const aim = Math.atan2(p.my - p.y, p.mx - p.x);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(aim) * 22, p.y + Math.sin(aim) * 22);
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${p.name} (${Math.max(0, Math.round(p.hp))})`, p.x - 26, p.y - 18);
  }
}

function drawHud() {
  const me = state.players.find((p) => p.id === myId);
  if (!me) {
    statusEl.textContent = `Room ${roomCode} | waiting for state...`;
    return;
  }

  const leaderboard = [...state.players]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((p) => `${p.name}:${p.score}`)
    .join("  •  ");

  statusEl.textContent = `Room ${roomCode} | You: ${me.name} | HP ${Math.round(me.hp)} | Gun ${me.gun} | Time ${state.elapsed}s | ${leaderboard}`;
}

function loop() {
  if (!gamePanel.classList.contains("hidden")) {
    drawMap();
    drawState();
    drawHud();
  }
  requestAnimationFrame(loop);
}

loop();

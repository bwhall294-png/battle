# Lake Fight Royale Online

Online browser shooter with a lake map, multiple guns, and a room lobby.

## Features

- Real-time multiplayer over WebSockets
- Lobby system (create room / join room by code)
- 3 gun types: Rifle, Shotgun, SMG
- Shared map with lake slowdown and scoreboard

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm start
```

3. Open browser:

- `http://localhost:3000`

## Play online with friends

- Deploy the app to any Node host (Render, Railway, Fly.io, VPS, etc.).
- Share your public URL.
- One player creates a room and shares the room code.
- Others join using the same code.

## Controls

- `W A S D` move
- Mouse aim
- Left click shoot
- `1` Rifle
- `2` Shotgun
- `3` SMG

## Test

```bash
npm run check
```

Then manually verify:

1. Open two browser windows/tabs.
2. Create room in one tab.
3. Join same code in second tab.
4. Confirm both players move, shoot, and see each other updates.

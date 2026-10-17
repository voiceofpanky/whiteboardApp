# Shared whiteboard Socket.IO server

The Next.js app and Socket.IO server are separate services in production. Deploy
this repository as a Render **Web Service** for the socket server:

- Build command: `npm ci`
- Start command: `npm run socket-server`
- Health check path: `/health`
- Add a persistent disk mounted at `/var/data`.
- Set `ROOMS_FILE=/var/data/whiteboard-rooms.json`.
- Set `CLIENT_ORIGIN` to the production Vercel app origin (for example,
  `https://your-whiteboard.vercel.app`).
- Run one server instance; room state is stored in a local JSON file.

The production client defaults to the provided Render origin,
`https://stemspark4kids-whiteboard.onrender.com`. If you deploy the socket server
to a different origin, set the Vercel environment variable
`NEXT_PUBLIC_SOCKET_URL` to that origin and redeploy the Next.js app. For local
development, run `npm run dev` and `npm run socket-server` in separate
terminals; the client defaults to `http://localhost:8080`.

Share links contain a randomly generated room ID. The server stores each room's
latest canvas state and the latest 200 chat messages, and broadcasts changes to
other connected clients in that room. The persistent disk keeps both available
after a page refresh or server restart. Existing room files using the previous
canvas-only format are read and migrated on the next save.

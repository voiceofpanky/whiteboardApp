import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';

const port = Number(process.env.PORT || 8080);
const roomsFile = process.env.ROOMS_FILE || path.join(
    process.env.RENDER_DISK_PATH || process.cwd(),
    'whiteboard-rooms.json'
);
const allowedOrigins = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim())
    : '*';
const maxStateSize = 2_000_000;
const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let rooms = {};
if (existsSync(roomsFile)) {
    rooms = JSON.parse(readFileSync(roomsFile, 'utf8'));
}

const persistRooms = () => {
    mkdirSync(path.dirname(roomsFile), { recursive: true });
    const temporaryFile = `${roomsFile}.tmp`;
    writeFileSync(temporaryFile, JSON.stringify(rooms), 'utf8');
    renameSync(temporaryFile, roomsFile);
};

const httpServer = createServer((request, response) => {
    if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
        return;
    }

    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
});

const io = new Server(httpServer, {
    cors: { origin: allowedOrigins },
    maxHttpBufferSize: maxStateSize,
});

io.on('connection', (socket) => {
    socket.on('room:leave', ({ roomId } = {}) => {
        if (typeof roomId === 'string' && roomIdPattern.test(roomId)) {
            socket.leave(roomId);
        }
    });

    socket.on('room:join', (payload, acknowledge) => {
        if (typeof acknowledge !== 'function') return;

        const { roomId, initialState } = payload || {};
        if (typeof roomId !== 'string' || !roomIdPattern.test(roomId)) {
            acknowledge({ ok: false, error: 'Invalid whiteboard room link.' });
            return;
        }

        const serializedInitialState = JSON.stringify(initialState);
        if (
            !initialState ||
            typeof initialState !== 'object' ||
            Array.isArray(initialState) ||
            serializedInitialState.length > maxStateSize
        ) {
            acknowledge({ ok: false, error: 'Invalid or oversized whiteboard state.' });
            return;
        }

        if (!rooms[roomId]) {
            rooms[roomId] = initialState;
            try {
                persistRooms();
            } catch (error) {
                console.error('Could not persist a whiteboard room:', error);
                delete rooms[roomId];
                acknowledge({ ok: false, error: 'Could not save this whiteboard room.' });
                return;
            }
        }

        socket.join(roomId);
        acknowledge({ ok: true, state: rooms[roomId] });
    });

    socket.on('room:update', (payload) => {
        const { roomId, state } = payload || {};
        if (
            typeof roomId !== 'string' ||
            !roomIdPattern.test(roomId) ||
            !socket.rooms.has(roomId) ||
            !state ||
            typeof state !== 'object' ||
            Array.isArray(state) ||
            JSON.stringify(state).length > maxStateSize
        ) {
            socket.emit('room:error', 'Could not save the whiteboard update.');
            return;
        }

        const previousState = rooms[roomId];
        rooms[roomId] = state;
        try {
            persistRooms();
        } catch (error) {
            console.error(`Could not persist whiteboard room ${roomId}:`, error);
            rooms[roomId] = previousState;
            socket.emit('room:error', 'Could not save the whiteboard update.');
            return;
        }

        socket.to(roomId).emit('room:state', { roomId, state });
    });
});

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Whiteboard Socket.IO server listening on port ${port}`);
});

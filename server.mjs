import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
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
let roomChatMessages = {};
if (existsSync(roomsFile)) {
    const savedData = JSON.parse(readFileSync(roomsFile, 'utf8'));
    if (
        savedData &&
        typeof savedData === 'object' &&
        Object.prototype.hasOwnProperty.call(savedData, 'rooms') &&
        Object.prototype.hasOwnProperty.call(savedData, 'chatMessages')
    ) {
        rooms = savedData.rooms;
        roomChatMessages = savedData.chatMessages;
    } else {
        rooms = savedData;
    }
}

const persistRooms = () => {
    mkdirSync(path.dirname(roomsFile), { recursive: true });
    const temporaryFile = `${roomsFile}.tmp`;
    writeFileSync(temporaryFile, JSON.stringify({ rooms, chatMessages: roomChatMessages }), 'utf8');
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

const getRoomParticipants = (roomId, excludedSocketId) => {
    const socketIds = io.sockets.adapter.rooms.get(roomId) || [];
    return [...socketIds]
        .filter((socketId) => socketId !== excludedSocketId)
        .map((socketId) => io.sockets.sockets.get(socketId)?.data.participantName)
        .filter((name) => typeof name === 'string');
};

const broadcastRoomParticipants = (roomId, excludedSocketId) => {
    io.to(roomId).emit('room:participants', {
        roomId,
        participants: getRoomParticipants(roomId, excludedSocketId),
    });
};

io.on('connection', (socket) => {
    socket.on('room:leave', ({ roomId } = {}) => {
        if (typeof roomId === 'string' && roomIdPattern.test(roomId) && socket.rooms.has(roomId)) {
            socket.leave(roomId);
            if (socket.data.whiteboardRoomId === roomId) {
                delete socket.data.whiteboardRoomId;
            }
            broadcastRoomParticipants(roomId);
        }
    });

    socket.on('room:join', (payload, acknowledge) => {
        if (typeof acknowledge !== 'function') return;

        const { roomId, initialState, participantName } = payload || {};
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

        const name = typeof participantName === 'string'
            ? participantName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) || 'Guest'
            : 'Guest';
        const previousRoomId = socket.data.whiteboardRoomId;
        if (previousRoomId && previousRoomId !== roomId) {
            socket.leave(previousRoomId);
            broadcastRoomParticipants(previousRoomId);
        }

        socket.data.participantName = name;
        socket.data.whiteboardRoomId = roomId;
        socket.join(roomId);
        const participants = getRoomParticipants(roomId);
        broadcastRoomParticipants(roomId);
        acknowledge({
            ok: true,
            state: rooms[roomId],
            participants,
            chatMessages: roomChatMessages[roomId] || [],
        });
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            if (roomId !== socket.id) {
                broadcastRoomParticipants(roomId, socket.id);
            }
        }
    });

    socket.on('chat:send', (payload, acknowledge) => {
        if (typeof acknowledge !== 'function') return;

        const { roomId, text } = payload || {};
        if (
            typeof roomId !== 'string' ||
            !roomIdPattern.test(roomId) ||
            !socket.rooms.has(roomId) ||
            socket.data.whiteboardRoomId !== roomId ||
            typeof text !== 'string' ||
            text.trim().length === 0 ||
            text.length > 1000
        ) {
            acknowledge({ ok: false, error: 'Could not send this chat message.' });
            return;
        }

        const message = {
            id: randomUUID(),
            senderName: socket.data.participantName || 'Guest',
            text: text.trim(),
            sentAt: Date.now(),
        };
        const previousMessages = roomChatMessages[roomId] || [];
        roomChatMessages[roomId] = [...previousMessages, message].slice(-200);
        try {
            persistRooms();
        } catch (error) {
            console.error(`Could not persist chat messages for whiteboard room ${roomId}:`, error);
            roomChatMessages[roomId] = previousMessages;
            acknowledge({ ok: false, error: 'Could not save this chat message.' });
            return;
        }

        io.to(roomId).emit('chat:message', {
            roomId,
            message,
        });
        acknowledge({ ok: true });
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

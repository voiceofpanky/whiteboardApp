import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Canvas } from 'fabric';
import type { SocketDetails } from '@/types/global.types';

type CanvasState = ReturnType<Canvas['toJSON']>;

interface JoinRoomResponse {
    ok: boolean;
    state?: CanvasState;
    error?: string;
}

interface RoomStateUpdate {
    roomId: string;
    state: CanvasState;
}
// production url backend : https://whiteboardapp-h2ey.onrender.com
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || (
    process.env.NODE_ENV === 'production'
        ? 'https://whiteboardapp-h2ey.onrender.com'
        : 'http://localhost:8080'
);

export const useSocket = (canvas: Canvas | null) => {
    const socketRef = useRef<Socket | null>(null);
    const roomIdRef = useRef<string | null>(null);
    const applyingRemoteStateRef = useRef(false);
    const remoteStateQueueRef = useRef<Promise<void>>(Promise.resolve());
    const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [socketDetails, setSocketDetails] = useState<SocketDetails | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const clearConnectionError = useCallback(() => {
        setConnectionError(null);
    }, []);

    const shareBoard = useCallback((): Promise<string> => {
        const socket = socketRef.current;
        if (!canvas || !socket?.connected) {
            return Promise.reject(new Error('The whiteboard server is not connected yet.'));
        }

        const existingRoomId = roomIdRef.current;
        const roomId = existingRoomId ?? crypto.randomUUID();

        return new Promise((resolve, reject) => {
            const join = (error: Error | null, response?: JoinRoomResponse) => {
                if (error) {
                    reject(new Error('The server did not respond while creating the share link.'));
                    return;
                }
                if (!response?.ok) {
                    reject(new Error(response?.error || 'The server could not create this whiteboard room.'));
                    return;
                }

                roomIdRef.current = roomId;
                const url = new URL(window.location.href);
                url.searchParams.set('room', roomId);
                window.history.replaceState(window.history.state, '', url);
                resolve(url.toString());
            };

            socket.timeout(10000).emit(
                'room:join',
                { roomId, initialState: canvas.toJSON() },
                join
            );
        });
    }, [canvas]);

    const startNewBoard = useCallback((): Promise<string> => {
        const socket = socketRef.current;
        if (!canvas || !socket?.connected) {
            return Promise.reject(new Error('The whiteboard server is not connected yet.'));
        }

        const roomId = crypto.randomUUID();
        const initialState = { ...canvas.toJSON(), objects: [] };
        const previousRoomId = roomIdRef.current;

        if (updateTimerRef.current !== null) {
            clearTimeout(updateTimerRef.current);
            updateTimerRef.current = null;
            if (previousRoomId) {
                socket.emit('room:update', {
                    roomId: previousRoomId,
                    state: canvas.toJSON(),
                } satisfies RoomStateUpdate);
            }
        }

        return new Promise((resolve, reject) => {
            socket.timeout(10000).emit(
                'room:join',
                { roomId, initialState },
                (error: Error | null, response?: JoinRoomResponse) => {
                    if (error) {
                        reject(new Error('The server did not respond while creating a new whiteboard.'));
                        return;
                    }
                    if (!response?.ok) {
                        reject(new Error(response?.error || 'The server could not create a new whiteboard.'));
                        return;
                    }

                    roomIdRef.current = roomId;
                    if (previousRoomId) {
                        socket.emit('room:leave', { roomId: previousRoomId });
                    }
                    canvas.clear();
                    canvas.set('backgroundColor', '#fff');
                    canvas.renderAll();

                    const url = new URL(window.location.href);
                    url.searchParams.set('room', roomId);
                    window.history.replaceState(window.history.state, '', url);
                    resolve(url.toString());
                }
            );
        });
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;

        const socket = io(socketUrl);
        socketRef.current = socket;

        const applyRoomState = (state: CanvasState) => {
            if (updateTimerRef.current !== null) {
                clearTimeout(updateTimerRef.current);
                updateTimerRef.current = null;
            }

            remoteStateQueueRef.current = remoteStateQueueRef.current.then(async () => {
                applyingRemoteStateRef.current = true;
                try {
                    await canvas.loadFromJSON(state);
                    canvas.renderAll();
                } catch (error) {
                    console.error('Failed to load the shared whiteboard state:', error);
                    setConnectionError('Could not load the shared whiteboard state.');
                } finally {
                    applyingRemoteStateRef.current = false;
                }
            });
        };

        const joinRoomFromUrl = () => {
            const roomId = new URLSearchParams(window.location.search).get('room');
            if (!roomId) return;

            socket.timeout(10000).emit(
                'room:join',
                { roomId, initialState: canvas.toJSON() },
                (error: Error | null, response?: JoinRoomResponse) => {
                    if (error || !response?.ok || !response.state) {
                        const message = response?.error || 'Could not join this whiteboard room.';
                        console.error(message, error);
                        setConnectionError(message);
                        return;
                    }

                    roomIdRef.current = roomId;
                    applyRoomState(response.state);
                }
            );
        };

        const handleConnect = () => {
            setConnectionError(null);
            setSocketDetails({ clientId: socket.id ?? null });
            joinRoomFromUrl();
        };

        const handleConnectError = (error: Error) => {
            console.error('Whiteboard socket connection failed:', error);
            setConnectionError('Cannot connect to the whiteboard server.');
        };

        const handleDisconnect = () => {
            setSocketDetails(null);
        };

        const handleRoomState = (update: RoomStateUpdate) => {
            if (update.roomId !== roomIdRef.current) return;
            applyRoomState(update.state);
        };

        const publishState = () => {
            if (
                applyingRemoteStateRef.current ||
                !roomIdRef.current ||
                !socket.connected
            ) {
                return;
            }

            if (updateTimerRef.current !== null) {
                clearTimeout(updateTimerRef.current);
            }
            updateTimerRef.current = setTimeout(() => {
                updateTimerRef.current = null;
                const roomId = roomIdRef.current;
                if (!roomId || applyingRemoteStateRef.current) return;
                socket.emit('room:update', {
                    roomId,
                    state: canvas.toJSON(),
                } satisfies RoomStateUpdate);
            }, 100);
        };

        const handleRoomError = (message: string) => {
            console.error('Whiteboard room error:', message);
            setConnectionError(message);
        };

        socket.on('connect', handleConnect);
        socket.on('connect_error', handleConnectError);
        socket.on('disconnect', handleDisconnect);
        socket.on('room:state', handleRoomState);
        socket.on('room:error', handleRoomError);
        canvas.on('object:added', publishState);
        canvas.on('object:removed', publishState);
        canvas.on('object:modified', publishState);
        canvas.on('path:created', publishState);
        canvas.on('mouse:up', publishState);
        canvas.on('text:changed', publishState);
        canvas.on('text:editing:exited', publishState);

        return () => {
            if (updateTimerRef.current !== null) {
                clearTimeout(updateTimerRef.current);
            }
            canvas.off('object:added', publishState);
            canvas.off('object:removed', publishState);
            canvas.off('object:modified', publishState);
            canvas.off('path:created', publishState);
            canvas.off('mouse:up', publishState);
            canvas.off('text:changed', publishState);
            canvas.off('text:editing:exited', publishState);
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleConnectError);
            socket.off('disconnect', handleDisconnect);
            socket.off('room:state', handleRoomState);
            socket.off('room:error', handleRoomError);
            socket.disconnect();
            socketRef.current = null;
            roomIdRef.current = null;
        };
    }, [canvas]);

    return { socketDetails, connectionError, clearConnectionError, shareBoard, startNewBoard };
};

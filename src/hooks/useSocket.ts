import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Canvas } from 'fabric';
import type { SocketDetails } from '@/types/global.types';
import { createWhiteboardBackground } from '@/components/Whiteboard/Whiteboard.utils';

type CanvasState = ReturnType<Canvas['toJSON']>;

interface JoinRoomResponse {
    ok: boolean;
    state?: CanvasState;
    error?: string;
    participants?: string[];
    chatMessages?: ChatMessage[];
}

interface RoomStateUpdate {
    roomId: string;
    state: CanvasState;
}

interface RoomParticipantsUpdate {
    roomId: string;
    participants: string[];
}

export interface ChatMessage {
    id: string;
    senderName: string;
    text: string;
    sentAt: number;
}

interface RoomChatMessage {
    roomId: string;
    message: ChatMessage;
}

interface ChatSendResponse {
    ok: boolean;
    error?: string;
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
    const participantNamesRef = useRef(new Map<string, string>());
    const [socketDetails, setSocketDetails] = useState<SocketDetails | null>(null);
    const [participants, setParticipants] = useState<string[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const getParticipantName = useCallback((roomId: string) => {
        const cachedName = participantNamesRef.current.get(roomId);
        if (cachedName) return cachedName;

        const storageKey = `whiteboard-participant-name:${roomId}`;
        try {
            const savedName = window.localStorage.getItem(storageKey);
            if (savedName !== null) {
                participantNamesRef.current.set(roomId, savedName);
                return savedName;
            }
        } catch (error) {
            console.error('Could not load the saved name for this whiteboard:', error);
            setConnectionError('Could not remember your name for this whiteboard. You may be asked again next time.');
        }

        const enteredName = window.prompt('Enter your name to join this whiteboard (cancel or leave blank to join as Guest):');
        const participantName = enteredName?.trim().slice(0, 40) || 'Guest';
        participantNamesRef.current.set(roomId, participantName);
        try {
            window.localStorage.setItem(storageKey, participantName);
        } catch (error) {
            console.error('Could not save the name for this whiteboard:', error);
            setConnectionError('Could not remember your name for this whiteboard. You may be asked again next time.');
        }
        return participantName;
    }, []);
    const clearConnectionError = useCallback(() => {
        setConnectionError(null);
    }, []);
    const sendChatMessage = useCallback((text: string): Promise<void> => {
        const socket = socketRef.current;
        const roomId = roomIdRef.current;
        const message = text.trim();
        if (!socket?.connected || !roomId) {
            return Promise.reject(new Error('Join a shared whiteboard before sending a chat message.'));
        }
        if (!message || message.length > 1000) {
            return Promise.reject(new Error('Chat messages must contain 1 to 1000 characters.'));
        }

        return new Promise((resolve, reject) => {
            socket.timeout(10000).emit(
                'chat:send',
                { roomId, text: message },
                (error: Error | null, response?: ChatSendResponse) => {
                    if (error) {
                        reject(new Error(
                            'The chat server did not acknowledge the message. Deploy the latest server.mjs with chat support, then try again.'
                        ));
                    } else if (!response?.ok) {
                        reject(new Error(response?.error || 'Could not send the chat message.'));
                    } else {
                        resolve();
                    }
                }
            );
        });
    }, []);

    const shareBoard = useCallback((): Promise<string> => {
        const socket = socketRef.current;
        if (!canvas || !socket?.connected) {
            return Promise.reject(new Error('The whiteboard server is not connected yet.'));
        }

        const existingRoomId = roomIdRef.current;
        const roomId = existingRoomId ?? crypto.randomUUID();
        const participantName = getParticipantName(roomId);

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
                setChatMessages(response.chatMessages ?? []);
                setParticipants(response.participants ?? [participantName]);
                const url = new URL(window.location.href);
                url.searchParams.set('room', roomId);
                window.history.replaceState(window.history.state, '', url);
                resolve(url.toString());
            };

            socket.timeout(10000).emit(
                'room:join',
                { roomId, initialState: canvas.toJSON(), participantName },
                join
            );
        });
    }, [canvas, getParticipantName]);

    const startNewBoard = useCallback((): Promise<string> => {
        const socket = socketRef.current;
        if (!canvas || !socket?.connected) {
            return Promise.reject(new Error('The whiteboard server is not connected yet.'));
        }

        const roomId = crypto.randomUUID();
        const participantName = getParticipantName(roomId);
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
                { roomId, initialState, participantName },
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
                    setChatMessages(response.chatMessages ?? []);
                    setParticipants(response.participants ?? [participantName]);
                    if (previousRoomId) {
                        socket.emit('room:leave', { roomId: previousRoomId });
                    }
                    canvas.clear();
                    canvas.set('backgroundColor', createWhiteboardBackground());
                    canvas.renderAll();

                    const url = new URL(window.location.href);
                    url.searchParams.set('room', roomId);
                    window.history.replaceState(window.history.state, '', url);
                    resolve(url.toString());
                }
            );
        });
    }, [canvas, getParticipantName]);

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
                    canvas.set('backgroundColor', createWhiteboardBackground());
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

            const participantName = getParticipantName(roomId);
            socket.timeout(10000).emit(
                'room:join',
                { roomId, initialState: canvas.toJSON(), participantName },
                (error: Error | null, response?: JoinRoomResponse) => {
                    if (error || !response?.ok || !response.state) {
                        const message = response?.error || 'Could not join this whiteboard room.';
                        console.error(message, error);
                        setConnectionError(message);
                        return;
                    }

                    roomIdRef.current = roomId;
                    setChatMessages(response.chatMessages ?? []);
                    setParticipants(response.participants ?? [participantName]);
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
            setParticipants([]);
        };

        const handleRoomState = (update: RoomStateUpdate) => {
            if (update.roomId !== roomIdRef.current) return;
            applyRoomState(update.state);
        };

        const handleRoomParticipants = (update: RoomParticipantsUpdate) => {
            if (update.roomId !== roomIdRef.current) return;
            setParticipants(update.participants);
        };

        const handleChatMessage = (update: RoomChatMessage) => {
            if (update.roomId !== roomIdRef.current) return;
            setChatMessages((messages) => [...messages, update.message].slice(-200));
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
        socket.on('room:participants', handleRoomParticipants);
        socket.on('chat:message', handleChatMessage);
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
            socket.off('room:participants', handleRoomParticipants);
            socket.off('chat:message', handleChatMessage);
            socket.off('room:error', handleRoomError);
            socket.disconnect();
            socketRef.current = null;
            roomIdRef.current = null;
        };
    }, [canvas, getParticipantName]);

    return {
        socketDetails,
        participants,
        chatMessages,
        sendChatMessage,
        connectionError,
        clearConnectionError,
        shareBoard,
        startNewBoard,
    };
};

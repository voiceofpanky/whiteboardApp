import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Canvas, util } from 'fabric';
import {
    type ExtendedFabricObject,
    type SerializedObjectData,
    type SocketDetails,
} from '@/types/global.types';

export const useSocket = (canvas: Canvas | null) => {
    const socketRef = useRef<Socket | null>(null);
    const [socketDetails, setSocketDetails] = useState<SocketDetails | null>(null);

    useEffect(() => {
        if (!canvas) return;

        const socket = io('http://localhost:8080');
        socketRef.current = socket;

        socket.on('connect', () => {
            setSocketDetails({ clientId: socket.id ?? null });
        });

        const handleObjectAdded = (e: { target: ExtendedFabricObject }) => {
            if (!e.target || e.target.__skipEmit) return;
            socket.emit('object:added', e.target.toJSON());
        };
        const handleObjectModified = (e: { target: ExtendedFabricObject }) => {
            if (!e.target || e.target.__skipEmit) return;
            socket.emit('object:modified', e.target.toJSON());
        };
        const handleObjectRemoved = (e: { target: ExtendedFabricObject }) => {
            if (!e.target || e.target.__skipEmit) return;
            socket.emit('object:removed', e.target.toJSON());
        };

        canvas.on('object:added', handleObjectAdded);
        canvas.on('object:modified', handleObjectModified);
        canvas.on('object:removed', handleObjectRemoved);

        socket.on('object:added', (objectData: SerializedObjectData) => {
            util.enlivenObjects([objectData]).then(([obj]) => {
                if (!obj) return;
                const extendedObj = obj as ExtendedFabricObject;
                const alreadyExists = canvas
                    .getObjects()
                    .some((o) => (o as ExtendedFabricObject).id === extendedObj.id);

                if (!alreadyExists) {
                    extendedObj.__skipEmit = true;
                    canvas.add(extendedObj);
                    canvas.renderAll();
                }
            }).catch(console.error);
        });

        socket.on('object:modified', (objectData: SerializedObjectData) => {
            const obj = canvas
                .getObjects()
                .find((o) => (o as ExtendedFabricObject).id === objectData.id) as ExtendedFabricObject | undefined;

            if (obj) {
                obj.__skipEmit = true;
                obj.set({ ...objectData });
                canvas.renderAll();
            }
        });

        socket.on('object:removed', (objectData: SerializedObjectData) => {
            const obj = canvas
                .getObjects()
                .find((o) => (o as ExtendedFabricObject).id === objectData.id) as ExtendedFabricObject | undefined;

            if (obj) {
                obj.__skipEmit = true;
                canvas.remove(obj);
                canvas.renderAll();
            }
        });

        socket.on('canvas:clear', () => {
            canvas.clear();
        });

        socket.on('object:sync', (payload: { objects: SerializedObjectData[] }) => {
            util.enlivenObjects(payload.objects).then((objects) => {
                canvas.clear();
                objects.forEach((obj) => {
                    const extendedObj = obj as ExtendedFabricObject;
                    extendedObj.__skipEmit = true;
                    canvas.add(extendedObj);
                });
                canvas.renderAll();
            }).catch(console.error);
        });

        return () => {
            canvas.off('object:added', handleObjectAdded);
            canvas.off('object:modified', handleObjectModified);
            canvas.off('object:removed', handleObjectRemoved);
            socket.off('object:added');
            socket.off('object:removed');
            socket.off('object:modified');
            socket.off('object:sync');
            socket.off('canvas:clear');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [canvas]);

    return { socketDetails };
};
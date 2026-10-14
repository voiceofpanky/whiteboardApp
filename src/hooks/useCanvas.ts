import { useEffect, useRef, useState } from 'react';
import { Canvas, FabricObject } from 'fabric';
import { ExtendedFabricObject } from '@/types/global.types';
import { generateId } from '@/components/Whiteboard/Whiteboard.utils';

export const useCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [fabricCanvas, setFabricCanvas] = useState<Canvas | null>(null);
    useEffect(() => {
        const init = () => {
            const canvasEl = canvasRef.current;
            if (!canvasEl) return;
            FabricObject.prototype.toObject = (function (toObject) {
                return function (this: FabricObject, properties: string[] = []) {
                    return toObject.call(this, [...properties, 'id']);
                };
            })(FabricObject.prototype.toObject);
            const canvas = new Canvas(canvasEl, {
                backgroundColor: '#fff',
            });
            canvas.setDimensions({
                width: window.innerWidth,
                height: window.innerHeight - 80,
            });
            canvas.renderAll();
            // Add unique IDs to objects when they're created
            canvas.on('object:added', (e: { target: ExtendedFabricObject }) => {
                if (!e.target) return;
                if (!e.target.id) {
                    e.target.id = generateId();
                }
            });
            setFabricCanvas(canvas);
            const resize = () => {
                canvas.setDimensions({
                    width: window.innerWidth,
                    height: window.innerHeight - 80,
                });
                canvas.renderAll();
            };
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    const active = canvas.getActiveObject();
                    if (active) {
                        canvas.remove(active);
                        canvas.renderAll();
                    }
                }
            };
            window.addEventListener('resize', resize);
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('resize', resize);
                window.removeEventListener('keydown', handleKeyDown);
                // Remove canvas event listeners
                canvas.off('object:added');
                if (canvas) {
                    canvas.dispose();
                    setFabricCanvas(null);
                }
            };
        };
        const cleanup = init();
        return cleanup;
    }, []);
    return { canvasRef, fabricCanvas };
};
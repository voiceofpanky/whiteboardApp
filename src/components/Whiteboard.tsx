'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { PencilBrush, type FabricObject } from 'fabric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import type { WhiteboardState } from './Whiteboard.types';
import type { Tool } from '../Toolbar/Toolbar.types';
import { useCanvas } from '@/hooks/useCanvas';
import { useSocket } from '@/hooks/useSocket';
import { useToolHandlers } from '@/hooks/useToolHandlers';

export const Whiteboard = () => {
    const { canvasRef, fabricCanvas } = useCanvas();
    const { socketDetails } = useSocket(fabricCanvas);
    const toolRef = useRef<Tool>('select');
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(0);
    const restoringRef = useRef(false);
    const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [historyAvailability, setHistoryAvailability] = useState({
        canUndo: false,
        canRedo: false,
    });
    const [state, setState] = useState<WhiteboardState>({
        tool: 'select',
        brushColor: '#000000',
        brushSize: 5,
    });

    const toolOptions = useMemo(
        () => ['select', 'draw', 'erase', 'rectangle', 'line', 'ellipse', 'clear'] as Tool[],
        []
    );

    useEffect(() => {
        toolRef.current = state.tool;
    }, [state.tool]);

    const handleToolClick = useCallback(
        (t: Tool) => () => setState((prev: WhiteboardState) => ({ ...prev, tool: t })),
        []
    );

    const handleColorChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) =>
            setState((prev: WhiteboardState) => ({ ...prev, brushColor: e.target.value })),
        []
    );

    const handleSizeChange = useCallback(
        (val: number[]) => setState((prev: WhiteboardState) => ({ ...prev, brushSize: val[0] ?? 1 })),
        []
    );

    const { handleMouseDown, handleMouseMove, handleMouseUp } = useToolHandlers(
        fabricCanvas,
        state.tool,
        state.brushColor,
        state.brushSize
    );

    useEffect(() => {
        if (!fabricCanvas) return;

        const initialSnapshot = JSON.stringify(fabricCanvas.toJSON());
        historyRef.current = [initialSnapshot];
        historyIndexRef.current = 0;

        const updateHistoryAvailability = () => {
            setHistoryAvailability({
                canUndo: historyIndexRef.current > 0,
                canRedo: historyIndexRef.current < historyRef.current.length - 1,
            });
        };

        const captureSnapshot = () => {
            captureTimerRef.current = null;
            if (restoringRef.current) return;

            const snapshot = JSON.stringify(fabricCanvas.toJSON());
            if (snapshot === historyRef.current[historyIndexRef.current]) return;

            historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
            historyRef.current.push(snapshot);
            if (historyRef.current.length > 50) {
                historyRef.current.shift();
            } else {
                historyIndexRef.current += 1;
            }
            historyIndexRef.current = historyRef.current.length - 1;
            updateHistoryAvailability();
        };

        const scheduleSnapshot = () => {
            if (captureTimerRef.current !== null) {
                clearTimeout(captureTimerRef.current);
            }
            captureTimerRef.current = setTimeout(captureSnapshot, 0);
        };

        const handleObjectAdded = () => {
            const drawingShape = ['rectangle', 'line', 'ellipse'].includes(toolRef.current);
            if (!drawingShape) scheduleSnapshot();
        };

        fabricCanvas.on('object:added', handleObjectAdded);
        fabricCanvas.on('object:removed', scheduleSnapshot);
        fabricCanvas.on('object:modified', scheduleSnapshot);
        fabricCanvas.on('path:created', scheduleSnapshot);
        fabricCanvas.on('mouse:up', scheduleSnapshot);

        return () => {
            if (captureTimerRef.current !== null) {
                clearTimeout(captureTimerRef.current);
            }
            fabricCanvas.off('object:added', handleObjectAdded);
            fabricCanvas.off('object:removed', scheduleSnapshot);
            fabricCanvas.off('object:modified', scheduleSnapshot);
            fabricCanvas.off('path:created', scheduleSnapshot);
            fabricCanvas.off('mouse:up', scheduleSnapshot);
        };
    }, [fabricCanvas]);

    const restoreHistorySnapshot = useCallback(async (index: number) => {
        if (!fabricCanvas || restoringRef.current) return;
        const snapshot = historyRef.current[index];
        if (!snapshot) return;

        restoringRef.current = true;
        try {
            await fabricCanvas.loadFromJSON(snapshot);
            fabricCanvas.renderAll();
            historyIndexRef.current = index;
            setHistoryAvailability({
                canUndo: index > 0,
                canRedo: index < historyRef.current.length - 1,
            });
        } catch (error) {
            console.error('Failed to restore whiteboard history:', error);
        } finally {
            restoringRef.current = false;
        }
    }, [fabricCanvas]);

    const handleUndo = useCallback(() => {
        if (historyIndexRef.current > 0) {
            void restoreHistorySnapshot(historyIndexRef.current - 1);
        }
    }, [restoreHistorySnapshot]);

    const handleRedo = useCallback(() => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
            void restoreHistorySnapshot(historyIndexRef.current + 1);
        }
    }, [restoreHistorySnapshot]);

    const handleSave = useCallback(() => {
        if (!fabricCanvas) return;
        const downloadLink = document.createElement('a');
        downloadLink.download = 'whiteboard.png';
        downloadLink.href = fabricCanvas.toDataURL({ format: 'png', multiplier: 1 });
        downloadLink.click();
    }, [fabricCanvas]);

    useEffect(() => {
        if (!fabricCanvas) return;

        const cleanup = () => {
            fabricCanvas.set('isDrawingMode', false);
            fabricCanvas.set('selection', false);
            fabricCanvas.off('mouse:down');
            fabricCanvas.off('mouse:move');
            fabricCanvas.off('mouse:up');

            if (state.tool !== 'select') {
                fabricCanvas.forEachObject((obj: FabricObject) => {
                    obj.selectable = false;
                });
            }
        };

        cleanup();

        switch (state.tool) {
            case 'draw': {
                fabricCanvas.set('isDrawingMode', true);
                const brush = new PencilBrush(fabricCanvas);
                brush.color = state.brushColor;
                brush.width = state.brushSize;
                fabricCanvas.set('freeDrawingBrush', brush);
                break;
            }
            case 'erase': {
                fabricCanvas.set('isDrawingMode', true);
                const brush = new PencilBrush(fabricCanvas);
                brush.color = '#ffffff';
                brush.width = state.brushSize;
                fabricCanvas.set('freeDrawingBrush', brush);
                break;
            }
            case 'select': {
                fabricCanvas.set('selection', true);
                fabricCanvas.forEachObject((obj: FabricObject) => {
                    obj.selectable = true;
                });
                break;
            }
            case 'clear': {
                fabricCanvas.clear();
                fabricCanvas.set('backgroundColor', '#fff');
                fabricCanvas.renderAll();
                break;
            }
            default: {
                fabricCanvas.on('mouse:down', handleMouseDown);
                fabricCanvas.on('mouse:move', handleMouseMove);
                fabricCanvas.on('mouse:up', handleMouseUp);
                break;
            }
        }

        return cleanup;
    }, [
        state.tool,
        state.brushColor,
        state.brushSize,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        fabricCanvas,
    ]);

    return (
        <div className='p-2'>
            <div className='flex items-center gap-3 bg-gray-100 px-4 py-2 shadow-md sticky top-0 z-10'>
                {toolOptions.map((t) => (
                    <Button
                        key={t}
                        variant={state.tool === t ? 'default' : 'outline'}
                        onClick={handleToolClick(t)}
                    >
                        {t === 'erase' ? 'Eraser' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </Button>
                ))}
                <Button
                    variant='outline'
                    onClick={handleUndo}
                    disabled={!historyAvailability.canUndo}
                    aria-label='Undo'
                >
                    Undo
                </Button>
                <Button
                    variant='outline'
                    onClick={handleRedo}
                    disabled={!historyAvailability.canRedo}
                    aria-label='Redo'
                >
                    Redo
                </Button>
                <Button variant='outline' onClick={handleSave} disabled={!fabricCanvas}>
                    Save PNG
                </Button>
                <div className='flex items-center gap-3 ml-6'>
                    <label className='text-sm'>Color:</label>
                    <Input
                        type='color'
                        value={state.brushColor}
                        onChange={handleColorChange}
                        className='w-10 h-10 p-0 border-none'
                    />
                    <label className='text-sm'>Size:</label>
                    <Slider
                        min={1}
                        max={20}
                        step={1}
                        value={[state.brushSize]}
                        onValueChange={handleSizeChange}
                        className='w-32'
                    />
                </div>
            </div>
            <canvas
                ref={canvasRef}
                className='border border-gray-300 rounded shadow w-full h-[calc(100vh-80px)]'
            />
            {socketDetails?.clientId && (
                <div className='fixed bottom-4 right-4 z-50 p-3 bg-black text-white text-sm rounded-xl shadow-xl opacity-90'>
                    🧩 Connected as:{' '}
                    <span className='font-mono text-green-300'>
                        {socketDetails.clientId}
                    </span>
                </div>
            )}
        </div>
    );
};
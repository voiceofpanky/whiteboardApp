'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { PencilBrush } from 'fabric';
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
    const [state, setState] = useState<WhiteboardState>({
        tool: 'select',
        brushColor: '#000000',
        brushSize: 5,
        socketDetails,
    });

    const toolOptions = useMemo(
        () => ['select', 'draw', 'rectangle', 'line', 'ellipse', 'clear'] as Tool[],
        []
    );

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

        const cleanup = () => {
            fabricCanvas.isDrawingMode = false;
            fabricCanvas.selection = false;
            fabricCanvas.off('mouse:down');
            fabricCanvas.off('mouse:move');
            fabricCanvas.off('mouse:up');

            if (state.tool !== 'select') {
                fabricCanvas.forEachObject((obj: any) => {
                    obj.selectable = false;
                });
            }
        };

        cleanup();

        switch (state.tool) {
            case 'draw': {
                fabricCanvas.isDrawingMode = true;
                const brush = new PencilBrush(fabricCanvas);
                brush.color = state.brushColor;
                brush.width = state.brushSize;
                fabricCanvas.freeDrawingBrush = brush;
                break;
            }
            case 'select': {
                fabricCanvas.selection = true;
                fabricCanvas.forEachObject((obj: any) => {
                    obj.selectable = true;
                });
                break;
            }
            case 'clear': {
                fabricCanvas.clear();
                fabricCanvas.backgroundColor = '#fff';
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

    useEffect(() => {
        setState((prev: WhiteboardState) => ({ ...prev, socketDetails }));
    }, [socketDetails]);

    return (
        <div className='p-2'>
            <div className='flex items-center gap-3 bg-gray-100 px-4 py-2 shadow-md sticky top-0 z-10'>
                {toolOptions.map((t) => (
                    <Button
                        key={t}
                        variant={state.tool === t ? 'default' : 'outline'}
                        onClick={handleToolClick(t)}
                    >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Button>
                ))}
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
            {state.socketDetails?.clientId && (
                <div className='fixed bottom-4 right-4 z-50 p-3 bg-black text-white text-sm rounded-xl shadow-xl opacity-90'>
                    🧩 Connected as:{' '}
                    <span className='font-mono text-green-300'>
                        {state.socketDetails.clientId}
                    </span>
                </div>
            )}
        </div>
    );
};
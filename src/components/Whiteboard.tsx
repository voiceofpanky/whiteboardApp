'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
    IText,
    PencilBrush,
    type FabricObject,
    type TPointerEvent,
    type TPointerEventInfo,
} from 'fabric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import type { WhiteboardState } from './Whiteboard.types';
import type { Tool } from '../Toolbar/Toolbar.types';
import { useCanvas } from '@/hooks/useCanvas';
import { useSocket } from '@/hooks/useSocket';
import { useToolHandlers } from '@/hooks/useToolHandlers';

type WhiteboardIconName = Tool | 'new-board' | 'undo' | 'redo' | 'save' | 'share' | 'zoom-in' | 'zoom-out' | 'pan-up' | 'pan-down' | 'pan-left' | 'pan-right';

const WhiteboardIcon = ({ name }: { name: WhiteboardIconName }) => {
    const iconContent = (() => {
        switch (name) {
            case 'select':
                return <path d='M5 3l14 11-7 1-3 6L5 3z' />;
            case 'pan':
                return <><path d='M12 2v20M2 12h20' /><path d='m8 6 4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4' /></>;
            case 'text':
                return <><path d='M4 5h16M12 5v14M8 19h8' /><path d='M8 5h8' /></>;
            case 'new-board':
                return <><path d='M4 4h12v5H4zM4 13h7v7H4z' /><path d='M17 14v6M14 17h6' /></>;
            case 'draw':
            case 'pencil':
                return <><path d='m15 5 4 4' /><path d='M4 20l4.5-1 11-11a2.12 2.12 0 0 0-3-3l-11 11L4 20z' /></>;
            case 'erase':
                return <><path d='m7 21-4-4a2 2 0 0 1 0-3l9-9a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-7 7' /><path d='M22 21H7' /><path d='m5 14 5 5' /></>;
            case 'rectangle':
                return <rect x='4' y='5' width='16' height='14' rx='1' />;
            case 'line':
                return <path d='M5 19 19 5' />;
            case 'ellipse':
            case 'circle':
                return <circle cx='12' cy='12' r='8' />;
            case 'clear':
                return <><path d='M3 6h18' /><path d='M8 6V4h8v2' /><path d='m19 6-1 14H6L5 6' /><path d='M10 11v5M14 11v5' /></>;
            case 'undo':
                return <><path d='M3 7v6h6' /><path d='M4 13a8 8 0 1 0 2-5L3 11' /></>;
            case 'redo':
                return <><path d='M21 7v6h-6' /><path d='M20 13a8 8 0 1 1-2-5l3 3' /></>;
            case 'save':
                return <><path d='M5 21h14a2 2 0 0 0 2-2V7l-4-4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z' /><path d='M17 21v-8H7v8' /><path d='M7 3v5h8' /></>;
            case 'share':
                return <><circle cx='18' cy='5' r='3' /><circle cx='6' cy='12' r='3' /><circle cx='18' cy='19' r='3' /><path d='m8.6 10.5 6.8-4' /><path d='m8.6 13.5 6.8 4' /></>;
            case 'zoom-in':
                return <><circle cx='10.5' cy='10.5' r='6.5' /><path d='m16 16 5 5M10.5 7v7M7 10.5h7' /></>;
            case 'zoom-out':
                return <><circle cx='10.5' cy='10.5' r='6.5' /><path d='m16 16 5 5M7 10.5h7' /></>;
            case 'pan-up':
                return <><path d='m5 12 7-7 7 7M12 5v14' /></>;
            case 'pan-down':
                return <><path d='m5 12 7 7 7-7M12 19V5' /></>;
            case 'pan-left':
                return <><path d='m12 5-7 7 7 7M5 12h14' /></>;
            case 'pan-right':
                return <><path d='m12 5 7 7-7 7M19 12H5' /></>;
        }
    })();

    return (
        <svg
            aria-hidden='true'
            className='h-5 w-5'
            fill='none'
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='1.8'
            viewBox='0 0 24 24'
        >
            {iconContent}
        </svg>
    );
};

export const Whiteboard = () => {
    const {
        canvasRef,
        canvasHostRef,
        fabricCanvas,
        zoom,
        zoomBy,
        panBy,
        resetViewport,
        setPanMode,
    } = useCanvas();
    const {
        socketDetails,
        connectionError,
        clearConnectionError,
        shareBoard,
        startNewBoard,
    } = useSocket(fabricCanvas);
    const toolRef = useRef<Tool>('select');
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(0);
    const restoringRef = useRef(false);
    const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [historyAvailability, setHistoryAvailability] = useState({
        canUndo: false,
        canRedo: false,
    });
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [shareFeedback, setShareFeedback] = useState<string | null>(null);
    const [shareFeedbackIsError, setShareFeedbackIsError] = useState(false);
    const [toolbarOpen, setToolbarOpen] = useState(false);
    const [state, setState] = useState<WhiteboardState>({
        tool: 'select',
        brushColor: '#000000',
        brushSize: 5,
    });

    const toolOptions = useMemo(
        () => ['select', 'pan', 'text', 'draw', 'erase', 'rectangle', 'line', 'ellipse', 'clear'] as Tool[],
        []
    );

    useEffect(() => {
        toolRef.current = state.tool;
    }, [state.tool]);

    const handleToolClick = useCallback(
        (t: Tool) => () => {
            setPanMode(t === 'pan');
            setState((prev: WhiteboardState) => ({ ...prev, tool: t }));
        },
        [setPanMode]
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

    const handleTextPlacement = useCallback((event: TPointerEventInfo<TPointerEvent>) => {
        if (!fabricCanvas || event.target) return;

        const pointer = fabricCanvas.getScenePoint(event.e);
        const text = new IText('', {
            left: pointer.x,
            top: pointer.y,
            fill: state.brushColor,
            fontSize: state.brushSize * 6,
            fontFamily: 'Arial',
            editable: true,
        });
        text.on('editing:exited', () => {
            if (!text.text.trim()) {
                fabricCanvas.remove(text);
            }
        });
        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        fabricCanvas.renderAll();
    }, [fabricCanvas, state.brushColor, state.brushSize]);

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
        fabricCanvas.on('text:editing:exited', scheduleSnapshot);

        return () => {
            if (captureTimerRef.current !== null) {
                clearTimeout(captureTimerRef.current);
            }
            fabricCanvas.off('object:added', handleObjectAdded);
            fabricCanvas.off('object:removed', scheduleSnapshot);
            fabricCanvas.off('object:modified', scheduleSnapshot);
            fabricCanvas.off('path:created', scheduleSnapshot);
            fabricCanvas.off('mouse:up', scheduleSnapshot);
            fabricCanvas.off('text:editing:exited', scheduleSnapshot);
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

    const handleShare = useCallback(async () => {
        setShareFeedback(null);
        setShareFeedbackIsError(false);
        try {
            const url = await shareBoard();
            setShareLink(url);
            try {
                await navigator.clipboard.writeText(url);
                setShareFeedback('      Share link copied to clipboard.');
            } catch (error) {
                console.error('Could not copy the share link:', error);
                setShareFeedback('Room created. Copy the link shown below to share it.');
            }
        } catch (error) {
            console.error('Could not create a share link:', error);
            setShareFeedbackIsError(true);
            setShareFeedback(error instanceof Error ? error.message : 'Could not create a share link.');
        }
    }, [shareBoard]);

    const handleNewBoard = useCallback(async () => {
        if (!fabricCanvas) return;
        setShareFeedback(null);
        setShareFeedbackIsError(false);
        try {
            const url = await startNewBoard();
            if (captureTimerRef.current !== null) {
                clearTimeout(captureTimerRef.current);
                captureTimerRef.current = null;
            }
            historyRef.current = [JSON.stringify(fabricCanvas.toJSON())];
            historyIndexRef.current = 0;
            setHistoryAvailability({ canUndo: false, canRedo: false });
            setPanMode(false);
            setState((previous) => ({ ...previous, tool: 'select' }));
            setShareLink(url);
            setShareFeedback('     New whiteboard created. Share the link below to invite others.');
        } catch (error) {
            console.error('Could not create a new whiteboard:', error);
            setShareFeedbackIsError(true);
            setShareFeedback(error instanceof Error ? error.message : 'Could not create a new whiteboard.');
        }
    }, [fabricCanvas, setPanMode, startNewBoard]);

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
            case 'text': {
                fabricCanvas.on('mouse:down', handleTextPlacement);
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
        handleTextPlacement,
        fabricCanvas,
    ]);

    return (
        <div className='p-2'>
            <h1 className='pointer-events-none fixed left-1/2 top-3 z-30 -translate-x-1/2 whitespace-nowrap rounded-lg border border-green-300 bg-green-50 px-4 py-2 font-sans text-lg font-semibold tracking-tight text-green-900 shadow-md sm:text-xl'>
                StemSpark4kids Whiteboard
            </h1>
            <Button
                variant='outline'
                onClick={() => setToolbarOpen((open) => !open)}
                aria-label={toolbarOpen ? 'Hide toolbar' : 'Show toolbar'}
                aria-expanded={toolbarOpen}
                aria-controls='whiteboard-toolbar'
                title={toolbarOpen ? 'Hide toolbar' : 'Show toolbar'}
                className='fixed left-4 top-4 z-50 h-10 w-10 p-0 shadow-md'
            >
                <svg
                    aria-hidden='true'
                    className='h-5 w-5'
                    fill='none'
                    stroke='currentColor'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    viewBox='0 0 24 24'
                >
                    {toolbarOpen
                        ? <path d='m6 6 12 12M18 6 6 18' />
                        : <path d='M4 6h16M4 12h16M4 18h16' />}
                </svg>
            </Button>
            {toolbarOpen && (
            <div
                id='whiteboard-toolbar'
                className='fixed left-2 right-2 top-14 z-40 flex max-h-[calc(100dvh-4rem)] flex-wrap items-center gap-3 overflow-y-auto rounded bg-gray-100/95 px-4 py-2 shadow-md backdrop-blur'
            >
                <Button
                    variant='outline'
                    onClick={handleNewBoard}
                    disabled={!fabricCanvas || !socketDetails?.clientId}
                    aria-label='Create new whiteboard'
                    title='Create new whiteboard'
                    className='h-10 w-10 p-0'
                >
                    <WhiteboardIcon name='new-board' />
                </Button>
                {toolOptions.map((t) => (
                    <Button
                        key={t}
                        variant={state.tool === t ? 'default' : 'outline'}
                        onClick={handleToolClick(t)}
                        className='h-10 w-10 p-0'
                        aria-label={t === 'erase' ? 'Eraser' : t === 'text' ? 'Add text' : t.charAt(0).toUpperCase() + t.slice(1)}
                        title={t === 'erase' ? 'Eraser' : t === 'text' ? 'Add text' : t.charAt(0).toUpperCase() + t.slice(1)}
                    >
                        <WhiteboardIcon name={t} />
                    </Button>
                ))}
                <div className='flex items-center gap-1 border-l border-gray-300 pl-3'>
                    <Button
                        variant='outline'
                        onClick={() => zoomBy(1 / 1.2)}
                        disabled={!fabricCanvas || zoom <= 0.1}
                        aria-label='Zoom out'
                        title='Zoom out'
                        className='h-10 w-10 p-0'
                    >
                        <WhiteboardIcon name='zoom-out' />
                    </Button>
                    <span className='min-w-12 text-center text-sm tabular-nums' aria-live='polite'>
                        {Math.round(zoom * 100)}%
                    </span>
                    <Button
                        variant='outline'
                        onClick={() => zoomBy(1.2)}
                        disabled={!fabricCanvas || zoom >= 4}
                        aria-label='Zoom in'
                        title='Zoom in'
                        className='h-10 w-10 p-0'
                    >
                        <WhiteboardIcon name='zoom-in' />
                    </Button>
                    <Button
                        variant='outline'
                        onClick={() => {
                            if (!fabricCanvas) return;
                            resetViewport();
                        }}
                        disabled={!fabricCanvas}
                        aria-label='Reset zoom and position'
                        title='Reset zoom and position'
                        className='h-10 px-2 text-xs'
                    >
                        Reset
                    </Button>
                </div>
                <div className='flex items-center gap-1 border-l border-gray-300 pl-3' aria-label='Pan canvas'>
                    <Button variant='outline' onClick={() => panBy(0, 100)} aria-label='Scroll canvas up' title='Scroll up' className='h-10 w-10 p-0'>
                        <WhiteboardIcon name='pan-up' />
                    </Button>
                    <Button variant='outline' onClick={() => panBy(100, 0)} aria-label='Scroll canvas left' title='Scroll left' className='h-10 w-10 p-0'>
                        <WhiteboardIcon name='pan-left' />
                    </Button>
                    <Button variant='outline' onClick={() => panBy(-100, 0)} aria-label='Scroll canvas right' title='Scroll right' className='h-10 w-10 p-0'>
                        <WhiteboardIcon name='pan-right' />
                    </Button>
                    <Button variant='outline' onClick={() => panBy(0, -100)} aria-label='Scroll canvas down' title='Scroll down' className='h-10 w-10 p-0'>
                        <WhiteboardIcon name='pan-down' />
                    </Button>
                </div>
                <Button
                    variant='outline'
                    onClick={handleUndo}
                    disabled={!historyAvailability.canUndo}
                    aria-label='Undo'
                    title='Undo'
                    className='h-10 w-10 p-0'
                >
                    <WhiteboardIcon name='undo' />
                </Button>
                <Button
                    variant='outline'
                    onClick={handleRedo}
                    disabled={!historyAvailability.canRedo}
                    aria-label='Redo'
                    title='Redo'
                    className='h-10 w-10 p-0'
                >
                    <WhiteboardIcon name='redo' />
                </Button>
                <Button
                    variant='outline'
                    onClick={handleSave}
                    disabled={!fabricCanvas}
                    aria-label='Save as PNG'
                    title='Save as PNG'
                    className='h-10 w-10 p-0'
                >
                    <WhiteboardIcon name='save' />
                </Button>
                <Button
                    variant='outline'
                    onClick={handleShare}
                    disabled={!fabricCanvas || !socketDetails?.clientId}
                    aria-label='Create and copy share link'
                    title='Create and copy share link'
                    className='h-10 w-10 p-0'
                >
                    <WhiteboardIcon name='share' />
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
            )}
            {(shareFeedback || connectionError) && (
                <div
                    className={`fixed left-14 right-4 top-2 z-[35] flex max-h-[40vh] items-center gap-2 overflow-auto rounded-lg border px-4 py-3 text-sm shadow-xl ${
                        connectionError || shareFeedbackIsError
                            ? 'border-red-300 bg-red-50 text-red-900'
                            : 'border-green-300 bg-green-50 text-green-900'
                    }`}
                    role={connectionError || shareFeedbackIsError ? 'alert' : 'status'}
                >
                    <span>{connectionError || shareFeedback}</span>
                    {shareLink && (
                        <input
                            aria-label='Whiteboard share link'
                            className='min-w-0 flex-1 rounded border border-current bg-white px-2 py-1'
                            readOnly
                            value={shareLink}
                            onFocus={(event) => event.currentTarget.select()}
                        />
                    )}
                    <button
                        type='button'
                        className='ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2'
                        aria-label='Dismiss notification'
                        title='Dismiss'
                        onClick={() => {
                            setShareFeedback(null);
                            setShareLink(null);
                            setShareFeedbackIsError(false);
                            clearConnectionError();
                        }}
                    >
                        <svg
                            aria-hidden='true'
                            className='h-4 w-4'
                            fill='none'
                            stroke='currentColor'
                            strokeLinecap='round'
                            strokeWidth='2'
                            viewBox='0 0 24 24'
                        >
                            <path d='m6 6 12 12M18 6 6 18' />
                        </svg>
                    </button>
                </div>
            )}
            <div
                ref={canvasHostRef}
                className='whiteboard-canvas-host h-[calc(100dvh-1rem)] min-h-[320px] w-full overflow-hidden rounded border border-gray-300'
            >
                <canvas
                    ref={canvasRef}
                    className='block'
                />
            </div>
            {socketDetails?.clientId && (
                <div className='fixed bottom-4 right-4 z-50 p-3 bg-black text-white text-sm rounded-xl shadow-xl opacity-90'>
                    🧩 Connected {' '}
                    {/* <span className='font-mono text-green-300'>
                        {socketDetails.clientId}
                    </span> */}
                </div>
            )}
        </div>
    );
};
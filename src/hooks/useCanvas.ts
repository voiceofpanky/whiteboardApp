import { useCallback, useEffect, useRef, useState } from 'react';
import { ActiveSelection, Canvas, FabricObject, IText, Point } from 'fabric';
import { ExtendedFabricObject } from '@/types/global.types';
import { generateId } from '@/components/Whiteboard/Whiteboard.utils';

export const useCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasHostRef = useRef<HTMLDivElement>(null);
    const canvasInstanceRef = useRef<Canvas | null>(null);
    const panModeRef = useRef(false);
    const panStartRef = useRef<{ x: number; y: number } | null>(null);
    const clipboardRef = useRef<FabricObject[]>([]);
    const pasteCountRef = useRef(0);
    const [fabricCanvas, setFabricCanvas] = useState<Canvas | null>(null);
    const [zoom, setZoom] = useState(1);

    const zoomBy = useCallback((factor: number) => {
        const canvas = canvasInstanceRef.current;
        if (!canvas) return;
        const nextZoom = Math.min(4, Math.max(0.1, canvas.getZoom() * factor));
        canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), nextZoom);
        setZoom(nextZoom);
    }, []);

    const panBy = useCallback((x: number, y: number) => {
        const canvas = canvasInstanceRef.current;
        if (!canvas) return;
        const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = canvas.viewportTransform;
        canvas.setViewportTransform([
            scaleX,
            skewY,
            skewX,
            scaleY,
            offsetX + x,
            offsetY + y,
        ]);
    }, []);

    const resetViewport = useCallback(() => {
        const canvas = canvasInstanceRef.current;
        if (!canvas) return;
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        setZoom(1);
    }, []);

    const setPanMode = useCallback((enabled: boolean) => {
        panModeRef.current = enabled;
        const canvas = canvasInstanceRef.current;
        if (canvas && !panStartRef.current) {
            canvas.upperCanvasEl.style.cursor = enabled ? 'grab' : '';
        }
    }, []);

    useEffect(() => {
        const init = () => {
            const canvasEl = canvasRef.current;
            const canvasHost = canvasHostRef.current;
            if (!canvasEl || !canvasHost) return;
            FabricObject.prototype.toObject = (function (toObject) {
                return function (this: FabricObject, properties: string[] = []) {
                    return toObject.call(this, [...properties, 'id']);
                };
            })(FabricObject.prototype.toObject);
            const canvas = new Canvas(canvasEl, {
                backgroundColor: '#fff',
            });
            canvasInstanceRef.current = canvas;
            const canvasElement = canvas.upperCanvasEl;
            const handleContextMenu = (event: MouseEvent) => event.preventDefault();
            const handleSelectStart = (event: Event) => event.preventDefault();
            const handleTouch = (event: TouchEvent) => {
                if (event.target === canvasElement) {
                    event.preventDefault();
                }
            };
            const handleWheel = (event: WheelEvent) => {
                event.preventDefault();
                if (event.ctrlKey || event.metaKey) {
                    const nextZoom = Math.min(4, Math.max(0.1, canvas.getZoom() * Math.exp(-event.deltaY * 0.002)));
                    canvas.zoomToPoint(new Point(event.offsetX, event.offsetY), nextZoom);
                    setZoom(nextZoom);
                } else {
                    const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = canvas.viewportTransform;
                    canvas.setViewportTransform([
                        scaleX,
                        skewY,
                        skewX,
                        scaleY,
                        offsetX - event.deltaX,
                        offsetY - event.deltaY,
                    ]);
                }
            };
            const handlePointerDown = (event: PointerEvent) => {
                if (!panModeRef.current && event.button !== 1) return;
                event.preventDefault();
                panStartRef.current = { x: event.clientX, y: event.clientY };
                canvasElement.setPointerCapture(event.pointerId);
                canvasElement.style.cursor = 'grabbing';
            };
            const handlePointerMove = (event: PointerEvent) => {
                const previous = panStartRef.current;
                if (!previous) return;
                const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = canvas.viewportTransform;
                canvas.setViewportTransform([
                    scaleX,
                    skewY,
                    skewX,
                    scaleY,
                    offsetX + event.clientX - previous.x,
                    offsetY + event.clientY - previous.y,
                ]);
                panStartRef.current = { x: event.clientX, y: event.clientY };
            };
            const handlePointerUp = () => {
                panStartRef.current = null;
                canvasElement.style.cursor = panModeRef.current ? 'grab' : '';
            };
            canvasElement.addEventListener('contextmenu', handleContextMenu);
            canvasElement.addEventListener('selectstart', handleSelectStart);
            canvasElement.addEventListener('touchstart', handleTouch, { passive: false });
            canvasElement.addEventListener('touchmove', handleTouch, { passive: false });
            canvasElement.addEventListener('wheel', handleWheel, { passive: false });
            canvasElement.addEventListener('pointerdown', handlePointerDown);
            canvasElement.addEventListener('pointermove', handlePointerMove);
            canvasElement.addEventListener('pointerup', handlePointerUp);
            canvasElement.addEventListener('pointercancel', handlePointerUp);
            const resize = () => {
                const { width, height } = canvasHost.getBoundingClientRect();
                if (width === 0 || height === 0) return;
                canvas.setDimensions({ width, height });
                canvas.renderAll();
            };
            resize();
            canvas.renderAll();
            // Add unique IDs to objects when they're created
            canvas.on('object:added', (e: { target: ExtendedFabricObject }) => {
                if (!e.target) return;
                if (!e.target.id) {
                    e.target.id = generateId();
                }
            });
            setFabricCanvas(canvas);
            const resizeObserver = new ResizeObserver(resize);
            resizeObserver.observe(canvasHost);
            const handleKeyDown = (e: KeyboardEvent) => {
                const target = e.target;
                const isEditableElement =
                    target instanceof HTMLElement &&
                    (target.isContentEditable ||
                        target instanceof HTMLInputElement ||
                        target instanceof HTMLTextAreaElement ||
                        target instanceof HTMLSelectElement);
                if (isEditableElement) return;

                const activeObject = canvas.getActiveObject();
                if (activeObject instanceof IText && activeObject.isEditing) return;

                const isCopy = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c';
                const isPaste = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';

                if (isCopy) {
                    const selectedObjects = canvas.getActiveObjects();
                    if (selectedObjects.length === 0) return;
                    e.preventDefault();
                    void Promise.all(selectedObjects.map((object) => object.clone()))
                        .then((objects) => {
                            clipboardRef.current = objects;
                            pasteCountRef.current = 0;
                        })
                        .catch((error: unknown) => {
                            console.error('Could not copy the selected whiteboard objects:', error);
                        });
                    return;
                }

                if (isPaste) {
                    if (clipboardRef.current.length === 0) return;
                    e.preventDefault();
                    const offset = 20 * ++pasteCountRef.current;
                    void Promise.all(clipboardRef.current.map((object) => object.clone()))
                        .then((objects) => {
                            objects.forEach((object) => {
                                object.set({
                                    left: (object.left ?? 0) + offset,
                                    top: (object.top ?? 0) + offset,
                                    selectable: true,
                                    evented: true,
                                });
                                const extendedObject = object as ExtendedFabricObject;
                                extendedObject.id = generateId();
                                delete extendedObject.__skipEmit;
                                object.setCoords();
                            });

                            canvas.discardActiveObject();
                            canvas.add(...objects);
                            if (objects.length === 1) {
                                canvas.setActiveObject(objects[0]);
                            } else {
                                canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
                            }
                            canvas.requestRenderAll();
                        })
                        .catch((error: unknown) => {
                            console.error('Could not paste the copied whiteboard objects:', error);
                        });
                    return;
                }

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    const selectedObjects = canvas.getActiveObjects();
                    if (selectedObjects.length > 0) {
                        canvas.remove(...selectedObjects);
                        canvas.discardActiveObject();
                        canvas.renderAll();
                    }
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                resizeObserver.disconnect();
                window.removeEventListener('keydown', handleKeyDown);
                clipboardRef.current = [];
                canvasElement.removeEventListener('contextmenu', handleContextMenu);
                canvasElement.removeEventListener('selectstart', handleSelectStart);
                canvasElement.removeEventListener('touchstart', handleTouch);
                canvasElement.removeEventListener('touchmove', handleTouch);
                canvasElement.removeEventListener('wheel', handleWheel);
                canvasElement.removeEventListener('pointerdown', handlePointerDown);
                canvasElement.removeEventListener('pointermove', handlePointerMove);
                canvasElement.removeEventListener('pointerup', handlePointerUp);
                canvasElement.removeEventListener('pointercancel', handlePointerUp);
                // Remove canvas event listeners
                canvas.off('object:added');
                if (canvas) {
                    canvas.dispose();
                    canvasInstanceRef.current = null;
                    setFabricCanvas(null);
                }
            };
        };
        const cleanup = init();
        return cleanup;
    }, []);
    return { canvasRef, canvasHostRef, fabricCanvas, zoom, zoomBy, panBy, resetViewport, setPanMode };
};
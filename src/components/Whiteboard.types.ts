import type { Tool } from './Toolbar/Toolbar.types';

export interface WhiteboardState {
    tool: Tool;
    brushColor: string;
    brushSize: number;
}

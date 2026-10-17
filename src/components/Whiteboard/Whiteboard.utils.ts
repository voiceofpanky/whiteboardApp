import { Pattern } from 'fabric';

export const generateId = () => `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createWhiteboardBackground = () => {
    const tile = document.createElement('canvas');
    tile.width = 24;
    tile.height = 24;

    const context = tile.getContext('2d');
    if (!context) {
        throw new Error('Could not create the whiteboard background pattern.');
    }

    context.fillStyle = '#fafaf8';
    context.fillRect(0, 0, tile.width, tile.height);
    context.fillStyle = '#d5d8d6';
    context.beginPath();
    context.arc(12, 12, 1, 0, Math.PI * 2);
    context.fill();

    return new Pattern({ source: tile });
};

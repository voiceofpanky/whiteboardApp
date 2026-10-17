# Whiteboard User Guide

This guide covers the drawing, editing, navigation, export, and collaboration
features available in the Interactive Whiteboard.

## Getting started

Open the whiteboard in a browser. Use the **Show toolbar** button in the
upper-left corner to open the toolbar; use it again to hide it and make more
room for the canvas. The toolbar can wrap or scroll on smaller screens.

The canvas is the large work area. Choose a tool from the toolbar, then use it
on the canvas. The selected tool is highlighted.

## Quick toolbar

A floating toolbar at the bottom of the screen provides quick access to common
actions:

- **Share link**: Create or reuse a link for the current board and copy it to
  the clipboard. Requires a connection to the whiteboard server.
- **Paste image**: Copy an image, then choose this button to add it at the center
  of the visible canvas. You can also paste an image with **Ctrl+V** on
  Windows/Linux or **Command+V** on macOS while the canvas is active. The image
  is added as a selectable canvas object.
- **Pencil**: Choose red, black, or green to start drawing with that color.
- **Select**: Select, move, or resize objects on the canvas.
- **Eraser**: Paint over existing content with white.
- **Pan**: Drag the canvas to move around without drawing.
- **Text**: Click the canvas to add a text object.

The image button uses browser clipboard access, which may require a secure
connection and clipboard permission. If it is unavailable, use the keyboard
paste shortcut on the canvas instead.

## Drawing and editing

### Tools

- **Select**: Select objects on the canvas. Drag selected objects to move them;
  use the selection handles to resize or rotate them. You can select multiple
  objects using the canvas selection behavior.
- **Pan**: Drag the canvas to move around without drawing.
- **Text**: Click the canvas to add a text object, then type. Click elsewhere
  when you are finished editing. Empty text is discarded.
- **Draw**: Draw freehand strokes.
- **Rectangle**, **Line**, and **Ellipse**: Click and drag to create the shape.
- **Eraser**: Draw over marks with a white stroke. This paints over content; it
  does not remove selected objects.
- **Clear**: Clears the entire canvas and restores its white background. This
  takes effect as soon as you choose the tool.

The **Color** control sets the color used for drawing and shapes. The **Size**
slider sets the stroke width, from 1 to 20. The eraser uses white regardless of
the selected color.

To remove objects, select them and press **Delete** or **Backspace**. To copy
and duplicate selected objects, use **Ctrl+C** then **Ctrl+V** on Windows/Linux,
or **Command+C** then **Command+V** on macOS. Each paste is offset slightly
from the previous one. These shortcuts apply while focus is outside text or
other editable controls.

## Undo and redo

Use **Undo** and **Redo** in the toolbar to move through the current board's
editing history. The buttons are disabled when there is no earlier or later
change to restore.

## Moving around the canvas

- Use **Zoom in** and **Zoom out** in the toolbar. The displayed percentage
  shows the current zoom; the supported range is 10% to 400%.
- Choose **Reset** to restore the default zoom and canvas position.
- Use the four arrow controls in the toolbar to pan the canvas in fixed steps.
- Scroll over the canvas to pan. Hold **Ctrl** (Windows/Linux) or **Command**
  (macOS) while scrolling to zoom around the pointer.
- Choose the **Pan** tool and drag with the primary mouse button, or drag with
  the middle mouse button while using another tool.

## Saving an image

Choose **Save as PNG** in the toolbar to download a snapshot of the canvas as
`whiteboard.png`.

## Sharing and working together

The whiteboard connects to a shared-room server. When connected, use **Create
and copy share link** to create or reuse a room link. Share that URL with other
people to let them open the same board. If the browser cannot copy the URL
automatically, the link is shown on screen so you can select and copy it.

Use **Create new whiteboard** to start a separate, blank room with its own
share link. The current room's board and chat remain associated with its own
link.

When someone joins a room for the first time in that browser, the app asks for
a display name. The name is remembered in that browser for that specific room,
so rejoining or refreshing the same link does not ask again. A different room
has its own saved name and asks once the first time it is joined. Cancelling
the prompt or leaving the name blank joins as **Guest**.

Changes to the shared canvas are sent to other people in that room. The server
stores the latest board state and up to the latest 200 chat messages for each
room. They can be restored when the share link is reopened, including after a
page refresh. Persistence across server restarts depends on the socket server
being configured with persistent storage.

### Chat and participants

Open the right-side panel using its **Chat** tab to read and send messages.
Messages show the sender and time; each message can contain up to 1,000
characters. The app retains the latest 200 messages per room. Chat is available
when connected to a shared room.

Choose **Participants** in the same panel to see the people currently connected
to the room. This list reflects current connections; someone who closes or
leaves the board is no longer shown.

## Connection and notifications

The **Connected** indicator shows when the app has a live connection to the
whiteboard server. Sharing, joining, live updates, and chat require that
connection. Status and error messages appear near the top of the page. Dismiss
a notification with its close button.

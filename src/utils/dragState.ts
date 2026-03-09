/** Module-level drag state — readable during dragover (unlike dataTransfer.getData) */
export const activeDrag: {
  type: 'task' | 'block' | 'event' | null;
  duration: number;
  color: string;
  id: string;
} = {
  type: null,
  duration: 15,
  color: '#8DA286',
  id: '',
};

// ── Pointer-based drag system (works in Tauri + browser) ──────────────────

export interface DropZoneHandlers {
  onOver: (clientX: number, clientY: number) => void;
  onLeave: () => void;
  onDrop: (clientX: number, clientY: number) => void;
}

const dropZones = new Map<HTMLElement, DropZoneHandlers>();
let currentZone: HTMLElement | null = null;
let ghost: HTMLElement | null = null;
let dragActive = false;
let startX = 0;
let startY = 0;
const DRAG_THRESHOLD = 4;

export function registerDropZone(el: HTMLElement, handlers: DropZoneHandlers) {
  dropZones.set(el, handlers);
}

export function unregisterDropZone(el: HTMLElement) {
  dropZones.delete(el);
}

export function isDragActive() {
  return dragActive;
}

function findDropZone(clientX: number, clientY: number): [HTMLElement, DropZoneHandlers] | null {
  // elementFromPoint to find what's under cursor
  if (ghost) ghost.style.display = 'none';
  const el = document.elementFromPoint(clientX, clientY);
  if (ghost) ghost.style.display = '';
  if (!el) return null;
  for (const [zone, handlers] of dropZones) {
    if (zone.contains(el)) return [zone, handlers];
  }
  return null;
}

export interface PointerDragOptions {
  type: 'task' | 'block' | 'event';
  id: string;
  duration: number;
  color: string;
  title: string;
  createGhost: () => HTMLElement;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * Call from onPointerDown on a draggable element.
 * Handles the full drag lifecycle via pointer events.
 */
export function initPointerDrag(
  e: PointerEvent | { button: number; clientX: number; clientY: number },
  opts: PointerDragOptions,
) {
  // Only primary button
  if (e.button !== 0) return;

  startX = e.clientX;
  startY = e.clientY;
  dragActive = false;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!dragActive && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    if (!dragActive) {
      dragActive = true;
      activeDrag.type = opts.type;
      activeDrag.id = opts.id;
      activeDrag.duration = opts.duration;
      activeDrag.color = opts.color;
      opts.onDragStart?.();

      // Create ghost
      ghost = opts.createGhost();
      ghost.style.position = 'fixed';
      ghost.style.zIndex = '99999';
      ghost.style.pointerEvents = 'none';
      ghost.style.transform = 'translate(-50%, -50%)';
      ghost.style.transition = 'none';
      document.body.appendChild(ghost);
    }

    // Move ghost
    if (ghost) {
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
    }

    // Find drop zone under cursor
    const found = findDropZone(ev.clientX, ev.clientY);
    if (found) {
      const [zone, handlers] = found;
      if (currentZone && currentZone !== zone) {
        const prevHandlers = dropZones.get(currentZone);
        prevHandlers?.onLeave();
      }
      currentZone = zone;
      handlers.onOver(ev.clientX, ev.clientY);
    } else if (currentZone) {
      const prevHandlers = dropZones.get(currentZone);
      prevHandlers?.onLeave();
      currentZone = null;
    }
  };

  const onUp = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);

    if (dragActive) {
      // Find drop zone and trigger drop
      const found = findDropZone(ev.clientX, ev.clientY);
      if (found) {
        const [, handlers] = found;
        handlers.onDrop(ev.clientX, ev.clientY);
      }
      if (currentZone) {
        const prevHandlers = dropZones.get(currentZone);
        prevHandlers?.onLeave();
        currentZone = null;
      }

      // Clean up ghost
      if (ghost) {
        ghost.remove();
        ghost = null;
      }

      activeDrag.type = null;
      activeDrag.id = '';
      dragActive = false;
      opts.onDragEnd?.();
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

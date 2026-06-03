import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';

// ============================================================================
// Types
// ============================================================================

type ToolType =
  | 'point'
  | 'line'
  | 'circle'
  | 'triangle'
  | 'rectangle'
  | 'freedraw';

interface Point {
  x: number;
  y: number;
}

interface ShapeBase {
  id: string;
  color: string;
  lineWidth: number;
}

interface PointShape extends ShapeBase {
  type: 'point';
  x: number;
  y: number;
}

interface LineShape extends ShapeBase {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface CircleShape extends ShapeBase {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
}

interface TriangleShape extends ShapeBase {
  type: 'triangle';
  vertices: [Point, Point, Point];
}

interface RectangleShape extends ShapeBase {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FreeDrawShape extends ShapeBase {
  type: 'freedraw';
  points: Point[];
}

type DrawingShape =
  | PointShape
  | LineShape
  | CircleShape
  | TriangleShape
  | RectangleShape
  | FreeDrawShape;

interface GeometryBoardProps {
  onSave: (base64: string) => void;
  onClose: () => void;
}

// Drawing state stored in refs for smooth 60fps rendering
interface DrawingState {
  isDrawing: boolean;
  start: Point | null;
  preview: Point | null;
  freeDrawPoints: Point[];
  triangleVertices: Point[];
}

// ============================================================================
// Constants
// ============================================================================

const GRID_SIZE = 30;
const DEFAULT_LINE_WIDTH = 2;
const POINT_RADIUS = 4;
const CLICK_THRESHOLD = 5; // pixels — below this is a click, above is a drag

// Dark theme palette
const THEME = {
  overlay: 'rgba(0, 0, 0, 0.65)',
  panelBg: '#0D1117',
  panelBorder: '#1C2332',
  canvasBg: '#121722',
  gridLine: '#1C2332',
  toolbarBg: '#1C2332',
  brandBlue: '#2584FF',
  brandBlueHover: '#1A6BE0',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  textMuted: '#484F58',
  buttonBg: '#161B22',
  buttonHover: '#1C2332',
  activeBg: '#1F6FEB33',
  inputBg: '#0D1117',
  inputBorder: '#30363D',
  dangerRed: '#F85149',
  dangerRedHover: '#DA3633',
};

// ============================================================================
// Utility functions
// ============================================================================

let _idCounter = 0;
function generateId(): string {
  return `shape_${++_idCounter}_${Date.now()}`;
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function snapPoint(p: Point, gridSize: number): Point {
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  };
}

// ============================================================================
// Shape rendering helpers (pure functions — no React deps)
// ============================================================================

function renderShape(ctx: CanvasRenderingContext2D, shape: DrawingShape): void {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (shape.type) {
    case 'point':
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, POINT_RADIUS + shape.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(shape.vertices[0].x, shape.vertices[0].y);
      ctx.lineTo(shape.vertices[1].x, shape.vertices[1].y);
      ctx.lineTo(shape.vertices[2].x, shape.vertices[2].y);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'rectangle':
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      break;
    case 'freedraw':
      if (shape.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.stroke();
      }
      break;
  }

  ctx.restore();
}

function renderPreview(
  ctx: CanvasRenderingContext2D,
  ds: DrawingState,
  tool: ToolType,
  color: string,
  lineWidth: number,
): void {
  if (!ds.isDrawing && tool !== 'triangle') return;
  if (tool === 'point') return; // no preview needed for points

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([6, 4]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (tool) {
    case 'line':
      if (ds.start && ds.preview) {
        ctx.beginPath();
        ctx.moveTo(ds.start.x, ds.start.y);
        ctx.lineTo(ds.preview.x, ds.preview.y);
        ctx.stroke();
      }
      break;
    case 'circle':
      if (ds.start && ds.preview) {
        const r = distance(ds.start, ds.preview);
        ctx.beginPath();
        ctx.arc(ds.start.x, ds.start.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'rectangle':
      if (ds.start && ds.preview) {
        const x = Math.min(ds.start.x, ds.preview.x);
        const y = Math.min(ds.start.y, ds.preview.y);
        const w = Math.abs(ds.preview.x - ds.start.x);
        const h = Math.abs(ds.preview.y - ds.start.y);
        ctx.strokeRect(x, y, w, h);
      }
      break;
    case 'triangle': {
      const verts = ds.triangleVertices;
      const preview = ds.preview;
      if (verts.length === 0) break;
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y);
      if (verts.length >= 2) {
        ctx.lineTo(verts[1].x, verts[1].y);
      }
      if (preview) {
        ctx.lineTo(preview.x, preview.y);
      }
      if (verts.length === 2) {
        ctx.closePath();
      }
      ctx.stroke();
      // Draw vertex markers
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      verts.forEach((v) => {
        ctx.beginPath();
        ctx.arc(v.x, v.y, POINT_RADIUS + lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'freedraw':
      if (ds.freeDrawPoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(ds.freeDrawPoints[0].x, ds.freeDrawPoints[0].y);
        for (let i = 1; i < ds.freeDrawPoints.length; i++) {
          ctx.lineTo(ds.freeDrawPoints[i].x, ds.freeDrawPoints[i].y);
        }
        ctx.stroke();
      }
      break;
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ============================================================================
// Tool definitions
// ============================================================================

interface ToolDef {
  type: ToolType;
  label: string;
  icon: React.ReactNode;
}

const TOOLS: ToolDef[] = [
  {
    type: 'point',
    label: '点',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="4" fill="currentColor" />
      </svg>
    ),
  },
  {
    type: 'line',
    label: '线段',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <line x1="2" y1="16" x2="16" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: 'circle',
    label: '圆',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    type: 'triangle',
    label: '三角形',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <polygon points="9,1 17,17 1,17" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: 'rectangle',
    label: '矩形',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="3" width="14" height="12" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    type: 'freedraw',
    label: '画笔',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 15L4 11L15.5 2.5C16.33 1.67 17.5 3 16.5 4L8 12L3 15Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

// ============================================================================
// Component
// ============================================================================

export default function GeometryBoard({ onSave, onClose }: GeometryBoardProps) {
  // ---- UI state -----------------------------------------------------------
  const [isOpen, setIsOpen] = useState(false);
  const [tool, setTool] = useState<ToolType>('line');
  const [color, setColor] = useState('#2584FF');
  const [lineWidth, setLineWidth] = useState(DEFAULT_LINE_WIDTH);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [cursorPos, setCursorPos] = useState<Point>({ x: 0, y: 0 });

  // ---- Drawing data (state — triggers re-render) --------------------------
  const [shapes, setShapes] = useState<DrawingShape[]>([]);
  const [undoStack, setUndoStack] = useState<DrawingShape[][]>([]);

  // ---- Refs ---------------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const drawingRef = useRef<DrawingState>({
    isDrawing: false,
    start: null,
    preview: null,
    freeDrawPoints: [],
    triangleVertices: [],
  });

  // Stable refs for values consumed inside the animation loop
  const toolRef = useRef<ToolType>(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;
  const lwRef = useRef(lineWidth);
  lwRef.current = lineWidth;
  const gridRef = useRef(showGrid);
  gridRef.current = showGrid;
  const snapRef = useRef(snapToGrid);
  snapRef.current = snapToGrid;
  const shapesRef = useRef<DrawingShape[]>(shapes);
  shapesRef.current = shapes;

  // ---- Canvas coordinate helper -------------------------------------------
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const raw = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      return snapRef.current ? snapPoint(raw, GRID_SIZE) : raw;
    },
    [],
  );

  // ---- Mutation helper for shapes -----------------------------------------
  const addShape = useCallback((shape: DrawingShape) => {
    setShapes((prev) => [...prev, shape]);
    setUndoStack((prev) => [...prev, prev[prev.length - 1] ?? []]);
  }, []);

  // ---- Animation loop -----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Handle DPI and resize
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = THEME.canvasBg;
      ctx.fillRect(0, 0, w, h);

      // Grid
      if (gridRef.current) {
        ctx.strokeStyle = THEME.gridLine;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        for (let gx = 0; gx <= w; gx += GRID_SIZE) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, h);
          ctx.stroke();
        }
        for (let gy = 0; gy <= h; gy += GRID_SIZE) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(w, gy);
          ctx.stroke();
        }
      }

      // Shapes
      for (const shape of shapesRef.current) {
        renderShape(ctx, shape);
      }

      // Preview
      renderPreview(ctx, drawingRef.current, toolRef.current, colorRef.current, lwRef.current);

      ctx.restore();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isOpen]);

  // ---- Mouse event handlers -----------------------------------------------
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasCoords(e);
      drawingRef.current.start = pos;

      if (toolRef.current === 'point' || toolRef.current === 'triangle') {
        drawingRef.current.isDrawing = true;
        drawingRef.current.preview = pos;
        return;
      }

      drawingRef.current.isDrawing = true;
      drawingRef.current.preview = pos;

      if (toolRef.current === 'freedraw') {
        drawingRef.current.freeDrawPoints = [pos];
      }
    },
    [getCanvasCoords],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasCoords(e);
      setCursorPos(pos);

      if (drawingRef.current.isDrawing && toolRef.current === 'freedraw') {
        drawingRef.current.freeDrawPoints = [...drawingRef.current.freeDrawPoints, pos];
      }

      drawingRef.current.preview = pos;
    },
    [getCanvasCoords],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasCoords(e);
      const ds = drawingRef.current;
      const start = ds.start;
      const c = colorRef.current;
      const lw = lwRef.current;
      const t = toolRef.current;

      if (t === 'point') {
        if (start && distance(start, pos) < CLICK_THRESHOLD) {
          addShape({
            id: generateId(),
            type: 'point',
            x: pos.x,
            y: pos.y,
            color: c,
            lineWidth: lw,
          });
        }
      } else if (t === 'triangle') {
        if (start && distance(start, pos) < CLICK_THRESHOLD) {
          const verts: Point[] = [...ds.triangleVertices, pos];
          if (verts.length === 3) {
            addShape({
              id: generateId(),
              type: 'triangle',
              vertices: verts as [Point, Point, Point],
              color: c,
              lineWidth: lw,
            });
            ds.triangleVertices = [];
          } else {
            ds.triangleVertices = verts;
          }
        }
      } else if (ds.isDrawing && start) {
        let newShape: DrawingShape | null = null;

        switch (t) {
          case 'line':
            if (distance(start, pos) > CLICK_THRESHOLD) {
              newShape = {
                id: generateId(),
                type: 'line',
                x1: start.x,
                y1: start.y,
                x2: pos.x,
                y2: pos.y,
                color: c,
                lineWidth: lw,
              };
            }
            break;
          case 'circle': {
            const r = distance(start, pos);
            if (r > CLICK_THRESHOLD) {
              newShape = {
                id: generateId(),
                type: 'circle',
                cx: start.x,
                cy: start.y,
                radius: r,
                color: c,
                lineWidth: lw,
              };
            }
            break;
          }
          case 'rectangle': {
            const dw = Math.abs(pos.x - start.x);
            const dh = Math.abs(pos.y - start.y);
            if (dw > CLICK_THRESHOLD && dh > CLICK_THRESHOLD) {
              newShape = {
                id: generateId(),
                type: 'rectangle',
                x: Math.min(start.x, pos.x),
                y: Math.min(start.y, pos.y),
                width: dw,
                height: dh,
                color: c,
                lineWidth: lw,
              };
            }
            break;
          }
          case 'freedraw': {
            const pts = [...ds.freeDrawPoints, pos];
            if (pts.length > 1) {
              newShape = {
                id: generateId(),
                type: 'freedraw',
                points: pts,
                color: c,
                lineWidth: lw,
              };
            }
            ds.freeDrawPoints = [];
            break;
          }
        }

        if (newShape) {
          addShape(newShape);
        }
      }

      // Reset drawing state
      ds.isDrawing = false;
      ds.start = null;
      ds.preview = null;
    },
    [addShape, getCanvasCoords],
  );

  const handleMouseLeave = useCallback(() => {
    setCursorPos({ x: -1, y: -1 });
  }, []);

  // ---- Actions ------------------------------------------------------------
  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setShapes(restored);
      return prev.slice(0, -1);
    });
  }, []);

  const handleClear = useCallback(() => {
    setShapes([]);
    setUndoStack([]);
    drawingRef.current.triangleVertices = [];
    drawingRef.current.freeDrawPoints = [];
  }, []);

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Render one final frame without preview/drawing state
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Create an off-screen canvas for clean export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w * dpr;
    exportCanvas.height = h * dpr;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) return;

    exportCtx.scale(dpr, dpr);

    // Background
    exportCtx.fillStyle = THEME.canvasBg;
    exportCtx.fillRect(0, 0, w, h);

    // Grid
    if (showGrid) {
      exportCtx.strokeStyle = THEME.gridLine;
      exportCtx.lineWidth = 1;
      for (let gx = 0; gx <= w; gx += GRID_SIZE) {
        exportCtx.beginPath();
        exportCtx.moveTo(gx, 0);
        exportCtx.lineTo(gx, h);
        exportCtx.stroke();
      }
      for (let gy = 0; gy <= h; gy += GRID_SIZE) {
        exportCtx.beginPath();
        exportCtx.moveTo(0, gy);
        exportCtx.lineTo(w, gy);
        exportCtx.stroke();
      }
    }

    // Shapes only (no preview)
    for (const shape of shapes) {
      renderShape(exportCtx, shape);
    }

    const dataUrl = exportCanvas.toDataURL('image/png');
    onSave(dataUrl);
  }, [shapes, showGrid, onSave]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    onClose();
  }, [onClose]);

  // ---- Keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, handleUndo, handleClose]);

  // ---- Styles -------------------------------------------------------------
  const styles = useMemo(
    () => ({
      trigger: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        background: THEME.brandBlue,
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'inherit',
        transition: 'background 0.2s',
      } as React.CSSProperties,
      overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: THEME.overlay,
        padding: 24,
      } as React.CSSProperties,
      panel: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 1000,
        height: '90vh',
        maxHeight: 720,
        background: THEME.panelBg,
        border: `1px solid ${THEME.panelBorder}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      } as React.CSSProperties,
      header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: `1px solid ${THEME.panelBorder}`,
      } as React.CSSProperties,
      headerTitle: {
        fontSize: 15,
        fontWeight: 600,
        color: THEME.textPrimary,
      } as React.CSSProperties,
      closeBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        color: THEME.textSecondary,
        cursor: 'pointer',
        fontSize: 18,
        transition: 'background 0.15s',
      } as React.CSSProperties,
      toolbar: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: THEME.toolbarBg,
        borderBottom: `1px solid ${THEME.panelBorder}`,
      } as React.CSSProperties,
      toolBtn: (active: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        background: active ? THEME.activeBg : THEME.buttonBg,
        color: active ? THEME.brandBlue : THEME.textSecondary,
        border: `1px solid ${active ? THEME.brandBlue : THEME.inputBorder}`,
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }),
      divider: {
        width: 1,
        height: 24,
        background: THEME.inputBorder,
        margin: '0 4px',
      } as React.CSSProperties,
      colorInput: {
        width: 28,
        height: 28,
        padding: 0,
        border: `2px solid ${THEME.inputBorder}`,
        borderRadius: 4,
        background: 'transparent',
        cursor: 'pointer',
        outline: 'none',
      } as React.CSSProperties,
      lineWidthSelect: {
        height: 28,
        padding: '0 8px',
        background: THEME.buttonBg,
        color: THEME.textPrimary,
        border: `1px solid ${THEME.inputBorder}`,
        borderRadius: 6,
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
        outline: 'none',
      } as React.CSSProperties,
      toggleBtn: (active: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 10px',
        background: active ? THEME.activeBg : THEME.buttonBg,
        color: active ? THEME.brandBlue : THEME.textSecondary,
        border: `1px solid ${active ? THEME.brandBlue : THEME.inputBorder}`,
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }),
      actionBtn: (danger?: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 10px',
        background: danger ? 'transparent' : THEME.buttonBg,
        color: danger ? THEME.dangerRed : THEME.textSecondary,
        border: `1px solid ${danger ? THEME.dangerRed : THEME.inputBorder}`,
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }),
      canvasContainer: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        margin: 0,
        background: THEME.canvasBg,
      } as React.CSSProperties,
      canvas: {
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
      } as React.CSSProperties,
      statusBar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        background: THEME.toolbarBg,
        borderTop: `1px solid ${THEME.panelBorder}`,
        fontSize: 12,
        color: THEME.textSecondary,
        fontFamily: 'monospace',
      } as React.CSSProperties,
      statusHint: {
        color: THEME.textMuted,
      } as React.CSSProperties,
      footer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
        padding: '10px 16px',
        borderTop: `1px solid ${THEME.panelBorder}`,
      } as React.CSSProperties,
      primaryBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 18px',
        background: THEME.brandBlue,
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'inherit',
      } as React.CSSProperties,
      secondaryBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 18px',
        background: THEME.buttonBg,
        color: THEME.textPrimary,
        border: `1px solid ${THEME.inputBorder}`,
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        fontFamily: 'inherit',
      } as React.CSSProperties,
    }),
    [],
  );

  // ---- Help text per tool -------------------------------------------------
  const toolHint = useMemo(() => {
    switch (tool) {
      case 'point':
        return '点击画布放置点';
      case 'line':
        return '拖拽绘制线段';
      case 'circle':
        return '拖拽定义圆心和半径';
      case 'triangle':
        return `点击 3 个顶点 (已选 ${drawingRef.current.triangleVertices.length}/3)`;
      case 'rectangle':
        return '拖拽绘制矩形';
      case 'freedraw':
        return '按住拖拽自由绘制';
    }
  }, [tool]);

  // ---- Render -------------------------------------------------------------
  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        style={styles.trigger}
        onClick={() => setIsOpen(true)}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = THEME.brandBlueHover;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = THEME.brandBlue;
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 2h5l3 12H5L2 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M7 2l3 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="3.5" cy="8" r="1.5" fill="currentColor" />
          <circle cx="9" cy="5.5" r="1.5" fill="currentColor" />
        </svg>
        打开几何画板
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          style={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div style={styles.panel}>
            {/* Header */}
            <div style={styles.header}>
              <span style={styles.headerTitle}>几何画板</span>
              <button
                type="button"
                style={styles.closeBtn}
                onClick={handleClose}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = THEME.buttonBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title="关闭 (Esc)"
              >
                X
              </button>
            </div>

            {/* Toolbar */}
            <div style={styles.toolbar}>
              {TOOLS.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  style={styles.toolBtn(tool === t.type)}
                  onClick={() => {
                    setTool(t.type);
                    drawingRef.current.triangleVertices = [];
                  }}
                  title={t.label}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}

              <div style={styles.divider} />

              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={styles.colorInput}
                title="颜色"
              />

              <select
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                style={styles.lineWidthSelect}
                title="线宽"
              >
                {[1, 2, 3, 4, 6, 8].map((w) => (
                  <option key={w} value={w}>
                    {w}px
                  </option>
                ))}
              </select>

              <div style={styles.divider} />

              <button
                type="button"
                style={styles.toggleBtn(showGrid)}
                onClick={() => setShowGrid((v) => !v)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="4" height="4" stroke="currentColor" strokeWidth="1.5" />
                  <rect x="7" y="1" width="4" height="4" stroke="currentColor" strokeWidth="1.5" />
                  <rect x="1" y="7" width="4" height="4" stroke="currentColor" strokeWidth="1.5" />
                  <rect x="7" y="7" width="4" height="4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                网格 {showGrid ? 'ON' : 'OFF'}
              </button>

              {showGrid && (
                <button
                  type="button"
                  style={styles.toggleBtn(snapToGrid)}
                  onClick={() => setSnapToGrid((v) => !v)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="6" y1="3" x2="6" y2="9" stroke="currentColor" strokeWidth="0.8" />
                    <line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="0.8" />
                  </svg>
                  吸附
                </button>
              )}

              <div style={styles.divider} />

              <button
                type="button"
                style={styles.actionBtn()}
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                title="撤销 (Ctrl+Z)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 3L1 5L3 7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M1 5H8C9.66 5 11 6.34 11 8V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                撤销
              </button>

              <button
                type="button"
                style={styles.actionBtn(true)}
                onClick={handleClear}
                title="清除全部"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 3h8M4.5 3V2h3v1M3 3l.5 7.5h5L9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                清除
              </button>

              <div style={{ flex: 1 }} />

              <span style={{ fontSize: 12, color: THEME.textMuted, whiteSpace: 'nowrap' }}>
                Ctrl+Z 撤销 · Esc 关闭
              </span>
            </div>

            {/* Canvas */}
            <div style={styles.canvasContainer}>
              <canvas
                ref={canvasRef}
                style={styles.canvas}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
              />
            </div>

            {/* Status bar */}
            <div style={styles.statusBar}>
              <span style={styles.statusHint}>{toolHint}</span>
              <span>
                x: {cursorPos.x >= 0 ? cursorPos.x.toFixed(0) : '—'},{' '}
                y: {cursorPos.y >= 0 ? cursorPos.y.toFixed(0) : '—'}
                {'  |  '}
                图形: {shapes.length}
              </span>
            </div>

            {/* Footer */}
            <div style={styles.footer}>
              <button type="button" style={styles.secondaryBtn} onClick={handleClose}>
                取消
              </button>
              <button type="button" style={styles.primaryBtn} onClick={handleExport}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 1v8M4 6l3 3 3-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M1 9v2a2 2 0 002 2h8a2 2 0 002-2V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                导出并保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

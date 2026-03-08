import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Constants / Factors that affect the graph strcuture
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4.0;

const CHILD_COLORS = [
    "#FF3CAC", "#00F5FF", "#FFEA00", "#7B2FFF",
    "#00FF87", "#FF6B35", "#FF007F", "#39FF14",
    "#BF5FFF", "#00BFFF",
];

const ROOT_W = 230, ROOT_H = 170;
const NODE_W = 200, NODE_H = 160;
const LEVEL_GAP_X = 360;  // horizontal distance between levels
const NODE_PAD_Y = 40;    // minimum vertical padding between nodes

// Math helpers
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// Layout: Reingold-Tilford style — no overlaps ever
function layoutTree(root, expandedData) {
    const positions = {};
    let colorIdx = 0;

    // compute the total subtree height for each node (recursively)
    function subtreeHeight(node, depth) {
        const h = depth === 0 ? ROOT_H : NODE_H;
        const childrenToShow = depth === 0
            ? (node.children || [])
            : (expandedData[node.id]?.children || []);
        if (childrenToShow.length === 0) return h;
        // Sum of all children subtree heights + padding between them
        const total = childrenToShow.reduce((sum, c) => sum + subtreeHeight(c, depth + 1), 0)
            + (childrenToShow.length - 1) * NODE_PAD_Y;
        return Math.max(h, total);
    }

    // place nodes, centering each parent against its children's total span
    function place(node, x, centerY, parentId, depth) {
        const w = depth === 0 ? ROOT_W : NODE_W;
        const h = depth === 0 ? ROOT_H : NODE_H;
        const color = depth === 0 ? "#ffffff" : CHILD_COLORS[colorIdx++ % CHILD_COLORS.length];

        positions[node.id] = { x, y: centerY - h / 2, node, parentId, depth, color, w, h };

        const childrenToShow = depth === 0
            ? (node.children || [])
            : (expandedData[node.id]?.children || []);

        if (childrenToShow.length === 0) return;

        // Total span of all children subtrees
        const spans = childrenToShow.map(c => subtreeHeight(c, depth + 1));
        const totalSpan = spans.reduce((s, v) => s + v, 0) + (childrenToShow.length - 1) * NODE_PAD_Y;

        let curY = centerY - totalSpan / 2;
        childrenToShow.forEach((child, i) => {
            const span = spans[i];
            place(child, x + LEVEL_GAP_X, curY + span / 2, node.id, depth + 1);
            curY += span + NODE_PAD_Y;
        });
    }

    place(root, 0, 0, null, 0);
    return positions;
}

// Curved SVG path between two rects
function cubicBezierPath(x1, y1, x2, y2) {
    const cpx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cpx} ${y1}, ${cpx} ${y2}, ${x2} ${y2}`;
}

// Minimap
function Minimap({ positions, zoom, panX, panY, vw, vh, focusedId }) {
    const MM_W = 180, MM_H = 120;
    if (Object.keys(positions).length === 0) return null;

    const xs = Object.values(positions).map(p => p.x);
    const ys = Object.values(positions).map(p => p.y);
    const minX = Math.min(...xs) - 50, maxX = Math.max(...xs) + NODE_W + 50;
    const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + NODE_H + 50;
    const worldW = maxX - minX || 1, worldH = maxY - minY || 1;
    const scale = Math.min(MM_W / worldW, MM_H / worldH);

    const toMM = (wx, wy) => ({
        mx: (wx - minX) * scale,
        my: (wy - minY) * scale,
    });

    // viewport rect in minimap space
    const vpW = vw / zoom * scale, vpH = vh / zoom * scale;
    const vpX = (-panX / zoom - minX) * scale;
    const vpY = (-panY / zoom - minY) * scale;

    return (
        <div style={{
            position: "absolute", bottom: 70, right: 22, zIndex: 60,
            width: MM_W + 2, height: MM_H + 2,
            background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, overflow: "hidden",
            backdropFilter: "blur(10px)",
        }}>
            <svg width={MM_W} height={MM_H} style={{ display: "block" }}>
                {/* edges */}
                {Object.values(positions).map(({ x, y, parentId, w, h, color }) => {
                    if (!parentId) return null;
                    const par = positions[parentId];
                    if (!par) return null;
                    const { mx: x1, my: y1 } = toMM(par.x + par.w, par.y + par.h / 2);
                    const { mx: x2, my: y2 } = toMM(x, y + h / 2);
                    return <path key={`e-${parentId}-${x}-${y}`} d={cubicBezierPath(x1, y1, x2, y2)}
                        fill="none" stroke={`${color}50`} strokeWidth={1} />;
                })}
                {/* nodes */}
                {Object.values(positions).map(({ x, y, node, w, h, color }) => {
                    const { mx, my } = toMM(x, y);
                    const nw = w * scale, nh = h * scale;
                    const isFocus = node.id === focusedId;
                    return <rect key={node.id} x={mx} y={my} width={Math.max(nw, 4)} height={Math.max(nh, 3)}
                        rx={2} fill={isFocus ? color : `${color}30`}
                        stroke={isFocus ? color : `${color}60`} strokeWidth={isFocus ? 1.5 : 0.5} />;
                })}
                {/* viewport */}
                <rect x={vpX} y={vpY} width={vpW} height={vpH}
                    fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.3)" strokeWidth={1} rx={2} />
            </svg>
        </div>
    );
}

// Breadcrumb (Navigation Part on the top middle of canvas)
function Breadcrumb({ positions, focusedId, onFocus }) {
    if (!focusedId || !positions[focusedId]) return null;

    // Build path from root to focused
    const path = [];
    let cur = focusedId;
    while (cur) {
        const p = positions[cur];
        if (!p) break;
        path.unshift({ id: cur, title: p.node.title, color: p.color });
        cur = p.parentId;
    }

    return (
        <div style={{
            position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
            zIndex: 60, display: "flex", alignItems: "center", gap: 0,
            background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "5px 12px",
            backdropFilter: "blur(12px)",
            maxWidth: "60vw", overflow: "hidden",
        }}>
            {path.map((item, i) => (
                <span key={item.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    {i > 0 && <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, margin: "0 6px" }}>›</span>}
                    <button onClick={() => onFocus(item.id)} style={{
                        background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
                        fontFamily: "'Permanent Marker', cursive", fontSize: 10,
                        color: i === path.length - 1 ? item.color : "rgba(255,255,255,0.45)",
                        whiteSpace: "nowrap",
                        textShadow: i === path.length - 1 ? `0 0 12px ${item.color}60` : "none",
                        transition: "color 0.2s",
                    }}>
                        {item.title.length > 18 ? item.title.slice(0, 16) + "…" : item.title}
                    </button>
                </span>
            ))}
        </div>
    );
}

// Main component
export default function GraphDashboardSimpleJSON() {
    const wrapRef = useRef(null);
    const svgRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const graphData = location.state || null;

    const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
    const [rootNode] = useState(graphData || {});
    const [expandedData, setExpandedData] = useState({});
    const [expandingIds, setExpandingIds] = useState(new Set());
    const [focusedId, setFocusedId] = useState(graphData?.id || null);
    const [tick, setTick] = useState(0);

    // Animation state
    const S = useRef({
        zoom: 1, targetZoom: 1,
        panX: 0, panY: 0,
        targetPanX: 0, targetPanY: 0,
        isPanning: false,
        lastMouse: { x: 0, y: 0 },
        lastTouch: null,
        nodeReveal: {},   // id → 0..1
        edgeReveal: {},   // `${parentId}-${childId}` → 0..1
        animFrame: 0,
    }).current;

    const expandedDataRef = useRef(expandedData);
    const expandingRef = useRef(expandingIds);
    const rootNodeRef = useRef(rootNode);
    const vpRef = useRef(vp);
    expandedDataRef.current = expandedData;
    expandingRef.current = expandingIds;
    vpRef.current = vp;

    const graphId = graphData?.id;

    // Resize
    useEffect(() => {
        const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Compute positions from current expand state
    const positions = layoutTree(rootNode, expandedData);

    // Request Animation Frame loop
    useEffect(() => {
        let raf;
        const loop = () => {
            S.zoom = lerp(S.zoom, S.targetZoom, 0.08);
            S.panX = lerp(S.panX, S.targetPanX, 0.08);
            S.panY = lerp(S.panY, S.targetPanY, 0.08);

            // Animate node/edge reveals
            let changed = false;
            const pos = layoutTree(rootNodeRef.current, expandedDataRef.current);
            Object.keys(pos).forEach(id => {
                const cur = S.nodeReveal[id] ?? 0;
                if (cur < 1) { S.nodeReveal[id] = Math.min(1, cur + 0.04); changed = true; }
            });
            // edges
            Object.values(pos).forEach(({ node, parentId }) => {
                if (!parentId) return;
                const key = `${parentId}-${node.id}`;
                const cur = S.edgeReveal[key] ?? 0;
                if (cur < 1) { S.edgeReveal[key] = Math.min(1, cur + 0.03); changed = true; }
            });

            setTick(t => t + 1);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [S]);

    // Wheel zoom
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onWheel = (e) => {
            e.preventDefault();
            const { w: VW, h: VH } = vpRef.current;
            const factor = e.deltaY < 0 ? 1.1 : 0.92;
            const oldZoom = S.targetZoom;
            const newZoom = clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
            const cx = e.clientX - VW / 2;
            const cy = e.clientY - VH / 2;
            S.targetPanX = cx - (cx - S.targetPanX) * (newZoom / oldZoom);
            S.targetPanY = cy - (cy - S.targetPanY) * (newZoom / oldZoom);
            S.targetZoom = newZoom;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [S]);

    const onMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        S.isPanning = true;
        S.lastMouse = { x: e.clientX, y: e.clientY };
    }, [S]);
    const onMouseMove = useCallback((e) => {
        if (!S.isPanning) return;
        S.targetPanX += e.clientX - S.lastMouse.x;
        S.targetPanY += e.clientY - S.lastMouse.y;
        S.lastMouse = { x: e.clientX, y: e.clientY };
    }, [S]);
    const onMouseUp = useCallback(() => { S.isPanning = false; }, [S]);
    const onTouchStart = useCallback((e) => {
        if (e.touches.length === 1) S.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, [S]);
    const onTouchMove = useCallback((e) => {
        if (e.touches.length === 1 && S.lastTouch) {
            S.targetPanX += e.touches[0].clientX - S.lastTouch.x;
            S.targetPanY += e.touches[0].clientY - S.lastTouch.y;
            S.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }, [S]);

    // Focus/pan to a node
    const focusNode = useCallback((id) => {
        const pos = layoutTree(rootNodeRef.current, expandedDataRef.current);
        const p = pos[id];
        if (!p) return;
        const { w: VW, h: VH } = vpRef.current;
        S.targetPanX = -(p.x + p.w / 2) * S.targetZoom;
        S.targetPanY = -(p.y + p.h / 2) * S.targetZoom;
        setFocusedId(id);
    }, [S]);

    // Expand a node
    const expandNode = useCallback((node) => {
        if (expandedDataRef.current[node.id]) return;
        // Data already in JSON tree — use it directly
        const children = node.children || [];
        children.forEach(c => {
            S.nodeReveal[c.id] = 0;
            S.edgeReveal[`${node.id}-${c.id}`] = 0;
        });
        setExpandedData(prev => ({ ...prev, [node.id]: { children } }));
    }, [S]);

    // Edge click: pan to child or parent
    const onEdgeClick = useCallback((parentId, childId) => {
        const pos = layoutTree(rootNodeRef.current, expandedDataRef.current);
        const focusTarget = focusedId === childId ? parentId : childId;
        focusNode(focusTarget);
    }, [focusedId, focusNode]);

    if (!graphData) { navigate("/"); return null; }

    const z = S.zoom;
    const { w: VW, h: VH } = vp;

    // World → screen
    const w2s = (wx, wy) => ({
        sx: VW / 2 + S.panX + wx * z,
        sy: VH / 2 + S.panY + wy * z,
    });

    // Gather all edges
    const edges = [];
    Object.values(positions).forEach(({ x, y, node, parentId, w, h, color }) => {
        if (!parentId) return;
        const par = positions[parentId];
        if (!par) return;
        const key = `${parentId}-${node.id}`;
        const reveal = S.edgeReveal[key] ?? 0;
        const parSc = w2s(par.x + par.w, par.y + par.h / 2);
        const childSc = w2s(x, y + h / 2);
        edges.push({
            key, parentId, childId: node.id, color, reveal,
            x1: parSc.sx, y1: parSc.sy, x2: childSc.sx, y2: childSc.sy
        });
    });

    return (
        <div
            ref={wrapRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={() => { S.lastTouch = null; }}
            style={{
                width: "100vw", height: "100vh",
                background: "#000",
                overflow: "hidden", position: "relative",
                cursor: S.isPanning ? "grabbing" : "grab",
                userSelect: "none",
            }}
        >
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Permanent+Marker&family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        @keyframes breathe {
          0%,100% { box-shadow: 0 0 30px rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.9); }
          50%      { box-shadow: 0 0 50px rgba(255,255,255,0.08), 0 24px 60px rgba(0,0,0,0.9); }
        }
        @keyframes dotPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.3; transform:scale(0.5); }
        }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes edgeDash {
          to { stroke-dashoffset: -20; }
        }
      `}</style>

            {/* Grid overlay */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
                backgroundImage: `
          linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)
        `,
                backgroundSize: `${60 * z}px ${60 * z}px`,
                backgroundPosition: `${S.panX % (60 * z)}px ${S.panY % (60 * z)}px`,
            }} />

            {/* Scanlines */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
                backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 3px)",
            }} />

            {/* ── SVG edges layer ── */}
            <svg style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                pointerEvents: "none", zIndex: 5,
            }}>
                <defs>
                    {edges.map(e => (
                        <filter key={`glow-${e.key}`} id={`glow-${e.key}`} x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    ))}
                </defs>
                {edges.map(e => {
                    const cpx = (e.x1 + e.x2) / 2;
                    const path = `M ${e.x1} ${e.y1} C ${cpx} ${e.y1}, ${cpx} ${e.y2}, ${e.x2} ${e.y2}`;
                    const dashLen = 200;
                    const dashOffset = (1 - e.reveal) * dashLen;
                    const isFocusEdge = e.parentId === focusedId || e.childId === focusedId;
                    return (
                        <g key={e.key} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                            onClick={() => onEdgeClick(e.parentId, e.childId)}>
                            {/* Invisible wide hit area */}
                            <path d={path} fill="none" stroke="transparent" strokeWidth={20} />
                            {/* Glow trail */}
                            <path d={path} fill="none"
                                stroke={`${e.color}22`} strokeWidth={isFocusEdge ? 8 : 4}
                                strokeLinecap="round"
                                style={{ filter: `url(#glow-${e.key})` }} />
                            {/* Main edge */}
                            <path d={path} fill="none"
                                stroke={isFocusEdge ? e.color : `${e.color}70`}
                                strokeWidth={isFocusEdge ? 2 : 1.2}
                                strokeLinecap="round"
                                strokeDasharray={dashLen}
                                strokeDashoffset={dashOffset}
                                style={{ transition: "stroke 0.3s, stroke-width 0.3s" }} />
                            {/* Animated dash for focused edges */}
                            {isFocusEdge && (
                                <path d={path} fill="none"
                                    stroke={`${e.color}90`} strokeWidth={1.5}
                                    strokeDasharray="5 15"
                                    style={{ animation: "edgeDash 1.2s linear infinite" }} />
                            )}
                            {/* Arrow head */}
                            <circle cx={e.x2} cy={e.y2} r={isFocusEdge ? 4 : 3}
                                fill={isFocusEdge ? e.color : `${e.color}80`}
                                opacity={e.reveal}
                                style={{ transition: "fill 0.3s, r 0.3s" }} />
                        </g>
                    );
                })}
            </svg>

            {/* ── Node cards ── */}
            {Object.values(positions).map(({ x, y, node, parentId, color, w, h, depth }) => {
                const sc = w2s(x, y);
                const reveal = S.nodeReveal[node.id] ?? 0;
                const opacity = easeOut(reveal);
                const isFocused = node.id === focusedId;
                const isRoot = depth === 0;
                const isExpanding = expandingIds.has(node.id);
                const isExpanded = !!expandedData[node.id];
                const children = isRoot
                    ? (node.children || [])
                    : (expandedData[node.id]?.children || []);
                const hasChildren = (node.children || []).length > 0;

                return (
                    <div
                        key={node.id}
                        onClick={() => setFocusedId(node.id)}
                        style={{
                            position: "absolute",
                            width: w, height: h,
                            left: sc.sx,
                            top: sc.sy,
                            transform: `scale(${z})`,
                            transformOrigin: "top left",
                            opacity,
                            background: "#000",
                            border: isFocused
                                ? `1.5px solid ${color}`
                                : isRoot
                                    ? "1.5px solid rgba(255,255,255,0.18)"
                                    : "1px solid rgba(255,255,255,0.09)",
                            borderRadius: isRoot ? 16 : 14,
                            padding: "14px 16px 12px",
                            boxShadow: isFocused
                                ? `0 0 0 1px ${color}22, 0 16px 60px rgba(0,0,0,0.95), 0 0 40px ${color}30, inset 0 1px 0 rgba(255,255,255,0.07)`
                                : isRoot
                                    ? "0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,1), inset 0 1px 0 rgba(255,255,255,0.06)"
                                    : "0 0 0 1px rgba(255,255,255,0.03), 0 8px 30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.03)",
                            fontFamily: "Inter, sans-serif",
                            zIndex: isFocused ? 20 : isRoot ? 15 : 10,
                            overflow: "hidden",
                            display: "flex", flexDirection: "column",
                            cursor: "pointer",
                            animation: isRoot ? "breathe 3.5s ease-in-out infinite" : "none",
                            transition: "border-color 0.2s, box-shadow 0.2s",
                        }}
                    >
                        {/* Top accent line */}
                        <div style={{
                            position: "absolute", top: 0, left: 0, right: 0,
                            height: isFocused ? 3 : isRoot ? 2 : 1.5,
                            borderRadius: `${isRoot ? 16 : 14}px ${isRoot ? 16 : 14}px 0 0`,
                            background: isFocused
                                ? `linear-gradient(90deg, transparent, ${color}, transparent)`
                                : isRoot
                                    ? "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)"
                                    : `linear-gradient(90deg, transparent, ${color}50, transparent)`,
                            backgroundSize: isFocused ? "200% auto" : "100%",
                            animation: isFocused ? "shimmer 2s linear infinite" : "none",
                        }} />

                        {/* Corner dot */}
                        <div style={{
                            position: "absolute", top: 12, right: 12,
                            width: isFocused ? 7 : 5, height: isFocused ? 7 : 5,
                            borderRadius: "50%",
                            background: isFocused ? color : isRoot ? "#fff" : "rgba(255,255,255,0.2)",
                            boxShadow: isFocused ? `0 0 12px ${color}` : isRoot ? "0 0 8px rgba(255,255,255,0.6)" : "none",
                            animation: "dotPulse 2s ease-in-out infinite",
                            transition: "all 0.2s",
                        }} />

                        {/* Badge */}
                        <div style={{
                            fontSize: isRoot ? 9 : 5.5, letterSpacing: "0.14em",
                            color: isFocused ? color : "rgba(255,255,255,0.3)",
                            textTransform: "uppercase", fontWeight: 600,
                            marginBottom: isRoot ? 10 : 7,
                            display: "flex", alignItems: "center", gap: 6,
                            fontFamily: "DM Mono, monospace",
                            transition: "color 0.2s",
                        }}>
                            <span style={{
                                width: isRoot ? 6 : 5, height: isRoot ? 6 : 5,
                                borderRadius: "50%", background: isFocused ? color : "#fff",
                                display: "inline-block",
                                boxShadow: isFocused ? `0 0 8px ${color}` : "0 0 6px rgba(255,255,255,0.6)",
                                animation: "dotPulse 2s ease-in-out infinite", flexShrink: 0,
                            }} />
                            {depth === 0 ? "Root · Depth 0" : `Node · Depth ${depth}`}
                        </div>

                        {/* Title */}
                        <div style={{
                            fontSize: isRoot ? 15 : 12,
                            fontFamily: "'Permanent Marker', cursive",
                            color: isFocused ? "#fff" : "rgba(255,255,255,0.85)",
                            lineHeight: 1.25, marginBottom: isRoot ? 10 : 8,
                            textShadow: isFocused ? `0 0 20px ${color}50` : isRoot ? "0 0 20px rgba(255,255,255,0.15)" : "none",
                            letterSpacing: "0.01em",
                            transition: "text-shadow 0.2s",
                        }}>
                            {node.title}
                        </div>

                        {/* Divider */}
                        <div style={{
                            width: "100%", height: 1,
                            background: isFocused
                                ? `linear-gradient(90deg, transparent, ${color}50, transparent)`
                                : "rgba(255,255,255,0.05)",
                            marginBottom: 8, flexShrink: 0,
                        }} />

                        {/* Description */}
                        <div style={{
                            fontSize: isRoot ? 8 : 6,
                            color: isFocused ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
                            lineHeight: 1.7, flex: 1,
                            fontFamily: "Inter, sans-serif",
                            wordBreak: "break-word", overflow: "hidden",
                            transition: "color 0.2s",
                        }}>
                            {node.content || "No description available."}
                        </div>

                        {/* Footer */}
                        <div style={{
                            marginTop: 8, display: "flex", justifyContent: "space-between",
                            alignItems: "center", flexShrink: 0,
                        }}>
                            <span style={{
                                fontSize: 7, color: "rgba(255,255,255,0.2)",
                                letterSpacing: "0.1em", textTransform: "uppercase",
                                fontFamily: "DM Mono, monospace",
                            }}>
                                {isRoot ? `${(node.children || []).length} children` : hasChildren ? `has children` : "leaf"}
                            </span>

                            {/* Expand button — only for non-root nodes with children that aren't expanded */}
                            {!isRoot && hasChildren && !isExpanded && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); expandNode(node); }}
                                    disabled={isExpanding}
                                    style={{
                                        background: isExpanding ? "rgba(255,255,255,0.03)" : `${color}15`,
                                        border: `1px solid ${color}50`,
                                        borderRadius: 6, padding: "3px 8px",
                                        color: isExpanding ? "rgba(255,255,255,0.3)" : color,
                                        fontSize: 6.5, fontFamily: "DM Mono, monospace",
                                        letterSpacing: "0.1em", textTransform: "uppercase",
                                        cursor: isExpanding ? "default" : "pointer",
                                        display: "flex", alignItems: "center", gap: 4,
                                        transition: "all 0.2s",
                                        pointerEvents: "auto",
                                    }}
                                >
                                    {isExpanding ? (
                                        <>
                                            <span style={{
                                                display: "inline-block", width: 6, height: 6,
                                                border: `1.5px solid ${color}40`, borderTopColor: color,
                                                borderRadius: "50%", animation: "spin 0.7s linear infinite",
                                            }} />
                                            expanding…
                                        </>
                                    ) : (
                                        <>◈ expand</>
                                    )}
                                </button>
                            )}

                            {/* Expanded indicator */}
                            {!isRoot && isExpanded && (
                                <span style={{
                                    fontSize: 6.5, fontFamily: "DM Mono, monospace",
                                    color: `${color}80`, letterSpacing: "0.1em", textTransform: "uppercase",
                                }}>
                                    ◉ {children.length} expanded
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* ── Breadcrumb ── */}
            <Breadcrumb positions={positions} focusedId={focusedId} onFocus={focusNode} />

            {/* ── Minimap ── */}
            <Minimap
                positions={positions} zoom={z}
                panX={S.panX} panY={S.panY}
                vw={VW} vh={VH}
                focusedId={focusedId}
            />

            {/* ── HUD top-left ── */}
            <div style={{
                position: "absolute", top: 20, left: 24, zIndex: 60,
                fontFamily: "DM Mono, monospace", lineHeight: 1.9,
                pointerEvents: "none",
            }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 500 }}>
                    Graph View
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {Object.keys(positions).length} nodes · {edges.length} edges
                </div>
            </div>

            {/* ── HUD top-right ── */}
            <div style={{
                position: "absolute", top: 20, right: 24, zIndex: 60,
                fontFamily: "DM Mono, monospace", textAlign: "right", lineHeight: 1.9,
                pointerEvents: "none",
            }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    ZOOM <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{z.toFixed(2)}×</span>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
                    scroll · drag · click edge to nav
                </div>
            </div>

            {/* ── Bottom legend ── */}
            <div style={{
                position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
                zIndex: 60, display: "flex", alignItems: "center", gap: 18,
                background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "7px 18px",
                backdropFilter: "blur(10px)",
                fontFamily: "DM Mono, monospace", pointerEvents: "none",
            }}>
                {[
                    { dot: "#fff", label: "Root" },
                    { dot: "#FF3CAC", label: "Child node" },
                    { dot: "#00FF87", label: "Expanded" },
                    { dot: "rgba(255,255,255,0.3)", label: "Click edge to navigate" },
                ].map(({ dot, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {label}
                        </span>
                    </div>
                ))}
            </div>

            {/* ── Minimap label ── */}
            <div style={{
                position: "absolute", bottom: 198, right: 22, zIndex: 61,
                fontFamily: "DM Mono, monospace", fontSize: 7,
                color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em", textTransform: "uppercase",
                pointerEvents: "none",
            }}>
                Minimap
            </div>
        </div>
    );
}
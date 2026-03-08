import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const PIERCE_START = 2;
const PIERCE_END = 3.2;
const ENTER_ZOOM = 6.5;
const ZOOM_OUT_THRESHOLD = 2.0;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 14.0;

const CHILD_COLORS = [
    "#FF3CAC", "#00F5FF", "#FFEA00", "#7B2FFF", "#00FF87",
    "#FF6B35", "#FF007F", "#39FF14", "#BF5FFF", "#00BFFF",
];

const ROOT_W = 220;
const ROOT_H = 185;
const CARD_W = 190;
const CARD_H = 170;
const CARD_WORLD_GAP = 36;

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t) => Math.pow(Math.min(1, Math.max(0, t)), 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function worldCardPositions(count) {
    const totalW = count * CARD_W + (count - 1) * CARD_WORLD_GAP;
    const startX = -totalW / 2 + CARD_W / 2;
    return Array.from({ length: count }, (_, i) => ({
        x: startX + i * (CARD_W + CARD_WORLD_GAP),
        y: 0,
    }));
}

function w2s(wx, wy, zoom, panX, panY, vw, vh) {
    return {
        sx: vw / 2 + panX + wx * zoom,
        sy: vh / 2 + panY + wy * zoom,
    };
}

export default function GraphDashboardJSON() {
    const wrapRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const graphData = location.state || null;

    const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
    const [currentNode, setCurrentNode] = useState(graphData || {});
    const [expandedData, setExpandedData] = useState({});
    const [prefetchingIds, setPrefetchingIds] = useState(new Set());
    const [nodeStack, setNodeStack] = useState([]);
    const [swapFlash, setSwapFlash] = useState(false);

    const currentNodeRef = useRef(currentNode);
    const expandedDataRef = useRef(expandedData);
    const prefetchingRef = useRef(prefetchingIds);
    const nodeStackRef = useRef(nodeStack);
    const nodeStackSyncRef = useRef(nodeStack);
    const vpRef = useRef(vp);
    currentNodeRef.current = currentNode;
    expandedDataRef.current = expandedData;
    prefetchingRef.current = prefetchingIds;
    nodeStackRef.current = nodeStack;
    nodeStackSyncRef.current = nodeStack;
    vpRef.current = vp;

    const graphId = graphData?.id;

    const S = useRef({
        zoom: 1, targetZoom: 2,
        panX: 0, panY: 0,
        targetPanX: 0, targetPanY: 0,
        childReveal: 0,
        isPanning: false,
        lastMouse: { x: 0, y: 0 },
        lastTouch: null,
        cursorX: -9999, cursorY: -9999,
        hoverChildIndex: -1,
        transitioning: false,
        zoomOutFired: false,
        rootOffX: 0, rootOffY: 0,
        mouseDownPos: { x: 0, y: 0 },
        didDrag: false,
        resurfacing: false,
        resurfaceTargetZoom: 0,
        resurfaceEntry: null,
        resurfaceNewStack: null,
    }).current;

    const [, setTick] = useState(0);

    useEffect(() => {
        const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        const onMove = (e) => { S.cursorX = e.clientX; S.cursorY = e.clientY; };
        window.addEventListener("mousemove", onMove);
        return () => window.removeEventListener("mousemove", onMove);
    }, [S]);

    const prefetchNode = useCallback((child) => {
        if (expandedDataRef.current[child.id]) return;
        // Data is already in the JSON tree — just store it directly
        setExpandedData(prev => ({ ...prev, [child.id]: child }));
    }, []);

    const resetAnimState = useCallback((zoom = PIERCE_END + 0.05) => {
        S.zoom = zoom; S.targetZoom = zoom;
        S.panX = 0; S.panY = 0;
        S.targetPanX = 0; S.targetPanY = 0;
        S.rootOffX = 0; S.rootOffY = 0;
        S.childReveal = 0; S.hoverChildIndex = -1;
        S.transitioning = false; S.zoomOutFired = false;
        S.resurfacing = false; S.resurfaceEntry = null; S.resurfaceNewStack = null;
    }, [S]);

    // Kept as alias for enter-child callers
    const resetAnimStateEntered = useCallback(() => resetAnimState(PIERCE_END + 0.05), [resetAnimState]);

    const swapToNode = useCallback((newNode, newStack, zoom) => {
        resetAnimState(zoom);
        setSwapFlash(true);
        requestAnimationFrame(() => {
            setCurrentNode(newNode);
            setNodeStack(newStack);
            setTimeout(() => setSwapFlash(false), 80);
        });
    }, [resetAnimState]);

    const enterChild = useCallback((child, expanded) => {
        if (!child || !expanded) return;
        if (S.resurfacing) return;
        const newNode = { ...child, children: expanded.children || [] };
        const savedState = {
            node: currentNodeRef.current,
            zoom: S.zoom,
            panX: S.panX,
            panY: S.panY,
        };
        nodeStackSyncRef.current = [...nodeStackSyncRef.current, savedState];
        setNodeStack(nodeStackSyncRef.current);
        setCurrentNode(newNode);
        resetAnimStateEntered();
    }, [S, resetAnimStateEntered]);

    const goHome = useCallback(() => {
        if (nodeStackSyncRef.current.length === 0) return;
        // Land at zoom=2 — root card is visible, below PIERCE_START so children are hidden
        nodeStackSyncRef.current = [];
        swapToNode(graphData, [], 2.0);
    }, [swapToNode, graphData]);

    const goToLayer = useCallback((stackIndex) => {
        const stack = nodeStackRef.current;
        if (stackIndex < 0 || stackIndex >= stack.length) return;
        const entry = stack[stackIndex];
        nodeStackSyncRef.current = stack.slice(0, stackIndex);
        swapToNode(entry.node, stack.slice(0, stackIndex), entry.zoom ?? (PIERCE_END + 0.05));
    }, [swapToNode]);

    // FIX: goBack now works correctly regardless of zoom level — it always
    // triggers the zoom-out animation and pops the stack.
    const goBack = useCallback(() => {
        const stack = nodeStackSyncRef.current;
        if (stack.length === 0) return;
        if (S.resurfacing || S.transitioning) return;
        const entry = stack[stack.length - 1];
        const newStack = stack.slice(0, -1);
        S.resurfacing = true;
        S.zoomOutFired = true;
        S.resurfaceEntry = entry;
        S.resurfaceNewStack = newStack;
        S.resurfaceTargetZoom = PIERCE_START - 0.9;
        S.targetZoom = S.resurfaceTargetZoom;
        S.targetPanX = entry.panX ?? 0;
        S.targetPanY = entry.panY ?? 0;
    }, [S]);

    // ── RAF loop ──
    useEffect(() => {
        let raf;
        const loop = () => {
            S.zoom = lerp(S.zoom, S.targetZoom, 0.09);
            S.panX = lerp(S.panX, S.targetPanX, 0.09);
            S.panY = lerp(S.panY, S.targetPanY, 0.09);

            const node = currentNodeRef.current;
            const children = node?.children || [];
            const { w: VW, h: VH } = vpRef.current;

            const pierceT = clamp((S.zoom - PIERCE_START) / (PIERCE_END - PIERCE_START), 0, 1);
            S.childReveal = pierceT >= 1
                ? Math.min(1, S.childReveal + 0.025)
                : Math.max(0, S.childReveal - 0.05);

            const wPos = worldCardPositions(children.length);

            if (S.childReveal > 0.05 && children.length > 0 && !S.transitioning) {
                let found = -1;
                for (let i = 0; i < children.length; i++) {
                    const { sx, sy } = w2s(
                        S.rootOffX + wPos[i].x, S.rootOffY + wPos[i].y,
                        S.zoom, S.panX, S.panY, VW, VH
                    );
                    const hw = (CARD_W * S.zoom) / 2;
                    const hh = (CARD_H * S.zoom) / 2;
                    if (S.cursorX >= sx - hw && S.cursorX <= sx + hw &&
                        S.cursorY >= sy - hh && S.cursorY <= sy + hh) {
                        found = i; break;
                    }
                }
                S.hoverChildIndex = found;
            } else if (S.childReveal === 0) {
                S.hoverChildIndex = -1;
            }

            // Auto-enter on deep zoom — only if data is already loaded
            if (!S.transitioning && S.hoverChildIndex >= 0 && S.targetZoom >= ENTER_ZOOM) {
                const child = children[S.hoverChildIndex];
                const expanded = expandedDataRef.current[child?.id];
                if (child && expanded) enterChild(child, expanded);
            }

            // ── Resurface Phase 1: threshold crossed → start zoom-out animation ──
            if (!S.transitioning && !S.resurfacing && nodeStackSyncRef.current.length > 0
                && S.targetZoom < ZOOM_OUT_THRESHOLD && !S.zoomOutFired) {
                S.zoomOutFired = true;
                S.resurfacing = true;
                const stack = nodeStackSyncRef.current;
                const entry = stack[stack.length - 1];
                const newStack = stack.slice(0, -1);
                S.resurfaceEntry = entry;
                S.resurfaceNewStack = newStack;
                S.resurfaceTargetZoom = PIERCE_START - 0.3;
                S.targetZoom = S.resurfaceTargetZoom;
                S.targetPanX = entry.panX ?? 0;
                S.targetPanY = entry.panY ?? 0;
            }

            // ── Resurface Phase 2: zoom-out animation done → swap node ──
            if (S.resurfacing && !S.transitioning
                && Math.abs(S.zoom - S.resurfaceTargetZoom) < 0.15) {
                S.resurfacing = false;
                S.transitioning = true;
                const entry = S.resurfaceEntry;
                const newStack = S.resurfaceNewStack;
                S.resurfaceEntry = null;
                S.resurfaceNewStack = null;
                const landZoom = entry.zoom ?? (PIERCE_END + 0.05);
                S.zoom = landZoom;
                S.targetZoom = landZoom;
                S.panX = entry.panX ?? 0;
                S.panY = entry.panY ?? 0;
                S.targetPanX = entry.panX ?? 0;
                S.targetPanY = entry.panY ?? 0;
                S.rootOffX = 0; S.rootOffY = 0;
                S.childReveal = 0; S.hoverChildIndex = -1;
                nodeStackSyncRef.current = newStack;
                setSwapFlash(true);
                requestAnimationFrame(() => {
                    setCurrentNode(entry.node);
                    setNodeStack(newStack);
                    setTimeout(() => {
                        setSwapFlash(false);
                        S.transitioning = false;
                        S.zoomOutFired = false;
                    }, 80);
                });
            }

            setTick(t => t + 1);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Wheel ──
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onWheel = (e) => {
            e.preventDefault();
            const { w: VW, h: VH } = vpRef.current;
            const factor = e.deltaY < 0 ? 1.12 : 0.90;
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

    // FIX: Right-click goes back — attached to the wrapper div, not individual cards.
    // Cards must NOT call stopPropagation on contextmenu so it bubbles up here.
    const onContextMenu = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        goBack();
    }, [goBack]);

    const onMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        S.isPanning = true;
        S.lastMouse = { x: e.clientX, y: e.clientY };
        S.mouseDownPos = { x: e.clientX, y: e.clientY };
        S.didDrag = false;
    }, [S]);

    const onMouseMove = useCallback((e) => {
        if (!S.isPanning) return;
        S.targetPanX += e.clientX - S.lastMouse.x;
        S.targetPanY += e.clientY - S.lastMouse.y;
        S.lastMouse = { x: e.clientX, y: e.clientY };
        if (Math.abs(e.clientX - S.mouseDownPos.x) > 4 ||
            Math.abs(e.clientY - S.mouseDownPos.y) > 4) S.didDrag = true;
    }, [S]);

    const onMouseUp = useCallback((e) => {
        if (!S.isPanning) return;
        S.isPanning = false;
        if (S.didDrag) { S.didDrag = false; return; }
        S.didDrag = false;
        if (e.button !== 0) return;

        const node = currentNodeRef.current;
        const children = node?.children || [];
        const { w: VW, h: VH } = vpRef.current;

        if (S.childReveal <= 0.3) {
            // Click root card to zoom in
            const { sx, sy } = w2s(S.rootOffX, S.rootOffY, S.zoom, S.panX, S.panY, VW, VH);
            if (e.clientX >= sx - (ROOT_W * S.zoom) / 2 && e.clientX <= sx + (ROOT_W * S.zoom) / 2 &&
                e.clientY >= sy - (ROOT_H * S.zoom) / 2 && e.clientY <= sy + (ROOT_H * S.zoom) / 2) {
                S.targetZoom = clamp(S.targetZoom * 1.5, MIN_ZOOM, MAX_ZOOM);
            }
        }
    }, [S]);

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

    if (!graphData) { navigate("/"); return null; }

    // ── Render values ──
    const z = S.zoom;
    const pierceT = clamp((z - PIERCE_START) / (PIERCE_END - PIERCE_START), 0, 1);
    const isPiercing = pierceT > 0 && pierceT < 1;
    const isPierced = pierceT >= 1;
    const childReveal = S.childReveal;
    const hoverIdx = S.hoverChildIndex;
    const children = currentNode.children || [];
    const { w: VW, h: VH } = vp;

    const rootSc = w2s(S.rootOffX, S.rootOffY, z, S.panX, S.panY, VW, VH);
    const rootBloat = 1 + pierceT * 0.3;
    const rootOpacity = isPierced ? 0 : clamp(1 - easeIn(pierceT * 1.1), 0, 1);
    const flashOp = isPiercing ? easeIn(pierceT) * 0.15 : 0;

    const wPos = worldCardPositions(children.length);
    const childSc = wPos.map(p =>
        w2s(S.rootOffX + p.x, S.rootOffY + p.y, z, S.panX, S.panY, VW, VH)
    );

    const enterProg = hoverIdx >= 0
        ? clamp((S.targetZoom - PIERCE_END) / (ENTER_ZOOM - PIERCE_END), 0, 1) : 0;
    const zoomOutProg = S.resurfacing
        ? clamp((PIERCE_END - S.zoom) / (PIERCE_END - (PIERCE_START - 0.3)), 0, 1)
        : 0;

    const allLayers = [
        ...nodeStack.map((e, i) => ({ node: e.node, stackIndex: i })),
        { node: currentNode, stackIndex: -1 },
    ];

    return (
        <div
            ref={wrapRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => { S.isPanning = false; }}
            onContextMenu={onContextMenu}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={() => { S.lastTouch = null; }}
            style={{
                width: "95vw", height: "85vh",
                background: "#000000",
                overflow: "hidden", position: "relative",
                cursor: S.isPanning ? "grabbing" : "grab",
                userSelect: "none",
            }}
        >
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Permanent+Marker&family=Inter:wght@400;500;600;700&display=swap');
                * { box-sizing: border-box; }
                @keyframes breathe {
                    0%,100% { box-shadow: 0 0 30px rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.9); }
                    50%     { box-shadow: 0 0 50px rgba(255,255,255,0.08), 0 24px 60px rgba(0,0,0,0.9); }
                }
                @keyframes dotPulse {
                    0%,100% { opacity:1; transform:scale(1); }
                    50%     { opacity:0.3; transform:scale(0.5); }
                }
                @keyframes ripple {
                    0%   { transform:scale(0.3); opacity:0.5; }
                    100% { transform:scale(3);   opacity:0; }
                }
                @keyframes childRipple {
                    0%   { transform:scale(0.5); opacity:0.45; }
                    100% { transform:scale(2.4); opacity:0; }
                }
                @keyframes spin { to { transform:rotate(360deg); } }
                @keyframes fadeUp {
                    from { opacity:0; transform:translateY(8px) translateX(-50%); }
                    to   { opacity:1; transform:translateY(0)   translateX(-50%); }
                }
                @keyframes outPulse {
                    0%,100% { opacity:0.5; }
                    50%     { opacity:1; }
                }
                @keyframes shimmer {
                    0%   { background-position: -200% center; }
                    100% { background-position:  200% center; }
                }
                @keyframes bubblePop {
                    0%   { transform: scale(0.3); opacity:0; }
                    65%  { transform: scale(1.25); }
                    100% { transform: scale(1);    opacity:1; }
                }
                @keyframes homePulse {
                    0%,100% { opacity:0.75; }
                    50%     { opacity:1; }
                }
                .layer-bubble { transition: transform 0.15s; }
                .layer-bubble:hover { transform: scale(1.4) !important; }
                .layer-bubble:hover .bubble-tooltip { opacity: 1 !important; }
                .child-card-enter:hover {
                    cursor: pointer;
                }
            `}</style>

            {/* Grid */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
                backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),
                                 linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px)`,
                backgroundSize: "60px 60px"
            }} />
            {/* Scanline */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
                backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 3px)"
            }} />

            {!swapFlash && !isPiercing && (
                <div style={{
                    position: "absolute",
                    width: ROOT_W, height: ROOT_H,
                    left: rootSc.sx - (ROOT_W * z * rootBloat) / 2,
                    top: rootSc.sy - (ROOT_H * z * rootBloat) / 2,
                    transform: `scale(${z * rootBloat})`,
                    transformOrigin: "top left",
                    opacity: rootOpacity,
                    pointerEvents: isPierced ? "none" : "auto",
                    background: "#000",
                    border: "1.5px solid rgba(255,255,255,0.12)",
                    borderRadius: 16, padding: "18px 20px 14px",
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.04),0 32px 80px rgba(0,0,0,1),inset 0 1px 0 rgba(255,255,255,0.06)",
                    animation: !isPiercing && !isPierced ? "breathe 3.5s ease-in-out infinite" : "none",
                    fontFamily: "Inter,sans-serif", zIndex: 10, overflow: "hidden",
                    display: "flex", flexDirection: "column",
                }}>
                    <div style={{
                        position: "absolute", top: 0, left: 0, right: 0, height: 2, borderRadius: "16px 16px 0 0",
                        background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)"
                    }} />
                    <div style={{
                        fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.35)",
                        textTransform: "uppercase", fontWeight: 600, marginBottom: 8,
                        display: "flex", alignItems: "center", gap: 7, fontFamily: "Inter,sans-serif"
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block",
                            boxShadow: "0 0 8px rgba(255,255,255,0.8)", animation: "dotPulse 2s ease-in-out infinite", flexShrink: 0
                        }} />
                        {currentNode.depth === 0 ? "Root · Depth 0" : `Node · Depth ${currentNode.depth}`}
                    </div>
                    <div style={{
                        fontSize: 14, color: "#fff", lineHeight: 1.25, marginBottom: 8,
                        fontFamily: "'Permanent Marker',cursive", letterSpacing: "0.01em",
                        textShadow: "0 0 20px rgba(255,255,255,0.15)"
                    }}>
                        {currentNode.title}
                    </div>
                    <div style={{
                        fontSize: 7.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.6,
                        borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, fontFamily: "Inter,sans-serif",
                        flex: 1, overflow: "hidden"
                    }}>
                        {currentNode.content}
                    </div>
                    {/* Footer row */}
                    <div style={{
                        marginTop: 10, display: "flex", justifyContent: "space-between",
                        alignItems: "center", fontFamily: "Inter,sans-serif", gap: 6
                    }}>
                        <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.18)", letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 }}>
                            {children.length} nodes
                        </span>
                        {children.length > 0 && !isPiercing && !isPierced && (
                            <button
                                onClick={(e) => { e.stopPropagation(); S.targetZoom = PIERCE_END + 0.1; }}
                                style={{
                                    background: "rgba(255,255,255,0.08)",
                                    border: "1px solid rgba(255,255,255,0.2)",
                                    borderRadius: 6, padding: "3px 10px",
                                    color: "rgba(255,255,255,0.75)", fontSize: 7.5,
                                    letterSpacing: "0.1em", textTransform: "uppercase",
                                    fontWeight: 700, fontFamily: "Inter,sans-serif",
                                    cursor: "pointer", flexShrink: 0,
                                    transition: "background 0.15s, border-color 0.15s, color 0.15s",
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)";
                                    e.currentTarget.style.color = "#fff";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                                    e.currentTarget.style.color = "rgba(255,255,255,0.75)";
                                }}
                            >
                                Explore ↓
                            </button>
                        )}
                    </div>
                    {isPiercing && [0, 1, 2].map(i => (
                        <div key={i} style={{
                            position: "absolute", width: "100%", height: "100%",
                            border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, top: 0, left: 0,
                            pointerEvents: "none",
                            animation: `ripple ${0.85 + i * 0.28}s ease-out ${i * 0.22}s infinite`,
                            transformOrigin: "center center"
                        }} />
                    ))}
                </div>
            )}

            {/* ── Child cards ── */}
            {!swapFlash && children.map((child, i) => {
                const sc = childSc[i];
                const color = CHILD_COLORS[i % CHILD_COLORS.length];
                const revT = clamp((childReveal - i * 0.08) / 0.6, 0, 1);
                const isHov = hoverIdx === i;
                const isFetching = prefetchingIds.has(child.id);
                const isReady = !!expandedData[child.id];
                const ep = isHov ? enterProg : 0;
                const hoverBump = isHov ? 1 + ep * 0.04 : 1;
                const opacity = easeOut(revT);
                const glowSize = isHov ? 40 + ep * 60 : 0;

                // FIX: Clicking anywhere on a ready card enters it.
                // Only the Expand button handles expanding; no Enter button shown.
                const handleCardClick = (e) => {
                    // Let Expand button handle its own click
                    if (e.target.closest("[data-expand-btn]")) return;
                    if (isFetching) return;
                    if (isReady) {
                        e.stopPropagation();
                        enterChild(child, expandedDataRef.current[child.id]);
                    }
                };

                return (
                    <div
                        key={child.id}
                        className={isReady ? "child-card-enter" : ""}
                        onClick={handleCardClick}
                        // FIX: Do NOT call stopPropagation on contextmenu here,
                        // so right-click bubbles up to the wrapper's onContextMenu → goBack().
                        onContextMenu={(e) => { e.preventDefault(); }}
                        style={{
                            position: "absolute",
                            width: CARD_W, height: CARD_H,
                            left: sc.sx - (CARD_W * z * hoverBump) / 2,
                            top: sc.sy - (CARD_H * z * hoverBump) / 2,
                            transform: `scale(${z * hoverBump})`,
                            transformOrigin: "top left",
                            opacity,
                            background: "#000",
                            border: isHov ? `1.5px solid ${color}` : "1px solid rgba(255,255,255,0.09)",
                            borderRadius: 14, padding: "14px 16px 12px",
                            boxShadow: isHov
                                ? `0 0 0 1px ${color}22,0 16px 60px rgba(0,0,0,0.95),0 0 ${glowSize}px ${color}55,inset 0 1px 0 rgba(255,255,255,0.07)`
                                : "0 0 0 1px rgba(255,255,255,0.03),0 8px 30px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,0.03)",
                            fontFamily: "Inter,sans-serif",
                            zIndex: isHov ? 11 : 9, overflow: "hidden",
                            display: "flex", flexDirection: "column",
                            pointerEvents: childReveal > 0.2 ? "auto" : "none",
                            transition: "border-color 0.2s,box-shadow 0.2s",
                            cursor: isReady ? "pointer" : isFetching ? "wait" : (child.children && child.children.length > 0) ? "pointer" : "default",
                        }}>
                        <div style={{
                            position: "absolute", top: 0, left: 0, right: 0, height: isHov ? 3 : 1.5,
                            borderRadius: "14px 14px 0 0",
                            background: isHov
                                ? `linear-gradient(90deg,transparent,${color},${CHILD_COLORS[(i + 2) % CHILD_COLORS.length]},${color},transparent)`
                                : `linear-gradient(90deg,transparent,${color}60,transparent)`,
                            backgroundSize: isHov ? "200% auto" : "100%",
                            animation: isHov ? "shimmer 2s linear infinite" : "none"
                        }} />
                        {isHov && ep > 0 && (<div style={{
                            position: "absolute", bottom: 0, left: 0,
                            width: `${ep * 100}%`, height: 2,
                            background: `linear-gradient(90deg,${color}80,${color})`,
                            borderRadius: "0 0 0 14px"
                        }} />)}
                        <div style={{
                            position: "absolute", top: 12, right: 12,
                            width: isHov ? 8 : 5, height: isHov ? 8 : 5, borderRadius: "50%",
                            background: isHov ? color : "rgba(255,255,255,0.2)",
                            boxShadow: isHov ? `0 0 14px ${color}` : "none", transition: "all 0.2s"
                        }} />
                        <div style={{
                            fontSize: 5.5, letterSpacing: "0.12em",
                            color: isHov ? color : "rgba(255,255,255,0.25)",
                            textTransform: "uppercase", fontWeight: 600, marginBottom: 7,
                            display: "flex", alignItems: "center", gap: 5,
                            fontFamily: "Inter,sans-serif", transition: "color 0.2s"
                        }}>
                            {isFetching
                                ? <><span style={{
                                    display: "inline-block", width: 7, height: 7,
                                    border: `1.5px solid ${color}40`, borderTopColor: color,
                                    borderRadius: "50%", animation: "spin 0.7s linear infinite"
                                }} />fetching</>
                                : isReady ? (isHov && ep > 0.05 ? `◉ entering ${Math.round(ep * 100)}%` : "◈ click to enter")
                                    : (child.children && child.children.length > 0) ? "◆ node" : "◇ leaf"
                            }{" "}· depth {child.depth}
                        </div>
                        <div style={{
                            fontSize: 12, fontFamily: "'Permanent Marker',cursive",
                            color: isHov ? "#fff" : "rgba(255,255,255,0.82)", lineHeight: 1.3, marginBottom: 8,
                            textShadow: isHov ? `0 0 20px ${color}60` : "none",
                            transition: "text-shadow 0.2s,color 0.2s"
                        }}>
                            {child.title}
                        </div>
                        <div style={{
                            width: "100%", height: 1,
                            background: isHov ? `linear-gradient(90deg,transparent,${color}50,transparent)` : "rgba(255,255,255,0.05)",
                            marginBottom: 8, flexShrink: 0, transition: "background 0.2s"
                        }} />
                        <div style={{
                            fontSize: 6,
                            color: isHov ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.28)",
                            lineHeight: 1.65, flex: 1, fontFamily: "Inter,sans-serif",
                            transition: "color 0.2s", wordBreak: "break-word",
                            overflowWrap: "break-word", overflow: "hidden"
                        }}>
                            {child.content || "No description available."}
                        </div>

                        {/* ── Action button: ONLY Expand (no Enter button) ── */}
                        {isFetching ? (
                            // State 1: Currently fetching
                            <div style={{
                                marginTop: 7, padding: "5px 0",
                                border: `1px solid ${color}25`, borderRadius: 6,
                                background: `${color}06`, color: `${color}70`, fontSize: 7.5,
                                letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600,
                                textAlign: "center", display: "flex", alignItems: "center",
                                justifyContent: "center", gap: 6, flexShrink: 0,
                                fontFamily: "Inter,sans-serif",
                            }}>
                                <span style={{
                                    display: "inline-block", width: 6, height: 6,
                                    border: `1.5px solid ${color}40`, borderTopColor: color,
                                    borderRadius: "50%", animation: "spin 0.7s linear infinite"
                                }} />
                                loading…
                            </div>
                        ) : isReady ? (
                            // State 2: Ready — show "click to enter" hint (no button, whole card is clickable)
                            <div style={{
                                marginTop: 7, padding: "5px 0",
                                border: `1px solid ${color}35`, borderRadius: 6,
                                background: isHov ? `${color}14` : `${color}06`,
                                color: isHov ? color : `${color}70`, fontSize: 7.5,
                                letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700,
                                textAlign: "center", flexShrink: 0,
                                fontFamily: "Inter,sans-serif",
                                transition: "background 0.15s, color 0.15s, border-color 0.15s",
                                borderColor: isHov ? `${color}70` : `${color}30`,
                                boxShadow: isHov ? `0 0 10px ${color}25` : "none",
                                pointerEvents: "none", // whole card handles click
                            }}>
                                {isHov ? "↵ click anywhere to enter" : "↵ expanded · ready"}
                            </div>
                        ) : (child.children && child.children.length > 0) ? (
                            // State 3: Not fetched yet — Expand button only
                            <div
                                data-expand-btn="true"
                                onClick={(e) => { e.stopPropagation(); prefetchNode(child); }}
                                style={{
                                    marginTop: 7, padding: "5px 0",
                                    border: `1px solid ${color}35`, borderRadius: 6,
                                    background: `${color}08`, color: `${color}90`, fontSize: 7.5,
                                    letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700,
                                    textAlign: "center", cursor: "pointer", flexShrink: 0,
                                    fontFamily: "Inter,sans-serif",
                                    transition: "background 0.15s, color 0.15s, border-color 0.15s",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = `${color}18`; e.currentTarget.style.color = color; e.currentTarget.style.borderColor = `${color}60`; }}
                                onMouseLeave={e => { e.currentTarget.style.background = `${color}08`; e.currentTarget.style.color = `${color}90`; e.currentTarget.style.borderColor = `${color}35`; }}
                            >
                                Expand ↓
                            </div>
                        ) : (
                            // State 4: Leaf node
                            <div style={{
                                marginTop: 7, padding: "4px 0",
                                border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 6,
                                color: "rgba(255,255,255,0.2)", fontSize: 7,
                                letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600,
                                textAlign: "center", flexShrink: 0,
                                fontFamily: "Inter,sans-serif",
                            }}>
                                ◇ leaf node
                            </div>
                        )}
                        {isHov && [0, 1, 2].map(ri => (
                            <div key={ri} style={{
                                position: "absolute", width: "100%", height: "100%",
                                border: `1px solid ${color}30`, borderRadius: 14, top: 0, left: 0,
                                pointerEvents: "none",
                                animation: `childRipple ${0.9 + ri * 0.28}s ease-out ${ri * 0.24}s infinite`,
                                transformOrigin: "center center"
                            }} />
                        ))}
                    </div>
                );
            })}

            {/* ── Swap flash ── */}
            {swapFlash && (
                <div style={{
                    position: "absolute", inset: 0,
                    background: "#000",
                    zIndex: 200,
                    pointerEvents: "none",
                }} />
            )}

            {/* Pierce flash */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30,
                background: "radial-gradient(ellipse 40% 40% at 50% 50%,rgba(255,255,255,0.06) 0%,transparent 70%)",
                opacity: flashOp
            }} />
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 31,
                background: "rgba(255,255,255,1)",
                opacity: pierceT > 0.88 && !isPierced ? (1 - pierceT) / 0.12 * 0.05 : 0
            }} />

            {/* Zoom-out overlay */}
            {zoomOutProg > 0 && (
                <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 40,
                    background: `rgba(0,0,0,${zoomOutProg * 0.5})`,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                </div>
            )}

            {/* TOP-LEFT HUD */}
            <div style={{
                position: "absolute", top: 22, left: 26,
                zIndex: 55, fontFamily: "Inter,sans-serif",
                display: "flex", flexDirection: "column", gap: 7,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); goHome(); }}
                        title="Go to root layer"
                        style={{
                            width: 26, height: 26, borderRadius: "50%", padding: 0,
                            background: nodeStack.length > 0 ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.06)",
                            border: nodeStack.length > 0 ? "none" : "1px solid rgba(255,255,255,0.14)",
                            cursor: nodeStack.length > 0 ? "pointer" : "default",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, flexShrink: 0,
                            boxShadow: nodeStack.length > 0 ? "0 0 14px rgba(255,255,255,0.18)" : "none",
                            animation: nodeStack.length > 0 ? "homePulse 2.5s ease-in-out infinite" : "none",
                            transition: "all 0.3s",
                        }}
                    >🏠</button>

                    <div>
                        <div style={{
                            fontSize: 11, color: "rgba(255,255,255,0.5)",
                            letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600, lineHeight: 1.3
                        }}>
                            Semantic Zoom
                        </div>
                        <div style={{
                            fontSize: 9, color: "rgba(255,255,255,0.32)",
                            letterSpacing: "0.1em", textTransform: "uppercase", lineHeight: 1.3
                        }}>
                            {isPierced ? `depth ${currentNode.depth + 1}` : isPiercing ? "piercing…" : `depth ${currentNode.depth}`}
                        </div>
                    </div>
                </div>

                {allLayers.length > 1 && (
                    <div style={{
                        display: "flex", alignItems: "center", gap: 5,
                        paddingLeft: 35,
                        position: "relative",
                    }}>
                        <div style={{
                            position: "absolute", left: 35, right: 0,
                            top: "50%", height: 1,
                            background: "rgba(255,255,255,0.07)",
                            zIndex: 0, pointerEvents: "none",
                        }} />

                        {allLayers.map((layer, idx) => {
                            const isCurrent = layer.stackIndex === -1;
                            const color = CHILD_COLORS[idx % CHILD_COLORS.length];
                            const label = layer.node?.title || `Layer ${idx}`;
                            return (
                                <div
                                    key={idx}
                                    className="layer-bubble"
                                    onClick={(e) => { e.stopPropagation(); if (!isCurrent) goToLayer(layer.stackIndex); }}
                                    style={{
                                        position: "relative", zIndex: 1,
                                        width: isCurrent ? 12 : 8,
                                        height: isCurrent ? 12 : 8,
                                        borderRadius: "50%",
                                        background: isCurrent ? color : "transparent",
                                        border: `1.5px solid ${isCurrent ? color : color + "60"}`,
                                        cursor: isCurrent ? "default" : "pointer",
                                        boxShadow: isCurrent ? `0 0 8px ${color}` : "none",
                                        flexShrink: 0,
                                        animation: `bubblePop 0.28s ease ${idx * 0.04}s both`,
                                    }}
                                >
                                    <div className="bubble-tooltip" style={{
                                        position: "absolute",
                                        top: "calc(100% + 6px)",
                                        left: "50%", transform: "translateX(-50%)",
                                        whiteSpace: "nowrap",
                                        background: "rgba(0,0,0,0.9)",
                                        border: `1px solid ${color}40`,
                                        borderRadius: 5,
                                        padding: "2px 7px",
                                        fontSize: 7.5,
                                        color: isCurrent ? color : "rgba(255,255,255,0.55)",
                                        fontFamily: "Inter,sans-serif",
                                        letterSpacing: "0.07em",
                                        pointerEvents: "none",
                                        opacity: 0,
                                        transition: "opacity 0.12s",
                                        fontWeight: isCurrent ? 700 : 400,
                                        zIndex: 60,
                                    }}>
                                        {label}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* HUD top-right */}
            <div style={{
                position: "absolute", top: 22, right: 26, zIndex: 50,
                fontFamily: "Inter,sans-serif", textAlign: "right", lineHeight: 1.9
            }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.49)" }}>
                    ZOOM{" "}
                    <span style={{
                        color: zoomOutProg > 0 ? "#FF6B35" : isPierced ? "#00FF87" : isPiercing ? "#FF3CAC" : "rgba(255,255,255,0.35)",
                        fontWeight: 600,
                    }}>{z.toFixed(2)}×</span>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.32)" }}>
                    {nodeStack.length > 0 ? "right-click anywhere to go back" : `pierce at ${PIERCE_END}×`}
                </div>
            </div>

            {/* HUD bottom */}
            <div style={{
                position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                pointerEvents: "none", zIndex: 50, fontFamily: "Inter,sans-serif"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>root</span>
                    <div style={{ width: 140, height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                            height: "100%",
                            width: `${clamp((z - MIN_ZOOM) / (ENTER_ZOOM - MIN_ZOOM), 0, 1) * 100}%`,
                            background: zoomOutProg > 0
                                ? "linear-gradient(90deg,#FF6B35,#FFEA00)"
                                : isPierced
                                    ? `linear-gradient(90deg,#00FF87,${hoverIdx >= 0 ? CHILD_COLORS[hoverIdx % CHILD_COLORS.length] : "#00F5FF"})`
                                    : isPiercing
                                        ? "linear-gradient(90deg,#FF3CAC,#7B2FFF)"
                                        : "rgba(255,255,255,0.15)",
                            borderRadius: 2, transition: "background 0.4s",
                        }} />
                    </div>
                    <span style={{
                        fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                        color: isPierced ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)"
                    }}>graph</span>
                </div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    scroll · click expanded node · right-click to go back
                </div>
            </div>
        </div>
    );
}
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

//Factors and trackers for a zoom in effect
const PIERCE_START = 2.0;
const PIERCE_END = 3.2;
const ENTER_ZOOM = 6.5;
const ZOOM_OUT_THRESHOLD = PIERCE_START - 0.2;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 14.0;

// Art-system multi-color palette — each child gets a unique vibrant color
const CHILD_COLORS = [
    "#FF3CAC", // hot pink
    "#00F5FF", // electric cyan
    "#FFEA00", // vivid yellow
    "#7B2FFF", // deep violet
    "#00FF87", // neon green
    "#FF6B35", // burning orange
    "#FF007F", // rose red
    "#39FF14", // acid green
    "#BF5FFF", // lavender purple
    "#00BFFF", // sky blue
];

const ROOT_W = 220;
const ROOT_H = 160;
const CARD_W = 190;
const CARD_H = 150; // a bit taller to show full info
const CARD_WORLD_GAP = 36;

const API_BASE = "http://localhost:8000";

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

export default function GraphDashboard() {
    const wrapRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const graphData = location.state || null;

    const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
    const [currentNode, setCurrentNode] = useState(graphData || {});
    const [expandedData, setExpandedData] = useState({});
    const [prefetchingIds, setPrefetchingIds] = useState(new Set());
    const [nodeStack, setNodeStack] = useState([]);

    const currentNodeRef = useRef(currentNode);
    const expandedDataRef = useRef(expandedData);
    const prefetchingRef = useRef(prefetchingIds);
    const nodeStackRef = useRef(nodeStack);
    const vpRef = useRef(vp);
    currentNodeRef.current = currentNode;
    expandedDataRef.current = expandedData;
    prefetchingRef.current = prefetchingIds;
    nodeStackRef.current = nodeStack;
    vpRef.current = vp;

    const graphId = graphData?.id;

    const S = useRef({
        zoom: 1, targetZoom: 1,
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
        rootOffX: 0,
        rootOffY: 0,
        swapping: false,
    }).current;

    const [, setTick] = useState(0);
    const [swapFlash, setSwapFlash] = useState(false);

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

    const prefetchNode = useCallback(async (child) => {
        if (expandedDataRef.current[child.id]) return;
        if (prefetchingRef.current.has(child.id)) return;
        setPrefetchingIds(prev => new Set([...prev, child.id]));
        try {
            const res = await fetch(`${API_BASE}/expand-node`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    graph_id: graphId,
                    node_id: child.id,
                    title: child.title,
                    depth: child.depth,
                    max_nodes: 5,
                }),
            });
            if (!res.ok) throw new Error("expand failed");
            const expanded = await res.json();
            setExpandedData(prev => ({ ...prev, [child.id]: expanded }));
        } catch (err) {
            console.error("Prefetch error:", err);
        } finally {
            setPrefetchingIds(prev => { const n = new Set(prev); n.delete(child.id); return n; });
        }
    }, [graphId]);

    useEffect(() => {
        let raf;
        const loop = () => {
            S.zoom = lerp(S.zoom, S.targetZoom, 0.09);
            S.panX = lerp(S.panX, S.targetPanX, 0.09);
            S.panY = lerp(S.panY, S.targetPanY, 0.09);

            const node = currentNodeRef.current;
            const children = node?.children || [];
            const { w: VW, h: VH } = vpRef.current;

            const pierceT = clamp(
                (S.zoom - PIERCE_START) / (PIERCE_END - PIERCE_START), 0, 1
            );
            S.childReveal = pierceT >= 1
                ? Math.min(1, S.childReveal + 0.025)
                : Math.max(0, S.childReveal - 0.05);

            const wPos = worldCardPositions(children.length);

            if (S.childReveal > 0.05 && children.length > 0 && !S.transitioning) {
                let found = -1;
                for (let i = 0; i < children.length; i++) {
                    const worldX = S.rootOffX + wPos[i].x;
                    const worldY = S.rootOffY + wPos[i].y;
                    const { sx, sy } = w2s(worldX, worldY, S.zoom, S.panX, S.panY, VW, VH);
                    const hw = (CARD_W * S.zoom) / 2;
                    const hh = (CARD_H * S.zoom) / 2;
                    if (
                        S.cursorX >= sx - hw && S.cursorX <= sx + hw &&
                        S.cursorY >= sy - hh && S.cursorY <= sy + hh
                    ) {
                        found = i; break;
                    }
                }
                S.hoverChildIndex = found;
                children.forEach(c => { if (c.has_children) prefetchNode(c); });
            } else if (S.childReveal === 0) {
                S.hoverChildIndex = -1;
            }

            if (!S.transitioning && S.hoverChildIndex >= 0 && S.targetZoom >= ENTER_ZOOM) {
                const idx = S.hoverChildIndex;
                const child = children[idx];
                const expanded = expandedDataRef.current[child?.id];
                if (child && expanded) {
                    S.transitioning = true;
                    const saved = {
                        zoom: S.zoom, panX: S.panX, panY: S.panY,
                        rootOffX: S.rootOffX, rootOffY: S.rootOffY,
                    };
                    queueMicrotask(() => {
                        setNodeStack(prev => [...prev, { node: currentNodeRef.current, ...saved }]);
                        S.zoom = PIERCE_END + 0.05;
                        S.targetZoom = PIERCE_END + 0.05;
                        S.panX = 0; S.panY = 0;
                        S.targetPanX = 0; S.targetPanY = 0;
                        S.rootOffX = 0; S.rootOffY = 0;
                        S.childReveal = 0;
                        S.hoverChildIndex = -1;
                        S.transitioning = false;
                        S.zoomOutFired = false;
                        setCurrentNode({ ...child, children: expanded.children || [] });
                    });
                }
            }

            if (!S.transitioning && nodeStackRef.current.length > 0
                && S.targetZoom < ZOOM_OUT_THRESHOLD && !S.zoomOutFired) {
                S.zoomOutFired = true;
                S.transitioning = true;
                queueMicrotask(() => {
                    const entry = nodeStackRef.current[nodeStackRef.current.length - 1];
                    S.zoom = PIERCE_END + 0.05;
                    S.targetZoom = PIERCE_END + 0.05;
                    S.panX = 0; S.panY = 0;
                    S.targetPanX = 0; S.targetPanY = 0;
                    S.rootOffX = 0; S.rootOffY = 0;
                    S.childReveal = 0;
                    S.hoverChildIndex = -1;
                    S.transitioning = false;
                    S.zoomOutFired = false;
                    setSwapFlash(true);
                    setTimeout(() => setSwapFlash(false), 80);
                    setNodeStack(s => s.slice(0, -1));
                    setCurrentNode(entry.node);
                });
            }
            if (S.targetZoom > ZOOM_OUT_THRESHOLD + 0.5) S.zoomOutFired = false;

            setTick(t => t + 1);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const onMouseDown = useCallback((e) => { S.isPanning = true; S.lastMouse = { x: e.clientX, y: e.clientY }; }, [S]);
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

    const goBack = useCallback(() => {
        const stack = nodeStackRef.current;
        if (stack.length === 0) return;
        const entry = stack[stack.length - 1];
        S.zoom = PIERCE_END + 0.05; S.targetZoom = PIERCE_END + 0.05;
        S.panX = 0; S.panY = 0;
        S.targetPanX = 0; S.targetPanY = 0;
        S.rootOffX = 0; S.rootOffY = 0;
        S.childReveal = 0; S.hoverChildIndex = -1;
        S.transitioning = false; S.zoomOutFired = false;
        S.swapping = false;
        setSwapFlash(true);
        setTimeout(() => setSwapFlash(false), 80);
        setNodeStack(s => s.slice(0, -1));
        setCurrentNode(entry.node);
    }, [S]);

    if (!graphData) { navigate("/"); return null; }

    const isSwapping = S.swapping;
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
        ? clamp((S.targetZoom - PIERCE_END) / (ENTER_ZOOM - PIERCE_END), 0, 1)
        : 0;
    const zoomOutProg = nodeStack.length > 0
        ? clamp((ZOOM_OUT_THRESHOLD + 0.3 - S.targetZoom) / 0.3, 0, 1)
        : 0;

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
                        100% { background-position: 200% center; }
                    }
                    @keyframes artGlow {
                        0%   { opacity: 0.6; }
                        33%  { opacity: 1; }
                        66%  { opacity: 0.7; }
                        100% { opacity: 0.6; }
                    }
                `}</style>

            {/* Subtle grid overlay for depth */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
                backgroundImage: `
                        linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
                    `,
                backgroundSize: "60px 60px",
            }} />

            {/* Scanline texture */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
                backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 3px)",
            }} />

            {/* ── Root card ── */}
            {!isSwapping && (
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
                    borderRadius: 16,
                    padding: "20px 22px 16px",
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,1), inset 0 1px 0 rgba(255,255,255,0.06)",
                    animation: !isPiercing && !isPierced ? "breathe 3.5s ease-in-out infinite" : "none",
                    fontFamily: "Inter, sans-serif",
                    zIndex: 10,
                    overflow: "hidden",
                }}>
                    {/* Top white accent line */}
                    <div style={{
                        position: "absolute", top: 0, left: 0, right: 0, height: 2, borderRadius: "16px 16px 0 0",
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
                    }} />

                    {/* Depth badge */}
                    <div style={{
                        fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.35)",
                        textTransform: "uppercase", fontWeight: 600, marginBottom: 10,
                        display: "flex", alignItems: "center", gap: 7, fontFamily: "Inter, sans-serif",
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: "50%", background: "#fff",
                            display: "inline-block", boxShadow: "0 0 8px rgba(255,255,255,0.8)",
                            animation: "dotPulse 2s ease-in-out infinite", flexShrink: 0,
                        }} />
                        {currentNode.depth === 0 ? "Root · Depth 0" : `Node · Depth ${currentNode.depth}`}
                    </div>

                    {/* Title — Permanent Marker */}
                    <div style={{
                        fontSize: 15, fontWeight: 400, color: "#ffffff",
                        lineHeight: 1.25, marginBottom: 10,
                        fontFamily: "'Permanent Marker', cursive",
                        letterSpacing: "0.01em",
                        textShadow: "0 0 20px rgba(255,255,255,0.15)",
                    }}>
                        {currentNode.title}
                    </div>

                    {/* Description */}
                    <div style={{
                        fontSize: 8, color: "rgba(255,255,255,0.38)",
                        lineHeight: 1.7, borderTop: "1px solid rgba(255,255,255,0.06)",
                        paddingTop: 10, fontFamily: "Inter, sans-serif",
                    }}>
                        {currentNode.description}
                    </div>

                    {/* Footer */}
                    <div style={{
                        marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center",
                        fontFamily: "Inter, sans-serif",
                    }}>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                            {children.length} nodes
                        </span>
                    </div>

                    {/* Ripple rings on pierce */}
                    {isPiercing && [0, 1, 2].map(i => (
                        <div key={i} style={{
                            position: "absolute", width: "100%", height: "100%",
                            border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16,
                            top: 0, left: 0, pointerEvents: "none",
                            animation: `ripple ${0.85 + i * 0.28}s ease-out ${i * 0.22}s infinite`,
                            transformOrigin: "center center",
                        }} />
                    ))}
                </div>
            )}

            {/* ── Child cards ── */}
            {!isSwapping && children.map((child, i) => {
                const sc = childSc[i];
                const color = CHILD_COLORS[i % CHILD_COLORS.length];
                const revT = clamp((childReveal - i * 0.08) / 0.6, 0, 1);
                const isHov = hoverIdx === i;
                const isFetching = prefetchingIds.has(child.id);
                const isReady = !!expandedData[child.id];
                const ep = isHov ? enterProg : 0;
                const cardScale = z;
                const hoverBump = isHov ? 1 + ep * 0.04 : 1;
                const opacity = easeOut(revT);

                // Multi-color glow on hover — cycling through the palette
                const glowColor = color;
                const glowSize = isHov ? 40 + ep * 60 : 0;

                return (
                    <div key={child.id} style={{
                        position: "absolute",
                        width: CARD_W, height: CARD_H,
                        left: sc.sx - (CARD_W * cardScale * hoverBump) / 2,
                        top: sc.sy - (CARD_H * cardScale * hoverBump) / 2,
                        transform: `scale(${cardScale * hoverBump})`,
                        transformOrigin: "top left",
                        opacity,
                        background: "#000",
                        border: isHov
                            ? `1.5px solid ${color}`
                            : "1px solid rgba(255,255,255,0.09)",
                        borderRadius: 14,
                        padding: "14px 16px 12px",
                        boxShadow: isHov
                            ? `0 0 0 1px ${color}22, 0 16px 60px rgba(0,0,0,0.95), 0 0 ${glowSize}px ${color}55, inset 0 1px 0 rgba(255,255,255,0.07)`
                            : "0 0 0 1px rgba(255,255,255,0.03), 0 8px 30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.03)",
                        fontFamily: "Inter, sans-serif",
                        zIndex: isHov ? 11 : 9,
                        overflow: "hidden",
                        display: "flex", flexDirection: "column",
                        pointerEvents: childReveal > 0.2 ? "auto" : "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                    }}>
                        {/* Top color accent bar */}
                        <div style={{
                            position: "absolute", top: 0, left: 0, right: 0,
                            height: isHov ? 3 : 1.5, borderRadius: "14px 14px 0 0",
                            background: isHov
                                ? `linear-gradient(90deg, transparent, ${color}, ${CHILD_COLORS[(i + 2) % CHILD_COLORS.length]}, ${color}, transparent)`
                                : `linear-gradient(90deg, transparent, ${color}60, transparent)`,
                            backgroundSize: isHov ? "200% auto" : "100%",
                            animation: isHov ? "shimmer 2s linear infinite" : "none",
                        }} />

                        {/* Enter-progress fill — bottom bar */}
                        {isHov && ep > 0 && (
                            <div style={{
                                position: "absolute", bottom: 0, left: 0,
                                width: `${ep * 100}%`, height: 2,
                                background: `linear-gradient(90deg, ${color}80, ${color})`,
                                borderRadius: "0 0 0 14px",
                            }} />
                        )}

                        {/* Corner color dot */}
                        <div style={{
                            position: "absolute", top: 12, right: 12,
                            width: isHov ? 8 : 5, height: isHov ? 8 : 5,
                            borderRadius: "50%",
                            background: isHov ? color : "rgba(255,255,255,0.2)",
                            boxShadow: isHov ? `0 0 14px ${color}` : "none",
                            transition: "all 0.2s",
                        }} />

                        {/* Badge row */}
                        <div style={{
                            fontSize: 5.5, letterSpacing: "0.12em",
                            color: isHov ? color : "rgba(255,255,255,0.25)",
                            textTransform: "uppercase", fontWeight: 600,
                            marginBottom: 7, display: "flex", alignItems: "center", gap: 5,
                            fontFamily: "Inter, sans-serif",
                            transition: "color 0.2s",
                        }}>
                            {isFetching
                                ? <><span style={{
                                    display: "inline-block", width: 7, height: 7,
                                    border: `1.5px solid ${color}40`, borderTopColor: color,
                                    borderRadius: "50%", animation: "spin 0.7s linear infinite",
                                }} />fetching</>
                                : isReady
                                    ? (isHov && ep > 0.05 ? `◉ entering ${Math.round(ep * 100)}%` : "◈ ready")
                                    : child.has_children ? "◆ node" : "◇ leaf"
                            }{" "}· depth {child.depth}
                        </div>

                        {/* Title — Permanent Marker */}
                        <div style={{
                            fontSize: 12,
                            fontFamily: "'Permanent Marker', cursive",
                            color: isHov ? "#ffffff" : "rgba(255,255,255,0.82)",
                            lineHeight: 1.3, marginBottom: 8,
                            textShadow: isHov ? `0 0 20px ${color}60` : "none",
                            transition: "text-shadow 0.2s, color 0.2s",
                        }}>
                            {child.title}
                        </div>

                        {/* Divider */}
                        <div style={{
                            width: "100%", height: 1,
                            background: isHov
                                ? `linear-gradient(90deg, transparent, ${color}50, transparent)`
                                : "rgba(255,255,255,0.05)",
                            marginBottom: 8, flexShrink: 0,
                            transition: "background 0.2s",
                        }} />

                        {/* Full description — Inter, no truncation */}
                        <div style={{
                            fontSize: 6,
                            color: isHov ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.28)",
                            lineHeight: 1.65, flex: 1,
                            fontFamily: "Inter, sans-serif",
                            transition: "color 0.2s",
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                            overflow: "hidden",
                        }}>
                            {child.description || "No description available."}
                        </div>

                        {/* Fetching state footer */}
                        {isHov && !isReady && child.has_children && (
                            <div style={{
                                marginTop: 7, padding: "4px 0",
                                border: `1px solid ${color}20`, borderRadius: 6,
                                background: `${color}06`,
                                color: `${color}60`, fontSize: 7.5,
                                letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600,
                                textAlign: "center", display: "flex", alignItems: "center",
                                justifyContent: "center", gap: 5, flexShrink: 0,
                                fontFamily: "Inter, sans-serif",
                            }}>
                                <span style={{
                                    display: "inline-block", width: 6, height: 6,
                                    border: `1.5px solid ${color}35`, borderTopColor: color,
                                    borderRadius: "50%", animation: "spin 0.7s linear infinite",
                                }} />
                                fetching deeper nodes…
                            </div>
                        )}

                        {/* Hover ripple rings */}
                        {isHov && [0, 1, 2].map(ri => (
                            <div key={ri} style={{
                                position: "absolute", width: "100%", height: "100%",
                                border: `1px solid ${color}30`, borderRadius: 14,
                                top: 0, left: 0, pointerEvents: "none",
                                animation: `childRipple ${0.9 + ri * 0.28}s ease-out ${ri * 0.24}s infinite`,
                                transformOrigin: "center center",
                            }} />
                        ))}
                    </div>
                );
            })}

            {/* Swap flash */}
            {swapFlash && (
                <div style={{
                    position: "absolute", inset: 0, background: "#000",
                    zIndex: 100, pointerEvents: "none",
                }} />
            )}

            {/* Pierce flash overlay */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30,
                background: "radial-gradient(ellipse 40% 40% at 50% 50%, rgba(255,255,255,0.06) 0%, transparent 70%)",
                opacity: flashOp,
            }} />
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 31,
                background: "rgba(255,255,255,1)",
                opacity: pierceT > 0.88 && !isPierced ? (1 - pierceT) / 0.12 * 0.05 : 0,
            }} />

            {/* Zoom-out overlay */}
            {zoomOutProg > 0 && (
                <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 40,
                    background: `rgba(0,0,0,${zoomOutProg * 0.5})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                    <div style={{
                        fontFamily: "Inter, sans-serif", fontSize: 10,
                        color: "rgba(255,255,255,0.6)", letterSpacing: "0.2em",
                        textTransform: "uppercase", opacity: zoomOutProg,
                        animation: "outPulse 0.9s ease-in-out infinite",
                    }}>
                        ← resurfacing…
                    </div>
                </div>
            )}

            {/* Back button */}
            {nodeStack.length > 0 && (
                <button onClick={goBack} style={{
                    position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)",
                    zIndex: 55,
                    width: "350px",
                    background: "#000",
                    border: "1px solid rgba(255,255,255,0.15)",
                    justifyContent: "center",
                    borderRadius: 8, padding: "7px 20px",
                    color: "rgba(255,255,255,0.7)", fontSize: 9,
                    letterSpacing: "0.15em", textTransform: "uppercase",
                    fontWeight: 600, fontFamily: "Inter, sans-serif", cursor: "pointer",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
                    display: "flex", alignItems: "center", gap: 8,
                    animation: "fadeUp 0.3s ease",
                }}>
                    ← {nodeStack[nodeStack.length - 1]?.node?.title}
                </button>
            )}

            {/* HUD top-left */}
            <div style={{
                position: "absolute", top: 22, left: 26, zIndex: 50,
                fontFamily: "Inter, sans-serif", lineHeight: 1.9,
            }}>
                <div style={{
                    fontSize: 11, color: "rgba(255,255,255,0.5)",
                    letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600,
                }}>
                    Semantic Zoom
                </div>
                <div style={{ fontSize: 9, color: "rgba(255, 255, 255, 0.49)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {isPierced ? `depth ${currentNode.depth + 1}` : isPiercing ? "piercing…" : `depth ${currentNode.depth}`}
                </div>
            </div>

            {/* HUD top-right */}
            <div style={{
                position: "absolute", top: 22, right: 26, zIndex: 50,
                fontFamily: "Inter, sans-serif", textAlign: "right", lineHeight: 1.9,
            }}>
                <div style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.49)" }}>
                    ZOOM  <span className="ms-2" style={{
                        color: zoomOutProg > 0 ? "#FF6B35"
                            : isPierced ? "#00FF87"
                                : isPiercing ? "#FF3CAC"
                                    : "rgba(255,255,255,0.35)",
                        fontWeight: 600,
                    }}>{z.toFixed(2)}×</span>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255, 255, 255, 0.49)" }}>
                    {nodeStack.length > 0 ? "scroll out to resurface" : `pierce at ${PIERCE_END}×`}
                </div>
            </div>

            {/* HUD bottom */}
            <div style={{
                position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                pointerEvents: "none", zIndex: 50, fontFamily: "Inter, sans-serif",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>root</span>
                    <div style={{
                        width: 140, height: 2, background: "rgba(255,255,255,0.06)",
                        borderRadius: 2, overflow: "hidden",
                    }}>
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
                        color: isPierced ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)",
                    }}>graph</span>
                </div>
            </div>
        </div>
    );
}
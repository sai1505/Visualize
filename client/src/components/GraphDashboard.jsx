import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ── Constants ──────────────────────────────────────────────────────────────────
const PIERCE_START = 2.0;
const PIERCE_END = 3.2;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 14.0;
const CHILD_COLORS = ["#4ade80", "#38bdf8", "#a78bfa", "#fb923c", "#f472b6"];
const ROOT_W = 300;
const ROOT_H = 180;
const CARD_W = 220;
const CARD_H = 165;
const CARD_GAP = 12;

const API_BASE = "http://localhost:8000";

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t) => Math.pow(Math.min(1, Math.max(0, t)), 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function cardPositions(count) {
    const totalW = count * CARD_W + (count - 1) * CARD_GAP;
    const startX = -totalW / 2 + CARD_W / 2;
    return Array.from({ length: count }, (_, i) => ({
        x: startX + i * (CARD_W + CARD_GAP),
        y: 0,
    }));
}

// All positions are in SCREEN space directly — no world transform needed
// We track a "base pan" that resets on each node transition
// zoom is always relative to current node (starts at 1, pierce at PIERCE_END)
function worldToScreen(wx, wy, zoom, panX, panY, vw, vh) {
    return {
        sx: vw / 2 + panX + wx * zoom,
        sy: vh / 2 + panY + wy * zoom,
    };
}

function isOverCard(mx, my, sx, sy, scale) {
    const hw = (CARD_W * scale) / 2;
    const hh = (CARD_H * scale) / 2;
    return mx >= sx - hw && mx <= sx + hw && my >= sy - hh && my <= sy + hh;
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
    // stack entries: { node, zoom, panX, panY }
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

    // S holds all mutable animation state — updated every rAF, never causes re-render
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
        // offset of current node's root card in world space (0,0 = screen center at zoom=1)
        // This resets to 0,0 on each transition — the "world" re-centers on the new node
        rootOffX: 0,
        rootOffY: 0,
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

    // ── Prefetch ────────────────────────────────────────────────────────────────
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

    // ── rAF loop ────────────────────────────────────────────────────────────────
    useEffect(() => {
        let raf;
        const loop = () => {
            S.zoom = lerp(S.zoom, S.targetZoom, 0.09);
            S.panX = lerp(S.panX, S.targetPanX, 0.09);
            S.panY = lerp(S.panY, S.targetPanY, 0.09);

            const node = currentNodeRef.current;
            const children = node?.children || [];
            const { w: VW, h: VH } = vpRef.current;

            // pierce is purely zoom-driven, resets each time zoom resets to 1
            const pierceT = clamp((S.zoom - PIERCE_START) / (PIERCE_END - PIERCE_START), 0, 1);
            S.childReveal = pierceT >= 1
                ? Math.min(1, S.childReveal + 0.025)
                : Math.max(0, S.childReveal - 0.05);

            // card positions in local world space (relative to current node center)
            const localPos = cardPositions(children.length);

            // ── Hover detection ─────────────────────────────────────────────────────
            if (S.childReveal > 0 && children.length > 0 && !S.transitioning) {
                let found = -1;
                for (let i = 0; i < children.length; i++) {
                    // local card position + root offset, then to screen
                    const wx = S.rootOffX + localPos[i].x;
                    const wy = S.rootOffY + localPos[i].y;
                    const sc = worldToScreen(wx, wy, S.zoom, S.panX, S.panY, VW, VH);
                    const revT = clamp((S.childReveal - i * 0.08) / 0.6, 0, 1);
                    const zg = 1 + clamp((S.zoom - PIERCE_END) * 0.045, 0, 0.35);
                    const cs = (0.84 + easeOut(revT) * 0.16) * zg;
                    if (isOverCard(S.cursorX, S.cursorY, sc.sx, sc.sy, cs)) {
                        found = i; break;
                    }
                }
                S.hoverChildIndex = found;

                // prefetch all visible cards immediately
                children.forEach(c => { if (c.has_children) prefetchNode(c); });
            } else if (S.childReveal === 0) {
                S.hoverChildIndex = -1;
            }

            // ── Zoom-IN transition ───────────────────────────────────────────────────
            if (!S.transitioning && S.hoverChildIndex >= 0 && pierceT >= 1) {
                const idx = S.hoverChildIndex;
                const child = children[idx];
                const expanded = expandedDataRef.current[child?.id];
                if (child && expanded) {
                    S.transitioning = true;

                    // The child card's local world position
                    const cardLocalX = localPos[idx].x;
                    const cardLocalY = localPos[idx].y;
                    // Its screen position right now
                    const wx = S.rootOffX + cardLocalX;
                    const wy = S.rootOffY + cardLocalY;
                    const sc = worldToScreen(wx, wy, S.zoom, S.panX, S.panY, VW, VH);

                    // Save state for zoom-out
                    const savedZoom = S.zoom;
                    const savedPanX = S.panX;
                    const savedPanY = S.panY;
                    const savedRootOffX = S.rootOffX;
                    const savedRootOffY = S.rootOffY;

                    queueMicrotask(() => {
                        setNodeStack(prev => [...prev, {
                            node: currentNodeRef.current,
                            zoom: savedZoom,
                            panX: savedPanX,
                            panY: savedPanY,
                            rootOffX: savedRootOffX,
                            rootOffY: savedRootOffY,
                        }]);

                        // Reset zoom to 1 for the new node
                        S.zoom = 1;
                        S.targetZoom = 1;

                        // The new node's root card should appear at exactly where the
                        // child card is on screen right now.
                        // screenX = VW/2 + panX + rootOffX * zoom
                        // We want: VW/2 + newPanX + 0 * 1 = sc.sx
                        // => newPanX = sc.sx - VW/2
                        const { w: W, h: H } = vpRef.current;
                        S.panX = sc.sx - W / 2;
                        S.panY = sc.sy - H / 2;
                        S.targetPanX = S.panX;
                        S.targetPanY = S.panY;
                        S.rootOffX = 0;
                        S.rootOffY = 0;

                        S.childReveal = 0;
                        S.hoverChildIndex = -1;
                        S.transitioning = false;
                        S.zoomOutFired = false;

                        setCurrentNode({
                            ...child,
                            children: expanded.children || [],
                        });
                    });
                }
            }

            // ── Zoom-OUT transition ──────────────────────────────────────────────────
            if (!S.transitioning && nodeStackRef.current.length > 0 && S.zoom < 0.5 && !S.zoomOutFired) {
                S.zoomOutFired = true;
                S.transitioning = true;
                queueMicrotask(() => {
                    const stack = nodeStackRef.current;
                    const entry = stack[stack.length - 1];
                    S.zoom = entry.zoom;
                    S.targetZoom = entry.zoom;
                    S.panX = entry.panX;
                    S.panY = entry.panY;
                    S.targetPanX = entry.panX;
                    S.targetPanY = entry.panY;
                    S.rootOffX = entry.rootOffX;
                    S.rootOffY = entry.rootOffY;
                    S.childReveal = 0;
                    S.hoverChildIndex = -1;
                    S.transitioning = false;
                    S.zoomOutFired = false;
                    setNodeStack(s => s.slice(0, -1));
                    setCurrentNode(entry.node);
                });
            }
            if (S.zoom > 0.65) S.zoomOutFired = false;

            setTick(t => t + 1);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Wheel: zoom toward cursor ────────────────────────────────────────────────
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onWheel = (e) => {
            e.preventDefault();
            const { w: VW, h: VH } = vpRef.current;
            const factor = e.deltaY < 0 ? 1.12 : 0.90;
            const oldZoom = S.targetZoom;
            const newZoom = clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
            // zoom toward cursor — no forced pan
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
        S.zoom = entry.zoom; S.targetZoom = entry.zoom;
        S.panX = entry.panX; S.panY = entry.panY;
        S.targetPanX = entry.panX; S.targetPanY = entry.panY;
        S.rootOffX = entry.rootOffX; S.rootOffY = entry.rootOffY;
        S.childReveal = 0; S.hoverChildIndex = -1;
        S.transitioning = false; S.zoomOutFired = false;
        setNodeStack(s => s.slice(0, -1));
        setCurrentNode(entry.node);
    }, [S]);

    if (!graphData) { navigate("/"); return null; }

    // ── Render ───────────────────────────────────────────────────────────────────
    const z = S.zoom;
    const pierceT = clamp((z - PIERCE_START) / (PIERCE_END - PIERCE_START), 0, 1);
    const isPiercing = pierceT > 0 && pierceT < 1;
    const isPierced = pierceT >= 1;
    const childReveal = S.childReveal;

    const children = currentNode.children || [];
    const localPos = cardPositions(children.length);
    const { w: VW, h: VH } = vp;

    // Root card screen pos
    const rootSc = worldToScreen(S.rootOffX, S.rootOffY, z, S.panX, S.panY, VW, VH);

    const rootBloat = 1 + pierceT * 0.3;
    const rootOpacity = isPierced ? 0 : clamp(1 - easeIn(pierceT * 1.1), 0, 1);
    const flashOp = isPiercing ? easeIn(pierceT) * 0.18 : 0;

    const hoverIdx = S.hoverChildIndex;
    const globalPierceT = pierceT;

    // Child card screen positions
    const childSc = localPos.map(p =>
        worldToScreen(S.rootOffX + p.x, S.rootOffY + p.y, z, S.panX, S.panY, VW, VH)
    );

    const hex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
    const zoomOutProg = nodeStack.length > 0 ? clamp((0.65 - z) / (0.65 - 0.5), 0, 1) : 0;

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
                width: "100vw", height: "100vh", background: "#030712",
                overflow: "hidden", position: "relative",
                cursor: S.isPanning ? "grabbing" : "grab",
                userSelect: "none",
            }}
        >
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing:border-box; }
        @keyframes breathe {
          0%,100% { box-shadow:0 0 40px rgba(74,222,128,0.12),0 24px 70px rgba(0,0,0,0.7); }
          50%      { box-shadow:0 0 60px rgba(74,222,128,0.22),0 24px 70px rgba(0,0,0,0.7); }
        }
        @keyframes dotPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.2; transform:scale(0.6); }
        }
        @keyframes ripple {
          0%   { transform:scale(0.3); opacity:0.6; }
          100% { transform:scale(3);   opacity:0; }
        }
        @keyframes childRipple {
          0%   { transform:scale(0.5); opacity:0.45; }
          100% { transform:scale(2.5); opacity:0; }
        }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(5px) translateX(-50%); }
          to   { opacity:1; transform:translateY(0) translateX(-50%); }
        }
        @keyframes outPulse {
          0%,100% { opacity:0.5; }
          50%      { opacity:1; }
        }
      `}</style>

            {/* BG glow */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                background: isPierced
                    ? "radial-gradient(ellipse 70% 60% at 50% 50%,rgba(56,189,248,0.04) 0%,transparent 70%)"
                    : "radial-gradient(ellipse 55% 55% at 50% 50%,rgba(74,222,128,0.03) 0%,transparent 70%)",
                transition: "background 1.2s"
            }} />
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 60,
                backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.012) 3px,rgba(0,0,0,0.012) 4px)"
            }} />

            {/* ── Root card ── */}
            <div style={{
                position: "absolute",
                width: ROOT_W, height: ROOT_H,
                left: rootSc.sx - (ROOT_W * z * rootBloat) / 2,
                top: rootSc.sy - (ROOT_H * z * rootBloat) / 2,
                transform: `scale(${z * rootBloat})`,
                transformOrigin: "top left",
                opacity: rootOpacity,
                pointerEvents: isPierced ? "none" : "auto",
                background: "linear-gradient(150deg,rgba(12,20,40,0.97) 0%,rgba(18,28,52,0.95) 60%,rgba(10,18,36,0.97) 100%)",
                border: "1px solid rgba(74,222,128,0.35)",
                borderRadius: 18, padding: "20px 22px 16px",
                backdropFilter: "blur(28px)",
                boxShadow: "0 0 0 1px rgba(74,222,128,0.04),0 24px 70px rgba(0,0,0,0.75),inset 0 1px 0 rgba(255,255,255,0.05)",
                animation: !isPiercing && !isPierced ? "breathe 3.2s ease-in-out infinite" : "none",
                fontFamily: "'Space Mono',monospace", zIndex: 10, overflow: "hidden",
            }}>
                <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg,transparent,rgba(74,222,128,0.45),transparent)" }} />
                <div style={{ position: "absolute", top: 16, bottom: 16, left: 0, width: 2, borderRadius: "0 2px 2px 0", background: "linear-gradient(180deg,transparent,rgba(74,222,128,0.38),transparent)" }} />
                <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#4ade80", textTransform: "uppercase", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block", boxShadow: "0 0 9px #4ade80", animation: "dotPulse 1.8s ease-in-out infinite", flexShrink: 0 }} />
                    {currentNode.depth === 0 ? "Root · Depth 0" : `Node · Depth ${currentNode.depth}`}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e2f0ff", lineHeight: 1.3, marginBottom: 10, letterSpacing: "-0.02em" }}>
                    {currentNode.title}
                </div>
                <div style={{ fontSize: 10, color: "#3a5070", lineHeight: 1.65, borderTop: "1px solid rgba(74,222,128,0.07)", paddingTop: 10 }}>
                    {currentNode.description}
                </div>
                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "#1a2e40", letterSpacing: "0.1em", textTransform: "uppercase" }}>{children.length} nodes</span>
                    <span style={{
                        fontSize: 9, color: "#4ade80", letterSpacing: "0.1em", textTransform: "uppercase",
                        opacity: pierceT === 0 ? 0.65 : 0, transition: "opacity 0.3s", animation: "dotPulse 2.5s ease-in-out infinite"
                    }}>
                        scroll to pierce →
                    </span>
                </div>
                {isPiercing && [0, 1, 2].map(i => (
                    <div key={i} style={{
                        position: "absolute", width: "100%", height: "100%",
                        border: "1px solid rgba(74,222,128,0.28)", borderRadius: 18, top: 0, left: 0, pointerEvents: "none",
                        animation: `ripple ${0.85 + i * 0.28}s ease-out ${i * 0.22}s infinite`, transformOrigin: "center center"
                    }} />
                ))}
            </div>

            {/* ── Child cards ── */}
            {children.map((child, i) => {
                const sc = childSc[i];
                const color = CHILD_COLORS[i % CHILD_COLORS.length];
                const revT = clamp((childReveal - i * 0.08) / 0.6, 0, 1);
                const isHov = hoverIdx === i;
                const cp = isHov ? globalPierceT : 0;
                const isFetching = prefetchingIds.has(child.id);
                const isReady = !!expandedData[child.id];

                const zoomGrow = isPierced ? 1 + clamp((z - PIERCE_END) * 0.045, 0, 0.35) : 1;
                const hoverGrow = isHov ? 1 + cp * 0.14 : 1;
                const totalScale = (0.84 + easeOut(revT) * 0.16) * zoomGrow * hoverGrow;

                const pierceOp = isHov && cp > 0.6
                    ? clamp(1 - easeIn((cp - 0.6) / 0.4) * 0.88, 0.12, 1)
                    : 1;
                const cardOp = easeOut(revT) * pierceOp;

                return (
                    <div key={child.id} style={{
                        position: "absolute",
                        width: CARD_W, height: CARD_H,
                        left: sc.sx - CARD_W / 2,
                        top: sc.sy - CARD_H / 2,
                        opacity: cardOp,
                        transform: `scale(${totalScale})`,
                        transformOrigin: "center center",
                        background: "linear-gradient(145deg,rgba(12,20,40,0.97) 0%,rgba(16,26,46,0.95) 100%)",
                        border: isHov && cp > 0
                            ? `1.5px solid ${color}${hex2(50 + cp * 150)}`
                            : `1px solid ${color}32`,
                        borderRadius: 12, padding: "12px 14px 10px",
                        boxShadow: isHov && cp > 0
                            ? `0 0 0 1px ${color}15,0 10px 40px rgba(0,0,0,0.8),0 0 ${Math.round(cp * 36)}px ${color}${hex2(cp * 33)},inset 0 1px 0 rgba(255,255,255,0.05)`
                            : `0 0 0 1px ${color}08,0 6px 24px rgba(0,0,0,0.55),inset 0 1px 0 rgba(255,255,255,0.03)`,
                        fontFamily: "'Space Mono',monospace",
                        zIndex: isHov ? 11 : 9,
                        overflow: "hidden", display: "flex", flexDirection: "column",
                    }}>
                        <div style={{
                            position: "absolute", top: 0, left: 0, right: 0, height: isHov ? 3 : 2, borderRadius: "12px 12px 0 0",
                            background: `linear-gradient(90deg,transparent,${color}${isHov ? "cc" : "65"},transparent)`
                        }} />
                        <div style={{
                            position: "absolute", top: 10, right: 10, width: isHov ? 6 : 4, height: isHov ? 6 : 4,
                            borderRadius: "50%", background: color, boxShadow: `0 0 ${isHov ? 11 : 6}px ${color}`, opacity: isHov ? 1 : 0.42
                        }} />

                        <div style={{ fontSize: 7.5, letterSpacing: "0.12em", color, textTransform: "uppercase", fontWeight: 700, marginBottom: 5, opacity: 0.8, display: "flex", alignItems: "center", gap: 4 }}>
                            {isFetching
                                ? <><span style={{ display: "inline-block", width: 6, height: 6, border: `1.5px solid ${color}35`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />fetching</>
                                : isReady
                                    ? (isHov && cp > 0.1 ? "◉ piercing" : "◈ ready")
                                    : child.has_children ? "◆ node" : "◇ leaf"
                            } · d{child.depth}
                        </div>

                        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#dde8f5", lineHeight: 1.3, marginBottom: 5, letterSpacing: "-0.01em" }}>
                            {child.title}
                        </div>
                        <div style={{ fontSize: 9, color: "#344455", lineHeight: 1.58, borderTop: `1px solid ${color}10`, paddingTop: 6, flex: 1, overflow: "hidden" }}>
                            {(child.description || "").length > 80
                                ? child.description.slice(0, 80) + "…"
                                : child.description}
                        </div>

                        {isHov && cp > 0.35 && !isReady && child.has_children && (
                            <div style={{
                                marginTop: 5, padding: "3px 0", border: `1px solid ${color}20`, borderRadius: 5,
                                background: "rgba(255,255,255,0.01)", color: `${color}55`, fontSize: 7, letterSpacing: "0.11em",
                                textTransform: "uppercase", fontWeight: 700, textAlign: "center",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 4
                            }}>
                                <span style={{ display: "inline-block", width: 6, height: 6, border: `1.5px solid ${color}35`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                                fetching…
                            </div>
                        )}

                        {isHov && cp > 0.08 && [0, 1, 2].map(ri => (
                            <div key={ri} style={{
                                position: "absolute", width: "100%", height: "100%",
                                border: `1px solid ${color}35`, borderRadius: 12, top: 0, left: 0, pointerEvents: "none",
                                animation: `childRipple ${0.9 + ri * 0.28}s ease-out ${ri * 0.24}s infinite`, transformOrigin: "center center"
                            }} />
                        ))}
                    </div>
                );
            })}

            {/* Pierce flash */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30,
                background: "radial-gradient(ellipse 35% 35% at 50% 50%,rgba(74,222,128,0.12) 0%,transparent 65%)", opacity: flashOp
            }} />
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 31,
                background: "rgba(200,255,225,1)", opacity: pierceT > 0.88 && !isPierced ? (1 - pierceT) / 0.12 * 0.07 : 0
            }} />

            {/* Zoom-out overlay */}
            {zoomOutProg > 0 && (
                <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 40,
                    background: `rgba(8,14,30,${zoomOutProg * 0.4})`,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                    <div style={{
                        fontFamily: "'Space Mono',monospace", fontSize: 10, color: "#4ade80",
                        letterSpacing: "0.18em", textTransform: "uppercase", opacity: zoomOutProg,
                        animation: "outPulse 0.9s ease-in-out infinite"
                    }}>
                        ← resurfacing…
                    </div>
                </div>
            )}

            {/* Back button */}
            {nodeStack.length > 0 && (
                <button onClick={goBack} style={{
                    position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)",
                    zIndex: 55, background: "rgba(12,20,40,0.92)",
                    border: "1px solid rgba(74,222,128,0.22)", borderRadius: 8, padding: "7px 18px",
                    color: "#4ade80", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase",
                    fontWeight: 700, fontFamily: "'Space Mono',monospace", cursor: "pointer",
                    backdropFilter: "blur(12px)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                    display: "flex", alignItems: "center", gap: 8, animation: "fadeUp 0.3s ease",
                }}>
                    ← {nodeStack[nodeStack.length - 1]?.node?.title?.slice(0, 24) || "Root"}
                </button>
            )}

            {/* Breadcrumb */}
            {nodeStack.length > 0 && (
                <div style={{
                    position: "absolute", bottom: 85, left: "50%", transform: "translateX(-50%)",
                    zIndex: 50, display: "flex", alignItems: "center", gap: 5,
                    fontFamily: "'Space Mono',monospace", fontSize: 7.5, color: "#1e3040",
                    letterSpacing: "0.09em", textTransform: "uppercase", pointerEvents: "none", whiteSpace: "nowrap"
                }}>
                    {nodeStack.map((e, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ color: "#172535" }}>{e.node?.title?.slice(0, 10) || "Root"}</span>
                            <span style={{ color: "#0e1c28" }}>›</span>
                        </span>
                    ))}
                    <span style={{ color: "#4ade80" }}>{currentNode.title?.slice(0, 10)}</span>
                </div>
            )}

            {/* HUD top-left */}
            <div style={{ position: "absolute", top: 22, left: 26, zIndex: 50, fontFamily: "'Space Mono',monospace", lineHeight: 1.9 }}>
                <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: "0.17em", textTransform: "uppercase" }}>◈ Semantic Zoom</div>
                <div style={{ fontSize: 9, color: "#162030", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {isPierced ? `depth ${currentNode.depth + 1}` : isPiercing ? "piercing…" : `depth ${currentNode.depth}`}
                </div>
            </div>

            {/* HUD top-right */}
            <div style={{ position: "absolute", top: 22, right: 26, zIndex: 50, fontFamily: "'Space Mono',monospace", textAlign: "right", lineHeight: 1.9 }}>
                <div style={{ fontSize: 10, color: "#162030" }}>
                    zoom <span style={{ color: zoomOutProg > 0 ? "#fb923c" : isPierced ? "#4ade80" : isPiercing ? "#fb923c" : "#1e3040" }}>{z.toFixed(2)}×</span>
                </div>
                <div style={{ fontSize: 9, color: "#0e1c2a" }}>{nodeStack.length > 0 ? "scroll out to resurface" : `pierce at ${PIERCE_END}×`}</div>
            </div>

            {/* HUD bottom */}
            <div style={{
                position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                pointerEvents: "none", zIndex: 50, fontFamily: "'Space Mono',monospace"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 9, color: "#162030", letterSpacing: "0.1em", textTransform: "uppercase" }}>root</span>
                    <div style={{ width: 140, height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                            height: "100%",
                            width: `${clamp((z - MIN_ZOOM) / (PIERCE_END - MIN_ZOOM), 0, 1) * 100}%`,
                            background: zoomOutProg > 0 ? "linear-gradient(90deg,#fb923c,#4ade80)"
                                : isPierced ? "linear-gradient(90deg,#4ade80,#38bdf8)"
                                    : isPiercing ? "linear-gradient(90deg,#4ade80,#fb923c)" : "#4ade8030",
                            borderRadius: 2, transition: "background 0.4s"
                        }} />
                    </div>
                    <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: isPierced ? "#4ade80" : "#162030" }}>graph</span>
                </div>
                <div style={{ fontSize: 8.5, color: "#162030", letterSpacing: "0.09em", textTransform: "uppercase", opacity: 0.5 }}>
                    {zoomOutProg > 0 ? "keep scrolling out…"
                        : isPierced ? "hover a card · scroll in to pierce · scroll out to go back"
                            : isPiercing ? "keep scrolling…"
                                : "scroll to zoom · drag to pan"}
                </div>
            </div>
        </div>
    );
}
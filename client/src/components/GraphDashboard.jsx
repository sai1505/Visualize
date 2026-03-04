import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ─── Constants ────────────────────────────────────────────────────────────────
const PIERCE_START = 2.0;
const PIERCE_END = 3.2;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 7.0;
const CHILD_COLORS = ["#4ade80", "#38bdf8", "#a78bfa", "#fb923c", "#f472b6"];
const ROOT_W = 300;
const ROOT_H = 180;
const CHILD_Y_WORLD = 0;
const SCREEN_CARD_W = 220;
const SCREEN_CARD_H = 170;
const CHILD_GAP = 40;

const API_BASE = "http://localhost:8000";

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t) => Math.pow(Math.min(1, Math.max(0, t)), 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function horizontalPositions(count) {
    const totalW = count * SCREEN_CARD_W + (count - 1) * CHILD_GAP;
    const startX = -totalW / 2 + SCREEN_CARD_W / 2;
    return Array.from({ length: count }, (_, i) => ({
        x: startX + i * (SCREEN_CARD_W + CHILD_GAP),
        y: CHILD_Y_WORLD,
    }));
}

function worldToScreen(wx, wy, zoom, panX, panY, vw, vh) {
    return {
        sx: vw / 2 + panX + wx * zoom,
        sy: vh / 2 + panY + wy * zoom,
    };
}

export default function GraphDashboard() {
    const wrapRef = useRef(null);
    const svgRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();

    // ── FIX 1: read graphData from location.state safely ──
    const graphData = location.state || null;

    // ── FIX 2: ALL hooks must come before any conditional return ──
    const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
    // ── FIX 3: was useState(data || {}) — 'data' doesn't exist, use graphData ──
    const [currentNode, setCurrentNode] = useState(graphData || {});
    const [expandedData, setExpandedData] = useState({});
    const [expandingId, setExpandingId] = useState(null);
    const [nodeStack, setNodeStack] = useState([]);

    const graphId = graphData?.id;

    const S = useRef({
        zoom: 1, targetZoom: 1,
        panX: 0, panY: 0,
        targetPanX: 0, targetPanY: 0,
        childReveal: 0,
        isPanning: false,
        lastMouse: { x: 0, y: 0 },
        lastTouch: null,
    }).current;

    const [, setTick] = useState(0);

    useEffect(() => {
        if (!currentNode?.id) return;
        S.zoom = 1; S.targetZoom = 1;
        S.panX = 0; S.panY = 0;
        S.targetPanX = 0; S.targetPanY = 0;
        S.childReveal = 0;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentNode?.id]);

    useEffect(() => {
        const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        let raf;
        const loop = () => {
            S.zoom = lerp(S.zoom, S.targetZoom, 0.10);
            S.panX = lerp(S.panX, S.targetPanX, 0.10);
            S.panY = lerp(S.panY, S.targetPanY, 0.10);

            const pierceT = clamp((S.zoom - PIERCE_START) / (PIERCE_END - PIERCE_START), 0, 1);
            if (pierceT >= 1) {
                S.childReveal = Math.min(1, S.childReveal + 0.022);
            } else {
                S.childReveal = Math.max(0, S.childReveal - 0.04);
            }

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
            const factor = e.deltaY < 0 ? 1.12 : 0.90;
            S.targetZoom = clamp(S.targetZoom * factor, MIN_ZOOM, MAX_ZOOM);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [S]);

    const onMouseDown = useCallback((e) => {
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
        if (e.touches.length === 1)
            S.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, [S]);
    const onTouchMove = useCallback((e) => {
        if (e.touches.length === 1 && S.lastTouch) {
            S.targetPanX += e.touches[0].clientX - S.lastTouch.x;
            S.targetPanY += e.touches[0].clientY - S.lastTouch.y;
            S.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }, [S]);

    const expandNode = useCallback(async (child) => {
        if (expandedData[child.id]) {
            setNodeStack(prev => [...prev, currentNode]);
            setCurrentNode({ ...child, children: expandedData[child.id].children });
            return;
        }

        setExpandingId(child.id);
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
            setNodeStack(prev => [...prev, currentNode]);
            setCurrentNode({ ...child, children: expanded.children || [] });
        } catch (err) {
            console.error("Expand error:", err);
        } finally {
            setExpandingId(null);
        }
    }, [expandedData, currentNode, graphId]);

    const goBack = useCallback(() => {
        if (nodeStack.length === 0) return;
        const prev = nodeStack[nodeStack.length - 1];
        setNodeStack(s => s.slice(0, -1));
        setCurrentNode(prev);
    }, [nodeStack]);

    // ── FIX 4: guard AFTER all hooks ──
    if (!graphData) {
        navigate("/");
        return null;
    }

    // ── Derived values ───────────────────────────────────────────────────────────
    const z = S.zoom;
    const pierceT = clamp((z - PIERCE_START) / (PIERCE_END - PIERCE_START), 0, 1);
    const isPiercing = pierceT > 0 && pierceT < 1;
    const isPierced = pierceT >= 1;
    const childReveal = S.childReveal;

    const rootOpacity = isPierced ? 0 : clamp(1 - easeIn(pierceT * 1.1), 0, 1);
    const rootBloat = 1 + pierceT * 0.28;
    const flashOpacity = isPiercing ? easeIn(pierceT) * 0.22 : 0;

    const children = currentNode.children || [];
    const childWorldPos = horizontalPositions(children.length);
    const { w: VW, h: VH } = vp;

    const rootScreen = worldToScreen(0, 0, z, S.panX, S.panY, VW, VH);
    const childScreenPos = childWorldPos.map(p =>
        worldToScreen(p.x, p.y, z, S.panX, S.panY, VW, VH)
    );

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
                background: "#030712",
                overflow: "hidden",
                position: "relative",
                cursor: S.isPanning ? "grabbing" : "grab",
                userSelect: "none",
            }}
        >
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes breathe {
          0%,100% { box-shadow: 0 0 40px rgba(74,222,128,0.13),0 0 80px rgba(74,222,128,0.04),0 24px 70px rgba(0,0,0,0.7); }
          50%      { box-shadow: 0 0 60px rgba(74,222,128,0.24),0 0 120px rgba(74,222,128,0.08),0 24px 70px rgba(0,0,0,0.7); }
        }
        @keyframes dotPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.25; transform:scale(0.65); }
        }
        @keyframes dashFlow { to { stroke-dashoffset: -22; } }
        @keyframes ripple {
          0%   { transform:scale(0.3); opacity:0.7; }
          100% { transform:scale(3); opacity:0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .child-card:hover .expand-btn { opacity:1 !important; transform:translateY(0) !important; }
        .child-card:hover { border-color: rgba(255,255,255,0.12) !important; }
        .expand-btn:hover { filter: brightness(1.2); }
      `}</style>

            {/* Background glow */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                background: isPierced
                    ? "radial-gradient(ellipse 70% 60% at 50% 50%,rgba(56,189,248,0.05) 0%,transparent 70%)"
                    : "radial-gradient(ellipse 55% 55% at 50% 50%,rgba(74,222,128,0.04) 0%,transparent 70%)",
                transition: "background 1s",
            }} />

            {/* Scanlines */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 60,
                backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.02) 3px,rgba(0,0,0,0.02) 4px)",
            }} />

            {/* ── SVG connectors ── */}
            {(isPierced || childReveal > 0) && (
                <svg ref={svgRef} style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    pointerEvents: "none", zIndex: 8,
                    opacity: easeOut(childReveal),
                }}>
                    {childScreenPos.map((sc, i) => {
                        const color = CHILD_COLORS[i % CHILD_COLORS.length];
                        const t = clamp((childReveal - i * 0.1) / 0.6, 0, 1);
                        const op = easeOut(t);
                        const rootEdgeX = sc.sx < rootScreen.sx
                            ? rootScreen.sx - (ROOT_W / 2) * z
                            : rootScreen.sx + (ROOT_W / 2) * z;
                        const childEdgeX = sc.sx < rootScreen.sx
                            ? sc.sx + SCREEN_CARD_W / 2
                            : sc.sx - SCREEN_CARD_W / 2;
                        const midY = rootScreen.sy;

                        return (
                            <g key={i} opacity={op}>
                                <line x1={rootEdgeX} y1={midY} x2={childEdgeX} y2={midY}
                                    stroke={color} strokeWidth={6} strokeOpacity={0.07} strokeLinecap="round" />
                                <line x1={rootEdgeX} y1={midY} x2={childEdgeX} y2={midY}
                                    stroke={color} strokeWidth={1.4} strokeOpacity={0.55}
                                    strokeDasharray="6 5" strokeLinecap="round"
                                    style={{ animation: "dashFlow 0.9s linear infinite" }} />
                                <circle cx={childEdgeX} cy={midY} r={8}
                                    fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.22} />
                                <circle cx={childEdgeX} cy={midY} r={4} fill={color} fillOpacity={0.9} />
                                <circle cx={childEdgeX} cy={midY} r={1.8} fill="#fff" fillOpacity={0.85} />
                            </g>
                        );
                    })}
                </svg>
            )}

            {/* ── Root Card ── */}
            <div style={{
                position: "absolute",
                width: ROOT_W,
                height: ROOT_H,
                left: rootScreen.sx - (ROOT_W * z * rootBloat) / 2,
                top: rootScreen.sy - (ROOT_H * z * rootBloat) / 2,
                transform: `scale(${z * rootBloat})`,
                transformOrigin: "top left",
                opacity: rootOpacity,
                pointerEvents: isPierced ? "none" : "auto",
                background: "linear-gradient(150deg,rgba(12,20,40,0.97) 0%,rgba(18,28,52,0.95) 60%,rgba(10,18,36,0.97) 100%)",
                border: "1px solid rgba(74,222,128,0.38)",
                borderRadius: 18,
                padding: "20px 22px 16px",
                backdropFilter: "blur(28px)",
                boxShadow: "0 0 0 1px rgba(74,222,128,0.06),0 24px 70px rgba(0,0,0,0.75),inset 0 1px 0 rgba(255,255,255,0.06)",
                animation: !isPiercing && !isPierced ? "breathe 3.2s ease-in-out infinite" : "none",
                fontFamily: "'Space Mono',monospace",
                zIndex: 10,
                overflow: "hidden",
            }}>
                <div style={{
                    position: "absolute", top: 0, left: 22, right: 22, height: 1,
                    background: "linear-gradient(90deg,transparent,rgba(74,222,128,0.55),transparent)",
                }} />
                <div style={{
                    position: "absolute", top: 16, bottom: 16, left: 0, width: 2, borderRadius: "0 2px 2px 0",
                    background: "linear-gradient(180deg,transparent,rgba(74,222,128,0.5),transparent)",
                }} />
                <div style={{
                    fontSize: 9, letterSpacing: "0.22em", color: "#4ade80",
                    textTransform: "uppercase", fontWeight: 700, marginBottom: 10,
                    display: "flex", alignItems: "center", gap: 8,
                }}>
                    <span style={{
                        width: 6, height: 6, borderRadius: "50%", background: "#4ade80",
                        display: "inline-block", boxShadow: "0 0 10px #4ade80",
                        animation: "dotPulse 1.8s ease-in-out infinite", flexShrink: 0,
                    }} />
                    {currentNode.depth === 0 ? "Root · Depth 0" : `Node · Depth ${currentNode.depth}`}
                </div>
                <div style={{
                    fontSize: 15, fontWeight: 700, color: "#e2f0ff",
                    lineHeight: 1.3, marginBottom: 10, letterSpacing: "-0.02em",
                }}>
                    {currentNode.title}
                </div>
                <div style={{
                    fontSize: 10, color: "#3a5070", lineHeight: 1.65,
                    borderTop: "1px solid rgba(74,222,128,0.08)", paddingTop: 10,
                }}>
                    {currentNode.description}
                </div>
                <div style={{
                    marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                    <span style={{ fontSize: 9, color: "#1a2e40", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        {children.length} nodes
                    </span>
                    <span style={{
                        fontSize: 9, color: "#4ade80", letterSpacing: "0.1em", textTransform: "uppercase",
                        opacity: pierceT === 0 ? 0.75 : 0, transition: "opacity 0.3s",
                        animation: "dotPulse 2.5s ease-in-out infinite",
                    }}>
                        scroll to pierce →
                    </span>
                </div>
                {isPiercing && [0, 1, 2].map(i => (
                    <div key={i} style={{
                        position: "absolute", width: "100%", height: "100%",
                        border: "1px solid rgba(74,222,128,0.4)", borderRadius: 18,
                        top: 0, left: 0, pointerEvents: "none",
                        animation: `ripple ${0.85 + i * 0.28}s ease-out ${i * 0.22}s infinite`,
                        transformOrigin: "center center",
                    }} />
                ))}
            </div>

            {/* ── Child Cards ── */}
            {children.map((child, i) => {
                const sc = childScreenPos[i];
                const color = CHILD_COLORS[i % CHILD_COLORS.length];
                const t = clamp((childReveal - i * 0.1) / 0.6, 0, 1);
                const cOp = easeOut(t);
                const enterScale = 0.78 + easeOut(t) * 0.22;
                const isLoading = expandingId === child.id;
                const isExpanded = !!expandedData[child.id];

                return (
                    <div
                        key={child.id}
                        className="child-card"
                        style={{
                            position: "absolute",
                            width: SCREEN_CARD_W,
                            height: SCREEN_CARD_H,
                            left: sc.sx - SCREEN_CARD_W / 2,
                            top: sc.sy - SCREEN_CARD_H / 2,
                            opacity: cOp,
                            transform: `scale(${enterScale})`,
                            transformOrigin: "center center",
                            background: "linear-gradient(145deg,rgba(12,20,40,0.97) 0%,rgba(16,26,46,0.95) 100%)",
                            border: `1px solid ${color}28`,
                            borderRadius: 13,
                            padding: "12px 14px 10px",
                            boxShadow: `0 0 0 1px ${color}0c,0 8px 32px rgba(0,0,0,0.65),inset 0 1px 0 rgba(255,255,255,0.04)`,
                            fontFamily: "'Space Mono',monospace",
                            transition: "border-color 0.2s, filter 0.2s",
                            zIndex: 9,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <div style={{
                            position: "absolute", top: 0, left: 0, right: 0, height: 2, borderRadius: "13px 13px 0 0",
                            background: `linear-gradient(90deg,transparent,${color}80,transparent)`,
                        }} />
                        <div style={{
                            position: "absolute", top: 10, right: 10,
                            width: 5, height: 5, borderRadius: "50%",
                            background: color, boxShadow: `0 0 8px ${color}`, opacity: 0.6,
                        }} />
                        <div style={{
                            fontSize: 8, letterSpacing: "0.14em", color, textTransform: "uppercase",
                            fontWeight: 700, marginBottom: 6, opacity: 0.85,
                        }}>
                            {isExpanded ? "◆ expanded" : child.has_children ? "◆ node" : "◇ leaf"} · depth {child.depth}
                        </div>
                        <div style={{
                            fontSize: 11, fontWeight: 700, color: "#dde8f5",
                            lineHeight: 1.3, marginBottom: 6, letterSpacing: "-0.01em",
                        }}>
                            {child.title}
                        </div>
                        <div style={{
                            fontSize: 9.5, color: "#374558", lineHeight: 1.6,
                            borderTop: `1px solid ${color}14`, paddingTop: 7,
                            flex: 1, overflow: "hidden",
                        }}>
                            {(child.description || "").length > 75
                                ? child.description.slice(0, 75) + "…"
                                : child.description}
                        </div>

                        {/* ── Expand Button ── */}
                        <button
                            className="expand-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isLoading) expandNode(child);
                            }}
                            style={{
                                marginTop: 8,
                                width: "100%",
                                padding: "6px 0",
                                border: `1px solid ${color}40`,
                                borderRadius: 7,
                                background: isExpanded ? `${color}18` : `rgba(255,255,255,0.03)`,
                                color: isExpanded ? color : "#4a6080",
                                fontSize: 8.5,
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                fontWeight: 700,
                                fontFamily: "'Space Mono',monospace",
                                cursor: isLoading ? "default" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                opacity: 0.85,
                                transform: "translateY(2px)",
                                transition: "opacity 0.2s, transform 0.2s, background 0.2s, border-color 0.2s",
                                pointerEvents: isLoading ? "none" : "auto",
                            }}
                        >
                            {isLoading ? (
                                <>
                                    <span style={{
                                        display: "inline-block", width: 9, height: 9,
                                        border: `1.5px solid ${color}40`,
                                        borderTopColor: color,
                                        borderRadius: "50%",
                                        animation: "spin 0.7s linear infinite",
                                    }} />
                                    Expanding…
                                </>
                            ) : isExpanded ? (
                                <>◈ View Children</>
                            ) : (
                                <>⊕ Expand Node</>
                            )}
                        </button>
                    </div>
                );
            })}

            {/* ── Pierce flash ── */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30,
                background: "radial-gradient(ellipse 35% 35% at 50% 50%,rgba(74,222,128,0.18) 0%,transparent 65%)",
                opacity: flashOpacity,
            }} />
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 31,
                background: "rgba(200,255,225,1)",
                opacity: pierceT > 0.88 && !isPierced ? (1 - pierceT) / 0.12 * 0.1 : 0,
            }} />

            {/* ── Back button ── */}
            {nodeStack.length > 0 && (
                <button
                    onClick={goBack}
                    style={{
                        position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)",
                        zIndex: 55,
                        background: "rgba(12,20,40,0.92)",
                        border: "1px solid rgba(74,222,128,0.3)",
                        borderRadius: 8,
                        padding: "7px 18px",
                        color: "#4ade80",
                        fontSize: 9,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        fontFamily: "'Space Mono',monospace",
                        cursor: "pointer",
                        backdropFilter: "blur(12px)",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                        display: "flex", alignItems: "center", gap: 8,
                        animation: "fadeUp 0.3s ease",
                    }}
                >
                    ← Back · {nodeStack[nodeStack.length - 1]?.title?.slice(0, 22) || "Root"}
                </button>
            )}

            {/* ── Breadcrumb ── */}
            {nodeStack.length > 0 && (
                <div style={{
                    position: "absolute", bottom: 70, left: "50%", transform: "translateX(-50%)",
                    zIndex: 50,
                    display: "flex", alignItems: "center", gap: 6,
                    fontFamily: "'Space Mono',monospace",
                    fontSize: 8, color: "#1e3040", letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    animation: "fadeUp 0.3s ease",
                    pointerEvents: "none",
                }}>
                    {nodeStack.map((n, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: i === nodeStack.length - 1 ? "#2a4060" : "#162030" }}>
                                {n.title?.slice(0, 16) || "Root"}
                            </span>
                            <span style={{ color: "#0e1c28" }}>›</span>
                        </span>
                    ))}
                    <span style={{ color: "#4ade80" }}>{currentNode.title?.slice(0, 16)}</span>
                </div>
            )}

            {/* ── HUD top-left ── */}
            <div style={{
                position: "absolute", top: 22, left: 26, zIndex: 50,
                fontFamily: "'Space Mono',monospace", lineHeight: 1.9,
            }}>
                <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                    ◈ Semantic Zoom
                </div>
                <div style={{ fontSize: 9, color: "#162030", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    {isPierced ? "level 02 · graph" : isPiercing ? "piercing…" : "level 01 · root"}
                </div>
            </div>

            {/* ── HUD top-right ── */}
            <div style={{
                position: "absolute", top: 22, right: 26, zIndex: 50,
                fontFamily: "'Space Mono',monospace", textAlign: "right", lineHeight: 1.9,
            }}>
                <div style={{ fontSize: 10, color: "#162030" }}>
                    zoom <span style={{ color: isPierced ? "#4ade80" : isPiercing ? "#fb923c" : "#1e3040" }}>
                        {z.toFixed(2)}×
                    </span>
                </div>
                <div style={{ fontSize: 9, color: "#0e1c2a" }}>pierce at {PIERCE_END}×</div>
            </div>

            {/* ── HUD bottom ── */}
            <div style={{
                position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                pointerEvents: "none", zIndex: 50,
                fontFamily: "'Space Mono',monospace",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 9, color: "#162030", letterSpacing: "0.12em", textTransform: "uppercase" }}>root</span>
                    <div style={{
                        width: 160, height: 2, background: "rgba(255,255,255,0.04)",
                        borderRadius: 2, overflow: "hidden",
                    }}>
                        <div style={{
                            height: "100%",
                            width: `${clamp((z - MIN_ZOOM) / (PIERCE_END - MIN_ZOOM), 0, 1) * 100}%`,
                            background: isPierced
                                ? "linear-gradient(90deg,#4ade80,#38bdf8)"
                                : isPiercing
                                    ? "linear-gradient(90deg,#4ade80,#fb923c)"
                                    : "#4ade8040",
                            borderRadius: 2, transition: "background 0.4s",
                        }} />
                    </div>
                    <span style={{
                        fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
                        color: isPierced ? "#4ade80" : "#162030",
                    }}>graph</span>
                </div>
                <div style={{ fontSize: 9, color: "#162030", letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.55 }}>
                    {isPierced
                        ? "scroll out to resurface · drag to pan"
                        : isPiercing
                            ? "keep scrolling — almost through…"
                            : "↕ scroll to zoom · drag to pan"}
                </div>
            </div>
        </div>
    );
}
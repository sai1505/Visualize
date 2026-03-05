import { useEffect, useRef, useState } from "react";

const CARD_W = 100;
const CARD_H = 120;

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 10;

const DEPTH_ZOOM = [1, 2.5, 4.5, 7];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

function w2s(wx, wy, zoom, panX, panY, vw, vh) {
    return {
        sx: vw / 2 + panX + wx * zoom,
        sy: vh / 2 + panY + wy * zoom
    };
}

function reveal(depth, zoom) {
    const start = DEPTH_ZOOM[depth] - 0.6;
    const end = DEPTH_ZOOM[depth];
    return clamp((zoom - start) / (end - start), 0, 1);
}

/* ---------------- SAMPLE GRAPH ---------------- */

const nodes = [
    { id: "A", title: "Artificial Intelligence", depth: 0, x: 0, y: 0 },

    { id: "B", title: "Machine Learning", depth: 1, x: -350, y: 200 },
    { id: "C", title: "Computer Vision", depth: 1, x: 350, y: 200 },

    { id: "D", title: "Neural Networks", depth: 2, x: -500, y: 400 },
    { id: "E", title: "Reinforcement Learning", depth: 2, x: -200, y: 400 },

    { id: "F", title: "Object Detection", depth: 2, x: 200, y: 400 },
    { id: "G", title: "Image Segmentation", depth: 2, x: 500, y: 400 },

    { id: "H", title: "CNN", depth: 3, x: -550, y: 600 },
    { id: "I", title: "RNN", depth: 3, x: -420, y: 600 },

    { id: "J", title: "YOLO", depth: 3, x: 220, y: 600 },
    { id: "K", title: "Mask-RCNN", depth: 3, x: 380, y: 600 }
];

/* edges */

const edges = [
    ["A", "B"], ["A", "C"],
    ["B", "D"], ["B", "E"],
    ["C", "F"], ["C", "G"],
    ["D", "H"], ["D", "I"],
    ["F", "J"], ["F", "K"]
];

/* ---------------- COMPONENT ---------------- */

export default function GraphZoomDemo() {

    const wrapRef = useRef(null);

    const [vp, setVp] = useState({
        w: window.innerWidth,
        h: window.innerHeight
    });

    const S = useRef({
        zoom: 1,
        targetZoom: 1,
        panX: 0,
        panY: 0,
        targetPanX: 0,
        targetPanY: 0,
        isPanning: false,
        lastMouse: { x: 0, y: 0 }
    }).current;

    const [, setTick] = useState(0);

    /* viewport */

    useEffect(() => {
        const resize = () => {
            setVp({
                w: window.innerWidth,
                h: window.innerHeight
            });
        };

        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);

    /* animation */

    useEffect(() => {
        let raf;

        const loop = () => {

            S.zoom = lerp(S.zoom, S.targetZoom, 0.1);
            S.panX = lerp(S.panX, S.targetPanX, 0.1);
            S.panY = lerp(S.panY, S.targetPanY, 0.1);

            setTick(t => t + 1);

            raf = requestAnimationFrame(loop);
        };

        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);

    }, []);

    /* wheel zoom */

    useEffect(() => {

        const el = wrapRef.current;
        if (!el) return;

        const wheel = (e) => {

            e.preventDefault();

            const factor = e.deltaY < 0 ? 1.15 : 0.85;

            const oldZoom = S.targetZoom;
            const newZoom = clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);

            const cx = e.clientX - vp.w / 2;
            const cy = e.clientY - vp.h / 2;

            S.targetPanX = cx - (cx - S.targetPanX) * (newZoom / oldZoom);
            S.targetPanY = cy - (cy - S.targetPanY) * (newZoom / oldZoom);

            S.targetZoom = newZoom;
        };

        el.addEventListener("wheel", wheel, { passive: false });
        return () => el.removeEventListener("wheel", wheel);

    }, [vp]);

    /* pan */

    const onMouseDown = e => {
        S.isPanning = true;
        S.lastMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = e => {
        if (!S.isPanning) return;

        S.targetPanX += e.clientX - S.lastMouse.x;
        S.targetPanY += e.clientY - S.lastMouse.y;

        S.lastMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
        S.isPanning = false;
    };

    const { w: VW, h: VH } = vp;

    /* ---------------- RENDER ---------------- */

    return (

        <div
            ref={wrapRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{
                width: "100vw",
                height: "100vh",
                background: "#020617",
                overflow: "hidden",
                position: "relative",
                cursor: S.isPanning ? "grabbing" : "grab"
            }}
        >

            {/* EDGES */}

            <svg
                style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none"
                }}
            >

                {edges.map(([a, b]) => {

                    const na = nodes.find(n => n.id === a);
                    const nb = nodes.find(n => n.id === b);

                    const ra = reveal(na.depth, S.zoom);
                    const rb = reveal(nb.depth, S.zoom);

                    if (ra === 0 || rb === 0) return null;

                    const pa = w2s(na.x, na.y, S.zoom, S.panX, S.panY, VW, VH);
                    const pb = w2s(nb.x, nb.y, S.zoom, S.panX, S.panY, VW, VH);

                    return (
                        <line
                            key={a + b}
                            x1={pa.sx}
                            y1={pa.sy}
                            x2={pb.sx}
                            y2={pb.sy}
                            stroke="#4ade80"
                            strokeOpacity="0.35"
                            strokeWidth={2}
                        />
                    );

                })}

            </svg>

            {/* NODES */}

            {nodes.map(node => {

                const r = reveal(node.depth, S.zoom);
                if (r === 0) return null;

                const sc = w2s(node.x, node.y, S.zoom, S.panX, S.panY, VW, VH);

                return (

                    <div
                        key={node.id}
                        style={{
                            position: "absolute",
                            width: CARD_W,
                            height: CARD_H,

                            left: sc.sx - (CARD_W * S.zoom) / 2,
                            top: sc.sy - (CARD_H * S.zoom) / 2,

                            transform: `scale(${S.zoom})`,
                            transformOrigin: "top left",

                            opacity: r,

                            background: "linear-gradient(145deg,#0f172a,#1e293b)",
                            border: "1px solid rgba(74,222,128,0.4)",
                            borderRadius: 12,

                            padding: 14,
                            color: "#e2e8f0",
                            fontFamily: "monospace",
                            boxShadow: "0 10px 30px rgba(0,0,0,0.6)"
                        }}
                    >

                        <div style={{
                            fontSize: 10,
                            color: "#4ade80",
                            marginBottom: 6
                        }}>
                            depth {node.depth}
                        </div>

                        <div style={{
                            fontWeight: 700,
                            fontSize: 13
                        }}>
                            {node.title}
                        </div>

                    </div>

                );

            })}

            {/* HUD */}

            <div
                style={{
                    position: "absolute",
                    top: 20,
                    left: 20,
                    color: "#4ade80",
                    fontFamily: "monospace"
                }}
            >
                zoom {S.zoom.toFixed(2)}
            </div>

        </div>
    );
}
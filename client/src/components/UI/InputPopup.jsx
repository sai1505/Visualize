import { useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"

export default function InputPopup({ onClose }) {
    const [topic, setTopic] = useState("")
    const [maxNodes, setMaxNodes] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async () => {
        if (!topic || !maxNodes) return

        setLoading(true)

        const payload = {
            topic,
            max_nodes: Number(maxNodes)
        }

        try {
            const response = await fetch("http://localhost:8000/generate-root", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                throw new Error("Failed to generate graph")
            }

            console.log("Status:", response.status)

            const data = await response.json()
            navigate("/graphsimple", { state: data })

            //const data = await response.json()
            //console.log("Backend response:", data)

            onClose()

        } catch (error) {
            console.error("Error:", error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm 
                 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-neutral-900 border border-neutral-700 
                   rounded-2xl p-8 w-[400px] text-white"
                onClick={(e) => e.stopPropagation()}
            >
                <h2
                    className="text-2xl mb-6 tracking-wider"
                    style={{ fontFamily: "'Permanent Marker', system-ui, sans-serif" }}
                >
                    Expand Concept
                </h2>

                {/* Topic */}
                <div className="mb-4">
                    <label className="text-sm text-neutral-400">Topic</label>

                    <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        rows={4}
                        placeholder="Enter your prompt..."
                        className="mt-1 w-full px-4 py-2 bg-black border border-neutral-700
                            rounded-lg focus:outline-none focus:border-blue-400
                            resize-none text-sm"
                    />
                </div>

                {/* Max Nodes */}
                <div className="mb-6">
                    <label className="text-sm text-neutral-400">
                        Max Number of Connections
                    </label>

                    <div className="mt-2 flex items-center 
                            border border-neutral-700 
                            rounded-lg bg-black overflow-hidden
                            transition-all duration-300
                            focus-within:border-purple-400
                            focus-within:ring-1 focus-within:ring-purple-400/40">

                        {/* Decrement */}
                        <button
                            type="button"
                            onClick={() => setMaxNodes((prev) => Math.max(0, Number(prev) - 1))}
                            className="px-4 py-2 text-neutral-400 hover:text-white transition"
                        >
                            −
                        </button>

                        {/* Input */}
                        <input
                            type="text"
                            value={maxNodes}
                            onChange={(e) => setMaxNodes(e.target.value)}
                            className="w-full text-center bg-black outline-none text-white"
                        />

                        {/* Increment */}
                        <button
                            type="button"
                            onClick={() => setMaxNodes((prev) => Number(prev) + 1)}
                            className="px-4 py-2 text-neutral-400 hover:text-white transition"
                        >
                            +
                        </button>

                    </div>
                </div>

                <div className="flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-neutral-600 
                       rounded-lg text-neutral-400 
                       hover:text-white transition"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-5 py-2 rounded-lg 
                                bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400
                                text-white font-medium
                                disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "Expanding..." : "Expand"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    )
}

import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"

export default function InputPopupJSON({ onClose, onData }) {
    const [fileName, setFileName] = useState("")
    const [payload, setPayload] = useState(null)
    const [jsonError, setJsonError] = useState("")
    const [dragging, setDragging] = useState(false)
    const fileInputRef = useRef(null)
    const navigate = useNavigate()

    const processFile = (file) => {
        if (!file) return
        if (!file.name.endsWith(".json")) {
            setJsonError("Only .json files are accepted.")
            setFileName("")
            setPayload(null)
            return
        }
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result)
                setPayload(parsed)
                setFileName(file.name)
                setJsonError("")
            } catch {
                setJsonError("Invalid JSON — could not parse the file.")
                setFileName("")
                setPayload(null)
            }
        }
        reader.readAsText(file)
    }

    const handleFileChange = (e) => processFile(e.target.files[0])
    const handleDrop = (e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]) }
    const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
    const handleDragLeave = () => setDragging(false)

    const handleSubmit = () => {
        if (!payload) return
        navigate("/graphJSON", { state: payload })
        onClose()
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-neutral-900 border border-neutral-700 rounded-2xl p-8 w-[440px] text-white"
                onClick={(e) => e.stopPropagation()}
            >
                <h2
                    className="text-2xl mb-1 tracking-wider"
                    style={{ fontFamily: "'Permanent Marker', system-ui, sans-serif" }}
                >
                    Upload JSON
                </h2>
                <p className="text-xs text-neutral-500 mb-6">
                    Upload a <code className="text-neutral-400">.json</code> file to load your data.
                </p>

                {/* Drop Zone */}
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current.click()}
                    className={`mb-2 cursor-pointer rounded-xl border-2 border-dashed px-6 py-10
                        flex flex-col items-center justify-center gap-3 transition-all duration-200
                        ${dragging
                            ? "border-blue-400 bg-blue-500/10"
                            : payload
                                ? "border-green-500/60 bg-green-500/5"
                                : "border-neutral-700 hover:border-neutral-500 bg-black/40"
                        }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleFileChange}
                    />

                    <div className={`text-3xl transition-all ${payload ? "text-green-400" : "text-neutral-500"}`}>
                        {payload ? "✓" : "↑"}
                    </div>

                    <div className="text-center">
                        {payload ? (
                            <>
                                <p className="text-sm font-medium text-green-400">{fileName}</p>
                                <p className="text-xs text-neutral-500 mt-1">Click to replace file</p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-neutral-400">
                                    Drop your <span className="text-white font-medium">.json</span> file here
                                </p>
                                <p className="text-xs text-neutral-600 mt-1">or click to browse</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Preview */}
                <AnimatePresence>
                    {payload && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-4 overflow-hidden"
                        >
                            <pre className="text-xs text-neutral-400 bg-black/60 border border-neutral-800
                                rounded-lg px-4 py-3 overflow-auto max-h-32 font-mono">
                                {JSON.stringify(payload, null, 2)}
                            </pre>
                        </motion.div>
                    )}
                </AnimatePresence>

                {jsonError && <p className="mb-4 text-xs text-red-400">{jsonError}</p>}

                <div className="flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-neutral-600 rounded-lg text-neutral-400 hover:text-white transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!payload}
                        className="px-5 py-2 rounded-lg bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400
                            text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Load
                    </button>
                </div>
            </motion.div>
        </motion.div>
    )
}
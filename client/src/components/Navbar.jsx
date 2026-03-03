import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight } from "lucide-react"
import InputPopup from "./InputPopup"

export default function Navbar() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <nav className="sticky top-0 z-50 backdrop-blur-md bg-black/70 border-b border-neutral-800">
                <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between relative">

                    <h1
                        className="text-3xl md:text-4xl tracking-wide 
                                bg-gradient-to-r from-white via-blue-300 to-cyan-400
                                bg-clip-text text-transparent
                                drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]"
                        style={{ fontFamily: "'Permanent Marker', cursive" }}
                    >
                        Visualize
                    </h1>


                    <motion.button
                        onClick={() => setOpen(true)}
                        whileHover="hover"
                        whileTap={{ scale: 0.96 }}
                        initial="rest"
                        animate="rest"
                        className="relative px-7 py-2.5 rounded-full 
                bg-black text-white text-md border border-neutral-700
                overflow-hidden group flex items-center gap-3
                tracking-[0.30em]
                transition-all duration-300"
                        style={{ fontFamily: "'Permanent Marker', system-ui, sans-serif" }}
                    >

                        {/* Animated Border Layer */}
                        <span className="absolute inset-0 rounded-full p-[1.5px] opacity-0 group-hover:opacity-100 transition duration-300">
                            <span className="absolute inset-0 rounded-full 
                        bg-gradient-to-r 
                        from-blue-500 via-purple-500 to-cyan-400
                        animate-[spin_5s_cubic-bezier(0.4,0,0.2,1)_infinite]" />
                        </span>

                        {/* Inner Background (keeps button dark) */}
                        <span className="absolute inset-[1.5px] rounded-full bg-black" />

                        {/* Text */}
                        <span className="relative z-10">Try It</span>

                        {/* Arrow */}
                        <motion.span
                            variants={{
                                rest: { x: 0 },
                                hover: { x: 8 }
                            }}
                            transition={{ type: "spring", stiffness: 300 }}
                            className="relative z-10"
                        >
                            <ArrowRight size={18} strokeWidth={2.5} />
                        </motion.span>

                    </motion.button>
                </div>
            </nav>

            <AnimatePresence>
                {open && <InputPopup onClose={() => setOpen(false)} />}
            </AnimatePresence>
        </>
    )
}
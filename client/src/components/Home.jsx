import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight } from "lucide-react"
import InputPopup from "./UI/InputPopup"

export default function Home() {
    const [open, setOpen] = useState(false);

    return (
        <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 bg-black text-white">

            {/* Main Title */}
            <h1
                className="text-5xl md:text-7xl tracking-[0.15em]
             bg-gradient-to-r 
             from-blue-400 via-purple-400 via-pink-400 via-yellow-300 to-emerald-400
             bg-clip-text text-transparent"
                style={{ fontFamily: "'Permanent Marker', system-ui, sans-serif" }}
            >
                Visualize
            </h1>

            {/* Tagline */}
            <div className="relative mt-10 flex justify-center">

                {/* Animated Glow Background */}
                <div className="absolute inset-0 flex justify-center">
                    <div className="w-[500px] h-[120px] 
                    bg-gradient-to-r 
                    from-blue-500 via-purple-500 via-pink-500 to-emerald-400
                    opacity-30 blur-3xl
                    animate-[gradientMove_8s_linear_infinite]" />
                </div>



                <div
                    className="relative text-lg md:text-xl tracking-[0.4em] text-white flex gap-1"
                    style={{ fontFamily: "'Permanent Marker', system-ui, sans-serif" }}
                >

                    {["SEE", "THINK", "INTERPRET"].map((word, i, arr) => (
                        <div key={i} className="flex items-center">

                            {/* Hover Area Only For Word */}
                            <div className="relative group cursor-pointer inline-block">

                                {/* Word */}
                                <span
                                    className="relative z-10 text-neutral-400
                   transition-all duration-300
                   group-hover:text-white"
                                >
                                    {word}
                                </span>

                                {/* Center-Out Gradient Underline */}
                                <span
                                    className="absolute left-1/2 -translate-x-1/2 -bottom-2
                   h-[3px] w-full
                   scale-x-0 group-hover:scale-x-100
                   origin-center
                   bg-gradient-to-r from-blue-400 via-purple-400 via-pink-400 via-yellow-300 to-emerald-400
                   transition-transform duration-500 ease-out"
                                />
                            </div>

                            {/* Static Dot (Outside Hover Group) */}
                            {i !== arr.length - 1 && (
                                <span className="mx-5 text-neutral-400">•</span>
                            )}

                        </div>
                    ))}

                </div>

            </div>

            {/* Description */}
            <p className="mt-8 max-w-2xl text-neutral-400 leading-relaxed text-base md:text-lg">
                Visualize is an interactive concept-board system designed to transform
                complex information into structured visual insights. It helps you map ideas,
                explore relationships, and interpret data in a clear, intuitive way.
            </p>

            <motion.button
                onClick={() => setOpen(true)}
                whileHover="hover"
                whileTap={{ scale: 0.96 }}
                initial="rest"
                animate="rest"
                className="relative px-7 py-2.5 rounded-full mt-10
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
                        from-orange-400 via-pink-400 to-yellow-300
                        animate-[spin_5s_cubic-bezier(0.4,0,0.2,1)_infinite]" />
                </span>

                {/* Inner Background (keeps button dark) */}
                <span className="absolute inset-[1.5px] rounded-full bg-black" />

                {/* Text */}
                <span className="relative z-10">Try it</span>

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

            <AnimatePresence>
                {open && <InputPopup onClose={() => setOpen(false)} />}
            </AnimatePresence>

        </section>


    )
}
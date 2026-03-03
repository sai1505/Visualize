export default function Footer() {
    return (
        <footer className="bg-black text-neutral-500 px-8 py-4 border-t border-neutral-800 text-md">
            <div className="flex justify-center">
                © {new Date().getFullYear()} Visualize. All rights reserved.
            </div>
        </footer>
    )
}
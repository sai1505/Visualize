import { useState } from "react"

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4">

      <h1 className="text-4xl font-bold mb-8 tracking-tight">
        Vite + React
      </h1>

      <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl border border-gray-800 flex flex-col items-center gap-6">

        <button
          onClick={() => setCount((prev) => prev + 1)}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all duration-200 rounded-xl font-semibold shadow-lg"
        >
          Count is {count}
        </button>

        <p className="text-gray-400 text-sm">
          Edit <code className="bg-gray-800 px-2 py-1 rounded">src/App.jsx</code> and save to test HMR
        </p>
      </div>

      <p className="mt-10 text-gray-500 text-sm">
        Built with Tailwind CSS 🚀
      </p>
    </div>
  )
}

export default App
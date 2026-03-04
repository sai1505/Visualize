import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Layout from "./components/Layout"
import Home from "./components/Home"
import GraphDashboard from "./components/GraphDashboard"

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/graph" element={<GraphDashboard />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
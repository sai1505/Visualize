import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Layout from "./components/Layouts/Layout"
import Home from "./components/Home"
import GraphDashboard from "./components/GraphDashboard"
import GraphDashboardSimple from "./components/GraphDashboardSimple"

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/graph" element={<GraphDashboard />} />
          <Route path="/graphsimple" element={<GraphDashboardSimple />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Layout from "./components/Layouts/Layout"
import Home from "./components/Home"
import GraphDashboard from "./components/GraphDashboard"
import GraphDashboardSimple from "./components/GraphDashboardSimple"
import GraphDashboardJSON from "./components/GraphDashboardJSON"
import GraphDashboardSimpleJSON from "./components/GraphDashboardSimpleJSON"

function App() {
  return (

    // Routes of all pages.
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/graph" element={<GraphDashboard />} />
          <Route path="/graphJSON" element={<GraphDashboardJSON />} />
          <Route path="/graphsimple" element={<GraphDashboardSimple />} />
          <Route path="/graphsimpleJSON" element={<GraphDashboardSimpleJSON />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
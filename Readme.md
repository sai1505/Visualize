# Visualize (An Interactive Knowledge Graph System)

## 🧭 Overview

The objective of this project was to design an **interactive knowledge visualization system** that presents information in the form of connected cards.

Traditional knowledge systems often present information as long text or static diagrams, which can be difficult for users to explore interactively. The challenge was to create a system where users can **navigate concepts intuitively and understand relationships between them**.

The system generates a **concept-based knowledge graph**, where a main topic is expanded into related concepts. Each concept is represented as a card connected to other relevant nodes, enabling users to explore the information space in a structured and interactive manner.

Initially, the task was to take inputs via **JSON or XML**, but the implementation extends this by generating the knowledge graph dynamically using an **LLM backend**.

---

## 🧩 Design

### Initial Approach — Semantic Zoom Interface

The first prototype explored a **Google Maps–style zoom interface**, where:

* A root card represents the main topic.
* Users zoom into a card to reveal deeper levels of information.
* Each zoom level exposes more detailed nodes.

While this approach was visually interesting, it introduced several issues:

* Increased interaction complexity
* Navigation confusion for deeper layers
* Poor scalability for large concept trees

After testing the experience from a **user perspective**, the design was reconsidered.

---

### Final Approach — Graph-Based Concept Structure

The final system uses a **graph/tree-based visualization**.

Structure:

* **Root Node** → Main topic
* **Branches** → Related concepts
* **Child Nodes** → Subtopics

This approach is widely used in **concept mapping tools (such as Miro or mind-mapping systems)** and is easier for users to understand.

Advantages of this design:

* Clear parent–child relationships
* Easy exploration of concepts
* Minimal cognitive load
* Better scalability for larger graphs

All rendering is handled within a **canvas-based interface**, ensuring smooth interaction and layout control.

---

## ⚙️ Tech Choices

### Frontend

**React.js**

Chosen for its component-based architecture and efficient UI updates.

Key features implemented:

* Interactive concept cards
* Canvas-based rendering
* Smooth UI transitions
* Dynamic node generation

For the earlier prototype, **CSS-based 2D zoom transitions** were used to simulate semantic zoom behavior without introducing heavy dependencies.

No additional visualization libraries were used to keep the system lightweight.

---

### Backend

**FastAPI**

Used to build a lightweight and high-performance API server responsible for generating the knowledge graph.

Backend responsibilities:

* Accept topic input from the user
* Define graph generation constraints
* Fetch concept information from an LLM
* Validate responses before sending them to the frontend

**Data Generation**

Instead of static JSON/XML input, the system dynamically generates the knowledge graph using an LLM.

The backend collects:

* Topic prompt
* Maximum node connections
* Maximum depth level

Constraints used in the implementation:

* Maximum graph depth: **6 layers**
* Maximum connections per node (after layer 1): **5**

---

### LLM Integration

**Grok API**

Used to generate structured concept information.

Each node returned contains:

* Title
* Description
* Parent relationship
* Depth level

---

### Data Validation

**Pydantic Models**

Used to ensure structured responses from the LLM before sending data to the frontend.

This helps prevent malformed graph structures and ensures consistent API responses.

---

## ✅ Tests

The system was verified through **iterative prototype testing** rather than formal unit tests.

### Testing Process

1. Implement initial **semantic zoom prototype**
2. Evaluate usability from a **user perspective**
3. Identify navigation and scalability issues
4. Redesign using a **graph-based visualization approach**
5. Validate node generation and rendering across multiple layers

### How to Run the Project

## ⚙️ Backend Setup

The backend is built with **FastAPI** and uses a **Python virtual environment (venv)**.
The application also requires a **`.env` file** to store the `GROQ_API_KEY`.
I used python 3.11.14 version (stable version.)

---

## 1. Create Virtual Environment

### macOS / Linux

```bash
python3.11 -m venv venv
source venv/bin/activate
```

### Windows (PowerShell)

```powershell
python3.11 -m venv venv
venv\Scripts\Activate.ps1
```

Once activated, your terminal should show:

```
(venv)
```

---

## 2. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## 3. Environment Variables

Create a `.env` file in the backend root directory.

```
GROQ_API_KEY=your_api_key_here
```

Example:

```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
```

Make sure `.env` is **not committed to GitHub**.

Add this to `.gitignore`:

```
.env
venv/
```

---

## 4. Run the Backend Server

```bash
python3.11 run.py
```

The API will start at:

```
http://localhost:8000
```

Interactive API documentation is available at:

```
http://localhost:8000/docs (Swagger UI)
```

---

## 6️⃣ Verify Backend

1. Start the server.
2. Open `/docs` in your browser.
3. Test the endpoints.
4. Send a topic request and verify that the backend returns a generated knowledge graph.

---

## 🎨 Frontend Setup

The frontend is built using **React.js** and provides the interactive interface for exploring the knowledge graph.

### 1. Navigate to the Frontend Folder

```bash
cd client
```

---

### 2. Install Dependencies

```bash
npm install
```

This installs all required frontend packages defined in `package.json`.

---

### 3. Start the Development Server

```bash
npm run dev
```

The React development server will start, typically at:

```
http://localhost:5173
```

---

### 4. Verify Frontend

1. Open the frontend URL in your browser.
2. Enter a **topic prompt**.
3. The system sends a request to the backend.
4. The backend generates the concept nodes using the LLM.
5. The frontend renders the nodes as **interactive cards in a graph layout**.

Users can then explore the knowledge graph by interacting with the connected nodes.

---

```

## Future Improvements

* Image integration for concept cards
* Improved graph layout algorithms
* Node clustering for large knowledge spaces
* Advanced interaction features (dragging, collapsing branches)
* User customization of graph depth and branching factor (Taking output from LLMs).

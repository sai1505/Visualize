# Visualize (An Interactive Knowledge Graph System)

## 🧭 Overview

The objective of this project is to design an **interactive knowledge visualization system** that presents information as connected concept cards.

Traditional knowledge systems often display information as long text or static diagrams, making exploration difficult. This system enables users to **navigate concepts interactively and understand relationships between them**.

The system generates a **concept-based knowledge graph**, where a main topic expands into related concepts. Each concept is represented as a card connected to other nodes, allowing users to explore information in a structured and intuitive way.

Initially, the task required taking input via **JSON or XML**, but this implementation extends the idea by generating the knowledge graph dynamically using an **LLM-powered backend**.

---

# 🧩 Design

## Initial Approach — Semantic Zoom Interface

The first prototype explored a **Google Maps–style semantic zoom interface**.

* A root card represents the main topic
* Users zoom into a card to reveal deeper information
* Each zoom level exposes more detailed nodes

While visually interesting, this approach introduced several challenges:

* Increased interaction complexity
* Navigation confusion for deeper layers
* Poor scalability for large concept trees

After evaluating the experience from a **user perspective**, the design approach was reconsidered.

---

## Final Approach — Graph-Based Concept Structure

The final system uses a **graph/tree-based visualization**.

### Structure

* **Root Node** → Main topic
* **Branches** → Related concepts
* **Child Nodes** → Subtopics

This structure is commonly used in **concept mapping tools such as Miro or mind-mapping systems**.

### Advantages

* Clear parent–child relationships
* Easier concept exploration
* Reduced cognitive load
* Better scalability for large knowledge graphs

All rendering is handled inside a **canvas-based interface**, ensuring smooth interactions and layout control.

---

# ⚙️ Tech Choices

## Frontend

**React.js**

Chosen for its component-based architecture and efficient UI rendering.

### Features Implemented

* Interactive concept cards
* Canvas-based rendering
* Smooth UI transitions
* Dynamic node generation

For the initial prototype, **CSS-based 2D zoom transitions** were used to simulate semantic zoom behavior without introducing heavy visualization libraries.

---

## Backend

**FastAPI**

Used to build a lightweight and high-performance API server responsible for generating the knowledge graph.

### Backend Responsibilities

* Accept topic input from the user
* Define graph generation constraints
* Fetch concept information from an LLM
* Validate responses before sending them to the frontend

### Graph Generation Constraints

* Maximum graph depth: **6 layers**
* Maximum connections per node (after layer 1): **5**

---

## LLM Integration

**GROQ API**

Used to generate structured concept information dynamically.

Each node includes:

* Title
* Description
* Parent relationship
* Depth level

---

## Data Validation

**Pydantic Models**

Used to ensure structured responses from the LLM before sending data to the frontend, preventing malformed graph structures.

---

# ✅ Testing Approach

The system was validated through **iterative prototype testing** rather than formal unit tests.

### Testing Process

1. Build initial **semantic zoom prototype**
2. Evaluate usability from a **user perspective**
3. Identify navigation and scalability limitations
4. Redesign using a **graph-based visualization**
5. Validate node generation across multiple layers

---

# 🚀 Running the Project

## Backend Setup

The backend uses **FastAPI** and runs inside a **Python virtual environment (venv)**.

Python version used:

```
Python 3.11.14
```

---

### 1. Create Virtual Environment

#### macOS / Linux

```bash
python3.11 -m venv venv
source venv/bin/activate
```

#### Windows (PowerShell)

```powershell
python3.11 -m venv venv
venv\Scripts\Activate.ps1
```

After activation the terminal should display:

```
(venv)
```

---

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

---

### 3. Environment Variables

Create a `.env` file in the backend root directory.

```
GROQ_API_KEY=your_api_key_here
```

Example:

```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
```

Ensure `.env` is not committed to GitHub.

Add to `.gitignore`:

```
.env
venv/
```

---

### 4. Run Backend Server

```bash
python3.11 run.py
```

Backend will start at:

```
http://localhost:8000
```

Swagger API documentation:

```
http://localhost:8000/docs
```

---

### 5. Verify Backend

1. Start the server
2. Open `/docs` in a browser
3. Test the API endpoints
4. Verify that the backend returns generated knowledge graph nodes

---

# 🎨 Frontend Setup

The frontend provides the **interactive interface for exploring the knowledge graph**.

### 1. Navigate to Frontend Directory

```bash
cd client
```

---

### 2. Install Dependencies

```bash
npm install
```

---

### 3. Run Development Server

```bash
npm run dev
```

The frontend will start at:

```
http://localhost:5173
```

---

### 4. Verify Frontend

1. Open the frontend URL in a browser
2. Enter a topic prompt
3. The frontend sends a request to the backend
4. The backend generates nodes using the LLM
5. The frontend renders the **interactive knowledge graph**

Users can explore connected concepts by interacting with the nodes.

---

# 🔮 Future Improvements

* Image integration for concept cards
* Improved graph layout algorithms
* Node clustering for large knowledge spaces
* Dragging and collapsing graph branches
* User-defined graph depth and branching factors

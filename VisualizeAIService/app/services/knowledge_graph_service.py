import uuid
from app.services.llm_service import generate_children
from app.services.storage_service import *
from app.core.config import settings


class KnowledgeGraphService:

    @staticmethod
    def generate_root(topic: str, max_nodes: int):
        """Generate the root node and its immediate children for a topic."""

        graph_id = topic.lower().replace(" ", "_")

        create_graph_folder(graph_id)

        # Depth-1 children can always be expanded (depth 1 < MAX_DEPTH)
        children_raw = generate_children(topic, topic, 0, max_nodes)

        formatted_children = []
        for child in children_raw:
            child_id = str(uuid.uuid4())
            formatted_children.append({
                "id": child_id,
                "title": child["title"],
                "description": child["description"],
                "depth": 1,
                "parent_id": graph_id,
                # depth-1 nodes can expand further unless MAX_DEPTH is 1
                "has_children": settings.MAX_DEPTH > 1,
            })

        root_node = {
            "id": graph_id,
            "title": topic,
            "description": f"Main topic: {topic}",
            "depth": 0,
            "parent_id": None,
            "children": formatted_children,
        }

        save_node(graph_id, graph_id, root_node)

        return root_node

    @staticmethod
    def expand_node(graph_id: str, node_id: str, title: str, depth: int, max_nodes: int):
        """
        Expand a node by generating its children.

        - Returns {"children": []} if already at MAX_DEPTH (leaf).
        - Returns cached data if the node was already expanded.
        - Otherwise generates children, marks has_children correctly, saves and returns.
        """

        # This node is already at the depth limit — it's a leaf
        if depth >= settings.MAX_DEPTH:
            return {"children": []}

        # Return cached expansion if it exists
        existing = load_node(graph_id, node_id)
        if existing:
            return existing

        # BUG FIX: was passing graph_id (e.g. "water_cycle") as the topic.
        # The topic for child generation should be `title`, not `graph_id`.
        children_raw = generate_children(title, title, depth, max_nodes)

        child_depth = depth + 1
        # Children can only be expanded if they won't immediately hit the limit
        children_have_children = child_depth < settings.MAX_DEPTH

        formatted_children = []
        for child in children_raw:
            child_id = str(uuid.uuid4())
            formatted_children.append({
                "id": child_id,
                "title": child["title"],
                "description": child["description"],
                "depth": child_depth,
                "parent_id": node_id,
                "has_children": children_have_children,
            })

        node_data = {
            "id": node_id,
            "title": title,
            "depth": depth,
            "parent_id": node_id,
            "children": formatted_children,
        }

        save_node(graph_id, node_id, node_data)

        return node_data
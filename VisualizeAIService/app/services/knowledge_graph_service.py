import uuid
from app.services.llm_service import generate_children
from app.services.storage_service import *
from app.core.config import settings

class KnowledgeGraphService:

    # To generate root node
    @staticmethod
    def generate_root(topic: str, max_nodes: int):

        graph_id = topic.lower().replace(" ", "_")

        create_graph_folder(graph_id)

        children = generate_children(topic, topic, 0, max_nodes)

        formatted_children = []

        for child in children:
            child_id = str(uuid.uuid4())

            formatted_children.append({
                "id": child_id,
                "title": child["title"],
                "description": child["description"],
                "depth": 1,
                "parent_id": graph_id,
                "has_children": True
            })

        root_node = {
            "id": graph_id,
            "title": topic,
            "description": f"Main topic: {topic}",
            "depth": 0,
            "parent_id": None,
            "children": formatted_children
        }

        save_node(graph_id, graph_id, root_node)

        return root_node
    

    # To generate nodes from a child node
    @staticmethod
    def expand_node(graph_id: str, node_id: str, title: str, depth: int, max_nodes: int):

        if depth >= settings.MAX_DEPTH:
            return {"children": []}

        existing = load_node(graph_id, node_id)
        if existing:
            return existing

        children = generate_children(graph_id, title, depth, max_nodes)

        formatted_children = []

        for child in children:
            child_id = str(uuid.uuid4())

            formatted_children.append({
                "id": child_id,
                "title": child["title"],
                "description": child["description"],
                "depth": depth + 1,
                "parent_id": node_id,
                "has_children": True
            })

        node_data = {
            "id": node_id,
            "title": title,
            "depth": depth,
            "parent_id": None,
            "children": formatted_children
        }

        save_node(graph_id, node_id, node_data)

        return node_data
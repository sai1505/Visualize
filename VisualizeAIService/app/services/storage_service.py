import os
import json
from app.core.config import settings

def _graph_path(graph_id: str):
    return os.path.join(settings.STORAGE_PATH, graph_id)

def create_graph_folder(graph_id: str):
    os.makedirs(_graph_path(graph_id), exist_ok=True)

def node_file_path(graph_id: str, node_id: str):
    return os.path.join(_graph_path(graph_id), f"{node_id}.json")

def save_node(graph_id: str, node_id: str, data: dict):
    path = node_file_path(graph_id, node_id)
    with open(path, "w") as f:
        json.dump(data, f, indent=4)

def load_node(graph_id: str, node_id: str):
    path = node_file_path(graph_id, node_id)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)
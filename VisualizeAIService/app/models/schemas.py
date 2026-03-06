from pydantic import BaseModel
from typing import Optional, List

# Pydantic Schemas (For validation.)
class GenerateRootRequest(BaseModel):
    topic: str
    max_nodes: int

class ExpandNodeRequest(BaseModel):
    graph_id: str
    node_id: str
    title: str
    depth: int
    max_nodes: int

class NodeResponse(BaseModel):
    id: str
    title: str
    description: str
    depth: int
    parent_id: Optional[str]
    children: List[dict]
from fastapi import APIRouter
from app.models.schemas import GenerateRootRequest, ExpandNodeRequest
from app.services.knowledge_graph_service import KnowledgeGraphService

router = APIRouter()

@router.post("/generate-root")
def generate_root(req: GenerateRootRequest):
    return KnowledgeGraphService.generate_root(req.topic, req.max_nodes)

@router.post("/expand-node")
def expand_node(req: ExpandNodeRequest):
    return KnowledgeGraphService.expand_node(
        req.graph_id,
        req.node_id,
        req.title,
        req.depth,
        req.max_nodes
    )
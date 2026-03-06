import sys
import os
import uvicorn

sys.path.append(os.path.dirname(__file__))

# Running the FastAPI server.
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False
    )
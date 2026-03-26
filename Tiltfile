docker_build(
    "agentic-image-studio-backend",
    "./backend",
    target="dev",
    live_update=[
        sync("./backend", "/app"),
        run("cd /app && npm install", trigger=["./backend/package.json"]),
    ],
)

docker_build(
    "agentic-image-studio-frontend",
    "./frontend",
    target="dev",
    live_update=[
        sync("./frontend", "/app"),
        run("cd /app && npm install", trigger=["./frontend/package.json"]),
    ],
)

k8s_yaml(helm("./helm/agentic-image-studio", values=["./helm/agentic-image-studio/values-dev.yaml"]))

k8s_resource("backend", port_forwards="3000:3000", labels=["backend"])
k8s_resource("frontend", port_forwards="5173:5173", labels=["frontend"])

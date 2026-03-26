docker_build(
    "agentic-image-studio-backend",
    "./backend",
    live_update=[
        sync("./backend", "/app"),
        run("cd /app && npm install", trigger=["./backend/package.json"]),
    ],
)

docker_build(
    "agentic-image-studio-frontend",
    "./frontend",
    live_update=[
        sync("./frontend", "/app"),
        run("cd /app && npm install", trigger=["./frontend/package.json"]),
        run("cd /app && npm run build", trigger=["./frontend/src"]),
    ],
)

k8s_yaml(helm("./helm/agentic-image-studio"))

k8s_resource("backend", port_forwards="3000:3000", labels=["backend"])
k8s_resource("frontend", port_forwards="8080:80", labels=["frontend"])

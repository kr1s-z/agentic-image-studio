# -*- mode: Python -*-

load("ext://helm_resource", "helm_resource")

CHART = "./helm/agentic-image-studio"


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

helm_release = "agentic"
helm_extra = []

helm_flags = [
    "--values=" + CHART + "/values.yaml",
    "--values=" + CHART + "/values-dev.yaml",
]
if os.path.exists(CHART + "/values-secrets.local.yaml"):
    helm_flags.append("--values=" + CHART + "/values-secrets.local.yaml")

helm_flags.extend(helm_extra)

helm_deps = [
    CHART + "/templates",
    CHART + "/values.yaml",
    CHART + "/values-dev.yaml",
]
if os.path.exists(CHART + "/values-secrets.local.yaml"):
    helm_deps.append(CHART + "/values-secrets.local.yaml")

# Runs `helm upgrade --install` via Tilt helm_resource.
helm_resource(
    "agentic",
    CHART,
    release_name=helm_release,
    deps=helm_deps,
    image_deps=[
        "agentic-image-studio-backend",
        "agentic-image-studio-frontend",
    ],
    image_keys=[
        ("backend.image.repository", "backend.image.tag"),
        ("frontend.image.repository", "frontend.image.tag"),
    ],
    flags=helm_flags,
    labels=["helm"],
)

k8s_resource(
    "agentic",
    port_forwards=["3000:3000", "5173:5173"],
    labels=["app"],
)

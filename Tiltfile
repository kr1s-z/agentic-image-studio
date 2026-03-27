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

def parse_dotenv(path):
    """Parse a .env file into a dict, skipping comments and blank lines."""
    result = {}
    if not os.path.exists(path):
        return result
    for line in str(read_file(path)).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        result[key.strip()] = val.strip()
    return result

env = parse_dotenv(".env")

ENV_TO_HELM = {
    "REPLICATE_API_TOKEN": "backend.env.replicateApiToken",
    "LANGFUSE_PUBLIC_KEY": "backend.env.langfusePublicKey",
    "LANGFUSE_SECRET_KEY": "backend.env.langfuseSecretKey",
    "LANGFUSE_BASE_URL": "backend.env.extra.LANGFUSE_BASE_URL",
    "LLM_MODEL":           "backend.env.extra.LLM_MODEL",
    "LLM_MIN_REQUEST_GAP_MS": "backend.env.extra.LLM_MIN_REQUEST_GAP_MS",
    "MAX_ITERATIONS":      "backend.env.extra.MAX_ITERATIONS",
}

helm_flags = [
    "--values=" + CHART + "/values.yaml",
    "--values=" + CHART + "/values-dev.yaml",
]
if os.path.exists(CHART + "/values-secrets.local.yaml"):
    helm_flags.append("--values=" + CHART + "/values-secrets.local.yaml")

for env_key, helm_key in ENV_TO_HELM.items():
    val = env.get(env_key, "")
    if val:
        helm_flags.append("--set=" + helm_key + "=" + val)

helm_deps = [
    CHART + "/templates",
    CHART + "/values.yaml",
    CHART + "/values-dev.yaml",
]
if os.path.exists(CHART + "/values-secrets.local.yaml"):
    helm_deps.append(CHART + "/values-secrets.local.yaml")
if os.path.exists(".env"):
    helm_deps.append(".env")

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

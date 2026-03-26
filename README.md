# Agentic Image Studio

AI-powered image generation platform.

## Architecture

| Component | Tech       | Local domain       |
|-----------|------------|--------------------|
| Frontend  | React/Vite | `app.lvh.me`       |
| Backend   | Express    | `backend.lvh.me`   |

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Docker](https://docs.docker.com/get-docker/)
- [Minikube](https://minikube.sigs.k8s.io/docs/start/)
- [Helm](https://helm.sh/docs/intro/install/)
- [Tilt](https://docs.tilt.dev/install.html)

## Quick start (local development)

### 1. Start Minikube with ingress

```bash
minikube start
minikube addons enable ingress
```

### 2. Point Docker to Minikube

```bash
eval $(minikube docker-env)
```

### 3. Run Tilt

```bash
tilt up
```

Tilt will build the images, deploy the Helm chart, and set up live-sync.

- **Frontend**: http://app.lvh.me (via ingress) or http://localhost:8080 (port-forward)
- **Backend**: http://backend.lvh.me (via ingress) or http://localhost:3000 (port-forward)

### 4. Tunnel ingress traffic (separate terminal)

```bash
minikube tunnel
```

This routes `*.lvh.me` (which resolves to `127.0.0.1`) through the minikube ingress controller.

## Helm only (without Tilt)

```bash
eval $(minikube docker-env)
docker build -t agentic-image-studio-backend:latest ./backend
docker build -t agentic-image-studio-frontend:latest ./frontend
helm install studio ./helm/agentic-image-studio
```

## Project structure

```
.
├── backend/          Express API
├── frontend/         React (Vite) app
├── helm/             Helm chart
│   └── agentic-image-studio/
├── Tiltfile          Tilt local-dev config
└── README.md
```

# Deployment with Docker, GHCR, and Watchtower

This guide describes how to run the KNX web app in production using prebuilt images from the GitHub Container Registry (`ghcr.io`), `docker-compose.prod.yml`, and optional automatic updates via Watchtower.

## Overview

- Every push to `main` or `build-docker` triggers the workflow [`.github/workflows/docker-build.yml`](/data/.openclaw/workspace/knx-viz/.github/workflows/docker-build.yml).
- The workflow builds two multi-arch images (`linux/amd64`, `linux/arm64`):
  - Frontend: `ghcr.io/<owner>/<repo>-frontend`
  - Backend: `ghcr.io/<owner>/<repo>-backend`
- On `main`, the `latest` tag is also published.
- Watchtower can regularly check the VPS for new image tags and automatically restart the running containers.

## Prerequisites for Andi

- Docker Engine and the Docker Compose plugin are installed on the VPS.
- Access to the repository or the GHCR packages is available.
- If the packages are private:
  - A GitHub Personal Access Token with at least `read:packages`
  - Optionally `repo` if the repository is private

## One-time setup on the VPS

1. Clone the repository to the VPS.
2. Create a `.env` file:

```bash
cp .env.example .env
```

3. Adjust the values in `.env`:

```dotenv
FRONTEND_IMAGE=ghcr.io/candyscode/ai-frontend
BACKEND_IMAGE=ghcr.io/candyscode/ai-backend
IMAGE_TAG=latest
BACKEND_PORT=3001
KNX_IP=192.168.1.85
KNX_PORT=3671
CORS_ORIGIN=https://your-domain.example
TZ=Europe/Berlin
WATCHTOWER_POLL_INTERVAL=300
```

4. If you use a private registry, log in to `ghcr.io` on the VPS:

```bash
echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
```

5. Start the stack:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Production operation with GHCR images

The file [`docker-compose.prod.yml`](/data/.openclaw/workspace/knx-viz/docker-compose.prod.yml) does not build locally. It pulls the release images directly from `ghcr.io`.

```yaml
services:
  frontend:
    image: ghcr.io/candyscode/ai-frontend:latest
    ports:
      - "80:80"

  backend:
    image: ghcr.io/candyscode/ai-backend:latest
    ports:
      - "3001:3001"
    environment:
      PORT: 3001
      KNX_IP: 192.168.1.85
      KNX_PORT: 3671
      CORS_ORIGIN: https://your-domain.example
```

The actual values used come from `.env`. For rollbacks, `IMAGE_TAG` can be set to a `sha-...` tag or a branch tag.

## Watchtower for Andi

### Option A: Using the setup script

The script [`setup-watchtower.sh`](/data/.openclaw/workspace/knx-viz/setup-watchtower.sh) can be run once on the VPS:

```bash
chmod +x setup-watchtower.sh
./setup-watchtower.sh
```

The script:
- creates `.env` from `.env.example` if it does not exist yet
- checks Docker and Compose
- starts the Watchtower container

### Option B: Manual setup

```bash
docker compose -f docker-compose.prod.yml --profile watchtower up -d watchtower
```

Important:
- Watchtower needs access to `/var/run/docker.sock`.
- For private GHCR images, a valid Docker login for `ghcr.io` must exist on the VPS.
- In this configuration, Watchtower monitors only `frontend` and `backend`.

## Explanation of the GitHub Actions workflow

The workflow [`.github/workflows/docker-build.yml`](/data/.openclaw/workspace/knx-viz/.github/workflows/docker-build.yml) does the following:

1. Checks out the repository contents.
2. Derives the final GHCR image names from the owner and repository.
3. Enables QEMU and Buildx for multi-platform builds.
4. Logs in to the GitHub Container Registry using `GITHUB_TOKEN`.
5. Builds and pushes the frontend and backend images for `linux/amd64` and `linux/arm64`.
6. Uses the `type=gha` cache so subsequent builds are significantly faster.
7. Assigns tags:
   - `latest` for `main`
   - Branch tag, for example `main` or `build-docker`
   - Commit tag in the format `sha-<commit>`

## Update flow

- Push changes to `main`.
- GitHub Actions builds and publishes new images.
- Watchtower pulls the new images automatically on the next poll interval.
- Without Watchtower, you can update manually:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### `pull access denied` or `unauthorized`

- Check whether the package exists in GHCR.
- Check whether `docker login ghcr.io` succeeded on the VPS.
- For private repositories, make sure the token has `read:packages`.

### Watchtower does not update

- Check the logs:

```bash
docker logs watchtower --tail 100
```

- Make sure Watchtower is running:

```bash
docker ps --filter name=watchtower
```

- Check whether a new tag was actually published in `ghcr.io`.

### Backend stays unhealthy

- Check the container logs:

```bash
docker compose -f docker-compose.prod.yml logs backend --tail 200
```

- Test the health check directly:

```bash
docker compose -f docker-compose.prod.yml exec backend node -e "fetch('http://127.0.0.1:3001/api/health').then(async (res) => { console.log(res.status); console.log(await res.text()); })"
```

- Check the KNX IP, KNX port, and the `config.json` mount.

### Frontend only returns Nginx errors

- Check the logs:

```bash
docker compose -f docker-compose.prod.yml logs frontend --tail 200
```

- Check whether the backend is running in the same Compose network and reachable at `backend:3001`.

### Socket.IO does not connect

- Set `CORS_ORIGIN` to the real public domain.
- Check the reverse proxy or firewall if an external proxy is running in front of the container.
- Make sure `/socket.io/` is not blocked by an upstream proxy.

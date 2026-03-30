# Staging Deployment

This repository uses automatic staging deployment for testing changes before merging to `main`.

## How It Works

1. Push to any feature branch (not `main` or `build-docker`)
2. GitHub Actions automatically deploys to the VPS via SSH
3. The VPS builds the app locally from the branch
4. Test at `http://187.124.180.141:8080`
5. If it looks good, merge to `main`

## Required Setup (one-time)

### 1. Generate SSH Key on VPS

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_deploy
# Press Enter (no passphrase)

cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy  # Copy the private key
```

### 2. Add GitHub Secrets

Go to: https://github.com/candyscode/AI/settings/secrets/actions

| Secret | Value |
|--------|-------|
| `VPS_SSH_KEY` | The private key (full content) |
| `VPS_HOST` | `187.124.180.141` |
| `VPS_USER` | `root` |

### 3. Prepare Staging Directory on VPS

```bash
cd ~
git clone https://github.com/candyscode/AI.git knx-viz
cd knx-viz
chmod +x deploy-staging.sh
```

## Development Workflow

1. Create a feature branch and push changes
2. GitHub Actions will automatically deploy
3. Wait for the Actions run to complete (check https://github.com/candyscode/AI/actions)
4. Test at `http://187.124.180.141:8080`
5. If everything works → create PR → merge to `main`

## Files Used for Staging

- `docker-compose.staging.yml` — Docker Compose for local builds
- `deploy-staging.sh` — Deployment script
- `.github/workflows/deploy-staging.yml` — GitHub Actions workflow
# Cleanup Complete

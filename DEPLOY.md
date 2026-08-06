# Deploying WeddingAgent to Google Cloud Run

This repo ships a production container and a managed **Cloud Build → Artifact
Registry → Cloud Run** pipeline. In production a single container runs the
Express server, which serves both the built React app and the `/api/*` routes
on the port Cloud Run provides (`PORT`, default `8080`).

Repo pieces:

- `Dockerfile` — multi-stage build (build web + server, then a slim runtime image).
- `cloudbuild.yaml` — build the image, push it to Artifact Registry, deploy to Cloud Run.
- `npm run build` — produces `dist/` (web) and `dist-server/index.js` (server).

> Note: the data store is still **in-memory**, so a deployed revision resets its
> data on restart/redeploy. Add Cloud SQL (Postgres) or Firestore before relying
> on it for real data.

---

## One-time GCP setup

Run these with the `gcloud` CLI authenticated to your account.

First set your project ID and region as shell variables — every command below
reuses them. Find your project ID with `gcloud projects list` and use the
**`PROJECT_ID`** column (the lowercase-letters/digits/hyphens string, e.g.
`wedding-agent-prod`) — **not** the numeric `PROJECT_NUMBER`. Notes:

- Passing the literal placeholder or a name with underscores/uppercase gives
  `INVALID_ARGUMENT`.
- Some commands (e.g. `gcloud builds submit`) reject a project *number* with
  "set it to PROJECT ID instead" — always use the ID string.

```bash
# List projects and copy the projectId (string) — NOT the projectNumber:
gcloud projects list --format="table(projectId, name, projectNumber)"

# Set these once for the rest of the guide
export PROJECT_ID="your-project-id"          # e.g. wedding-agent-prod (a string, not digits)
export REGION="australia-southeast1"         # Sydney — closest to Auckland

# If you only have the project NUMBER, resolve the ID from it:
#   export PROJECT_ID="$(gcloud projects list \
#     --filter='projectNumber=YOUR_NUMBER' --format='value(projectId)')"

# Guard: fail early if PROJECT_ID was accidentally set to the numeric project number.
case "$PROJECT_ID" in
  ''|*[!0-9]*) : ;;  # empty or contains non-digits → looks like an ID (ok)
  *) echo "PROJECT_ID='$PROJECT_ID' looks like a project NUMBER; set it to the project ID string" ;;
esac
```

```bash
# 0. Select project and enable the required APIs
gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

# 1. Create the Artifact Registry Docker repo (name must match _REPO)
gcloud artifacts repositories create wedding-agent \
  --project="$PROJECT_ID" \
  --repository-format=docker \
  --location="$REGION" \
  --description="WeddingAgent container images"
```

### Grant the Cloud Build service account permission to deploy

The trigger's build service account needs to deploy to Cloud Run and act as the
Cloud Run runtime service account:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"   # or your dedicated build SA

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role="roles/iam.serviceAccountUser"
```

---

## First deploy (manual, to verify everything works)

The quickest way to confirm the image + service work before wiring the trigger.

> Run this from the **repo root**, on a branch that contains `Dockerfile` and
> `cloudbuild.yaml`. `gcloud builds submit` uploads the current directory as the
> build context, so you must be inside the cloned repository (otherwise you'll see
> `fatal: not a git repository`). Until PR #1 is merged to `main`, check out that
> branch first:
>
> ```bash
> git clone https://github.com/SamBadham1/WeddingAgent.git
> cd WeddingAgent
> git checkout cursor/setup-dev-environment-4d27
> ```

```bash
# Tag the image with the current commit (falls back to a timestamp if not a git checkout)
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)

gcloud builds submit --config cloudbuild.yaml \
  --project="$PROJECT_ID" \
  --substitutions=SHORT_SHA="$SHORT_SHA"
```

`gcloud run deploy ... --allow-unauthenticated` (in `cloudbuild.yaml`) makes the
service publicly reachable and prints the service URL on success.

---

## Wire the managed pipeline (deploy on every push)

1. **Connect the GitHub repo to Cloud Build.** In the Google Cloud console go to
   *Cloud Build → Triggers → Connect repository* and authorize the Cloud Build
   GitHub app for `SamBadham1/WeddingAgent`. (This authorization step is easiest
   via the console.)

2. **Create the trigger** (build on pushes to `main`):

   ```bash
   gcloud builds triggers create github \
     --project="$PROJECT_ID" \
     --name=wedding-agent-deploy \
     --region="$REGION" \
     --repo-owner=SamBadham1 \
     --repo-name=WeddingAgent \
     --branch-pattern='^main$' \
     --build-config=cloudbuild.yaml
   ```

   Adjust `--branch-pattern` if you want to deploy from a different branch.

3. **Push to the branch.** Each push now builds the image, pushes it to Artifact
   Registry, and rolls out a new Cloud Run revision automatically. Roll back any
   time from *Cloud Run → Revisions*.

---

## Suggested next steps

- **Persistence:** add Cloud SQL (Postgres) or Firestore and replace the in-memory
  store; wire the connection string through **Secret Manager**.
- **Staged rollouts:** add **Cloud Deploy** with `staging → production` targets and
  approval gates if you need progressive/canary delivery.
- **Custom domain + CDN:** map a domain to the service, or front it with a Global
  External HTTPS Load Balancer + Cloud CDN.

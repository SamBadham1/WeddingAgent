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

### Grant the Cloud Build service account its permissions

Builds run as a service account (by default the Compute Engine default SA). On
newer projects that account starts with **no roles** (the org policy
`iam.automaticIamGrantsForDefaultServiceAccounts` disables the old automatic
Editor grant), so Cloud Build fails to build/log/deploy — and trigger creation
can fail with *"insufficient permissions from service account …compute@developer…
to project …"*. Grant it:

- `roles/cloudbuild.builds.builder` — run builds, write logs, push images
- `roles/run.admin` — deploy Cloud Run revisions
- `roles/iam.serviceAccountUser` — act as the Cloud Run runtime service account

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"   # or your dedicated build SA

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role="roles/cloudbuild.builds.builder"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role="roles/iam.serviceAccountUser"
```

Verify the roles actually landed (sandbox/locked-down projects may silently
block IAM changes — a common cause of *"insufficient permissions from service
account …compute@developer… to project …"* persisting after granting them):

```bash
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" \
  --filter="bindings.members:${BUILD_SA}" \
  --format="table(bindings.role)"
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

### Alternative: build + push with local Docker (bypasses the Cloud Build SA)

Useful when the Cloud Build service account can't be granted the needed roles
(e.g. temporary sandbox/playground projects, or persistent *"insufficient
permissions from service account …compute@developer…"* errors). Cloud Shell has
Docker, so this builds and deploys as **your** identity — no build SA or trigger
required. Requires the Artifact Registry repo from step 1.

```bash
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/wedding-agent/wedding-agent:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

docker build -t "$IMAGE" .
docker push "$IMAGE"

gcloud run deploy wedding-agent \
  --image "$IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --project "$PROJECT_ID"
```

This prints a public `run.app` URL. Wire the automated GitHub trigger later in a
standard (non-sandbox) project.

---

## Wire the managed pipeline (deploy on every push)

> The **Cloud Run deploy region is set in `cloudbuild.yaml` (`_REGION`)**, so it
> always deploys to `australia-southeast1` regardless of where the trigger/build
> runs. You do not need a regional trigger to deploy to Sydney.

**Easiest: create the trigger in the Console.** Cloud Build → *Triggers* →
*Connect Repository* → **GitHub (Cloud Build GitHub App)** → authorize
`SamBadham1/WeddingAgent` → then **Create Trigger** (event: push to `^main$`,
configuration: `cloudbuild.yaml`). The console handles the GitHub connection and
region for you.

**CLI alternative:**

1. **Connect the repo first.** A classic GitHub trigger only works after the repo
   is linked via the Cloud Build GitHub App (do this once in the console:
   *Cloud Build → Triggers → Connect repository*). Without it, the create call
   fails with `INVALID_ARGUMENT`.

2. **Create the trigger — global (no `--region`).** Classic `create github`
   triggers are global; passing `--region` mixes them with the regional (2nd-gen)
   model and can throw `INVALID_ARGUMENT`:

   ```bash
   gcloud builds triggers create github \
     --project="$PROJECT_ID" \
     --name=wedding-agent-deploy \
     --repo-owner=SamBadham1 \
     --repo-name=WeddingAgent \
     --branch-pattern='^main$' \
     --build-config=cloudbuild.yaml
   ```

   Adjust `--branch-pattern` if you want to deploy from a different branch.
   Inspect existing triggers/connections with:

   ```bash
   gcloud builds triggers list --project="$PROJECT_ID"
   gcloud builds connections list --project="$PROJECT_ID" --region="$REGION"
   ```

3. **Push to the branch.** Each push now builds the image, pushes it to Artifact
   Registry, and rolls out a new Cloud Run revision automatically. Roll back any
   time from *Cloud Run → Revisions*.

> Note: temporary sandbox/playground projects may block installing the Cloud
> Build GitHub App or creating triggers via org policy, which can also appear as
> `INVALID_ARGUMENT`. Use a standard project if the connect flow is blocked.

---

## Suggested next steps

- **Persistence:** add Cloud SQL (Postgres) or Firestore and replace the in-memory
  store; wire the connection string through **Secret Manager**.
- **Staged rollouts:** add **Cloud Deploy** with `staging → production` targets and
  approval gates if you need progressive/canary delivery.
- **Custom domain + CDN:** map a domain to the service, or front it with a Global
  External HTTPS Load Balancer + Cloud CDN.

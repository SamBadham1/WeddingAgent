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

Run these with the `gcloud` CLI authenticated to your account. Replace
`PROJECT_ID` with your project. Region/repo/service default to
`australia-southeast1` (Sydney — the Google Cloud region closest to Auckland) /
`wedding-agent` / `wedding-agent` (matching `cloudbuild.yaml` substitutions).

```bash
# 0. Select project and enable the required APIs
gcloud config set project PROJECT_ID
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# 1. Create the Artifact Registry Docker repo (name must match _REPO)
gcloud artifacts repositories create wedding-agent \
  --repository-format=docker \
  --location=australia-southeast1 \
  --description="WeddingAgent container images"
```

### Grant the Cloud Build service account permission to deploy

The trigger's build service account needs to deploy to Cloud Run and act as the
Cloud Run runtime service account:

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"   # or your dedicated build SA

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${BUILD_SA}" --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${BUILD_SA}" --role="roles/iam.serviceAccountUser"
```

---

## First deploy (manual, to verify everything works)

The quickest way to confirm the image + service work before wiring the trigger:

```bash
# Builds via cloudbuild.yaml and deploys once, using SHORT_SHA from the current commit
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD)
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
     --name=wedding-agent-deploy \
     --region=australia-southeast1 \
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

# Deploying WeddingAgent to Google Cloud Run

This repo ships a production container and a managed **Cloud Build → Artifact
Registry → Cloud Run** pipeline. In production a single container runs the
Express server, which serves both the built React app and the `/api/*` routes
on the port Cloud Run provides (`PORT`, default `8080`).

Repo pieces:

- `Dockerfile` — multi-stage build (build web + server, then a slim runtime image).
- `cloudbuild.yaml` — build the image, push it to Artifact Registry, deploy to Cloud Run.
- `npm run build` — produces `dist/` (web) and `dist-server/index.js` (server).

> Note: the data store is **Firestore**. Data persists across restarts and
> redeploys. See [Firestore setup](#firestore-setup) below for one-time
> configuration.

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
  firestore.googleapis.com \
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

## Firestore setup

WeddingAgent stores guests, tasks, budget items, and wedding metadata in
Firestore. On first startup the server seeds sample data when the
`wedding/default` document is missing.

### 1. Create the Firestore database

```bash
gcloud firestore databases create \
  --database=wedding \
  --location="$REGION" \
  --project="$PROJECT_ID"
```

The app connects to the database with ID **`wedding`** (override with
`FIRESTORE_DATABASE_ID` if needed).

Use the same region as Cloud Run (`australia-southeast1`) when possible.

### 2. Grant the Cloud Run service account access

The default Compute Engine service account runs the Cloud Run revision. Grant it
the Firestore user role:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/datastore.user"
```

On Cloud Run the Firestore client uses Application Default Credentials — no
connection string or Secret Manager entry is required.

### 3. Collections created at runtime

| Collection | Document ID | Fields |
| ---------- | ----------- | ------ |
| `wedding` | `default` | `coupleNames`, `date`, `totalBudget` |
| `guests` | numeric string (`"1"`, `"2"`, …) | `name`, `rsvp`, `group`, `email`, `overnight` |
| `tasks` | numeric string | `title`, `done` |
| `budget` | numeric string | `category`, `estimated`, `actual` |
| `counters` | `ids` | `guestId`, `taskId`, `budgetId` |
| `emailTemplates` | auto ID | `name`, `subject`, `body`, `createdAt`, `updatedAt` |
| `emailOutbox` | auto ID | `guestId`, `to`, `templateId`, `subject`, `text`, `html`, `status`, `sendAfter`, `sentAt`, `attempts`, `error` |

### Local development with the emulator

```bash
firebase emulators:start --only firestore
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export GOOGLE_CLOUD_PROJECT=local-wedding-agent
export FIRESTORE_DATABASE_ID=wedding
npm run dev
```

---

## Guest emails

The dashboard's **Emails** page renders a template for each selected guest and
stages the result in the `emailOutbox` collection. Clicking **Send queued now**
sends the due `queued` emails through **Gmail SMTP** (`smtp.gmail.com:465`),
signed in to the wedding Gmail account with an **app password**. It's free. A
personal Gmail account can send to about 500 recipients a day, and
`EMAIL_MAX_PER_RUN` caps each send at 400.

### 1. Gmail account + app password

Everything in this step is done **signed in as the wedding Gmail account**
(the address emails come *from*). No Cloud Console setup is needed.

#### 1.1 Create the wedding Gmail account

1. Go to <https://accounts.google.com/signup> and create the account, e.g.
   `our.wedding@gmail.com`. Use a private browser window so you aren't signed
   in to your usual account at the same time.
2. Optional: set the account's name and profile photo. Some mail apps (e.g.
   Gmail) show the photo next to your emails.

The *From* line guests see comes from `GMAIL_SENDER`
(`Sam & Sam <our.wedding@gmail.com>`). The display name can be anything you
like. The address inside `<…>` is also the SMTP login, so it must be this
account.

#### 1.2 Turn on 2-Step Verification

App passwords only exist on accounts with 2-Step Verification.

1. Open <https://myaccount.google.com/security> → **2-Step Verification** →
   **Get started**.
2. Add a phone number (or an authenticator app) and finish the setup.

#### 1.3 Create an app password

1. Open <https://myaccount.google.com/apppasswords>. The page isn't linked
   from the menus, so use the URL directly. Sign in again if asked.
2. *App name*: e.g. `wedding-agent` → **Create**.
3. Google shows a 16-letter password in four groups, e.g.
   `abcd efgh ijkl mnop`. **Copy it now; it's only shown once.** The spaces
   don't matter (the server strips them).

To test sending locally, put it in `.env`:

```bash
GMAIL_SENDER=Sam & Sam <our.wedding@gmail.com>
GMAIL_APP_PASSWORD=abcdefghijklmnop
EMAIL_DRY_RUN=false
```

Troubleshooting:

- **"The setting you are looking for is not available for your account"** on
  the app passwords page: 2-Step Verification isn't on yet (1.2), or the
  account only has a passkey. Add a phone or authenticator method as well.
- **`535-5.7.8 Username and Password not accepted`** when sending: the
  address in `GMAIL_SENDER` isn't the account that created the app password,
  or the password was copied wrongly. Create a new one.

Treat the app password like a real password: anyone who has it can send
email as the wedding account. It stops working if you revoke it on the app
passwords page or change the account's password. If that happens, create a
new one and add it as a new secret version (below).

### 2. Secrets

Run these as **your usual account** (the GCP project owner):

```bash
gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID"

printf '%s' "$(openssl rand -base64 24)" | gcloud secrets create ADMIN_TOKEN --data-file=- --project="$PROJECT_ID"
printf '%s' "abcdefghijklmnop"           | gcloud secrets create GMAIL_APP_PASSWORD --data-file=- --project="$PROJECT_ID"

# The Cloud Run runtime service account must be able to read them
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for s in ADMIN_TOKEN GMAIL_APP_PASSWORD; do
  gcloud secrets add-iam-policy-binding "$s" --project="$PROJECT_ID" \
    --member="serviceAccount:${RUN_SA}" --role="roles/secretmanager.secretAccessor"
done

# Replace a value later (e.g. a new app password), then redeploy to pick it up:
printf '%s' "newpasswordhere" | gcloud secrets versions add GMAIL_APP_PASSWORD --data-file=- --project="$PROJECT_ID"

# Read the dashboard password back when you need it:
gcloud secrets versions access latest --secret=ADMIN_TOKEN --project="$PROJECT_ID"
```

Then set `_GMAIL_SENDER` in `cloudbuild.yaml` (or as a trigger substitution)
and redeploy. **The deploy fails if either secret is missing.**

### 3. Send a test

Stage one email to your own address on the **Emails** page, click **Send
queued now**, and check that it arrives from the wedding Gmail account and the
RSVP button opens the RSVP site. The email also appears in the wedding
account's **Sent** folder.

---

## Suggested next steps

- **Staged rollouts:** add **Cloud Deploy** with `staging → production` targets and
  approval gates if you need progressive/canary delivery.
- **Custom domain + CDN:** map a domain to the service, or front it with a Global
  External HTTPS Load Balancer + Cloud CDN.

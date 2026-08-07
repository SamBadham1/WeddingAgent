# WeddingAgent data import

Self-contained scripts for importing guest data into Firestore from **Google Cloud Shell**.

Targets the Firestore database with ID **`wedding`** (same as the WeddingAgent app).

## Folder contents

| File | Purpose |
| ---- | ------- |
| `guests.json` | Guest list to import — edit this before running |
| `import-guests.mjs` | Node script that writes guests to Firestore |
| `run-import.sh` | Convenience wrapper for Cloud Shell |
| `package.json` | Minimal deps (`@google-cloud/firestore` only) |

## Quick start (Cloud Shell)

```bash
# Clone or upload this folder, then:
cd import

export PROJECT_ID="$(gcloud config get-value project)"
export FIRESTORE_DATABASE_ID=wedding   # optional — this is the default

chmod +x run-import.sh
./run-import.sh
```

Preview without writing:

```bash
./run-import.sh --dry-run
```

## Manual run

```bash
cd import
npm install

export PROJECT_ID="$(gcloud config get-value project)"
export FIRESTORE_DATABASE_ID=wedding

# Replace all existing guests with guests.json
npm run import:guests:replace

# Preview only
node import-guests.mjs --replace --dry-run

# Use a different JSON file
node import-guests.mjs --replace --file=my-guests.json
```

## guests.json format

Each entry:

```json
{
  "name": "Samantha",
  "rsvp": "pending",
  "group": "Other",
  "notes": "optional — stored in Firestore but not shown in the app UI yet"
}
```

- `name` — required
- `rsvp` — `yes`, `no`, or `pending` (defaults to `pending`)
- `group` — defaults to `Other`
- `notes` — optional metadata for your own reference

## What the import does

1. With `--replace`, deletes all documents in the `guests` collection
2. Writes guests from JSON with numeric document IDs (`"1"`, `"2"`, …)
3. Updates `counters/ids.guestId` so new guests added via the app continue from the correct ID

## Permissions

Your Cloud Shell user needs Firestore write access, e.g. `roles/datastore.user` on the project.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:YOUR_EMAIL" \
  --role="roles/datastore.user"
```

## Editing the guest list

1. Update `guests.json`
2. Re-run `./run-import.sh` (or `npm run import:guests:replace`)

Use `--dry-run` first if you want to verify counts before overwriting.

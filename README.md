# root-route (LateLens)

Halcyon late-deliveries hackathon: diagnosis, recommendations and the Root Route landing page.

| Folder | What | Stack |
|---|---|---|
| `frontend/` | Landing page (scroll film); the deployable web app. See `frontend/README.md` | Next.js 15, React 19, GSAP, Lenis |
| `backend/` | `analysis/` (dataset loader + cause flags), `carrier-optimization-engine/` (carrier risk model, replay) | Python, pandas |
| `docs/` | Product + technical spec (`SPEC.md` is the source of truth), sub-specs, problem statement | — |
| `Halcyon-Hackathon-Dataset/` | Supplied synthetic dataset (read-only) | CSV |

## Quick start

```bash
npm run setup   # installs frontend dependencies (npm ci in frontend/)
npm run dev     # http://localhost:3000
npm run build   # production build of the frontend
```

Python (from the repo root):

```bash
python backend/carrier-optimization-engine/carrier_recommender_ml.py --data ./Halcyon-Hackathon-Dataset
```

## Deploy

Deploy `frontend/` as the app root (Vercel: set Root Directory to `frontend`; Azure Static Web Apps: `app_location: frontend`).

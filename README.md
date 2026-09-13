# Little Shots Studio OS

Internal pipeline tool for Little Shots by Hema. Static front end on Vercel, Supabase for
data and access control.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styling |
| `app.js` | The whole application |
| `vercel.json` | Headers and caching |

No build step and no dependencies to install. Editing `app.js` and pushing is a deploy.

## Architecture

The browser talks directly to Supabase. There is no server of our own.

Security is enforced by Postgres row level security, **not** by this code. Hiding a menu
item here does not grant or remove access - the database independently refuses to return
rows a person is not entitled to. If you change a permission, change it in the database.

These rules live in the database, not here:

- **SLA status** - computed in the `v_jobs` view from `stages.sla_days`
- **Payment status** - a figure is a *quote* until the job reaches Booked
- **Download lock** - from `Raw Files Upload` onward, an unpaid job's client link stays view-only
- **Delivery gate** - a job cannot reach `Final Delivery` while a balance is owed

Because all four live in one view, the app, any report and the founder email can never
disagree with each other.

## The journey

```
CRM         New Enquiry -> Contacted -> Hot Leads -> Payment Link Shared -> Booked
                                                          (+ Archive, parked)
Production  Booked -> Pre-Production -> Shoot -> Backup Complete -> Raw Files Upload
Delivery    Waiting for Client Selection -> Photo Editing -> [Video Editing] -> QC
            -> [Album] -> Frame -> Final Delivery -> Google Review
```

`Booked` belongs to both CRM and Production - one record, two boards, no re-entry.
Stages in brackets are optional and skip automatically for packages without that
deliverable.

## Audit trail

Every stage move, payment, reassignment and deliverable change is written to
`job_activity` by a database trigger, not by this code. The log therefore cannot be
skipped by a bug in the interface, and it records who did it.

## Local development

Serve the folder statically:

    python3 -m http.server 8000

Then visit http://localhost:8000. It talks to the live Supabase project, so be careful -
there is no separate development database yet.

## Deploying

Pushing to `main` deploys, once this repo is connected to the Vercel project.

## Configuration

`SUPABASE_URL` and `SUPABASE_KEY` at the top of `app.js` are publishable keys. They are
safe to commit - they grant nothing on their own; row level security decides what any
signed-in person can see.

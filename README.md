# Khoji

Khoji is a DBMS coursework project for investigating synthetic INR payment
fraud. The project keeps the database and the agent separately testable:

The product UI lives in [`apps/web/`](apps/web/). It is a TanStack Router
workspace app with a dashboard-style investigation workspace, an evidence-linked
chat viewer, and a safe demo mode that plays back an agent investigation over
synthetic cases. Run it from the repository root with:

```sh
pnpm install
pnpm dev
```

The web app is intentionally useful without a configured database so the
conversation and demo flow can be reviewed before wiring it to the worker's
streaming agent endpoint.

- [`docs/PROPOSAL.md`](docs/PROPOSAL.md) — formal scope, schema rationale, agent design, and evaluation plan.
- [`db/`](db/README.md) — PostgreSQL migrations, partitions, features, roles, and loading instructions.
- [`gen/generate.py`](gen/generate.py) — seeded, standard-library-only generator for up to one million transactions.
- [`ml/rules_baseline.py`](ml/rules_baseline.py) — explainable rules baseline with precision/recall/F1 output.
- [`worker/`](worker/README.md) — Cloudflare Think Durable Object and bounded database tools.

The first smoke dataset is already loaded into the configured Neon project. A
fresh full run is reproducible with `python -m gen.generate --rows 1000000
--seed 42 --out data`; follow `db/README.md` to load it.

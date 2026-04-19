# Deployment rules (hard lock)

1. This repo must deploy only to Vercel project `adhdplanner`.
2. Do not link this repo to `telegram-webapp`.
3. Before any production deploy, check `.vercel/project.json` and confirm `projectName` is `adhdplanner`.
4. Use only:

```bash
./deploy-prod-safe.sh
```

If the repo is linked to the wrong project, fix with:

```bash
npx -y vercel link --project adhdplanner --scope quiltyvals-projects --yes
```

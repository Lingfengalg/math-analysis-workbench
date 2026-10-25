# Repository instructions

- Read README.md, docs/development.md and docs/contracts.md before editing.
- Use the Node version in .nvmrc and npm 10; install with npm ci. Do not add a second lockfile.
- Keep features isolated: app → features → shared; features may consume content. Never import another feature's internals.
- Reuse shared/contracts, shared/math, shared/storage and shared/ui. Validate external input using Zod.
- Use CSS Modules for feature styling. Preserve the existing design tokens and Ant Design baseline.
- Add tests with behavior changes. Run npm run check; run npm run test:e2e for user-flow changes. Report checks that could not run honestly.
- Do not execute expressions with eval/Function, expose model keys, fabricate AI responses, or claim sampled plots prove mathematical statements.
- Keep planned modules marked planned until they actually work. Update docs when public contracts, scripts or capabilities change.
- Keep PRs scoped; avoid unrelated dependency upgrades and reformatting.

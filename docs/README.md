# OVERCLOCKED — Developer Documentation

A Docusaurus site documenting how the OVERCLOCKED app works. The docs source
lives in `docs/`; the app it documents lives in the repo root (`src/`, `worker/`,
`data/`).

## Run the docs site

```bash
cd docs
npm install        # first time only
npm start          # dev server at http://localhost:3000
```

## Build for production

```bash
cd docs
npm run build      # static site → docs/build/
npm run serve      # preview the built site
```

## Where things are

```
docs/
  docs/                 ← the markdown content (what you read)
    intro.md
    concepts/            ← Core Concepts
    architecture/        ← Architecture (layer by layer)
    extending/           ← how-to guides
    ops/                 ← running, testing, security
  src/css/custom.css     ← theme tweaks (Cerebras-orange accent)
  static/img/            ← logo + favicon
  sidebars.ts            ← the sidebar structure
  docusaurus.config.ts   ← site config
  package.json           ← the docs site's own deps (separate from the app)

../README.md             ← the project README
```

## Editing docs

Just edit the markdown under `docs/docs/`. The sidebar (`sidebars.ts`) is
explicit — add a new page by creating the `.md` file and adding its id to the
sidebar. Frontmatter (`sidebar_position`) controls order within a section.

The docs describe the *actual* code in `../src` and `../worker`. If you change
behavior there, update the corresponding doc page so they don't drift.

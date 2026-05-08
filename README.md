# Relationship Sun

A tool for mapping the things that make up a relationship — what's already there and feels right, what's there but you'd want different, what's an absolute no, and what you'd love to have.

Inspired by [Sunburst Smorgasbord](https://smorgasbord.plusx.black/), with a richer rating model, item-level notes, custom items, and a partner-comparison mode.

## Features

- **Sunburst** and **Tree** views over the same data — switch any time.
- **Four ratings per item** — *Like*, *Change*, *Hard no*, *Want* — plus an unset default.
- **Add, edit, delete** items anywhere in the tree.
- **Notes** on any item.
- **Auto-save** to your browser's local storage; nothing leaves your device.
- **Export / Import** as JSON, including imports from the original Sunburst Smorgasbord (`YES → Like`, `MAYBE → Change`, `NO → unset`).
- **Compare** mode — load a JSON your partner exported and see conflicts, wishes, matches, and one-sided ratings side by side.
- **Confirm-before-delete** toggle in Settings (default: on).

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

## Deploy to GitHub Pages

1. Create a new GitHub repo and push this code to its `main` branch.
2. In the repo's **Settings → Pages**, set *Source* to **GitHub Actions**.
3. Push to `main` — the workflow in `.github/workflows/deploy.yml` will build and publish. The base path is auto-derived from the repo name, so it works for both project pages (`<user>.github.io/<repo>/`) and user pages (`<user>.github.io/`).

## Privacy

All data lives in your browser. Exports are plain JSON files you download to your own machine. There is no server, no analytics, no telemetry.

## Data format

```json
{
  "format": "relationship-sun",
  "version": 1,
  "name": "Profile name",
  "exportedAt": "2026-05-09T18:00:00.000Z",
  "nodes": [
    {
      "uuid": "…",
      "parentUuid": "…",
      "key": "communication",
      "state": "HAVE_LIKE",
      "note": "optional"
    }
  ]
}
```

`state` is one of `UNSET`, `HAVE_LIKE`, `HAVE_CHANGE`, `HARD_NO`, `WANT`.

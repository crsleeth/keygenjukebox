# keygenjukebox.net

Status: Rebuilt as plain HTML/CSS/JS behind Caddy; verified in a local preview, the Docker stack itself has not been run yet | Next: Deploy the stack in Dockge and confirm it serves the music

A jukebox for keygen music: a visualizer, a few controls, and a long scrollable list of tracks. No build step, no framework, no database.

## What's here

| Path | What it is |
| --- | --- |
| `site/` | The whole website: `index.html`, `style.css`, `app.js`, `img/` |
| `mp3s/` | The music. Not in git (about 3 GB), copy it over separately |
| `compose.yaml`, `Caddyfile` | The Docker stack: one Caddy container |
| `.env.example` | The optional settings, with their defaults |
| `tools/` | Helpers that the site does not need to run (see below) |

## Run it with Dockge

1. Put this folder in Dockge's stacks directory, e.g. `/opt/stacks/keygenjukebox`.
2. Copy the music into `mp3s/` inside it (or point `MUSIC_DIR` at wherever it lives).
3. In Dockge, pick "Scan Stacks Folder", open `keygenjukebox`, and press Deploy.

Without Dockge it is the same thing by hand:

```bash
docker compose up -d
```

## Settings

All optional. Set them in Dockge's `.env` box or in a `.env` file next to `compose.yaml`.

| Name | Default | Meaning |
| --- | --- | --- |
| `SITE_ADDRESS` | `:80` | `:80` serves plain HTTP, for use behind Cloudflare or another proxy. Set it to `keygenjukebox.net` and Caddy gets its own HTTPS certificate (ports 80 and 443 must be reachable from the internet). |
| `HTTP_PORT` | `80` | Host port for HTTP |
| `HTTPS_PORT` | `443` | Host port for HTTPS |
| `MUSIC_DIR` | `./mp3s` | Folder holding the music |

Restart the stack after changing the `Caddyfile` or a setting.

## Adding or removing music

Drop files into the music folder, or delete them. The page asks Caddy for the folder listing each time it loads, so there is nothing to rebuild or restart.

## Preview without Docker

```bash
python3 tools/dev-server.py
```

Then open http://localhost:8080. This is a small stand-in for the Caddy container, for looking at changes on a computer that has no Docker.

## Cover art

`site/img/cover.png` and the icons are drawn by a script, so the mascot can be tweaked and re-rendered:

```bash
python3 tools/make-cover.py
```

`Cover.png` in this folder is the original cover, kept for reference.

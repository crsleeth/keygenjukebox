# keygenjukebox.net

Status: Static site served by Caddy, autoplays on load; tested locally, container not yet run | Next: Run the container and confirm it serves the music

A keygen music jukebox: a visualizer, a few controls, and a scrollable track list. Plain HTML, CSS and JavaScript in `site/`, served by a single Caddy container.

## Run

Put the music in `mp3s/`, then:

```bash
docker compose up -d
```

With Podman, use `podman compose up -d`. Podman has no always-running daemon, so to bring the container back after a reboot also run `systemctl enable --now podman-restart` (add `--user` for rootless). Rootless Podman can't use ports below 1024 by default; set `HTTP_PORT`/`HTTPS_PORT` to e.g. `8080`/`8443`.

The track list is read from the music folder on each page load, so adding or removing files needs no restart.

## Settings

Optional, in a `.env` file next to `compose.yaml` (see `.env.example`):

- `SITE_ADDRESS`: `:80` (default) serves plain HTTP behind a proxy; a domain name makes Caddy handle HTTPS itself.
- `HTTP_PORT`, `HTTPS_PORT`: host ports, default `80` and `443`.
- `MUSIC_DIR`: music folder, default `./mp3s`.

## Tools

- `python3 tools/dev-server.py` previews the site at http://localhost:8080 without Docker.
- `python3 tools/make-cover.py` redraws the cover art and icons.

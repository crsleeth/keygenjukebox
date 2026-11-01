# keygenjukebox.net

Status: Caddy site with optional Cloudflare Tunnel; settings in .env so updates are just git pull; container not yet run from this repo | Next: Switch the server to this compose and .env

A keygen music jukebox: a visualizer, a few controls, and a scrollable track list. Plain HTML, CSS and JavaScript in `site/`, served by a single Caddy container.

## Run

Put the music in `mp3s/`, then:

```bash
docker compose up -d
```

Then open http://localhost:8090. With Podman, use `podman compose up -d`. Podman has no always-running daemon, so to bring the containers back after a reboot also run `systemctl enable --now podman-restart` (add `--user` for rootless).

## Updating

```bash
git pull
```

The site and music are read straight from this folder, so changes show up on the next page load. If `compose.yaml` or `Caddyfile` changed, also run `docker compose up -d` (or `docker compose restart web`). Settings live in `.env`, which git never touches.

## Cloudflare Tunnel (optional)

Serves the site over HTTPS without opening any ports.

1. In the Cloudflare Zero Trust dashboard, create a tunnel (choose Docker) and copy its token.
2. Add a public hostname to the tunnel with the service set to `http://web:80`.
3. Create `.env` next to `compose.yaml` (or copy `.env.example`):

   ```
   COMPOSE_PROFILES=tunnel
   TUNNEL_TOKEN=your-token-here
   BIND_ADDRESS=127.0.0.1
   ```

   `BIND_ADDRESS=127.0.0.1` keeps the site's port reachable only from the server itself, so the tunnel is the only way in. Restrict the file with `chmod 600 .env`, since it holds the token.
4. Start the stack. The tunnel's logs should show `Registered tunnel connection`.

## Settings

Optional, in `.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8090` | Host port the site is published on |
| `BIND_ADDRESS` | `0.0.0.0` | Host address for that port; `127.0.0.1` keeps it local |
| `MUSIC_DIR` | `./mp3s` | Music folder |
| `COMPOSE_PROFILES` | (none) | Set to `tunnel` to start the Cloudflare Tunnel |
| `TUNNEL_TOKEN` | (none) | The tunnel's token |

## Tools

- `python3 tools/dev-server.py` previews the site at http://localhost:8080 without Docker.
- `python3 tools/make-cover.py` redraws the cover art and icons.

# Fansign Discord bot

Lightweight Node.js bot project for generating fansigns and managing fonts, images, and related assets.

![image](https://github.com/ytaxx/FansignDiscordBot/blob/main/photos/discordimage.png)

## Overview

This repository contains the bot code, font assets, and utilities used to generate and process fonts and images. It includes the core bot (`bot.js`), command handlers, and asset folders.

## Features

- Bot entry: `bot.js`
- Command handlers in `commands/`
- Font sources in `ALL/new fonts/` and `fonts/`

# mentai -- Fansign Generator (Discord Bot)

This repository contains a Discord fansign generator bot that renders realistic, handcrafted-looking fansign images from user text and selected styles.

**Quick links:** - [bot.js](bot.js) - [deploy.js](deploy.js) - [console.js](console.js) - [LICENSE](LICENSE)

**Where to look:** - Commands: [commands/](commands/) (key files: [commands/fansignRender.js](commands/fansignRender.js), [commands/fansign2.js](commands/fansign2.js), [commands/fansign3.js](commands/fansign3.js), [commands/info.js](commands/info.js)) - Fonts: [fonts/](fonts/) and [ALL/new fonts/](ALL/new%20fonts/) - Config: [config/](config/) (notably [config/styles.json](config/styles.json) and [config/blacklist.json](config/blacklist.json)) - Utilities: [utils/concurrencyManager.js](utils/concurrencyManager.js)

**Author / Attribution:** Created and maintained by the repository owner. All code, fonts, images and assets in this repository were authored by the project owner.

**License:** MIT -- see [LICENSE](LICENSE).

**Stack & dependencies** (found in `package.json`):
- **Node.js** (recommended 18+)
- **discord.js**, **canvas**, **jimp**, **sharp**, and small utilities (see `package.json`)

**Purpose:** This bot generates high-quality fansign images on demand using a multi-stage rendering pipeline that simulates handwriting, ink behavior, paper grain, textures and lighting.

**Important:** Do not commit secrets. Provide `DISCORD_TOKEN`, `CLIENT_ID` and `GUILD_ID` via environment variables or a local `.env` file.

**Run modes:**
- `node bot.js` -- run the bot directly
- `node console.js` -- run the management console (start/stop/sync/reload commands, see console help)
- `node deploy.js` -- register slash commands (used by the `sync` console command)

**Install & setup**

1. Install Node.js (18+).
2. From project root, install dependencies:

```bash
npm install
```

3. Create a `.env` file in the repo root with at least:

```text
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_development_guild_id
```

4. Register slash commands (one-time per guild during development):

```bash
node deploy.js
```

5. Start the bot (or use `console.js` to manage it):

```bash
node console.js
# then in the console type: start
```

Or run directly:

```bash
node bot.js
```

**Notes for `canvas` on Windows:** `canvas` may require system libraries (Cairo, build tools). If install fails, install the platform prerequisites or use prebuilt binaries.

**Commands & main features**

- **/fs** -- Fansign generator (styles 1–25) -- implemented in [commands/fansignRender.js](commands/fansignRender.js)
- **/fs2** -- Fansign generator (styles 26–50) -- [commands/fansign2.js](commands/fansign2.js) (proxies to the main renderer)
- **/fs3** -- Fansign generator (styles 51–54) -- [commands/fansign3.js](commands/fansign3.js)
- **/info** -- Multi-page info about the bot and features -- [commands/info.js](commands/info.js)
- **/help** -- Short help embed -- [commands/help.js](commands/help.js)
- **/ping** -- Latency check -- [commands/ping.js](commands/ping.js)

The commands are loaded by [bot.js](bot.js) at startup and registered as slash commands via `deploy.js`.

**Configuration & data files**

- [config/styles.json](config/styles.json): Defines available fansign styles, images, font defaults and per-style rendering parameters. The bot watches this file and reloads it on change.
- [config/blacklist.json](config/blacklist.json): Words that are not allowed in fansign text.
- [config/banlist.json](config/banlist.json): Moderation bans (managed via the console `ban`/`unban` commands).
- [config/config.json](config/config.json): General app config (version etc.).

**Rendering pipeline**

- Style & asset selection: picks the style entry from `styles.json` (image, base parameters). - Font selection: user can pick a `.ttf` from [fonts/](fonts/); the renderer registers fonts and attempts fallbacks when glyphs are missing. - Background analysis: reads the style image and computes brightness, contrast and edge strength to adapt ink opacity, halo and skew. - Layout & wrapping: adaptive font sizing and word-wrapping ensures text fits the chosen canvas. - Character-level rendering: the engine positions and transforms each character with subtle rotation, skew, pressure and color variation to simulate handwriting. - Paper & ink simulation: multi-scale noise, fiber simulation, depth/normal estimation and ink diffusion create realistic ink spread and texture. - Post-processing: Jimp is used for optional blur, pixelation, overlays and compositing with paper/texture images. - Output: the result is returned to the user as a JPEG attachment with a randomized filename.

**Moderation, rate-limits & concurrency**

- Per-user cooldowns: A short processing cooldown is applied via `utils/concurrencyManager.js` (default processing cooldown set in the code). Fansign commands also maintain per-user cooldowns (regular users ~60s, boosters/role bypass if present). - Concurrency control: `utils/concurrencyManager.js` limits simultaneous render jobs (default maximum 3). - Blacklist: `config/blacklist.json` is checked and rejects requests with forbidden words. - Banlist: `config/banlist.json` contains bans that block users from running commands (except `/help` and `/info`).

**Privacy & logging**

- The bot prints logs to the console only; it does not externally store user request contents. The info command and module text explicitly say "No Log Policy". The console stores ban and concurrency state in `config/` files.

**Developer notes & tips**

- Add or edit styles in [config/styles.json] to add new fansign templates (image, coordinates, font defaults, effects). The bot watches this file and reloads styles while running. - Add fonts by putting `.ttf` files in the [fonts/](fonts/) folder. The command UIs will list available fonts automatically. - To update slash commands after adding or modifying commands, run `node deploy.js` or use the `sync` command in `console.js`. - If you need to resolve user IDs from the console, `resolveUser.js` can be invoked by the console code (it uses a token argument).

**Troubleshooting**

- Canvas install errors: ensure native build tools and Cairo are available (Windows: install Windows Build Tools and Cairo). - Missing environment vars: ensure `DISCORD_TOKEN`, `CLIENT_ID` and `GUILD_ID` are set. - Commands not appearing: rerun `node deploy.js` (and make sure `CLIENT_ID` and `GUILD_ID` are correct during development).

**Next steps I can help with**

- Add `author` and `repository` fields to `package.json`, update `package.json` with your name. - Create `CONTRIBUTING.md`, `ISSUE_TEMPLATE`, or a GitHub Actions workflow to run lint/tests. - Trim or document required system libraries for `canvas` build on Windows.

If you want, I can update `package.json` with your name and repo link and then add a simple CI workflow. Reply and I will make those changes.

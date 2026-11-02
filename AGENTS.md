# Personal Herdr configuration

This repository is the source for the user's `herdr-personal` interface.

- Before changing the installed interface, read the installed Herdr home's `AGENTS.md` and inspect `herdr-app status`. Respect `HERDR_APP_HOME`.
- Preserve the user's current appearance, key bindings, spaces, terminals and agents unless the requested customization changes them.
- Edit repository sources, then use `python3 scripts/manage.py install`. Use real copies: Herdr does not load all mod assets through symlinks.
- Only manage `layouts/herdr-personal.*`, `themes/herdr-personal.json`, `mods/personal-*` and the `layout:herdr-personal` keys. Keep the original `herdr-t3` files available for fallback.
- The install command backs up configuration and rejects untracked file collisions or live edits. Investigate conflicts; do not bypass them by overwriting user changes.
- `preferences/` records portable preferences. Normal installation only fills missing settings; changing existing settings requires an explicit customization request and `--apply-preferences`.
- Run all seven `herdr-app check` checks, both supplied sidebar/pane checks and the automatic-fetch check with `python3 scripts/manage.py check`. The fetch check uses temporary local Git repositories, never live project fixtures. Inspect the live window with `herdr-app shot` after activating changes; check `status` for errors.
- Preserve upstream attribution and Apache-2.0 license. `provenance.json` pins the source commit; `docs/upstream/` holds the original recipe and documentation.
- Never commit runtime state, terminal output, screenshots containing user work, machine/SSH settings, credentials or backups. Put local inspection artifacts under ignored `.local/`.


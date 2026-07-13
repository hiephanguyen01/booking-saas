# Turborepo Dev TUI Design

## Goal

Make `pnpm dev` show each workspace development task in a separate selectable log view, so API, storefront, and dashboard output is not interleaved.

## Design

Change the root `dev` script from `turbo run dev` to `turbo run dev --ui=tui`. Turborepo remains responsible for task dependencies, persistence, and shutdown. The scripts inside individual packages remain unchanged.

The terminal UI lists running tasks and displays the selected task's logs in its own pane. Developers navigate between tasks with the keyboard and quit the complete development session from the TUI.

## Error Handling

Task failures remain visible in the corresponding task view and in Turborepo's task status. The TUI does not alter exit codes or retry behavior.

## Verification

- Confirm the root `package.json` remains valid JSON.
- Run `pnpm dev` in a TTY and confirm Turborepo starts with the TUI.
- Confirm API, storefront, and dashboard tasks appear independently.
- Quit the TUI and confirm its child processes stop.

## Scope

No new dependency, terminal-specific automation, application code change, or production behavior change is included.

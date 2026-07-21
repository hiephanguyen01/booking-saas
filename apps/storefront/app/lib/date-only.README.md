# Date-only validation

Use `isValidDateOnly()` before passing user-controlled `YYYY-MM-DD` values into date arithmetic helpers such as `addDays()`.

A shape-only regex accepts impossible dates such as `2026-02-31`; the shared validator also verifies calendar round-tripping.

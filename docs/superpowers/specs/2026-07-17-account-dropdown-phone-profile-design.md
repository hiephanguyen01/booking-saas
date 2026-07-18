# Account Dropdown and Unified Profile UI

## Scope

Refine the Customer Account Center against Figma nodes `2176:56060` and `2176:56546` without changing the existing API boundary or authentication model.

The Figma profile becomes the default account profile for every authenticated customer. The screen always includes the password section; identifier fields remain locked according to the current account data, while the editable fields and password values are validated but not persisted because no profile/password mutation API exists yet.

## Account dropdown

- Use a 270px desktop menu aligned to the avatar trigger.
- Render a 40px user avatar, 14px semibold name, and 12px supporting identifier in a 16px by 14px header.
- Render all nine account destinations in the same order as the account sidebar.
- Use 16px horizontal and 12px vertical item padding, 20–22px icons, semantic primary active color, and 20px notification badges.
- Separate profile/booking/message/review, favorites/recent, legal/security/help, and logout with one-pixel dividers.
- Use route-aware active styling so node `2176:56060` is reproduced when the customer is on the reviews route.
- Keep Radix dropdown behavior for outside click, Escape, keyboard navigation, focus management, and server-side logout.

## Unified profile panel

- Use one white panel with 40px desktop padding, subtle shadow, and 40px spacing between major sections.
- The profile section starts with an 18px semibold title, a 72px avatar, and compact outlined photo button.
- Desktop account fields use two 375px columns separated by 40px. Customer ID and phone are locked; name and email remain editable presentation fields, matching node `2176:56546`.
- The password section is separated by a full-width divider. Its three inputs are 375px wide and include visibility controls supplied by the shared form primitives.
- Password guidance is displayed as three 14px lines matching the Figma copy.
- Profile and password inputs belong to one form and are submitted by a single centered primary action, 240px wide and 48px high, using semantic primary tokens.
- Tablet and mobile collapse the field grid to one column and make fields/buttons fit the available width without horizontal overflow.

## Data and behavior

- No backend endpoint or database schema is added.
- Existing Zod contracts continue validating profile and password values. The route action validates the combined request in two bounded schema parses and merges field errors into one response.
- Simulated mutations remain non-persistent and are labelled as illustrative data.
- No short-lived Figma asset URLs are embedded; user initials and Lucide icons remain the durable fallback.

## Verification

Follow the repository policy: no test files or test commands. Verify with formatting, lint, typecheck, build, and browser inspection at desktop and mobile breakpoints for both `/vi` and `/en`. Confirm the profile/password form uses one submit action and the reviews route produces the dropdown active state from node `2176:56060`.

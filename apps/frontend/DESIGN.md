---
name: RLaaS Operator Console
surface: OPERATE
tokens:
  font.ui: Archivo
  font.mono: IBM Plex Mono
  font.display.max: 2.25rem
  color.canvas.light: '#f6f7f8'
  color.surface.light: '#ffffff'
  color.ink.light: '#0e1116'
  color.canvas.dark: '#0c0e12'
  color.surface.dark: '#14171d'
  color.ink.dark: '#e8ebf0'
  color.accent.light: '#1a1e24'
  color.accent.dark: '#e8ebf0'
  color.allow: '#177f48'
  color.block: '#bd3b24'
  color.warn: '#a56f09'
  radius.control: 8px
  radius.surface: 12px
  space.base: 4px
  motion.enter: 160ms
  motion.state: 120ms
  motion.easing: cubic-bezier(0.2, 0, 0, 1)
  measure.prose: 68ch
  touch.min: 44px
---

# RLaaS Operator Console — Design System

## Surface classification

This product is **OPERATE**. An operator opens it to answer one question fast:
*is anything being blocked that shouldn't be?* Scanability and comparison beat
expression. The brand lives in the details, not in the color of the buttons.

The only exception is `/login` and `/gateway-tester`, which do PERSUADE duty for
visitors who have never seen the product. They get more air; they do not get a
different type or color system.

## The one rule that shapes everything

**Color means a decision. Nothing else on the page is colored.**

Structure, navigation, headings, primary buttons, and focus rings are all
graphite. Green means *allowed*. Red means *blocked*. Amber means *degraded or
paused*. If an element is colored and isn't reporting a decision, that's a bug.

This is why the console does not have a brand accent hue. An indigo button
competing with a red block-rate is the console lying about what matters.

Because color carries meaning here, it is never the *only* carrier: every
allow/block signal also has a label, and tables encode magnitude with a bar,
not a hue.

## Light and dark

Both are first-class and follow the operating system. An operator watches this
in a bright office at 10am and a dark room at 11pm; neither is the "real" one.
Dark mode is a designed palette, not an inversion: surfaces separate by
elevation, text is off-white (`#e8ebf0`) rather than pure white, and semantic
hues are lightened and desaturated so they don't vibrate on a dark ground.

`data-theme` on `<html>` overrides the OS preference; absent it, the OS wins.

## Typography

Two faces, both doing a job:

- **Archivo** — UI and headings. A grotesque with tighter apertures than the
  default sans; it reads like signage, which is what a control surface is.
- **IBM Plex Mono** — every piece of machine data: IPs, endpoints, keys,
  identifiers, timestamps, and all numerals in tables and metrics.

Mono here is functional, not costume. If a value came from a machine and a
human might need to compare it character by character, it is mono with
`tabular-nums`. If it's prose, it's Archivo.

Scale (1.25 major third, clamped): 11 / 12 / 13 / 14 / 16 / 20 / 24 / 30 / 36.
Body is 14px in dense views, 16px in prose. Headings get `text-wrap: balance`.
No heading level is skipped.

## Space and layout

4px base scale. Tables and lists, not card grids: a card must *be* the
interaction (a project you open) to earn its border. Rows of data live in
tables where a column is scannable top to bottom.

Related things sit closer together than unrelated things. A heading is always
nearer the section it introduces than the one above it.

## Depth

Shadows are offset plus soft blur — light comes from above. A zero-offset
colored halo is decoration, not depth, and does not appear here. Most surface
separation is carried by a hairline border and a background step, not a shadow.

## Motion

One authored entrance per view (160ms, translate-only, from a visible default —
content is never hidden by animation timing). State transitions are 120ms and
name their properties; `transition: all` is banned. `prefers-reduced-motion`
removes all of it.

## Copy

Machine vocabulary never reaches the screen. `SLIDING_WINDOW_COUNTER` is
"Sliding window counter". `3600s` is "1h". `USER_TIER` is "User tier". Raw
enums, raw seconds, and raw `toLocaleString()` timestamps are defects, not
shortcuts.

Button labels name the outcome ("Create rule", not "Submit"). Empty states say
what to do next. Destructive actions confirm, and the confirmation names what
is being destroyed.

## Banned

- Indigo, violet, or purple as a brand color
- Icon-in-a-colored-circle feature grids
- Cards used as a substitute for a table
- Decorative gradients, blobs, halos, spotlight glows
- Emoji as interface elements
- Inter, Roboto, or `system-ui` as the primary face
- A "Get Started" / "Learn More" pair where a specific outcome could be named

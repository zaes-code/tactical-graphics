## What changed

<!-- One or two sentences. If this adds a graphic, name it and cite the FM 1-02.2
     figure or table so a reviewer can check the shape. -->

## Which layer

- [ ] Library (`src/tacticalgraphics/`) — geometry, published to npm
- [ ] Sample app (`src/components/`) — rendering, drawing, editing

<!-- Reminder: the library must never import from the sample app, and must not
     depend on any map library. CI enforces this. -->

## Verified

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build` (library still emits)
- [ ] `npm run drive` — for anything that changes rendering

<!-- For a new or changed graphic, a screenshot from `.playwright-out/` or from
     the running app is worth more than any description. -->

## Notes for the reviewer

<!-- Anything non-obvious: a constant you tuned by eye, a trade-off you took,
     a follow-up you deliberately left. -->

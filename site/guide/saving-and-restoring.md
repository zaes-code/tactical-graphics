# Saving and restoring a whole map

`snapshot()` writes every graphic to GeoJSON and `restore()` rebuilds them **editable**
— not a picture of the symbols, the same objects, ready to rotate, resize and modify.
Both come from [`createTacticalGraphics`](/guide/rendering), so this is the same code whichever
engine drew the map:

```ts
const snapshot = graphics.snapshot();          // one feature per graphic
await db.save(JSON.stringify(snapshot));

// later, in a fresh session — or in the other engine
graphics.restore(await db.load());
```

**A snapshot taken in one engine restores in the other.** Nothing renderer-specific
travels with it, which is what makes that true rather than merely likely; the demo's
engine picker hands the map across on every switch.

A snapshot holds **one feature per graphic** — the base geometry the user drew.
Everything else is derived and regenerates on load. A record is the same
`tacticalGraphic` object described [above](/guide/tactical-graphic-object), and nothing
else:

```jsonc
"properties": {
    // The portable description of the symbol — what renderTacticalGraphic consumes.
    // Meters, degrees and text: meaningful to any renderer, in any language.
    "tacticalGraphic": {"name": "MovementToContact", "radius": 30600, "rotation": 45,
                        "designation": "", "hostility": "Pending"},

    "role": "base", "symbolId": "45e2e470-…", "graphicName": "MovementToContact"
}
```

**That is the whole record.** Transform it, store it in PostGIS, write it by hand —
as long as `tacticalGraphic` survives, the graphic rebuilds exactly. There is no
companion object to keep, and no viewport state to lose.

A base short of what its graphic needs is completed on the way in, so a record written
by hand — or by an older version — arrives fully editable rather than half-drawn.

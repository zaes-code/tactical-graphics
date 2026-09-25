# About

## Roadmap

- Keep pace with FM 1-02.2 and APP-06 as they are revised. Every graphic this library tracks is
  complete today, so a new edition's additions are what [Upcoming graphics](/guide/graphics#upcoming-graphics)
  will list next.
- **Leaflet is scoped as a third rendering engine.** The groundwork is done: symbology
  now lives in the map-agnostic half as paint functions — geometry, colors, and text
  described in projected meters — and both shipping engines are consumers of it rather
  than owners. A third engine implements one bridge from those paint descriptions to
  its own primitives, and inherits every graphic. Leaflet's canvas renderer is the
  natural fit; the open questions are its lack of a built-in editing interaction and
  how far its layer model stretches to the screen-space decorations, and both are being
  assessed before any commitment to a date.

---

## References

- [FM 1-02.2, Military Symbols](https://www.battleorder.org/post/symbolsfm) — US Army
- [DoD Joint Military Symbology (MIL-STD-2525E)](https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=114934)
- [APP-06, NATO Joint Military Symbology](https://nso.nato.int/nso/nsdd/main/standards), Edition E — retrieved from the
  NATO Standardization Document Database. NATO is acknowledged as its publisher; NATO
  charges no fee for its standardization documents
- [TurfJS](https://turfjs.org/) — the geospatial math underneath

## About Zaes

[Zaes](https://zaes.com) is a software engineering and consulting firm working with the
U.S. Department of Defense and enterprise clients, founded in 2017 and operating
remote-first from Chantilly, VA and Charleston, SC.

The work spans full-stack engineering, enterprise and application architecture,
geospatial engineering and GIS development, systems integration, UI/UX design, DevOps and
CI/CD automation, and program management — with domain consulting in DoD and C2 systems,
and cleared personnel where a program requires it.

This library comes out of that geospatial and C2 work. It is open-sourced because an
accurate MIL-STD-2525E symbol set is infrastructure rather than an advantage worth
keeping: every team building a common operational picture rebuilds the same arrows and
the same amplifier rules, and doing it once, in the open, against the plates is better
for everyone drawing them.

## Contributors

- **Edwin Sanchez** — maintainer
- **Eric Marks**
- **Navie Huynh** — past contributor

Commit-level credit lives in the [contributors graph](https://github.com/zaes-code/tactical-graphics/graphs/contributors).

## License

MIT

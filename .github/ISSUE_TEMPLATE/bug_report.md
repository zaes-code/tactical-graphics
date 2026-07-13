---
name: Bug report
about: Something renders wrong, or the library throws
title: ''
labels: bug
---

**Which layer?**
<!-- The library (`@zaes-code/tactical-graphics`, geometry only) or the sample app
     (drawing/editing/styling)? If you aren't sure, say what you called. -->

- [ ] Library — `renderTacticalGraphic()` output is wrong
- [ ] Sample app — it renders/behaves wrong on the map

**Reproduction**

```ts
// The smallest feature that shows the problem, please.
renderTacticalGraphic({
  type: 'Feature',
  geometry: {type: 'LineString', coordinates: [[-77.04, 38.89], [-76.95, 38.95]]},
  properties: {tacticalGraphic: {name: 'MainAxisOfAdvance', radius: 300}},
});
```

**Expected**
<!-- What should it look like? A screenshot or an FM 1-02.2 figure number helps. -->

**Actual**
<!-- What you got. Paste the GeoJSON, or a screenshot for rendering issues. -->

**Environment**
- `@zaes-code/tactical-graphics` version:
- Renderer (OpenLayers / MapLibre / Cesium / other) and version:
- Node / browser:

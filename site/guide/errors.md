# Errors

`renderTacticalGraphic` throws `TacticalGraphicError` with an actionable message:

```
Feature has no "properties.tacticalGraphic" object. Add one naming the graphic,
e.g. {"tacticalGraphic": {"name": "PhaseLine"}}.

Unknown tactical graphic "AxisOfAdvnce". Call listTacticalGraphicNames() to see
the 318 supported names.

Graphic "Secure" expects a Point base geometry, got LineString.

Graphic "FreeFireAreaRectangular" expects a LineString base geometry, got Polygon.

Graphic "Destroy" is drawn from one point and needs "properties.tacticalGraphic.radius"
(meters) to size it.

Graphic "FerryCrossing" cannot be drawn from this base: it produced positions that are
not coordinates. Check that its control points are distinct.
```

Invalid GeoJSON never leaves the library: a base the generator cannot draw from throws
rather than returning `NaN` or `null` positions. Two graphics are the exception in the
other direction: an ambush or a pursuit under a meter across draws an **empty** geometry,
because below that size their control points are read as a single click.

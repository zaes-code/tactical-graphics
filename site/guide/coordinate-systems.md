# Coordinate systems

The library is projection-agnostic in one specific way: **it works entirely in
EPSG:4326**, and hands you EPSG:4326 back. Reproject at your renderer's boundary, not
before you call it.

Sizes (`radius`, `width`, `length`, `decorationSize`) are in **meters**, and so are
range-fan band ranges (they were kilometers before 3.2.0).

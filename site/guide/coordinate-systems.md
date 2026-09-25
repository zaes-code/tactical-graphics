# Coordinate systems

The library is projection-agnostic in one specific way: **it works entirely in
EPSG:4326**, and hands you EPSG:4326 back. Reproject at your renderer's boundary, not
before you call it.

Sizes (`radius`, `width`, `length`, `decorationSize`) are in **meters**, and range-fan
band ranges are in **kilometers**.

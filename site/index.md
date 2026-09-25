---
layout: home

hero:
  name: Tactical Graphics
  text: MIL-STD-2525E, FM 1-02.2 and APP-06 as plain GeoJSON
  tagline: Axis-of-advance arrows, phase lines, mission tasks, range fans and boundaries, for OpenLayers, MapLibre or anything that reads GeoJSON.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/
    - theme: alt
      text: Live demo
      link: https://zaes-code.github.io/tactical-graphics/

features:
  - title: GeoJSON in, GeoJSON out
    details: Describe a graphic on a feature's properties, call one function, get the drawn symbol, its label anchors and its edit handles back. No map library, no DOM.
    link: /guide/tactical-graphic-object
  - title: Two renderers, one paint layer
    details: OpenLayers and MapLibre draw from the same symbology code, with drawing, editing and a shared createTacticalGraphics façade.
    link: /guide/rendering
  - title: Every graphic in both standards
    details: The line and area graphics of FM 1-02.2 and APP-06, each drawable, checked against the plate that defines it, and editable wherever the symbol allows.
    link: /guide/graphics
  - title: Pictures for a picker
    details: One small SVG per graphic from the thumbnails entry point, drawn by the same paint layer as the map.
    link: /guide/rendering#a-picture-for-a-menu
---

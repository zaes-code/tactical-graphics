# SVG Path Commands Cheat Sheet

SVG paths are defined using the `d` attribute in the `<path>` element. The `d` attribute contains a series of **commands (directives)** and **coordinates** that describe how to draw a shape.

## Basic Syntax

Each command is a single letter followed by one or more parameters:
- **Uppercase commands** use **absolute coordinates**.
- **Lowercase commands** use **relative coordinates**.

---

## 🧭 Move and Line Commands

| Command | Name         | Description                              | Parameters             |
|---------|--------------|------------------------------------------|------------------------|
| `M`     | moveTo       | Moves the pen to a new position.          | `x y`                  |
| `L`     | lineTo       | Draws a straight line to (x, y).          | `x y`                  |
| `H`     | horizontalTo | Draws a horizontal line to x.             | `x`                    |
| `V`     | verticalTo   | Draws a vertical line to y.               | `y`                    |
| `Z` / `z` | closePath  | Closes the current path (line to start).  | *(none)*               |

---

## ⭕ Curve Commands

### Cubic Bézier Curves

| Command | Name              | Parameters                        |
|---------|-------------------|-----------------------------------|
| `C`     | cubic Bézier      | `x1 y1, x2 y2, x y`                |
| `S`     | smooth cubic Bézier | `x2 y2, x y` (reflects previous control point) |

### Quadratic Bézier Curves

| Command | Name              | Parameters                        |
|---------|-------------------|-----------------------------------|
| `Q`     | quadratic Bézier  | `x1 y1, x y`                      |
| `T`     | smooth quadratic  | `x y` (reflects previous control point) |

---

## 🌀 Arc Command

| Command | Name     | Parameters                                                                 |
|---------|----------|----------------------------------------------------------------------------|
| `A`     | arcTo    | `rx ry x-axis-rotation large-arc-flag sweep-flag x y`                      |

- `rx`, `ry`: radii of the ellipse
- `x-axis-rotation`: rotation of the ellipse
- `large-arc-flag`, `sweep-flag`: 0 or 1
- `x y`: end point of the arc

---

## 🧪 Example

```html
<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 10 H 90 V 90 H 10 Z" stroke="black" fill="none"/>
</svg>
```

---

## Resources

* [MDN: SVG `<path>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Paths)
* [SVG Path Visualizer](https://yqnn.github.io/svg-path-editor/)

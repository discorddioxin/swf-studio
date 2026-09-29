// flash.geom: Point, Rectangle, Matrix, ColorTransform, Transform.

export class Point {
  x: number; y: number;
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  get length() { return Math.hypot(this.x, this.y); }
  add(p: Point) { return new Point(this.x + p.x, this.y + p.y); }
  subtract(p: Point) { return new Point(this.x - p.x, this.y - p.y); }
  clone() { return new Point(this.x, this.y); }
  equals(p: Point) { return p.x === this.x && p.y === this.y; }
  normalize(thickness: number) { const l = this.length; if (l) { this.x *= thickness / l; this.y *= thickness / l; } }
  offset(dx: number, dy: number) { this.x += dx; this.y += dy; }
  setTo(x: number, y: number) { this.x = x; this.y = y; }
  copyFrom(p: Point) { this.x = p.x; this.y = p.y; }
  static distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
  static interpolate(a: Point, b: Point, f: number) { return new Point(b.x + (a.x - b.x) * f, b.y + (a.y - b.y) * f); }
  static polar(len: number, angle: number) { return new Point(len * Math.cos(angle), len * Math.sin(angle)); }
  toString() { return `(x=${this.x}, y=${this.y})`; }
}

export class Rectangle {
  x: number; y: number; width: number; height: number;
  constructor(x = 0, y = 0, width = 0, height = 0) { this.x = x; this.y = y; this.width = width; this.height = height; }
  get left() { return this.x; } set left(v: number) { this.width += this.x - v; this.x = v; }
  get top() { return this.y; } set top(v: number) { this.height += this.y - v; this.y = v; }
  get right() { return this.x + this.width; } set right(v: number) { this.width = v - this.x; }
  get bottom() { return this.y + this.height; } set bottom(v: number) { this.height = v - this.y; }
  get topLeft() { return new Point(this.x, this.y); }
  get bottomRight() { return new Point(this.right, this.bottom); }
  get size() { return new Point(this.width, this.height); }
  clone() { return new Rectangle(this.x, this.y, this.width, this.height); }
  contains(x: number, y: number) { return x >= this.x && x < this.right && y >= this.y && y < this.bottom; }
  containsPoint(p: Point) { return this.contains(p.x, p.y); }
  containsRect(r: Rectangle) { return r.x >= this.x && r.y >= this.y && r.right <= this.right && r.bottom <= this.bottom; }
  intersects(r: Rectangle) { return r.x < this.right && r.right > this.x && r.y < this.bottom && r.bottom > this.y; }
  intersection(r: Rectangle) {
    const x = Math.max(this.x, r.x), y = Math.max(this.y, r.y);
    const w = Math.min(this.right, r.right) - x, h = Math.min(this.bottom, r.bottom) - y;
    return w > 0 && h > 0 ? new Rectangle(x, y, w, h) : new Rectangle();
  }
  union(r: Rectangle) {
    if (this.isEmpty()) return r.clone();
    if (r.isEmpty()) return this.clone();
    const x = Math.min(this.x, r.x), y = Math.min(this.y, r.y);
    return new Rectangle(x, y, Math.max(this.right, r.right) - x, Math.max(this.bottom, r.bottom) - y);
  }
  isEmpty() { return this.width <= 0 || this.height <= 0; }
  setEmpty() { this.x = this.y = this.width = this.height = 0; }
  offset(dx: number, dy: number) { this.x += dx; this.y += dy; }
  inflate(dx: number, dy: number) { this.x -= dx; this.y -= dy; this.width += dx * 2; this.height += dy * 2; }
  setTo(x: number, y: number, w: number, h: number) { this.x = x; this.y = y; this.width = w; this.height = h; }
  copyFrom(r: Rectangle) { this.setTo(r.x, r.y, r.width, r.height); }
  equals(r: Rectangle) { return r.x === this.x && r.y === this.y && r.width === this.width && r.height === this.height; }
  toString() { return `(x=${this.x}, y=${this.y}, w=${this.width}, h=${this.height})`; }
}

export class Matrix {
  a: number; b: number; c: number; d: number; tx: number; ty: number;
  constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) { this.a = a; this.b = b; this.c = c; this.d = d; this.tx = tx; this.ty = ty; }
  clone() { return new Matrix(this.a, this.b, this.c, this.d, this.tx, this.ty); }
  identity() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.tx = 0; this.ty = 0; }
  /** this = this · m (apply this, then m), as in AS3. */
  concat(m: Matrix) {
    const { a, b, c, d, tx, ty } = this;
    this.a = a * m.a + b * m.c; this.b = a * m.b + b * m.d;
    this.c = c * m.a + d * m.c; this.d = c * m.b + d * m.d;
    this.tx = tx * m.a + ty * m.c + m.tx; this.ty = tx * m.b + ty * m.d + m.ty;
  }
  invert() {
    const { a, b, c, d, tx, ty } = this;
    const det = a * d - b * c;
    if (!det) { this.identity(); return; }
    this.a = d / det; this.b = -b / det; this.c = -c / det; this.d = a / det;
    this.tx = (c * ty - d * tx) / det; this.ty = (b * tx - a * ty) / det;
  }
  rotate(angle: number) { const cos = Math.cos(angle), sin = Math.sin(angle); this.concat(new Matrix(cos, sin, -sin, cos, 0, 0)); }
  scale(sx: number, sy: number) { this.concat(new Matrix(sx, 0, 0, sy, 0, 0)); }
  translate(dx: number, dy: number) { this.tx += dx; this.ty += dy; }
  createBox(sx: number, sy: number, rotation = 0, tx = 0, ty = 0) {
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    this.a = cos * sx; this.b = sin * sy; this.c = -sin * sx; this.d = cos * sy; this.tx = tx; this.ty = ty;
  }
  createGradientBox(width: number, height: number, rotation = 0, tx = 0, ty = 0) {
    this.createBox(width / 1638.4, height / 1638.4, rotation, tx + width / 2, ty + height / 2);
  }
  transformPoint(p: Point) { return new Point(this.a * p.x + this.c * p.y + this.tx, this.b * p.x + this.d * p.y + this.ty); }
  deltaTransformPoint(p: Point) { return new Point(this.a * p.x + this.c * p.y, this.b * p.x + this.d * p.y); }
  setTo(a: number, b: number, c: number, d: number, tx: number, ty: number) { this.a = a; this.b = b; this.c = c; this.d = d; this.tx = tx; this.ty = ty; }
  copyFrom(m: Matrix) { this.setTo(m.a, m.b, m.c, m.d, m.tx, m.ty); }
  toString() { return `(a=${this.a}, b=${this.b}, c=${this.c}, d=${this.d}, tx=${this.tx}, ty=${this.ty})`; }
}

export class ColorTransform {
  redMultiplier: number; greenMultiplier: number; blueMultiplier: number; alphaMultiplier: number;
  redOffset: number; greenOffset: number; blueOffset: number; alphaOffset: number;
  constructor(rm = 1, gm = 1, bm = 1, am = 1, ro = 0, go = 0, bo = 0, ao = 0) {
    this.redMultiplier = rm; this.greenMultiplier = gm; this.blueMultiplier = bm; this.alphaMultiplier = am;
    this.redOffset = ro; this.greenOffset = go; this.blueOffset = bo; this.alphaOffset = ao;
  }
  get color() { return (this.redOffset << 16) | (this.greenOffset << 8) | this.blueOffset; }
  set color(v: number) {
    this.redMultiplier = this.greenMultiplier = this.blueMultiplier = 0;
    this.redOffset = (v >> 16) & 255; this.greenOffset = (v >> 8) & 255; this.blueOffset = v & 255;
  }
  concat(s: ColorTransform) {
    this.redOffset += s.redOffset * this.redMultiplier; this.greenOffset += s.greenOffset * this.greenMultiplier;
    this.blueOffset += s.blueOffset * this.blueMultiplier; this.alphaOffset += s.alphaOffset * this.alphaMultiplier;
    this.redMultiplier *= s.redMultiplier; this.greenMultiplier *= s.greenMultiplier;
    this.blueMultiplier *= s.blueMultiplier; this.alphaMultiplier *= s.alphaMultiplier;
  }
  clone() {
    return new ColorTransform(this.redMultiplier, this.greenMultiplier, this.blueMultiplier, this.alphaMultiplier,
      this.redOffset, this.greenOffset, this.blueOffset, this.alphaOffset);
  }
}

/** DisplayObject.transform: reads/writes go straight to the owner. */
export class Transform {
  constructor(private readonly owner: {
    _getMatrix(): Matrix; _setMatrix(m: Matrix): void;
    _getColor(): ColorTransform; _setColor(c: ColorTransform): void;
    _concatenatedMatrix(): Matrix;
  }) {}
  get matrix() { return this.owner._getMatrix(); }
  set matrix(m: Matrix) { this.owner._setMatrix(m); }
  get colorTransform() { return this.owner._getColor(); }
  set colorTransform(c: ColorTransform) { this.owner._setColor(c); }
  get concatenatedMatrix() { return this.owner._concatenatedMatrix(); }
}

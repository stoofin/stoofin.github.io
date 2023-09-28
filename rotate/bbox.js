let ctx = canvas.getContext('2d');
if (ctx == null)
    console.error("Couldn't get 2d rendering context");
let dbgDraw = false;
function updateCanvasDimensions() {
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    ctx.putImageData(imageData, 0, 0);
}
updateCanvasDimensions();
class Point2D {
    x;
    y;
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    add(other) {
        return new Point2D(this.x + other.x, this.y + other.y);
    }
    sub(other) {
        return new Point2D(this.x - other.x, this.y - other.y);
    }
    lerp(other, t) {
        return new Point2D(this.x + (other.x - this.x) * t, this.y + (other.y - this.y) * t);
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    div(scalar) {
        return new Point2D(this.x / scalar, this.y / scalar);
    }
    normalized() {
        return this.div(this.length());
    }
    dot(other) {
        return this.x * other.x + this.y * other.y;
    }
    clone() {
        return new Point2D(this.x, this.y);
    }
}
let drawMode = new class {
    drawFromPoint = null;
    entermode() {
        draw_button.classList.add("active");
    }
    pointerdown(evt) {
        this.drawFromPoint = new Point2D(evt.clientX, evt.clientY);
    }
    pointermove(evt) {
        if (this.drawFromPoint == null)
            return;
        ctx.beginPath();
        let nextPoint = new Point2D(evt.clientX, evt.clientY);
        ctx.moveTo(this.drawFromPoint.x, this.drawFromPoint.y);
        ctx.lineTo(nextPoint.x, nextPoint.y);
        this.drawFromPoint = nextPoint;
        ctx.strokeStyle = "black";
        ctx.lineWidth = evt.pressure * 20;
        ctx.lineCap = "round";
        ctx.stroke();
    }
    keydown(evt) {
        if (evt.key.toLowerCase() === "t") {
            setMode("transform");
        }
        else if (evt.key === "Delete") {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    pointerup(evt) {
        this.drawFromPoint = null;
    }
    tick() {
    }
    exitmode() {
        draw_button.classList.remove("active");
        this.drawFromPoint = null;
    }
};
class Mat3x2 {
    m;
    //  [0 1 2] 
    //  [3 4 5]
    //  [_ _ _]
    constructor(elements) {
        this.m = elements.slice();
    }
    clone() {
        return new Mat3x2(this.m);
    }
    static identity() {
        return new Mat3x2([
            1, 0, 0,
            0, 1, 0,
        ]);
    }
    static rotation(theta) {
        return new Mat3x2([
            Math.cos(theta), -Math.sin(theta), 0,
            Math.sin(theta), Math.cos(theta), 0,
        ]);
    }
    static translation(x, y) {
        return new Mat3x2([
            1, 0, x,
            0, 1, y,
        ]);
    }
    static scale(sx, sy) {
        return new Mat3x2([
            sx, 0, 0,
            0, sy, 0,
        ]);
    }
    static shearX(l) {
        return new Mat3x2([
            1, l, 0,
            0, 1, 0,
        ]);
    }
    static shearY(l) {
        return new Mat3x2([
            1, 0, 0,
            l, 1, 0,
        ]);
    }
    mul(other) {
        let m = this.m;
        let o = other.m;
        return new Mat3x2([
            m[0] * o[0] + m[1] * o[3],
            m[0] * o[1] + m[1] * o[4],
            m[0] * o[2] + m[1] * o[5] + m[2],
            m[3] * o[0] + m[4] * o[3],
            m[3] * o[1] + m[4] * o[4],
            m[3] * o[2] + m[4] * o[5] + m[5],
        ]);
    }
    determinant() {
        return this.m[0] * this.m[4] - this.m[1] * this.m[3];
    }
    inverse() {
        let det = this.determinant();
        let m = this.m;
        return new Mat3x2([
            m[4] / det, -m[1] / det, (m[1] * m[5] - m[4] * m[2]) / det,
            -m[3] / det, m[0] / det, (m[2] * m[3] - m[5] * m[0]) / det,
        ]);
    }
    transformPt(pt) {
        let m = this.m;
        return new Point2D(m[0] * pt.x + m[1] * pt.y + m[2], m[3] * pt.x + m[4] * pt.y + m[5]);
    }
    transformDir(pt) {
        let m = this.m;
        return new Point2D(m[0] * pt.x + m[1] * pt.y, m[3] * pt.x + m[4] * pt.y);
    }
}
class ToolTransform {
    translation = new Point2D(0, 0);
    rotation = 0;
    scaleAndShear = Mat3x2.identity();
    origin = new Point2D(0, 0);
    clone() {
        let t = new ToolTransform();
        t.translation = this.translation.clone();
        t.rotation = this.rotation;
        t.scaleAndShear = this.scaleAndShear.clone();
        t.origin = this.origin.clone();
        return t;
    }
    getComposedTransform() {
        return (Mat3x2.translation(this.translation.x, this.translation.y)
            .mul(Mat3x2.rotation(this.rotation))
            .mul(this.scaleAndShear)
            .mul(Mat3x2.translation(-this.origin.x, -this.origin.y)));
    }
}
let transformMode = new class TransformMode {
    tmpCanvas = document.createElement('canvas');
    tmpCtx = this.tmpCanvas.getContext('2d');
    cageBounds = null;
    cageRotation = Math.PI / 6;
    prevCageRotation = this.cageRotation;
    // Sadly, I don't know if these matrix names are accurate. Or what they even really mean if they are.
    // They might be backwards and a rotational negative somewhere is canceling it out.
    // I might even be using them in the opposite manner that their name suggests.  Who knows.
    canvasToCageTransform = Mat3x2.rotation(this.cageRotation);
    cageToCanvasTransform = this.canvasToCageTransform.inverse();
    imageData;
    supportMap = null;
    entranceTransform = new ToolTransform();
    prevTransform = new ToolTransform();
    transform = new ToolTransform();
    cageHandles = {};
    pathHandle(at) {
        let path = new Path2D();
        path.rect(at.x - 5, at.y - 5, 10, 10);
        return { at, path };
    }
    pathRect(a, b) {
        let path = new Path2D();
        path.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x) - Math.min(a.x, b.x), Math.max(a.y, b.y) - Math.min(a.y, b.y));
        return { at: a.lerp(b, 0.5), path };
    }
    drawHandle(handle) {
        ctx.strokeStyle = "gray";
        ctx.lineWidth = 1;
        ctx.stroke(handle.path);
    }
    computeBounds(transform) {
        if (this.supportMap == null)
            return null;
        let inv = transform.inverse();
        let ps = ([new Point2D(-1, 0), new Point2D(0, -1), new Point2D(1, 0), new Point2D(0, 1)]
            .map(p => this.supportMap.get(inv.transformDir(p)))
            .map(p => transform.transformPt(new Point2D(p.x, p.y))));
        return {
            low: new Point2D(ps[0].x, ps[1].y),
            high: new Point2D(ps[2].x, ps[3].y)
        };
    }
    updateCageBounds() {
        this.cageBounds = this.computeBounds(this.canvasToCageTransform);
        if (this.cageBounds != null) {
            let ll = this.cageBounds.low;
            let hh = this.cageBounds.high;
            let lh = new Point2D(this.cageBounds.low.x, this.cageBounds.high.y);
            let hl = new Point2D(this.cageBounds.high.x, this.cageBounds.low.y);
            this.cageHandles = {
                upperLeft: this.pathHandle(ll),
                lowerRight: this.pathHandle(hh),
                lowerLeft: this.pathHandle(lh),
                upperRight: this.pathHandle(hl),
                left: this.pathHandle(ll.lerp(lh, 0.5)),
                top: this.pathHandle(ll.lerp(hl, 0.5)),
                bottom: this.pathHandle(hh.lerp(lh, 0.5)),
                right: this.pathHandle(hh.lerp(hl, 0.5)),
                shearTop: this.pathRect(ll.sub(new Point2D(0, 5)), hl.add(new Point2D(0, 5))),
                shearBottom: this.pathRect(lh.sub(new Point2D(0, 5)), hh.add(new Point2D(0, 5))),
                shearLeft: this.pathRect(ll.sub(new Point2D(5, 0)), lh.add(new Point2D(5, 0))),
                shearRight: this.pathRect(hl.sub(new Point2D(5, 0)), hh.add(new Point2D(5, 0))),
            };
        }
    }
    pointInHandle(handleName, x, y) {
        if (handleName in this.cageHandles) {
            return ctx.isPointInPath(this.cageHandles[handleName].path, x, y);
        }
        return false;
    }
    setCtxTransform(ctx, mat) {
        let [m11, m12, m13, m21, m22, m23] = mat.m;
        // setTransform uses column-major order to define an affine transform
        // [a c e]
        // [b d f]
        // [0 0 1]
        ctx.setTransform(m11, m21, m12, m22, m13, m23);
    }
    cagePath() {
        let path = new Path2D();
        if (this.cageBounds == null)
            return path;
        path.moveTo(this.cageBounds.low.x, this.cageBounds.low.y);
        path.lineTo(this.cageBounds.high.x, this.cageBounds.low.y);
        path.lineTo(this.cageBounds.high.x, this.cageBounds.high.y);
        path.lineTo(this.cageBounds.low.x, this.cageBounds.high.y);
        path.closePath();
        return path;
    }
    originHandle() {
        let o = this.canvasToCageTransform.transformPt(this.transform.origin);
        let path = new Path2D();
        path.arc(o.x, o.y, 5, 0, Math.PI * 2);
        return path;
    }
    draw() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let composed = this.transform.getComposedTransform();
        this.setCtxTransform(ctx, composed);
        ctx.drawImage(this.tmpCanvas, 0, 0);
        // ctx.putImageData(this.imageData, 0, 0);
        if (this.cageBounds != null) {
            this.setCtxTransform(ctx, composed.mul(this.cageToCanvasTransform));
            // Stretch Handles
            for (let [name, handle] of Object.entries(this.cageHandles)) {
                if (!name.startsWith("shear"))
                    this.drawHandle(handle);
            }
            // Origin
            ctx.strokeStyle = "gray";
            ctx.lineWidth = 1;
            ctx.stroke(this.originHandle());
            // Border
            ctx.strokeStyle = "gray";
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke(this.cagePath());
            ctx.setLineDash([]);
            // Debug red circles for cage space points
            if (dbgDraw) {
                this.setCtxTransform(ctx, this.prevTransform.getComposedTransform().mul(this.cageToCanvasTransform));
                ctx.strokeStyle = "red";
                ctx.beginPath();
                for (let p of this.debugCageSpacePoints) {
                    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                }
                ctx.stroke();
            }
            ctx.resetTransform();
            // Debug blue circles for canvas space points
            if (dbgDraw) {
                ctx.strokeStyle = "blue";
                ctx.beginPath();
                for (let p of this.debugCanvasSpacePoints) {
                    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                }
                ctx.stroke();
            }
        }
        ctx.resetTransform();
    }
    setCageRotation(radians) {
        this.cageRotation = radians;
        this.canvasToCageTransform = Mat3x2.rotation(this.cageRotation);
        this.cageToCanvasTransform = this.canvasToCageTransform.inverse();
    }
    entermode() {
        transform_button.classList.add("active");
        this.imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.transform = new ToolTransform();
        this.setCageRotation(0);
        this.supportMap = SupportMap.fromNonTransparentPixels(this.imageData);
        this.tmpCanvas.width = this.imageData.width;
        this.tmpCanvas.height = this.imageData.height;
        this.tmpCtx.putImageData(this.imageData, 0, 0);
        let cb = this.computeBounds(Mat3x2.identity());
        if (cb != null) {
            this.transform.origin = cb.low.lerp(cb.high, 0.5);
            this.transform.translation = this.transform.translation.add(this.transform.origin);
        }
        this.updateCageBounds();
        this.draw();
        this.entranceTransform = this.transform.clone();
    }
    dragMode = "none";
    dragModeExtraInfo = {
        grabbedHandleName: "",
        anchorName: "",
    };
    startDrag = null;
    lastMousePos = new Point2D(0, 0);
    debugCageSpacePoints = [];
    debugCanvasSpacePoints = [];
    scaleRelationships = [
        { grab: "top", anchor: "bottom", mode: "scale-y" },
        { grab: "bottom", anchor: "top", mode: "scale-y" },
        { grab: "left", anchor: "right", mode: "scale-x" },
        { grab: "right", anchor: "left", mode: "scale-x" },
        { grab: "upperLeft", anchor: "lowerRight", mode: "scale-both" },
        { grab: "upperRight", anchor: "lowerLeft", mode: "scale-both" },
        { grab: "lowerLeft", anchor: "upperRight", mode: "scale-both" },
        { grab: "lowerRight", anchor: "upperLeft", mode: "scale-both" },
        // Shear always anchors on origin, anchors used here are a hack for correct mouse cursor orientation
        { grab: "shearTop", anchor: "upperLeft", mode: "shear-x" },
        { grab: "shearBottom", anchor: "lowerRight", mode: "shear-x" },
        { grab: "shearLeft", anchor: "upperLeft", mode: "shear-y" },
        { grab: "shearRight", anchor: "lowerRight", mode: "shear-y" },
    ];
    cursorAt(x, y) {
        let toCageSpace = this.transform.getComposedTransform().mul(this.cageToCanvasTransform);
        this.setCtxTransform(ctx, toCageSpace);
        let cursor = (() => {
            let directionalCursors = [
                { dir: new Point2D(1, 0).normalized(), cursor: "ew-resize" },
                { dir: new Point2D(0, 1).normalized(), cursor: "ns-resize" },
                { dir: new Point2D(1, 1).normalized(), cursor: "nwse-resize" },
                { dir: new Point2D(1, -1).normalized(), cursor: "nesw-resize" },
            ];
            for (let entry of this.scaleRelationships) {
                if (this.pointInHandle(entry.grab, x, y)) {
                    let dir = this.cageHandles[entry.grab].at.sub(this.cageHandles[entry.anchor]?.at);
                    let screenDir = this.transform.getComposedTransform().mul(this.cageToCanvasTransform).transformDir(dir);
                    return (directionalCursors
                        .map(c => ({ score: Math.abs(c.dir.dot(screenDir)), ...c }))
                        .sort((a, b) => b.score - a.score) // Sort descending
                    [0].cursor);
                }
            }
            if (ctx.isPointInPath(this.originHandle(), x, y)) {
                return "pointer";
            }
            else if (ctx.isPointInPath(this.cagePath(), x, y)) {
                return "move";
            }
            else {
                return "default";
            }
        })();
        ctx.resetTransform();
        return cursor;
    }
    pointerdown(evt) {
        this.prevTransform = this.transform.clone();
        let toCageSpace = this.transform.getComposedTransform().mul(this.cageToCanvasTransform);
        this.setCtxTransform(ctx, toCageSpace);
        let x = evt.clientX, y = evt.clientY;
        let scaling = false;
        for (let entry of this.scaleRelationships) {
            if (this.pointInHandle(entry.grab, x, y)) {
                this.dragMode = entry.mode;
                this.dragModeExtraInfo.grabbedHandleName = entry.grab;
                this.dragModeExtraInfo.anchorName = entry.anchor;
                scaling = true;
                break;
            }
        }
        if (scaling) {
            // Done
        }
        else if (ctx.isPointInPath(this.originHandle(), x, y)) {
            this.dragMode = "origin";
        }
        else if (ctx.isPointInPath(this.cagePath(), x, y)) {
            this.dragMode = "translate";
        }
        else {
            if (evt.altKey) {
                this.dragMode = "cage-rotate";
                this.prevCageRotation = this.cageRotation;
            }
            else {
                this.dragMode = "rotate";
            }
        }
        this.startDrag = new Point2D(x, y);
        this.lastMousePos.x = evt.clientX;
        this.lastMousePos.y = evt.clientY;
        ctx.resetTransform();
    }
    pointermove(evt) {
        if (this.startDrag != null) {
            let deltaX = evt.clientX - this.lastMousePos.x;
            let deltaY = evt.clientY - this.lastMousePos.y;
            if (this.dragMode === "cage-rotate") {
                // Done in cage space
                let toCageSpace = this.prevTransform.getComposedTransform().mul(this.cageToCanvasTransform).inverse();
                let lastDragged = toCageSpace.transformPt(this.lastMousePos);
                let newDragged = toCageSpace.transformPt(new Point2D(evt.clientX, evt.clientY));
                let anchor = this.canvasToCageTransform.transformPt(this.prevTransform.origin);
                let lastAngle = Math.atan2(lastDragged.y - anchor.y, lastDragged.x - anchor.x);
                let newAngle = Math.atan2(newDragged.y - anchor.y, newDragged.x - anchor.x);
                // Eek why is this - where normal rotation is +.  Confusing myself with transforms
                this.setCageRotation(this.cageRotation - (newAngle - lastAngle));
                this.updateCageBounds();
                this.draw();
            }
            else if (this.dragMode === "rotate") {
                // Done in canvas space because rotation happens left of scaleAndShear
                let originalDragged = this.startDrag;
                let newDragged = new Point2D(evt.clientX, evt.clientY);
                let anchor = this.prevTransform.getComposedTransform().transformPt(this.prevTransform.origin);
                let originalAngle = Math.atan2(originalDragged.y - anchor.y, originalDragged.x - anchor.x);
                let newAngle = Math.atan2(newDragged.y - anchor.y, newDragged.x - anchor.x);
                this.transform.rotation = this.prevTransform.rotation + (newAngle - originalAngle);
                this.draw();
            }
            else if (this.dragMode === "translate") {
                // Done in canvas space
                this.transform.translation.x += deltaX;
                this.transform.translation.y += deltaY;
                this.draw();
            }
            else if (this.dragMode === "origin") {
                // Done in cage space (huh? why?)
                let newDragged = this.prevTransform.getComposedTransform().inverse().transformPt(new Point2D(evt.clientX, evt.clientY));
                let anchor = this.canvasToCageTransform.transformPt(this.prevTransform.origin);
                this.transform.origin = newDragged;
                let newAnchorCanvasSpace = this.transform.getComposedTransform().mul(this.cageToCanvasTransform).transformPt(anchor);
                let oldAnchorCanvasSpace = this.prevTransform.getComposedTransform().mul(this.cageToCanvasTransform).transformPt(anchor);
                let anchorOffset = oldAnchorCanvasSpace.sub(newAnchorCanvasSpace);
                this.debugCanvasSpacePoints = [newAnchorCanvasSpace, oldAnchorCanvasSpace];
                this.transform.translation = this.transform.translation.add(anchorOffset);
                this.draw();
            }
            else if (["scale-both", "scale-x", "scale-y"].indexOf(this.dragMode) !== -1) {
                // Done in cage space...?
                let toCageSpace = this.prevTransform.getComposedTransform().mul(this.cageToCanvasTransform).inverse();
                let newDragged = toCageSpace.transformPt(new Point2D(evt.clientX, evt.clientY));
                this.debugCageSpacePoints = [newDragged.clone()];
                let anchor = !evt.altKey ? this.cageHandles[this.dragModeExtraInfo.anchorName].at : this.canvasToCageTransform.transformPt(this.prevTransform.origin);
                let oldDragged = this.cageHandles[this.dragModeExtraInfo.grabbedHandleName].at;
                let sy = (newDragged.y - anchor.y) / (oldDragged.y - anchor.y);
                let sx = (newDragged.x - anchor.x) / (oldDragged.x - anchor.x);
                if (evt.shiftKey) {
                    let dir = oldDragged.sub(anchor).normalized();
                    sx = sy = newDragged.sub(anchor).dot(dir) / oldDragged.sub(anchor).dot(dir);
                }
                else if (this.dragMode === "scale-x")
                    sy = 1;
                else if (this.dragMode === "scale-y")
                    sx = 1;
                this.transform.scaleAndShear = (this.prevTransform.scaleAndShear
                    .mul(this.cageToCanvasTransform)
                    .mul(Mat3x2.scale(sx, sy))
                    .mul(this.canvasToCageTransform));
                let newAnchorCanvasSpace = this.transform.getComposedTransform().mul(this.cageToCanvasTransform).transformPt(anchor);
                let oldAnchorCanvasSpace = this.prevTransform.getComposedTransform().mul(this.cageToCanvasTransform).transformPt(anchor);
                let anchorOffset = oldAnchorCanvasSpace.sub(newAnchorCanvasSpace);
                this.debugCanvasSpacePoints = [newAnchorCanvasSpace, oldAnchorCanvasSpace];
                this.transform.translation = this.transform.translation.add(anchorOffset);
                this.draw();
            }
            else if (["shear-x", "shear-y"].indexOf(this.dragMode) !== -1) {
                // Done in cage space...?
                let toCageSpace = this.prevTransform.getComposedTransform().mul(this.cageToCanvasTransform).inverse();
                let newDragged = toCageSpace.transformPt(new Point2D(evt.clientX, evt.clientY));
                this.debugCageSpacePoints = [newDragged.clone()];
                let startDragged = toCageSpace.transformPt(this.startDrag);
                let anchor = this.canvasToCageTransform.transformPt(this.prevTransform.origin);
                let oldDragged = this.cageHandles[this.dragModeExtraInfo.grabbedHandleName].at;
                let shear;
                if (this.dragMode === "shear-x") {
                    shear = Mat3x2.shearX((newDragged.x - startDragged.x) / (oldDragged.y - anchor.y));
                }
                else {
                    shear = Mat3x2.shearY((newDragged.y - startDragged.y) / (oldDragged.x - anchor.x));
                }
                this.transform.scaleAndShear = (this.prevTransform.scaleAndShear
                    .mul(this.cageToCanvasTransform)
                    .mul(shear)
                    .mul(this.canvasToCageTransform));
                let newAnchorCanvasSpace = this.transform.getComposedTransform().mul(this.cageToCanvasTransform).transformPt(anchor);
                let oldAnchorCanvasSpace = this.prevTransform.getComposedTransform().mul(this.cageToCanvasTransform).transformPt(anchor);
                let anchorOffset = oldAnchorCanvasSpace.sub(newAnchorCanvasSpace);
                this.debugCanvasSpacePoints = [newAnchorCanvasSpace, oldAnchorCanvasSpace];
                this.transform.translation = this.transform.translation.add(anchorOffset);
                this.draw();
            }
            this.lastMousePos.x = evt.clientX;
            this.lastMousePos.y = evt.clientY;
        }
        else {
            // This only works in response to mouse movement.  Using a tablet won't let the cursor update.  Dunno why.
            canvas.style.cursor = this.cursorAt(evt.clientX, evt.clientY);
        }
    }
    keydown(evt) {
        if (evt.key === "Escape") {
            if (this.startDrag != null) {
                this.startDrag = null;
                this.transform = this.prevTransform.clone();
                this.draw();
            }
            else {
                this.transform = this.entranceTransform.clone();
                this.draw();
                setMode('draw');
            }
        }
        else if (evt.key === "Enter" || evt.key.toLowerCase() === "b") {
            setMode("draw");
        }
    }
    pointerup(evt) {
        this.startDrag = null;
        this.lastMousePos.x = evt.clientX;
        this.lastMousePos.y = evt.clientY;
    }
    tick(delta) {
        // this.cageRotation += Math.PI * 2 *  delta / 5000;
        // this.canvasToCageTransform = Mat3x2.rotation(this.cageRotation);
        // this.cageToCanvasTransform = this.canvasToCageTransform.inverse();
        // this.updateCageBounds();
        // this.draw();
    }
    exitmode() {
        transform_button.classList.remove("active");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let composed = this.transform.getComposedTransform();
        this.setCtxTransform(ctx, composed);
        ctx.drawImage(this.tmpCanvas, 0, 0);
        ctx.resetTransform();
        canvas.style.cursor = "";
    }
};
let currentMode = drawMode;
window.addEventListener("resize", updateCanvasDimensions);
canvas.addEventListener("pointerdown", evt => currentMode.pointerdown(evt));
canvas.addEventListener("pointermove", evt => currentMode.pointermove(evt));
canvas.addEventListener("pointerup", evt => currentMode.pointerup(evt));
window.addEventListener("keydown", evt => currentMode.keydown(evt));
function setMode(mode) {
    currentMode.exitmode();
    currentMode = mode === "draw" ? drawMode : transformMode;
    currentMode.entermode();
}
function clearCanvas() {
    currentMode.exitmode();
    canvas.width = canvas.width;
    currentMode = drawMode;
    currentMode.entermode();
}
currentMode.entermode();
let lastTime = performance.now();
function animLoop(time) {
    let delta = time - lastTime;
    lastTime = time;
    currentMode.tick(delta);
    requestAnimationFrame(animLoop);
}
requestAnimationFrame(animLoop);
//# sourceMappingURL=bbox.js.map
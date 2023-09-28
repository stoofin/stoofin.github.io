function imageDataToPoints(imgData) {
    let d = imgData.data;
    let present = (x, y) => {
        if (x >= 0 && x < imgData.width && y >= 0 && y < imgData.height) {
            return d[(y * imgData.width + x) * 4 + 3] > 0;
        }
        return false;
    };
    let hullBuilder = new ConvexHullGrahamScan();
    let presentPixels = 0;
    let addedPixels = 0;
    for (let y = 0; y < imgData.height; y++) {
        pixel: for (let x = 0; x < imgData.width; x++) {
            if (present(x, y)) {
                presentPixels += 1;
                // Cull presentPixels that even locally can't contribute to the convex hull
                let left = false, right = false, above = false, below = false;
                for (let i = -1; i <= 1; i++) {
                    above ||= present(x + i, y - 1);
                    below ||= present(x + i, y + 1);
                    left ||= present(x - 1, y + i);
                    right ||= present(x + 1, y + i);
                }
                if (above && below && left && right) {
                    // Exclude
                }
                else {
                    addedPixels += 1;
                    hullBuilder.addPoint(x, y);
                }
            }
        }
    }
    let hull = hullBuilder.getHull();
    console.info({ numPixels: imgData.width * imgData.height, presentPixels, points: addedPixels, hull: hull.length });
    // getHull returns [undefined] if no points are added.
    return addedPixels > 0 ? hull : [];
}
class SupportMap {
    pts;
    constructor(pts) {
        this.pts = pts;
        this.pts = this.pts.map(p => ({ ...p })); // Deep copy
    }
    get(dir) {
        let dx = dir.x;
        let dy = dir.y;
        let extreme = dx * this.pts[0].x + dy * this.pts[0].y;
        let r = this.pts[0];
        for (let i = 1; i < this.pts.length; i++) {
            let d = dx * this.pts[i].x + dy * this.pts[i].y;
            if (d > extreme) {
                r = this.pts[i];
                extreme = d;
            }
        }
        return { ...r };
    }
    static fromNonTransparentPixels(imgData) {
        let pts = imageDataToPoints(imgData);
        if (pts.length > 0) {
            return new SupportMap(pts);
        }
        else {
            return null;
        }
    }
}
//# sourceMappingURL=hull.js.map
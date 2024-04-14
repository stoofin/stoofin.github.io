function imageDataToPoints(imgData) {
    let d = imgData.data;
    const w = imgData.width;
    const h = imgData.height;
    let hullBuilder = new ConvexHullGrahamScan();
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] > 0) {
                hullBuilder.addPoint(x, y);
                break;
            }
        }
        for (let x = w - 1; x >= 0; x--) {
            if (d[(y * w + x) * 4 + 3] > 0) {
                hullBuilder.addPoint(x, y);
                break;
            }
        }
    }
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            if (d[(y * w + x) * 4 + 3] > 0) {
                hullBuilder.addPoint(x, y);
                break;
            }
        }
        for (let y = h - 1; y >= 0; y--) {
            if (d[(y * w + x) * 4 + 3] > 0) {
                hullBuilder.addPoint(x, y);
                break;
            }
        }
    }
    let hull = hullBuilder.getHull();
    console.info({ numPixels: w * h, maxAdded: (w + h) * 2, hull: hull.length });
    // If no points were added graham_scan returns [undefined]
    if (hull[0] == undefined) {
        return [];
    }
    // Even a single point is valid, since the support map for a pixel will be added on
    return hull;
}
class SupportMapPoints {
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
            return new SupportMapPoints(pts);
        }
        else {
            return null;
        }
    }
}
class SupportMapSum {
    a;
    b;
    constructor(a, b) {
        this.a = a;
        this.b = b;
    }
    get(dir) {
        let pa = this.a.get(dir);
        let pb = this.b.get(dir);
        return { x: pa.x + pb.x, y: pa.y + pb.y };
    }
}
//# sourceMappingURL=hull.js.map
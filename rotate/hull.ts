// https://github.com/brian3kb/graham_scan_js
declare var ConvexHullGrahamScan: {
    new(): {
        addPoint(x: number, y: number): void;
        getHull(): {x: number, y: number}[];
    }
};

function imageDataToPoints(imgData: ImageData) {
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

    console.info({numPixels: w * h, maxAdded: (w + h) * 2, hull: hull.length});

    // If no points were added graham_scan returns [undefined]
    if (hull[0] == undefined) {
        return [];
    }
    // Even a single point is valid, since the support map for a pixel will be added on
    return hull;
}

interface SupportMap {
    get(dir: {x: number, y: number}): {x: number, y: number};
}
class SupportMapPoints implements SupportMap {
    constructor(private pts: {x: number, y: number}[]) {
        this.pts = this.pts.map(p => ({...p})); // Deep copy
    }
    get(dir: {x: number,  y: number}) {
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
        return {...r};
    }
    static fromNonTransparentPixels(imgData: ImageData): SupportMap|null {
        let pts = imageDataToPoints(imgData);
        if (pts.length > 0) {
            return new SupportMapPoints(pts);
        } else {
            return null;
        }
    }
}
class SupportMapSum implements SupportMap {
    constructor(private a: SupportMap, private b: SupportMap) {

    }
    get(dir: {x: number,  y: number}) {
        let pa = this.a.get(dir);
        let pb = this.b.get(dir);
        return {x: pa.x + pb.x, y: pa.y + pb.y};
    }
}
function grahamScan(points: Point2D[]) {
    // https://en.wikipedia.org/wiki/Graham_scan
    if (points.length <= 3) return points;
    let pivotIndex = 0;
    let pivot = points[pivotIndex];
    for (let i = 1; i < points.length; i++) {
        if (points[i].y < pivot.y || (points[i].y === pivot.y && points[i].x < pivot.x)) {
            pivotIndex = i;
            pivot = points[i];
        }
    }
    points[pivotIndex] = points[points.length - 1];
    points.pop();

    let pointsWithAngles = points.map(p => ({ p, angle: Math.atan2(p.y - pivot.y, p.x - pivot.x)}));

    pointsWithAngles.sort((a, b) => {
        let r = a.angle - b.angle;
        if (r === 0) {
            r = a.p.sub(pivot).lengthSq() - b.p.sub(pivot).lengthSq();
        }
        return r;
    });

    function ccw(a: Point2D, b: Point2D, c: Point2D) {
        return b.sub(a).crossZ(c.sub(b));
    }
    
    let hull = [pivot];
    for (let {p} of pointsWithAngles) {
        while (hull.length > 1 && ccw(hull[hull.length - 2], hull[hull.length - 1], p) <= 0.0) {
            hull.pop();
        }
        hull.push(p);
    }

    return hull;
}

function imageDataToPoints(imgData: ImageData) {
    let d = imgData.data;
    const w = imgData.width;
    const h = imgData.height;

    let points = [];

    if (h < w) {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (d[(y * w + x) * 4 + 3] > 0) {
                    points.push(new Point2D(x, y));
                    break;
                }
            }
            for (let x = w - 1; x >= 0; x--) {
                if (d[(y * w + x) * 4 + 3] > 0) {
                    points.push(new Point2D(x, y));
                    break;
                }
            }
        }
    } else {
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                if (d[(y * w + x) * 4 + 3] > 0) {
                    points.push(new Point2D(x, y));
                    break;
                }
            }
            for (let y = h - 1; y >= 0; y--) {
                if (d[(y * w + x) * 4 + 3] > 0) {
                    points.push(new Point2D(x, y));
                    break;
                }
            }
        }
    }

    let numPoints = points.length;
    let hull = grahamScan(points);

    console.info({numPixels: w * h, numPoints, hull: hull.length});

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
declare const authlink: HTMLAnchorElement;
declare const loadMoreButton: HTMLInputElement;
declare const timelines: HTMLDivElement;

let here = window.location.protocol === "file:" ? "http://localhost" : "https://stoofin.github.io/twitch/timeline.html";
var clientId = "wvea6zmii7cgnnjo10chrqocxd4fln";
authlink.href = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${here}&response_type=token&scope=`;

class Pending<T> {
    promise: Promise<T>;
    resolve: (t: T) => void;
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
        });
    }
}

let channelIcons = new Map<string, Pending<string|null>>();
function getChannelIcon(channelName: string): Pending<string|null> {
    let c = channelIcons.get(channelName);
    if (c == null) {
        c = new Pending();
        channelIcons.set(channelName, c);
    }
    return c;
}
function registerChannelIcon(channelName: string, url: string|null) {
    if (url != null) {
        getChannelIcon(channelName).resolve(url.replace(/\d{2,}x\d{2,}\./, "70x70."));
    } else {
        getChannelIcon(channelName).resolve(null);
    }
}

function eqDay(a: Date, b: Date) {
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function ltDay(a: Date, b: Date) {
    if (a.getFullYear() === b.getFullYear()) {
        if (a.getMonth() === b.getMonth()) {
            return a.getDate() < b.getDate();
        } else {
            return a.getMonth() < b.getMonth();
        }
    } else {
        return a.getFullYear() < b.getFullYear();
    }
}
function incDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function firstSecondOfDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function lastSecondOfDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, -1);
}
    
function splitIntoDaySegments(start: Date, end: Date): Span[] {
    var spans: Span[] = [];
    // Only one span
    if (eqDay(start, end)) {
        spans.push({
            start: start,
            end: end,
        });
    } else {
        // First day
        spans.push({
            start: start,
            end: lastSecondOfDay(start)
        });
        // Intermediate days
        for (var d = incDay(start); ltDay(d, end); d = incDay(d)) {
            spans.push({
                start: d,
                end: lastSecondOfDay(d)
            });
        }
        // Last day
        spans.push({
            start: firstSecondOfDay(end),
            end: end
        });
    }
    return spans;
}

function getSegments(videos: Video[]): Segment[] {
    let segments: Segment[] = [];
    for (let video of videos) {
        for (let span of splitIntoDaySegments(video.start, video.end)) {
            segments.push({ span, video });
        }
    }
    return segments;
}

function* flatten<T>(tss: T[][]) {
    for (let ts of tss) {
        for (let t of ts) {
            yield t;
        }
    }
}

function groupBy<T>(ts: T[], pred: (a: T, b: T) => boolean): T[][] {
    let groups = [];
    let group: T[] = [];
    for (let t of ts) {
        if (group.length === 0 || pred(group[0], t)) {
            group.push(t);
        } else {
            groups.push(group);
            group = [t];
        }
    }
    if (group.length > 0) {
        groups.push(group);
    }
    return groups;
}

function groupByValue<T, K>(ts: T[], f: (t: T) => K): Map<K, T[]> {
    let groups = new Map();
    for (let t of ts) {
        let key = f(t);
        let arr = groups.get(key);
        if (arr == null) {
            arr = [];
            groups.set(key, arr);
        }
        arr.push(t);
    }
    return groups;
}

function subDate(a: Date, b: Date): number {
    return (a as any) - (b as any);
}

interface Span {
    start: Date,
    end: Date
}
interface Segment {
    span: Span,
    video: Video,
}
/// [Segment] => [[[Segment]]]
function layoutSegments(segments: Segment[]): Segment[][][] {
    console.log("segments", segments);
    return groupBy(segments.slice().sort((a, b) => subDate(a.span.start, b.span.start)), (a, b) => eqDay(a.span.start, b.span.start))
        .map(group => {
            let channels = groupByValue(group, segment => segment.video.channel);
            return Array.from(channels.keys()).sort().map(channel => channels.get(channel)!);
        });
}

function layoutToHTML(segmentsLayout: Segment[][][]) {
    console.log(segmentsLayout);

    function mk(tag: string, attrs: {[name: string]: any} = {}, children: Iterable<Node> = []): HTMLElement {
        let elem = document.createElement(tag);
        for (let attrname in attrs) {
            elem.setAttribute(attrname, attrs[attrname]);
        }
        for (let child of children) {
            elem.appendChild(child);
        }
        return elem;
    }
    function text(s: string): Node {
        return document.createTextNode(s);
    }
    function listen<T extends HTMLElement>(el: T, eventMap: {[name: string]: (evt: Event) => any}): T {
        for (let name in eventMap) {
            el.addEventListener(name, eventMap[name]);
        }
        return el;
    }

    function prependChild(parent: Node, node: Node) {
        if (parent.childNodes.length === 0) {
            parent.appendChild(node);
        } else {
            parent.insertBefore(node, parent.childNodes[0]);
        }
    }
    function dateToString(date: Date) {
        return "" +
            ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][date.getDay()] +
            " " +
            ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][date.getMonth()] +
            " " +
            date.getDate() + ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th"][date.getDate() <= 13 ? date.getDate() : date.getDate() % 10] +
            ", " + date.getFullYear();
        // return date.toDateString();
    }
    function makeGridLines() {
        let r = [];
        for (let i = 1; i < 24; i++) {
            r.push(mk('div', {
                class: `timeline-gridline ${i % 6 === 0 ? "major" : ""}`,
                style: `left: ${(i / 24 * 100)}%`,
            }));
        }
        return r;
    }
    function makeTimeArgument(millis: number) {
        if (millis <= 0) return "";
        let seconds = Math.floor(millis / 1000);
        var hours = Math.floor(seconds / (60 * 60));
        seconds -= hours * 60 * 60;
        var minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
        var timeStr = seconds + "s";
        if (minutes > 0) timeStr = minutes + "m" + timeStr;
        if (hours > 0) timeStr = hours + "h" + timeStr;
        return "?t=" + timeStr;
    }
    function makeSegmentDiv(segment: Segment) {
        let {span, video} = segment;

        var firstSecond = firstSecondOfDay(span.start);
        var lastSecond = lastSecondOfDay(span.start);
        var dayLength = subDate(lastSecond, firstSecond);
        var left = (subDate(span.start, firstSecond) / dayLength * 100).toFixed(2) + "%";
        var right = (subDate(lastSecond, span.end) / dayLength * 100).toFixed(2) + "%";

        var spanDiv = mk("a", {
            class: "timeline-span",
            title: video.title + "\n" + video.game,
            href: "https://twitch.tv/videos/" + video.id + makeTimeArgument(subDate(span.start, video.start)),
            style: `left: ${left}; right: ${right}`,
        }, [
            mk('span', {class: "timeline-span-text"}, [text(video.title)])
        ]);
        getChannelIcon(video.channel).promise.then(imgSrc => {
            if (imgSrc != null) {
                prependChild(spanDiv, mk("img", {src: imgSrc}));
            }
        });
        return spanDiv;
    }
    let nowStreams: { userId: string, onStream(s: TwitchStream, gameName: string): void }[] = [];
    function makeNowDiv(channel: string, userId: string) {
        let now = new Date();
        var firstSecond = firstSecondOfDay(now);
        var lastSecond = lastSecondOfDay(now);
        var dayLength = subDate(lastSecond, firstSecond);
        var left = (subDate(now, firstSecond) / dayLength * 100).toFixed(2) + "%";

        let liveLink = mk('a', {class: "stream-link", href: "https://twitch.tv/" + channel, title: "Offline"}, [text("0")]);
        
        nowStreams.push({
            userId,
            onStream(s: TwitchStream, gameName: string) {
                liveLink.classList.add("live");
                liveLink.textContent = s.viewers + "";
                liveLink.title = s.channel.status + "\n" + gameName;
            },
        });
        return mk('div', {class: "now-indicator", style: `left: ${left};`}, [
            liveLink
        ]);
    }
    function makeTimelineDiv(channel: Segment[]) {
        let channelName = channel[0].video.channel;
        let channelId = channel[0].video.user_id;

        return mk('div', {class: "channel-timeline"}, [
            mk('div', {class: "channel-name"}, [text(channelName)]),
            mk('div', {class: "timeline"}, flatten([
                makeGridLines(),
                eqDay(channel[0].span.start, new Date()) ? [makeNowDiv(channelName, channelId)] : [],
                channel.map(segment => makeSegmentDiv(segment))
            ]))
        ]);
    }
    function makeDayDiv(channels: Segment[][]) {
        let day = channels[0][0].span.start;
        return mk('div', {class: "timeline-container"}, flatten([
            [mk('div', {class: "timeline-date-title"}, [text(dateToString(day))])],
            channels.map(channel => makeTimelineDiv(channel))
        ]));
    }

    timelines.innerHTML = '';
    for (let day of segmentsLayout.slice().reverse()) {
        timelines.appendChild(makeDayDiv(day));
    }
    async function getLiveInfo(queries: { userId: string, onStream(s: TwitchStream, gameName: string): void }[]) {
        let streams = await twitchGetStreams(queries.map(query => query.userId));
        for (let stream of streams.streams) {
            for (let query of queries) {
                if (stream.channel._id+"" === query.userId) {
                    query.onStream(stream, stream.game);
                }
            }
        }
    }
    getLiveInfo(nowStreams);
    (window as any).layout = segmentsLayout;
}

let oauthToken: string|undefined = undefined;

function stripUndefined<T>(obj: {[key: string]: T|undefined}): {[key: string]: T} {
    let stripped: {[key: string]: T} = {};
    for (let key in obj) {
        let val = obj[key];
        if (val !== undefined) {
            stripped[key] = val;
        }
    }
    return stripped;
}

async function fetchTwitch(url: string) {
    // Because of the custom header this request will be preflighted
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#Simple_requests
    let response = await fetch(url, {
        headers: stripUndefined({
            "Accept": "application/vnd.twitchtv.v5+json",
            "Client-ID": clientId,
            "Authorization": oauthToken,
        }),
        method: "GET",
    });
    return await response.json();
}

interface TwitchUser {
    "_id": string, // "44322889",
    "bio": string, // "Just a gamer playing games and chatting. :)",
    "created_at": string, // "2013-06-03T19:12:02.580593Z",
    "display_name": string, // "dallas",
    "logo": string|null, // "https://static-cdn.jtvnw.net/jtv_user_pictures/dallas-profile_image-1a2c906ee2c35f12-300x300.png",
    "name": string, // "dallas",
    "type": string, // "staff",
    "updated_at": string, // "2017-02-09T16:32:06.784398Z"
}

function twitchUsers(userNames: string[]): Promise<{ users: TwitchUser[] }> {
    return fetchTwitch(`https://api.twitch.tv/kraken/users?login=${userNames.join(',')}`);
}

interface TwitchStream {
    "_id": number,
    "average_fps": number,
    "channel": {
        "_id": number,
        "broadcaster_language": string, // "en",
        "created_at": string, // "2016-04-06T04:12:40Z",
        "display_name": string, // "MOONMOON_OW",
        "followers": number,
        "game": string, // "Overwatch",
        "language": string, // "en",
        "logo": string, // "https://static-cdn.jtvnw.net/jtv_user_pictures/moonmoon_ow-profile_image-0fe586039bb28259-300x300.png",
        "mature": boolean,
        "name": string, // "moonmoon_ow",
        "partner": boolean,
        "profile_banner": string, // "https://static-cdn.jtvnw.net/jtv_user_pictures/moonmoon_ow-profile_banner-13fbfa1ba07bcd8a-480.png",
        "profile_banner_background_color": null,
        "status": string, // "KKona where my Darryl subs at KKona",
        "updated_at": string, // "2016-12-15T20:04:53Z",
        "url": string, // "https://www.twitch.tv/moonmoon_ow",
        "video_banner": string, // "https://static-cdn.jtvnw.net/jtv_user_pictures/moonmoon_ow-channel_offline_image-2b3302e20384eee8-1920x1080.png",
        "views": number
    },
    "created_at": string, // "2016-12-15T14:55:49Z",
    "delay": number,
    "game": string, // "Overwatch",
    "is_playlist": boolean,
    "preview": {
        "large": string, // "https://static-cdn.jtvnw.net/previews-ttv/live_user_moonmoon_ow-640x360.jpg",
        "medium": string, // "https://static-cdn.jtvnw.net/previews-ttv/live_user_moonmoon_ow-320x180.jpg",
        "small": string, // "https://static-cdn.jtvnw.net/previews-ttv/live_user_moonmoon_ow-80x45.jpg",
        "template": string, // "https://static-cdn.jtvnw.net/previews-ttv/live_user_moonmoon_ow-{width}x{height}.jpg"
    },
    "video_height": number,
    "viewers": number
}

// Numerical user ids => streams
function twitchGetStreams(userIds: string[]): Promise<{ streams: TwitchStream[] }> {
    return fetchTwitch(`https://api.twitch.tv/kraken/streams/?channel=${userIds.join(',')}&stream_type=live`);
}

interface TwitchVideo {
    "_id": string,
    "broadcast_id": number,
    "broadcast_type": "archive"|"highlight"|"upload",
    "channel": {
       "_id": number,
       "display_name": string,
       "name": string
    },
    "created_at": string, // e.g. "2016-12-15T20:33:02Z"
    "description": string|null,
    "description_html": string|null,
    "fps": {
       "audio_only": number,
       "chunked": number,
       "high": number,
       "low": number,
       "medium": number,
       "mobile": number
    },
    "game": string, // e.g. "Hearthstone: Heroes of Warcraft",
    "language": string, // e.g. "en",
    "length": number, // In seconds, probably
    "preview": {
       "large": string,
       "medium": string,
       "small": string,
       "template": string,
    },
    "published_at": string, // e.g. "2016-12-15T20:33:02Z",
    "resolutions": {
       "chunked": string, // e.g. "1920x1080",
       "high": string, // e.g. "1280x720",
       "low": string, // e.g. "640x360",
       "medium": string, // e.g. "852x480",
       "mobile": string, // e.g. "400x226"
    },
    "status": string, // e.g. "recording",
    "tag_list": string,
    "thumbnails": {
       "large": [{
          "type": string, // e.g. "generated"
          "url": string
       }],
       "medium": [{
          "type": string,
          "url": string
       }],
       "small": [{
          "type": string,
          "url": string
       }],
       "template": [{
          "type": string,
          "url": string
       }]
    },
    "title": string,
    "url": string,
    "viewable": string, // e.g. "public",
    "viewable_at": null,
    "views": number
}
async function followVideos(offset: number, limit: number): Promise<{ videos: TwitchVideo[] }> {
    return fetchTwitch(`https://api.twitch.tv/kraken/videos/followed?offset=${offset}&limit=${limit}&broadcast_type=archive&sort=time`);
}

interface Video {
    title: string,
    start: Date,
    end: Date,
    id: string,
    channel: string,
    user_id: string,
    game: string,
}
function twitchBroadcastsToVideos(broadcasts: TwitchVideo[]): Video[] {
    return broadcasts.map(broadcast => {
        var start = new Date(broadcast.created_at);
        var end = new Date(start.getTime() + broadcast.length * 1000);
        return {
            title: broadcast.title,
            start: start,
            end: end,
            id: broadcast._id.substr(1),
            channel: broadcast.channel.name,
            user_id: broadcast.channel._id+"",
            game: broadcast.game
        };
    });
}

function getAuthorization() {
    // Checks if we've been redirected back from an authorization request
    let m = window.location.hash.match(/^#access_token=(\w+)/);
    if (m == null) {
        let storedToken = window.localStorage.getItem("Token");
        if (storedToken != null) {
            oauthToken = storedToken;
        }
    } else {
        oauthToken = "OAuth " + m[1];
        window.localStorage.setItem("Token", oauthToken);
        window.history.replaceState(undefined, document.title, window.location.pathname + window.location.search);
    }

    if (oauthToken != null) {
        authlink.textContent = "Reauthorize";
        loadMoreButton.classList.remove("hidden");
    }
}

function setDiff<T>(a: Set<T>, b: Set<T>): Set<T> {
    let r = new Set<T>();
    for (let v of a) {
        if (!b.has(v)) {
            r.add(v);
        }
    }
    return r;
}
function setUnion<T>(a: Set<T>, b: Set<T>): Set<T> {
    let r = new Set<T>();
    for (let v of a) {
        r.add(v);
    }
    for (let v of b) {
        r.add(v);
    }
    return r;
}

let seenUserNames = new Set<string>();
async function loadUserIcons(userNames: Set<string>) {
    let newUserNames = setDiff(userNames, seenUserNames);
    seenUserNames = setUnion(seenUserNames, userNames);
    if (newUserNames.size > 0) {
        let users = await twitchUsers(Array.from(newUserNames));
        for (let user of users.users) {
            registerChannelIcon(user.name, user.logo);
        }
    }
}

let loadedVideos: TwitchVideo[] = [];
let offset = 0;
async function loadMore(n: number) {
    if (oauthToken == null) return;
    let videosPromise = followVideos(offset, n);
    offset += n;
    let videos = await videosPromise;

    if (videos.videos.length === 0) {
        loadMoreButton.style.display = 'none';
        return;
    }

    loadUserIcons(new Set(videos.videos.map(v => v.channel.name)));

    loadedVideos = loadedVideos.concat(videos.videos);
    layoutToHTML(layoutSegments(getSegments(twitchBroadcastsToVideos(loadedVideos))));
}

async function initial() {
    getAuthorization();
    loadMore(25);
}

initial();
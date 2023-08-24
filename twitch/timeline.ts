declare const authlink: HTMLAnchorElement;
declare const timelines: HTMLDivElement;
declare const statusSpan: HTMLSpanElement;
declare const loadMoreButton: HTMLInputElement;

/*
TODO:
    For each channel, show the region prior to that channel's earliest known vod as unknown (white?)
        To make it clear that just because one might exist earlier on another channel doesn't mean there can't be a vod there on the first.
*/

const STREAM_PLACEHOLDER_ID = "stream_placeholder";
const CONCURRENT_ARCHIVE_REQUESTS = 20;

let here = window.location.href.startsWith("http://localhost") ? "http://localhost:1666/timeline.html" : "https://stoofin.github.io/twitch/timeline.html";
var clientId = "wvea6zmii7cgnnjo10chrqocxd4fln";
authlink.href = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${here}&response_type=token&scope=user:read:follows`;

var wantLoadMore: Pending<void>|null = null;

class DefaultMap<K,V> extends Map<K,V> {
    constructor(private ctor: (k: K) => V) {
        super();
    }
    get(key: K): V {
        let v = super.get(key);
        if (v == null) {
            v = this.ctor(key);
            this.set(key, v);
        }
        return v;
    }
}

class Pending<T> {
    promise: Promise<T>;
    resolve: (t: T) => void;
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
        });
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

class ChannelIcons {
    seenUserNames = new Set<string>();
    map = new DefaultMap<string, Pending<string|null>>(name => new Pending());
    getIcon(channelName: string): Promise<string|null> {
        return this.map.get(channelName).promise;
    }

    async requestUserIcons(userNames: Set<string>) {
        let newUserNames = setDiff(userNames, this.seenUserNames);
        this.seenUserNames = setUnion(this.seenUserNames, userNames);
        if (newUserNames.size > 0) {
            let users = await twitchUsers(Array.from(newUserNames));
            for (let user of users.data) {
                this.registerIcon(user.login, user.profile_image_url);
            }
        }
    }

    private registerIcon(channelName: string, url: string|null) {
        if (url != null) {
            this.map.get(channelName).resolve(url.replace(/\d{2,}x\d{2,}\./, "70x70."));
        } else {
            this.map.get(channelName).resolve(null);
        }
    }
}
let channelIcons = new ChannelIcons();

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
function last<T>(arr: T[]): T {
    return arr[arr.length - 1];
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

function layoutToHTML(segmentsLayout: Segment[][][], liveStreams: Promise<Map<string, TwitchStream>>) {
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

        let url: string;
        if (video.id === STREAM_PLACEHOLDER_ID) {
            url = "https://twitch.tv/" + video.channel;
        } else {
            url = "https://twitch.tv/videos/" + video.id + makeTimeArgument(subDate(span.start, video.start));
        }

        var spanDiv = mk("a", {
            class: "timeline-span" + (video.id === STREAM_PLACEHOLDER_ID ? " placeholder" : ""),
            title: video.title + "\n" + video.game,
            href: url,
            style: `left: ${left}; right: ${right}`,
        }, [
            mk('span', {class: "timeline-span-text"}, [text(video.title)])
        ]);

        channelIcons.getIcon(video.channel).then(imgSrc => {
            if (imgSrc != null) {
                prependChild(spanDiv, mk("img", {src: imgSrc}));
            }
        });
        return spanDiv;
    }
    function makeNowDiv(channel: string, userId: string) {
        let now = new Date();
        var firstSecond = firstSecondOfDay(now);
        var lastSecond = lastSecondOfDay(now);
        var dayLength = subDate(lastSecond, firstSecond);
        var left = (subDate(now, firstSecond) / dayLength * 100).toFixed(2) + "%";

        let liveLink = mk('a', {class: "stream-link", href: "https://twitch.tv/" + channel, title: "Offline"}, [text("0")]);
        
        liveStreams.then(streams => {
            let s = streams.get(userId);
            if (s != null) {
                liveLink.classList.add("live");
                liveLink.textContent = s.viewer_count + "";
                liveLink.title = s.title + "\n" + s.game_name;
            }
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
    (window as any).layout = segmentsLayout;
}

let userAccessToken: string|undefined = undefined;

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

function requireReauthorization() {
    statusSpan.textContent = "Authorization token expired";
    authlink.textContent = "Reauthorize";
    authlink.style.display = "";
}

async function fetchTwitch(url: string) {
    // Because of the custom header this request will be preflighted
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#Simple_requests
    let response = await fetch(url, {
        headers: stripUndefined({
            "Client-ID": clientId,
            "Authorization": `Bearer ${userAccessToken}`,
        }),
        method: "GET",
    });
    if (response.status === 401) {
        requireReauthorization();
    }
    return await response.json();
}

interface TwitchUser {
    "id": string, // "141981764",
    "login": string, // "twitchdev",
    "display_name": string, // "TwitchDev",
    "type": string, // "",
    "broadcaster_type": string, // "partner",
    "description": string, // "Supporting third-party developers building Twitch integrations from chatbots to game integrations.",
    "profile_image_url": string, // "https://static-cdn.jtvnw.net/jtv_user_pictures/8a6381c7-d0c0-4576-b179-38bd5ce1d6af-profile_image-300x300.png",
    "offline_image_url": string, // "https://static-cdn.jtvnw.net/jtv_user_pictures/3f13ab61-ec78-4fe6-8481-8682cb3b0ac2-channel_offline_image-1920x1080.png",
    "view_count": number, // 5980557,
    "email"?: string, // "not-real@email.com",
    "created_at": string, // "2016-12-14T20:32:28Z"
}

function twitchUser(): Promise<{ data: TwitchUser[] }> {
    // Gets user by bearer token. Used to get the user's id for other queries.
    return fetchTwitch(`https://api.twitch.tv/helix/users`);
}

function twitchUsers(userNames: string[]): Promise<{ data: TwitchUser[] }> {
    return fetchTwitch(`https://api.twitch.tv/helix/users?login=${userNames.join('&login=')}`);
}

interface TwitchStream {
    "id": string, // "42170724654",
    "user_id": string, // "132954738",
    "user_login": string, // "aws",
    "user_name": string, // "AWS",
    "game_id": string, // "417752",
    "game_name": string, // "Talk Shows & Podcasts",
    "type": string, // "live",
    "title": string, // "AWS Howdy Partner! Y'all welcome ExtraHop to the show!",
    "viewer_count": number, // 20,
    "started_at": string, // "2021-03-31T20:57:26Z",
    "language": string, // "en",
    "thumbnail_url": string, // "https://static-cdn.jtvnw.net/previews-ttv/live_user_aws-{width}x{height}.jpg",
    "tag_ids": string[] // [ "6ea6bca4-4712-4ab9-a906-e3336a9d8039" ]
}

function twitchGetFollowedStreams(userId: string): Promise<{ data: TwitchStream[] }> {
    return fetchTwitch(`https://api.twitch.tv/helix/streams/followed?user_id=${userId}`);
}

interface TwitchFollow {
    "from_id": string, // "171003792",
    "from_login": string, // "iiisutha067iii",
    "from_name": string, // "IIIsutha067III",
    "to_id": string, // "23161357",
    "to_name": string, // "LIRIK",
    "followed_at": string // "2017-08-22T22:55:24Z"
}

function twitchGetFollows(fromId: string): Promise<TwitchPaginatedResult<TwitchFollow>> {
    return fetchTwitch(`https://api.twitch.tv/helix/users/follows?from_id=${fromId}&first=100`);
}

interface TwitchVideo {
    "id": string, // "335921245",
    "stream_id": string|null,
    "user_id": string, // "141981764",
    "user_login": string, // "twitchdev",
    "user_name": string, // "TwitchDev",
    "title": string, // "Twitch Developers 101",
    "description": string, // "Welcome to Twitch development! Here is a quick overview of our products and information to help you get started.",
    "created_at": string, // "2018-11-14T21:30:18Z",
    "published_at": string, // "2018-11-14T22:04:30Z",
    "url": string, // "https://www.twitch.tv/videos/335921245",
    "thumbnail_url": string, // "https://static-cdn.jtvnw.net/cf_vods/d2nvs31859zcd8/twitchdev/335921245/ce0f3a7f-57a3-4152-bc06-0c6610189fb3/thumb/index-0000000000-%{width}x%{height}.jpg",
    "viewable": string, // "public",
    "view_count": number, // 1863062,
    "language": string, // "en",
    "type": string, // "upload",
    "duration": string, // "3m21s",
    "muted_segments": [
      {
        "duration": number, // 30,
        "offset": number, // 120
      }
    ]
}

interface TwitchPaginatedResult<T> {
    data: T[],
    pagination: { cursor?: string }
}

function twitchGetUserArchiveVideos(userId: string, count: number = 10, after_cursor?: string): Promise<TwitchPaginatedResult<TwitchVideo>> {
    let pagination = after_cursor != null ? `&after=${after_cursor}` : '';
    return fetchTwitch(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=${count}&type=archive${pagination}`);
}

interface Video {
    title: string,
    start: Date,
    end: Date,
    id: string,
    channel: string,
    user_id: string,
    game: string,
    stream_id: string|null,
}

const DURATION_REGEX = /^(?:(\d+)d)?(?:(\d+)+h)?(?:(\d+)+m)?(?:(\d+)s)?$/;
const DURATION_MILLIS = [24 * 60 * 60 * 1000, 60 * 60 * 1000, 60 * 1000, 1000];
function apiDurationToMilliseconds(duration: string): number {
    let m = duration.match(DURATION_REGEX);
    if (m == null) {
        console.error("Improperly formatted duration: " + duration);
        return 0;
    }
    let millis = 0;
    m.slice(1).forEach((v, i) => {
        if (v != null) {
            millis += parseInt(v) * DURATION_MILLIS[i];
        }
    });
    return millis;
}

function twitchBroadcastToVideo(broadcast: TwitchVideo): Video {
    var start = new Date(broadcast.created_at);
    var end = new Date(start.getTime() + apiDurationToMilliseconds(broadcast.duration));
    return {
        title: broadcast.title,
        start: start,
        end: end,
        id: broadcast.id,
        channel: broadcast.user_login,
        user_id: broadcast.user_id,
        game: broadcast.description, // New api doesn't have a game field for videos, only streams have that now
        stream_id: broadcast.stream_id,
    };
}

interface CachedUserInfo {
    accessToken: string,
    userId: string|undefined,
}

function getAuthorization() {
    // Checks if we've been redirected back from an authorization request
    let m = window.location.hash.match(/^#access_token=(\w+)/);
    if (m == null) {
        let storedToken = window.localStorage.getItem("UserAccessToken");
        if (storedToken != null) {
            userAccessToken = storedToken;
        }
    } else {
        userAccessToken = m[1];
        window.localStorage.clear();
        window.localStorage.setItem("UserAccessToken", userAccessToken);
        window.history.replaceState(undefined, document.title, window.location.pathname + window.location.search);
    }

    if (userAccessToken != null) {
        authlink.style.display = "none";
    } else {
        authlink.style.display = '';
    }
    statusSpan.textContent = "";
}

class PriorityRequest<T> {
    priority: number;
    start: () => Promise<T>;
}

function processConcurrentTasks<T>(numConcurrent: number, requests: PriorityRequest<T>[]) {
    let activeRequests: number = 0;
    let pendingYields: T[] = [];
    let notify = (_whatever: unknown) => {};
    let monitor: Promise<void>|undefined = undefined;

    function removeHighestPriority(): PriorityRequest<T>|undefined {
        if (requests.length === 0) return undefined;
        let priority = requests[0].priority;
        let index = 0;
        for (let i = 1; i < requests.length; i++) {
            if (requests[i].priority > priority) {
                priority = requests[i].priority;
                index = i;
            }
        }
        let result = requests[index];
        requests[index] = requests[requests.length - 1];
        requests.pop();
        return result;
    }

    function pump() {
        // The idea is that priorities can be mutated from outside as information comes in
        let task = removeHighestPriority();
        if (task != null) {
            activeRequests += 1;
            task.start().then(v => {
                pendingYields.push(v);
            }).finally(() => {
                activeRequests -= 1;
                pump();
                monitor = undefined;
                notify(null);
            });
        }
    }

    for (let i = 0; i < numConcurrent; i++) {
        pump();
    }

    return {
        [Symbol.asyncIterator](): AsyncIterator<T, undefined, undefined> {
            return {
                async next(arg: undefined) {
                    while (pendingYields.length === 0 && activeRequests > 0) {
                        if (monitor == null) {
                            monitor = new Promise(resolve => notify = resolve);
                        }
                        await monitor;
                    }
                    if (pendingYields.length === 0 && activeRequests === 0) {
                        return { done: true, value: undefined };
                    } else {
                        return {
                            value: pendingYields.shift()!,
                            done: false,
                        };
                    }
                }
            }
        },
        addTasks(toAdd: PriorityRequest<T>[]) {
            for (let r of toAdd) {
                requests.push(r);
            }
            let toPump = numConcurrent - activeRequests;
            for (let i = 0; i < toPump; i++) {
                pump();
            }
        },
        hasPendingYields() {
            return pendingYields.length > 0;
        }
    };
}

async function testPriorityAsync() {
    async function waitRandom() {
        return new Promise(resolve => {
            setTimeout(() => resolve(null), 500 + Math.random() * 500);
        });
    }
    let tasks: PriorityRequest<number>[] = [];
    for (let i = 0; i < 50; i++) {
        tasks.push({ priority: 0, start: async () => { await waitRandom(); return i; } });
    }
    for await (let index of processConcurrentTasks(10, tasks)) {
        console.log(index);
    }
    console.log("Done!");
}

type ChannelState = {
    state: 'usingCache',
    videos: Video[],
} | {
    state: 'loaded',
    videos: Video[],
    paginationCursor: string,
} | {
    state: 'exhausted',
    videos: Video[]
};

const VOD_REQUEST_COUNT = 10;
class Channel {
    state: ChannelState = { state: 'usingCache', videos: [] };
    livestreamPlaceholder: Video|null = null;
    requestPending: boolean = false;
    unwanted: boolean = false;
    constructor(public id: string) {

    }

    addCachedVideo(video: Video) {
        if (this.state.state === 'usingCache') {
            this.state.videos.push(video);
        }
    }
    addPlaceholder(video: Video) {
        this.livestreamPlaceholder = video;
    }
    
    getVideos(): Video[] {
        if (this.unwanted) return [];
        let p = this.livestreamPlaceholder;
        let vs = this.state.videos;
        if (p != null && !vs.some(v => videosOverlap(v, p!))) {
            return [p].concat(vs);
        } else {
            return vs;
        }
    }

    setUnwanted() {
        this.unwanted = true;
    }

    couldLoadMore(): boolean {
        return !this.unwanted && this.state.state !== 'exhausted';
    }

    async requestMoreVODs() {
        if (this.requestPending) throw "Request already pending";
        if (this.state.state === 'exhausted' || this.unwanted) return;
        this.requestPending = true;
        let cursor = this.state.state === 'loaded' ? this.state.paginationCursor : undefined;
        let vods = await twitchGetUserArchiveVideos(this.id, VOD_REQUEST_COUNT, cursor);
        let oldVideos = this.state.state === 'usingCache' ? [] : this.state.videos;
        let newVideos = oldVideos.concat(vods.data.map(b => twitchBroadcastToVideo(b)));
        if (vods.pagination.cursor != null && vods.data.length === VOD_REQUEST_COUNT) {
            this.state = { state: 'loaded', videos: newVideos, paginationCursor: vods.pagination.cursor };
        } else {
            this.state = { state: 'exhausted', videos: newVideos };
        }
        this.requestPending = false;
    }
}

function videosOverlap(a: Video, b: Video): boolean {
    return a.start <= b.end && b.start <= a.end;
}

async function getLocalUserId(): Promise<string> {
    let localUserId: string;
    let storedUserId = localStorage.getItem('UserId');
    if (storedUserId == null) {
        localUserId = (await twitchUser()).data[0].id;
        localStorage.setItem('UserId', localUserId);
    } else {
        localUserId = storedUserId;
    }
    return localUserId;
}

async function initial() {
    getAuthorization();
    if (userAccessToken == null) return;

    let channels = new DefaultMap<string, Channel>(id => new Channel(id));

    let followedStreamsPromise: Promise<Map<string, TwitchStream>> = Promise.resolve(new Map());
    let cachedVideos = cachedVideosToVideos(JSON.parse(localStorage.getItem("cachedVideos") ?? "{}"));
    for (let video of cachedVideos) {
        channels.get(video.user_id).addCachedVideo(video);
    }
    renderTimelines();

    let channelVODTasks = new Map<string, PriorityRequest<void>>();
    function makeChannelVODTask(user_id: string, priority: number): PriorityRequest<void> {
        let request = {
            priority: priority,
            start: () => channels.get(user_id).requestMoreVODs(),
        };
        channelVODTasks.set(user_id, request);
        return request;
    }

    // Populate priorities from cached videos
    let priorities: {[user_id: string]: number} = {};
    for (let video of getAllVideos()) {
        priorities[video.user_id] = Math.max(priorities[video.user_id] ?? 0, video.end.valueOf());
    }

    let vodRequestQueue = processConcurrentTasks(CONCURRENT_ARCHIVE_REQUESTS, Object.entries(priorities).map(([id, priority]) =>
        makeChannelVODTask(id, priority)
    ));

    statusSpan.textContent = "Getting user id...";
    let localUserId = await getLocalUserId();

    // Don't need to await this right away
    followedStreamsPromise = (async function(): Promise<Map<string, TwitchStream>> {
        let streams = await twitchGetFollowedStreams(localUserId);
        return new Map(streams.data.map(stream => [stream.user_id, stream]));
    })();

    statusSpan.textContent = "Getting follows...";
    let follows = await twitchGetFollows(localUserId);

    // Don't need to wait for this operation
    channelIcons.requestUserIcons(new Set(follows.data.map(follow => follow.to_name)));

    // Flag channels that are no longer followed
    let actuallyInterestedIn = new Set(follows.data.map(follow => follow.to_id));
    for (let id of channels.keys()) {
        if (!actuallyInterestedIn.has(id)) {
            channels.get(id).setUnwanted();
        }
    }

    vodRequestQueue.addTasks(follows.data.filter(follow => !channelVODTasks.has(follow.to_id)).map(follow =>
        makeChannelVODTask(follow.to_id, 0)
    ));
    
    followedStreamsPromise.then(followedStreams => {
        // Bump up priority of live streams
        for (let fs of followedStreams.values()) {
            let task = channelVODTasks.get(fs.user_id);
            if (task != null) {
                task.priority = new Date().valueOf();
            }
        }

        // Insert placeholder entries for live streams (will be hidden if it overlaps with a VOD)
        for (let s of followedStreams.values()) {
            channels.get(s.user_id).addPlaceholder({
                channel: s.user_login,
                start: new Date(s.started_at),
                end: new Date(),
                game: s.game_name,
                id: STREAM_PLACEHOLDER_ID,
                stream_id: s.id,
                title: s.title,
                user_id: s.user_id,
            });
        }
    });

    function getAllVideos() {
        return Array.from(channels.values()).flatMap(channel => channel.getVideos());
    }

    function renderTimelines() {
        let allSegments = getSegments(getAllVideos());
        layoutToHTML(layoutSegments(allSegments), followedStreamsPromise);
    }

    async function processRequestQueue(numChannels: number, queue: typeof vodRequestQueue) {
        let numChannelLoaded = 0;
        statusSpan.textContent = `Getting video archives (0/${numChannels})...`;
    
        let firstRender = true;
        let lastRender = performance.now();
        for await (let _ of queue) {
            numChannelLoaded += 1;
            if  (performance.now() - lastRender > 500 || firstRender && !queue.hasPendingYields()) {
                statusSpan.textContent = `Getting video archives (${numChannelLoaded}/${numChannels})...`;
                renderTimelines();
                lastRender = performance.now();
                firstRender = false;
            }
        }
        statusSpan.textContent = "Rendering...";
    }

    await processRequestQueue(follows.data.length, vodRequestQueue);

    await followedStreamsPromise;

    let cachedStr = JSON.stringify(videosToCachedVideos(getAllVideos()));
    if (cachedStr.length > 2e6) {
        cachedStr = '{}';
    }
    try {
        localStorage.setItem('cachedVideos', cachedStr);
    } finally {}

    (window as any).channels = channels;

    while (true) {
        renderTimelines();
        statusSpan.textContent = "";

        let tasks = Array.from(channels.values()).filter(channel => channel.couldLoadMore()).map(channel => ({
            priority: 0,
            start: () => channel.requestMoreVODs(),
        }));
        if (tasks.length === 0) break;

        wantLoadMore = new Pending();
        loadMoreButton.style.display = "";
        await wantLoadMore.promise;
        wantLoadMore = null;
        loadMoreButton.style.display = "none";

        console.log(`Loading more videos from ${tasks.length} channels.`);
        await processRequestQueue(tasks.length, processConcurrentTasks(CONCURRENT_ARCHIVE_REQUESTS, tasks));
    }
}

function LoadMore() {
    if (wantLoadMore != null) {
        wantLoadMore.resolve();
    }
}

interface CachedVideos {
    // [channelName,channelId]: [videoTitle, videoId, start, duration][]
    [channelInfo: string]: [string, string, string, number][];
}
function videosToCachedVideos(videos: Video[]): CachedVideos {
    let cached: CachedVideos = {};
    for (let video of videos) {
        let key = video.channel + "," + video.user_id;
        if (!(key in cached)) {
            cached[key] = [];   
        }
        let duration = Math.floor((video.end.getTime() - video.start.getTime()) / 1000);
        cached[key].push([video.title, video.id, video.start.toString(), duration]);
    }
    return cached;
}
function cachedVideosToVideos(cached: CachedVideos) {
    let videos: Video[] = [];
    for (let channelKey of Object.keys(cached)) {
        let i = channelKey.lastIndexOf(",");
        let channelName = channelKey.substring(0, i);
        let channelId = channelKey.substring(i + 1);
        for (let [title, id, startStr, duration] of cached[channelKey]) {
            let start = new Date(startStr);
            videos.push({
                title,
                start,
                end: new Date(start.getTime() + duration * 1000),
                id,
                channel: channelName,
                user_id: channelId,
                game: "",
                stream_id: null,
            });
        }
    }
    return videos;
}

initial().catch(reason => {
    statusSpan.textContent = "oh no: " + reason;
});
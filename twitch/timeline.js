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
var wantLoadMore = null;
class DefaultMap extends Map {
    ctor;
    constructor(ctor) {
        super();
        this.ctor = ctor;
    }
    get(key) {
        let v = super.get(key);
        if (v == null) {
            v = this.ctor(key);
            this.set(key, v);
        }
        return v;
    }
}
class Pending {
    promise;
    resolve;
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
        });
    }
}
class ChannelIcons {
    seenUserNames = new Set();
    map = new DefaultMap(name => new Pending());
    getIcon(channelName) {
        return this.map.get(channelName).promise;
    }
    async requestUserIcons(userNames) {
        let newUserNames = userNames.difference(this.seenUserNames);
        this.seenUserNames = this.seenUserNames.union(userNames);
        if (newUserNames.size > 0) {
            let users = await twitchGetUsers(Array.from(newUserNames));
            this.addUsers(users.data);
        }
    }
    addUsers(users) {
        for (let user of users) {
            this.seenUserNames.add(user.login);
            this.registerIcon(user.login, user.profile_image_url);
        }
    }
    registerIcon(channelName, url) {
        if (url != null) {
            this.map.get(channelName).resolve(url.replace(/\d{2,}x\d{2,}\./, "70x70."));
        }
        else {
            this.map.get(channelName).resolve(null);
        }
    }
}
let channelIcons = new ChannelIcons();
function eqDay(a, b) {
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function ltDay(a, b) {
    if (a.getFullYear() === b.getFullYear()) {
        if (a.getMonth() === b.getMonth()) {
            return a.getDate() < b.getDate();
        }
        else {
            return a.getMonth() < b.getMonth();
        }
    }
    else {
        return a.getFullYear() < b.getFullYear();
    }
}
function incDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function firstSecondOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function lastSecondOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, -1);
}
function hoursInDay(d) {
    return Math.round((lastSecondOfDay(d).getTime() - firstSecondOfDay(d).getTime()) / 1000 / 3600);
}
function splitIntoDaySegments(start, end) {
    var spans = [];
    // Only one span
    if (eqDay(start, end)) {
        spans.push({
            start: start,
            end: end,
        });
    }
    else {
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
function last(arr) {
    return arr[arr.length - 1];
}
function getSegments(videos) {
    let segments = [];
    for (let video of videos) {
        for (let span of splitIntoDaySegments(video.start, video.end)) {
            segments.push({ span, video });
        }
    }
    return segments;
}
function* flatten(tss) {
    for (let ts of tss) {
        for (let t of ts) {
            yield t;
        }
    }
}
function groupBy(ts, pred) {
    let groups = [];
    let group = [];
    for (let t of ts) {
        if (group.length === 0 || pred(group[0], t)) {
            group.push(t);
        }
        else {
            groups.push(group);
            group = [t];
        }
    }
    if (group.length > 0) {
        groups.push(group);
    }
    return groups;
}
function groupByValue(ts, f) {
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
function subDate(a, b) {
    return a - b;
}
/// [Segment] => [[[Segment]]]
function layoutSegments(segments) {
    console.log("segments", segments);
    return groupBy(segments.slice().sort((a, b) => subDate(a.span.start, b.span.start)), (a, b) => eqDay(a.span.start, b.span.start))
        .map(group => {
        let channels = groupByValue(group, segment => segment.video.channel);
        return Array.from(channels.keys()).sort().map(channel => channels.get(channel));
    });
}
function layoutToHTML(segmentsLayout, liveStreams) {
    console.log(segmentsLayout);
    function mk(tag, attrs = {}, children = []) {
        let elem = document.createElement(tag);
        for (let attrname in attrs) {
            elem.setAttribute(attrname, attrs[attrname]);
        }
        for (let child of children) {
            elem.appendChild(child);
        }
        return elem;
    }
    function text(s) {
        return document.createTextNode(s);
    }
    function listen(el, eventMap) {
        for (let name in eventMap) {
            el.addEventListener(name, eventMap[name]);
        }
        return el;
    }
    function prependChild(parent, node) {
        if (parent.childNodes.length === 0) {
            parent.appendChild(node);
        }
        else {
            parent.insertBefore(node, parent.childNodes[0]);
        }
    }
    function dateToString(date) {
        return "" +
            ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][date.getDay()] +
            " " +
            ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][date.getMonth()] +
            " " +
            date.getDate() + ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th"][date.getDate() <= 13 ? date.getDate() : date.getDate() % 10] +
            ", " + date.getFullYear();
        // return date.toDateString();
    }
    function makeGridLines(hours) {
        let r = [];
        for (let i = 1; i < hours; i++) {
            r.push(mk('div', {
                class: `timeline-gridline ${(hours - i) % 6 === 0 ? "major" : ""}`,
                style: `left: ${(i / hours * 100)}%`,
            }));
        }
        return r;
    }
    function makeTimeArgument(millis) {
        if (millis <= 0)
            return "";
        let seconds = Math.floor(millis / 1000);
        var hours = Math.floor(seconds / (60 * 60));
        seconds -= hours * 60 * 60;
        var minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
        var timeStr = seconds + "s";
        if (minutes > 0)
            timeStr = minutes + "m" + timeStr;
        if (hours > 0)
            timeStr = hours + "h" + timeStr;
        return "?t=" + timeStr;
    }
    function makeSegmentDiv(segment) {
        let { span, video } = segment;
        var firstSecond = firstSecondOfDay(span.start);
        var lastSecond = lastSecondOfDay(span.start);
        var dayLength = subDate(lastSecond, firstSecond);
        var left = (subDate(span.start, firstSecond) / dayLength * 100).toFixed(2) + "%";
        var right = (subDate(lastSecond, span.end) / dayLength * 100).toFixed(2) + "%";
        let url;
        if (video.id === STREAM_PLACEHOLDER_ID) {
            url = "https://twitch.tv/" + video.channel;
        }
        else {
            url = "https://twitch.tv/videos/" + video.id + makeTimeArgument(subDate(span.start, video.start));
        }
        var spanDiv = mk("a", {
            class: "timeline-span" + (video.id === STREAM_PLACEHOLDER_ID ? " placeholder" : ""),
            title: video.title + "\n" + video.game,
            href: url,
            style: `left: ${left}; right: ${right}`,
        }, [
            mk('span', { class: "timeline-span-text" }, [text(video.title)])
        ]);
        channelIcons.getIcon(video.channel).then(imgSrc => {
            if (imgSrc != null) {
                prependChild(spanDiv, mk("img", { src: imgSrc }));
            }
        });
        return spanDiv;
    }
    function makeNowDiv(channel, userId) {
        let now = new Date();
        var firstSecond = firstSecondOfDay(now);
        var lastSecond = lastSecondOfDay(now);
        var dayLength = subDate(lastSecond, firstSecond);
        var left = (subDate(now, firstSecond) / dayLength * 100).toFixed(2) + "%";
        let liveLink = mk('a', { class: "stream-link", href: "https://twitch.tv/" + channel, title: "Offline" }, [text("0")]);
        liveStreams.then(streams => {
            let s = streams.get(userId);
            if (s != null) {
                liveLink.classList.add("live");
                liveLink.textContent = s.viewer_count + "";
                liveLink.title = s.title + "\n" + s.game_name;
            }
        });
        return mk('div', { class: "now-indicator", style: `left: ${left};` }, [
            liveLink
        ]);
    }
    function makeTimelineDiv(channel) {
        let channelName = channel[0].video.channel;
        let channelId = channel[0].video.user_id;
        return mk('div', { class: "channel-timeline" }, [
            mk('div', { class: "channel-name" }, [text(channelName)]),
            mk('div', { class: "timeline" }, flatten([
                eqDay(channel[0].span.start, new Date()) ? [makeNowDiv(channelName, channelId)] : [],
                channel.map(segment => makeSegmentDiv(segment))
            ]))
        ]);
    }
    function makeDayDiv(channels) {
        let day = channels[0][0].span.start;
        return mk('div', { class: "timeline-container" }, flatten([
            [mk('div', { class: "timeline-grid-container" }, makeGridLines(hoursInDay(channels[0][0].span.start)))],
            [mk('div', { class: "timeline-date-title" }, [text(dateToString(day))])],
            channels.map(channel => makeTimelineDiv(channel))
        ]));
    }
    timelines.innerHTML = '';
    for (let day of segmentsLayout.slice().reverse()) {
        timelines.appendChild(makeDayDiv(day));
    }
    window.layout = segmentsLayout;
}
let userAccessToken = undefined;
function stripUndefined(obj) {
    let stripped = {};
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
let ratelimitShowCounter = 0;
function setRatelimitWarningVisible(b) {
    ratelimitShowCounter += b ? 1 : -1;
    ratelimitWarning.style.display = ratelimitShowCounter > 0 ? 'inline-block' : 'none';
}
async function fetchTwitch(url) {
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
    if (response.status === 429) {
        // Rate limit reached, wait and try again
        setRatelimitWarningVisible(true);
        let waitForMillis = 60_000; // Default to one minute
        let resetTimeUnix = response.headers.get("ratelimit-reset");
        if (resetTimeUnix != null) {
            // Wait until 1 second after the reset time
            waitForMillis = 1_000 + parseInt(resetTimeUnix) * 1_000 - (new Date()).valueOf();
        }
        await new Promise(resolve => setTimeout(resolve, waitForMillis));
        setRatelimitWarningVisible(false);
        return await fetchTwitch(url);
    }
    return await response.json();
}
function* chunks(ts, chunkSize) {
    for (let i = 0; i < ts.length; i += chunkSize) {
        yield ts.slice(i, i + chunkSize);
    }
}
async function twitchGetAllByLogin(api, allUserNames) {
    let requests = Array
        .from(chunks(allUserNames, 10))
        .map(userNames => api(userNames));
    let results = await Promise.all(requests);
    return { data: results.flatMap(r => r.data) };
}
// TS doesn't enforce the existence of the cursor parameter well
async function twitchGetAllPaginated(api) {
    let results = [];
    let cursor = undefined;
    do {
        let result = await api(cursor);
        results.push(result);
        cursor = result.pagination.cursor;
    } while (cursor != null);
    return { data: results.flatMap(r => r.data) };
}
function twitchGetUser() {
    // Gets user by bearer token. Used to get the user's id for other queries.
    return fetchTwitch(`https://api.twitch.tv/helix/users`);
}
function twitchGetUsersLimit100(userNames) {
    return fetchTwitch(`https://api.twitch.tv/helix/users?login=${userNames.join('&login=')}`);
}
function twitchGetUsers(userNames) {
    return twitchGetAllByLogin(twitchGetUsersLimit100, userNames);
}
function twitchGet100FollowedStreams(userId, cursor) {
    return fetchTwitch(`https://api.twitch.tv/helix/streams/followed?user_id=${userId}&first=100${cursor != null ? "&after=" + cursor : ''}`);
}
function twitchGetFollowedStreams(userId) {
    return twitchGetAllPaginated(cursor => twitchGet100FollowedStreams(userId, cursor));
}
function twitchGetStreamsLimit100(userLogins) {
    return fetchTwitch(`https://api.twitch.tv/helix/streams?user_login=${userLogins.join("&user_login=")}`);
}
function twitchGetStreams(userNames) {
    return twitchGetAllByLogin(twitchGetStreamsLimit100, userNames);
}
function twitchGet100Follows(fromId, cursor) {
    return fetchTwitch(`https://api.twitch.tv/helix/channels/followed?user_id=${fromId}&first=100${cursor != null ? "&after=" + cursor : ''}`);
}
async function twitchGetFollows(fromId) {
    return twitchGetAllPaginated(cursor => twitchGet100Follows(fromId, cursor));
}
function twitchGetUserArchiveVideos(userId, count = 10, after_cursor) {
    let pagination = after_cursor != null ? `&after=${after_cursor}` : '';
    return fetchTwitch(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=${count}&type=archive${pagination}`);
}
const DURATION_REGEX = /^(?:(\d+)d)?(?:(\d+)+h)?(?:(\d+)+m)?(?:(\d+)s)?$/;
const DURATION_MILLIS = [24 * 60 * 60 * 1000, 60 * 60 * 1000, 60 * 1000, 1000];
function apiDurationToMilliseconds(duration) {
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
function twitchBroadcastToVideo(broadcast) {
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
function getAuthorization() {
    // Checks if we've been redirected back from an authorization request
    let m = window.location.hash.match(/^#access_token=(\w+)/);
    if (m == null) {
        let storedToken = window.localStorage.getItem("UserAccessToken");
        if (storedToken != null) {
            userAccessToken = storedToken;
        }
    }
    else {
        userAccessToken = m[1];
        window.localStorage.clear();
        window.localStorage.setItem("UserAccessToken", userAccessToken);
        window.history.replaceState(undefined, document.title, window.location.pathname + window.location.search);
    }
    if (userAccessToken != null) {
        authlink.style.display = "none";
    }
    else {
        authlink.style.display = '';
    }
    statusSpan.textContent = "";
}
class PriorityRequest {
    priority;
    start;
}
function processConcurrentTasks(numConcurrent, requests) {
    let activeRequests = 0;
    let pendingYields = [];
    let notify = (_whatever) => { };
    let monitor = undefined;
    function removeHighestPriority() {
        if (requests.length === 0)
            return undefined;
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
        [Symbol.asyncIterator]() {
            return {
                async next(arg) {
                    while (pendingYields.length === 0 && activeRequests > 0) {
                        if (monitor == null) {
                            monitor = new Promise(resolve => notify = resolve);
                        }
                        await monitor;
                    }
                    if (pendingYields.length === 0 && activeRequests === 0) {
                        return { done: true, value: undefined };
                    }
                    else {
                        return {
                            value: pendingYields.shift(),
                            done: false,
                        };
                    }
                }
            };
        },
        addTasks(toAdd) {
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
    let tasks = [];
    for (let i = 0; i < 50; i++) {
        tasks.push({ priority: 0, start: async () => { await waitRandom(); return i; } });
    }
    for await (let index of processConcurrentTasks(10, tasks)) {
        console.log(index);
    }
    console.log("Done!");
}
const VOD_REQUEST_COUNT = 10;
class Channel {
    id;
    state = { state: 'usingCache', videos: [] };
    livestreamPlaceholder = null;
    requestPending = false;
    unwanted = false;
    constructor(id) {
        this.id = id;
    }
    addCachedVideo(video) {
        if (this.state.state === 'usingCache') {
            this.state.videos.push(video);
        }
    }
    addPlaceholder(video) {
        this.livestreamPlaceholder = video;
    }
    getVideos() {
        if (this.unwanted)
            return [];
        let p = this.livestreamPlaceholder;
        let vs = this.state.videos;
        if (p != null && !vs.some(v => videosOverlap(v, p))) {
            return [p].concat(vs);
        }
        else {
            return vs;
        }
    }
    setUnwanted() {
        this.unwanted = true;
    }
    couldLoadMore() {
        return !this.unwanted && this.state.state !== 'exhausted';
    }
    async requestMoreVODs() {
        if (this.requestPending)
            throw "Request already pending";
        if (this.state.state === 'exhausted' || this.unwanted)
            return;
        this.requestPending = true;
        let cursor = this.state.state === 'loaded' ? this.state.paginationCursor : undefined;
        let vods = await twitchGetUserArchiveVideos(this.id, VOD_REQUEST_COUNT, cursor);
        let oldVideos = this.state.state === 'usingCache' ? [] : this.state.videos;
        let newVideos = oldVideos.concat(vods.data.map(b => twitchBroadcastToVideo(b)));
        if (vods.pagination.cursor != null && vods.data.length === VOD_REQUEST_COUNT) {
            this.state = { state: 'loaded', videos: newVideos, paginationCursor: vods.pagination.cursor };
        }
        else {
            this.state = { state: 'exhausted', videos: newVideos };
        }
        this.requestPending = false;
    }
}
function videosOverlap(a, b) {
    return a.start <= b.end && b.start <= a.end;
}
async function getLocalUserId() {
    let localUserId;
    let storedUserId = localStorage.getItem('UserId');
    if (storedUserId == null) {
        localUserId = (await twitchGetUser()).data[0].id;
        localStorage.setItem('UserId', localUserId);
    }
    else {
        localUserId = storedUserId;
    }
    return localUserId;
}
function getInterestedChannels() {
    let m = location.search.match(/\?channels=(\S+)$/);
    if (m != null) {
        return m[1].split(",");
    }
    return "follows";
}
async function initial() {
    getAuthorization();
    if (userAccessToken == null)
        return;
    let interestedChannels = getInterestedChannels();
    let channels = new DefaultMap(id => new Channel(id));
    // This needs to be defined early for the initial cached render
    let streamsPromise = Promise.resolve(new Map());
    let cachedVideos = cachedVideosToVideos(JSON.parse(localStorage.getItem("cachedVideos") ?? "{}"));
    for (let video of cachedVideos) {
        channels.get(video.user_id).addCachedVideo(video);
    }
    renderTimelines();
    let channelVODTasks = new Map();
    function makeChannelVODTask(user_id, priority) {
        let request = {
            priority: priority,
            start: () => channels.get(user_id).requestMoreVODs(),
        };
        channelVODTasks.set(user_id, request);
        return request;
    }
    // Populate priorities from cached videos
    let priorities = {};
    for (let video of getAllVideos()) {
        priorities[video.user_id] = Math.max(priorities[video.user_id] ?? 0, video.end.valueOf());
    }
    let vodRequestQueue = processConcurrentTasks(CONCURRENT_ARCHIVE_REQUESTS, Object.entries(priorities).map(([id, priority]) => makeChannelVODTask(id, priority)));
    let { streamsQuery, users } = await (async () => {
        if (interestedChannels === "follows") {
            statusSpan.textContent = "Getting user id...";
            let localUserId = await getLocalUserId();
            let streamsQuery = twitchGetFollowedStreams(localUserId); // Not awaited
            statusSpan.textContent = "Getting follows...";
            let follows = await twitchGetFollows(localUserId);
            channelIcons.requestUserIcons(new Set(follows.data.map(follow => follow.broadcaster_login))); // Not awaited
            return {
                streamsQuery,
                users: follows.data.map(follow => ({ id: follow.broadcaster_id, login: follow.broadcaster_login }))
            };
        }
        else {
            let streamsQuery = twitchGetStreams(interestedChannels); // Not awaited
            statusSpan.textContent = "Getting users...";
            let users = await twitchGetUsers(interestedChannels);
            channelIcons.addUsers(users.data);
            return {
                streamsQuery,
                users: users.data
            };
        }
    })();
    streamsPromise = streamsQuery.then(streams => new Map(streams.data.map(stream => [stream.user_id, stream])));
    // Flag channels that were cached but now aren't requested
    let actuallyInterestedIn = new Set(users.map(user => user.id));
    for (let id of channels.keys()) {
        if (!actuallyInterestedIn.has(id)) {
            channels.get(id).setUnwanted();
        }
    }
    vodRequestQueue.addTasks(users.filter(user => !channelVODTasks.has(user.id)).map(user => makeChannelVODTask(user.id, 0)));
    streamsPromise.then(streams => {
        // Bump up priority of live streams
        for (let fs of streams.values()) {
            let task = channelVODTasks.get(fs.user_id);
            if (task != null) {
                task.priority = new Date().valueOf();
            }
        }
        // Insert placeholder entries for live streams (will be hidden if it overlaps with a VOD)
        for (let s of streams.values()) {
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
        layoutToHTML(layoutSegments(allSegments), streamsPromise);
    }
    async function processRequestQueue(numChannels, queue) {
        let numChannelLoaded = 0;
        statusSpan.textContent = `Getting video archives (0/${numChannels})...`;
        let firstRender = true;
        let lastRender = performance.now();
        for await (let _ of queue) {
            numChannelLoaded += 1;
            if (performance.now() - lastRender > 500 || firstRender && !queue.hasPendingYields()) {
                statusSpan.textContent = `Getting video archives (${numChannelLoaded}/${numChannels})...`;
                renderTimelines();
                lastRender = performance.now();
                firstRender = false;
            }
        }
        statusSpan.textContent = "Rendering...";
    }
    await processRequestQueue(users.length, vodRequestQueue);
    await streamsPromise;
    let cachedStr = JSON.stringify(videosToCachedVideos(getAllVideos()));
    if (cachedStr.length > 2e6) {
        cachedStr = '{}';
    }
    try {
        localStorage.setItem('cachedVideos', cachedStr);
    }
    finally { }
    window.channels = channels;
    while (true) {
        renderTimelines();
        statusSpan.textContent = "";
        let tasks = Array.from(channels.values()).filter(channel => channel.couldLoadMore()).map(channel => ({
            priority: 0,
            start: () => channel.requestMoreVODs(),
        }));
        if (tasks.length === 0)
            break;
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
    wantLoadMore?.resolve();
}
function videosToCachedVideos(videos) {
    let cached = {};
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
function cachedVideosToVideos(cached) {
    let videos = [];
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
//# sourceMappingURL=timeline.js.map
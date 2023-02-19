/*
TODO:
    Actually use cursors to load more if desired.
        (Keep track of whose oldest loaded vod is most recent, and start with them)
    For each channel, show the region prior to that channel's earliest known vod as unknown (white?)
        To make it clear that just because one might exist earlier on another channel doesn't mean there can't be a vod there on the first.
*/
const CONCURRENT_ARCHIVE_REQUESTS = 20;
let here = window.location.href.startsWith("http://localhost") ? "http://localhost:1666/timeline.html" : "https://stoofin.github.io/twitch/timeline.html";
var clientId = "wvea6zmii7cgnnjo10chrqocxd4fln";
authlink.href = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${here}&response_type=token&scope=user:read:follows`;
class Pending {
    promise;
    resolve;
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
        });
    }
}
let channelIcons = new Map();
function getChannelIcon(channelName) {
    let c = channelIcons.get(channelName);
    if (c == null) {
        c = new Pending();
        channelIcons.set(channelName, c);
    }
    return c;
}
function registerChannelIcon(channelName, url) {
    if (url != null) {
        getChannelIcon(channelName).resolve(url.replace(/\d{2,}x\d{2,}\./, "70x70."));
    }
    else {
        getChannelIcon(channelName).resolve(null);
    }
}
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
        if (video.id === "placeholder") {
            url = "https://twitch.tv/" + video.channel;
        }
        else {
            url = "https://twitch.tv/videos/" + video.id + makeTimeArgument(subDate(span.start, video.start));
        }
        var spanDiv = mk("a", {
            class: "timeline-span" + (video.id === "placeholder" ? " placeholder" : ""),
            title: video.title + "\n" + video.game,
            href: url,
            style: `left: ${left}; right: ${right}`,
        }, [
            mk('span', { class: "timeline-span-text" }, [text(video.title)])
        ]);
        getChannelIcon(video.channel).promise.then(imgSrc => {
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
    function isToday(d) {
        return eqDay(d, new Date());
    }
    function makeTimelineDiv(channelName, channelId, segments, today) {
        return mk('div', { class: "channel-timeline" }, [
            mk('div', { class: "channel-name" }, [text(channelName)]),
            mk('div', { class: "timeline" }, flatten([
                makeGridLines(),
                today ? [makeNowDiv(channelName, channelId)] : [],
                segments.map(segment => makeSegmentDiv(segment))
            ]))
        ]);
    }
    function makeDayDiv(day, channels) {
        let today = isToday(day);
        let channelMap = new Map(channels.map(c => [
            c[0].video.user_id,
            { name: c[0].video.channel, id: c[0].video.user_id, segments: c }
        ]));
        function innerMakeTimeline() {
            let a = Array.from(channelMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            return mk('div', { class: "timeline-container" }, flatten([
                [mk('div', { class: "timeline-date-title" }, [text(dateToString(day))])],
                a.map(c => makeTimelineDiv(c.name, c.id, c.segments, today))
            ]));
        }
        let container = innerMakeTimeline();
        if (today) {
            liveStreams.then(streams => {
                // Rebuild with live but no-vod channels
                let shouldRebuild = false;
                for (let s of streams.values()) {
                    if (!channelMap.has(s.user_id)) {
                        shouldRebuild = true;
                        let startDate = new Date(s.started_at);
                        channelMap.set(s.user_id, { name: s.user_login, id: s.user_id, segments: [{
                                    span: last(splitIntoDaySegments(startDate, new Date())),
                                    video: {
                                        channel: s.user_login,
                                        start: startDate,
                                        end: new Date(),
                                        game: s.game_name,
                                        id: "placeholder",
                                        stream_id: s.id,
                                        title: s.title,
                                        user_id: s.user_id,
                                    }
                                }] });
                    }
                }
                if (shouldRebuild) {
                    container.parentElement?.replaceChild(innerMakeTimeline(), container);
                }
            });
        }
        return container;
    }
    timelines.innerHTML = '';
    {
        let toLayout = segmentsLayout.slice().reverse();
        if (!isToday(toLayout[0][0][0].span.start)) {
            timelines.appendChild(makeDayDiv(new Date(), []));
        }
        for (let dayLayout of toLayout) {
            timelines.appendChild(makeDayDiv(dayLayout[0][0].span.start, dayLayout));
        }
    }
    window.layout = segmentsLayout;
}
let userAccessToken = undefined;
let localUser = undefined;
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
    authlink.style.visibility = "visible";
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
    return await response.json();
}
function twitchUser() {
    // Gets user by bearer token. Used to get the user's id for other queries.
    return fetchTwitch(`https://api.twitch.tv/helix/users`);
}
function twitchUsers(userNames) {
    return fetchTwitch(`https://api.twitch.tv/helix/users?login=${userNames.join('&login=')}`);
}
function twitchGetFollowedStreams(userId) {
    return fetchTwitch(`https://api.twitch.tv/helix/streams/followed?user_id=${userId}`);
}
function twitchGetFollows(fromId) {
    return fetchTwitch(`https://api.twitch.tv/helix/users/follows?from_id=${fromId}&first=100`);
}
function twitchGetUserArchiveVideos(userId, after_cursor) {
    let pagination = after_cursor != null ? `&after=${after_cursor}` : '';
    return fetchTwitch(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=10&type=archive${pagination}`);
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
        game: broadcast.description,
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
        window.localStorage.setItem("UserAccessToken", userAccessToken);
        window.history.replaceState(undefined, document.title, window.location.pathname + window.location.search);
    }
    if (userAccessToken != null) {
        authlink.style.visibility = "hidden";
    }
    else {
        authlink.style.visibility = "visibile";
    }
    statusSpan.textContent = "";
}
function setDiff(a, b) {
    let r = new Set();
    for (let v of a) {
        if (!b.has(v)) {
            r.add(v);
        }
    }
    return r;
}
function setUnion(a, b) {
    let r = new Set();
    for (let v of a) {
        r.add(v);
    }
    for (let v of b) {
        r.add(v);
    }
    return r;
}
let seenUserNames = new Set();
async function loadUserIcons(userNames) {
    let newUserNames = setDiff(userNames, seenUserNames);
    seenUserNames = setUnion(seenUserNames, userNames);
    if (newUserNames.size > 0) {
        let users = await twitchUsers(Array.from(newUserNames));
        for (let user of users.data) {
            registerChannelIcon(user.login, user.profile_image_url);
        }
    }
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
async function initial() {
    // await testPriorityAsync();
    // return;
    getAuthorization();
    if (userAccessToken == null)
        return;
    let channelVODTasks = new Map();
    function makeChannelVODTask(user_id, priority) {
        let request = {
            priority: priority,
            start: () => twitchGetUserArchiveVideos(user_id),
        };
        channelVODTasks.set(user_id, request);
        return request;
    }
    let priorities = JSON.parse(localStorage.getItem('channelPriorities') ?? '{}');
    let vodRequestQueue = processConcurrentTasks(CONCURRENT_ARCHIVE_REQUESTS, Object.entries(priorities).map(([id, priority]) => makeChannelVODTask(id, priority)));
    statusSpan.textContent = "Getting user id...";
    localUser = (await twitchUser()).data[0];
    async function liveStreams() {
        let m = new Map();
        if (localUser == null)
            return m;
        let streams = await twitchGetFollowedStreams(localUser.id);
        for (let stream of streams.data) {
            m.set(stream.user_id, stream);
        }
        return m;
    }
    let followedStreamsPromise = liveStreams();
    statusSpan.textContent = "Getting follows...";
    let follows = await twitchGetFollows(localUser.id);
    // Don't need to wait for this operation
    loadUserIcons(new Set(follows.data.map(follow => follow.to_name)));
    let numChannels = follows.data.length;
    let numChannelLoaded = 0;
    statusSpan.textContent = `Getting video archives (0/${numChannels})...`;
    let firstRender = true;
    let lastRender = performance.now();
    let allVideos = [];
    let actuallyInterestedIn = new Set(follows.data.map(follow => follow.to_id));
    let videoRequestTasks = follows.data.filter(follow => !channelVODTasks.has(follow.to_id)).map(follow => makeChannelVODTask(follow.to_id, priorities[follow.to_id] ?? 0));
    vodRequestQueue.addTasks(videoRequestTasks);
    let newPriorities = {};
    followedStreamsPromise.then(followedStreams => {
        // Bump up priority of live streams
        for (let fs of followedStreams.values()) {
            let task = channelVODTasks.get(fs.user_id);
            if (task != null) {
                task.priority = new Date().valueOf();
            }
        }
    });
    outer: for await (let vids of vodRequestQueue) {
        numChannelLoaded += 1;
        for (let broadcast of vids.data) {
            if (!actuallyInterestedIn.has(broadcast.user_id)) {
                continue outer;
            }
            let video = twitchBroadcastToVideo(broadcast);
            allVideos.push(video);
            newPriorities[broadcast.user_id] = Math.max(newPriorities[broadcast.user_id] ?? 0, video.end.valueOf());
            if (performance.now() - lastRender > 500 || firstRender && !vodRequestQueue.hasPendingYields()) {
                statusSpan.textContent = `Getting video archives (${numChannelLoaded}/${numChannels})...`;
                layoutToHTML(layoutSegments(getSegments(allVideos)), followedStreamsPromise);
                lastRender = performance.now();
                firstRender = false;
            }
        }
    }
    try {
        localStorage.setItem('channelPriorities', JSON.stringify(newPriorities));
    }
    finally { }
    statusSpan.textContent = "Rendering...";
    layoutToHTML(layoutSegments(getSegments(allVideos)), followedStreamsPromise);
    statusSpan.textContent = "";
}
initial().catch(reason => {
    statusSpan.textContent = "oh no: " + reason;
});
//# sourceMappingURL=timeline.js.map
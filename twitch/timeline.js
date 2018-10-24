var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let here = window.location.protocol === "file:" ? "http://localhost" : "https://stoofin.github.io/twitch/timeline.html";
var clientId = "wvea6zmii7cgnnjo10chrqocxd4fln";
authlink.href = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${here}&response_type=token&scope=`;
class Pending {
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
function layoutToHTML(segmentsLayout) {
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
        var spanDiv = mk("a", {
            class: "timeline-span",
            title: video.title + "\n" + video.game,
            href: "https://twitch.tv/videos/" + video.id + makeTimeArgument(subDate(span.start, video.start)),
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
    let nowStreams = [];
    function makeNowDiv(channel, userId) {
        let now = new Date();
        var firstSecond = firstSecondOfDay(now);
        var lastSecond = lastSecondOfDay(now);
        var dayLength = subDate(lastSecond, firstSecond);
        var left = (subDate(now, firstSecond) / dayLength * 100).toFixed(2) + "%";
        let liveLink = mk('a', { class: "stream-link", href: "https://twitch.tv/" + channel, title: "Offline" }, [text("0")]);
        nowStreams.push({
            userId,
            onStream(s, gameName) {
                liveLink.classList.add("live");
                liveLink.textContent = s.viewers + "";
                liveLink.title = s.channel.status + "\n" + gameName;
            },
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
                makeGridLines(),
                eqDay(channel[0].span.start, new Date()) ? [makeNowDiv(channelName, channelId)] : [],
                channel.map(segment => makeSegmentDiv(segment))
            ]))
        ]);
    }
    function makeDayDiv(channels) {
        let day = channels[0][0].span.start;
        return mk('div', { class: "timeline-container" }, flatten([
            [mk('div', { class: "timeline-date-title" }, [text(dateToString(day))])],
            channels.map(channel => makeTimelineDiv(channel))
        ]));
    }
    timelines.innerHTML = '';
    for (let day of segmentsLayout.slice().reverse()) {
        timelines.appendChild(makeDayDiv(day));
    }
    function getLiveInfo(queries) {
        return __awaiter(this, void 0, void 0, function* () {
            let streams = yield twitchGetStreams(queries.map(query => query.userId));
            for (let stream of streams.streams) {
                for (let query of queries) {
                    if (stream.channel._id + "" === query.userId) {
                        query.onStream(stream, stream.game);
                    }
                }
            }
        });
    }
    getLiveInfo(nowStreams);
    window.layout = segmentsLayout;
}
let oauthToken = undefined;
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
function fetchTwitch(url) {
    return __awaiter(this, void 0, void 0, function* () {
        // Because of the custom header this request will be preflighted
        // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#Simple_requests
        let response = yield fetch(url, {
            headers: stripUndefined({
                "Accept": "application/vnd.twitchtv.v5+json",
                "Client-ID": clientId,
                "Authorization": oauthToken,
            }),
            method: "GET",
        });
        return yield response.json();
    });
}
function twitchUsers(userNames) {
    return fetchTwitch(`https://api.twitch.tv/kraken/users?login=${userNames.join(',')}`);
}
// Numerical user ids => streams
function twitchGetStreams(userIds) {
    return fetchTwitch(`https://api.twitch.tv/kraken/streams/?channel=${userIds.join(',')}&stream_type=live`);
}
function followVideos(offset, limit) {
    return __awaiter(this, void 0, void 0, function* () {
        return fetchTwitch(`https://api.twitch.tv/kraken/videos/followed?offset=${offset}&limit=${limit}&broadcast_type=archive&sort=time`);
    });
}
function twitchBroadcastsToVideos(broadcasts) {
    return broadcasts.map(broadcast => {
        var start = new Date(broadcast.created_at);
        var end = new Date(start.getTime() + broadcast.length * 1000);
        return {
            title: broadcast.title,
            start: start,
            end: end,
            id: broadcast._id.substr(1),
            channel: broadcast.channel.name,
            user_id: broadcast.channel._id + "",
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
    }
    else {
        oauthToken = "OAuth " + m[1];
        window.localStorage.setItem("Token", oauthToken);
        window.history.replaceState(undefined, document.title, window.location.pathname + window.location.search);
    }
    if (oauthToken != null) {
        authlink.textContent = "Reauthorize";
        loadMoreButton.classList.remove("hidden");
    }
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
function loadUserIcons(userNames) {
    return __awaiter(this, void 0, void 0, function* () {
        let newUserNames = setDiff(userNames, seenUserNames);
        seenUserNames = setUnion(seenUserNames, userNames);
        if (newUserNames.size > 0) {
            let users = yield twitchUsers(Array.from(newUserNames));
            for (let user of users.users) {
                registerChannelIcon(user.name, user.logo);
            }
        }
    });
}
let loadedVideos = [];
let offset = 0;
function loadMore(n) {
    return __awaiter(this, void 0, void 0, function* () {
        if (oauthToken == null)
            return;
        let videosPromise = followVideos(offset, n);
        offset += n;
        let videos = yield videosPromise;
        if (videos.videos.length === 0) {
            loadMoreButton.style.display = 'none';
            return;
        }
        loadUserIcons(new Set(videos.videos.map(v => v.channel.name)));
        loadedVideos = loadedVideos.concat(videos.videos);
        layoutToHTML(layoutSegments(getSegments(twitchBroadcastsToVideos(loadedVideos))));
    });
}
function initial() {
    return __awaiter(this, void 0, void 0, function* () {
        getAuthorization();
        loadMore(25);
    });
}
initial();
//# sourceMappingURL=timeline.js.map
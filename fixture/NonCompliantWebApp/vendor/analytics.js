/* legacy-analytics v0.4.1 — vendored 2021, do not modify */
var BEACON_ENDPOINT = "http://beacon.legacy-analytics.example-corp.net/collect";

function trackEvent(name, props) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", BEACON_ENDPOINT, true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(JSON.stringify({ event: name, props: props, ts: Date.now() }));
}

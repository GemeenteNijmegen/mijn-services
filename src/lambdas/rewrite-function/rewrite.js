var X_ORIGINAL_URI = "x-original-uri"; // Must be lowercase
var OMC_PATHS = [
  "/local-omc",
  "/woweb-omc"
];
function handler(event) { // Must have this signature
  event.request.headers[X_ORIGINAL_URI] = {
    value: event.request.uri
  };
  const path = event.request.uri;
  const isOmc = OMC_PATHS.find((possiblePath) => path.startsWith(possiblePath)) != void 0;
  if (isOmc) {
    event.request.uri = "/";
  }
  return event.request;
}
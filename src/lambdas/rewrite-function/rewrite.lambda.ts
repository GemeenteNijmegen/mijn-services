import { CloudFrontFunctionsEvent } from 'aws-lambda';

const X_ORIGINAL_URI = 'X-Original-Uri';

const OMC_PATHS = [
  '/local-omc',
  '/woweb-omc',
];

export async function handler(event: CloudFrontFunctionsEvent) {

  // Set the original uri header on each request
  event.request.headers[X_ORIGINAL_URI] = {
    value: event.request.uri,
  };

  // If the path matches one of the above predefined paths, do OMC rewrite
  const path = event.request.uri;
  const isOmc = OMC_PATHS.find(possiblePath => path.startsWith(possiblePath)) != undefined;
  if (isOmc) {
    event.request.uri = '/';
  }
  return event.request;
}
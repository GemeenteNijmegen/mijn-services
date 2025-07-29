import {
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
} from 'aws-lambda';

const X_ORIGINAL_URI = 'x-original-uri'; // Must be lowercase
const OMC_PATHS = ['/local-omc', '/woweb-omc'];

export function handler(event: CloudFrontRequestEvent): CloudFrontRequestResult {
  const request = event.Records[0].cf.request;

  // Add custom header
  request.headers[X_ORIGINAL_URI] = [
    {
      key: X_ORIGINAL_URI,
      value: request.uri,
    },
  ];

  // Rewrite URI if it matches any OMC path
  const isOmc = OMC_PATHS.some((p) => request.uri.startsWith(p));
  if (isOmc) {
    request.uri = '/';
  }

  return request;
};

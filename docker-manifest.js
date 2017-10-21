const https = require('https');

const axios = require('axios');
const dockerParseImage = require('docker-parse-image');

/**
 * Determines the URL for a Docker registry based on the image name.
 * @private
 * @param {string} image the name of a Docker image
 * @returns {string} URL for the image's registry
 */
function getRegistryUrl(image) {
  const parsedImage = dockerParseImage(image);
  if (parsedImage.registry) {
    return `https://${parsedImage.registry}/v2/`;
  }
  return 'https://registry-1.docker.io/v2/';
}

/**
 * Query registry server for authentication info.
 * @private
 * @param {string} image the image to get authentication info for (example: "alpine:latest")
 * @param {Object} options options to use for the query
 * @returns {Object} Authentication info for the requested registry and image.
 * @throws Will throw an error if authentication info can't be parsed or the registry is unreachable.
 */
async function getAuthenticationInfo(image, options) {
  const authInfo = {}; // object to store realm and service info

  // options passed to axios
  let queryOptions = {};
  if (options.requestOptions) {
    queryOptions = { ...options.requestOptions };
  }
  queryOptions.validateStatus = status => status === 401;

  // add authentication info if provided
  if (options.auth) {
    queryOptions.auth = options.auth;
  }

  try {
    // await axios get request, this will be a 401 response and the registry
    // will provide info required to get an authentication token
    const realmResponse = await axios.get(getRegistryUrl(image), queryOptions);

    // parse auth response for the realm and service params provided by
    // registry
    if (realmResponse.headers['www-authenticate']) {
      const re = /Bearer realm="(.*)",service="(.*)"/i;
      const found = realmResponse.headers['www-authenticate'].match(re);
      if (found) {
        [, authInfo.realm, authInfo.service] = found;
      }
    } else {
      throw new Error('Failed to parse realm and service info from registry.');
    }
  } catch (error) {
    throw new Error('Failed to get authentication info from registry.');
  }

  // use the realm and service info to get an auth token from the registry
  let tokenResponse = {}; // object to store token info
  try {
    const parsedImage = dockerParseImage(image);

    let tokenOptions = {};
    if (options.requestOptions) {
      tokenOptions = { ...options.requestOptions };
    }
    tokenOptions.params = {
      service: authInfo.service,
      scope: `repository:${parsedImage.namespace ? `${parsedImage.namespace}/` : 'library/'}${parsedImage.repository}:pull`,
    };

    // add authentication info if provided
    if (options.auth) {
      tokenOptions.auth = options.auth;
    }

    // await axios get request, response should contain the auth token
    tokenResponse = await axios.get(authInfo.realm, tokenOptions);

    if (!tokenResponse.data.token) {
      throw new Error("Can't get authentication token from registry.");
    }
  } catch (error) {
    console.log(error);
    throw new Error('Failed to get authentication token from registry.');
  }

  // return token and other auth info
  return {
    ...authInfo,
    token: tokenResponse.data.token,
  };
}

/**
 * Query the registry server for the manifest info on a docker image.
 * @private
 * @param {string} image the image to get manifest info for (example: "alpine:latest")
 * @param {Object} token authentication info for the registry
 * @param {Object} options options to use for the query
 * @returns {Object} manifest data for the requested image
 * @throws Will throw an error if the registry is unreachable.
 */
async function getManifest(image, token, options = {}) {
  // options passed to axios
  let manifestOptions = {};
  if (options.requestOptions) {
    manifestOptions = { ...options.requestOptions };
  }
  manifestOptions.headers = {
    Authorization: `Bearer ${token.token}`,
  };

  const parsedImage = dockerParseImage(image);
  // build url for manifest request - see https://docs.docker.com/registry/spec/api/
  const manifestUrl = `${getRegistryUrl(image)}${parsedImage.namespace ? `${parsedImage.namespace}/` : 'library/'}${parsedImage.repository}/manifests/${parsedImage.tag ? parsedImage.tag : 'latest'}`;

  try {
    const manifest = await axios.get(manifestUrl, manifestOptions);
    return manifest.data;
  } catch (error) {
    // TODO throw errors for: 1. registry unreachable, 2. auth failure
    throw new Error('Unable to get manifest info from registry.');
  }
}

/**
 * Get manifest info for a docker image.
 * @param {string} image the name of the image. Example: "alpine:latest".
 * @param {Object} options options for the request.
 * @returns {Object} manifest info for the image
 */
async function getImageManifest(image, options = {}) {
  // get an oauth token for the registry
  const token = await getAuthenticationInfo(image, options);

  // query registry for an image manifest
  const manifest = await getManifest(image, token, options);

  return manifest;
}

module.exports.getImageManifest = getImageManifest;

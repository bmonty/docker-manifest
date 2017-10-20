const https = require('https');

const axios = require('axios');
const _ = require('lodash');
const parse = require('docker-parse-image');

function nonSecureRequest(url, options) {
  const nonSecureOptions = _.merge(options, {
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });
  return axios.get(url, nonSecureOptions);
}

/**
 * Query registry server for authentication info.
 *
 * @private
 * @param {string} registryUrl URL for the registry to get authentication info.
 * @param {Object} parsedImage Object with the parsed image name
 * @param {Object} options Options for axios to use
 * @returns {Object} Authentication info for the requested registry and image.
 * @throws Will throw an error if authentication info can't be parsed or the realm is unreachable.
 */
async function getAuthenticationInfo(image, options = null) {
  // parse image string to determine registry url
  let registryUrl = '';
  const parsedImage = parse(image);
  if (parsedImage.registry) {
    registryUrl = `https://${parsedImage.registry}/v2/`;
  } else {
    registryUrl = 'https://registry-1.docker.io/v2/';
  }

  // options passed to axios
  const queryOptions = {
    ...options.requestOptions,
    validateStatus: status => status === 401,
  };

  // add authentication info if provided
  if (options.auth) {
    queryOptions.auth = options.auth;
  }

  try {
    // await axios get request, this will be a 401 response and the registry
    // will provide info required to get an authentication token
    const realmResponse = await axios.get(registryUrl, queryOptions);

    // parse auth response for the realm and service params provided by
    // registry
    const authInfo = {};
    if (realmResponse.headers['www-authenticate']) {
      const re = /Bearer realm="(.*)",service="(.*)"/i;
      const found = realmResponse.headers['www-authenticate'].match(re);
      if (found) {
        [, authInfo.realm, authInfo.service] = found;
      }
    } else {
      throw new Error("Can't get authentication info for registry.");
    }

    // use the realm and service info to get an auth token from the registry
    const tokenOptions = {
      ...options.requestOptions,
      params: {
        service: authInfo.service,
        scope: `repository:${parsedImage.namespace ? `${parsedImage.namespace}/` : 'library/'}${parsedImage.repository}:pull`,
      },
    };

    // add authentication info if provided
    if (options.auth) {
      tokenOptions.auth = options.auth;
    }

    // await axios get request, response should contain the auth token
    const tokenResponse = await axios.get(authInfo.realm, tokenOptions);

    if (!tokenResponse.data.token) {
      throw new Error("Can't get authentication token from registry.");
    }

    return {
      ...authInfo,
      token: tokenResponse.data.token,
    };
  } catch (error) {
    console.log('in getAuthenticationInfo: ', error.message);
  }
}

/**
 * Query the registry server for the manifest info on a docker image.
 * @private
 */
function getManifest(options) {
  const authOptions = {};
  authOptions.params = options.token.params;
  if (options.token.auth) {
    authOptions.auth = options.token.auth;
  }

  let authPromise;
  if (options.nonSecure) {
    authPromise = nonSecureRequest(options.token.url, authOptions);
  } else {
    authPromise = axios.get(options.token.url, authOptions);
  }

  return authPromise
    .then((tokenResponse) => {
      const repoOptions = {
        headers: {
          Authorization: `Bearer ${tokenResponse.data.token}`,
        },
      };

      let repoPromise;
      if (options.nonSecure) {
        repoPromise = nonSecureRequest(options.repository.url, repoOptions);
      } else {
        repoPromise = axios.get(options.repository.url, repoOptions);
      }

      return repoPromise
        .then(repoResponse => repoResponse.data)
        .catch((error) => {
        // console.log(error.response.data);
          console.log(error.response.status);
          console.log(error.response.headers);
        });
    });
}

/**
 * Get manifest info for a docker image.
 * @param {string} image The name of the image. Example: "alpine:latest".
 * @param {Object} options Request options passed to axios.
 */
async function getImageManifest(image, options = null) {
  // get an oauth token for the registry
  const authInfo = await getAuthenticationInfo(image, options);
  console.log(authInfo);

  // const manifest = await getManifest(options);

  // return manifest;
}

module.exports.getImageManifest = getImageManifest;

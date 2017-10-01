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
 * Response looks like: Www-Authenticate: Bearer realm="https://registry-auth",service="repository"
 */
function getAuthenticationInfo(repoUrl, nonSecure = false) {
  let request;
  const options = {
    validateStatus: status => status === 401,
  };

  if (nonSecure) {
    request = nonSecureRequest(repoUrl, options);
  } else {
    request = axios.get(repoUrl, options);
  }

  return request
    .then((response) => {
      if (response.headers['www-authenticate']) {
        const re = /Bearer realm="(.*)",service="(.*)"/i;
        const found = response.headers['www-authenticate'].match(re);
        if (found) {
          return {
            realm: found[1],
            service: found[2],
          };
        }
      }
      throw new Error('Server did not provide authentication information.');
    })
    .catch((error) => {
      console.log(error);
    });
}

/**
 * Query the registry server for the manifest info on a docker image.
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

function getImageManifest(image, username = null, password = null, nonSecure = false) {
  let repoUrl = '';
  const parsedImage = parse(image);
  if (parsedImage.registry) {
    repoUrl = `https://${parsedImage.registry}/v2/`;
  } else {
    repoUrl = 'https://registry-1.docker.io/v2/';
  }

  return getAuthenticationInfo(repoUrl, true)
    .then((authInfo) => {
      const options = {
        token: {
          url: authInfo.realm,
          params: {
            service: authInfo.service,
            scope: `repository:${parsedImage.namespace ? `${parsedImage.namespace}/` : 'library/'}${parsedImage.repository}:pull`,
          },
        },
        repository: {
          url: `${repoUrl}${parsedImage.namespace ? `${parsedImage.namespace}/` : 'library/'}${parsedImage.repository}/manifests/${parsedImage.tag ? parsedImage.tag : 'latest'}`,
        },
        nonSecure,
      };

      if (username) {
        options.token.auth = { username, password };
      }

      return getManifest(options)
        .then(data => data)
        .catch((error) => {
          console.log(`Error: ${error}`);
        });
    });
}

module.exports.getImageManifest = getImageManifest;

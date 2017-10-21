## Installing

```bash
$ npm install docker-manifest
```

## Usage

```js
const const dockerManifest = require('docker-manifest');

dockerManifest.getImageManifest('library/alpine').then((manifest) => {
  console.log(manifest);
});
```

You can also provide configuration options as a second parameter to
`getImageManifest`.  This allows for the use of authentication on the
registry and customization of how axios makes HTTPS requests.

## Request Config

```js
{
  // `auth` is used to provide authentication information if required for
  // the registry.  This is typically only for private registries and is
  // not required to get manifest info for public images in the Docker
  // Hub.
  auth: {
    username: 'foo',
    password: 'bar'
  },

  // `requestOptions` is passed directly to Axios when it makes HTTPS
  // requests to the registry.  This can be used to set any option allowed
  // by Axios, but params and headers will be overwritten.  Example use 
  // for this is to allow the use of self-signed certificates by passing 
  // a Certificate Authority to verify against. See https://github.com/axios/axios
  // for more info on options.
  requestOptions: {
    httpsAgent: new https.Agent({  // HTTPS Agent configured to use a self-signed cert
      ca: [ca],
      ecdhCurve: 'auto',
    }),
  }
}
```

## Examples

Getting manifest info for the image 'library/alpine':

```js
const dockerManifest = require('docker-manifest');

dockerManifest.getImageManifest('library/alpine').then((manifest) => {
  console.log(manifest);
});
```

Getting manifest info from a private registry with a self-signed certificate:

```js
const dockerManifest = require('docker-manifest');

const image = 'private-registry.com/my-image';
const ca = fs.readFileSync('ca.pem');

const options = {
  auth: {
    username: 'foo',
    password: 'bar',
  },
  requestOptions: {
    httpsAgent: new https.Agent({
      ca: [ca],
      ecdhCurve: 'auto',  // needed for node >v8.5.0 if server uses elliptic curve
    }),
  },
};

dockerManifest.getImageManifest(image, options).then((manifest) => {
  console.log(manifest);
});
```
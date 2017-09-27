## Installing

```bash
$ npm install docker-manifest
```

## Example

Getting manifest info for the image 'library/alpine'

```js
const dockerManifest = require('docker-manifest');
dockerManifest.getImageManifest('library/alpine')
  .then((manifest) => {
    const v1Compatibility = JSON.parse(manifest.history[0].v1Compatibility);
    console.log(v1Compatibility);
  });
```

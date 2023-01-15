npx tsc --declaration $args
npx browserify .\build\browserify_bundle.js -o bundle.js -r './build/browserify/websocket.js:ws' -r './build/browserify/fs.js:fs'
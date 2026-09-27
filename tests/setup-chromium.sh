#!/bin/bash
# Rebuilds a headless Chromium for Playwright when the Playwright CDN is unreachable.
set -e
mkdir -p /tmp/ch && cd /tmp/ch
[ -d node_modules/@sparticuz/chromium ] || npm i -s @sparticuz/chromium@131 >/dev/null 2>&1
node -e "
const c=require('@sparticuz/chromium');
c.executablePath().then(p=>{require('fs').writeFileSync('/tmp/ch/bin.txt',p);console.log(p)});
"
BIN=$(cat /tmp/ch/bin.txt)
# shared libs (nss etc.) ship brotli-compressed inside the package
node -e "const z=require('zlib'),fs=require('fs');for(const n of ['al2023','fonts'])fs.writeFileSync('/tmp/'+n+'.tar',z.brotliDecompressSync(fs.readFileSync('/tmp/ch/node_modules/@sparticuz/chromium/bin/'+n+'.tar.br')))"
mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023
cat > /tmp/chrome.sh <<EOS
#!/bin/bash
export LD_LIBRARY_PATH=/tmp/al2023/lib:\$LD_LIBRARY_PATH
exec $BIN --headless=shell --no-sandbox --disable-gpu --use-angle=swiftshader "\$@"
EOS
chmod +x /tmp/chrome.sh
echo ready
